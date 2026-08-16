import { gameConfig } from "@core/config/GameConfig";

import type { BrickKind, BurstSpec } from "@interfaces/types";

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  brickKind: BrickKind;
  ticksLeft: number;
}

// Fixed-size ring buffer of debris chunks. A full pool recycles its oldest
// slots, so emission cost stays bounded and no allocation happens per frame.
export class ParticleField {
  readonly particles: Particle[] = Array.from({ length: gameConfig.effects.particlePoolSize }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 2,
    brickKind: "1" as BrickKind,
    ticksLeft: 0,
  }));
  private cursor = 0;

  burst(centerX: number, centerY: number, brickKind: BrickKind, spec: BurstSpec): void {
    for (let i = 0; i < spec.chunkCount; i++) {
      const particle = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;

      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(spec.minSpeed, spec.maxSpeed);
      particle.x = centerX;
      particle.y = centerY;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
      particle.size = Math.round(randomBetween(spec.minChunkSize, spec.maxChunkSize));
      particle.brickKind = brickKind;
      particle.ticksLeft = Math.round(randomBetween(spec.minLifeTicks, spec.maxLifeTicks));
    }
  }

  step(): void {
    for (const particle of this.particles) {
      if (particle.ticksLeft <= 0) {
        continue;
      }
      particle.ticksLeft--;
      particle.vy += gameConfig.effects.particleGravity;
      particle.x += particle.vx;
      particle.y += particle.vy;
    }
  }

  reset(): void {
    for (const particle of this.particles) {
      particle.ticksLeft = 0;
    }
  }
}
