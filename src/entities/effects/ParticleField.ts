import { gameConfig } from "@core/config/GameConfig";
import { nearestCore } from "@entities/effects/Singularity";

import type { Core } from "@entities/effects/Singularity";
import type { BurstSpec, ChunkMaterial } from "@interfaces/types";

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  // What the chunk broke off — a brick kind, or the deck. The renderer turns it
  // into tones; nothing here knows a colour.
  material: ChunkMaterial;
  // PIERCE's drill sparks: painted in the drill's hot tones instead of the
  // material's palette. Same slot, same physics — only the colour is the drill's.
  spark: boolean;
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
    material: "1" as ChunkMaterial,
    spark: false,
    ticksLeft: 0,
  }));
  private cursor = 0;

  burst(centerX: number, centerY: number, material: ChunkMaterial, spec: BurstSpec): void {
    this.emit(centerX, centerY, material, spec, false);
  }

  // PIERCE's sparks. The material still fills the slot — the renderer never
  // reads it off a spark — so the two kinds of debris share one pool and one step.
  sparkBurst(centerX: number, centerY: number, spec: BurstSpec): void {
    this.emit(centerX, centerY, "1", spec, true);
  }

  private emit(centerX: number, centerY: number, material: ChunkMaterial, spec: BurstSpec, spark: boolean): void {
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
      particle.material = material;
      particle.spark = spark;
      particle.ticksLeft = Math.round(randomBetween(spec.minLifeTicks, spec.maxLifeTicks));
    }
  }

  // With a hole open, debris forgets gravity and falls toward it instead. The
  // damping is what makes that a spiral rather than a straight dive, and a chunk
  // that reaches the middle is gone — nothing accumulates in a core.
  //
  // With both holes open a chunk answers to the nearer one rather than to the
  // sum of the two — see `nearestCore`.
  step(cores: readonly Core[]): void {
    const { debrisConstant, debrisDamping, debrisEatRadius, minDistance } = gameConfig.powerUps.singularity;

    for (const particle of this.particles) {
      if (particle.ticksLeft <= 0) {
        continue;
      }
      particle.ticksLeft--;

      const attractor = nearestCore(cores, particle.x, particle.y);
      if (attractor) {
        const toCoreX = attractor.x - particle.x;
        const toCoreY = attractor.y - particle.y;
        const distance = Math.hypot(toCoreX, toCoreY);
        if (distance <= attractor.reach(debrisEatRadius)) {
          particle.ticksLeft = 0;
          continue;
        }
        const pull = attractor.pull(debrisConstant) / Math.max(distance, attractor.reach(minDistance)) ** 2;
        particle.vx = (particle.vx + (toCoreX / distance) * pull) * debrisDamping;
        particle.vy = (particle.vy + (toCoreY / distance) * pull) * debrisDamping;
      } else {
        particle.vy += gameConfig.effects.particleGravity;
      }

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
