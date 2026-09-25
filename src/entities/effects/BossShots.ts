import { gameConfig } from "@core/config/GameConfig";
import { smoothDoubled } from "@entities/creatures/bitmap";

import type { CREATURE, CreatureKind } from "@interfaces/creatures";
import type { RectangleBounds } from "@interfaces/types";

/** The five that fire, and only them: an ordinary creature never shoots. */
export type ShootingBoss =
  | typeof CREATURE.SPIDER_QUEEN
  | typeof CREATURE.MOTH_MOTHER
  | typeof CREATURE.FROG_KING
  | typeof CREATURE.SNAIL_ELDER
  | typeof CREATURE.MAN_O_WAR;

/**
 * What each boss drops, in its own species' palette letters, so a shot is
 * drawn in the colours of whoever fired it: the queen's venom, the mother's
 * dust, the king's spit, the elder's slime and the man o' war's barb. All of
 * them point down, which is the only way they go. Doubled by Scale2x like the
 * bosses that fire them, or a five-pixel drop under a boss that size is a speck.
 */
export const BOSS_SHOT_BITMAPS: Readonly<Record<ShootingBoss, readonly string[]>> = {
  spiderQueen: smoothDoubled(["..k..", ".kmk.", ".kmk.", "kmhmk", "kmmmk", "kmmmk", ".kkk."]),
  mothMother: smoothDoubled([".s.w.", "s.w.s", ".wsw.", "w.s.w", ".wsw.", "s.w.s", ".s.w."]),
  frogKing: smoothDoubled(["..k..", ".klk.", "kglgk", "kgggk", "kgggk", ".kkk."]),
  snailElder: smoothDoubled([".kkk..", "klllk.", "kolllk", "kooook", "kooook", ".kkkk."]),
  manOWar: smoothDoubled(["..l..", ".kpk.", "..p..", "..p..", "..m..", ".kmk.", "..k.."]),
};

export interface BossShot {
  kind: ShootingBoss;
  x: number;
  y: number;
  speed: number;
}

/** Where a boss fires from: its own kind, and the middle of its underside. */
export interface Muzzle {
  kind: CreatureKind;
  x: number;
  y: number;
}

function isShooter(kind: CreatureKind): kind is ShootingBoss {
  return kind in BOSS_SHOT_BITMAPS;
}

export function bossShotSize(kind: ShootingBoss): { width: number; height: number } {
  const rows = BOSS_SHOT_BITMAPS[kind];
  return { width: rows[0].length, height: rows.length };
}

/**
 * THE BOSSES' SHOTS (SHA-260): what a boss drops on the deck.
 *
 * **Straight down, and only down.** The boss aims by being there — the queen
 * stalks over the deck, the mother flies her eight, the king leaps — so a shot
 * is a column the player has to step out of, and the blink in the boss's mouth
 * before it lets go is the warning.
 *
 * The clock and the geometry live here; what a hit costs is the game's.
 */
export class BossShots {
  readonly shots: BossShot[] = [];
  /** The one in the boss's mouth, and how far through its wind-up (0 to 1). */
  charging: { kind: ShootingBoss; x: number; y: number; progress: number } | null = null;
  private wait = 0;
  private charge = 0;

  reset(): void {
    this.shots.length = 0;
    this.charging = null;
    this.wait = 0;
    this.charge = 0;
  }

  /**
   * One tick. True on the tick a shot leaves the mouth, so the caller can
   * sound it. `deckY` is the rail's top, for the headroom rule.
   */
  step(muzzle: Muzzle | null, deckY: number): boolean {
    for (const shot of this.shots) {
      shot.y += shot.speed;
    }
    this.shots.splice(0, this.shots.length, ...this.shots.filter((shot) => shot.y < gameConfig.field.height));
    const { chargeTicks, headroom } = gameConfig.bosses.shots;
    if (muzzle === null || !isShooter(muzzle.kind) || muzzle.y < gameConfig.field.top) {
      // A boss still coming down from the ceiling, or none at all: the clock
      // waits, and a wind-up in progress is dropped rather than left hanging.
      this.charging = null;
      this.charge = 0;
      return false;
    }
    const kind = muzzle.kind;
    const size = bossShotSize(kind);
    const x = muzzle.x - size.width / 2;
    if (this.charge > 0) {
      this.charge += 1;
      this.charging = { kind, x, y: muzzle.y, progress: this.charge / chargeTicks };
      if (this.charge < chargeTicks) {
        return false;
      }
      this.charge = 0;
      this.charging = null;
      this.wait = gameConfig.bosses.shots[kind].intervalTicks;
      this.shots.push({ kind, x, y: muzzle.y, speed: gameConfig.bosses.shots[kind].speed });
      return true;
    }
    if (this.wait > 0) {
      this.wait -= 1;
      return false;
    }
    // Only from high enough: a boss low on the field holds its fire until it
    // is back up, rather than spitting into a deck with no time to move.
    if (muzzle.y <= deckY - headroom) {
      this.charge = 1;
      this.charging = { kind, x, y: muzzle.y, progress: 0 };
    }
    return false;
  }

  /** The first shot touching any of these, taken out of the air; null if none. */
  strike(segments: readonly RectangleBounds[]): BossShot | null {
    const index = this.shots.findIndex((shot) => {
      const { width, height } = bossShotSize(shot.kind);
      return segments.some(
        (segment) =>
          shot.x < segment.right &&
          shot.x + width > segment.left &&
          shot.y < segment.bottom &&
          shot.y + height > segment.top,
      );
    });
    if (index < 0) {
      return null;
    }
    const [shot] = this.shots.splice(index, 1);
    return shot;
  }
}
