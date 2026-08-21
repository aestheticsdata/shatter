import { glyphAgainst, POWER_UPS } from "@core/config/powerUps";

import type { PowerUpKind } from "@interfaces/types";

/**
 * COMBOS: two live capsules fusing into a third effect (SHA-64).
 *
 * Nothing here falls. A combo has no capsule, no pill and no drop weight — it
 * is the game noticing that two timers overlap and paying for the coincidence.
 * The id doubles as the name, since the only place a combo is written is the
 * POWER inset.
 *
 * **The table is authored, and stays authored.** These are six deliberate
 * pairs, not a rule over the registry: inventing a capsule does not invent a
 * fusion, and nothing in this file grows with `POWER_UPS.length`. A pair enters
 * the table when someone decides it should, so a sibling ticket renaming a
 * capsule cannot silently light a combo nobody designed.
 *
 * Both halves are timed on purpose — a combo dies the moment either expires,
 * and an instantaneous capsule (RAIN, NUKE) has no overlap to notice. That also
 * rules out MULTI and SWARM, whose 180 ticks are gone before the player reads
 * the inset.
 */
export type ComboId = "LANCE" | "NOVA" | "CHARGE" | "STROBE" | "JACKPOT" | "OVERTIME";

export interface Combo {
  id: ComboId;
  a: PowerUpKind;
  b: PowerUpKind;
}

// No fusion restates its halves: PIERCE passes the *ball* through bricks and
// LANCE the *shots*; BLAST splashes one ring and NOVA two. WIDE and JAMMER
// cancel each other, so no pair here holds both.
export const COMBOS: readonly Combo[] = [
  // LASER + PIERCE: the shot stops dying on its first brick and rips a column.
  { id: "LANCE", a: "L", b: "P" },
  // PIERCE + BLAST: the splash goes from the 8 neighbours to the 5x5 block.
  { id: "NOVA", a: "P", b: "B" },
  // GLUE + LASER: held fire, spent as a salvo on the release.
  { id: "CHARGE", a: "G", b: "L" },
  // LASER + TEMPO: the cannons keep real time while the balls run slow.
  { id: "STROBE", a: "L", b: "T" },
  // BLAST + PAYDAY: the splash pays.
  { id: "JACKPOT", a: "B", b: "X" },
  // TEMPO + PAYDAY: PAYDAY's clock stops for the length of TEMPO's.
  { id: "OVERTIME", a: "T", b: "X" },
];

// Only PAYDAY, and only while OVERTIME is live — a module-level constant so the
// per-tick call hands over the same array instead of building one.
export const OVERTIME_FROZEN: readonly PowerUpKind[] = ["X"];

/**
 * Combo glyphs, derived the way capsule glyphs are and against a wider field:
 * the capsule names *and* the combo names, so a fusion can never wear a
 * capsule's opening. Only the combo lengthens — the field a capsule is measured
 * against is unchanged, because a pill the player has learned may not move
 * because someone added a fusion.
 *
 * Today that gives LAN (LASER holds LA), NO, CHAR (CHAIN holds CH and its own
 * opening runs to CHAI), STR (STASIS holds ST), JAC (JAMMER holds JA) and OV —
 * and it re-derives by itself the day a capsule crowds one of them. The DEV
 * legibility pass asserts the result against the capsule glyphs out loud.
 */
const GLYPH_FIELD: readonly string[] = [...POWER_UPS.map((definition) => definition.name), ...COMBOS.map((c) => c.id)];

export const COMBO_GLYPHS: Record<ComboId, string> = Object.fromEntries(
  COMBOS.map((combo) => [combo.id, glyphAgainst(combo.id, GLYPH_FIELD)]),
) as Record<ComboId, string>;

/**
 * The combos one capsule away: exactly one half live, the other not.
 *
 * FUSE's whole question (SHA-105). Asked once per catch and never per tick, so
 * an array is the right shape here — unlike the live-combo list, which is on
 * the hot path and is rewritten in place. A combo already fully live is not
 * completable: there is nothing to add to it.
 */
export function completableCombos(isLive: (kind: PowerUpKind) => boolean): Combo[] {
  return COMBOS.filter((combo) => isLive(combo.a) !== isLive(combo.b));
}
