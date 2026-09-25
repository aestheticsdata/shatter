import { gameConfig } from "@core/config/GameConfig";
import { mirrored } from "@entities/creatures/bitmap";
import { paintRows } from "@entities/creatures/species/frog";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * VINE (SHA-241): it roots where the level pinned it, climbs, and if it gets
 * to the wall it turns into wall.
 *
 * The first creature that is a *clock* rather than an obstacle. It does not
 * chase the ball, block it or answer it; it grows, at one segment every two
 * and a half seconds, and the only thing it asks of the player is that they
 * spend a shot on it before it arrives. Reaching the wall, it feeds itself in
 * — one brick up its own column per segment it grew, from the lowest hole
 * upward, in the green brick so what it leaves behind is visibly the vine and
 * not the wall the level was built with.
 *
 * **Where you cut it is the whole game.** `hitPoints` is not a health bar: it
 * is the segment count, and a hit sets it to however many segments were below
 * the cut. A touch at the tip costs it one and buys two and a half seconds; a
 * touch at the root ends it. Aim low — and that is legible off the shape
 * rather than off a number, which is why the vine is drawn as a stack of
 * segments and not as a bar.
 *
 * *It closes two holes in the framework.* `struck` now carries where the hit
 * landed, which eight species have no use for and simply do not declare; and
 * `Species.box?` overrides the fixed `width`/`height`, because a seedling with
 * a full column's hitbox would be struck out of the air a foot above itself.
 */
export const VINE_STATE = { GROW: "grow", COLUMN: "column" } as const;

const WIDTH = 7;
/**
 * One segment: the unit it grows by, the unit it is cut by and the unit it
 * lays by. Seven pixels is a little over half a brick's height, so a vine
 * arriving at the wall is visibly taller than the wall is thick.
 */
const SEGMENT = 7;

const ROOTED = "ROOTED";

/**
 * The growing tip, and the only part of it that bakes.
 *
 * A vine's body is its length, and length is state — so the sprite is the one
 * thing about it that never changes, which is the bud on the end. Everything
 * under the bud is drawn by `decorate`, the same split FROG makes at the hip.
 *
 * Three pixels wide at the top, seven across the bud, back to three at the
 * bottom so it hands off cleanly to the stalk drawn under it: the last two
 * rows here and the drawn segments are the same three columns.
 */
export const VINE_TIP: readonly string[] = [
  "..kkk..",
  ".kllhk.",
  "kkhhhkk",
  "khhhhhk",
  ".kkhkk.",
  "..khk..",
  "..khk..",
];

// The drawn segment, in two passes because `paintRows` paints one tone: the
// two outline columns, then the single column of body between them. Both are
// laid at `x + 2`, which is where the tip's last rows leave the stalk.
const STALK_EDGE: readonly string[] = ["x.x", "x.x", "x.x", "x.x", "x.x", "x.x", "x.x"];
const STALK_CORE: readonly string[] = [".x.", ".x.", ".x.", ".x.", ".x.", ".x.", ".x."];

// A blade, angled away and up from the stalk it comes off. Four by two is the
// smallest thing that still reads as a leaf rather than as a burr.
const LEAF_RIGHT: readonly string[] = [".xxx", "xxx."];
const LEAF_LEFT = mirrored(LEAF_RIGHT);

/** The bottom of the root segment, which is where the level pinned it. */
function footOf(creature: Creature): number {
  return creature.home.y + SEGMENT;
}

/** The grid column it stands in, and the one it lays into. */
function columnOf(creature: Creature): number {
  const { left, brickWidth } = gameConfig.grid;
  return Math.floor((creature.x + WIDTH / 2 - left) / brickWidth);
}

/**
 * Grown or cut, the root stays where it was pinned and the tip is what moves —
 * so the top-left the rest of the game reads is derived from the foot rather
 * than kept.
 *
 * Only true while it is growing. Once it is feeding itself into the wall the
 * *tip* is the anchor and the foot climbs, which is why `COLUMN` never calls
 * this: a vine being drawn into the wall should not drag its top back down
 * out of it.
 */
function reachUp(creature: Creature): void {
  creature.y = footOf(creature) - creature.hitPoints * SEGMENT;
}

export const VINE: Species = {
  kind: CREATURE.VINE,
  width: WIDTH,
  height: SEGMENT,
  get hitPoints() {
    return gameConfig.creatures.vine.hitPoints;
  },
  get points() {
    return gameConfig.creatures.vine.points;
  },
  get killPoints() {
    return gameConfig.creatures.vine.killPoints;
  },
  tip: "AIM LOW · CUT IT AT THE ROOT",
  lore: "IT TAKES ROOT ON THE BAND AND CLIMBS, A SEGMENT EVERY FEW SECONDS, REACHING FOR THE WALL. IF IT GETS THERE IT TURNS ITSELF INTO GREEN BRICKS AND FILLS THE HOLES YOU WORKED SO HARD FOR. WHERE YOU CUT IT IS ALL THAT MATTERS: SNIP THE TIP AND IT LOSES A SEGMENT. STRIKE THE ROOT AND IT IS FINISHED.",
  // **Not solid**, and not because a plant is soft: the framework's shelf
  // bounce is vertical only, which is the right physics for a beetle's back
  // and the wrong physics for a column. A ball that passed through a vine and
  // cut it still reads; a ball that bounced off the *top* of a thing eighty
  // pixels tall would read as a bug.
  solid: false,
  // One frame, on purpose. Everything that moves about a vine — its length,
  // its leaves in the breeze — is drawn live off state and off the field's own
  // clock, and a bud that also animated would be the one part of the plant
  // keeping a different time from the rest of it.
  frames: [VINE_TIP],
  frameTicks: 1,
  palette: { k: BRICK_COLORS["4"].dark, h: BRICK_COLORS["4"].flat, l: BRICK_COLORS["4"].light },
  demade: { k: canvasPalette.demakeInk, h: canvasPalette.demakeGround, l: canvasPalette.demakeGround },
  outline: "k",

  spawn(creature) {
    creature.state = VINE_STATE.GROW;
    reachUp(creature);
  },

  /** As tall as it has grown, and a segment wide of nothing. */
  box(creature) {
    return { width: WIDTH, height: creature.hitPoints * SEGMENT };
  },

  step(creature, sight, effects) {
    const knobs = gameConfig.creatures.vine;
    const { top, brickHeight, columns } = gameConfig.grid;

    if (creature.state === VINE_STATE.GROW) {
      if (creature.clock < knobs.growTicks) {
        return;
      }
      creature.clock = 0;
      creature.hitPoints += 1;
      reachUp(creature);
      if (creature.y > top + sight.wallRows * brickHeight) {
        return;
      }
      // It has arrived. The pop is here rather than at the end of the laying,
      // because *this* is the tick the player lost the race on — by the time
      // the bricks are up there is nothing left to tell them.
      creature.state = VINE_STATE.COLUMN;
      // Under the tip rather than over it, which is the one place on this
      // creature that is open air: its head is against the wall by now, and a
      // pop six pixels above it would print over the bricks it is about to
      // become.
      effects.pop(creature.x + WIDTH / 2, creature.y + SEGMENT + 2, ROOTED, true);
      return;
    }

    if (creature.clock < knobs.layTicks) {
      return;
    }
    creature.clock = 0;
    const column = columnOf(creature);
    if (column < 0 || column >= columns) {
      creature.alive = false;
      return;
    }
    // The lowest hole in its own column, looked for from the bottom every
    // time: a vine fills in what the player has already taken, from the floor
    // of the wall upward, and it does the looking itself rather than laying
    // into an occupied cell and letting the wall refuse it.
    let row = sight.wallRows - 1;
    while (row >= 0 && sight.standing(column, row)) {
      row -= 1;
    }
    // **Nothing to fill is a wait, not an end.** A vine that arrives at a
    // column the player has not touched would otherwise say `ROOTED` and
    // vanish having done nothing at all; instead it hangs there at full
    // length, and every brick taken out of that column from now on comes
    // straight back — until the player spends the shot they owe it.
    if (row < 0) {
      return;
    }
    effects.lay(column, row, knobs.layKind);
    // A segment spent per brick, so the stalk visibly shortens into the wall
    // while the wall grows down to meet it — and a vine cut halfway through
    // laying has that many fewer bricks left in it.
    creature.hitPoints -= 1;
    if (creature.hitPoints <= 0) {
      // It is finished, and finishing is not a kill: no burst, no score, no
      // stroke on the chart. It is simply not there any more, and what it did
      // is standing where it stood.
      creature.alive = false;
    }
  },

  /**
   * The cut, and the only thing in the bestiary that answers *where* rather
   * than *how often*: everything above the cut falls, and what is left is
   * what was under it.
   *
   * The hit point is already off by the time this runs, so the count here is
   * one short of what was standing — which is right for a hit at the tip and
   * wrong for every other one. The cut is therefore measured and set, not
   * subtracted from, and the two clamps catch a ball whose *centre* is past
   * either end of a box its corners were still inside.
   */
  struck(creature, _by, _effects, at) {
    const standing = creature.hitPoints + 1;
    const above = Math.floor((at.y - creature.y) / SEGMENT);
    creature.hitPoints = Math.max(0, Math.min(standing - 1, standing - 1 - above));
    if (creature.state === VINE_STATE.GROW) {
      reachUp(creature);
    }
    return false;
  },

  /**
   * The stalk under the bud, segment by segment, and a leaf off each one.
   *
   * The leaves alternate sides and lift on a wave that travels up the plant —
   * the field's own clock rather than the creature's, so every vine on the
   * level is in the same breeze instead of each one having private weather.
   */
  decorate(pixel, creature, frame, demade, unit) {
    const { swayTicks } = gameConfig.creatures.vine;
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const ink = canvasPalette.demakeInk;
    // The baked tip's two thresholds, kept by hand because this half of the
    // plant is drawn: `drawCreature` whites the whole bitmap above a half and
    // only the outline below it, so the stalk's edges — outline material — go
    // white for the whole flash exactly as the frog's legs do, and its core
    // and leaves, which are body, go white only while the body is.
    const struck = creature.flashTicks > 0;
    const hot = creature.flashTicks > gameConfig.creatures.flashTicks / 2;
    const white = canvasPalette.deathFlash;
    const edge = struck ? white : demade ? ink : BRICK_COLORS["4"].dark;
    const core = hot ? white : demade ? canvasPalette.demakeGround : BRICK_COLORS["4"].flat;
    // **Ink on the tube, where the rest of the body is ground**, per `demade`'s
    // own rule: outline *and detail* are what survives, and a leaf is detail.
    // Sent to ground with the stem's core it is a dark mark on a dark field and
    // the vine loses every leaf it has — which is the bat's face over again.
    const blade = hot ? white : demade ? ink : BRICK_COLORS["4"].light;
    // Counted down from the tip rather than up from the root, so segment 1 is
    // the one under the bud however short the vine has been cut.
    for (let below = 1; below < creature.hitPoints; below++) {
      const segment = y + below * SEGMENT;
      paintRows(pixel, STALK_EDGE, x + 2, segment, edge, unit);
      paintRows(pixel, STALK_CORE, x + 2, segment, core, unit);
      const right = below % 2 === 1;
      const lift = Math.round(Math.sin(frame / swayTicks + below));
      paintRows(pixel, right ? LEAF_RIGHT : LEAF_LEFT, right ? x + 4 : x - 1, segment + 2 + lift, blade, unit);
    }
  },
};
