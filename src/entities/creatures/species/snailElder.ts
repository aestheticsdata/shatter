import { gameConfig } from "@core/config/GameConfig";
import { doubled, flipped } from "@entities/creatures/bitmap";
import { SNAIL, SNAIL_FRAMES } from "@entities/creatures/species/snail";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * THE SNAIL ELDER (SHA-213): the boss at the end of level 35, PACHINKO.
 *
 * The snails mend the wall: a hit point back on every brick they cross. He is
 * the same mason twice the size and, with no wall left to mend, he builds one.
 * He crawls the ceiling upside down, end to end and back, and under every
 * column he passes he lays a brick in the top rows — first the top row, then
 * the one under it, then the top again where it has been broken — so the wall
 * the player just took down grows back over their head for as long as he
 * lives. The bricks are real bricks: they pay, they hold capsules for nobody,
 * and they stand between the ball and him.
 *
 * **The shell is armour and the head is soft.** A ball on the shell bounces
 * off with a SHELL and no hit; the front third of him, the head end with the
 * stalks hanging down, takes the hit. He is slow, which is the whole fairness
 * of it: there is always time to break through to where he is going.
 */
const WIDTH = SNAIL.width * 2;
const HEIGHT = SNAIL.height * 2;

const ELDER_STATE = { ENTER: "enter", CRAWL: "crawl" } as const;
const SHELL = "SHELL";

const STALK_INSETS: readonly number[] = [0, 4];
const STALK_HEIGHT = 12;

function centreX(creature: Creature): number {
  return creature.x + WIDTH / 2;
}

function columnUnder(creature: Creature): number {
  const { left, brickWidth } = gameConfig.grid;
  return Math.floor((centreX(creature) - left) / brickWidth);
}

export const SNAIL_ELDER: Species = {
  kind: CREATURE.SNAIL_ELDER,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.snailElder.hitPoints;
  },
  get points() {
    return gameConfig.creatures.snailElder.points;
  },
  get killPoints() {
    return gameConfig.creatures.snailElder.killPoints;
  },
  blurb: "HE LAYS NEW BRICKS OVERHEAD",
  solid: true,
  // The snail's own two frames, a size up and the right way up for a ceiling.
  frames: SNAIL_FRAMES.map((rows) => flipped(doubled(rows))),
  frameTicks: 14,
  palette: SNAIL.palette,
  demade: SNAIL.demade,
  outline: SNAIL.outline,

  spawn(creature) {
    creature.state = ELDER_STATE.ENTER;
    // `phase` is the last column laid under, `vy` the pass count: which of the
    // top rows this traverse lays in.
    creature.phase = -1;
    creature.vy = 0;
  },

  step(creature, sight, effects) {
    const knobs = gameConfig.creatures.snailElder;
    const { left, right, top } = gameConfig.field;
    const ceiling = top + 1;
    if (creature.state === ELDER_STATE.ENTER) {
      creature.y = Math.min(ceiling, creature.y + knobs.enterSpeed);
      if (creature.y >= ceiling) {
        creature.state = ELDER_STATE.CRAWL;
        creature.phase = columnUnder(creature);
      }
      return;
    }
    // End to end along the ceiling, turning at the side bars; a turn is a pass.
    const next = creature.x + creature.facing * knobs.speed;
    if (next < left + 1 || next > right - 1 - WIDTH) {
      creature.facing = creature.facing === 1 ? -1 : 1;
      creature.vy += 1;
      return;
    }
    creature.x = next;
    creature.vx = creature.facing * knobs.speed;
    // A column entered is a brick laid, in this pass's row, where nothing stands.
    const column = columnUnder(creature);
    if (column !== creature.phase) {
      creature.phase = column;
      const row = creature.vy % Math.min(knobs.layRows, sight.wallRows);
      if (column >= 0 && column < gameConfig.grid.columns && !sight.standing(column, row)) {
        effects.lay(column, row, knobs.layKind);
      }
    }
  },

  struck() {
    return false;
  },

  // The shell refuses; the head end — the front `headWidth` of him — takes it.
  armour(creature, x) {
    const head =
      creature.facing === 1
        ? x >= creature.x + WIDTH - gameConfig.creatures.snailElder.headWidth
        : x < creature.x + gameConfig.creatures.snailElder.headWidth;
    return head ? null : SHELL;
  },

  // The stalks, hanging from the ceiling end on the head side, two pixels
  // wide at his size, an eye at the tip in the silver's light.
  decorate(pixel, creature, frame, demade) {
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const stalk = demade ? canvasPalette.demakeInk : BRICK_COLORS["2"].light;
    const eye = demade ? canvasPalette.demakeInk : BRICK_COLORS.S.light;
    const head = creature.facing === 1 ? WIDTH - 2 : 0;
    const sway = Math.floor(frame / SNAIL_ELDER.frameTicks) % 2 === 0 ? 0 : -creature.facing;
    for (const inset of STALK_INSETS) {
      const column = x + head - creature.facing * inset;
      pixel(column, y + 2, 2, STALK_HEIGHT - 2, stalk);
      pixel(column + sway, y + STALK_HEIGHT, 2, 2, eye);
    }
  },
};
