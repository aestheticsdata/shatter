import { gameConfig } from "@core/config/GameConfig";

import type { BallBox } from "@entities/effects/Erosion";

/** One end of the pair: where it is, and — for the exit — which way it points. */
export interface Mouth {
  x: number;
  y: number;
  // Radians, screen convention (y down), always in the upward half. The exit's
  // facing is what the ball leaves on; the entry carries one too, unused, so
  // both ends are one shape.
  facing: number;
}

/**
 * Where a mouth may open, as the game sees the field this tick. Read-only: the
 * roll probes positions it may not take.
 */
export interface WormholeField {
  // LEAP's predicate: whether a box at (x, y) of this size stands clear of
  // everything solid.
  free(x: number, y: number, size: number): boolean;
  balls: readonly BallBox[];
  // The bottom edge of the lowest live brick, or the grid top on an empty wall.
  wallBottom: number;
  // Centres of the wall's empty cells, inside its own extent.
  gaps: ReadonlyArray<{ x: number; y: number }>;
  deckY: number;
}

// The three places an exit may open. Equally likely; the one that cannot be
// satisfied falls through to the next.
const EXIT_BANDS = ["under", "between", "above"] as const;
type ExitBand = (typeof EXIT_BANDS)[number];

/**
 * WORMHOLE (SHA-165): a hole under the wall, and a second one somewhere else.
 *
 * A ball whose centre reaches the entry leaves the exit on the facing the exit
 * is wearing, at its own speed — the game does that; this class owns where the
 * two mouths are, how open they are, and the roll. **The pair is spent by use**:
 * a transit shuts both and opens them again elsewhere, so the capsule is never
 * furniture the ball keeps missing.
 *
 * `open` is one number for the pair on purpose. Arrival dilates both from a
 * pixel and a re-roll collapses both before they reopen, so what the player
 * sees is *shut here, open there* rather than a hole teleporting.
 */
export class Wormhole {
  entry: Mouth | null = null;
  exit: Mouth | null = null;
  // 0 shut to 1 fully open, stepped by one over `dilateTicks`.
  open = 0;
  // Ticks since the pair last came fully open, for the rim's overshoot.
  settled = 0;
  private opening = false;
  // A re-roll is pending: the pair is collapsing and will reopen elsewhere.
  private rerolling = false;
  // The capsule is ending: collapse and stay shut.
  private ending = false;
  // Frame counter for the rims' rotation.
  spin = 0;

  get live(): boolean {
    return this.entry !== null;
  }

  // Whether the entry may take a ball this tick: fully open and going nowhere.
  get swallowing(): boolean {
    return this.entry !== null && this.open >= 1 && !this.rerolling && !this.ending;
  }

  /**
   * The catch, or a second one over a live pair: roll a fresh pair and dilate
   * it. A second WORMHOLE re-rolls rather than opening a third hole — two pairs
   * is a capsule nobody can read.
   */
  start(field: WormholeField): void {
    this.ending = false;
    if (this.entry !== null) {
      this.rerolling = true;
      this.opening = false;
      return;
    }
    this.place(field);
  }

  /** A transit spent the pair: collapse both ends and reopen elsewhere. */
  spend(): void {
    this.rerolling = true;
    this.opening = false;
  }

  /** The timer is running out: collapse and stay shut. */
  release(): void {
    this.ending = true;
    this.opening = false;
  }

  /** One tick of the rims. Stepped above the freeze gates — it is a picture. */
  step(field: WormholeField): void {
    if (this.entry === null) {
      return;
    }
    this.spin++;
    const rate = 1 / gameConfig.powerUps.wormhole.dilateTicks;
    if (this.rerolling || this.ending) {
      this.open = Math.max(0, this.open - rate);
      if (this.open === 0) {
        if (this.ending) {
          this.reset();
          return;
        }
        this.rerolling = false;
        this.place(field);
      }
      return;
    }
    if (this.opening) {
      this.open = Math.min(1, this.open + rate);
      if (this.open === 1) {
        this.opening = false;
        this.settled = 0;
      }
    } else {
      this.settled++;
    }
  }

  reset(): void {
    this.entry = null;
    this.exit = null;
    this.open = 0;
    this.settled = 0;
    this.opening = false;
    this.rerolling = false;
    this.ending = false;
  }

  private place(field: WormholeField): void {
    const entry = this.roll(field, "under", null);
    if (entry === null) {
      // Nowhere legal under the wall this tick — a ball sitting in the only
      // clear stretch. Try again next tick rather than opening on top of it.
      this.rerolling = true;
      this.open = 0;
      this.entry = this.entry ?? { x: 0, y: 0, facing: 0 };
      return;
    }
    const first = Math.floor(Math.random() * EXIT_BANDS.length);
    let exit: Mouth | null = null;
    for (let offset = 0; offset < EXIT_BANDS.length && exit === null; offset++) {
      exit = this.roll(field, EXIT_BANDS[(first + offset) % EXIT_BANDS.length], entry);
    }
    if (exit === null) {
      this.rerolling = true;
      this.open = 0;
      this.entry = this.entry ?? { x: 0, y: 0, facing: 0 };
      return;
    }
    this.entry = entry;
    this.exit = exit;
    this.open = 0;
    this.opening = true;
  }

  private roll(field: WormholeField, band: ExitBand, entry: Mouth | null): Mouth | null {
    const { radius, wallMargin, ballMargin, deckMargin, tries, pairGap, minFacing, maxFacing, probe } =
      gameConfig.powerUps.wormhole;
    const { left, right, top } = gameConfig.field;
    const gridTop = gameConfig.grid.top;
    const minX = left + wallMargin + radius;
    const maxX = right - wallMargin - radius;
    for (let attempt = 0; attempt < tries; attempt++) {
      let x: number;
      let y: number;
      if (band === "between") {
        if (field.gaps.length === 0) {
          return null;
        }
        const gap = field.gaps[Math.floor(Math.random() * field.gaps.length)];
        x = gap.x;
        y = gap.y;
      } else {
        const low = band === "above" ? top + radius : field.wallBottom + 12 + radius;
        const high = band === "above" ? gridTop - 8 : field.deckY - deckMargin - radius;
        if (high <= low) {
          return null;
        }
        x = minX + Math.random() * (maxX - minX);
        y = low + Math.random() * (high - low);
      }
      if (x < minX || x > maxX) {
        continue;
      }
      // Where the ball will stand must be clear — the ring itself may lie over a
      // brick's edge, which is a hole in space and not a thing in the wall.
      if (!field.free(x - probe / 2, y - probe / 2, probe)) {
        continue;
      }
      if (
        field.balls.some(
          (ball) => ball.active && Math.hypot(ball.x + ball.size / 2 - x, ball.y + ball.size / 2 - y) < ballMargin,
        )
      ) {
        continue;
      }
      if (entry !== null && Math.hypot(entry.x - x, entry.y - y) < pairGap) {
        continue;
      }
      const facing = -(minFacing + Math.random() * (maxFacing - minFacing));
      return { x, y, facing };
    }
    return null;
  }
}
