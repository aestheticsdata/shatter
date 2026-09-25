import type { ParticleKind } from "@interfaces/particles";

/**
 * THE BESTIARY's names (SHA-207): the species a level may pin, as constants,
 * so level data, the registry, the console and the renderer spell them the
 * same way and a typo is a type error rather than an empty level.
 *
 * Twenty are on paper (`docs/superpowers/specs/2026-09-19-observer-one-eye-43-placements.md`);
 * a name is added here the day its species lands.
 */
export const CREATURE = {
  MOTH: "moth",
  FROG: "frog",
  SNAIL: "snail",
  SPIDER: "spider",
  BAT: "bat",
  BEETLE: "beetle",
  WOODPECKER: "woodpecker",
  VINE: "vine",
  WISP: "wisp",
  FIREFLY: "firefly",
  CRAB: "crab",
  JELLYFISH: "jellyfish",
  SLUG: "slug",
  // The bosses are species too, only bigger (SHA-209, SHA-213).
  SPIDER_QUEEN: "spiderQueen",
  MOTH_MOTHER: "mothMother",
  FROG_KING: "frogKing",
  SNAIL_ELDER: "snailElder",
  MAN_O_WAR: "manOWar",
  // The veils' own bosses (SHA-261), the ones that come down when a veil breaks.
  BAT_COUNT: "batCount",
  SCARAB: "scarab",
  CRAB_BARON: "crabBaron",
  DRUMMER: "drummer",
  GREAT_SLUG: "greatSlug",
} as const;

export type CreatureKind = (typeof CREATURE)[keyof typeof CREATURE];

/**
 * THE BROOD's entry on the BESTIARY page (SHA-253). Not a species — the veils'
 * beasts are their own system (`Brood`), three forms and one walk — but they
 * are creatures on the field all the same, and the page that shows the others
 * would be short of the ones that hatch.
 */
export const BESTIARY_BROOD = "brood";

/**
 * Everything the BESTIARY page has an entry for: every species, the brood, and
 * THE CHAMBER's four particles (SHA-185) — not creatures, but things loose in
 * the field that the player has to learn the rules of all the same.
 */
export type BestiaryKind = CreatureKind | typeof BESTIARY_BROOD | ParticleKind;

/** One creature a level puts down: which, and where its sprite's top-left starts. */
export interface CreaturePin {
  kind: CreatureKind;
  x: number;
  y: number;
}
