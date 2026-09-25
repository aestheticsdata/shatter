import { gameConfig } from "@core/config/GameConfig";
import { BOSS_GROWTH, grown, mirrored } from "@entities/creatures/bitmap";
import { BEETLE, BEETLE_SHELL, HEAD_RIGHT, LEGS } from "@entities/creatures/species/beetle";
import { paintRows } from "@entities/creatures/species/frog";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * THE SCARAB (SHA-261): the boss that comes down when THE IRIS breaks.
 *
 * The beetle's rule at four times the size: armour on top, belly underneath,
 * and the seam across his back is the line between them. A ball that comes
 * down on him is refused with a SHELL; one that comes up off the deck lands.
 * He walks the top of the field end to end, and every third belly hit rolls
 * him into a charge along it — the beetle's roll, which is how a hurt scarab
 * gets away from the shot that works.
 */
const SHELL_ROWS = grown(BEETLE_SHELL);
const WIDTH = SHELL_ROWS[0].length;
const HEIGHT = SHELL_ROWS.length;

const HEAD = { right: grown(HEAD_RIGHT), left: grown(mirrored(HEAD_RIGHT)) };
const LEG_ROWS = [grown(LEGS), grown(mirrored(LEGS))];

const SCARAB_STATE = { ENTER: "enter", WALK: "walk", ROLL: "roll" } as const;
const SHELL = "SHELL";

export const SCARAB: Species = {
  kind: CREATURE.SCARAB,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.scarab.hitPoints;
  },
  get points() {
    return gameConfig.creatures.scarab.points;
  },
  get killPoints() {
    return gameConfig.creatures.scarab.killPoints;
  },
  tip: "HIT HIM FROM BELOW",
  lore: "THE OLDEST BEETLE, HIS SHELL THE COLOUR OF A DYING SUN. HE COMES DOWN WHEN THE IRIS BREAKS AND WALKS THE TOP OF THE ROOM, DROPPING SHARDS OF CHITIN ON YOUR DECK. COME DOWN ON HIS SHELL AND THE BALL IS REFUSED; ONLY HIS BELLY TAKES A HIT. EVERY THIRD ONE SENDS HIM ROLLING.",
  solid: true,
  frames: [SHELL_ROWS],
  frameTicks: 12,
  palette: BEETLE.palette,
  demade: BEETLE.demade,
  outline: BEETLE.outline,

  spawn(creature) {
    creature.state = SCARAB_STATE.ENTER;
    creature.facing = 1;
  },

  step(creature) {
    const knobs = gameConfig.creatures.scarab;
    if (creature.state === SCARAB_STATE.ENTER) {
      creature.y += knobs.enterSpeed;
      if (creature.y >= knobs.hangY) {
        creature.y = knobs.hangY;
        creature.state = SCARAB_STATE.WALK;
        creature.clock = 0;
      }
      return;
    }
    const rolling = creature.state === SCARAB_STATE.ROLL;
    const { left, right } = gameConfig.field;
    // The head sticks out ahead of the shell: the frame stops the head, not the shell.
    const reach = HEAD.right[0].length - BOSS_GROWTH;
    creature.x += creature.facing * (rolling ? knobs.rollSpeed : knobs.walkSpeed);
    if (creature.x < left + 1 + reach || creature.x > right - 1 - WIDTH - reach) {
      creature.facing = creature.x < left + 1 + reach ? 1 : -1;
      creature.x = Math.max(left + 1 + reach, Math.min(right - 1 - WIDTH - reach, creature.x));
    }
    if (rolling && creature.clock >= knobs.rollTicks) {
      creature.state = SCARAB_STATE.WALK;
      creature.clock = 0;
    }
  },

  // The beetle's split, at the seam: a touch on the upper half is the shell.
  armour(creature, _x, y) {
    return y < creature.y + HEIGHT / 2 ? SHELL : null;
  },

  struck(creature) {
    // `phase` counts the belly hits; every `rollEvery` of them sends him rolling.
    creature.phase += 1;
    if (creature.phase % gameConfig.creatures.scarab.rollEvery === 0) {
      creature.state = SCARAB_STATE.ROLL;
      creature.clock = 0;
    }
    return false;
  },

  decorate(pixel, creature, _frame, demade, unit) {
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const tone =
      creature.flashTicks > 0 ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.R.dark;
    const ahead = creature.facing === 1;
    const head = ahead ? HEAD.right : HEAD.left;
    const headX = ahead ? x + WIDTH - BOSS_GROWTH : x - head[0].length + BOSS_GROWTH;
    paintRows(pixel, head, headX, y + 2 * BOSS_GROWTH, tone, unit);
    // Tucked in while he rolls; stepping while he walks.
    if (creature.state !== SCARAB_STATE.ROLL) {
      const step = Math.floor(creature.clock / 10) % 2;
      paintRows(pixel, LEG_ROWS[step], x, y + HEIGHT, tone, unit);
    }
  },
};
