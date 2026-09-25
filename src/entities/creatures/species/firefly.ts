import { gameConfig } from "@core/config/GameConfig";
import { paintRows } from "@entities/creatures/species/frog";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * FIREFLY (SHA-243): the light you need, and the score that asks you to put it
 * out.
 *
 * It drifts round its pin blinking, and on a lit level that is the whole of it
 * — a small pretty creature worth a brick and a half. Under a blackout it is
 * the only thing you can see by, because a firefly is another pool of light in
 * the system BLACKOUT's torches and THE MOTH MOTHER's dust already share. That
 * is why this species needs **no dark-level flag and no new level property**:
 * the dark it answers is the dark the game already has, and the same three pins
 * are decoration or salvation depending on what the player caught.
 *
 * **The trade is the species.** A hit lights the whole field for about a
 * second — and a firefly has one hit point, so the hit that buys the light is
 * the hit that takes the lamp. Killing them all pays four times a brick and
 * leaves a dark level dark for good. They are the lamps, and the score is the
 * bait.
 */
export const FIREFLY_STATE = { DRIFT: "drift" } as const;

const WIDTH = 7;
/**
 * Nine, of which the sprite is seven: the last two rows are the lantern, and
 * they are blank in both frames on purpose.
 *
 * The blink is per-creature state — three fireflies on a level must not flash
 * in unison — and `drawCreature` picks its frame off the field's own clock, so
 * a baked lantern would be a level of fireflies strobing together. The body
 * bakes, the light is drawn, and the two rows the bitmap leaves empty are
 * where `decorate` puts it.
 */
const HEIGHT = 9;

// Wings out: antennae, a warm shield behind the head, and two cases split by
// the dark seam every beetle is drawn by.
const WINGS_OUT: readonly string[] = [
  "..k.k..",
  "..kkk..",
  ".kbbbk.",
  "kwwkwwk",
  "kwwkwwk",
  ".kwkwk.",
  "..kkk..",
  ".......",
  ".......",
];

// And in, which is the only thing the two frames differ by: a firefly's read
// is its lantern, and a body doing something of its own up there would be
// competing with it.
const WINGS_IN: readonly string[] = [
  "..k.k..",
  "..kkk..",
  ".kbbbk.",
  ".kwkwk.",
  ".kwkwk.",
  ".kwkwk.",
  "..kkk..",
  ".......",
  ".......",
];

// The lantern under the tail: a bar and the point it tapers to.
const LANTERN: readonly string[] = ["xxx", ".x."];

// And what it throws when it fires — one step further out on each side and one
// under the point, which is a glow's falloff in the only three pixels there is
// room for.
const HALO: readonly string[] = ["x...x", ".x.x.", "..x.."];

/** Where the lantern burns, from the sprite's top-left. The pool centres here. */
export const FIREFLY_LAMP = { x: 3.5, y: 8 } as const;

/**
 * How lit its lantern is this tick, 0 to 1.
 *
 * Exported because the renderer punches this creature's pool of light out of
 * the blackout veil and has to breathe with it: a lantern at its peak over a
 * pool at its ember would be two lights disagreeing about one creature. The
 * species owns the blink; everything that draws it asks here.
 *
 * A short rise and fall and then a longer wait, offset per creature — so a
 * level's fireflies blink across each other rather than on one beat, which is
 * the difference between a meadow and a strobe.
 */
export function fireflyLantern(creature: Creature): number {
  const { blinkTicks, litShare } = gameConfig.creatures.firefly;
  const cycle = (creature.clock / blinkTicks + creature.phase) % 1;
  if (cycle >= litShare) {
    return 0;
  }
  return Math.sin((cycle / litShare) * Math.PI);
}

export const FIREFLY: Species = {
  kind: CREATURE.FIREFLY,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.firefly.hitPoints;
  },
  get points() {
    return gameConfig.creatures.firefly.points;
  },
  get killPoints() {
    return gameConfig.creatures.firefly.killPoints;
  },
  blurb: "A HIT LIGHTS UP THE DARK FIELD",
  // A ball goes through it, as it does through everything in the bestiary that
  // flies. Nothing this small is a shelf.
  solid: false,
  frames: [WINGS_OUT, WINGS_IN],
  frameTicks: 5,
  // A beetle: near-black outline, stone-grey wing cases, one warm mark on the
  // shield behind the head. Deliberately dull, and the warm mark deliberately
  // small — the creature is a silhouette and the lantern under it is the only
  // thing on a firefly meant to catch the eye.
  palette: { k: BRICK_COLORS.R.dark, w: BRICK_COLORS.R.flat, b: BRICK_COLORS["2"].dark },
  // Cases to ground, outline and shield to ink: what survives the tube.
  demade: {
    k: canvasPalette.demakeInk,
    w: canvasPalette.demakeGround,
    b: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    creature.state = FIREFLY_STATE.DRIFT;
    // Where on its blink it starts, in turns, off its own pin — so the level's
    // author can see that three pins are three different beats and two
    // fireflies are never lit at once by accident.
    creature.phase = ((creature.home.x * 7 + creature.home.y * 13) % 360) / 360;
  },

  /**
   * A lazy figure round the pin the level put it on, not a wander off it.
   *
   * The moth orbits the eye and the wisp goes wherever its heading takes it;
   * this one stays home, because it is a *lamp*. A level's dark is planned
   * around where its lights are, and a light that drifted off across the field
   * would be a level the author cannot light on purpose.
   *
   * Two periods with no common multiple, which is the house's idiom for a path
   * that never closes into a lap.
   */
  step(creature) {
    const { driftX, driftY, driftTicks, bobTicks } = gameConfig.creatures.firefly;
    const { left, right, top } = gameConfig.field;
    const turn = Math.PI * 2;
    const x = creature.home.x + Math.sin((creature.clock / driftTicks + creature.phase) * turn) * driftX;
    const y = creature.home.y + Math.sin((creature.clock / bobTicks + creature.phase) * turn) * driftY;
    creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, x));
    creature.y = Math.max(top + 1, Math.min(gameConfig.paddle.y - HEIGHT - 4, y));
  },

  /**
   * The flash, and the end of it in the same tick.
   *
   * `glow` holds the dark off however it was made — a caught BLACKOUT, a moth
   * mother's dust — and it runs back out through the same iris, so what the
   * player sees is the lights coming up and going down rather than a switch.
   * One hit point means this is also the kill: the field is lit for a second
   * and one lamp fewer comes back.
   *
   * False rather than true, and not for want of dying: the hit point is what
   * kills it, and a species that claimed the kill itself would go on dying to a
   * first hit if `hitPoints` were ever raised past one.
   */
  struck(creature, _by, effects) {
    effects.glow(gameConfig.creatures.firefly.glowTicks);
    return false;
  },

  /**
   * The lantern, and the rays when it fires.
   *
   * Three tones rather than a fade, and the halo's is the core's own previous
   * step — which is what a glow falling off actually looks like on a palette of
   * whole pixels, and is legible at 7 px across where a blend would be mush.
   *
   * No flash branch: a firefly dies on the hit that lights the field, so there
   * is never a frame where it is both struck and drawn.
   */
  decorate(pixel, creature, _frame, demade, unit) {
    const { emberAt, haloAt } = gameConfig.creatures.firefly;
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const lit = fireflyLantern(creature);
    const ink = canvasPalette.demakeInk;
    const core = lit > haloAt ? BRICK_COLORS["4"].light : lit > emberAt ? BRICK_COLORS.F.light : BRICK_COLORS.F.flat;
    // **On the tube there is no dim.** A one-bit screen has no ember, so the
    // demade firefly simply ends at its tail between blinks and grows a lit one
    // when it fires — which is the truest thing a wireframe can say about a
    // light that is off, and it makes the blink read on a screen that cannot
    // say "brighter".
    if (!demade || lit > emberAt) {
      paintRows(pixel, LANTERN, x + 2, y + 7, demade ? ink : core, unit);
    }
    if (lit > haloAt) {
      paintRows(pixel, HALO, x + 1, y + 7, demade ? ink : BRICK_COLORS.F.light, unit);
    }
  },
};
