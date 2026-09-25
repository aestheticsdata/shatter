import { BAT } from "@entities/creatures/species/bat";
import { BEETLE } from "@entities/creatures/species/beetle";
import { CRAB } from "@entities/creatures/species/crab";
import { FIREFLY } from "@entities/creatures/species/firefly";
import { FROG } from "@entities/creatures/species/frog";
import { FROG_KING } from "@entities/creatures/species/frogKing";
import { JELLYFISH } from "@entities/creatures/species/jellyfish";
import { MOTH } from "@entities/creatures/species/moth";
import { MOTH_MOTHER } from "@entities/creatures/species/mothMother";
import { SLUG } from "@entities/creatures/species/slug";
import { SNAIL } from "@entities/creatures/species/snail";
import { SNAIL_ELDER } from "@entities/creatures/species/snailElder";
import { SPIDER } from "@entities/creatures/species/spider";
import { SPIDER_QUEEN } from "@entities/creatures/species/spiderQueen";
import { VINE } from "@entities/creatures/species/vine";
import { WISP } from "@entities/creatures/species/wisp";
import { WOODPECKER } from "@entities/creatures/species/woodpecker";

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
  beetle: BEETLE,
  woodpecker: WOODPECKER,
  vine: VINE,
  wisp: WISP,
  firefly: FIREFLY,
  crab: CRAB,
  jellyfish: JELLYFISH,
  slug: SLUG,
  spiderQueen: SPIDER_QUEEN,
  mothMother: MOTH_MOTHER,
  frogKing: FROG_KING,
  snailElder: SNAIL_ELDER,
};
