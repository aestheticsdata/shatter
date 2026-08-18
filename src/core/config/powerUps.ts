// The capsule roster: one entry per power-up, and the single source of truth
// for every table the game reads about them. Adding a capsule is adding a row
// here — the union type, the seven lookups below, `DROP_COLORS` and
// `DARK_LETTER_DROP_KINDS` in `@render/palette`, and the dev console's roster
// all derive from it. Nothing else needs an edit.
//
// This module imports nothing on purpose: `@interfaces/types` re-exports
// `PowerUpKind` from here, and a cycle would put half the game's types behind
// a partially initialised module.

export interface PowerUpDefinition {
  // `string`, not the union — the union is inferred *from* these ids, and typing
  // it as itself would be circular. One or two characters; see `glyph`.
  id: string;
  // What `drawDrop` paints on the pill. Decoupled from the id because only
  // A C D F H I K O Q V Y are still free and the roster outgrew the alphabet:
  // a two-character glyph drops to a 5px font so it stays inside the sheen.
  glyph: string;
  // The POWER inset label and the catch pop, and what the console accepts
  // alongside the id (`power multi` === `power M`).
  name: string;
  // Capsule body. Every one of these is checked against the playfield themes by
  // `pnpm run check:backgrounds`.
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
  // Relative odds within one roll, not a probability: whether a brick drops
  // anything at all is `gameConfig.rules.bonusSpreadAmount`.
  weight: number;
  // Whether `PowerUpTimers` counts it down. W (WALL) is a one-shot charge owned
  // by the game and N (NUKE) is driven by the Detonation, so neither is timed.
  // S (SWARM) is instantaneous like M: its timer only keeps the inset label lit.
  // U/Z/R are instantaneous with no lingering state at all — the catch pop is
  // their whole acknowledgment.
  timed: boolean;
}

// One row per capsule, and it must stay one row: the field names are short so a
// two-character id and a name as long as BLACKOUT still fit inside 120 columns.
export const POWER_UPS = [
  { id: "E", glyph: "E", name: "WIDE", color: "#2d7fe0", dark: false, ticks: 720, weight: 1, timed: true },
  { id: "M", glyph: "M", name: "MULTI", color: "#3fbf4f", dark: true, ticks: 180, weight: 1, timed: true },
  { id: "L", glyph: "L", name: "LASER", color: "#e8384f", dark: false, ticks: 720, weight: 1, timed: true },
  { id: "P", glyph: "P", name: "PIERCE", color: "#ffcf1c", dark: true, ticks: 480, weight: 1, timed: true },
  { id: "B", glyph: "B", name: "BLAST", color: "#f07d10", dark: true, ticks: 720, weight: 1, timed: true },
  { id: "W", glyph: "W", name: "WALL", color: "#8fd0ff", dark: true, ticks: 0, weight: 1, timed: false },
  { id: "T", glyph: "T", name: "TEMPO", color: "#f2f4ff", dark: true, ticks: 480, weight: 1, timed: true },
  { id: "X", glyph: "X", name: "PAYDAY", color: "#dfae2c", dark: true, ticks: 600, weight: 1, timed: true },
  { id: "J", glyph: "J", name: "JAMMER", color: "#d13be8", dark: false, ticks: 360, weight: 0.5, timed: true },
  // N at 0.3 starved: ~2.3 nukes DROPPED across a full 15-level run — QA never
  // saw one. 0.65 lands one roughly every 3 levels while staying the rarest.
  { id: "N", glyph: "N", name: "NUKE", color: "#b6ff00", dark: true, ticks: 0, weight: 0.65, timed: false },
  { id: "S", glyph: "S", name: "SWARM", color: "#1fd8c4", dark: true, ticks: 180, weight: 0.5, timed: true },
  { id: "U", glyph: "U", name: "1UP", color: "#ff70b8", dark: true, ticks: 0, weight: 0.25, timed: false },
  { id: "Z", glyph: "Z", name: "ZAP", color: "#4ae0ff", dark: true, ticks: 0, weight: 0.6, timed: false },
  { id: "R", glyph: "R", name: "RAIN", color: "#8a5cf5", dark: false, ticks: 0, weight: 0.5, timed: false },
  { id: "G", glyph: "G", name: "GLUE", color: "#b07840", dark: false, ticks: 720, weight: 1, timed: true },
] as const satisfies readonly PowerUpDefinition[];

export type PowerUpKind = (typeof POWER_UPS)[number]["id"];

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
export const POWER_UP_GLYPHS: Record<PowerUpKind, string> = byId((definition) => definition.glyph);
export const POWER_UP_DURATIONS: Record<PowerUpKind, number> = byId((definition) => definition.ticks);
export const POWER_UP_DROP_WEIGHTS: Record<PowerUpKind, number> = byId((definition) => definition.weight);

// Roster order, which is the order the console prints and `rollDropKind` walks.
export const POWER_UP_IDS: readonly PowerUpKind[] = POWER_UPS.map((definition) => definition.id);

export const TIMED_KINDS: readonly PowerUpKind[] = POWER_UPS.filter((definition) => definition.timed).map(
  (definition) => definition.id,
);
