import { gameConfig } from "@core/config/GameConfig";

// State of a NUKE shockwave: the initial full-field flash, an expanding ring
// that detonates bricks as it reaches them, then a hold that lets the debris
// fall before the clear screen. It stays active through the hold, so the panel
// label and the lingering ring survive until the clear. ShatterGame drives the
// sweep and destroys the bricks; this object only tracks geometry and timing.
export class Detonation {
  active = false;
  x = 0;
  y = 0;
  radius = 0;
  flashTicksLeft = 0;
  private sweepTicks = 0;
  private holdTicksLeft = 0;

  get holding(): boolean {
    return this.holdTicksLeft > 0;
  }

  // Safety bound: past this, the sweep destroys everything left regardless of radius.
  get sweepExpired(): boolean {
    return this.sweepTicks >= gameConfig.effects.nuke.maxSweepTicks;
  }

  start(x: number, y: number): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.flashTicksLeft = gameConfig.effects.nuke.fieldFlashTicks;
    this.sweepTicks = 0;
    this.holdTicksLeft = 0;
  }

  step(): void {
    this.radius += gameConfig.effects.nuke.ringSpeed;
    this.sweepTicks++;
    if (this.flashTicksLeft > 0) {
      this.flashTicksLeft--;
    }
  }

  beginHold(): void {
    // Clamp: with a zero hold, `holding` would stay false and the sweep would
    // re-run forever on an empty grid — the level could never clear.
    this.holdTicksLeft = Math.max(1, gameConfig.effects.nuke.holdTicks);
  }

  // Returns true on the tick the hold ends.
  stepHold(): boolean {
    if (this.flashTicksLeft > 0) {
      this.flashTicksLeft--;
    }
    return --this.holdTicksLeft === 0;
  }

  reset(): void {
    this.active = false;
    this.holdTicksLeft = 0;
  }
}
