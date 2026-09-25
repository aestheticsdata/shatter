import { gameConfig } from "@core/config/GameConfig";
import { BOSS_GROWTH, grown } from "@entities/creatures/bitmap";
import { CRAWL_A, CRAWL_B, SLUG } from "@entities/creatures/species/slug";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * THE GREAT SLUG (SHA-261): the boss that comes down when THE LID's pupil is
 * blinded — the last thing between the player and the end of the loop.
 *
 * His children take the rail by crawling on it. He takes it from above: he
 * crawls the band under the wall, end to end, and what drips off him slimes
 * the rail beneath, so the deck skids wherever he has been over it. His shots
 * are the slime itself, in gobs.
 */
const FRAMES = [grown(CRAWL_A), grown(CRAWL_B)];
const WIDTH = FRAMES[0][0].length;
const HEIGHT = FRAMES[0].length;

// The slug's stalks, grown with him: two, stood in from the head end.
const STALK_INSETS: readonly number[] = [1, 3].map((inset) => inset * BOSS_GROWTH);
const STALK_HEIGHT = 4 * BOSS_GROWTH;
const STALK_WIDTH = BOSS_GROWTH;

const SLUG_BOSS_STATE = { ENTER: "enter", CRAWL: "crawl" } as const;

export const GREAT_SLUG: Species = {
  kind: CREATURE.GREAT_SLUG,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.greatSlug.hitPoints;
  },
  get points() {
    return gameConfig.creatures.greatSlug.points;
  },
  get killPoints() {
    return gameConfig.creatures.greatSlug.killPoints;
  },
  tip: "PLAY AROUND THE WET RAIL",
  lore: "THE LAST THING IN THE ROOM WHEN THE PUPIL GOES BLIND. HE CRAWLS THE BAND UNDER THE WALL FROM END TO END, AND WHAT DRIPS OFF HIM SLIMES YOUR RAIL BELOW, SO YOUR DECK SKIDS WHEREVER HE HAS PASSED. HIS SHOTS ARE THE SLIME ITSELF, IN GOBS.",
  solid: false,
  frames: FRAMES,
  frameTicks: 16,
  palette: SLUG.palette,
  demade: SLUG.demade,
  outline: SLUG.outline,

  spawn(creature) {
    creature.state = SLUG_BOSS_STATE.ENTER;
    creature.facing = 1;
  },

  step(creature, sight, effects) {
    const knobs = gameConfig.creatures.greatSlug;
    const { left, right } = gameConfig.field;
    if (creature.state === SLUG_BOSS_STATE.ENTER) {
      // Down to the band under the wall: the rows it was built with, and a gap.
      const band = gameConfig.grid.top + sight.wallRows * gameConfig.grid.brickHeight + 4;
      creature.y += knobs.enterSpeed;
      if (creature.y >= band) {
        creature.y = band;
        creature.state = SLUG_BOSS_STATE.CRAWL;
        creature.clock = 0;
      }
      return;
    }
    creature.x += creature.facing * knobs.crawlSpeed;
    if (creature.x < left + 1 || creature.x > right - 1 - WIDTH) {
      creature.facing = creature.x < left + 1 ? 1 : -1;
      creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x));
    }
    if (creature.clock % knobs.slimeEvery === 0) {
      effects.slime(creature.x, WIDTH, knobs.slimeTicks);
    }
  },

  struck() {
    return false;
  },

  decorate(pixel, creature, _frame, demade) {
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const white = creature.flashTicks > 0;
    const stalk = white ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.F.flat;
    const eye = white ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.F.dark;
    const top = y + 4 * BOSS_GROWTH - STALK_HEIGHT;
    for (const inset of STALK_INSETS) {
      const column = creature.facing === 1 ? WIDTH - STALK_WIDTH - inset : inset;
      pixel(x + column, top, STALK_WIDTH, STALK_HEIGHT, stalk);
      pixel(x + column - 1, top - 2, STALK_WIDTH + 2, 3, eye);
    }
  },
};
