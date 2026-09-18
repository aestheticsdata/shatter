import { gameConfig } from "@core/config/GameConfig";

export interface Tear {
  x: number;
  y: number;
  /** How fast it is falling, which grows until it reaches terminal. */
  fall: number;
}

/**
 * THE TEAR's tears (SHA-174): what the eye weeps, and what grows where they
 * land.
 *
 * **A tear is a question with a deadline.** It leaves the lower lid under the
 * pupil and falls slowly enough to be reached and fast enough to be missed;
 * burst in the air it pays and adds a link, and allowed to land it hatches an
 * egg — so the veil's difficulty is something the player is *building* by not
 * answering. Nothing about it is a punishment for being hit; it is a bill that
 * comes due either way.
 *
 * The geometry and the clock live here. What a burst pays, and what a landing
 * hatches, are the game's.
 */
export class Tears {
  readonly drops: Tear[] = [];
  private live = false;
  private nextTear = 0;

  get active(): boolean {
    return this.live;
  }

  load(weeping: boolean): void {
    this.live = weeping;
    this.drops.length = 0;
    this.nextTear = gameConfig.observer.tears.firstTicks;
  }

  reset(): void {
    this.load(false);
  }

  /**
   * One tick. Returns what happened this tick so the caller can pay and sound
   * it: the x of a tear that has just been wept, and the x of every one that has
   * just landed.
   *
   * Landings are a list because two tears can reach the floor on the same tick —
   * not in ordinary play, where they are four and a half seconds apart, but
   * certainly under the console's hand and certainly on a frame the loop had to
   * catch up over.
   */
  step(from: { x: number; y: number }): { wept: number | null; landed: number[] } {
    if (!this.live) {
      return { wept: null, landed: [] };
    }
    const { intervalTicks, fall, gravity, maxFall, floorY } = gameConfig.observer.tears;
    let wept: number | null = null;
    this.nextTear -= 1;
    if (this.nextTear <= 0) {
      this.nextTear = intervalTicks;
      // Under the pupil rather than under the socket's middle: the eye weeps
      // from where it is looking, so a player watching the iris knows which
      // column the next one is coming down before it exists.
      const x = Math.max(gameConfig.field.left + 1, Math.round(from.x) - 2);
      this.drops.push({ x, y: from.y, fall });
      wept = x;
    }
    const landed: number[] = [];
    for (const tear of this.drops) {
      tear.y += tear.fall;
      tear.fall = Math.min(maxFall, tear.fall + gravity);
      if (tear.y > floorY) {
        landed.push(tear.x);
      }
    }
    if (landed.length > 0) {
      const { floorY: floor } = gameConfig.observer.tears;
      this.drops.splice(0, this.drops.length, ...this.drops.filter((tear) => tear.y <= floor));
    }
    return { wept, landed };
  }

  /** The first tear this box overlaps, or null. */
  at(x: number, y: number, width: number, height: number): Tear | null {
    const { width: tearWidth, height: tearHeight } = gameConfig.observer.tears;
    for (const tear of this.drops) {
      if (x < tear.x + tearWidth && x + width > tear.x && y < tear.y + tearHeight && y + height > tear.y) {
        return tear;
      }
    }
    return null;
  }

  /** Struck in the air: it is gone, and the caller pays for it. */
  burst(tear: Tear): void {
    const index = this.drops.indexOf(tear);
    if (index >= 0) {
      this.drops.splice(index, 1);
    }
  }
}
