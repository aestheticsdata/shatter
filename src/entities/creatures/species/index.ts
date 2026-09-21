import { BAT } from "@entities/creatures/species/bat";
import { FROG } from "@entities/creatures/species/frog";
import { FROG_KING } from "@entities/creatures/species/frogKing";
import { MOTH } from "@entities/creatures/species/moth";
import { MOTH_MOTHER } from "@entities/creatures/species/mothMother";
import { SNAIL } from "@entities/creatures/species/snail";
import { SNAIL_ELDER } from "@entities/creatures/species/snailElder";
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
  bat: BAT,
  spiderQueen: SPIDER_QUEEN,
  mothMother: MOTH_MOTHER,
  frogKing: FROG_KING,
  snailElder: SNAIL_ELDER,
};
