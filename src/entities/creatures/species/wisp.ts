import { gameConfig } from "@core/config/GameConfig";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * WISP (SHA-242): the one thing on the field the ball cannot touch.
 *
 * It drifts through the wall as though the wall were not there, and the ball
 * drifts through it the same way — no bounce, no strike, no notice taken. Only
 * a bolt reaches it, and it pays more than anything else in the bestiary
 * because on most levels the player has no way to reach it at all: a wisp is
 * worth a thousand points to somebody holding a LASER and worth nothing at all
 * to everybody else, which is the argument for going and getting one.
 *
 * **Vapour has to *look* like vapour**, or an untouchable thing reads as a
 * bug rather than as a rule. Two things say it. It thins and thickens as it
 * goes, on its own frames, so it is visibly not a body; and a ball that passes
 * through drags it along in its wake — nothing happens to either of them,
 * which is the whole species, but a ball going clean through something that
 * did not so much as stir is the exact picture of a collision that failed.
 */
export const WISP_STATE = { DRIFT: "drift" } as const;

const WIDTH = 7;
const HEIGHT = 9;

/**
 * The breath, as three drawings rather than as a state.
 *
 * This is the one cue in the bestiary that *wants* to be frames: it is a loop
 * on a clock and nothing else, with no state behind it, so `drawCreature`
 * picking the frame off the field's own count is exactly right rather than
 * being the constraint it is for a bat's wings.
 */
const WISP_THICK: readonly string[] = [
  "...d...",
  "..ddd..",
  ".ddbdd.",
  ".dbbbd.",
  "dbbcbbd",
  "dbcccbd",
  "dbbcbbd",
  ".dbbbd.",
  "..ddd..",
];

const WISP_MID: readonly string[] = [
  "...d...",
  "...d...",
  "..ddd..",
  "..dbd..",
  ".dbcbd.",
  ".dbcbd.",
  "..dbd..",
  "..ddd..",
  "...d...",
];

const WISP_THIN: readonly string[] = [
  "...d...",
  "...d...",
  "...d...",
  "..ddd..",
  "..dcd..",
  "..dcd..",
  "..ddd..",
  "...d...",
  "...d...",
];

// Out and back rather than a saw: the middle drawing is used twice a cycle, so
// the breath has no tick where the wisp jumps from its widest to its thinnest.
const WISP_FRAMES: readonly (readonly string[])[] = [WISP_THICK, WISP_MID, WISP_THIN, WISP_MID];

export const WISP: Species = {
  kind: CREATURE.WISP,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.wisp.hitPoints;
  },
  get points() {
    return gameConfig.creatures.wisp.points;
  },
  get killPoints() {
    return gameConfig.creatures.wisp.killPoints;
  },
  solid: false,
  // The whole species, in one word (SHA-242).
  shotOnly: true,
  frames: WISP_FRAMES,
  frameTicks: 13,
  // Cold and pale, and the only creature in the game painted in light: white at
  // the core, a blue body, a fringe the colour of the deep brick.
  //
  // **White rather than silver's highlight**, which was the first choice and is
  // the identical hex: a wisp spends half its life drifting over the wall, and
  // on a level of silver brick a core in silver's own light tone is a creature
  // that disappears every time it crosses one.
  palette: { d: BRICK_COLORS["5"].flat, b: BRICK_COLORS["5"].light, c: "#ffffff" },
  // **Solid on the tube, where everything else is a wireframe.** The house
  // rule sends a body to ground and keeps the outline, which is right for
  // every creature that *is* a body and wrong for the one that is a light: a
  // hollow wisp would be a bubble. All three tones to ink, and it comes out of
  // the tube the one lit shape on a screen of empty ones.
  demade: { d: canvasPalette.demakeInk, b: canvasPalette.demakeInk, c: canvasPalette.demakeInk },
  outline: "d",

  spawn(creature) {
    creature.state = WISP_STATE.DRIFT;
    // A heading off its own pin, so two wisps on a level do not set off in
    // convoy — and so the level's author can see which way one will go.
    creature.phase = ((creature.home.x + creature.home.y) % 360) * (Math.PI / 180);
  },

  /**
   * A heading that is always turning, at a speed that never changes. The turn
   * is two sines at rates with no common period, which is the house's idiom
   * for a wandering curve — a per-frame `random()` would be jitter, and one
   * rate would draw a lap the player could learn.
   *
   * `vx`/`vy` are not the travel: the travel is the heading and the speed. The
   * pair carries the shove a ball leaves behind, which decays to nothing on
   * its own.
   */
  step(creature, sight) {
    const knobs = gameConfig.creatures.wisp;
    const { left, right, top } = gameConfig.field;
    creature.phase +=
      knobs.turn * (Math.sin(creature.clock / knobs.wobbleTicks) + Math.sin(creature.clock / knobs.driftTicks) / 2);
    creature.x += Math.cos(creature.phase) * knobs.speed + creature.vx;
    creature.y += Math.sin(creature.phase) * knobs.speed + creature.vy;
    creature.vx *= knobs.shoveDecay;
    creature.vy *= knobs.shoveDecay;

    // The frame is its box, the wall is not: drifting through brick is the
    // point, and drifting off the field would be a creature the player is
    // asked to shoot and cannot see. The deck's own line is the floor for the
    // same reason a bat's is.
    const floor = gameConfig.paddle.y - HEIGHT - 6;
    if (creature.x < left + 1 || creature.x > right - 1 - WIDTH) {
      creature.phase = Math.PI - creature.phase;
      creature.vx = -creature.vx;
      creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x));
    }
    if (creature.y < top + 1 || creature.y > floor) {
      creature.phase = -creature.phase;
      creature.vy = -creature.vy;
      creature.y = Math.max(top + 1, Math.min(floor, creature.y));
    }

    // Dragged along in the ball's wake, not pushed away from it: vapour a
    // solid went through follows the solid, and along-the-velocity has no
    // degenerate direction the way away-from-the-centre does when the ball is
    // dead on the middle of it.
    const ball = sight.ball;
    if (
      ball !== null &&
      ball.x >= creature.x &&
      ball.x < creature.x + WIDTH &&
      ball.y >= creature.y &&
      ball.y < creature.y + HEIGHT
    ) {
      const rate = Math.hypot(ball.vx, ball.vy) || 1;
      creature.vx = (ball.vx / rate) * knobs.shove;
      creature.vy = (ball.vy / rate) * knobs.shove;
    }
  },

  // One hit point and one weapon: a bolt reaches it and that is the end of it.
  struck() {
    return false;
  },
};
