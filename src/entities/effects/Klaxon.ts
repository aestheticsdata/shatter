import { gameConfig } from "@core/config/GameConfig";

/**
 * One honk's pressure front: a half-disc off the bulb, growing fast at the rail
 * and slowing as it climbs, dying against the bottom course of the wall.
 *
 * `touched` is what it has already shoved, so a ball or a capsule is turned once
 * per honk however many ticks the front spends passing over it.
 */
export interface Front {
  x: number;
  y: number;
  reach: number;
  age: number;
  touched: Set<object>;
}

/**
 * KLAXON (SHA-143): a rubber bulb horn on the deck's right cap, two honks in it.
 *
 * **A charge, not a duration.** The ammunition is the whole of the capsule's
 * life: the bulb inflates on the catch, a click spends a honk, and the bulb
 * deflates on the player's own last one rather than on a clock — so the held
 * cue can never lie, and the ending lands on something the player did.
 *
 * The shove itself is the game's, because what a front does to a ball is a
 * question about headings and speeds, and what it does to a capsule is a
 * question about the drop pool. This class owns the bulb and where its fronts
 * are.
 */
export class Klaxon {
  readonly fronts: Front[] = [];
  honks = 0;
  // 0 flat to 1 fully inflated. Rises on the catch, falls after the last honk.
  blend = 0;
  // Ticks left of the twitch a click GLUE swallowed earns the bulb, so the
  // player can see why nothing came out.
  twitch = 0;
  // Ticks left of the squeeze a honk puts through the bulb.
  squeeze = 0;

  get armed(): boolean {
    return this.honks > 0;
  }

  get visible(): boolean {
    return this.blend > 0;
  }

  /**
   * The catch: fill the bulb. A second KLAXON over a live one refills it to two
   * rather than stacking — two honks is the price the tier was paid in.
   */
  arm(): void {
    this.honks = gameConfig.powerUps.klaxon.honks;
  }

  /**
   * A click. Answers whether a honk went off: the bulb has to be full, since
   * a horn still inflating has nothing in it yet.
   */
  honk(x: number, y: number, reach: number): boolean {
    if (this.honks <= 0 || this.blend < 1) {
      return false;
    }
    this.honks--;
    this.squeeze = gameConfig.powerUps.klaxon.squeezeTicks;
    this.fronts.push({ x, y, reach, age: 0, touched: new Set() });
    return true;
  }

  /**
   * The bulb's half of a tick — a picture, stepped above the freeze gates.
   * Answers the two moments a sound and a puff hang off: the bulb reaching
   * full on the way in (`parp`), and the last of the air leaving (`spent`).
   */
  stepBulb(): { parp: boolean; spent: boolean } {
    const { inflateTicks, deflateTicks } = gameConfig.powerUps.klaxon;
    const was = this.blend;
    if (this.honks > 0) {
      this.blend = Math.min(1, this.blend + 1 / inflateTicks);
    } else if (this.squeeze === 0) {
      this.blend = Math.max(0, this.blend - 1 / deflateTicks);
    }
    if (this.twitch > 0) {
      this.twitch--;
    }
    if (this.squeeze > 0) {
      this.squeeze--;
    }
    return { parp: was < 1 && this.blend === 1, spent: was > 0 && this.blend === 0 };
  }

  /** The fronts' half — below the gates with everything the fronts shove. */
  stepFronts(): void {
    const { frontTicks } = gameConfig.powerUps.klaxon;
    for (let index = this.fronts.length - 1; index >= 0; index--) {
      if (++this.fronts[index].age > frontTicks) {
        this.fronts.splice(index, 1);
      }
    }
  }

  /**
   * How far a front has got: fastest at the rail and slowing as it climbs, so
   * it covers the gutter beside the deck — where a ball is actually lost —
   * while there is still a ball there to save.
   */
  radius(front: Front): number {
    const t = Math.min(1, front.age / gameConfig.powerUps.klaxon.frontTicks);
    return front.reach * (1 - (1 - t) * (1 - t));
  }

  reset(): void {
    this.fronts.length = 0;
    this.honks = 0;
    this.blend = 0;
    this.twitch = 0;
    this.squeeze = 0;
  }
}
