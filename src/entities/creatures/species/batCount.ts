import { gameConfig } from "@core/config/GameConfig";
import { BOSS_GROWTH, grown, mirrored } from "@entities/creatures/bitmap";
import { BAT, BAT_BODY, WING_DOWN, WING_FOLDED_RIGHT, WING_UP } from "@entities/creatures/species/bat";
import { paintRows } from "@entities/creatures/species/frog";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * THE BAT COUNT (SHA-261): the boss that comes down when THE VEIL breaks.
 *
 * His children sleep until you wake them; he is awake, eyes lit red, and
 * spends the fight in the flight a bat only has for five seconds at a time —
 * no curve you can learn, over the whole upper field. Between flights he
 * roosts head-down at the ceiling for a breath, which is the one moment he
 * holds still to be shot. The ball goes through him like through any bat.
 */
const BODY = grown(BAT_BODY.map((row, index) => (index === 9 ? ".klellelk." : row)));
const WIDTH = BODY[0].length;
const HEIGHT = BODY.length;

const WINGS = {
  rightDown: grown(WING_DOWN),
  rightUp: grown(WING_UP),
  leftDown: grown(mirrored(WING_DOWN)),
  leftUp: grown(mirrored(WING_UP)),
  foldedRight: grown(WING_FOLDED_RIGHT),
  foldedLeft: grown(mirrored(WING_FOLDED_RIGHT)),
};
const SHOULDER = 3 * BOSS_GROWTH;
const WING_SPAN = WINGS.rightDown[0].length;

const COUNT_STATE = { ENTER: "enter", FLIT: "flit", ROOST: "roost" } as const;

/** BAT's wander at his size: two sines a piece at rates with no common period. */
function wander(clock: number): { x: number; y: number } {
  return {
    x: Math.sin(clock * 0.07) * 0.9 + Math.sin(clock * 0.023 + 1.7) * 0.7,
    y: Math.cos(clock * 0.051) * 0.8 + Math.sin(clock * 0.019 + 0.6) * 0.5,
  };
}

function place(creature: Creature, lowY: number): void {
  const { left, right } = gameConfig.field;
  const knobs = gameConfig.creatures.batCount;
  if (creature.x < left + 1 || creature.x > right - 1 - WIDTH) {
    creature.facing = creature.x < left + 1 ? 1 : -1;
  }
  creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x));
  creature.y = Math.max(knobs.hangY, Math.min(lowY, creature.y));
}

export const BAT_COUNT: Species = {
  kind: CREATURE.BAT_COUNT,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.batCount.hitPoints;
  },
  get points() {
    return gameConfig.creatures.batCount.points;
  },
  get killPoints() {
    return gameConfig.creatures.batCount.killPoints;
  },
  tip: "SHOOT HIM WHILE HE ROOSTS",
  lore: "THE LORD OF EVERY BAT, AND HE NEVER SLEEPS. HE COMES DOWN WHEN THE VEIL BREAKS AND FLIES THE WHOLE ROOM IN NO CURVE YOU CAN LEARN, EYES RED, SPITTING SCREECHES AT YOUR DECK. BETWEEN FLIGHTS HE HANGS AT THE CEILING FOR A BREATH: THAT IS WHEN TO AIM.",
  solid: false,
  frames: [BODY],
  frameTicks: 12,
  palette: { ...BAT.palette, e: BRICK_COLORS["1"].flat },
  demade: { ...BAT.demade, e: canvasPalette.demakeGround },
  outline: BAT.outline,

  spawn(creature) {
    creature.state = COUNT_STATE.ENTER;
    creature.facing = 1;
  },

  step(creature) {
    const knobs = gameConfig.creatures.batCount;
    switch (creature.state) {
      case COUNT_STATE.ENTER: {
        creature.y += knobs.enterSpeed;
        if (creature.y >= knobs.hangY) {
          creature.state = COUNT_STATE.FLIT;
          creature.clock = 0;
        }
        return;
      }
      case COUNT_STATE.FLIT: {
        const drift = wander(creature.clock);
        creature.x += (drift.x + creature.facing * 0.6) * knobs.flitSpeed;
        creature.y += (drift.y + 0.25) * knobs.flitSpeed;
        place(creature, knobs.lowY);
        if (creature.clock >= knobs.flitTicks) {
          creature.state = COUNT_STATE.ROOST;
          creature.clock = 0;
        }
        return;
      }
      default: {
        // Back up to the ceiling, and a breath there with the wings wrapped.
        creature.y = Math.max(knobs.hangY, creature.y - knobs.flitSpeed * 1.5);
        if (creature.clock >= knobs.roostTicks) {
          creature.state = COUNT_STATE.FLIT;
          creature.clock = 0;
        }
      }
    }
  },

  struck() {
    return false;
  },

  decorate(pixel, creature, _frame, demade, unit) {
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const tone =
      creature.flashTicks > 0 ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.R.dark;
    if (creature.state === COUNT_STATE.ROOST) {
      paintRows(pixel, WINGS.foldedLeft, x, y + SHOULDER, tone, unit);
      paintRows(pixel, WINGS.foldedRight, x + WIDTH - 2 * BOSS_GROWTH, y + SHOULDER, tone, unit);
      return;
    }
    const up = Math.floor(creature.clock / gameConfig.creatures.batCount.flapTicks) % 2 === 0;
    const reach = WING_SPAN - 2 * BOSS_GROWTH;
    paintRows(pixel, up ? WINGS.leftUp : WINGS.leftDown, x - reach, y + SHOULDER, tone, unit);
    paintRows(pixel, up ? WINGS.rightUp : WINGS.rightDown, x + WIDTH - 2 * BOSS_GROWTH, y + SHOULDER, tone, unit);
  },
};
