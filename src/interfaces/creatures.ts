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
  // The bosses are species too, only bigger (SHA-209, SHA-213).
  SPIDER_QUEEN: "spiderQueen",
  MOTH_MOTHER: "mothMother",
  FROG_KING: "frogKing",
  SNAIL_ELDER: "snailElder",
} as const;

export type CreatureKind = (typeof CREATURE)[keyof typeof CREATURE];

/** One creature a level puts down: which, and where its sprite's top-left starts. */
export interface CreaturePin {
  kind: CreatureKind;
  x: number;
  y: number;
}
