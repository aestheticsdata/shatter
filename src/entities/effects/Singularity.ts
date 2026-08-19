import { gameConfig } from "@core/config/GameConfig";

// The open black hole: where it is, how old it is, and how big its disc has
// grown. It pulls nothing itself — ShatterGame applies the force to balls,
// DropPool to capsules and ParticleField to debris, each with its own law. This
// object is only the geometry and the clock, the same division Detonation uses.
export class Singularity {
  active = false;
  x = 0;
  y = 0;
  age = 0;
  radius = 0;
  private lifeTicks = 0;

  open(lifeTicks: number): void {
    const { x, y } = gameConfig.powerUps.singularity;
    this.active = true;
    this.x = x;
    this.y = y;
    this.age = 0;
    this.radius = 0;
    this.lifeTicks = lifeTicks;
  }

  // The disc irises open and shut rather than blinking into existence: at full
  // size from frame one it would read as a sprite that had always been there.
  step(): void {
    const { discRadius, easeTicks } = gameConfig.powerUps.singularity;
    this.age++;
    const opening = this.age / easeTicks;
    const closing = (this.lifeTicks - this.age) / easeTicks;
    this.radius = discRadius * Math.max(0, Math.min(1, opening, closing));
  }

  reset(): void {
    this.active = false;
    this.age = 0;
    this.radius = 0;
    this.lifeTicks = 0;
  }
}
