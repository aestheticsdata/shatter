import { gameConfig } from "@core/config/GameConfig";

import type { BrickGrid } from "@entities/bricks/BrickGrid";

/**
 * TWIN's threads: twelve couples drawn at random out of the live wall, each one
 * a hairline between two cell centres, and a hit on either half paid by both.
 *
 * **This is the cheapest capsule on the board and the seam is why.** A couple is
 * a pair of cell *indices*, so nothing here goes near the hitbox: no
 * rasterization, no per-pixel test, nothing new in the ball's path. The wall is
 * still exactly the wall, and every index-space consumer in the engine — BLAST's
 * eight neighbours, HOMING's lock, XRAY's span, ZAP's bottom row, `remaining` —
 * keeps working without being told this capsule exists. What it adds is one
 * question the game asks at the two places a brick is written to the grid:
 * *does this cell have a partner?*
 *
 * **It is not CHAIN.** A chain arc is discovered at the moment of a kill and
 * lives for a few frames; a thread is declared on the catch frame, crosses
 * arbitrary distance and stands on the field for eighteen seconds. The player reads
 * the wall's wiring *before* choosing a shot, which is the opposite of a
 * surprise — and it is also why the thread is not decoration. A capsule that is
 * armed and idle for most of its life and shows nothing reads as one that broke
 * (SHA-62), so the thread is the held cue as much as it is the picture.
 *
 * Both displacements that move a brick off its index are read here the way
 * `cellAt` and `Superposition.step` read them — QUAKE's wall-wide drop and
 * JELLY's and SLUMP's per-cell sag. A thread anchored to an index while its
 * brick hangs six pixels lower would be the one part of this capsule pointing
 * somewhere its brick is not. ERODE's wear is deliberately *not*: a thread lands
 * on a cell centre, and the centre of a worn brick is the centre of its cell.
 */

/** One couple, as the two cells it joins. */
interface Couple {
  aRow: number;
  aColumn: number;
  bRow: number;
  bColumn: number;
  // When it was drawn, so a couple the refill clock added grows its thread in
  // rather than appearing at full length. The arrival is per couple and not
  // wall-wide for exactly that reason: twelve of them are drawn on the catch
  // frame and the rest arrive over the next eighteen seconds.
  born: number;
}

/** Where one thread is being painted this frame. */
export interface Thread {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  // How much of the thread exists, 0 to 1, grown from *both* ends at once — so
  // the wall visibly wires itself up rather than switching on wired.
  drawn: number;
}

/**
 * A couple that has just been spent: the thread with nothing holding it, and the
 * two flashes running down it.
 *
 * A break is an event and not a fade, so it has its own list rather than a
 * number on the couple — the couple is gone the instant one of its halves dies,
 * and this is only the report of it.
 */
export interface Snap {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  ticksLeft: number;
}

const { columns: COLUMN_COUNT } = gameConfig.grid;
const NO_PARTNER = -1;

export class Entanglement {
  // The partner's cell index per cell, row-major, or -1. Sized by `load` from
  // the level's row count the way `Erosion` and `Superposition` are.
  //
  // **This array is what makes a cascade structurally impossible.** A brick
  // belongs to at most one couple, so a partner dying has no pairing of its own
  // to fire — there is nothing to guard against, because there is nothing to
  // reach. It also makes `partnerOf` the O(1) lookup the kill path needs, which
  // a list of twelve couples would not be.
  private partners = new Int16Array(0);
  private couples: Couple[] = [];
  private rowCount = 0;
  private elapsed = 0;
  private duration = 0;
  private live = false;
  readonly threads: Thread[] = [];
  readonly snaps: Snap[] = [];

  get active(): boolean {
    return this.live;
  }

  /**
   * Whether the couples still pay, which is everything but the last twenty
   * ticks.
   *
   * SUPERPOSE's rule for SUPERPOSE's reason: the slack is a thread the player
   * has already watched the capsule finish with, and a link that still charged
   * a brick while its own thread was falling through the field would be the
   * capsule collecting after it has said goodbye.
   */
  get armed(): boolean {
    return this.live && this.elapsed < this.duration - gameConfig.powerUps.twin.slackTicks;
  }

  /**
   * How far the threads have gone slack, 0 to 1.
   *
   * The whole expiry in one number the renderer reads three times — the sag out
   * of the anchors, the fall through the field, and the fade as they drop.
   */
  get slack(): number {
    const { slackTicks } = gameConfig.powerUps.twin;
    if (!this.live) {
      return 0;
    }
    const going = this.elapsed - (this.duration - slackTicks);
    return going <= 0 ? 0 : Math.min(1, going / slackTicks);
  }

  /**
   * The travelling shiver, in whole ticks of phase.
   *
   * Handed to the renderer as the elapsed count rather than as a 0-to-1 blend,
   * because a wave travels *along* a thread: the renderer needs the phase at
   * each pixel it walks, which is a function of distance as well as of time, and
   * a number normalised here would have to be un-normalised there.
   */
  get phase(): number {
    return this.elapsed;
  }

  /** Sized from the level, in `buildLevel`, beside `superposition.load`. */
  load(rowCount: number): void {
    this.rowCount = rowCount;
    this.partners = new Int16Array(rowCount * COLUMN_COUNT);
    this.reset();
  }

  /**
   * The catch: the wall pairs itself up.
   *
   * A second TWIN over a live one redraws the pairing rather than topping the
   * eighteen seconds up, which is `Superposition.start`'s answer for the same
   * reason: the couples the player has already spent are spent, and a top-up
   * would hand back a wiring they had worked through while claiming to be the
   * same capsule twice. Redrawing is also the better picture — the whole appeal
   * is that the draw is never the same twice.
   */
  start(grid: BrickGrid, durationTicks: number): void {
    this.elapsed = 0;
    this.duration = durationTicks;
    this.live = true;
    this.snaps.length = 0;
    this.couples.length = 0;
    this.partners.fill(NO_PARTNER);
    this.refill(grid);
  }

  reset(): void {
    this.live = false;
    this.elapsed = 0;
    this.duration = 0;
    this.couples.length = 0;
    this.partners.fill(NO_PARTNER);
    this.threads.length = 0;
    this.snaps.length = 0;
  }

  /**
   * The partner of a cell, or null.
   *
   * The one question the kill path asks, and it is asked at the grid write
   * rather than at the ball: a NUKE, a ZAP sweep, a grub's bite, a meteor's
   * drill and a PYRE crater all reach the wall without a ball being anywhere
   * near, and every one of them owes the partner.
   */
  partnerOf(row: number, column: number): { row: number; column: number } | null {
    if (!this.armed) {
      return null;
    }
    const slot = this.slotAt(row, column);
    if (slot < 0) {
      return null;
    }
    const partner = this.partners[slot];
    if (partner === NO_PARTNER) {
      return null;
    }
    return { row: Math.floor(partner / COLUMN_COUNT), column: partner % COLUMN_COUNT };
  }

  /**
   * Spend the couple a cell belongs to: the pairing goes, the thread snaps.
   *
   * Pushed from the couple's own anchors recomputed here rather than from the
   * thread the renderer last drew, because a couple can be broken by a kill on
   * a tick its thread was never placed on — a NUKE on the catch frame reaches
   * the grid before the first `step`.
   */
  snap(row: number, column: number, grid: BrickGrid): void {
    const slot = this.slotAt(row, column);
    if (slot < 0 || this.partners[slot] === NO_PARTNER) {
      return;
    }
    const index = this.couples.findIndex(
      (couple) =>
        (couple.aRow === row && couple.aColumn === column) || (couple.bRow === row && couple.bColumn === column),
    );
    if (index < 0) {
      return;
    }
    const couple = this.couples[index];
    this.couples.splice(index, 1);
    this.partners[this.slotAt(couple.aRow, couple.aColumn)] = NO_PARTNER;
    this.partners[this.slotAt(couple.bRow, couple.bColumn)] = NO_PARTNER;
    // Struck end first, so the renderer can run one flash out from the cell the
    // player hit and the other back from its partner. The pair crossing is what
    // says the link discharged in both directions rather than travelled one way.
    const struckIsA = couple.aRow === row && couple.aColumn === column;
    const a = this.anchor(grid, struckIsA ? couple.aRow : couple.bRow, struckIsA ? couple.aColumn : couple.bColumn);
    const b = this.anchor(grid, struckIsA ? couple.bRow : couple.aRow, struckIsA ? couple.bColumn : couple.aColumn);
    this.snaps.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, ticksLeft: gameConfig.powerUps.twin.snapTicks });
  }

  /**
   * QUAKE: every row slides down one and a fresh empty row takes the top.
   *
   * A couple is a pair of cell indices, so it has to ride the slide or every
   * thread on the field re-points at whichever brick moved into its old cell.
   * `Erosion.shiftDown` is the shape, with one difference that falls out of
   * what is being moved: wear is a number per cell and can be copied down the
   * array, while a couple is a *pair* and both of its ends move at once — so the
   * couples are walked and the index array is rebuilt from them rather than
   * shifted. A couple with an end on the bottom row is dropped outright: that
   * row is discarded by `BrickGrid.shiftDown`, and a thread anchored to a brick
   * the wall no longer has is a thread pointing off the board.
   */
  shiftDown(): void {
    if (!this.live) {
      return;
    }
    const last = this.rowCount - 1;
    this.couples = this.couples.filter((couple) => couple.aRow < last && couple.bRow < last);
    for (const couple of this.couples) {
      couple.aRow++;
      couple.bRow++;
    }
    this.partners.fill(NO_PARTNER);
    for (const couple of this.couples) {
      this.pair(couple);
    }
  }

  /**
   * Rebuild the frame: retire couples whose bricks are gone, top the pairing
   * back up on the clock, then place every thread.
   *
   * **A couple whose brick died to something this capsule was never told about
   * dies with it, silently.** The kill path is routed and the routing is the
   * capsule, but `wipe` (the WARP egg) and anything added tomorrow are not — so
   * the wall is checked once a tick as well, the way `Superposition.step`
   * checks it. There is no snap for those: the thread is not being spent, it is
   * being cleaned up after, and a flash would claim a payout that never
   * happened.
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

    for (let index = this.snaps.length - 1; index >= 0; index--) {
      if (--this.snaps[index].ticksLeft <= 0) {
        this.snaps.splice(index, 1);
      }
    }

    const rows = grid.rows;
    const alive = (row: number, column: number): boolean =>
      row >= 0 && row < rows.length && (rows[row][column] ?? null) !== null;
    const orphaned = this.couples.filter(
      (couple) => !alive(couple.aRow, couple.aColumn) || !alive(couple.bRow, couple.bColumn),
    );
    if (orphaned.length > 0) {
      this.couples = this.couples.filter((couple) => !orphaned.includes(couple));
      this.partners.fill(NO_PARTNER);
      for (const couple of this.couples) {
        this.pair(couple);
      }
    }

    // The pairing tops back up, which is the difference between a capsule that
    // spends itself in the first two seconds and one that keeps re-threading
    // for eighteen. Only while it is armed: a refill during the slack would draw a
    // thread that is already falling.
    const { refillTicks } = gameConfig.powerUps.twin;
    if (this.armed && this.elapsed % refillTicks === 0) {
      this.refill(grid);
    }

    const { drawTicks } = gameConfig.powerUps.twin;
    this.threads.length = 0;
    for (const couple of this.couples) {
      const a = this.anchor(grid, couple.aRow, couple.aColumn);
      const b = this.anchor(grid, couple.bRow, couple.bColumn);
      const drawn = Math.min(1, (this.elapsed - couple.born) / drawTicks);
      if (drawn <= 0) {
        continue;
      }
      this.threads.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, drawn });
    }
  }

  /**
   * Draw fresh couples until twelve are standing, out of bricks that have none.
   *
   * A shuffle over the unpaired cells and the first pairs taken off it, with no
   * minimum separation between the two halves — **the distance is the whole
   * capsule and it has to be allowed to be boring**. Most draws are
   * unremarkable neighbours; the one in a hundred that threads the bottom-left
   * corner to the top-right is only worth anything because the others were not
   * arranged for.
   */
  private refill(grid: BrickGrid): void {
    const { couples: target } = gameConfig.powerUps.twin;
    if (this.couples.length >= target) {
      return;
    }
    const free: number[] = [];
    const rows = grid.rows;
    for (let row = 0; row < rows.length && row < this.rowCount; row++) {
      for (let column = 0; column < COLUMN_COUNT; column++) {
        if (rows[row][column] !== null && this.partners[row * COLUMN_COUNT + column] === NO_PARTNER) {
          free.push(row * COLUMN_COUNT + column);
        }
      }
    }
    // Fisher-Yates, and only as far as the draw actually needs: a full shuffle
    // of ninety-six cells to take twenty-four of them is work nobody reads.
    const wanted = Math.min((target - this.couples.length) * 2, free.length - (free.length % 2));
    for (let index = 0; index < wanted; index++) {
      const pick = index + Math.floor(Math.random() * (free.length - index));
      [free[index], free[pick]] = [free[pick], free[index]];
    }
    for (let index = 0; index + 1 < wanted; index += 2) {
      const couple: Couple = {
        aRow: Math.floor(free[index] / COLUMN_COUNT),
        aColumn: free[index] % COLUMN_COUNT,
        bRow: Math.floor(free[index + 1] / COLUMN_COUNT),
        bColumn: free[index + 1] % COLUMN_COUNT,
        born: this.elapsed,
      };
      this.couples.push(couple);
      this.pair(couple);
    }
  }

  private pair(couple: Couple): void {
    const a = this.slotAt(couple.aRow, couple.aColumn);
    const b = this.slotAt(couple.bRow, couple.bColumn);
    if (a < 0 || b < 0) {
      return;
    }
    this.partners[a] = b;
    this.partners[b] = a;
  }

  private slotAt(row: number, column: number): number {
    if (row < 0 || row >= this.rowCount || column < 0 || column >= COLUMN_COUNT) {
      return -1;
    }
    return row * COLUMN_COUNT + column;
  }

  /** Where a thread is tied on: the cell's centre, where its brick is painted. */
  private anchor(grid: BrickGrid, row: number, column: number): { x: number; y: number } {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const sag = grid.sheet?.offsetAt(row, column) ?? 0;
    return {
      x: left + column * brickWidth + brickWidth / 2,
      y: top + row * brickHeight - grid.topOffset + sag + brickHeight / 2,
    };
  }
}
