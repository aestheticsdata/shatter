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
 */
export class Quake {
  ticksLeft = 0;
  offsetX = 0;
  offsetY = 0;
  // How far above its own index row the wall is drawn this frame, 12 on the
  // catch tick down to 0 when it lands. Everything drawn in wall coordinates
  // reads this one number, and so does the pixel-to-cell lookup.
  dropOffset = 0;
  private dropLeft = 0;

  start(): void {
    this.ticksLeft = gameConfig.effects.quake.shakeTicks;
    // Set here and not on the first step, because the catch happens after the
    // step in the tick that starts it: the very frame the row is vaporised has
    // to paint the wall where it still stood.
    this.dropLeft = gameConfig.effects.quake.dropTicks;
    this.dropOffset = gameConfig.grid.brickHeight;
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
    const { shakeTicks, amplitude } = gameConfig.effects.quake;
    const reach = (amplitude * this.ticksLeft) / shakeTicks;
    this.offsetX = Math.round((Math.random() * 2 - 1) * reach);
    this.offsetY = Math.round((Math.random() * 2 - 1) * reach);
  }

  reset(): void {
    this.ticksLeft = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dropOffset = 0;
    this.dropLeft = 0;
  }
}
