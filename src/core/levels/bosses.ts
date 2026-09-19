import { CREATURE } from "@interfaces/creatures";

import type { CreatureKind } from "@interfaces/creatures";

/**
 * Which boss ends which level (SHA-209), by 0-based index, and what the clear
 * card calls it. A boss level with no entry here clears like any other until
 * its fight lands — the veils on 10, 20, 30, 40 and 43 are their own bosses
 * and are not listed.
 */
export const BOSS_OF_LEVEL: Readonly<Partial<Record<number, CreatureKind>>> = {
  4: CREATURE.SPIDER_QUEEN,
};

export const BOSS_NAME: Readonly<Partial<Record<CreatureKind, string>>> = {
  spiderQueen: "THE SPIDER QUEEN",
};
