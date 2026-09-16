import { gameConfig } from "@core/config/GameConfig";

import type { BrickGrid } from "@entities/bricks/BrickGrid";
import type { BrickKind } from "@interfaces/types";

/**
 * SUPERPOSE's echo field: one solid double per live brick, half a cell off it,
 * until a ball touches one of the pair.
 *
 * **The echo is a second surface standing in for a brick, and that is not new
 * here — UMBRA's wedges are the same idea and `strikeShadow` is the routing
 * written down.** What is new is that this one has memory. A shadow is a fact
 * about where a brick is standing *this frame*, rebuilt from the wall every
 * tick and holding nothing; an echo is a fact about whether that pair has been
 * collapsed yet, which no amount of looking at the wall can tell you. So this
 * class owns a bit per cell, and the bit is the capsule.
 *
 * The geometry is the cheapest in the engine and deliberately so: an echo is
 * the brick's own painted rect moved by a constant, which makes the collision
 * an axis-aligned overlap on the grid's own pitch. Everything expensive about
 * UMBRA — the rasterized spans, the quad, the separating axis — exists because
 * a slanted surface has no cheap answer. A rectangle has one.
 *
 * Three displacements move a brick off its index and all three are read here,
 * exactly as `cellAt` and `ShadowCast.buildWedge` read them: QUAKE's wall-wide
 * drop, JELLY's and SLUMP's per-cell sag, and ERODE's wear. An echo hanging off
 * an index while its brick is six pixels lower would be the one part of this
 * capsule drawn somewhere its brick is not.
 */

/** A ball's overlap with an echo, and the cell that owes for it. */
export interface EchoContact {
  row: number;
  column: number;
}

/** A collapsed pair, drawn for a few ticks where the echo was standing. */
export interface EchoPop {
  x: number;
  y: number;
  width: number;
  height: number;
  ticksLeft: number;
}

/** Where one echo is being painted this frame, and what it is a double of. */
export interface EchoRect {
  row: number;
  column: number;
  // The caster's brick kind, carried rather than looked up again: the renderer
  // draws the echo in the brick's own body tone, and this walk of the wall has
  // the cell in hand. A second lookup at paint time would be the renderer
  // asking the grid a question the effect has already answered.
  kind: BrickKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

const { columns: COLUMN_COUNT } = gameConfig.grid;

export class Superposition {
  // One bit per cell, row-major: cell (r, c) is at `r * COLUMN_COUNT + c`. Sized
  // by `load` from the level's row count, the way `Erosion` is — a level is five
  // to eight rows and allocating for the deepest would put the capsule's state
  // in rows the wall does not have.
  private echoes = new Uint8Array(0);
  private rowCount = 0;
  private elapsed = 0;
  private duration = 0;
  private live = false;
  readonly pops: EchoPop[] = [];
  // Rebuilt once a tick and handed to the renderer and the collision test,
  // rather than each of them walking the wall itself. A field and not a return
  // value so the twenty seconds cost no allocations.
  readonly rects: EchoRect[] = [];

  get active(): boolean {
    return this.live;
  }

  /**
   * Whether the echoes are surfaces this tick.
   *
   * **False through the whole merge, and this is UMBRA's rule for UMBRA's
   * reason.** An echo sliding home is one the player has already watched the
   * capsule finish with, and twelve ticks of a collider travelling back into
   * its brick underneath a live rally is the worst way to end a capsule.
   *
   * The split is the other way round and also UMBRA's answer: an echo part-way
   * out is solid at whatever offset it has reached, because it is *there*. It
   * is still standing mostly on its own brick at that point, so a ball meeting
   * it early has hit something it could see and would have hit anyway.
   */
  get solid(): boolean {
    return this.live && this.elapsed < this.duration - gameConfig.powerUps.superpose.mergeTicks;
  }

  /**
   * How far the echoes have travelled from their bricks, 0 to 1, for a cell.
   *
   * Per cell on the way out and wall-wide on the way back — see
   * `splitStaggerTicks` in the config for why the departure is not the arrival
   * reversed.
   */
  reachAt(row: number, column: number): number {
    const { splitTicks, splitStaggerTicks, mergeTicks } = gameConfig.powerUps.superpose;
    if (!this.live) {
      return 0;
    }
    const merging = this.elapsed - (this.duration - mergeTicks);
    if (merging > 0) {
      return Math.max(0, 1 - merging / mergeTicks);
    }
    const started = this.elapsed - (row + column) * splitStaggerTicks;
    return Math.min(1, Math.max(0, started / splitTicks));
  }

  /**
   * The shimmer, 0 to 1 and back, as one number the renderer reads twice.
   *
   * A triangle rather than a sine: the tones it drives are whole steps of alpha
   * on an 8 px sprite, and the ease at the ends of a sine is spent below the
   * resolution anything is drawn at.
   */
  get shimmer(): number {
    const { shimmerTicks } = gameConfig.powerUps.superpose;
    const phase = (this.elapsed % shimmerTicks) / shimmerTicks;
    return phase < 0.5 ? phase * 2 : 2 - phase * 2;
  }

  /** Sized from the level, in `buildLevel`, beside `erosion.load`. */
  load(rowCount: number): void {
    this.rowCount = rowCount;
    this.echoes = new Uint8Array(rowCount * COLUMN_COUNT);
    this.reset();
  }

  /**
   * The catch: every brick standing right now gets a double.
   *
   * A second SUPERPOSE over a live one re-echoes the wall rather than topping
   * the twenty seconds up, and unlike UMBRA's restart that is not a picture
   * decision — it is the only honest one. The pairs the player has already
   * collapsed are spent, and a top-up would hand back a wall they had worked
   * down while claiming to be the same capsule twice.
   */
  start(grid: BrickGrid, durationTicks: number): void {
    this.elapsed = 0;
    this.duration = durationTicks;
    this.live = true;
    this.pops.length = 0;
    this.echoes.fill(0);
    const rows = grid.rows;
    for (let row = 0; row < rows.length && row < this.rowCount; row++) {
      for (let column = 0; column < COLUMN_COUNT; column++) {
        if (rows[row][column] !== null) {
          this.echoes[row * COLUMN_COUNT + column] = 1;
        }
      }
    }
  }

  reset(): void {
    this.live = false;
    this.elapsed = 0;
    this.duration = 0;
    this.echoes.fill(0);
    this.pops.length = 0;
    this.rects.length = 0;
  }

  echoAt(row: number, column: number): boolean {
    if (row < 0 || row >= this.rowCount || column < 0 || column >= COLUMN_COUNT) {
      return false;
    }
    return this.echoes[row * COLUMN_COUNT + column] === 1;
  }

  /**
   * Spend one pair.
   *
   * The pop is pushed from the rect the echo was last painted in rather than
   * recomputed, so a pair collapsed on a jellied or slumping wall bursts where
   * the player was looking.
   */
  collapse(row: number, column: number): void {
    if (!this.echoAt(row, column)) {
      return;
    }
    this.echoes[row * COLUMN_COUNT + column] = 0;
    // Out of the paint on the same frame it leaves the collision, not on the
    // next step. `rects` is the one list both of them read, and an echo that
    // stayed drawn for a frame after it stopped being solid would be a surface
    // the player can see and cannot hit — which is the same lie as the reverse,
    // told for one sixtieth of a second.
    const index = this.rects.findIndex((candidate) => candidate.row === row && candidate.column === column);
    if (index >= 0) {
      const rect = this.rects[index];
      this.rects.splice(index, 1);
      this.pops.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        ticksLeft: gameConfig.powerUps.superpose.popTicks,
      });
    }
  }

  /**
   * Rebuild the frame: retire echoes whose bricks are gone, then place the rest.
   *
   * **An echo of a brick that died to something else dies with it, silently.**
   * ZAP's row sweep, the critter's bite, METEOR's drill and BLAST's splash all
   * reach the grid without passing anywhere near this class, and an echo that
   * outlived its caster would be a surface the player can be turned by with
   * nothing behind it. Checking the wall once a tick is how that is guaranteed
   * rather than remembered: there is no kill path this has to be wired into,
   * because it asks the wall instead of being told.
   *
   * No pop for those — the brick's own death burst has already said louder than
   * a pop could that the cell is empty.
   */
  step(grid: BrickGrid): void {
    if (!this.live) {
      return;
    }
    this.elapsed++;
    if (this.elapsed > this.duration) {
      this.reset();
      return;
    }

    for (let index = this.pops.length - 1; index >= 0; index--) {
      if (--this.pops[index].ticksLeft <= 0) {
        this.pops.splice(index, 1);
      }
    }

    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const { offsetX, offsetY } = gameConfig.powerUps.superpose;
    const rows = grid.rows;
    const worn = grid.erosion !== null && grid.erosion.worn;
    this.rects.length = 0;
    for (let row = 0; row < rows.length && row < this.rowCount; row++) {
      for (let column = 0; column < COLUMN_COUNT; column++) {
        const slot = row * COLUMN_COUNT + column;
        if (this.echoes[slot] === 0) {
          continue;
        }
        const cell = rows[row][column];
        if (cell === null) {
          this.echoes[slot] = 0;
          continue;
        }
        const reach = this.reachAt(row, column);
        if (reach <= 0) {
          continue;
        }
        // The brick's painted rect, all three displacements and the wear, the
        // way the hitbox reads them — then moved.
        const insetX = worn ? grid.erosion!.insetXAt(row, column) : 0;
        const insetY = worn ? grid.erosion!.insetYAt(row, column) : 0;
        const sag = grid.sheet?.offsetAt(row, column) ?? 0;
        const x = left + column * brickWidth + insetX + offsetX * reach;
        const y = top + row * brickHeight - grid.topOffset + sag + insetY + offsetY * reach;
        // Clipped to the field, never to the frame. The last column's echo
        // hangs 15 px past the wall, which is a rectangle drawn under the
        // cabinet and a collider in a strip the ball's own clamp keeps it out
        // of — harmless, and still two pixels of the picture that are not in
        // the picture. Cut here rather than in the renderer, so the rect the
        // player sees is the rect the ball is tested against.
        const width = Math.min(brickWidth - insetX * 2, gameConfig.field.right - x);
        if (width <= 0) {
          continue;
        }
        this.rects.push({
          row,
          column,
          kind: cell.kind,
          x,
          y,
          width,
          height: brickHeight - insetY * 2,
        });
      }
    }
  }

  /**
   * The echo a ball's box is inside, or null.
   *
   * The ball's own collision inset is taken off both ends the way `cellAt`
   * takes it, so an echo is met at the pixel it is painted at. First match and
   * not nearest: echoes are on the wall's own pitch and a 15/6 offset puts at
   * most a corner of one over another, so "which one" is a question the player
   * cannot ask and the ball is bounced out of whichever it entered.
   */
  overlap(ballX: number, ballY: number, size: number): EchoContact | null {
    if (!this.solid) {
      return null;
    }
    const inset = gameConfig.ball.collisionInset;
    const nearX = ballX + inset;
    const farX = ballX + size - inset;
    const nearY = ballY + inset;
    const farY = ballY + size - inset;
    for (const rect of this.rects) {
      if (farX > rect.x && nearX < rect.x + rect.width && farY > rect.y && nearY < rect.y + rect.height) {
        return { row: rect.row, column: rect.column };
      }
    }
    return null;
  }
}
