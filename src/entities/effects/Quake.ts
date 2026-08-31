import { gameConfig } from "@core/config/GameConfig";

/**
 * What QUAKE leaves behind: a rattle under the whole field, and a wall falling
 * the row the shift just gave it.
 *
 * Two displacements with nothing in common but a start tick. The rattle is
 * symmetric noise around zero over the whole field and is read by nothing but
 * the renderer's `translate`. The drop is one direction, the wall alone, and is
 * read by the collision too — which is the point of it: the shift is a 12 px
 * jump in one direction, and noise around zero cannot conceal a displacement.
 * It only makes the frame harder to point at.
 *
 * The rattle is the field's rather than the capsule's, which is why `rattle`
 * takes its own length and reach: PYRE's blast asks this object for a shorter,
 * shallower one, and the alternative was a second copy of four lines of noise
 * and a second `translate` for the renderer to compose.
 */
export class Quake {
  ticksLeft = 0;
  offsetX = 0;
  offsetY = 0;
  // The rattle currently running, so the decay below is spent over the length
  // that asked for it rather than over QUAKE's whenever PYRE is the caller.
  private shakeTicks = 0;
  private amplitude = 0;
  // How far above its own index row the wall is drawn this frame, 12 on the
  // catch tick down to 0 when it lands. Everything drawn in wall coordinates
  // reads this one number, and so does the pixel-to-cell lookup.
  dropOffset = 0;
  private dropLeft = 0;

  start(): void {
    const { shakeTicks, amplitude, dropTicks } = gameConfig.effects.quake;
    this.rattle(shakeTicks, amplitude);
    // Set here and not on the first step, because the catch happens after the
    // step in the tick that starts it: the very frame the row is vaporised has
    // to paint the wall where it still stood.
    this.dropLeft = dropTicks;
    this.dropOffset = gameConfig.grid.brickHeight;
  }

  /**
   * Shake the field, for whatever length and reach the caller is worth.
   *
   * A weaker rattle arriving over a stronger one is dropped rather than taken:
   * a PYRE clicked in the middle of a QUAKE would otherwise cut the ground from
   * a 4 px shake down to 3 and restart its decay, and the wall dropping a row is
   * the bigger event of the two however recently the other one happened. Compared
   * on reach left rather than on ticks left, because that is what is actually
   * visible — a QUAKE two ticks from settling has nothing left to protect.
   */
  rattle(ticks: number, amplitude: number): void {
    const reachLeft = this.shakeTicks > 0 ? (this.amplitude * this.ticksLeft) / this.shakeTicks : 0;
    if (amplitude <= reachLeft) {
      return;
    }
    this.ticksLeft = ticks;
    this.shakeTicks = ticks;
    this.amplitude = amplitude;
  }

  // The amplitude decays with the clock, so the field settles instead of
  // stopping dead. Offsets are whole game pixels: the art is drawn at 3x, and a
  // fractional translate would soften every block on screen for 24 ticks.
  step(): void {
    // Above the rattle's early return, not below it: the two clocks are set
    // together but they are not the same clock, and a `shakeTicks` ever tuned
    // below `dropTicks` would otherwise park the wall in mid-air for the rest
    // of the level.
    if (this.dropLeft > 0) {
      const { dropTicks } = gameConfig.effects.quake;
      this.dropLeft--;
      // Squared, so the fall accelerates rather than sliding at one speed —
      // and rounded, for the reason the rattle is.
      const left = this.dropLeft / dropTicks;
      this.dropOffset = Math.round(gameConfig.grid.brickHeight * (1 - (1 - left) ** 2));
    }
    if (this.ticksLeft === 0) {
      return;
    }
    this.ticksLeft--;
    const reach = (this.amplitude * this.ticksLeft) / this.shakeTicks;
    this.offsetX = Math.round((Math.random() * 2 - 1) * reach);
    this.offsetY = Math.round((Math.random() * 2 - 1) * reach);
  }

  reset(): void {
    this.ticksLeft = 0;
    this.shakeTicks = 0;
    this.amplitude = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dropOffset = 0;
    this.dropLeft = 0;
  }
}
