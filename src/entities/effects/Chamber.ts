import { gameConfig } from "@core/config/GameConfig";
import { PARTICLES } from "@core/config/particles";
import { GATE_SIDE, PARTICLE } from "@interfaces/particles";

import type { GateSide, ParticleKind, ParticlePin } from "@interfaces/particles";
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
  // ELECTRON: the brick it guards, by cell, -1 while it has none; where that
  // brick is this tick, for the ring; where it is on its orbit, in radians; and
  // how long it has been in orbit, 0 while it is still flying there.
  hostRow: number;
  hostColumn: number;
  hostX: number;
  hostY: number;
  phase: number;
  orbitTicks: number;
  // Ticks to its next look for a brick, while it has none.
  searchTicks: number;
  // NUCLEUS: one of the two halves of a split one, and the stretch a whole one
  // is in before it parts — ticks left, and the axis it is parting along.
  daughter: boolean;
  splitTicks: number;
  axisX: number;
  axisY: number;
}

/** A brick, by cell. */
export interface Cell {
  row: number;
  column: number;
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
  // ELECTRON: the brick one should guard from here, passed over the ones
  // already guarded — or null when there is none — and where a guarded brick
  // is this tick, or null once it has died.
  pickHost: (x: number, y: number, taken: readonly Cell[]) => Cell | null;
  hostCentre: (row: number, column: number) => { x: number; y: number } | null;
}

/** What the room did this tick that the game has to hear or pay for. */
export interface ChamberEvents {
  // Particles out of a gate.
  born: number;
  // Electrons freed as photons by their brick dying under them.
  freed: number;
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
  // ANTIBALL's whiteouts, where one met something, until their light is gone.
  readonly flashes: { x: number; y: number; ticks: number }[] = [];
  readonly gates: readonly [Gate, Gate] = [shutGate(GATE_SIDE.LEFT), shutGate(GATE_SIDE.RIGHT)];
  // Ticks to the next release. Only counts in play: the serve screen is a
  // player looking at a fresh room, not one filling up behind their back.
  private clock: number = gameConfig.particles.firstTicks;
  // The bag: one ticket per species this depth allows, reshuffled when empty.
  private bag: ParticleKind[] = [];
  private allowed: readonly ParticleKind[] = [];
  // A level's free pins, waiting for the first launch and then for a gate.
  private waiting: ParticleKind[] = [];

  /** Whether anything is on the field or on its way in. */
  get live(): boolean {
    return this.quanta.length > 0 || this.waiting.length > 0 || this.gates.some((gate) => gate.pending !== null);
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
    return count + this.waiting.length;
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
    this.waiting = [];
    this.clock = firstTicks;
  }

  /**
   * A level's inhabitants, on its first serve (SHA-184).
   *
   * **An electron is already in orbit when the player first sees the level** —
   * it is part of how the level is built, and a shield the player watches arrive
   * after launching is a shield they had no chance to read. It fades in on its
   * ring during the serve. Everything else waits for the first launch and comes
   * through the far gate, one a gate.
   */
  pin(pins: readonly ParticlePin[], hostCentre: ChamberField["hostCentre"]): void {
    const { radius } = gameConfig.particles.electron;
    const { arriveTicks } = gameConfig.particles;
    for (const pin of pins) {
      if (pin.kind !== PARTICLE.ELECTRON || pin.row === undefined || pin.column === undefined) {
        this.waiting.push(pin.kind);
        continue;
      }
      const centre = hostCentre(pin.row, pin.column);
      if (centre === null) {
        continue;
      }
      const electron = fresh(PARTICLE.ELECTRON, centre.x, centre.y, radius);
      electron.hostRow = pin.row;
      electron.hostColumn = pin.column;
      electron.orbitTicks = 1;
      electron.arriveTicks = arriveTicks;
      this.quanta.push(electron);
    }
  }

  /** The waiting pins, through whichever gates are free. `true` if one opened. */
  letIn(deckCenterX: number): boolean {
    let opened = false;
    while (this.waiting.length > 0 && this.release(this.waiting[0], deckCenterX)) {
      this.waiting.shift();
      opened = true;
    }
    return opened;
  }

  reset(): void {
    this.waiting = [];
    this.quanta.length = 0;
    this.flashes.length = 0;
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
  step(field: ChamberField): ChamberEvents {
    const events = { born: this.stepGates(), freed: 0 };
    const count = this.quanta.length;
    for (let index = 0; index < count; index++) {
      if (this.stepQuantum(this.quanta[index], field)) {
        events.freed++;
      }
    }
    this.sweep();
    return events;
  }

  /**
   * One tick off the field — the serve screen: fades and gates only. Nothing
   * moves while the ball is still on the deck, and a gate halfway through
   * closing behind a lost ball finishes closing in front of the player.
   */
  stepIdle(field: ChamberField): void {
    for (const gate of this.gates) {
      if (gate.phase === GATE_PHASE.CLOSING) {
        this.stepGate(gate);
      }
    }
    for (const quantum of this.quanta) {
      this.stepFades(quantum);
      // A pinned electron keeps turning on the serve: the shield is read
      // before the launch, and a still one reads as a painted dot.
      if (quantum.kind === PARTICLE.ELECTRON && quantum.orbitTicks > 0 && !quantum.dead && quantum.leaveTicks === 0) {
        this.stepElectron(quantum, field);
      }
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
  spend(quantum: Quantum, bloom = true): void {
    quantum.dead = true;
    quantum.bloomTicks = bloom ? gameConfig.particles.photon.bloomTicks : 0;
  }

  /**
   * NUCLEUS, struck: it takes the recoil and starts to part along `axis`. It is
   * no longer a thing the ball can meet — what is there is two daughters still
   * inside one outline, and they are let go when the stretch is done.
   */
  split(nucleus: Quantum, axisX: number, axisY: number, kickX: number, kickY: number): void {
    nucleus.splitTicks = gameConfig.particles.nucleus.splitTicks;
    nucleus.axisX = axisX;
    nucleus.axisY = axisY;
    nucleus.vx += kickX;
    nucleus.vy += kickY;
  }

  // The stretch done: two daughters flying apart along the axis at their own
  // speed, carrying the recoil the whole one had taken.
  private part(nucleus: Quantum): void {
    const { radius, speed } = gameConfig.particles.nucleus.daughter;
    nucleus.dead = true;
    for (const side of [-1, 1]) {
      const daughter = fresh(
        PARTICLE.NUCLEUS,
        nucleus.x + side * nucleus.axisX * 3,
        nucleus.y + side * nucleus.axisY * 3,
        radius,
      );
      daughter.daughter = true;
      daughter.vx = nucleus.vx + side * nucleus.axisX * speed;
      daughter.vy = nucleus.vy + side * nucleus.axisY * speed;
      this.quanta.push(daughter);
    }
  }

  // The bricks guarded right now: two electrons never share one.
  private hosts(besides: Quantum): Cell[] {
    const taken: Cell[] = [];
    for (const quantum of this.quanta) {
      if (quantum !== besides && !quantum.dead && quantum.hostRow >= 0) {
        taken.push({ row: quantum.hostRow, column: quantum.hostColumn });
      }
    }
    return taken;
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

  // `true` when an electron was freed this tick.
  private stepQuantum(quantum: Quantum, field: ChamberField): boolean {
    this.stepFades(quantum);
    if (quantum.dead || quantum.leaveTicks > 0) {
      return false;
    }
    if (field.held) {
      return false;
    }
    quantum.age++;
    if (quantum.splitTicks > 0) {
      this.move(quantum, field);
      if (--quantum.splitTicks === 0) {
        this.part(quantum);
      }
      return false;
    }
    if (quantum.kind === PARTICLE.ELECTRON) {
      return this.stepElectron(quantum, field);
    }
    if (quantum.age >= lifeOf(quantum.kind)) {
      quantum.dead = true;
      return false;
    }
    this.move(quantum, field);
    return false;
  }

  /**
   * ELECTRON: through the gate, to the heaviest brick near it, and round it.
   *
   * **The flight goes through the wall.** An electron is not bounced by the
   * bricks it passes on its way to the one it is going to guard — a silver
   * buried in the middle of a wall is exactly the brick it is for, and one that
   * could only reach the front row would guard nothing worth guarding.
   *
   * **Its brick dying frees it as a photon**, off along the tangent it was
   * travelling: ionisation, and the one way a player can turn a shield into a
   * bent ball on purpose. `true` on that tick, for the sound.
   *
   * With nothing left to guard — every brick taken or the wall gone — it drifts
   * like a photon that never dims, and looks again every half second.
   */
  private stepElectron(electron: Quantum, field: ChamberField): boolean {
    const { orbitX, orbitY, periodTicks, speed, searchTicks } = gameConfig.particles.electron;
    if (electron.emerging) {
      this.move(electron, field);
      return false;
    }
    if (electron.hostRow < 0) {
      if (--electron.searchTicks <= 0) {
        electron.searchTicks = searchTicks;
        const host = field.pickHost(electron.x, electron.y, this.hosts(electron));
        if (host) {
          electron.hostRow = host.row;
          electron.hostColumn = host.column;
          electron.orbitTicks = 0;
        }
      }
      if (electron.hostRow < 0) {
        this.move(electron, field);
        return false;
      }
    }
    const centre = field.hostCentre(electron.hostRow, electron.hostColumn);
    if (centre === null) {
      ionise(electron);
      return true;
    }
    electron.hostX = centre.x;
    electron.hostY = centre.y;
    electron.phase += (Math.PI * 2) / periodTicks;
    const orbitAtX = centre.x + Math.cos(electron.phase) * orbitX;
    const orbitAtY = centre.y + Math.sin(electron.phase) * orbitY;
    if (electron.orbitTicks === 0) {
      // Still flying: straight at where its place on the orbit is now, which
      // is moving, so it arrives in step with the turn rather than having to
      // find it.
      const toX = orbitAtX - electron.x;
      const toY = orbitAtY - electron.y;
      const distance = Math.hypot(toX, toY);
      if (distance > speed) {
        electron.vx = (toX / distance) * speed;
        electron.vy = (toY / distance) * speed;
        electron.x += electron.vx;
        electron.y += electron.vy;
        remember(electron);
        return false;
      }
    }
    electron.orbitTicks++;
    // The velocity it would have along the orbit, kept for the tick it is freed.
    electron.vx = orbitAtX - electron.x;
    electron.vy = orbitAtY - electron.y;
    electron.x = orbitAtX;
    electron.y = orbitAtY;
    remember(electron);
    return false;
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

  /** An annihilation's whiteout, centred where it happened. */
  flash(x: number, y: number): void {
    this.flashes.push({ x, y, ticks: gameConfig.particles.antiball.flashTicks });
  }

  private sweep(): void {
    for (let index = this.flashes.length - 1; index >= 0; index--) {
      if (--this.flashes[index].ticks <= 0) {
        this.flashes.splice(index, 1);
      }
    }
    for (let index = this.quanta.length - 1; index >= 0; index--) {
      const quantum = this.quanta[index];
      if (quantum.dead && quantum.bloomTicks === 0) {
        this.quanta.splice(index, 1);
      }
    }
  }
}

/**
 * How long a species lives, in ticks: the two that dim out have a lifetime,
 * and the rest live until something takes them.
 */
export function lifeOf(kind: ParticleKind): number {
  if (kind === PARTICLE.PHOTON) {
    return gameConfig.particles.photon.lifeTicks;
  }
  if (kind === PARTICLE.ANTIBALL) {
    return gameConfig.particles.antiball.lifeTicks;
  }
  return Number.POSITIVE_INFINITY;
}

function shutGate(side: GateSide): Gate {
  return { side, open: 0, phase: GATE_PHASE.SHUT, pending: null, through: null, holdTicks: 0 };
}

/**
 * One particle standing still at a point, at its species' own size — for the
 * BESTIARY's cards (SHA-185), which pose the field's sprites rather than
 * drawing copies of them.
 */
export function quantumOf(kind: ParticleKind, x: number, y: number): Quantum {
  return fresh(kind, x, y, gameConfig.particles[kind].radius);
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
    hostRow: -1,
    hostColumn: -1,
    hostX: 0,
    hostY: 0,
    phase: Math.random() * Math.PI * 2,
    orbitTicks: 0,
    searchTicks: 0,
    daughter: false,
    splitTicks: 0,
    axisX: 0,
    axisY: 0,
  };
}

/**
 * An electron whose brick has gone, turned into what it was carrying: a photon
 * off along its orbit's tangent at a photon's speed, with a photon's whole life
 * ahead of it.
 */
function ionise(electron: Quantum): void {
  const { speed, radius } = gameConfig.particles.photon;
  const heading = Math.atan2(electron.vy, electron.vx);
  electron.kind = PARTICLE.PHOTON;
  electron.radius = radius;
  electron.vx = Math.cos(heading) * speed;
  electron.vy = Math.sin(heading) * speed;
  electron.age = 0;
  electron.hostRow = -1;
  electron.hostColumn = -1;
  electron.orbitTicks = 0;
  electron.trail = [electron.x, electron.y];
}

// Whether a ball could meet it: here, and not on its way in or out.
function solid(quantum: Quantum): boolean {
  return !quantum.dead && quantum.arriveTicks === 0 && quantum.leaveTicks === 0 && quantum.splitTicks === 0;
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
