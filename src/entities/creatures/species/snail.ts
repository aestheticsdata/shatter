import { gameConfig } from "@core/config/GameConfig";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, CreatureSight, Species } from "@entities/creatures/Creature";

/**
 * SNAIL (SHA-208, SHA-210): it crawls a flat run of the wall, left and right,
 * and every brick it passes over gets a hit point back.
 *
 * The first thing in the bestiary that works against the player rather than
 * beside them: a slow mason on a row of bricks, mortaring what the ball has
 * cracked. Three hits to kill and it never fights back, so the whole question
 * is whether to spend the rally on the snail or on the wall it is mending —
 * kill it early and the wall comes down like any other. It needs a road: the
 * levels put it only where six bricks or more stand in a row (VORTEX's top,
 * SERPENT's, MAZE's), because a snail that hovered over a gap or climbed a
 * step read as a bug the first time it was seen.
 *
 * Solid: a ball bounces off its shell like off a beast. The mortar itself is
 * the game's verb, capped at the brick's own kind; the snail only says where.
 */
const WIDTH = 16;
const HEIGHT = 10;

/**
 * Crawling its run, or falling off it. A snail cannot jump and will not
 * hover: it paces the flat run of bricks it was put on — turning where the
 * next column is higher, lower or gone — and the one thing that moves it off
 * that run is the brick under it dying, which drops it straight down onto the
 * next brick in the column, or onto the floor, where it splats.
 */
const SNAIL_STATE = { CRAWL: "crawl", FALL: "fall" } as const;
const SPLAT = "SPLAT";

// The eye stalks are drawn by `decorate`, on the side the snail is walking
// toward, since the bitmap does not turn with it: where they stand in from
// the head end, where they top out, and how tall they are.
const STALK_INSETS: readonly number[] = [0, 2];
const STALK_TOP = 1;
const STALK_HEIGHT = 6;

// The shell centred on a foot that runs the full width, both ends rounded so
// either can be the tail, and a pixel of air between the shell and the head
// end so the stalks stand clear of it. A spiral in the shell's dark, open at
// the bottom right, and a highlight where the light falls on it.
const CRAWL_A: readonly string[] = [
  "......kkkk......",
  ".....kllook.....",
  "....klkkkkok....",
  "....klkookok....",
  "....kokkokok....",
  "....kokooook....",
  ".....kokkok.....",
  ".kbbbbkkkkbbbbk.",
  "kbbbbbbbbbbbbbbk",
  ".kkkkkkkkkkkkkk.",
];

// The same snail with the foot's underside rippling: the one thing on it that
// says it is walking rather than parked.
const CRAWL_B: readonly string[] = [
  "......kkkk......",
  ".....kllook.....",
  "....klkkkkok....",
  "....klkookok....",
  "....kokkokok....",
  "....kokooook....",
  ".....kokkok.....",
  ".kbbbbkkkkbbbbk.",
  "kbbbbbbbbbbbbbbk",
  ".k.kkk.kk.kkk.k.",
];

/** Both frames, for the elder to grow out of (SHA-213). */
export const SNAIL_FRAMES: readonly (readonly string[])[] = [CRAWL_A, CRAWL_B];

function columnUnder(creature: Creature): number {
  const { left, brickWidth } = gameConfig.grid;
  return Math.floor((creature.x + WIDTH / 2 - left) / brickWidth);
}

/** The topmost standing row in that column, or null where the wall is gone. */
function skyline(sight: CreatureSight, column: number): number | null {
  for (let row = 0; row < sight.wallRows; row += 1) {
    if (sight.standing(column, row)) {
      return row;
    }
  }
  return null;
}

export const SNAIL: Species = {
  kind: CREATURE.SNAIL,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.snail.hitPoints;
  },
  get points() {
    return gameConfig.creatures.snail.points;
  },
  get killPoints() {
    return gameConfig.creatures.snail.killPoints;
  },
  blurb: "IT MENDS EVERY BRICK IT CRAWLS",
  solid: true,
  frames: SNAIL_FRAMES,
  frameTicks: 12,
  // The orange brick's three tones for the shell, the spiral and outline in
  // its dark, and the same orange's light for the paler foot under it.
  palette: {
    k: BRICK_COLORS["2"].dark,
    o: BRICK_COLORS["2"].flat,
    l: BRICK_COLORS["2"].light,
    b: BRICK_COLORS["2"].light,
  },
  // Shell to ground, spiral and outline to ink, and the foot solid ink: on the
  // tube it is a hollow shell with a curl in it, on a bar of light.
  demade: {
    k: canvasPalette.demakeInk,
    o: canvasPalette.demakeGround,
    l: canvasPalette.demakeGround,
    b: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    creature.state = SNAIL_STATE.CRAWL;
    // The column it is born over is not one it has passed: `phase` holds the
    // last column under its centre, and the mortar goes out when that changes.
    creature.phase = columnUnder(creature);
  },

  step(creature, sight, effects) {
    const { speed, climb } = gameConfig.creatures.snail;
    const { left, brickWidth, brickHeight, columns, top } = gameConfig.grid;
    const floor = gameConfig.observer.tears.floorY - HEIGHT;

    const under = columnUnder(creature);
    const rowUnder = skyline(sight, under);
    const support = rowUnder === null ? null : top + rowUnder * brickHeight - HEIGHT;

    // Off its brick: the one under it is gone, or what is left of the column
    // is lower than where it stands. It drops at the climb's pace onto the
    // next brick down — or onto the floor, and a snail does not survive that.
    if (creature.state === SNAIL_STATE.FALL || support === null || support > creature.y + 0.5) {
      creature.state = SNAIL_STATE.FALL;
      creature.vx = 0;
      const landing = support !== null && support >= creature.y ? support : floor;
      creature.y = Math.min(landing, creature.y + climb);
      if (creature.y < landing) {
        return;
      }
      if (landing === floor) {
        effects.burst(creature.x + WIDTH / 2, creature.y + HEIGHT / 2, "2");
        effects.pop(creature.x + WIDTH / 2, creature.y - 6, SPLAT, false);
        creature.alive = false;
        return;
      }
      creature.state = SNAIL_STATE.CRAWL;
      creature.phase = under;
      return;
    }

    // The run: the column its front edge would enter next has to be the same
    // height as the one it stands on — higher is a wall, lower or gone is an
    // edge — or it turns round. The grid's own ends are edges too.
    const frontX = creature.facing === 1 ? creature.x + WIDTH + speed : creature.x - speed;
    const ahead = Math.floor((frontX - left) / brickWidth);
    if (ahead < 0 || ahead >= columns || skyline(sight, ahead) !== rowUnder) {
      creature.facing = creature.facing === 1 ? -1 : 1;
      creature.vx = 0;
      return;
    }
    creature.x += creature.facing * speed;
    creature.vx = creature.facing * speed;

    // A brick passed over is a brick mended, once per column entered.
    const column = columnUnder(creature);
    if (column !== creature.phase && rowUnder !== null) {
      creature.phase = column;
      effects.mortar(column, rowUnder);
    }
  },

  struck() {
    return false;
  },

  // The stalks, on the head end, each an eye on top in the silver's light so
  // the eyes are the brightest thing on it. On the alternate frame they sway a
  // pixel back toward the shell: inward, never outside the box the ball hits.
  decorate(pixel, creature, frame, demade) {
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const stalk = demade ? canvasPalette.demakeInk : BRICK_COLORS["2"].light;
    const eye = demade ? canvasPalette.demakeInk : BRICK_COLORS.S.light;
    const head = creature.facing === 1 ? WIDTH - 1 : 0;
    const sway = Math.floor(frame / SNAIL.frameTicks) % 2 === 0 ? 0 : -creature.facing;
    for (const inset of STALK_INSETS) {
      const column = x + head - creature.facing * inset;
      pixel(column, y + STALK_TOP + 1, 1, STALK_HEIGHT - 1, stalk);
      pixel(column + sway, y + STALK_TOP, 1, 1, eye);
    }
  },
};
