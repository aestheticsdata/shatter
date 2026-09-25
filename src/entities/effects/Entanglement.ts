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
 * **The link is an event, not a standing cue (SHA-166).** The first build drew
 * the twelve couples as dotted threads for all eighteen seconds, and on an
 * intact wall twelve dotted lines laid over the brick faces are speckle, not
 * lines: the player saw dust, broke a brick, saw one brick go, and reported a
 * capsule that did nothing — while it was paying every time. So nothing is
 * drawn between strikes. On the tick a wired brick is struck, a crooked arc
 * whips between the two cells and both hold a highlight for about 300 ms: *these
 * two were one thing*. TWIN fires on a large share of hits, so it is producing
 * events constantly and only needs them to be legible; a standing cue spent
 * contrast on the whole wall to pay off at the moment of a hit, which the event
 * pays for free. The cost, accepted: you can no longer aim at a wired brick.
 *
 * Both displacements that move a brick off its index are read here the way
 * `cellAt` and `Superposition.step` read them — QUAKE's wall-wide drop and
 * JELLY's and SLUMP's per-cell sag, so an arc lands on the brick as painted.
 */

/** One couple, as the two cells it joins. */
interface Couple {
  aRow: number;
  aColumn: number;
  bRow: number;
  bColumn: number;
}

/**
 * A couple that has just been spent: the two cell centres, and how long the arc
 * and the two highlights have left. `ax/ay` is the struck brick.
 *
 * `seed` freezes this arc's own crooked shape for its whole life — each strike
 * kinks differently, so four couples spent on one NUKE tick read as four links
 * rather than one flash, and no arc wriggles while it is being read.
 */
export interface Snap {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  ticksLeft: number;
  seed: number;
}

/**
 * How far an arc's dot at `walked` along a `length` px link is pushed off the
 * straight line: two frozen sines under an envelope that pins both ends to their
 * bricks. The field and the CAPSULES miniature both walk it.
 */
export function twinArcWave(walked: number, length: number, seed: number): number {
  const { arcAmplitude, arcWavelength } = gameConfig.powerUps.twin;
  const envelope = Math.sin((Math.PI * walked) / length);
  const base = Math.sin((walked / arcWavelength) * Math.PI * 2 + seed * Math.PI * 2);
  const kink = 0.6 * Math.sin((walked / (arcWavelength * 0.37)) * Math.PI * 2 + seed * 37);
  return (base + kink) * arcAmplitude * envelope;
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
  readonly snaps: Snap[] = [];

  get active(): boolean {
    return this.live;
  }

  /** Whether the couples pay — the whole of the capsule's life. */
  get armed(): boolean {
    return this.live;
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

  /**
   * The capsule is over: nothing is wired from this tick on, but an arc already
   * fired runs out its 300 ms — a payoff cut short on the tick the timer
   * noticed would be the capsule taking back what it just showed.
   */
  stop(): void {
    this.live = false;
    this.couples.length = 0;
    this.partners.fill(NO_PARTNER);
  }

  reset(): void {
    this.live = false;
    this.elapsed = 0;
    this.duration = 0;
    this.couples.length = 0;
    this.partners.fill(NO_PARTNER);
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
   * Spend the couple a cell belongs to: the pairing goes, and the arc fires.
   *
   * Anchors are taken here, on the tick of the strike, off where both bricks
   * are painted — a NUKE on the catch frame reaches the grid before the first
   * `step`, and the arc is owed all the same.
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
    // Struck end first, so the arc can whip out from the cell the player hit.
    const struckIsA = couple.aRow === row && couple.aColumn === column;
    const a = this.anchor(grid, struckIsA ? couple.aRow : couple.bRow, struckIsA ? couple.aColumn : couple.bColumn);
    const b = this.anchor(grid, struckIsA ? couple.bRow : couple.aRow, struckIsA ? couple.bColumn : couple.aColumn);
    this.snaps.push({
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      ticksLeft: gameConfig.powerUps.twin.arcTicks,
      seed: Math.random(),
    });
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
   * One tick: age the arcs, retire couples whose bricks are gone, and top the
   * pairing back up on the clock.
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
    for (let index = this.snaps.length - 1; index >= 0; index--) {
      if (--this.snaps[index].ticksLeft <= 0) {
        this.snaps.splice(index, 1);
      }
    }
    if (!this.live) {
      return;
    }
    this.elapsed++;
    if (this.elapsed > this.duration) {
      this.stop();
      return;
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
    // for eighteen.
    const { refillTicks } = gameConfig.powerUps.twin;
    if (this.elapsed % refillTicks === 0) {
      this.refill(grid);
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

  /** Where an arc lands: the cell's centre, where its brick is painted. */
  private anchor(grid: BrickGrid, row: number, column: number): { x: number; y: number } {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const sag = grid.sheet?.offsetAt(row, column) ?? 0;
    return {
      x: left + column * brickWidth + brickWidth / 2,
      y: top + row * brickHeight - grid.topOffset + sag + brickHeight / 2,
    };
  }
}
