import { gameConfig } from "@core/config/GameConfig";
import { mirrored } from "@entities/creatures/bitmap";
import { paintRows } from "@entities/creatures/species/frog";
import { cellUnder, pickCell, underCell, undersideCells } from "@entities/creatures/wall";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * BAT (SHA-238): it sleeps under the wall, and a hit wakes it into five
 * seconds of flight that is not a curve.
 *
 * The first creature that does not want anything from you. A moth orbits, a
 * frog dodges, a spider answers the ball — a bat is asleep, and stays asleep,
 * and is worth points to anyone willing to wake a thing that then becomes hard
 * to hit. Three hit points and the first one only opens its eyes: the two that
 * kill have to catch it mid-flit.
 *
 * **Two kinds of choice, two mechanisms.** Where it hangs next is a discrete
 * pick among the cells that have a brick above and nothing below, and it uses
 * `Math.random()` exactly as FROG's `pickBrick` picks its next seat. The
 * flight *path* is a sum of sines at rates that share no period, because a
 * per-frame `random()` is jitter rather than flight — the moth's wobble is the
 * house's idiom for a wandering curve and this is that idiom with a bigger
 * amplitude and no centre to come back to.
 */
export const BAT_STATE = { HANG: "hang", FLIT: "flit" } as const;

const WIDTH = 10;
const HEIGHT = 12;

/**
 * The body alone: ears, head, the closed eyes and the feet. The wings are not
 * in here, and that is the whole design.
 *
 * `drawCreature` picks the frame off the field's clock —
 * `frameCount / frameTicks` — so a species cannot choose a frame by state. A
 * bat asleep has to be *still*, which no frame on a clock can be. So the body
 * is the part that is the same asleep and awake and it bakes; the wings are a
 * function of state and of a flap phase this species owns, and they are drawn
 * live through `decorate`, which is the same split FROG makes at the hip.
 *
 * **Drawn head-down**, which is the pose it is in for all but five seconds at
 * a time. Feet at the top so it grips the brick it hangs from, ears at the
 * bottom pointing away from it: the iconic roosting silhouette, and the only
 * way round that attaches to anything — head-up, the ears run into the brick
 * and the bat reads as hanging by them. It keeps that body in flight rather
 * than righting itself, because the flit is the rarer half and a bat in
 * erratic flight is read off its beat, not off which way its ears point.
 */
export const BAT_BODY: readonly string[] = [
  "...kllk...",
  "...kbbk...",
  "..kbbbbk..",
  ".kbbbbbbk.",
  ".kblbblbk.",
  ".kblbblbk.",
  ".kbbbbbbk.",
  "..kbbbbk..",
  ".kbllllbk.",
  ".kl.ll.lk.",
  "kbll..llbk",
  "kb......bk",
];

// Wrapped round itself, hugging the body's free columns: the sleeping wing.
const WING_FOLDED_RIGHT: readonly string[] = ["xx", "xx", "xx", "xx", "xx", "x."];
const WING_FOLDED_LEFT: readonly string[] = mirrored(WING_FOLDED_RIGHT);

// The beat, out to the right; the left is this mirrored. One tone rather than
// a membrane inside an outline — a wing is a silhouette at this size, and a
// lighter interior only muddies the shape it is read by.
const WING_DOWN: readonly string[] = ["xxxxxx.", "xxxxxxx", ".xxxxxx", "..xxxxx", "...xxxx", "....xx."];
const WING_UP: readonly string[] = ["....xx.", "...xxxx", "..xxxxx", ".xxxxxx", "xxxxxxx", "xxxxxx."];

const WING_LEFT_DOWN = mirrored(WING_DOWN);
const WING_LEFT_UP = mirrored(WING_UP);

// Where the wings hinge on the body, and how far out they reach from it.
// Row 3 hanging head-down is the chest, two rows under the feet.
const SHOULDER = 3;
const WING_SPAN = WING_DOWN[0].length;

/**
 * The wander, as a velocity rather than an offset. Two sines a piece at rates
 * with no common period, so the path never repeats inside a flit and never
 * settles into the orbit a single rate would draw. Added to the travel speed,
 * not integrated on top of the position: an offset would walk the bat off its
 * own course a pixel at a time.
 */
function wander(clock: number): { x: number; y: number } {
  return {
    x: Math.sin(clock * 0.11) * 0.9 + Math.sin(clock * 0.037 + 1.7) * 0.6,
    y: Math.cos(clock * 0.083) * 0.8 + Math.sin(clock * 0.029 + 0.6) * 0.5,
  };
}

export const BAT: Species = {
  kind: CREATURE.BAT,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.bat.hitPoints;
  },
  get points() {
    return gameConfig.creatures.bat.points;
  },
  get killPoints() {
    return gameConfig.creatures.bat.killPoints;
  },
  // Passed through like the moth. A shelf asleep under the wall would re-route
  // every rally on the level whether or not the player ever touched it.
  solid: false,
  // One frame: the body does not animate, and what does is in `decorate`.
  frames: [BAT_BODY],
  frameTicks: 12,
  // The rock brick's three — brown-grey leather, and deliberately not the
  // moth's silver, since the two share the air on later levels. Nothing
  // yellow: the house keeps that colour for what pays.
  palette: {
    k: BRICK_COLORS.R.dark,
    b: BRICK_COLORS.R.flat,
    l: BRICK_COLORS.R.light,
  },
  // Outline, claws, fold lines and face to ink; the leather between them to
  // ground. The moth's mapping and for the moth's reason: a body sent wholly
  // to ground leaves a ten-pixel creature as a spindly wireframe on the tube,
  // where the moth's big wings can carry a hollow and this cannot. What comes
  // back is an outlined bat with a lit face and two creases down its back.
  demade: {
    k: canvasPalette.demakeInk,
    b: canvasPalette.demakeGround,
    l: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    creature.state = BAT_STATE.HANG;
    // Read off the pin, so two bats on one level never beat in time.
    creature.phase = creature.home.x;
  },

  step(creature, sight) {
    if (creature.state === BAT_STATE.HANG) {
      creature.x = creature.home.x;
      creature.y = creature.home.y;
      return;
    }
    const { flitTicks, flitSpeed } = gameConfig.creatures.bat;
    const { left, right, top } = gameConfig.field;
    const drift = wander(creature.clock);
    creature.x += creature.vx * flitSpeed + drift.x;
    creature.y += creature.vy * flitSpeed + drift.y;
    // The ceiling and the deck's own line are the box it flies in; a bat that
    // reached the rail would be a creature the player cannot answer.
    const floor = gameConfig.paddle.y - HEIGHT - 4;
    if (creature.x < left + 1 || creature.x > right - 1 - WIDTH) {
      creature.vx = -creature.vx;
      creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x));
    }
    if (creature.y < top + 1 || creature.y > floor) {
      creature.vy = -creature.vy;
      creature.y = Math.max(top + 1, Math.min(floor, creature.y));
    }
    creature.facing = creature.vx < 0 ? -1 : 1;
    if (creature.clock < flitTicks) {
      return;
    }
    // Anywhere but the brick it woke from: "it hangs somewhere else" is the
    // whole point of waking it, and a bat that went back to the same cell
    // would make the shot look like it did nothing.
    const roost = pickCell(undersideCells(sight), cellUnder(creature.home, WIDTH));
    if (roost === null) {
      // Nowhere to hang: stay up and try again in another five seconds.
      creature.clock = 0;
      return;
    }
    creature.home = underCell(roost.column, roost.row, WIDTH);
    creature.state = BAT_STATE.HANG;
    creature.clock = 0;
  },

  /**
   * The first hit wakes it and nothing more; after that it is a target like
   * any other, and each hit buys the five seconds again — a bat struck at the
   * end of a flit that went straight back to sleep would punish the player for
   * landing the shot.
   */
  struck(creature) {
    const { flitSpeed } = gameConfig.creatures.bat;
    if (creature.state === BAT_STATE.HANG) {
      creature.state = BAT_STATE.FLIT;
      // Off in the direction it was facing, with a little lift: a woken bat
      // drops out of its roost before it climbs.
      creature.vx = creature.phase % 2 < 1 ? 1 : -1;
      creature.vy = gameConfig.creatures.bat.riseSpeed / flitSpeed;
    }
    creature.clock = 0;
    return false;
  },

  /**
   * The wings, and the open eyes. Folded and still while it sleeps; beating on
   * this species' own clock while it flies, which is why they are not frames.
   *
   * The wings reach outside the hitbox on purpose: what the player aims at is
   * the bat, not the span of its membrane, and a box the width of the beat
   * would strike on a wingtip three pixels of air away from the body.
   */
  decorate(pixel, creature, _frame, demade, unit) {
    const flit = creature.state === BAT_STATE.FLIT;
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const ink = canvasPalette.demakeInk;
    // Two thresholds, because the baked body has two. `drawCreature` whites the
    // whole bitmap while the strike is above half and only the outline below
    // it, so the wings — which are outline material, drawn in the outline's own
    // tone — go white for the whole flash exactly as the frog's legs do, and
    // the eyes, which are not, go white only while the body around them is.
    const white = creature.flashTicks > 0;
    const hot = creature.flashTicks > gameConfig.creatures.flashTicks / 2;
    const tone = white ? canvasPalette.deathFlash : demade ? ink : BRICK_COLORS.R.dark;
    if (flit) {
      const up = Math.floor(creature.clock / gameConfig.creatures.bat.flapTicks) % 2 === 0;
      paintRows(pixel, up ? WING_LEFT_UP : WING_LEFT_DOWN, x - WING_SPAN + 2, y + SHOULDER, tone, unit);
      paintRows(pixel, up ? WING_UP : WING_DOWN, x + WIDTH - 2, y + SHOULDER, tone, unit);
    } else {
      paintRows(pixel, WING_FOLDED_LEFT, x, y + SHOULDER, tone, unit);
      paintRows(pixel, WING_FOLDED_RIGHT, x + WIDTH - 2, y + SHOULDER, tone, unit);
    }
    // The eyes, shut or open. **Two holes in the baked face**, filled from
    // here: `drawCreature` calls `decorate` before it draws the body, so an
    // eye baked into the bitmap would cover the one drawn under it and the
    // bat would sleep with its eyes shut through the whole flit. A game pixel
    // on either grid — an eye is a dot, not a third of one.
    // On the tube they are holes in a lit face rather than marks on a dark one:
    // the face is ink there, so an ink eye would not be an eye.
    const eye = hot
      ? canvasPalette.deathFlash
      : demade
        ? canvasPalette.demakeGround
        : flit
          ? BRICK_COLORS["1"].flat
          : BRICK_COLORS.R.dark;
    pixel(x + 3, y + 9, 1, 1, eye);
    pixel(x + 6, y + 9, 1, 1, eye);
  },
};
