import { gameConfig } from "@core/config/GameConfig";
import { Creatures } from "@entities/creatures/Creatures";
import { SPECIES } from "@entities/creatures/species";
import { BAT_STATE } from "@entities/creatures/species/bat";
import { CRAB_STATE } from "@entities/creatures/species/crab";
import { FIREFLY_LAMP } from "@entities/creatures/species/firefly";
import { FROG_STATE } from "@entities/creatures/species/frog";
import { JELLYFISH_STATE } from "@entities/creatures/species/jellyfish";
import { SPIDER_STATE } from "@entities/creatures/species/spider";
import { WOODPECKER_STATE } from "@entities/creatures/species/woodpecker";
import { BESTIARY_BROOD, CREATURE } from "@interfaces/creatures";
import { BLACKOUT_TORCH, deckBands, drawBeast, drawCreature, FIREFLY_TORCH, SLIME_TONES } from "@render/CanvasRenderer";
import { stageField } from "@render/capsuleScenes";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature } from "@entities/creatures/Creature";
import type { Beast, BroodForm } from "@entities/effects/Brood";
import type { BestiaryKind, CreatureKind } from "@interfaces/creatures";
import type { BrickKind } from "@interfaces/types";
import type { Field } from "@render/capsuleScenes";

/**
 * One picture per creature for the BESTIARY page (SHA-253): the real field,
 * with that creature doing the one thing it does.
 *
 * The CAPSULES page's idea and its `Field`, for the same reasons — a scene is
 * staged in field pixels and painted with the game's own sprites, so a leg
 * retouched on the field is retouched here with no second edit. The creatures
 * are born the way a level births them (`Creatures.add`, so each species' own
 * `spawn` runs) and then posed: a state, a place, a moment of its clock. What
 * they look like is theirs; only where they stand is authored.
 *
 * **The house's trace idiom, for things other than the ball.** A creature at a
 * third of its size is a few pixels across, so what it *does* is told by where
 * it was a moment ago — a pose at low alpha, a dotted line along its path —
 * the way a ball's traces say which way it is going.
 *
 * The bosses are staged on an empty field, because that is the only field they
 * are ever met on: the last brick is what brings them down.
 */
const FIELD_WIDTH = gameConfig.field.width;
const { left: GRID_LEFT, top: GRID_TOP, brickWidth: BRICK_WIDTH, brickHeight: BRICK_HEIGHT } = gameConfig.grid;
const DECK_Y = gameConfig.paddle.y;
const DECK_WIDTH = gameConfig.paddle.baseWidth;
const DECK_HOME = (FIELD_WIDTH - DECK_WIDTH) / 2;

// The rows `Field.wall()` lays by default, and the line under them.
const WALL_ROWS = 4;
const WALL_BOTTOM = GRID_TOP + WALL_ROWS * BRICK_HEIGHT;
const WALL_KINDS: readonly BrickKind[] = ["1", "2", "3", "4"];

// A path's dots, in field pixels. Three for `EDGE`'s reason in the capsule
// scenes: these pictures are blitted to a third, and a mark narrower than three
// comes out as a row of gaps.
const DOT = 3;
const PATH_TONE = canvasPalette.paddleTopSheen;

// The two alphas a pose from a moment ago is drawn at: the nearer, then the
// further. The ball's own trace steps, for the same read.
const NEAR = 0.35;
const FAR = 0.15;

// How far open the dark is round a struck firefly, as a multiple of its lit
// pool: a moment into the glow, with the iris still widening.
const GLOW_OPENING = 3;

// Something falling out of a creature: which pill it is does not matter, only
// that it is one, so it is the first thing a player learns to catch.
const PILL = "E";

type Point = { x: number; y: number };

/**
 * A creature born where a level would pin it, then posed.
 *
 * Born through `Creatures.add` rather than built here, so each species' own
 * `spawn` sets whatever it sets — a frog sitting, a spider's thread anchored —
 * and the pose only has to say what differs. The position is put back after,
 * because a slug's spawn moves it to the rail and a vine's to its own height,
 * and a scene says exactly where each one stands.
 */
function born(kind: CreatureKind, x: number, y: number, pose: Partial<Creature> = {}): Creature {
  const creature = new Creatures().add(kind, x, y);
  return Object.assign(creature, { x, y }, pose);
}

function hatched(form: BroodForm, x: number, y: number): Beast {
  return { alive: true, x, y, form, direction: 1, bob: 0, flashTicks: 0 };
}

/** Where a species' sprite goes to stand on a brick: centred on it, feet on its top edge. */
function onBrick(kind: CreatureKind, column: number, row: number): Point {
  const { width, height } = SPECIES[kind];
  return { x: GRID_LEFT + column * BRICK_WIDTH + (BRICK_WIDTH - width) / 2, y: GRID_TOP + row * BRICK_HEIGHT - height };
}

/** And to hang under one: centred, top edge to the brick's underside. */
function underBrick(kind: CreatureKind, column: number, row: number): Point {
  const { width } = SPECIES[kind];
  return { x: GRID_LEFT + column * BRICK_WIDTH + (BRICK_WIDTH - width) / 2, y: GRID_TOP + (row + 1) * BRICK_HEIGHT };
}

/** A dotted line along a path, `at(0)` to `at(1)`. */
function dotted(field: Field, at: (t: number) => Point, dots: number, alpha = NEAR): void {
  field.ghost(alpha, () => {
    for (let index = 0; index <= dots; index++) {
      const { x, y } = at(index / dots);
      field.rect(x - DOT / 2, y - DOT / 2, DOT, DOT, PATH_TONE);
    }
  });
}

/** Where a firefly's lantern burns, from its sprite's top-left: the pool centres here. */
function lampOf(at: Point): Point {
  return { x: at.x + FIREFLY_LAMP.x, y: at.y + FIREFLY_LAMP.y };
}

/** The ball, and two places on its way from `from`: which way it is going. */
function rally(field: Field, from: Point, ball: Point): void {
  field.trace(from.x, from.y, FAR);
  field.trace((from.x + ball.x) / 2, (from.y + ball.y) / 2, NEAR);
  field.ball(ball.x, ball.y);
}

type Painter = (field: Field) => void;

const SCENES: Record<BestiaryKind, Painter> = {
  // On its loop, having just been flown through: the ball passed it, and the
  // capsule it carried is on its way down.
  [CREATURE.MOTH]: (field) => {
    const { orbitX, orbitY } = gameConfig.creatures.moth;
    const { width, height } = SPECIES[CREATURE.MOTH];
    const centre = { x: 186, y: 150 };
    const onLoop = (angle: number): Point => ({
      x: centre.x + Math.cos(angle) * orbitX,
      y: centre.y + Math.sin(angle) * orbitY,
    });
    field.wall();
    dotted(field, (t) => onLoop(t * Math.PI * 2), 28);
    const at = onLoop(0.4);
    const moth = { x: at.x - width / 2, y: at.y - height / 2 };
    for (const [angle, alpha] of [
      [-1.4, FAR],
      [-0.6, NEAR],
    ] as const) {
      const was = onLoop(angle);
      field.ghost(alpha, () => field.creature(born(CREATURE.MOTH, was.x - width / 2, was.y - height / 2)));
    }
    field.capsule(moth.x - 14, moth.y + 18, PILL);
    rally(field, { x: moth.x + 8, y: moth.y + 30 }, { x: moth.x + 4, y: moth.y - 16 });
    field.creature(born(CREATURE.MOTH, moth.x, moth.y));
    field.deck();
  },
  // On its road along the top of the wall: the silver behind it mended whole,
  // the silver ahead still cracked.
  [CREATURE.SNAIL]: (field) => {
    const column = 5;
    field.wall(["S", ...WALL_KINDS.slice(1)]);
    for (let ahead = column + 1; ahead < gameConfig.grid.columns; ahead++) {
      field.chipped(ahead, 0, "S", 1);
    }
    const seat = onBrick(CREATURE.SNAIL, column, 0);
    field.creature(born(CREATURE.SNAIL, seat.x, seat.y, { facing: 1 }));
    field.ball(96, 190);
    field.deck();
  },
  // Dropped down its thread through the mouth in the wall, and the ball that
  // came up under it sent back down.
  [CREATURE.SPIDER]: (field) => {
    const column = 6;
    field.wall();
    for (let row = 0; row < WALL_ROWS; row++) {
      field.clear(column, row);
    }
    const home = onBrick(CREATURE.SPIDER, column, 0);
    const spider = born(CREATURE.SPIDER, home.x, 172, {
      state: SPIDER_STATE.DROP,
      home: { x: home.x, y: gameConfig.field.top + 5 },
    });
    rally(field, { x: 172, y: 240 }, { x: home.x + 2, y: 186 });
    field.creature(spider);
    field.deck();
  },
  // Off its brick the moment the ball came near, and in the air — the one
  // place it dies of a single hit.
  [CREATURE.FROG]: (field) => {
    const { leapHeight } = gameConfig.creatures.frog;
    const { width, height } = SPECIES[CREATURE.FROG];
    // Two rows down, so the arc has sky to climb into.
    const top = 2;
    field.wall(WALL_KINDS, 0, top);
    const from = onBrick(CREATURE.FROG, 2, top);
    const to = onBrick(CREATURE.FROG, 8, top);
    const onArc = (t: number): Point => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y - leapHeight * 4 * t * (1 - t),
    });
    dotted(
      field,
      (t) => {
        const at = onArc(t);
        return { x: at.x + width / 2, y: at.y + height / 2 };
      },
      14,
    );
    field.ghost(NEAR, () => field.creature(born(CREATURE.FROG, from.x, from.y)));
    rally(field, { x: 20, y: 6 }, { x: 44, y: 34 });
    const leap = onArc(0.42);
    field.creature(born(CREATURE.FROG, leap.x, leap.y, { state: FROG_STATE.LEAP, facing: 1 }));
    field.deck();
  },
  // Woken out of its roost under the wall, and off on a flight that is not a
  // curve.
  [CREATURE.BAT]: (field) => {
    const { width } = SPECIES[CREATURE.BAT];
    field.wall();
    const roost = underBrick(CREATURE.BAT, 3, WALL_ROWS - 1);
    const flight = { x: 176, y: 134 };
    dotted(
      field,
      (t) => ({
        x: roost.x + width / 2 + (flight.x - roost.x) * t,
        y: roost.y + 12 + (flight.y - roost.y) * t + Math.sin(t * Math.PI * 3) * 8,
      }),
      12,
    );
    field.ghost(NEAR, () => field.creature(born(CREATURE.BAT, roost.x, roost.y)));
    rally(field, { x: roost.x, y: roost.y + 14 }, { x: 80, y: 156 });
    field.creature(born(CREATURE.BAT, flight.x, flight.y, { state: BAT_STATE.FLIT, facing: 1 }));
    field.deck();
  },
  // Out in the field, where the ball has just gone clean through it without
  // either of them noticing — and a bolt from the deck on its way up.
  [CREATURE.WISP]: (field) => {
    const wisp = { x: 200, y: 150 };
    const deckX = wisp.x + 2 - 5;
    field.wall();
    field.ghost(FAR, () => field.creature(born(CREATURE.WISP, 150, 176)));
    field.ghost(NEAR, () => field.creature(born(CREATURE.WISP, 174, 166)));
    rally(field, { x: 180, y: 110 }, { x: 218, y: 186 });
    field.creature(born(CREATURE.WISP, wisp.x, wisp.y));
    field.deck(DECK_WIDTH, deckX);
    field.rect(deckX + 5, DECK_Y - 3, 2, 3, canvasPalette.laserCannon);
    field.rect(deckX + DECK_WIDTH - 7, DECK_Y - 3, 2, 3, canvasPalette.laserCannon);
    field.rect(deckX + 5, wisp.y + SPECIES[CREATURE.WISP].height + 3, 2, 12, canvasPalette.laserShot);
  },
  // The lights out, and the hit that brings them back: the ball on the lamp
  // at the top of its blink, and the dark opening out from it through the
  // iris the lights always come back through. A second firefly, down to its
  // ember, is the lamp still left.
  [CREATURE.FIREFLY]: (field) => {
    const { blinkTicks, litShare } = gameConfig.creatures.firefly;
    const lit = { x: 122, y: 112 };
    const ember = { x: 286, y: 150 };
    field.wall();
    field.deck();
    // Phase 0 and a clock half way through the lit share is the top of the
    // blink; past the share is the ember.
    field.creature(born(CREATURE.FIREFLY, lit.x, lit.y, { phase: 0, clock: (blinkTicks * litShare) / 2 }));
    field.creature(born(CREATURE.FIREFLY, ember.x, ember.y, { phase: 0, clock: blinkTicks * (litShare + 0.2) }));
    rally(field, { x: 84, y: 196 }, { x: lit.x + 2, y: lit.y + 10 });
    field.blackout([
      { ...lampOf(lit), radius: FIREFLY_TORCH.blinkRadius * GLOW_OPENING, peak: 1 },
      { ...lampOf(ember), radius: FIREFLY_TORCH.emberRadius, peak: FIREFLY_TORCH.emberPeak },
      {
        x: FIELD_WIDTH / 2,
        y: DECK_Y + gameConfig.paddle.height / 2,
        radius: BLACKOUT_TORCH.paddleRadius,
        peak: BLACKOUT_TORCH.paddlePeak,
      },
    ]);
  },
  // The ladder, left to right on the band: an egg, what it hatches into, and
  // what that becomes — each hit a step along it.
  [BESTIARY_BROOD]: (field) => {
    const forms = gameConfig.observer.brood.forms;
    const band = [
      { x: 44, y: 206 },
      { x: 152, y: 200 },
      { x: 264, y: 192 },
    ] as const;
    field.wall(WALL_KINDS.slice(0, 3));
    for (let step = 0; step < band.length - 1; step++) {
      const from = band[step];
      const to = band[step + 1];
      const fromForm = forms[step];
      const toForm = forms[step + 1];
      dotted(
        field,
        (t) => ({
          x: from.x + fromForm.width + 8 + (to.x - 8 - from.x - fromForm.width - 8) * t,
          y: from.y + fromForm.height / 2 + (to.y + toForm.height / 2 - from.y - fromForm.height / 2) * t,
        }),
        4,
      );
    }
    band.forEach((at, form) => field.beast(hatched(form as BroodForm, at.x, at.y)));
    rally(field, { x: 70, y: 142 }, { x: 50, y: 192 });
    field.deck();
  },
  // On its lane, shell up, and the ball coming at it from below — the one
  // side of it the shell is not on.
  [CREATURE.BEETLE]: (field) => {
    const beetle = { x: 170, y: 160 };
    field.wall();
    rally(field, { x: 158, y: 236 }, { x: beetle.x + 4, y: beetle.y + SPECIES[CREATURE.BEETLE].height + 5 });
    field.creature(born(CREATURE.BEETLE, beetle.x, beetle.y, { facing: 1 }));
    field.deck();
  },
  // Under the wall and hammering upward, with the notch it has already opened
  // beside it and the chips coming down.
  [CREATURE.WOODPECKER]: (field) => {
    const column = 6;
    const row = WALL_ROWS - 1;
    field.wall();
    field.clear(column - 1, row);
    field.clear(column - 2, row);
    field.clear(column - 1, row - 1);
    const cling = underBrick(CREATURE.WOODPECKER, column, row);
    // Two pixels up into the brick, and one more on the blow.
    field.creature(born(CREATURE.WOODPECKER, cling.x, cling.y - 3, { state: WOODPECKER_STATE.CLING }));
    const chip = WALL_KINDS[row];
    for (const [x, y] of [
      [cling.x - 6, WALL_BOTTOM + 18],
      [cling.x + 12, WALL_BOTTOM + 28],
      [cling.x + 2, WALL_BOTTOM + 42],
    ] as const) {
      field.rect(x, y, DOT, DOT, BRICK_COLORS[chip].flat);
    }
    field.ball(96, 190);
    field.deck();
  },
  // Grown most of the way up from its root to the wall, and the ball heading
  // for the root — the cut that ends it.
  [CREATURE.VINE]: (field) => {
    const { width, height: segment } = SPECIES[CREATURE.VINE];
    const column = 5;
    const foot = 236;
    const segments = 18;
    const x = GRID_LEFT + column * BRICK_WIDTH + Math.round((BRICK_WIDTH - width) / 2);
    field.wall();
    rally(field, { x: 110, y: 184 }, { x: x - 12, y: foot - segment - 2 });
    field.creature(
      born(CREATURE.VINE, x, foot - segments * segment, {
        hitPoints: segments,
        home: { x, y: foot - segment },
      }),
    );
    field.deck();
  },
  // On the rail with its trail behind it, fresh to dry, and the deck carried
  // along the slick past where it was pointed.
  [CREATURE.SLUG]: (field) => {
    const slug = { x: 150, y: DECK_Y + 4 - SPECIES[CREATURE.SLUG].height };
    const deckX = 244;
    const film = DECK_Y + 4;
    field.wall();
    for (const [from, to, tone] of [
      [slug.x + 2, 214, 0],
      [214, 286, 1],
      [286, 348, 2],
    ] as const) {
      field.rect(from, film, to - from, 2, SLIME_TONES[tone]);
    }
    field.creature(born(CREATURE.SLUG, slug.x, slug.y, { facing: -1 }));
    field.ghost(FAR, () => field.deck(DECK_WIDTH, deckX + 36));
    field.ghost(NEAR, () => field.deck(DECK_WIDTH, deckX + 18));
    field.deck(DECK_WIDTH, deckX);
    field.ball(256, 190);
  },
  // Down out of the wall and over the rail, tips lit, and the deck under it
  // already wearing the sting.
  [CREATURE.JELLYFISH]: (field) => {
    const { width, height } = SPECIES[CREATURE.JELLYFISH];
    const x = DECK_HOME + DECK_WIDTH / 2 - width / 2;
    field.wall();
    field.ghost(FAR, () => field.creature(born(CREATURE.JELLYFISH, x - 16, 132)));
    field.ghost(NEAR, () => field.creature(born(CREATURE.JELLYFISH, x - 8, 196)));
    field.ball(90, 170);
    field.tintedDeck(deckBands(false, false, 0, 1));
    field.creature(born(CREATURE.JELLYFISH, x, DECK_Y + 1 - height, { state: JELLYFISH_STATE.HOVER }));
  },
  // Walking the band with three of your capsules on its back, and a fourth
  // falling into its claws.
  [CREATURE.CRAB]: (field) => {
    const crab = { x: 170, y: 214 };
    field.wall();
    field.capsule(crab.x - 2, crab.y - 16, PILL);
    field.creature(born(CREATURE.CRAB, crab.x, crab.y, { state: CRAB_STATE.STALK, phase: 3, facing: 1 }));
    field.ball(96, 150);
    field.deck();
  },
  // Down her thread from the ceiling onto the deck, and the deck gone to stone
  // under her.
  [CREATURE.SPIDER_QUEEN]: (field) => {
    const { width, height } = SPECIES[CREATURE.SPIDER_QUEEN];
    const x = DECK_HOME + DECK_WIDTH / 2 - width / 2;
    field.ghost(FAR, () => field.creature(born(CREATURE.SPIDER_QUEEN, x, 70)));
    field.ghost(NEAR, () => field.creature(born(CREATURE.SPIDER_QUEEN, x, 160)));
    field.ball(84, 150);
    field.tintedDeck(deckBands(false, false, 1));
    field.creature(born(CREATURE.SPIDER_QUEEN, x, DECK_Y - height));
  },
  // On her figure of eight, the ball through her, and two of the capsules she
  // has already shaken out on their way down.
  [CREATURE.MOTH_MOTHER]: (field) => {
    const { centreY, reachX, reachY } = gameConfig.creatures.mothMother;
    const { width, height } = SPECIES[CREATURE.MOTH_MOTHER];
    const onEight = (t: number): Point => ({
      x: FIELD_WIDTH / 2 + Math.sin(t) * reachX,
      y: centreY + Math.sin(t) * Math.cos(t) * reachY * 2,
    });
    dotted(field, (t) => onEight(t * Math.PI * 2), 40);
    for (const [t, dropped] of [
      [0.2, 96],
      [0.5, 36],
    ] as const) {
      const was = onEight(t);
      field.capsule(was.x - 10, was.y + dropped, PILL);
    }
    const at = onEight(0.9);
    rally(field, { x: at.x - 30, y: at.y + 70 }, { x: at.x - 10, y: at.y + height / 2 + 2 });
    field.creature(born(CREATURE.MOTH_MOTHER, at.x - width / 2, at.y - height / 2));
    field.deck();
  },
  // In the air between two thuds — the only place he is soft — and the ball
  // coming up to meet him there.
  [CREATURE.FROG_KING]: (field) => {
    const { leapHeight } = gameConfig.creatures.frogKing;
    const { width, height } = SPECIES[CREATURE.FROG_KING];
    const floor = gameConfig.observer.tears.floorY - height;
    const from = 40;
    const to = 250;
    const onArc = (t: number): Point => ({
      x: from + (to - from) * t,
      y: floor - leapHeight * 4 * t * (1 - t),
    });
    dotted(
      field,
      (t) => {
        const at = onArc(t);
        return { x: at.x + width / 2, y: at.y + height / 2 };
      },
      18,
    );
    field.ghost(NEAR, () => field.creature(born(CREATURE.FROG_KING, from, floor, { state: FROG_STATE.SIT })));
    const leap = onArc(0.45);
    rally(field, { x: leap.x - 4, y: leap.y + height + 60 }, { x: leap.x + 8, y: leap.y + height + 4 });
    field.creature(born(CREATURE.FROG_KING, leap.x, leap.y, { state: FROG_STATE.LEAP, facing: 1 }));
    field.deck();
  },
  // Upside down along the ceiling, and the top row laid back under every
  // column he has passed.
  [CREATURE.SNAIL_ELDER]: (field) => {
    const { layKind } = gameConfig.creatures.snailElder;
    const { width } = SPECIES[CREATURE.SNAIL_ELDER];
    const x = 186;
    const passed = Math.floor((x + width / 2 - GRID_LEFT) / BRICK_WIDTH);
    for (let column = 0; column < passed; column++) {
      field.brick(column, 0, layKind);
    }
    field.creature(born(CREATURE.SNAIL_ELDER, x, gameConfig.field.top + 1, { facing: 1 }));
    field.ball(120, 170);
    field.deck();
  },
};

/**
 * Paint one creature's field, at field size, ready to be blitted down — the
 * CAPSULES page's `paintCapsuleScene`, for the BESTIARY.
 */
export function paintCreatureScene(ctx: CanvasRenderingContext2D, kind: BestiaryKind, hd = false): void {
  SCENES[kind](stageField(ctx, hd));
}

/**
 * The creature at rest, for its portrait over the scene's corner: the pose it
 * spends its life in. Most are simply born; the rest say what differs — a
 * woodpecker clinging rather than in its one second of flight, a vine a few
 * segments tall rather than a bud, a firefly lit, a crab with something on it.
 */
const PORTRAIT_POSE: Readonly<Partial<Record<CreatureKind, Partial<Creature>>>> = {
  [CREATURE.WOODPECKER]: { state: WOODPECKER_STATE.CLING },
  [CREATURE.VINE]: { hitPoints: 3 },
  [CREATURE.FIREFLY]: {
    phase: 0,
    clock: (gameConfig.creatures.firefly.blinkTicks * gameConfig.creatures.firefly.litShare) / 2,
  },
  [CREATURE.CRAB]: { phase: 2 },
  [CREATURE.FROG_KING]: { state: FROG_STATE.SIT },
};

/**
 * Paint one creature at `(x, y)` on a canvas `scale` times the field — the
 * portrait, drawn by the renderer's own brushes with nothing under it. The
 * brood's portrait is its last form, the one that dies and pays.
 *
 * Not through `Field`, whose fine grid is tied to its scale: a portrait is
 * backed at `SCALE` in both arts, like the CAPSULES page's pill, and `hd` is
 * what decides which recipe it wears.
 */
export function paintCreaturePortrait(
  ctx: CanvasRenderingContext2D,
  kind: BestiaryKind,
  x: number,
  y: number,
  scale: number,
  hd: boolean,
): void {
  if (kind === BESTIARY_BROOD) {
    drawBeast(ctx, hatched(2, x, y), 0, scale, false, hd);
    return;
  }
  drawCreature(ctx, born(kind, x, y, PORTRAIT_POSE[kind]), 0, scale, false, hd);
}
