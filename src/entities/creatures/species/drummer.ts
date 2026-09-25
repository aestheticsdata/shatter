import { gameConfig } from "@core/config/GameConfig";
import { BOSS_GROWTH, flipped, grown, mirrored } from "@entities/creatures/bitmap";
import { paintRows } from "@entities/creatures/species/frog";
import { WOODPECKER, WOODPECKER_BODY, WOODPECKER_WING } from "@entities/creatures/species/woodpecker";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * THE DRUMMER (SHA-261): the boss that comes down when THE WRATH breaks.
 *
 * The one friend in the bestiary, grown four times over and no longer on your
 * side. He flies to a spot on the ceiling, clings there beak-up and drums on
 * it until the whole room shakes, and the splinters he knocks loose come down
 * on the deck. Then he flies on to another spot. The ball goes through him.
 */
const BODY = grown(WOODPECKER_BODY);
const WIDTH = BODY[0].length;
const HEIGHT = BODY.length;

const WINGS = {
  rightDown: grown(WOODPECKER_WING),
  rightUp: grown(flipped(WOODPECKER_WING)),
  leftDown: grown(mirrored(WOODPECKER_WING)),
  leftUp: grown(mirrored(flipped(WOODPECKER_WING))),
};
const SHOULDER = 5 * BOSS_GROWTH;

const DRUMMER_STATE = { ENTER: "enter", FLY: "fly", CLING: "cling" } as const;
const DRUM = "DRUM";

export const DRUMMER: Species = {
  kind: CREATURE.DRUMMER,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.drummer.hitPoints;
  },
  get points() {
    return gameConfig.creatures.drummer.points;
  },
  get killPoints() {
    return gameConfig.creatures.drummer.killPoints;
  },
  tip: "WHEN HE CLINGS, HE DRUMS",
  lore: "THE WOODPECKER THAT STOPPED BEING YOUR FRIEND. HE COMES DOWN WHEN THE WRATH BREAKS, FLIES TO A SPOT ON THE CEILING, AND DRUMS ON IT UNTIL THE WHOLE ROOM SHAKES. EVERY SPLINTER HE KNOCKS LOOSE FALLS STRAIGHT FOR YOUR DECK. THEN HE FLIES ON, AND DOES IT SOMEWHERE ELSE.",
  solid: false,
  frames: [BODY],
  frameTicks: 12,
  palette: WOODPECKER.palette,
  demade: WOODPECKER.demade,
  outline: WOODPECKER.outline,

  spawn(creature) {
    creature.state = DRUMMER_STATE.ENTER;
  },

  step(creature, _sight, effects) {
    const knobs = gameConfig.creatures.drummer;
    const { left, right } = gameConfig.field;
    switch (creature.state) {
      case DRUMMER_STATE.ENTER: {
        creature.y += knobs.enterSpeed;
        if (creature.y >= knobs.hangY) {
          creature.y = knobs.hangY;
          creature.state = DRUMMER_STATE.CLING;
          creature.clock = 0;
        }
        return;
      }
      case DRUMMER_STATE.FLY: {
        // `phase` is where he is flying to along the ceiling.
        const gap = creature.phase - creature.x;
        creature.facing = gap < 0 ? -1 : 1;
        creature.x += Math.max(-knobs.flySpeed, Math.min(knobs.flySpeed, gap));
        // A dip in the middle of the flight, back up to the ceiling at its end.
        creature.y = knobs.hangY + Math.min(16, Math.abs(gap) * 0.2);
        if (Math.abs(gap) < 1) {
          creature.y = knobs.hangY;
          creature.state = DRUMMER_STATE.CLING;
          creature.clock = 0;
        }
        return;
      }
      default: {
        if (creature.clock % knobs.drumEvery === 0) {
          effects.rattle(knobs.drumShake);
          effects.pop(creature.x + WIDTH / 2, creature.y + HEIGHT + 4, DRUM, true);
        }
        if (creature.clock >= knobs.clingTicks) {
          creature.phase = left + 1 + Math.random() * (right - left - 2 - WIDTH);
          creature.state = DRUMMER_STATE.FLY;
          creature.clock = 0;
        }
      }
    }
  },

  struck() {
    return false;
  },

  decorate(pixel, creature, _frame, demade, unit) {
    if (creature.state !== DRUMMER_STATE.FLY) {
      return;
    }
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const tone =
      creature.flashTicks > 0 ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.R.dark;
    const up = Math.floor(creature.clock / gameConfig.creatures.drummer.flapTicks) % 2 === 0;
    const span = WINGS.rightDown[0].length;
    paintRows(pixel, up ? WINGS.leftUp : WINGS.leftDown, x - span + BOSS_GROWTH, y + SHOULDER, tone, unit);
    paintRows(pixel, up ? WINGS.rightUp : WINGS.rightDown, x + WIDTH - BOSS_GROWTH, y + SHOULDER, tone, unit);
  },
};
