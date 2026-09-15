import { gameConfig } from "@core/config/GameConfig";

import type { Ball } from "@entities/ball/Ball";
import type { BrickGrid } from "@entities/bricks/BrickGrid";

/**
 * COLLAPSE's fog: the wall stops colliding with the ball, and a brick the ball
 * has passed *through* condenses back to solid and stays that way.
 *
 * **A fogged brick is a live brick to the whole engine except the ball.** That
 * sentence is the architecture and it is not a preference: half the game
 * reaches the wall in index space rather than through a collision test —
 * HOMING's retarget is a bare `hitAtCell(...) === null`, and `blastNeighbors`,
 * `chainFrom`, ZAP's sweep, the critter's bite, METEOR's drill and PYRE's
 * crater all call `hitAtCell`/`destroy` directly — so a fog that marked cells
 * dead, or lifted them out of `rows`, would silently switch six capsules off
 * and take the clear count with it. The fog is consulted in exactly two places,
 * `BrickGrid.findBallOverlap` and `findBallOverlaps`, which is where the ball
 * and nothing else comes through.
 *
 * **The collapse happens on exit, never on entry**, and that ordering is the
 * one bug this capsule can have. A brick that armed its collider the moment the
 * ball reached it would arm it *around* the ball — a ball standing inside a
 * solid rectangle, which the engine has no way out of. So a cell the ball
 * touches is only pending, and it condenses on the first tick no live ball is
 * standing in it any more.
 *
 * That also answers the fast ball for free. At level nine a ball crosses a 12 px
 * course in under two ticks and can be clear of a cell before the tick ends;
 * the touch is recorded during the sub-step, where the ball actually was, and
 * the exit test runs against where every ball finished. Nothing is missed and
 * nothing condenses early.
 */
export class Decoherence {
  // Fogged: this cell does not collide with the ball. Cleared for good the tick
  // the ball leaves it — nothing here ever sets a bit back, which is what makes
  // the trap's cost decay monotonically the way SLUMP's does.
  private fog = new Uint8Array(0);
  // Cells a ball is standing in right now, or was during this tick's sub-steps.
  private pending = new Uint8Array(0);
  // How far through its six-tick snap a condensing cell is, 0 to `solveTicks`.
  private solving = new Uint8Array(0);
  private rowCount = 0;
  private elapsed = 0;
  private duration = 0;
  private live = false;

  get active(): boolean {
    return this.live;
  }

  /** Sized from the level, in `buildLevel`, beside `erosion.load`. */
  load(rowCount: number): void {
    this.rowCount = rowCount;
    const cells = rowCount * gameConfig.grid.columns;
    this.fog = new Uint8Array(cells);
    this.pending = new Uint8Array(cells);
    this.solving = new Uint8Array(cells);
    this.reset();
  }

  /**
   * The catch: every brick standing right now goes to fog.
   *
   * A second COLLAPSE over a live one re-fogs the wall, including the cells the
   * player has already solved. It is a trap, and the work it costs is the work
   * it costs twice — unlike SUPERPOSE, where re-echoing a wall the player had
   * worked down would be handing back a bonus they had spent.
   */
  start(grid: BrickGrid, durationTicks: number): void {
    this.elapsed = 0;
    this.duration = durationTicks;
    this.live = true;
    this.pending.fill(0);
    this.solving.fill(0);
    this.fog.fill(0);
    const rows = grid.rows;
    for (let row = 0; row < rows.length && row < this.rowCount; row++) {
      for (let column = 0; column < gameConfig.grid.columns; column++) {
        if (rows[row][column] !== null) {
          this.fog[row * gameConfig.grid.columns + column] = 1;
        }
      }
    }
  }

  reset(): void {
    this.live = false;
    this.elapsed = 0;
    this.duration = 0;
    this.fog.fill(0);
    this.pending.fill(0);
    this.solving.fill(0);
  }

  /**
   * Whether the ball passes through this cell.
   *
   * **The same number the renderer paints, thresholded — not a second opinion
   * about it.** The bit says whether this cell is still owed back; `fogAt` says
   * how far through the arrival or the condense it is; and the ball goes
   * through exactly when the brick is drawn more fog than brick. Both ends of
   * the capsule are honest that way: a cell halfway into the fog-in still
   * bounces and still looks like it would, and a row halfway back out of the
   * condense is solid and looks it.
   *
   * The first draft armed the whole wall on the tick the condense began while
   * the picture eased row by row, which is fifteen ticks of a brick the player
   * can see through and cannot pass — the same lie SUPERPOSE's echoes were
   * fixed for, told the other way round.
   *
   * A cell the ball has already solved is excluded by the bit alone: `solve`
   * and the exit clear it, so the brick is solid on the frame it is earned
   * while its six-tick snap is still painting. That direction is deliberate —
   * the reward may arrive before the picture finishes, never after.
   */
  fogged(row: number, column: number): boolean {
    if (!this.live || this.at(this.fog, row, column) === 0) {
      return false;
    }
    return this.fogAt(row, column) >= 0.5;
  }

  /**
   * How out of focus this cell is drawn, 0 solid to 1 full fog.
   *
   * Three phases in one number, because the renderer should not have to know
   * which one the capsule is in: the arrival raises it cell by cell, a pass
   * through drops it over the six ticks of the snap, and the condense at the
   * end takes whatever is left down from the bottom course up.
   */
  fogAt(row: number, column: number): number {
    if (!this.live) {
      return 0;
    }
    const { fogTicks, fogStaggerTicks, condenseTicks, solveTicks } = gameConfig.powerUps.collapse;
    const solving = this.at(this.solving, row, column);
    if (solving > 0) {
      return solving / solveTicks;
    }
    if (this.at(this.fog, row, column) === 0) {
      return 0;
    }
    const left = this.duration - this.elapsed;
    if (left <= condenseTicks) {
      // Bottom course first: the row nearest the deck is the one the player
      // wants back, so it is the one handed over first and the wall rebuilds
      // upward away from them.
      const fromBottom = this.rowCount - 1 - row;
      const started = condenseTicks - left - fromBottom;
      return Math.min(1, Math.max(0, 1 - started / Math.max(1, condenseTicks - this.rowCount)));
    }
    const started = this.elapsed - (row + column) * fogStaggerTicks;
    return Math.min(1, Math.max(0, started / fogTicks));
  }

  /**
   * The ball is in this cell. Marks it pending — it condenses when the ball is
   * gone, not now.
   *
   * Called from inside `BrickGrid`'s two ball lookups, which is the only place
   * in the engine that knows a ball asked about a cell and got nothing back.
   */
  touch(row: number, column: number): void {
    const index = this.index(row, column);
    if (index >= 0) {
      this.pending[index] = 1;
    }
  }

  /**
   * A laser bolt solving a brick outright, with no pass needed.
   *
   * The bolt is spent on it and the brick takes no damage — the trade is a shot
   * for a hitbox, which is the counter-play this capsule is balanced around:
   * LASER is the only way to open the wall faster than the ball can fly through
   * it, and it is worth chasing cannons for the eight seconds.
   */
  solve(row: number, column: number): boolean {
    const index = this.index(row, column);
    if (index < 0 || this.fog[index] === 0) {
      return false;
    }
    this.fog[index] = 0;
    this.pending[index] = 0;
    this.solving[index] = gameConfig.powerUps.collapse.solveTicks;
    return true;
  }

  /** Whether the wall is in its closing fifteen ticks. */
  get condensing(): boolean {
    return this.live && this.duration - this.elapsed <= gameConfig.powerUps.collapse.condenseTicks;
  }

  /**
   * Condense every pending cell the balls have left, and run the clocks.
   *
   * The exit test is a plain box overlap against each live ball rather than a
   * second trip through `cellAt`: what is being asked is "is any ball still
   * standing in this cell", which is a question about where the ball is, not
   * about what the cell is — and a fogged cell would answer the collision
   * lookup with `null` anyway, which is exactly the wrong answer here.
   */
  step(grid: BrickGrid, balls: readonly Ball[]): void {
    if (!this.live) {
      return;
    }
    this.elapsed++;
    if (this.elapsed > this.duration) {
      this.reset();
      return;
    }

    const { columns, left, top, brickWidth, brickHeight } = gameConfig.grid;
    const { solveTicks } = gameConfig.powerUps.collapse;
    const inset = gameConfig.ball.collisionInset;
    const rows = grid.rows;

    for (let row = 0; row < rows.length && row < this.rowCount; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        if (this.solving[index] > 0) {
          this.solving[index]--;
        }
        // A cell whose brick died while the ball was inside it owes nothing:
        // there is no hitbox to hand back and no picture to run.
        if (rows[row][column] === null) {
          this.fog[index] = 0;
          this.pending[index] = 0;
          continue;
        }
        if (this.pending[index] === 0) {
          continue;
        }

        const sag = grid.sheet?.offsetAt(row, column) ?? 0;
        const cellLeft = left + column * brickWidth;
        const cellTop = top + row * brickHeight - grid.topOffset + sag;
        let held = false;
        for (const ball of balls) {
          if (!ball.active) {
            continue;
          }
          if (
            ball.x + ball.size - inset > cellLeft &&
            ball.x + inset < cellLeft + brickWidth &&
            ball.y + ball.size - inset > cellTop &&
            ball.y + inset < cellTop + brickHeight
          ) {
            held = true;
            break;
          }
        }
        if (held) {
          continue;
        }
        this.pending[index] = 0;
        this.fog[index] = 0;
        this.solving[index] = solveTicks;
      }
    }
  }

  private index(row: number, column: number): number {
    if (row < 0 || row >= this.rowCount || column < 0 || column >= gameConfig.grid.columns) {
      return -1;
    }
    return row * gameConfig.grid.columns + column;
  }

  private at(store: Uint8Array, row: number, column: number): number {
    const index = this.index(row, column);
    return index < 0 ? 0 : store[index];
  }
}
