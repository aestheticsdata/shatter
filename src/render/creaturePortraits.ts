import { gameConfig } from "@core/config/GameConfig";
import { Creatures } from "@entities/creatures/Creatures";
import { BAT_STATE } from "@entities/creatures/species/bat";
import { BEETLE_STATE } from "@entities/creatures/species/beetle";
import { FROG_STATE } from "@entities/creatures/species/frog";
import { WOODPECKER_STATE } from "@entities/creatures/species/woodpecker";
import { BESTIARY_BROOD, CREATURE } from "@interfaces/creatures";
import { drawBeast, drawCreature } from "@render/CanvasRenderer";

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
// How tall the vine is grown, and how much the crab is carrying.
const VINE_SEGMENTS = 5;
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

const PORTRAITS: Record<BestiaryKind, Portrait> = {
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
