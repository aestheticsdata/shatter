import { gameConfig } from "@core/config/GameConfig";

/**
 * INSIDE THE EYE (SHA-172): the visit behind the door, and the pupil in it.
 *
 * **Not a screen and not a level.** The run stays on `play` with this object
 * live, which is what keeps the veil underneath intact — the wall, the brood
 * and the diadem are all exactly as they were left, because nothing tore them
 * down to build this. The renderer paints the iris instead of the field and the
 * game skips the collisions that belong to the chamber; everything else is the
 * game it always was, with one thing in it.
 *
 * The pupil is a disc on a Lissajous orbit that **speeds up every time it is
 * hurt**, so the fight gets harder exactly as it gets closer to won. That, and
 * the clock, are the whole of the difficulty: there is no wall in here, no
 * capsule, and nothing that can cost a life.
 */
export class Inside {
  private live = false;
  /** Where the pupil is on its orbit, in radians. */
  private phase = 0;
  private hitsLeft = 0;
  private hitsMax = 0;
  private ticksLeft = 0;
  private flash = 0;
  /** Which veil this is, 1-based — the pupil's size of fight and part of its pace. */
  private veil = 1;
  private pupilX = 0;
  private pupilY = 0;

  get active(): boolean {
    return this.live;
  }

  get x(): number {
    return this.pupilX;
  }

  get y(): number {
    return this.pupilY;
  }

  get radius(): number {
    return gameConfig.observer.inside.radius;
  }

  /** How much of the pupil is left, 1 untouched to 0 dead. */
  get health(): number {
    return this.hitsMax > 0 ? this.hitsLeft / this.hitsMax : 0;
  }

  /** How much of the visit is left, 1 the moment it began. */
  get remaining(): number {
    return this.ticksLeft / gameConfig.observer.inside.ticks;
  }

  get flashTicks(): number {
    return this.flash;
  }

  /** The orbit's own angle, which the spokes turn at half of. */
  get spin(): number {
    return this.phase;
  }

  /**
   * The door is taken: the pupil is put at the centre of its orbit with a full
   * count and a full clock.
   *
   * `veil` is 1-based among the Observer's levels rather than the roster's
   * index, so the first eye is the first fight however the five are later
   * spaced through the loop.
   */
  enter(veil: number): void {
    const { baseHits, hitsPerVeil, ticks, centerX, centerY } = gameConfig.observer.inside;
    this.live = true;
    this.veil = Math.max(1, veil);
    this.phase = 0;
    this.hitsMax = baseHits + hitsPerVeil * this.veil;
    this.hitsLeft = this.hitsMax;
    this.ticksLeft = ticks;
    this.flash = 0;
    this.pupilX = centerX;
    this.pupilY = centerY;
  }

  reset(): void {
    this.live = false;
    this.ticksLeft = 0;
    this.flash = 0;
  }

  /**
   * One tick of the orbit and the clock. `true` on the tick the clock runs out,
   * which is one of the three ways a visit ends.
   */
  step(): boolean {
    if (!this.live) {
      return false;
    }
    const { speed, speedPerHit, speedPerVeil, orbitX, orbitY, verticalRatio, centerX, centerY } =
      gameConfig.observer.inside;
    this.phase += speed + (this.hitsMax - this.hitsLeft) * speedPerHit + this.veil * speedPerVeil;
    this.pupilX = centerX + Math.cos(this.phase) * orbitX;
    this.pupilY = centerY + Math.sin(this.phase * verticalRatio) * orbitY;
    if (this.flash > 0) {
      this.flash -= 1;
    }
    this.ticksLeft -= 1;
    return this.ticksLeft <= 0;
  }

  /** One strike. `true` when that was the last one it had. */
  strike(): boolean {
    this.hitsLeft -= 1;
    this.flash = gameConfig.observer.inside.flashTicks;
    return this.hitsLeft <= 0;
  }
}
