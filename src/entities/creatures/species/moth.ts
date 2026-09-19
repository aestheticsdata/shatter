import { gameConfig } from "@core/config/GameConfig";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, CreatureSight, Species } from "@entities/creatures/Creature";

/**
 * MOTH (SHA-207): it flutters in a wobbly loop round the eye, and it carries a
 * capsule — one hit and it drops it.
 *
 * The gentlest thing in the bestiary and the first the player meets, on
 * SUNRISE: a target that moves but never fights back, worth a capsule to
 * whoever can hit a thing that is never quite where it was. The loop is round
 * the Observer's socket rather than round its own pin, so the moth is the eye's
 * moth — on SUNRISE it dips under the horizon with the sun and comes back up.
 *
 * Not solid: a ball passes through a moth as it would through anything that
 * light. The flash is what keeps the strike from landing twice.
 */
const WIDTH = 16;
const HEIGHT = 10;

// Wings out flat, an eyespot on each: the frame that says moth and not bird.
const SPREAD: readonly string[] = [
  "..kk........kk..",
  ".kwwk......kwwk.",
  "kwwswk....kwswwk",
  "kwwwwwk..kwwwwwk",
  "kwwwwwkbbkwwwwwk",
  ".kwwwwkbbkwwwwk.",
  "..kwwwkbbkwwwk..",
  "...kwwkbbkwwk...",
  "....kkkbbkkk....",
  ".......kk.......",
];

// Wings pulled up and in, the body hanging under them.
const RAISED: readonly string[] = [
  "....kkk..kkk....",
  "...kwwwkkwwwk...",
  "..kwswwkkwwswk..",
  "..kwwwwkkwwwwk..",
  "..kwwwkbbkwwwk..",
  "...kwwkbbkwwk...",
  "....kwkbbkwk....",
  ".....kkbbkk.....",
  ".......bb.......",
  ".......kk.......",
];

function centre(creature: Creature, sight: CreatureSight): { x: number; y: number } {
  return sight.eye ?? creature.home;
}

export const MOTH: Species = {
  kind: CREATURE.MOTH,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.moth.hitPoints;
  },
  get points() {
    return gameConfig.creatures.moth.points;
  },
  get killPoints() {
    return gameConfig.creatures.moth.killPoints;
  },
  solid: false,
  frames: [SPREAD, RAISED],
  frameTicks: 6,
  // Dusty silver wings with a blue eyespot each, on a brown body, outlined in
  // the silver's dark. None of it yellow: the house keeps that colour for what
  // pays.
  palette: {
    k: BRICK_COLORS.S.dark,
    w: BRICK_COLORS.S.light,
    s: BRICK_COLORS["5"].flat,
    b: BRICK_COLORS["2"].dark,
  },
  // Wings to ground, outline, spots and body to ink: the spread and the two
  // spots survive the tube.
  demade: {
    k: canvasPalette.demakeInk,
    w: canvasPalette.demakeGround,
    s: canvasPalette.demakeInk,
    b: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    // Where on the loop it starts: read off the pin, so two moths on one level
    // are never at the same point of the same circle.
    creature.phase = (creature.home.x / gameConfig.field.width) * Math.PI * 2;
  },

  step(creature, sight) {
    const { orbitX, orbitY, turn, wobble, wobbleRate } = gameConfig.creatures.moth;
    const { left, right, top } = gameConfig.field;
    const around = centre(creature, sight);
    const angle = creature.phase + creature.clock * turn;
    const wobbleAt = creature.clock * wobbleRate;
    const x = around.x + Math.cos(angle) * orbitX + Math.sin(wobbleAt) * wobble;
    const y = around.y + Math.sin(angle) * orbitY + Math.cos(wobbleAt * 1.3) * wobble * 0.6;
    creature.facing = Math.sin(angle) < 0 ? -1 : 1;
    creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, x - WIDTH / 2));
    creature.y = Math.max(top + 1, Math.min(gameConfig.paddle.y - HEIGHT - 4, y - HEIGHT / 2));
  },

  struck(creature, _by, effects) {
    effects.dropCapsule(creature.x + WIDTH / 2, creature.y + HEIGHT / 2);
    return true;
  },
};
