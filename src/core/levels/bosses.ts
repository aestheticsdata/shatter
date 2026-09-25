import { CREATURE } from "@interfaces/creatures";

import type { CreatureKind } from "@interfaces/creatures";

/**
 * Which boss ends which level (SHA-209), by 0-based index, and what the clear
 * card calls it. A boss level with no entry here clears like any other until
 * its fight lands. The veils on 10, 20, 30, 40 and 49 have one too (SHA-261):
 * it comes down when the veil breaks, on top of the eye it came after.
 */
export const BOSS_OF_LEVEL: Readonly<Partial<Record<number, CreatureKind>>> = {
  4: CREATURE.SPIDER_QUEEN,
  9: CREATURE.BAT_COUNT,
  14: CREATURE.MOTH_MOTHER,
  19: CREATURE.SCARAB,
  24: CREATURE.FROG_KING,
  29: CREATURE.CRAB_BARON,
  34: CREATURE.SNAIL_ELDER,
  39: CREATURE.DRUMMER,
  44: CREATURE.MAN_O_WAR,
  48: CREATURE.GREAT_SLUG,
};

export const BOSS_NAME: Readonly<Partial<Record<CreatureKind, string>>> = {
  spiderQueen: "THE SPIDER QUEEN",
  mothMother: "THE MOTH MOTHER",
  frogKing: "THE FROG KING",
  snailElder: "THE SNAIL ELDER",
  manOWar: "THE MAN O' WAR",
  batCount: "THE BAT COUNT",
  scarab: "THE SCARAB",
  crabBaron: "THE CRAB BARON",
  drummer: "THE DRUMMER",
  greatSlug: "THE GREAT SLUG",
};
