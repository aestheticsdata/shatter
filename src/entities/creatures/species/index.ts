import { FROG } from "@entities/creatures/species/frog";
import { MOTH } from "@entities/creatures/species/moth";
import { SNAIL } from "@entities/creatures/species/snail";
import { SPIDER } from "@entities/creatures/species/spider";
import { SPIDER_QUEEN } from "@entities/creatures/species/spiderQueen";

import type { Species } from "@entities/creatures/Creature";
import type { CreatureKind } from "@interfaces/creatures";

/**
 * THE BESTIARY's registry (SHA-207): every species by its name. Typed against
 * `CreatureKind`, so a name added to `CREATURE` without a species here is a
 * type error, and the other way round.
 */
export const SPECIES: Readonly<Record<CreatureKind, Species>> = {
  moth: MOTH,
  frog: FROG,
  snail: SNAIL,
  spider: SPIDER,
  spiderQueen: SPIDER_QUEEN,
};
