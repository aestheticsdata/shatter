import { gameConfig } from "@core/config/GameConfig";

import type { ObserverDefinition } from "@interfaces/types";

/**
 * A plaque's box, in field pixels. Three of them, in the band of sky between
 * the frame and the top of the wall — y 16 puts their 14 px between the frame's
 * 3 and the grid's 38 with room either side, and the three x positions spread
 * them across the field so no two can be taken off one rebound.
 */
export const OCULUS_WIDTH = 20;
export const OCULUS_HEIGHT = 14;
export const OCULUS_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [52, 16],
  [176, 16],
  [300, 16],
];

/**
 * THE OCULI (SHA-171): three bronze plaques that open the eye — **in order, or
 * not at all**.
 *
 * The rule is the whole mechanism. Three targets struck in any order would be
 * three targets; struck in sequence they are a *combination*, and a wall the
 * player has to solve backwards from the third one. Missing the order costs
 * nothing but the progress, which is the right price: the punishment for a bad
 * angle is having to build the angle again.
 *
 * The window is the second half of it. The third plaque does not open the eye
 * for the rest of the level — it opens it for ten seconds, and a player who
 * spends those seconds getting the ball back from the bottom of the field has
 * spent them. Letting it close resets the three, so the combination has to be
 * solved again.
 */
export class Oculi {
  /** Which plaques have been taken, in position order. */
  private readonly taken: boolean[] = [false, false, false];
  /** The one that has to be struck next, or 3 once all three are in. */
  private nextIndex = 0;
  private windowLeft = 0;
  private present = false;
  private gapLeft = 0;

  /** Present on every veil but THE LID, which seals itself instead. */
  get live(): boolean {
    return this.present;
  }

  get state(): readonly boolean[] {
    return this.taken;
  }

  /** The plaque that blinks, or -1 when there is none to strike. */
  get next(): number {
    return this.nextIndex < OCULUS_POSITIONS.length ? this.nextIndex : -1;
  }

  /** How much of the window is left, 1 the moment it opened. */
  get remaining(): number {
    return this.windowLeft / gameConfig.observer.oculi.windowTicks;
  }

  /** The gap in the top frame while the eye is open, or null. */
  get gap(): { left: number; right: number } | null {
    return this.windowLeft > 0
      ? { left: this.gapLeft, right: this.gapLeft + gameConfig.observer.oculi.gapWidth }
      : null;
  }

  /**
   * The veil's plaques — and where its gap will be cut, worked out once here
   * rather than every frame: the opening is over the *socket*, because what the
   * ball is being sent through is the eye's own door, and THE TEAR's socket is
   * far enough into the corner that the gap has to be clamped back inside the
   * frame or it would be cut through the wall's own bar.
   */
  load(definition: ObserverDefinition | undefined): void {
    this.present = definition !== undefined && definition.oculi !== false;
    this.reset();
    const { gapWidth } = gameConfig.observer.oculi;
    const { left, right } = gameConfig.field;
    const wanted = Math.round((definition?.eye.x ?? gameConfig.field.width / 2) - gapWidth / 2);
    this.gapLeft = Math.max(left + 4, Math.min(right - 4 - gapWidth, wanted));
  }

  reset(): void {
    this.taken.fill(false);
    this.nextIndex = 0;
    this.windowLeft = 0;
  }

  /** The window's clock. `true` on the tick it runs out unused. */
  step(): boolean {
    if (this.windowLeft <= 0) {
      return false;
    }
    this.windowLeft -= 1;
    if (this.windowLeft > 0) {
      return false;
    }
    this.clear();
    return true;
  }

  /** Which plaque this box is inside, or -1. Taken ones are not there any more. */
  at(x: number, y: number, width: number, height: number): number {
    if (!this.present) {
      return -1;
    }
    for (const [index, [plaqueX, plaqueY]] of OCULUS_POSITIONS.entries()) {
      if (this.taken[index]) {
        continue;
      }
      if (x < plaqueX + OCULUS_WIDTH && x + width > plaqueX && y < plaqueY + OCULUS_HEIGHT && y + height > plaqueY) {
        return index;
      }
    }
    return -1;
  }

  /**
   * One plaque struck. `"taken"`, `"opened"` on the third, or `"reset"` when it
   * was the wrong one — the caller pays, sounds and lights a star off the
   * answer, and none of those is this object's to decide.
   */
  strike(index: number): "taken" | "opened" | "reset" {
    if (index !== this.nextIndex) {
      this.clear();
      return "reset";
    }
    this.taken[index] = true;
    this.nextIndex = index + 1;
    if (this.nextIndex < OCULUS_POSITIONS.length) {
      return "taken";
    }
    this.windowLeft = gameConfig.observer.oculi.windowTicks;
    return "opened";
  }

  /** The console's `open`, and the third plaque's own path. */
  openNow(): void {
    this.taken.fill(true);
    this.nextIndex = OCULUS_POSITIONS.length;
    this.windowLeft = gameConfig.observer.oculi.windowTicks;
  }

  /** The window spent, however it was spent: the combination has to be solved again. */
  clear(): void {
    this.taken.fill(false);
    this.nextIndex = 0;
    this.windowLeft = 0;
  }
}
