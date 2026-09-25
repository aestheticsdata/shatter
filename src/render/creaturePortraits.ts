import { BRICK_BY_ID } from "@core/config/bricks";
import { gameConfig } from "@core/config/GameConfig";
import { PARTICLE_TONES } from "@core/config/particles";
import { Creatures } from "@entities/creatures/Creatures";
import { BAT_STATE } from "@entities/creatures/species/bat";
import { BEETLE_STATE } from "@entities/creatures/species/beetle";
import { FROG_STATE } from "@entities/creatures/species/frog";
import { WOODPECKER_STATE } from "@entities/creatures/species/woodpecker";
import { quantumOf } from "@entities/effects/Chamber";
import { FINE } from "@interfaces/art";
import { BESTIARY_BROOD, CREATURE } from "@interfaces/creatures";
import { PARTICLE } from "@interfaces/particles";
import { drawBall, drawBeast, drawBrick, drawCreature, drawQuantum } from "@render/CanvasRenderer";

import type { Creature } from "@entities/creatures/Creature";
import type { BroodForm } from "@entities/effects/Brood";
import type { BestiaryKind, CreatureKind } from "@interfaces/creatures";

/**
 * THE BESTIARY's portraits (SHA-255): each creature alone, in the pose it is
 * best known by, alive on its own clock.
 *
 * Drawn by the renderer's own `drawCreature` and `drawBeast` — the baked body
 * and the species' own `decorate` — so the creature on the page is the one on
 * the field, feather for feather. The page blows the result up by a whole
 * number; what is drawn here is the creature at its real size.
 *
 * Every portrait is posed in a small room in stage pixels, and positioned from
 * the room's top-left like a field: the spider's and the queen's threads are
 * drawn from `gameConfig.field.top`, so they hang from the top of the room the
 * way they hang from the ceiling of the field. The page trims the room to what
 * the portrait actually covers.
 */
export const PORTRAIT_ROOM = { width: 96, height: 72 } as const;

// Where a creature is set down in the room, clear of its edges: legs, heads and
// wingtips reach past a sprite's box, and the trim takes the margin away again.
const AT = 8;

// The beetle's loop: on its feet, then on its back.
const BEETLE_WALK = 300;
const BEETLE_CYCLE = BEETLE_WALK + gameConfig.creatures.beetle.flipTicks;
// How tall the vine is grown — four, so it stands in the book's ordinary
// window (SHA-257) — and how much the crab is carrying.
const VINE_SEGMENTS = 4;
const CRAB_PIPS = 2;
// The air between two of the brood's forms.
const BROOD_GAP = 4;
// A frog's hop on the spot: how often, and how long it is in the air.
const HOP_CYCLE = 150;
const HOP_TICKS = 24;

/** One portrait, at frame `frame` of its own clock, onto a canvas `scale` times the room. */
export type Portrait = (ctx: CanvasRenderingContext2D, frame: number, scale: number, hd: boolean) => void;

/**
 * A creature born the way a level births one, then posed.
 *
 * Through `Creatures.add`, so each species' own `spawn` sets whatever it sets,
 * and the pose only says what differs. The position is put back after, because
 * a slug's spawn moves it to the rail and a vine's to its own height.
 */
function posed(kind: CreatureKind, x: number, y: number, pose: Partial<Creature> = {}): Creature {
  const creature = new Creatures().add(kind, x, y);
  return Object.assign(creature, { x, y }, pose);
}

/** A species that needs nothing but its own frames: born, and drawn on the clock. */
function still(kind: CreatureKind, pose: (frame: number) => Partial<Creature> = () => ({})): Portrait {
  return (ctx, frame, scale, hd) => drawCreature(ctx, posed(kind, AT, AT, pose(frame)), frame, scale, false, hd);
}

/**
 * A frog, or a king of them: sitting, and every couple of seconds a hop on the
 * spot with its legs kicked out — one frame of body, so a frog that only sat
 * would be the one creature in the book that never moved.
 */
function hopping(kind: CreatureKind, height: number): Portrait {
  return (ctx, frame, scale, hd) => {
    const cycle = frame % HOP_CYCLE;
    const t = cycle < HOP_CYCLE - HOP_TICKS ? 0 : (cycle - (HOP_CYCLE - HOP_TICKS)) / HOP_TICKS;
    const lift = height * 4 * t * (1 - t);
    const frog = posed(kind, AT, AT + height - lift, { state: t > 0 ? FROG_STATE.LEAP : FROG_STATE.SIT });
    drawCreature(ctx, frog, frame, scale, false, hd);
  };
}

// A triangle wave: back and forth across `span`, which is a straight line
// bouncing off two walls — the photon's whole life, in one dimension.
function bounce(travelled: number, span: number): number {
  const phase = ((travelled % (2 * span)) + 2 * span) % (2 * span);
  return phase < span ? phase : 2 * span - phase;
}

// THE CHAMBER's four (SHA-185), posed on the same clock as the creatures.
const PHOTON_BOX = { width: 40, height: 22 } as const;
const NUCLEUS_CYCLE = 150;
const NUCLEUS_WHOLE = 100;

function photon(frame: number, back = 0): { x: number; y: number } {
  const { speed } = gameConfig.particles.photon;
  const along = (frame - back) * speed * Math.SQRT1_2;
  return { x: AT + 2 + bounce(along, PHOTON_BOX.width), y: AT + 2 + bounce(along, PHOTON_BOX.height) };
}

const PARTICLE_PORTRAITS = {
  // On its dead-straight line across a small room, trail and all.
  [PARTICLE.PHOTON]: (ctx, frame, scale, hd) => {
    const here = photon(frame);
    const quantum = quantumOf(PARTICLE.PHOTON, here.x, here.y);
    quantum.trail = [0, 1, 2, 3].flatMap((back) => {
      const at = photon(frame, back);
      return [at.x, at.y];
    });
    drawQuantum(ctx, quantum, frame, scale, false, hd);
  },
  // Round a silver, the brick it would have chosen, ring and all.
  [PARTICLE.ELECTRON]: (ctx, frame, scale, hd) => {
    const { orbitX, orbitY, periodTicks } = gameConfig.particles.electron;
    const brick = { x: AT + orbitX - 13, y: AT + orbitY - 4 };
    const centre = { x: brick.x + 15, y: brick.y + 6 };
    drawBrick(
      ctx,
      brick.x,
      brick.y,
      {
        kind: "S",
        hitPoints: BRICK_BY_ID.S.hitPoints,
        points: 0,
        seed: 1,
        capsule: null,
        seeded: false,
        scarTicks: 0,
        grown: false,
      },
      scale,
      { hd },
    );
    const phase = (frame / periodTicks) * Math.PI * 2;
    const electron = quantumOf(
      PARTICLE.ELECTRON,
      centre.x + Math.cos(phase) * orbitX,
      centre.y + Math.sin(phase) * orbitY,
    );
    Object.assign(electron, {
      hostX: centre.x,
      hostY: centre.y,
      hostRow: 0,
      hostColumn: 0,
      phase,
      orbitTicks: periodTicks,
    });
    drawQuantum(ctx, electron, frame, scale, false, hd);
  },
  // Whole for a while, then struck: the stretch, and the two halves drifting
  // apart before it is whole again.
  [PARTICLE.NUCLEUS]: (ctx, frame, scale, hd) => {
    const { splitTicks } = gameConfig.particles.nucleus;
    const cycle = frame % NUCLEUS_CYCLE;
    const centre = { x: AT + 16, y: AT + 8 };
    if (cycle < NUCLEUS_WHOLE) {
      drawQuantum(ctx, quantumOf(PARTICLE.NUCLEUS, centre.x, centre.y), frame, scale, false, hd);
      return;
    }
    if (cycle < NUCLEUS_WHOLE + splitTicks) {
      const nucleus = quantumOf(PARTICLE.NUCLEUS, centre.x, centre.y);
      Object.assign(nucleus, { splitTicks: NUCLEUS_WHOLE + splitTicks - cycle, axisX: 1, axisY: 0 });
      drawQuantum(ctx, nucleus, frame, scale, false, hd);
      return;
    }
    const apart = 3 + 0.3 * (cycle - NUCLEUS_WHOLE - splitTicks);
    for (const side of [-1, 1]) {
      const daughter = quantumOf(PARTICLE.NUCLEUS, centre.x + side * apart, centre.y);
      Object.assign(daughter, { daughter: true, radius: gameConfig.particles.nucleus.daughter.radius });
      drawQuantum(ctx, daughter, frame, scale, false, hd);
    }
  },
  // Its halo breathing, and a ball drifting close enough to be tied to it.
  [PARTICLE.ANTIBALL]: (ctx, frame, scale, hd) => {
    const { threadReach } = gameConfig.particles.antiball;
    const anti = { x: AT + 8, y: AT + 8 };
    const ball = { x: anti.x + 16 + 5 * Math.sin(frame / 40), y: anti.y + 8 };
    const size = gameConfig.ball.size;
    const toX = ball.x - anti.x;
    const toY = ball.y - anti.y;
    const length = Math.hypot(toX, toY);
    if (length <= threadReach) {
      ctx.fillStyle = PARTICLE_TONES.antiball.thread;
      const dot = hd && scale === FINE ? 2 : scale;
      for (let along = 5; along <= length - size / 2 - 1; along++) {
        const shiver = Math.sin(along * 1.7 + frame * 0.9) * 0.6;
        const x = anti.x + (toX / length) * along - (toY / length) * shiver;
        const y = anti.y + (toY / length) * along + (toX / length) * shiver;
        ctx.fillRect(Math.round(x * scale) - dot / 2, Math.round(y * scale) - dot / 2, dot, dot);
      }
    }
    drawQuantum(ctx, quantumOf(PARTICLE.ANTIBALL, anti.x, anti.y), frame, scale, false, hd);
    drawBall(ctx, ball.x - size / 2, ball.y - size / 2, scale, false, { hd });
  },
} satisfies Record<string, Portrait>;

const PORTRAITS: Record<BestiaryKind, Portrait> = {
  ...PARTICLE_PORTRAITS,
  [CREATURE.MOTH]: still(CREATURE.MOTH),
  [CREATURE.SNAIL]: still(CREATURE.SNAIL, () => ({ facing: 1 })),
  // Hanging a little way down its thread, which is the spider's whole portrait.
  [CREATURE.SPIDER]: (ctx, frame, scale, hd) => {
    const spider = posed(CREATURE.SPIDER, AT, AT + 6, { home: { x: AT, y: gameConfig.field.top } });
    drawCreature(ctx, spider, frame, scale, false, hd);
  },
  [CREATURE.FROG]: hopping(CREATURE.FROG, 6),
  // Awake and beating, which is the rarer half of its life and the one worth
  // looking at: asleep it is a folded bag under a brick.
  [CREATURE.BAT]: (ctx, frame, scale, hd) => {
    const bat = posed(CREATURE.BAT, AT + 8, AT, { state: BAT_STATE.FLIT, clock: frame, facing: 1 });
    drawCreature(ctx, bat, frame, scale, false, hd);
  },
  [CREATURE.WISP]: still(CREATURE.WISP),
  // Its lantern on its own blink, from the top.
  [CREATURE.FIREFLY]: still(CREATURE.FIREFLY, (frame) => ({ phase: 0, clock: frame })),
  // Five seconds on its feet, then over on its back with its legs going: the
  // turn that is the whole fight, on a loop.
  [CREATURE.BEETLE]: (ctx, frame, scale, hd) => {
    const cycle = frame % BEETLE_CYCLE;
    const flipped = cycle >= BEETLE_WALK;
    const beetle = posed(CREATURE.BEETLE, AT, AT + 4, {
      state: flipped ? BEETLE_STATE.FLIPPED : BEETLE_STATE.WALK,
      phase: cycle * 0.3,
      facing: 1,
    });
    drawCreature(ctx, beetle, frame, scale, false, hd);
  },
  // Clinging and hammering: a pixel up into the brick on every blow.
  [CREATURE.WOODPECKER]: (ctx, frame, scale, hd) => {
    const { peckTicks, bobTicks } = gameConfig.creatures.woodpecker;
    const blow = frame % peckTicks < bobTicks ? 1 : 0;
    const bird = posed(CREATURE.WOODPECKER, AT, AT + 1 - blow, { state: WOODPECKER_STATE.CLING });
    drawCreature(ctx, bird, frame, scale, false, hd);
  },
  // A few segments up from its root, leaves in the breeze.
  [CREATURE.VINE]: still(CREATURE.VINE, () => ({ hitPoints: VINE_SEGMENTS })),
  [CREATURE.SLUG]: still(CREATURE.SLUG, (frame) => ({ facing: 1, clock: frame })),
  // Tips lit and trailing its own pulse.
  [CREATURE.JELLYFISH]: still(CREATURE.JELLYFISH, (frame) => ({ clock: frame })),
  [CREATURE.CRAB]: still(CREATURE.CRAB, () => ({ phase: CRAB_PIPS })),
  // The three forms stacked in the order a hit walks them: egg, hatchling,
  // wyvern — each bobbing on its own beat.
  [BESTIARY_BROOD]: (ctx, frame, scale, hd) => {
    const forms = gameConfig.observer.brood.forms;
    const widest = Math.max(...forms.map((form) => form.width));
    let y = AT;
    forms.forEach((form, index) => {
      const x = AT + (widest - form.width) / 2;
      const beast = {
        alive: true,
        x,
        y,
        form: index as BroodForm,
        direction: 1,
        bob: frame * form.bobRate + index,
        flashTicks: 0,
      };
      drawBeast(ctx, beast, frame, scale, false, hd);
      y += form.height + BROOD_GAP;
    });
  },
  [CREATURE.SPIDER_QUEEN]: (ctx, frame, scale, hd) => {
    const queen = posed(CREATURE.SPIDER_QUEEN, AT, AT + 4);
    drawCreature(ctx, queen, frame, scale, false, hd);
  },
  [CREATURE.MOTH_MOTHER]: still(CREATURE.MOTH_MOTHER),
  [CREATURE.FROG_KING]: hopping(CREATURE.FROG_KING, 8),
  [CREATURE.SNAIL_ELDER]: still(CREATURE.SNAIL_ELDER, () => ({ facing: 1 })),
};

/**
 * How many frames a portrait needs to show everything it ever covers — the
 * beetle's whole loop, which is the longest, so the trim holds for all of them.
 */
export const PORTRAIT_CYCLE = BEETLE_CYCLE;

/** Paint one portrait, at frame `frame`, onto a canvas `scale` times `PORTRAIT_ROOM`. */
export function paintCreaturePortrait(
  ctx: CanvasRenderingContext2D,
  kind: BestiaryKind,
  frame: number,
  scale: number,
  hd: boolean,
): void {
  PORTRAITS[kind](ctx, frame, scale, hd);
}
