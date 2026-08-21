import { gameConfig } from "@core/config/GameConfig";

import type { Bumper } from "@interfaces/types";

// Where the discs go when the band has no room for a random layout: a
// quincunx in the middle of it — three across the bottom, two riding above the
// gaps — which clears the deepest grid the game ships. Its length is also how
// many discs a set has — one number instead of two that have to agree.
const FALLBACK_LAYOUT: readonly (readonly [number, number])[] = [
  [66, 216],
  [186, 216],
  [306, 216],
  [126, 165],
  [246, 165],
];

// How many of them sit in the band's lower half; the rest go above.
const LOWER_DISC_COUNT = 3;

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
      const midpoint = (top + bottom) / 2;
      for (let placed = 0; placed < FALLBACK_LAYOUT.length; placed++) {
        // Three discs in the lower half, then two sitting a little above them:
        // a rack with backstops rather than one loose cloud of five.
        const upper = placed >= LOWER_DISC_COUNT;
        const bandTop = upper ? top : midpoint;
        const bandBottom = upper ? Math.max(top, midpoint - 12) : bottom;
        for (let attempt = 0; attempt < placementTries; attempt++) {
          const x = Math.round(left + Math.random() * (right - left));
          const y = Math.round(bandTop + Math.random() * (bandBottom - bandTop));
          if (Math.hypot(x - core.x, y - core.y) < coreKeepOut) {
            continue;
          }
          if (this.discs.some((disc) => Math.hypot(x - disc.x, y - disc.y) < minGap)) {
            continue;
          }
          this.discs.push({ x, y, flashTicksLeft: 0, arriveTicksLeft: 0, leaveTicksLeft: 0 });
          break;
        }
      }
    }

    if (this.discs.length < FALLBACK_LAYOUT.length) {
      this.discs.length = 0;
      for (const [x, y] of FALLBACK_LAYOUT) {
        this.discs.push({ x, y, flashTicksLeft: 0, arriveTicksLeft: 0, leaveTicksLeft: 0 });
      }
    }

    // Seeded here rather than at each push, so both placement paths get the same
    // ladder. Array order is bottom-up by construction — the lower discs are laid
    // first and the backstops after them — so the rack lights from the deck up
    // and the player can count five.
    const { arriveTicks, staggerTicks } = gameConfig.powerUps.bumpers;
    this.discs.forEach((disc, index) => {
      disc.arriveTicksLeft = arriveTicks + index * staggerTicks;
    });
  }

  /**
   * The power cut: every disc leaves together, each on its own outward ring.
   *
   * Not staggered, unlike the arrival. A boot sequence comes up one lamp at a
   * time and a power cut does not, and it keeps the picture honest — after the
   * timer there is nothing on screen a ball could have hit. A disc still on its
   * way in never lands: its ring turns around where it is.
   */
  retire(): void {
    const { leaveTicks } = gameConfig.powerUps.bumpers;
    for (const disc of this.discs) {
      disc.arriveTicksLeft = 0;
      disc.leaveTicksLeft = leaveTicks;
    }
    this.streak = 0;
  }

  /**
   * A second catch over a rack that is already out there.
   *
   * The dead case this exists for: the catch branch only spawns when the field
   * is empty, and a rack in the middle of leaving still holds five records — so
   * without this a player who caught the next O during those twelve ticks would
   * buy a live 720-tick timer, BUMPERS in the POWER inset, and an empty field.
   * The discs they were watching go snap back instead, with the kick eye lit,
   * which is a top-up said in the rack's own language and costs no respawn.
   *
   * On a rack that is simply live it is only that eye — the one thing a second
   * catch has never had to show for itself.
   */
  revive(): void {
    const { flashTicks } = gameConfig.powerUps.bumpers;
    for (const disc of this.discs) {
      disc.leaveTicksLeft = 0;
      disc.flashTicksLeft = flashTicks;
    }
  }

  // Backwards, because it splices the array it is walking.
  step(): void {
    const { flashTicks } = gameConfig.powerUps.bumpers;
    for (let index = this.discs.length - 1; index >= 0; index--) {
      const disc = this.discs[index];
      if (disc.flashTicksLeft > 0) {
        disc.flashTicksLeft--;
      }
      if (disc.arriveTicksLeft > 0) {
        disc.arriveTicksLeft--;
        // The tick it lands it wears the eye it wears when it pays, so a disc's
        // first frame is it kicking itself into existence.
        if (disc.arriveTicksLeft === 0) {
          disc.flashTicksLeft = flashTicks;
        }
      }
      if (disc.leaveTicksLeft > 0) {
        disc.leaveTicksLeft--;
        if (disc.leaveTicksLeft === 0) {
          this.discs.splice(index, 1);
        }
      }
    }
  }

  reset(): void {
    this.discs.length = 0;
    this.streak = 0;
  }
}
