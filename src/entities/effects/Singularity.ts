import { gameConfig } from "@core/config/GameConfig";

// The box a drifting hole's centre stays inside, and how fast it crosses it.
// Absent for a hole that stands still.
export interface CoreDrift {
  speed: number;
  angle: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CoreSpec {
  x: number;
  y: number;
  lifeTicks: number;
  // 1 for SINGULARITY's fixed hole; VORTEX opens at 1.5. Every length and pull
  // the game reads off a core comes through `reach`/`pull` below, so the two
  // holes can never fall out of step.
  scale: number;
  drift?: CoreDrift;
}

// What a consumer needs off an open hole: where it is, and how far it reaches at
// its own size. Narrower than the class on purpose — `DropPool` and
// `ParticleField` each apply their own law and have no business with the clock.
export interface Core {
  active: boolean;
  x: number;
  y: number;
  reach(length: number): number;
  pull(constant: number): number;
}

/**
 * The open hole nearest a point, or undefined when none is open.
 *
 * Everything a core acts on answers to exactly one of them, and this is where
 * that is decided. Summing two holes would be a different effect and not a
 * stronger one: two 0.9 px/tick capsule drags add up to more than the 1.3 fall,
 * so a capsule between the holes would climb instead of sinking, and debris
 * torn between them drifts up the line between the cores and spirals into
 * neither. Balls are the one exception, and deliberately — an impulse pair on a
 * heading that is renormalised anyway is a curve, not a tug of war.
 *
 * Distance is compared squared: this runs per capsule and per debris chunk per
 * tick, and the root buys nothing but a slower answer to the same question.
 */
export function nearestCore(cores: readonly Core[], x: number, y: number): Core | undefined {
  let nearest: Core | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const core of cores) {
    if (!core.active) {
      continue;
    }
    const gap = (core.x - x) ** 2 + (core.y - y) ** 2;
    if (gap < best) {
      best = gap;
      nearest = core;
    }
  }
  return nearest;
}

// An open black hole: where it is, how old it is, how big its disc has grown,
// and — for VORTEX — which way it is drifting. It pulls nothing itself:
// ShatterGame applies the force to balls, DropPool to capsules and ParticleField
// to debris, each with its own law. This object is only the geometry and the
// clock, the same division Detonation uses.
//
// Two instances are live at once, one per capsule. SINGULARITY's is fixed at
// scale 1 and VORTEX's drifts at 1.5, and nothing else about them differs.
export class Singularity implements Core {
  active = false;
  x = 0;
  y = 0;
  age = 0;
  radius = 0;
  scale = 1;
  private velocityX = 0;
  private velocityY = 0;
  private box: CoreDrift | null = null;
  private lifeTicks = 0;

  open(spec: CoreSpec): void {
    this.active = true;
    this.x = spec.x;
    this.y = spec.y;
    this.age = 0;
    this.radius = 0;
    this.scale = spec.scale;
    this.lifeTicks = spec.lifeTicks;
    this.box = spec.drift ?? null;
    this.velocityX = spec.drift ? Math.cos(spec.drift.angle) * spec.drift.speed : 0;
    this.velocityY = spec.drift ? Math.sin(spec.drift.angle) * spec.drift.speed : 0;
  }

  /**
   * A length this hole reaches at its size: disc, eat radii, the pull's floor,
   * HOMING's cutoff, the halo rings.
   *
   * Sizing a hole is one rule so a bigger disc can never end up with a smaller
   * hole's grip — lengths go up with `scale`, and the inverse-square constant
   * below with its *square*, which is what keeps the shape of the field
   * identical and only wider: the same 0.36 px/tick² a ball felt 30 px out from
   * SINGULARITY it feels 45 px out from VORTEX.
   *
   * **Lengths only.** A speed put through here is a different effect, not a
   * bigger one: `DropPool`'s drag is a funnel purely because it loses to the
   * capsule fall, and scaling it would win instead — see the note there.
   */
  reach(length: number): number {
    return length * this.scale;
  }

  pull(constant: number): number {
    return constant * this.scale * this.scale;
  }

  // The disc irises open and shut rather than blinking into existence: at full
  // size from frame one it would read as a sprite that had always been there.
  step(): void {
    const { discRadius, easeTicks } = gameConfig.powerUps.singularity;
    this.age++;
    const opening = this.age / easeTicks;
    const closing = (this.lifeTicks - this.age) / easeTicks;
    this.radius = this.reach(discRadius) * Math.max(0, Math.min(1, opening, closing));
    this.coast();
  }

  /**
   * A second catch on a hole already open: the clock restarts where it stands.
   *
   * The iris shuts and opens again on the new clock, which is the whole
   * acknowledgment the catch landed. Position and heading are left alone — a
   * hole that teleported out from under a rally would be the game changing its
   * mind, the same reason a second BUMPERS catch leaves the discs where they are.
   */
  renew(lifeTicks: number): void {
    this.age = 0;
    this.lifeTicks = lifeTicks;
  }

  reset(): void {
    this.active = false;
    this.age = 0;
    this.radius = 0;
    this.scale = 1;
    this.lifeTicks = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.box = null;
  }

  // A drifting hole runs straight and turns at the walls of its box. The clamp
  // before each flip is what keeps a bounce to one frame: left a fraction
  // outside, a centre would meet the same test next tick and shiver against the
  // edge instead of leaving it.
  private coast(): void {
    if (!this.box) {
      return;
    }
    this.x += this.velocityX;
    this.y += this.velocityY;
    if (this.x <= this.box.left || this.x >= this.box.right) {
      this.x = Math.min(this.box.right, Math.max(this.box.left, this.x));
      this.velocityX = -this.velocityX;
    }
    if (this.y <= this.box.top || this.y >= this.box.bottom) {
      this.y = Math.min(this.box.bottom, Math.max(this.box.top, this.y));
      this.velocityY = -this.velocityY;
    }
  }
}
