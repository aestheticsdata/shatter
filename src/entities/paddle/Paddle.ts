import { gameConfig } from "@core/config/GameConfig";

import type { RectangleBounds } from "@interfaces/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * How a width change is spread over its ticks.
 *
 * `linear` is a mechanism running at its own pace, which is what every reward
 * does — WIDE and XWIDE run the caps out, and the retraction at expiry gives
 * them back the same way. `out` is fast-first and is JAMMER's alone: a trap
 * snaps the deck shut and then settles, it does not politely adjust it.
 */
export type WidthCurve = "linear" | "out";

export class Paddle {
  x: number = gameConfig.paddle.initialX;
  width: number = gameConfig.paddle.baseWidth;

  // The run of a width change, and nothing that outlives one: at rest
  // `easeTicksLeft` is 0 and the three below it are whatever the last ease
  // left, which nothing reads.
  private widthFrom: number = gameConfig.paddle.baseWidth;
  private widthTarget: number = gameConfig.paddle.baseWidth;
  private easeTicks = 0;
  private easeTicksLeft = 0;
  private curve: WidthCurve = "linear";

  get centerX(): number {
    return this.x + this.width / 2;
  }

  get bounds(): RectangleBounds {
    return {
      left: this.x,
      right: this.x + this.width,
      top: gameConfig.paddle.y,
      bottom: gameConfig.paddle.y + gameConfig.paddle.height,
    };
  }

  // Whether the caps are still travelling. Read by the deck's own tint, which
  // belongs to the run and not to the capsule that started it.
  get easingWidth(): boolean {
    return this.easeTicksLeft > 0;
  }

  /**
   * The width, now, with no ease at all.
   *
   * Every reset site: a serve, a cleared level, a game over. A deck still
   * running its caps out behind the CLEARED overlay is an effect outliving the
   * run that earned it, and the panel goes on drawing it there.
   */
  snapWidth(width: number): void {
    this.easeTicks = 0;
    this.easeTicksLeft = 0;
    this.widthFrom = width;
    this.widthTarget = width;
    this.applyWidth(width);
  }

  /**
   * Run the caps out — or in — over `ticks`, a step a tick.
   *
   * The caller owns the tick count because the rate is a rule about capsules
   * (one pixel an edge, uncapped from base, bounded on a swap) and not about
   * the deck. What the deck owns is the mechanism: where it started, where it
   * is going, and the fact that it stays centred on the way.
   */
  easeWidthTo(target: number, ticks: number, curve: WidthCurve = "linear"): void {
    if (ticks <= 0 || target === this.width) {
      this.snapWidth(target);
      return;
    }
    this.widthFrom = this.width;
    this.widthTarget = target;
    this.easeTicks = ticks;
    this.easeTicksLeft = ticks;
    this.curve = curve;
  }

  stepWidth(): void {
    if (this.easeTicksLeft === 0) {
      return;
    }
    this.easeTicksLeft--;
    // The last tick lands on the target exactly rather than on whatever the
    // curve rounds to: a deck one pixel short of WIDE for the rest of the
    // capsule is a bug nobody would ever guess the cause of.
    if (this.easeTicksLeft === 0) {
      this.applyWidth(this.widthTarget);
      return;
    }
    const progress = (this.easeTicks - this.easeTicksLeft) / this.easeTicks;
    const eased = this.curve === "out" ? 1 - (1 - progress) ** 2 : progress;
    this.applyWidth(this.widthFrom + (this.widthTarget - this.widthFrom) * eased);
  }

  moveCenterTo(fieldX: number): void {
    this.x = fieldX - this.width / 2;
    this.clampX();
  }

  moveByDelta(deltaX: number): void {
    this.x += deltaX;
    this.clampX();
  }

  /**
   * A new width, anchored on the centre the deck already had.
   *
   * **Even whole pixels, always.** `spriteBrush` rounds a sprite's position but
   * not its size, so a fractional width leaves the body's right edge on a
   * fractional device pixel while the cap drawn 8 px inside it snaps to a whole
   * one, and the cap shimmers against the body for the length of the ease. An
   * odd width is worse: it stands the deck's own centre on a half pixel and
   * jitters the whole sprite by 1.5 device px.
   *
   * **The centre anchor is not a nicety.** Pointer lock is delta-only and the
   * absolute path is event-driven, so a still mouse repositions nothing: an
   * unanchored ease would grow the deck rightward and leave the player's hand
   * pointing at the wrong end of it. Against a wall `clampX` pins the near end
   * and the deck extrudes into the field instead, which is the honest picture
   * of a mechanism that has already found its stop.
   */
  private applyWidth(width: number): void {
    const { centerX } = this;
    this.width = 2 * Math.round(width / 2);
    this.x = centerX - this.width / 2;
    this.clampX();
  }

  private clampX(): void {
    this.x = clamp(this.x, gameConfig.field.left, gameConfig.field.right - this.width);
  }
}
