import { gameConfig } from "@core/config/GameConfig";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, CreatureSight, Species } from "@entities/creatures/Creature";

/**
 * THE SPIDER QUEEN (SHA-209): the first boss, at the end of level 5.
 *
 * She comes down from above the ceiling when the wall is gone, hangs on her
 * thread and *stalks* — drifts along the top until she is over the deck — and
 * then drops on it. The stalk is the telegraph: a player who watches her slide
 * over their head has all the warning the house asks an attack to give. Caught
 * under her, the deck turns to stone for the gaze's span; missed, she climbs
 * back up and starts again. Ten hits from the ball, wherever she is.
 *
 * A species like the others, only bigger and with more hit points: the fight
 * is the game's (`wallCleared`, `strikeBoss`), the creature is hers.
 */
const WIDTH = 40;
const HEIGHT = 26;

const QUEEN_STATE = { ENTER: "enter", HANG: "hang", DROP: "drop", CLIMB: "climb" } as const;
const STUNG = "STUNG";

const LEGS_OUT: readonly string[] = [
  ".....k..k.......................k..k....",
  "....k....k.....................k....k...",
  "...k.....k.....................k.....k..",
  "..k.......k......kkkkkk.......k.......k.",
  ".k.........k...kkbbbbbbkk....k.........k",
  "...........k...kbbbbbbbbk....k..........",
  "............k..kbeebbbeek...k...........",
  ".............k.kbbpbbbpbk..k............",
  "......k......k.kbbbbbbbbk..k......k.....",
  "....kk.kk.....kbbbbbbbbbk.k.....kk.kk...",
  "...k.....kk..kbbhhbbbbbbbkk...kk.....k..",
  ".kk........kkbbhhbbbbbbbbbbkkk........kk",
  "k...........kbbhbbbbbbbbbbbk............",
  "...........kbbbbbbbbbbbbbbbbk...........",
  "...........kbbbbbbbbmbbbbbbbk...........",
  "...........kbbbbbbbmmmbbbbbbk...........",
  "..........kbbbbbbbbbmbbbbbbbbk..........",
  "........kkkbbbbbbbbmbmbbbbbbk.kkk.......",
  ".....kkk...kbbbbbbbbmbbbbbbbk....kkk....",
  "..kkk......kbbbbbbbbbbbbbbbbk.......kkk.",
  "kk..........kbbbbbbbbbbbbbbk...........k",
  "............kbbbbbbbbbbbbbbkk...........",
  "............kkkbbbbbbbbbbkk.k...........",
  "...........k...kkbbbbbbkk....k..........",
  "..........k......kkkkkk.......k.........",
  ".........k.....................k........",
];

const LEGS_IN: readonly string[] = [
  "......kkk.k...................k.kkk.....",
  ".....k....k...................k....k....",
  "...kk.....k...................k.....kk..",
  "...........k.....kkkkkk......k..........",
  "............k..kkbbbbbbkk...k...........",
  "............k..kbbbbbbbbk...k...........",
  "............k..kbeebbbeek...k...........",
  ".............k.kbbpbbbpbk..k............",
  "..............kbbbbbbbbbk.k.............",
  "......kkk.....kbbbbbbbbbk.k.....kkk.....",
  "..kkkk...kk..kbbhhbbbbbbbkk...kk...kkkk.",
  "...........kkbbhhbbbbbbbbbbkkk..........",
  "............kbbhbbbbbbbbbbbk............",
  "...........kbbbbbbbbbbbbbbbbk...........",
  "...........kbbbbbbbbmbbbbbbbk...........",
  "...........kbbbbbbbmmmbbbbbbk...........",
  "..........kbbbbbbbbbmbbbbbbbbk..........",
  "...........kbbbbbbbmbmbbbbbbbk..........",
  "..kkkk...kkbbbbbbbbbmbbbbbbbk.kk...kkkk.",
  "......kkk..kbbbbbbbbbbbbbbbbk...kkk.....",
  "............kbbbbbbbbbbbbbbk............",
  "............kbbbbbbbbbbbbbbk............",
  ".............kkbbbbbbbbbbkkk............",
  "............k..kkbbbbbbkk...k...........",
  "............k....kkkkkk.....k...........",
  "....k......k.................k......k...",
];

function centreX(creature: Creature): number {
  return creature.x + WIDTH / 2;
}

function overDeck(creature: Creature, sight: CreatureSight): boolean {
  return creature.x < sight.deck.right && creature.x + WIDTH > sight.deck.left;
}

export const SPIDER_QUEEN: Species = {
  kind: CREATURE.SPIDER_QUEEN,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.spiderQueen.hitPoints;
  },
  get points() {
    return gameConfig.creatures.spiderQueen.points;
  },
  get killPoints() {
    return gameConfig.creatures.spiderQueen.killPoints;
  },
  tip: "WHEN SHE STOPS ABOVE YOU, MOVE",
  lore: "SHE COMES DOWN FROM ABOVE THE CEILING WHEN THE LAST BRICK FALLS. SHE HANGS ON HER THREAD AND STALKS, SLIDING ALONG THE TOP UNTIL SHE IS RIGHT ABOVE YOUR DECK — THAT SLIDE IS YOUR ONLY WARNING — THEN SHE DROPS. CAUGHT BENEATH HER, YOUR DECK TURNS TO STONE. TEN HITS TO BRING HER DOWN.",
  solid: true,
  frames: [LEGS_OUT, LEGS_IN],
  frameTicks: 10,
  // The brood's red for the body, a paler mark on the abdomen, silver eyes: a
  // creature of the Observer's, in the Observer's colours, and nothing yellow.
  palette: {
    k: BRICK_COLORS["1"].dark,
    b: BRICK_COLORS["1"].flat,
    h: BRICK_COLORS["1"].light,
    m: BRICK_COLORS["2"].light,
    e: canvasPalette.paddleTopSheen,
    p: canvasPalette.eyePupil,
  },
  demade: {
    k: canvasPalette.demakeInk,
    b: canvasPalette.demakeGround,
    h: canvasPalette.demakeGround,
    m: canvasPalette.demakeInk,
    e: canvasPalette.demakeInk,
    p: canvasPalette.demakeGround,
  },
  outline: "k",

  spawn(creature) {
    creature.state = QUEEN_STATE.ENTER;
  },

  step(creature, sight, effects) {
    const knobs = gameConfig.creatures.spiderQueen;
    const { left, right } = gameConfig.field;
    const deckCentre = (sight.deck.left + sight.deck.right) / 2;
    switch (creature.state) {
      case QUEEN_STATE.ENTER: {
        creature.y += knobs.enterSpeed;
        if (creature.y >= knobs.hangY) {
          creature.y = knobs.hangY;
          creature.state = QUEEN_STATE.HANG;
          creature.clock = 0;
        }
        return;
      }
      case QUEEN_STATE.HANG: {
        // The stalk: toward the deck, never faster than the knob, and never
        // under the side bars.
        const drift = Math.max(-knobs.stalkSpeed, Math.min(knobs.stalkSpeed, deckCentre - centreX(creature)));
        creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x + drift));
        creature.facing = drift < 0 ? -1 : 1;
        if (creature.clock >= knobs.restTicks && Math.abs(deckCentre - centreX(creature)) <= knobs.aimWidth) {
          creature.state = QUEEN_STATE.DROP;
          // Where the drop ends: on the deck's top edge.
          creature.phase = sight.deck.y - HEIGHT;
        }
        return;
      }
      case QUEEN_STATE.DROP: {
        creature.y = Math.min(creature.phase, creature.y + knobs.dropSpeed);
        if (creature.y >= creature.phase) {
          if (overDeck(creature, sight)) {
            effects.petrifyDeck();
            effects.pop(centreX(creature), creature.y - 6, STUNG, true);
          }
          creature.state = QUEEN_STATE.CLIMB;
        }
        return;
      }
      default: {
        creature.y = Math.max(knobs.hangY, creature.y - knobs.climbSpeed);
        if (creature.y <= knobs.hangY) {
          creature.state = QUEEN_STATE.HANG;
          creature.clock = 0;
        }
      }
    }
  },

  struck() {
    return false;
  },

  // Her thread, from the ceiling to her back, whenever she is in the room.
  // The queen's thread, on the spider's rule: one pixel of the grid being drawn
  // on, so it goes to a third of a game pixel on the fine one. A queen is twice
  // the spider and hangs off the same silk.
  decorate(pixel, creature, _frame, demade, unit) {
    const top = gameConfig.field.top;
    if (creature.y <= top) {
      return;
    }
    pixel(
      Math.round(centreX(creature)),
      top,
      1 / unit,
      Math.round(creature.y) - top + 2,
      demade ? canvasPalette.demakeInk : canvasPalette.paddleTopSheen,
    );
  },
};
