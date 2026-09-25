import { gameConfig } from "@core/config/GameConfig";
import { PARTICLES } from "@core/config/particles";
import { GATE_SIDE, PARTICLE } from "@interfaces/particles";

import type { GateSide, ParticleKind } from "@interfaces/particles";
import type { RectangleBounds } from "@interfaces/types";

/**
 * One particle loose in the chamber: a disc with a heading.
 *
 * Positions are the disc's **centre**, unlike the ball's corner, because
 * everything a particle does is about its radius — a reflection off a wall, a
 * contact with the ball, a bolt reaching it.
 */
export interface Quantum {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  // Ticks it has been in the field, which is what a lifetime is counted on.
  age: number;
  // Ticks left of a pin's arrival and of the room emptying, 0 once each is done
  // or never started. A particle with either running is a picture, not a thing
  // the ball can touch.
  arriveTicks: number;
  leaveTicks: number;
  // Still coming out of its gate: the side bar does not turn it back, because
  // it is on the far side of the bar's inner edge until it is through.
  emerging: boolean;
  // Where it was the last few ticks, newest first, flat as x, y pairs: the
  // photon's trail is walked back along this rather than along its heading, so
  // a trail that went round a bounce goes round it.
  trail: number[];
  // Ticks left of the flash it goes out in. A particle with a bloom is already
  // spent; it is kept only so the flash can be seen.
  bloomTicks: number;
  dead: boolean;
}

/** A gate: how far its bar has parted, and what it is doing. */
export interface Gate {
  side: GateSide;
  // 0 shut to 1 fully parted, which is 6 px up and 6 px down.
  open: number;
  phase: GatePhase;
  // The species waiting behind a gate that is still opening.
  pending: ParticleKind | null;
  // The particle that came through, until it is clear of the bar.
  through: Quantum | null;
  // Ticks the bar stays open after the particle is clear.
  holdTicks: number;
}

export const GATE_PHASE = {
  SHUT: "shut",
  OPENING: "opening",
  PASSING: "passing",
  HOLDING: "holding",
  CLOSING: "closing",
} as const;

export type GatePhase = (typeof GATE_PHASE)[keyof typeof GATE_PHASE];

/** What the room is made of this tick, as the game sees it. */
export interface ChamberField {
  // Whether a point is inside the wall — or `false` everywhere under GHOST,
  // which is the same answer the ball gets.
  solid: (x: number, y: number) => boolean;
  // The deck's live pieces: a SPLIT deck is two surfaces, and a floating one is
  // where TIDE has put it.
  deck: readonly RectangleBounds[];
  // STASIS: the chamber holds its breath with the balls.
  held: boolean;
}

// Anything faster than this crosses a brick's corner in one step and is walked
// in pieces instead, exactly as the ball is.
const MAX_STEP_PX = 2;

/**
 * THE CHAMBER (SHA-179): what is loose in the field, the two gates it comes in
 * through, and the clock that lets it in.
 *
 * **It owns the population and nothing the population is worth.** What a ball
 * does to a particle, what a bolt does, what anything pays and what it sounds
 * like are the game's, the division `BumperField` and `Critter` already keep.
 * What is here is where each one is, which way it is going, how long it has,
 * and when the next one comes.
 */
export class Chamber {
  readonly quanta: Quantum[] = [];
  readonly gates: readonly [Gate, Gate] = [shutGate(GATE_SIDE.LEFT), shutGate(GATE_SIDE.RIGHT)];
  // Ticks to the next release. Only counts in play: the serve screen is a
  // player looking at a fresh room, not one filling up behind their back.
  private clock: number = gameConfig.particles.firstTicks;
  // The bag: one ticket per species this depth allows, reshuffled when empty.
  private bag: ParticleKind[] = [];
  private allowed: readonly ParticleKind[] = [];

  /** Whether anything is on the field or on its way in. */
  get live(): boolean {
    return this.quanta.length > 0 || this.gates.some((gate) => gate.pending !== null);
  }

  /**
   * How many count against the cap: every particle that is not on its way out,
   * and every one still waiting behind a gate.
   */
  get population(): number {
    let count = 0;
    for (const quantum of this.quanta) {
      if (!quantum.dead && quantum.leaveTicks === 0) {
        count++;
      }
    }
    for (const gate of this.gates) {
      if (gate.pending !== null) {
        count++;
      }
    }
    return count;
  }

  /**
   * Which species the bag holds at this depth of the loop, 1-based.
   *
   * The bag is only refilled when the list changes, so a level that keeps the
   * same species keeps the tickets it had left: a pass is meant to outlast a
   * level, as the capsule bag's is.
   */
  setDepth(depth: number): void {
    const allowed = PARTICLES.filter((row) => gameConfig.particles[row.id].joins <= depth).map((row) => row.id);
    if (allowed.join() === this.allowed.join()) {
      return;
    }
    this.allowed = allowed;
    this.bag = [];
  }

  /**
   * A fresh serve: the room empties and the clock starts over.
   *
   * **Seen leaving rather than cut.** A lost ball is the one thing that clears
   * the chamber, and a room that simply went blank under the serve prompt would
   * read as the field being redrawn; each particle dims out on its own over a
   * third of a second instead. The gates close the way they would have.
   */
  restart(): void {
    const { leaveTicks, firstTicks } = gameConfig.particles;
    for (const quantum of this.quanta) {
      if (!quantum.dead && quantum.leaveTicks === 0) {
        quantum.leaveTicks = leaveTicks;
        quantum.arriveTicks = 0;
      }
    }
    for (const gate of this.gates) {
      gate.pending = null;
      gate.through = null;
      if (gate.phase !== GATE_PHASE.SHUT) {
        gate.phase = GATE_PHASE.CLOSING;
      }
    }
    this.clock = firstTicks;
  }

  reset(): void {
    this.quanta.length = 0;
    for (const gate of this.gates) {
      Object.assign(gate, shutGate(gate.side));
    }
    this.clock = gameConfig.particles.firstTicks;
  }

  /**
   * Let one in through the gate farther from the deck — the one nothing can be
   * born on top of. The near gate if the far one is busy; `false` if both are.
   *
   * Nothing is spawned here. The bar has to part first, and the particle comes
   * out of the gap on the tick it is fully open.
   */
  release(kind: ParticleKind, deckCenterX: number): boolean {
    const far = deckCenterX < gameConfig.field.width / 2 ? 1 : 0;
    const gate = [this.gates[far], this.gates[1 - far]].find((each) => each.phase === GATE_PHASE.SHUT);
    if (!gate) {
      return false;
    }
    gate.phase = GATE_PHASE.OPENING;
    gate.pending = kind;
    return true;
  }

  /**
   * The clock: a release when it runs out, if the room has space.
   *
   * At the cap it is held full rather than paused, which is the whole of "it
   * resumes twelve seconds after the population drops": the moment a particle
   * dies the full interval starts again from there.
   *
   * `true` on the tick a gate starts to part, for the sound.
   */
  tickClock(deckCenterX: number): boolean {
    const { cap, intervalTicks } = gameConfig.particles;
    if (this.allowed.length === 0 || this.population >= cap) {
      this.clock = Math.max(this.clock, intervalTicks);
      return false;
    }
    if (--this.clock > 0) {
      return false;
    }
    this.clock = intervalTicks;
    return this.release(this.draw(), deckCenterX);
  }

  private draw(): ParticleKind {
    if (this.bag.length === 0) {
      this.bag = this.allowed.toSorted(() => Math.random() - 0.5);
    }
    return this.bag.pop() ?? PARTICLE.PHOTON;
  }

  /**
   * One tick in play: the gates, then every particle.
   *
   * Returns the particles that came through a gate this tick, for the game to
   * hear.
   */
  step(field: ChamberField): number {
    const born = this.stepGates();
    for (const quantum of this.quanta) {
      this.stepQuantum(quantum, field);
    }
    this.sweep();
    return born;
  }

  /**
   * One tick off the field — the serve screen: fades and gates only. Nothing
   * moves while the ball is still on the deck, and a gate halfway through
   * closing behind a lost ball finishes closing in front of the player.
   */
  stepIdle(): void {
    for (const gate of this.gates) {
      if (gate.phase === GATE_PHASE.CLOSING) {
        this.stepGate(gate);
      }
    }
    for (const quantum of this.quanta) {
      this.stepFades(quantum);
    }
    this.sweep();
  }

  /** The live particle whose disc reaches within `reach` of a point, or null. */
  touching(x: number, y: number, reach: number): Quantum | null {
    for (const quantum of this.quanta) {
      if (!solid(quantum)) {
        continue;
      }
      if (Math.hypot(quantum.x - x, quantum.y - y) < quantum.radius + reach) {
        return quantum;
      }
    }
    return null;
  }

  /** The live particle a box overlaps — a laser bolt's — or null. */
  at(x: number, y: number, width: number, height: number): Quantum | null {
    for (const quantum of this.quanta) {
      if (!solid(quantum)) {
        continue;
      }
      const r = quantum.radius;
      if (x < quantum.x + r && x + width > quantum.x - r && y < quantum.y + r && y + height > quantum.y - r) {
        return quantum;
      }
    }
    return null;
  }

  /**
   * Put one out: gone from the field, with the bloom it goes out in. The game
   * has already paid for it.
   */
  spend(quantum: Quantum): void {
    quantum.dead = true;
    quantum.bloomTicks = gameConfig.particles.photon.bloomTicks;
  }

  // The gates, and the particle each one lets through on the tick it is fully
  // open. Counted for the caller: two can arrive on one tick.
  private stepGates(): number {
    let born = 0;
    for (const gate of this.gates) {
      if (this.stepGate(gate)) {
        born++;
      }
    }
    return born;
  }

  private stepGate(gate: Gate): boolean {
    const { travelTicks, holdTicks, clearPx } = gameConfig.particles.gate;
    const step = 1 / travelTicks;
    switch (gate.phase) {
      case GATE_PHASE.OPENING: {
        gate.open = Math.min(1, gate.open + step);
        if (gate.open < 1 - step / 2 || gate.pending === null) {
          return false;
        }
        gate.open = 1;
        gate.through = this.emerge(gate.pending, gate.side);
        gate.pending = null;
        gate.phase = GATE_PHASE.PASSING;
        return true;
      }
      case GATE_PHASE.PASSING: {
        const quantum = gate.through;
        const { left, right } = gameConfig.field;
        const inside =
          quantum === null ||
          quantum.dead ||
          (gate.side === GATE_SIDE.LEFT
            ? quantum.x - quantum.radius >= left + clearPx
            : quantum.x + quantum.radius <= right - clearPx);
        if (inside) {
          gate.through = null;
          gate.holdTicks = holdTicks;
          gate.phase = GATE_PHASE.HOLDING;
        }
        return false;
      }
      case GATE_PHASE.HOLDING: {
        if (--gate.holdTicks <= 0) {
          gate.phase = GATE_PHASE.CLOSING;
        }
        return false;
      }
      case GATE_PHASE.CLOSING: {
        gate.open = Math.max(0, gate.open - step);
        if (gate.open < step / 2) {
          gate.open = 0;
          gate.phase = GATE_PHASE.SHUT;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * A particle out of the gap: in the middle of the bar, already moving inward
   * on a heading 20° to 60° off the flat, up or down at random.
   */
  private emerge(kind: ParticleKind, side: GateSide): Quantum {
    const { y, minHeading, maxHeading } = gameConfig.particles.gate;
    const { width } = gameConfig.field;
    const heading = minHeading + Math.random() * (maxHeading - minHeading);
    const inward = side === GATE_SIDE.LEFT ? 1 : -1;
    const up = Math.random() < 0.5 ? -1 : 1;
    const { speed, radius } = gameConfig.particles[kind];
    const quantum = fresh(kind, side === GATE_SIDE.LEFT ? 1.5 : width - 1.5, y, radius);
    quantum.vx = Math.cos(heading) * speed * inward;
    quantum.vy = Math.sin(heading) * speed * up;
    quantum.emerging = true;
    this.quanta.push(quantum);
    return quantum;
  }

  private stepQuantum(quantum: Quantum, field: ChamberField): void {
    this.stepFades(quantum);
    if (quantum.dead || quantum.leaveTicks > 0) {
      return;
    }
    if (field.held) {
      return;
    }
    quantum.age++;
    const { lifeTicks } = gameConfig.particles.photon;
    if (quantum.kind === PARTICLE.PHOTON && quantum.age >= lifeTicks) {
      quantum.dead = true;
      return;
    }
    this.move(quantum, field);
  }

  // Both ends of a particle's life that are not its verb: a pin coming in, and
  // the room emptying.
  private stepFades(quantum: Quantum): void {
    if (quantum.bloomTicks > 0) {
      quantum.bloomTicks--;
    }
    if (quantum.arriveTicks > 0) {
      quantum.arriveTicks--;
    }
    if (quantum.leaveTicks > 0 && --quantum.leaveTicks === 0) {
      quantum.dead = true;
    }
  }

  /**
   * The integrator: the ball's X-then-Y walk, one reflection per axis.
   *
   * **A surface turns a particle only on the way in.** The test is that the
   * step lands in something the step before it was clear of, rather than that
   * it is inside something: a brick THE WRATH scars back over a photon, or a
   * slump falling onto one, would otherwise hold it there flipping its heading
   * every tick. Buried, a particle simply carries on until it is out.
   */
  private move(quantum: Quantum, field: ChamberField): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(quantum.vx), Math.abs(quantum.vy)) / MAX_STEP_PX));
    const dx = quantum.vx / steps;
    const dy = quantum.vy / steps;
    const { left, right, top } = gameConfig.field;
    const floor = gameConfig.paddle.y + gameConfig.paddle.height;
    const r = quantum.radius;
    for (let index = 0; index < steps; index++) {
      const wasClear = !blocked(quantum.x, quantum.y, r, field);
      quantum.x += dx;
      if (wasClear && blocked(quantum.x, quantum.y, r, field)) {
        quantum.x -= dx;
        quantum.vx = -quantum.vx;
      }
      const wasClearY = !blocked(quantum.x, quantum.y, r, field);
      quantum.y += dy;
      if (wasClearY && blocked(quantum.x, quantum.y, r, field)) {
        quantum.y -= dy;
        quantum.vy = -quantum.vy;
      }
      if (quantum.emerging) {
        quantum.emerging = quantum.x - r < left || quantum.x + r > right;
      } else if (quantum.x - r < left) {
        quantum.x = left + r;
        quantum.vx = Math.abs(quantum.vx);
      } else if (quantum.x + r > right) {
        quantum.x = right - r;
        quantum.vx = -Math.abs(quantum.vx);
      }
      if (quantum.y - r < top) {
        quantum.y = top + r;
        quantum.vy = Math.abs(quantum.vy);
      }
      // The rail: only the ball can leave the field.
      if (quantum.y + r > floor) {
        quantum.y = floor - r;
        quantum.vy = -Math.abs(quantum.vy);
      }
    }
    remember(quantum);
  }

  private sweep(): void {
    for (let index = this.quanta.length - 1; index >= 0; index--) {
      const quantum = this.quanta[index];
      if (quantum.dead && quantum.bloomTicks === 0) {
        this.quanta.splice(index, 1);
      }
    }
  }
}

function shutGate(side: GateSide): Gate {
  return { side, open: 0, phase: GATE_PHASE.SHUT, pending: null, through: null, holdTicks: 0 };
}

function fresh(kind: ParticleKind, x: number, y: number, radius: number): Quantum {
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    radius,
    age: 0,
    arriveTicks: 0,
    leaveTicks: 0,
    emerging: false,
    trail: [x, y],
    bloomTicks: 0,
    dead: false,
  };
}

// Whether a ball could meet it: here, and not on its way in or out.
function solid(quantum: Quantum): boolean {
  return !quantum.dead && quantum.arriveTicks === 0 && quantum.leaveTicks === 0;
}

// The disc's box against the wall and the deck, a pixel inside each corner so
// a particle grazing a brick's edge is not turned by the brick beside it.
function blocked(x: number, y: number, r: number, field: ChamberField): boolean {
  const inset = r - 0.5;
  if (
    field.solid(x - inset, y - inset) ||
    field.solid(x + inset, y - inset) ||
    field.solid(x - inset, y + inset) ||
    field.solid(x + inset, y + inset)
  ) {
    return true;
  }
  return field.deck.some(
    (piece) => x + r > piece.left && x - r < piece.right && y + r > piece.top && y - r < piece.bottom,
  );
}

// Where it has been, newest first, kept to the few ticks the longest trail
// needs.
const TRAIL_POINTS = 4;

function remember(quantum: Quantum): void {
  quantum.trail.unshift(quantum.x, quantum.y);
  quantum.trail.length = Math.min(quantum.trail.length, TRAIL_POINTS * 2);
}
