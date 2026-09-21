import { gameConfig } from "@core/config/GameConfig";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * SPIDER (SHA-208): it hangs at the ceiling over the mouth, and when a ball
 * passes under it, it drops on its thread to the ball's height and blocks it.
 *
 * The first thing in the bestiary that gets in the way. It is solid — a shelf
 * the ball bounces off, the way a beast is — so a spider at ball height is a
 * ceiling that just arrived. It climbs back to its spot afterwards and rests
 * there before it will drop again; the rest looks exactly like the hang, and
 * that is the point: the player learns the column, not the cue. Hit on the
 * way down, the thread snaps and the house says so.
 */
export const SPIDER_STATE = { HANG: "hang", DROP: "drop", CLIMB: "climb", REST: "rest" } as const;

/** The catch-pop line for a spider struck mid-drop. */
const THREAD_SNAP = "SNAP";

const WIDTH = 14;
const HEIGHT = 10;

// Hanging from the abdomen, head down: a round abdomen, a waist, and a head
// that is mostly two eyes looking at the deck. Legs spread from the waist,
// the front pair reaching up the thread.
const SPREAD: readonly string[] = [
  ".....kkkk.....",
  "k...kbbbbk...k",
  ".k.kbbbbbbk.k.",
  "k.kkbbbbbbkk.k",
  ".kkkkbbbbkkkk.",
  "...kkkkkkkk...",
  "kkk.kebbek.kkk",
  "...kkebbekk...",
  "..k..kkkk..k..",
  "kk..........kk",
];

// The same spider a leg-beat later: every pair swung one row, so a hanging
// spider twitches rather than sits like a brick.
const SWUNG: readonly string[] = [
  ".....kkkk.....",
  "....kbbbbk....",
  "k..kbbbbbbk..k",
  ".kkkbbbbbbkkk.",
  "..kkkbbbbkkk..",
  "kk.kkkkkkkk.kk",
  "..k.kebbek.k..",
  "kk.kkebbekk.kk",
  ".kk..kkkk..kk.",
  "k............k",
];

function centreX(creature: Creature): number {
  return creature.x + WIDTH / 2;
}

export const SPIDER: Species = {
  kind: CREATURE.SPIDER,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.spider.hitPoints;
  },
  get points() {
    return gameConfig.creatures.spider.points;
  },
  get killPoints() {
    return gameConfig.creatures.spider.killPoints;
  },
  solid: true,
  frames: [SPREAD, SWUNG],
  frameTicks: 10,
  // A red-brown body in the red brick's flat, legs and outline in its dark,
  // and two eyes in the thread's pale. Never yellow.
  palette: {
    k: BRICK_COLORS["1"].dark,
    b: BRICK_COLORS["1"].flat,
    e: canvasPalette.paddleTopSheen,
  },
  // Body to ground, legs, outline and eyes to ink: eight legs and two dots
  // are what survive the tube.
  demade: {
    k: canvasPalette.demakeInk,
    b: canvasPalette.demakeGround,
    e: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    creature.state = SPIDER_STATE.HANG;
    creature.phase = creature.home.y;
  },

  step(creature, sight) {
    const { dropSpeed, climbSpeed, triggerHalfWidth, restTicks } = gameConfig.creatures.spider;
    switch (creature.state) {
      case SPIDER_STATE.HANG: {
        const ball = sight.ball;
        if (!ball || ball.y <= creature.y + HEIGHT || Math.abs(ball.x - centreX(creature)) > triggerHalfWidth) {
          break;
        }
        // Where the drop ends: its centre at the ball's height as it was when
        // the ball passed, and never nearer the deck than one brick's width —
        // a spider on the rail is a wall, not a block.
        const floor = sight.deck.y - gameConfig.creatures.spider.deckClearance - HEIGHT;
        const target = Math.min(ball.y - HEIGHT / 2, floor);
        if (target > creature.y) {
          creature.phase = target;
          creature.state = SPIDER_STATE.DROP;
          creature.clock = 0;
        }
        break;
      }
      case SPIDER_STATE.DROP: {
        creature.vy = dropSpeed;
        creature.y = Math.min(creature.y + dropSpeed, creature.phase);
        if (creature.y >= creature.phase) {
          creature.state = SPIDER_STATE.CLIMB;
          creature.clock = 0;
        }
        break;
      }
      case SPIDER_STATE.CLIMB: {
        creature.vy = -climbSpeed;
        creature.y = Math.max(creature.y - climbSpeed, creature.home.y);
        if (creature.y <= creature.home.y) {
          creature.vy = 0;
          creature.state = SPIDER_STATE.REST;
          creature.clock = 0;
        }
        break;
      }
      case SPIDER_STATE.REST: {
        if (creature.clock >= restTicks) {
          creature.state = SPIDER_STATE.HANG;
          creature.clock = 0;
        }
        break;
      }
    }
  },

  // One hit point either way; the difference is the thread. A spider struck
  // on the way down has it snap under it, and the pop says so.
  struck(creature, _by, effects) {
    if (creature.state === SPIDER_STATE.DROP) {
      effects.pop(centreX(creature), creature.y + HEIGHT / 2, THREAD_SNAP, false);
    }
    return true;
  },

  // The thread: one pixel wide from the ceiling to the spider's top edge, in
  // the deck's sheen — the palest tone that is not the ball's — and ink on
  // the tube. Drawn whenever the spider is below its spot; at home it hangs
  // straight under the ceiling and there is nothing to draw.
  //
  // **One pixel of whatever grid is being drawn on** (SHA-233), which on the
  // fine one is a third of what the coarse grid can manage. It is THE TEAR's
  // track again: silk is thinner than the thinnest mark a game pixel makes,
  // and three pixels of rope hanging off the ceiling is a different animal.
  // The shadow under a beast is the other way round and says why there.
  decorate(pixel, creature, _frame, demade, unit) {
    if (creature.y <= creature.home.y) {
      return;
    }
    const top = gameConfig.field.top;
    const length = Math.round(creature.y) - top;
    if (length > 0) {
      pixel(
        Math.round(centreX(creature)),
        top,
        1 / unit,
        length,
        demade ? canvasPalette.demakeInk : canvasPalette.paddleTopSheen,
      );
    }
  },
};
