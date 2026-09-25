import { gameConfig } from "@core/config/GameConfig";
import { grown } from "@entities/creatures/bitmap";
import { CRAB, SCUTTLE_IN, SCUTTLE_OUT } from "@entities/creatures/species/crab";
import { CREATURE } from "@interfaces/creatures";
import { canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * THE CRAB BARON (SHA-261): the boss that comes down when THE TEAR breaks.
 *
 * The thief grown rich: all four slots on his back are full, gold for good,
 * and he still takes what falls through him. He stalks along the top toward
 * the deck — the queen's stalk, sideways — and every hit spills one of the
 * capsules he has snatched since he came down.
 */
const withPips = (rows: readonly string[]): readonly string[] =>
  rows.map((row, index) => (index === 6 ? "..kwpwpwpwpwk.." : row));

const FRAMES = [grown(withPips(SCUTTLE_OUT)), grown(withPips(SCUTTLE_IN))];
const WIDTH = FRAMES[0][0].length;
const HEIGHT = FRAMES[0].length;

const BARON_STATE = { ENTER: "enter", STALK: "stalk" } as const;
const SNATCHED = "SNATCHED";

export const CRAB_BARON: Species = {
  kind: CREATURE.CRAB_BARON,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.crabBaron.hitPoints;
  },
  get points() {
    return gameConfig.creatures.crabBaron.points;
  },
  get killPoints() {
    return gameConfig.creatures.crabBaron.killPoints;
  },
  tip: "STEP OUT FROM UNDER HIM",
  lore: "THE RICHEST THIEF IN THE ROOM, HIS BACK SET WITH FOUR GOLD PIPS HE WILL NEVER GIVE UP. HE COMES DOWN WHEN THE TEAR BREAKS AND SIDLES ALONG THE TOP UNTIL HE IS OVER YOUR DECK, BLOWING BUBBLES THAT BURST IT. WHATEVER FALLS THROUGH HIM HE KEEPS, AND EVERY HIT SPILLS ONE BACK.",
  solid: false,
  frames: FRAMES,
  frameTicks: 8,
  palette: { ...CRAB.palette, p: canvasPalette.chainSheen },
  demade: { ...CRAB.demade, p: canvasPalette.demakeInk },
  outline: CRAB.outline,

  spawn(creature) {
    creature.state = BARON_STATE.ENTER;
  },

  step(creature, sight, effects) {
    const knobs = gameConfig.creatures.crabBaron;
    if (creature.state === BARON_STATE.ENTER) {
      creature.y += knobs.enterSpeed;
      if (creature.y >= knobs.hangY) {
        creature.y = knobs.hangY;
        creature.state = BARON_STATE.STALK;
      }
      return;
    }
    const { left, right } = gameConfig.field;
    const deckCentre = (sight.deck.left + sight.deck.right) / 2;
    const drift = Math.max(-knobs.stalkSpeed, Math.min(knobs.stalkSpeed, deckCentre - (creature.x + WIDTH / 2)));
    creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x + drift));
    creature.facing = drift < 0 ? -1 : 1;
    // `phase` is what he is holding, as it is on his children.
    const taken = effects.snatch(creature.x, creature.y, WIDTH, HEIGHT);
    if (taken > 0) {
      creature.phase += taken;
      effects.pop(creature.x + WIDTH / 2, creature.y - 6, SNATCHED, true);
    }
  },

  struck(creature, _by, effects) {
    if (creature.phase > 0) {
      creature.phase -= 1;
      effects.dropCapsule(creature.x + WIDTH / 2, creature.y + HEIGHT);
    }
    return false;
  },
};
