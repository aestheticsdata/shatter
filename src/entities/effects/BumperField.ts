import { gameConfig } from "@core/config/GameConfig";

import type { Bumper } from "@interfaces/types";

// Where the discs go when the band has no room for a random layout: a wide
// triangle in the middle of it, which clears the deepest grid the game ships.
// Its length is also how many discs a set has — one number instead of two that
// have to agree.
const FALLBACK_LAYOUT: readonly (readonly [number, number])[] = [
  [96, 170],
  [276, 170],
  [186, 216],
];

// The pinball discs BUMPERS puts on the field: where they are, and what is left
// of each one's kick flash. It bounces nothing itself — ShatterGame owns the
// ricochet and the score, the same division Detonation and Singularity use.
export class BumperField {
  readonly discs: Bumper[] = [];
  // Consecutive kicks with no paddle catch and no wall clamp in between. A ball
  // wedged between two discs would never come down on its own, so the set keeps
  // this count and ShatterGame despawns it at `streakLimit`.
  streak = 0;

  get active(): boolean {
    return this.discs.length > 0;
  }

  /**
   * Lay out a fresh set under a grid whose bottom edge is `gridBottom`.
   *
   * Random inside the band, rejecting anything too close to a disc already down
   * or to SINGULARITY's core — the two effects share this stretch of field, and
   * a disc on the core would hide it. A run that cannot place all three (a deep
   * grid leaving no band, or a tight retry run) takes the fixed triangle rather
   * than shipping a short set or two discs sitting on top of each other.
   */
  spawn(gridBottom: number): void {
    const { topGap, bottom, left, right, minGap, coreKeepOut, placementTries } = gameConfig.powerUps.bumpers;
    const core = gameConfig.powerUps.singularity;
    const top = gridBottom + topGap;
    this.discs.length = 0;
    this.streak = 0;

    if (top <= bottom) {
      for (let placed = 0; placed < FALLBACK_LAYOUT.length; placed++) {
        for (let attempt = 0; attempt < placementTries; attempt++) {
          const x = Math.round(left + Math.random() * (right - left));
          const y = Math.round(top + Math.random() * (bottom - top));
          if (Math.hypot(x - core.x, y - core.y) < coreKeepOut) {
            continue;
          }
          if (this.discs.some((disc) => Math.hypot(x - disc.x, y - disc.y) < minGap)) {
            continue;
          }
          this.discs.push({ x, y, flashTicksLeft: 0 });
          break;
        }
      }
    }

    if (this.discs.length < FALLBACK_LAYOUT.length) {
      this.discs.length = 0;
      for (const [x, y] of FALLBACK_LAYOUT) {
        this.discs.push({ x, y, flashTicksLeft: 0 });
      }
    }
  }

  step(): void {
    for (const disc of this.discs) {
      if (disc.flashTicksLeft > 0) {
        disc.flashTicksLeft--;
      }
    }
  }

  reset(): void {
    this.discs.length = 0;
    this.streak = 0;
  }
}
