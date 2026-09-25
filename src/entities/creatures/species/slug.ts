import { gameConfig } from "@core/config/GameConfig";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * SLUG (SHA-246): it takes the rail.
 *
 * It crawls along the rail the deck slides on, laying slime behind it, and
 * over a slimed stretch the deck skids — it carries past where you point
 * instead of stopping there. Pop the slug and the slime it has already laid
 * stays until it dries on its own clock.
 *
 * **To kill it you have to stand in its slime.** It lives on the rail, so its
 * back and stalks stand just above the deck's line and nothing else reaches
 * it: a ball caught on the deck right over the slug squashes it on the way
 * down, and a ball that misses the deck and takes it is still a ball lost.
 * Three hits, the cheapest thing in the bestiary per hit, and like the snail
 * the answer is to kill it early — every second it lives is another stretch
 * of rail the player has to play around.
 */
export const SLUG_STATE = { CRAWL: "crawl" } as const;

const WIDTH = 16;
/**
 * Nine, of which the body is the bottom six: the top three are the stalks,
 * blank in the bitmap and drawn by `decorate` on the end it is crawling
 * toward, since the bitmap does not turn with it — the snail's split.
 */
const HEIGHT = 9;

/**
 * Where its belly rests, below the rail line: the slime is laid along the
 * deck's own band, and the body sits in it.
 */
const BELLY = 4;

// A shell-less snail: a long foot rounded at both ends so either can be the
// head, a mantle saddle over the front half with the leopard slug's spots in
// it, and the same spots down the flank.
export const CRAWL_A: readonly string[] = [
  "................",
  "................",
  "................",
  "....kkkkkkkk....",
  "..kkmsmmmmsmkk..",
  ".kbbmmmsmmmmbbk.",
  "kbbsbbbbbbbsbbbk",
  "kbbbbbbbbbbbbbbk",
  ".kkkkkkkkkkkkkk.",
];

// The foot rippling, which is the only thing on a slug that says it is moving.
export const CRAWL_B: readonly string[] = [
  "................",
  "................",
  "................",
  "....kkkkkkkk....",
  "..kkmsmmmmsmkk..",
  ".kbbmmmsmmmmbbk.",
  "kbbsbbbbbbbsbbbk",
  "kbbbbbbbbbbbbbbk",
  ".k.kkk.kk.kkk.k.",
];

// Where the two stalks stand in from the head end, and how tall they are.
const STALK_INSETS: readonly number[] = [1, 3];
const STALK_HEIGHT = 4;

export const SLUG: Species = {
  kind: CREATURE.SLUG,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.slug.hitPoints;
  },
  get points() {
    return gameConfig.creatures.slug.points;
  },
  get killPoints() {
    return gameConfig.creatures.slug.killPoints;
  },
  tip: "CATCH THE BALL RIGHT ON TOP OF IT",
  lore: "IT CRAWLS ALONG YOUR RAIL — YOUR RAIL — LEAVING A GLEAMING TRAIL OF SLIME, AND OVER THE SLICK YOUR DECK SKIDS PAST WHERE YOU POINT IT. IT LIVES DOWN WHERE ONLY A CAUGHT BALL CAN REACH IT, SO TO SQUASH IT YOU MUST STAND IN ITS MESS. THE SLIME IT LEAVES STAYS UNTIL IT DRIES.",
  // A shelf on the rail would be a second deck, and one the player did not
  // choose where to put. The ball goes through it and squashes it.
  solid: false,
  frames: [CRAWL_A, CRAWL_B],
  frameTicks: 16,
  // The moss brick's three: an olive body, the saddle a step darker, outline
  // and spots in its dark. Not the frog's and the vine's green, and nothing
  // orange — that is the snail's, and the two share a level.
  palette: {
    k: BRICK_COLORS.F.dark,
    b: BRICK_COLORS.F.light,
    m: BRICK_COLORS.F.flat,
    s: BRICK_COLORS.F.dark,
  },
  // Outline and saddle to ink, foot to ground, and the spots as holes in the
  // saddle: on the tube, a lit hump on a hollow foot.
  demade: {
    k: canvasPalette.demakeInk,
    b: canvasPalette.demakeGround,
    m: canvasPalette.demakeInk,
    s: canvasPalette.demakeGround,
  },
  outline: "k",

  spawn(creature) {
    creature.state = SLUG_STATE.CRAWL;
    // On the rail wherever the level pinned it across, whatever height it
    // gave: a slug has nowhere else to be. It sets off toward the middle.
    creature.y = gameConfig.paddle.y + BELLY - HEIGHT;
    creature.home = { x: creature.x, y: creature.y };
    creature.facing = creature.x + WIDTH / 2 < gameConfig.field.width / 2 ? 1 : -1;
  },

  step(creature, _sight, effects) {
    const { speed, slimeTicks } = gameConfig.creatures.slug;
    const { left, right } = gameConfig.field;
    creature.x += creature.facing * speed;
    if (creature.x <= left + 1 || creature.x >= right - 1 - WIDTH) {
      creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x));
      creature.facing = creature.facing === 1 ? -1 : 1;
    }
    // Under the foot, a pixel in from each rounded end: the slime is what it
    // leaves on the rail, and it leaves it everywhere it has been.
    effects.slime(creature.x + 1, WIDTH - 2, slimeTicks);
  },

  // Three hits and nothing special about any of them.
  struck() {
    return false;
  },

  /**
   * The stalks, on the end it is crawling toward, each with its eye on top.
   * White for the whole flash like the frog's legs, since they are drawn in
   * the outline's tone and the outline whitens first.
   */
  decorate(pixel, creature, _frame, demade, unit) {
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const white = creature.flashTicks > 0;
    const stalk = white ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.F.flat;
    const eye = white ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.F.dark;
    // A hair in HD, like the jellyfish's strands: a stalk is not a post.
    const thickness = unit > 1 ? 2 / unit : 1;
    // A lean forward on the ripple frame, so the stalks feel the way along.
    const lean = Math.floor(creature.clock / 16) % 2 === 1 ? creature.facing / unit : 0;
    for (const inset of STALK_INSETS) {
      const column = creature.facing === 1 ? WIDTH - 1 - inset : inset;
      pixel(x + column, y + 3, thickness, 1, stalk);
      pixel(x + column + lean, y + 4 - STALK_HEIGHT, thickness, STALK_HEIGHT - 1, stalk);
      pixel(x + column + lean, y + 4 - STALK_HEIGHT, 1, 1, eye);
    }
  },
};
