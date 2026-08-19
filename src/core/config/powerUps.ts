// The capsule roster: one entry per power-up, and the single source of truth
// for every table the game reads about them. Adding a capsule is adding a row
// here — the union type, the lookups below, `DROP_COLORS` and
// `DARK_LETTER_DROP_KINDS` in `@render/palette`, and the dev console's roster
// all derive from it. Nothing else needs an edit.
//
// This module imports nothing on purpose: `@interfaces/types` re-exports
// `PowerUpKind` from here, and a cycle would put half the game's types behind
// a partially initialised module.

// How often a capsule drops, and — for `trap` — whether it is a malus at all.
// The two are one field because they have never disagreed: every trap in the
// roster is a trap precisely because catching it hurts.
export type PowerUpTier = "common" | "uncommon" | "rare" | "trap";

// Relative odds per tier. Four numbers instead of one per row: weights authored
// a capsule at a time flatten out — 9 of the first 15 sat at exactly 1, which is
// no rarity at all. `trap` deliberately outweighs `uncommon`: a trap has to be
// met often enough to teach its blink, and traps are meant to be roughly 18 % of
// what drops once the roster is full.
export const TIER_WEIGHTS: Record<PowerUpTier, number> = {
  common: 1,
  uncommon: 0.6,
  rare: 0.35,
  trap: 0.7,
};

export interface PowerUpDefinition {
  // `string`, not the union — the union is inferred *from* these ids, and typing
  // it as itself would be circular. One or two characters, and internal: the
  // player never sees an id, they read the glyph. Short because it is what the
  // thirty-odd `kind === "..."` branches across the game are written in.
  id: string;
  // The POWER inset label and the catch pop, and what the console accepts
  // alongside the id (`power multi` === `power M`). The glyph painted on the
  // pill is its opening letters — see `POWER_UP_GLYPHS`.
  name: string;
  // Capsule body. Every one of these is checked against the playfield themes by
  // `pnpm run check:backgrounds`, and each new one re-opens all 8 of them.
  //
  // Hue is a soft cue; the glyph is the discriminator. The families the roster
  // fell into, measured rather than decreed: offence warm 340-30° (LASER 352°,
  // BLAST 29°), control cool 170-260° (SWARM 174°, ZAP 190°, WALL 205°, WIDE
  // 213°, RAIN 258°), ball-count green 75-140° (NUKE 77°, MULTI 128°), economy
  // gold 40-75° (PAYDAY 44°, PIERCE 47°). No band is reserved and none bans a
  // capsule — six traps cannot be held apart inside one 35° hazard band, and a
  // trap tells on itself through the blink and the pink pop, which are
  // hue-independent. TEMPO (5 % saturation), GLUE (30°, dark enough to read
  // brown) and 1UP (330°) sit outside every band and stay there.
  //
  // The rule for a new body is **>= 58 RGB from every other capsule and from the
  // ball**, and nothing else is a hard constraint.
  //
  // Bricks deliberately are not: six capsules wear a brick's exact colour by the
  // game's original design — WIDE is the blue brick, MULTI the green, LASER the
  // red, PIERCE the yellow, BLAST the orange, PAYDAY the gold. A capsule is a
  // moving pill with a letter and a sheen; it was never going to be mistaken for
  // a static brick, and matching them is the look.
  //
  // Saturation is an aim, not a floor. Reach for something vivid, but a pale body
  // is fine when the distance holds: TEMPO at 5 % and WALL at 44 % both shipped
  // long before anyone wrote a number down, and 34 capsules cannot all be vivid
  // and 58 apart at once.
  //
  // One grandfathered exception: PIERCE and PAYDAY sit 49 apart. Every other pair
  // in the roster clears 58.
  color: string;
  // Dark letter on a light body. Authored, not computed: true iff the body's
  // WCAG luminance is >= 0.28 — today's roster splits cleanly either side of
  // that (GLUE #b07840 = 0.230 is the lightest light, BLAST #f07d10 = 0.332 the
  // darkest dark). A future body inside that gap keeps whatever is authored
  // here; the DEV pass in `@render/checkCapsules` only warns about it.
  dark: boolean;
  // How long the effect lasts, in 60 Hz ticks. 0 for the instantaneous and
  // one-shot capsules (see `timed`).
  ticks: number;
  // Rarity, and for `trap` the malus tell as well — `MALUS_KINDS` below is that
  // tier, and it drives the blinking glyph, the pink catch pop and the womp, so
  // a new trap is one word here rather than three more `=== "J"` branches.
  // Odds are relative within a roll: whether a brick drops anything at all is
  // `gameConfig.rules.bonusSpreadAmount`.
  tier: PowerUpTier;
  // Whether `PowerUpTimers` counts it down. W (WALL) is a one-shot charge owned
  // by the game and N (NUKE) is driven by the Detonation, so neither is timed.
  // S (SWARM) is instantaneous like M: its timer only keeps the inset label lit.
  // U/Z/R/Q are instantaneous with no lingering state at all — the catch pop is
  // their whole acknowledgment, and BM ends the life it was caught on.
  timed: boolean;
}

// One row per capsule, and it must stay one row: the field names are short so a
// two-character id and a name as long as BLACKOUT still fit inside 120 columns.
export const POWER_UPS = [
  { id: "E", name: "WIDE", color: "#2d7fe0", dark: false, ticks: 720, tier: "common", timed: true },
  { id: "M", name: "MULTI", color: "#3fbf4f", dark: true, ticks: 180, tier: "common", timed: true },
  { id: "L", name: "LASER", color: "#e8384f", dark: false, ticks: 720, tier: "common", timed: true },
  { id: "P", name: "PIERCE", color: "#ffcf1c", dark: true, ticks: 480, tier: "uncommon", timed: true },
  { id: "B", name: "BLAST", color: "#f07d10", dark: true, ticks: 720, tier: "common", timed: true },
  { id: "W", name: "WALL", color: "#8fd0ff", dark: true, ticks: 0, tier: "uncommon", timed: false },
  { id: "T", name: "TEMPO", color: "#f2f4ff", dark: true, ticks: 480, tier: "common", timed: true },
  { id: "X", name: "PAYDAY", color: "#dfae2c", dark: true, ticks: 600, tier: "uncommon", timed: true },
  { id: "J", name: "JAMMER", color: "#d13be8", dark: false, ticks: 360, tier: "trap", timed: true },
  { id: "N", name: "NUKE", color: "#b6ff00", dark: true, ticks: 0, tier: "rare", timed: false },
  { id: "S", name: "SWARM", color: "#1fd8c4", dark: true, ticks: 180, tier: "rare", timed: true },
  { id: "U", name: "1UP", color: "#ff70b8", dark: true, ticks: 0, tier: "rare", timed: false },
  { id: "Z", name: "ZAP", color: "#4ae0ff", dark: true, ticks: 0, tier: "uncommon", timed: false },
  { id: "R", name: "RAIN", color: "#8a5cf5", dark: false, ticks: 0, tier: "uncommon", timed: false },
  { id: "G", name: "GLUE", color: "#b07840", dark: false, ticks: 720, tier: "common", timed: true },
  { id: "I", name: "STASIS", color: "#9effd6", dark: true, ticks: 90, tier: "common", timed: true },
  { id: "H", name: "HOMING", color: "#00e05a", dark: true, ticks: 480, tier: "common", timed: true },
  { id: "Y", name: "MIRROR", color: "#a878b4", dark: false, ticks: 600, tier: "common", timed: true },
  { id: "C", name: "CHAIN", color: "#3dff8e", dark: true, ticks: 600, tier: "uncommon", timed: true },
  { id: "K", name: "MAGNET", color: "#6fd0b4", dark: true, ticks: 720, tier: "common", timed: true },
  { id: "V", name: "SINGULARITY", color: "#c9a7ff", dark: true, ticks: 720, tier: "uncommon", timed: true },
  { id: "PO", name: "PORTAL", color: "#00b3fa", dark: true, ticks: 1800, tier: "uncommon", timed: true },
  { id: "O", name: "BUMPERS", color: "#ff00aa", dark: false, ticks: 720, tier: "uncommon", timed: true },
  { id: "Q", name: "QUAKE", color: "#ffab6b", dark: true, ticks: 0, tier: "uncommon", timed: false },
  { id: "BM", name: "BOMB", color: "#ff3b00", dark: false, ticks: 0, tier: "trap", timed: false },
  { id: "GH", name: "GHOST", color: "#e1f0b4", dark: true, ticks: 300, tier: "trap", timed: true },
  { id: "CR", name: "CRITTER", color: "#a3e04a", dark: true, ticks: 0, tier: "uncommon", timed: false },
  { id: "RU", name: "RUSH", color: "#e1001b", dark: false, ticks: 300, tier: "trap", timed: true },
  { id: "XW", name: "XWIDE", color: "#0082a0", dark: false, ticks: 720, tier: "rare", timed: true },
  { id: "XR", name: "XRAY", color: "#2aff00", dark: true, ticks: 300, tier: "rare", timed: true },
  { id: "MT", name: "METEOR", color: "#c84b19", dark: false, ticks: 0, tier: "rare", timed: false },
  { id: "SP", name: "SPLIT", color: "#e0607a", dark: false, ticks: 360, tier: "trap", timed: true },
  { id: "VX", name: "VORTEX", color: "#b000fc", dark: false, ticks: 720, tier: "rare", timed: true },
  { id: "BN", name: "BANANA", color: "#e2fe74", dark: true, ticks: 0, tier: "trap", timed: false },
  { id: "D", name: "DEMAKE", color: "#00d200", dark: true, ticks: 480, tier: "trap", timed: true },
] as const satisfies readonly PowerUpDefinition[];

export type PowerUpKind = (typeof POWER_UPS)[number]["id"];

const ALL_NAMES: readonly string[] = POWER_UPS.map((definition) => definition.name);

/**
 * Builds a `Record` keyed by capsule id from one field of each definition —
 * every lookup below, and `DROP_COLORS` in `@render/palette`, is one call.
 *
 * The assertion is the module's only one and the reason this helper exists:
 * `Object.fromEntries` is typed to widen to `Record<string, T>` however precise
 * its input keys are. Each record is built once at load, so nothing downstream
 * allocates per frame or per roll.
 */
export function byId<T>(pick: (definition: PowerUpDefinition) => T): Record<PowerUpKind, T> {
  return Object.fromEntries(POWER_UPS.map((definition) => [definition.id, pick(definition)])) as Record<PowerUpKind, T>;
}

export const POWER_UP_BY_ID: Record<PowerUpKind, PowerUpDefinition> = byId((definition) => definition);
export const POWER_UP_NAMES: Record<PowerUpKind, string> = byId((definition) => definition.name);
/**
 * What `drawCapsule` paints on the pill: **the first two letters of the name**,
 * and more only where two names would collide — MIRROR and MIMIC both open on
 * `MI`, so both go to three; BLAST and BLACKOUT still collide at three, so both
 * go to four. Only the colliding group lengthens.
 *
 * One letter stopped meaning anything around the fifteenth capsule: three names
 * open on B and three on P, and a lone `B` said nothing about which. The glyph
 * is separate from the id because ids are load-bearing in the game's
 * `kind === "..."` branches and renaming them buys the player nothing.
 *
 * Derived rather than authored because the rule is a property of the whole
 * roster, not of one row: adding MIMIC has to lengthen MIRROR in the same
 * breath, and a hand-typed column would be wrong the day that lands. Longer
 * glyphs cost a font tier, not a broken sprite — `dropGlyphFont` picks a size
 * that fits the pill by measuring it.
 */
export const POWER_UP_GLYPHS: Record<PowerUpKind, string> = byId((definition) => glyphFor(definition.name));
export const POWER_UP_DURATIONS: Record<PowerUpKind, number> = byId((definition) => definition.ticks);
export const POWER_UP_DROP_WEIGHTS: Record<PowerUpKind, number> = byId((definition) => TIER_WEIGHTS[definition.tier]);

// Roster order, which is the order the console prints, `rollDropKind` walks and
// the POWER inset lists live effects in.
export const POWER_UP_IDS: readonly PowerUpKind[] = POWER_UPS.map((definition) => definition.id);

export const TIMED_KINDS: readonly PowerUpKind[] = POWER_UPS.filter((definition) => definition.timed).map(
  (definition) => definition.id,
);

// The capsules that hurt, which is exactly the `trap` tier. Read by the blinking
// glyph in `drawDrop`, the pink catch pop and the pickup womp — the three things
// that have to say "trap" before and as the paddle takes it.
export const MALUS_KINDS: ReadonlySet<PowerUpKind> = new Set(
  POWER_UPS.filter((definition) => definition.tier === "trap").map((definition) => definition.id),
);

// The shortest opening of `name` that no other capsule shares, never under two.
// Bottoms out at the whole name, which two names can only tie on if one is a
// prefix of the other — the DEV legibility pass says so out loud if that ever
// happens, since there is no length that would separate them.
function glyphFor(name: string): string {
  let length = 2;
  while (length < name.length && ALL_NAMES.filter((other) => other.startsWith(name.slice(0, length))).length > 1) {
    length++;
  }
  return name.slice(0, length);
}
