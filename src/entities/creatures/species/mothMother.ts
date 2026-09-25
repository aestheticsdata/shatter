import { gameConfig } from "@core/config/GameConfig";
import { BOSS_GROWTH, grown } from "@entities/creatures/bitmap";
import { MOTH, MOTH_FRAMES } from "@entities/creatures/species/moth";
import { CREATURE } from "@interfaces/creatures";
import { canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * THE MOTH MOTHER (SHA-213): the boss at the end of level 15, TETRA.
 *
 * Her children loop round the eye and drop a capsule when hit; she is the same
 * creature four times the size, and she does the same thing twelve times over. She
 * flies a figure of eight across the whole upper field — wide and slow enough
 * to be led, never where she was a second ago — and the ball passes through
 * her like through any moth: one strike a pass, a capsule out of her every
 * time. Twelve hits is twelve capsules, which is the fight's own reward and
 * the reason it is a shower and not a siege.
 *
 * What she does back is the dust. On a clock she stops and shakes her wings,
 * and the lights go out for a few seconds — BLACKOUT's own pools, the field
 * dark but for the light travelling with the ball — so the fight is played
 * in flashes of dark with a dozen capsules falling through them. The shake
 * is the telegraph: she hangs still and sheds before the dark comes.
 */
const WIDTH = MOTH.width * BOSS_GROWTH;
const HEIGHT = MOTH.height * BOSS_GROWTH;

const MOTHER_STATE = { ENTER: "enter", FLY: "fly", SHAKE: "shake" } as const;
const DUST = "DUST";
const DUST_SPECKS = 10;

function centreX(creature: Creature): number {
  return creature.x + WIDTH / 2;
}

/** Where on the eight she is at `t`: the lemniscate over the field's upper half. */
function onEight(t: number): { x: number; y: number } {
  const { centreY, reachX, reachY } = gameConfig.creatures.mothMother;
  return {
    x: gameConfig.field.width / 2 + Math.sin(t) * reachX,
    y: centreY + Math.sin(t) * Math.cos(t) * reachY * 2,
  };
}

export const MOTH_MOTHER: Species = {
  kind: CREATURE.MOTH_MOTHER,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.mothMother.hitPoints;
  },
  get points() {
    return gameConfig.creatures.mothMother.points;
  },
  get killPoints() {
    return gameConfig.creatures.mothMother.killPoints;
  },
  tip: "WHEN SHE SHUDDERS, THE DARK IS COMING",
  lore: "THE MOTHER OF EVERY MOTH, FOUR TIMES THEIR SIZE AND TWELVE TIMES THEIR TROUBLE. SHE FLIES A GREAT FIGURE OF EIGHT ACROSS THE ROOM, AND EVERY HIT SHAKES ANOTHER CAPSULE LOOSE. BUT WHEN SHE HANGS STILL AND SHUDDERS, BEWARE: HER DUST PUTS THE LIGHTS OUT, AND THE FIGHT GOES ON IN THE DARK.",
  solid: false,
  frames: MOTH_FRAMES.map(grown),
  frameTicks: 8,
  palette: MOTH.palette,
  demade: MOTH.demade,
  outline: MOTH.outline,

  spawn(creature) {
    creature.state = MOTHER_STATE.ENTER;
    creature.phase = 0;
  },

  step(creature, _sight, effects) {
    const knobs = gameConfig.creatures.mothMother;
    const { left, right, top } = gameConfig.field;
    const place = (x: number, y: number): void => {
      creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, x - WIDTH / 2));
      creature.y = Math.max(top + 1, Math.min(gameConfig.paddle.y - HEIGHT - 4, y - HEIGHT / 2));
    };
    switch (creature.state) {
      case MOTHER_STATE.ENTER: {
        // Down from above the ceiling to the start of the eight, and off along it.
        const start = onEight(0);
        const dx = start.x - centreX(creature);
        const dy = start.y - (creature.y + HEIGHT / 2);
        const distance = Math.hypot(dx, dy);
        if (distance <= knobs.enterSpeed) {
          place(start.x, start.y);
          creature.state = MOTHER_STATE.FLY;
          creature.clock = 0;
          return;
        }
        creature.x += (dx / distance) * knobs.enterSpeed;
        creature.y += (dy / distance) * knobs.enterSpeed;
        return;
      }
      case MOTHER_STATE.FLY: {
        const wobbleAt = creature.clock * knobs.wobbleRate;
        const before = onEight(creature.phase);
        creature.phase += knobs.turn;
        const at = onEight(creature.phase);
        creature.facing = at.x < before.x ? -1 : 1;
        place(at.x + Math.sin(wobbleAt) * knobs.wobble, at.y + Math.cos(wobbleAt * 1.3) * knobs.wobble * 0.6);
        if (creature.clock >= knobs.dustEvery) {
          creature.state = MOTHER_STATE.SHAKE;
          creature.clock = 0;
        }
        return;
      }
      default: {
        // Hanging still and shuddering: one moth's pixel either way on a quick beat.
        const at = onEight(creature.phase);
        place(at.x + (creature.clock % 4 < 2 ? -BOSS_GROWTH : BOSS_GROWTH), at.y);
        if (creature.clock >= knobs.shakeTicks) {
          effects.dust(knobs.dustTicks);
          effects.pop(centreX(creature), creature.y - 6, DUST, true);
          creature.state = MOTHER_STATE.FLY;
          creature.clock = 0;
        }
      }
    }
  },

  // Her children's rule, at her size: every hit shakes a capsule out of her.
  // She dies of her hit points, not of the hit.
  struck(creature, _by, effects) {
    effects.dropCapsule(centreX(creature), creature.y + HEIGHT / 2);
    return false;
  },

  // The dust coming off her while she shakes: specks falling under the wings,
  // placed off her clock so they drift down across the shake rather than
  // sitting still.
  decorate(pixel, creature, _frame, demade) {
    if (creature.state !== MOTHER_STATE.SHAKE) {
      return;
    }
    const tone = demade ? canvasPalette.demakeInk : MOTH.palette.w;
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const size = BOSS_GROWTH / 2;
    for (let speck = 0; speck < DUST_SPECKS; speck += 1) {
      const fall = (creature.clock * 2 + speck * 11) % HEIGHT;
      pixel(
        x + Math.round(((speck + 0.5) * WIDTH) / DUST_SPECKS) + (speck % 2),
        y + HEIGHT - 8 + fall,
        size,
        size,
        tone,
      );
    }
  },
};
