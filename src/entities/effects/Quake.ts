import { gameConfig } from "@core/config/GameConfig";

// The camera shake QUAKE leaves behind: how many ticks of rattle are left, and
// where the field is displaced this frame. It moves nothing itself — the
// renderer translates by these offsets and no collision ever reads them, which
// is what keeps the shake purely cosmetic.
export class Quake {
  ticksLeft = 0;
  offsetX = 0;
  offsetY = 0;

  start(): void {
    this.ticksLeft = gameConfig.effects.quake.shakeTicks;
  }

  // The amplitude decays with the clock, so the field settles instead of
  // stopping dead. Offsets are whole game pixels: the art is drawn at 3x, and a
  // fractional translate would soften every block on screen for 24 ticks.
  step(): void {
    if (this.ticksLeft === 0) {
      return;
    }
    this.ticksLeft--;
    const { shakeTicks, amplitude } = gameConfig.effects.quake;
    const reach = (amplitude * this.ticksLeft) / shakeTicks;
    this.offsetX = Math.round((Math.random() * 2 - 1) * reach);
    this.offsetY = Math.round((Math.random() * 2 - 1) * reach);
  }

  reset(): void {
    this.ticksLeft = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }
}
