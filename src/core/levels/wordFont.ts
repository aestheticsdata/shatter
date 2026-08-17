import { gameConfig } from "@core/config/GameConfig";

import type { BrickKind } from "@interfaces/types";

const GLYPH_HEIGHT = 5;

// 3×5 pixel glyphs. Only letters that stay readable at 3 columns wide are
// shipped (M and W don't survive) — wordRows throwing on a missing glyph is
// the guard against unreadable words.
const GLYPHS: Record<string, readonly string[]> = {
  A: ["###", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: ["###", "#..", "#..", "#..", "###"],
  E: ["###", "#..", "##.", "#..", "###"],
  G: ["###", "#..", "#.#", "#.#", "###"],
  L: ["#..", "#..", "#..", "#..", "###"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  P: ["###", "#.#", "###", "#..", "#.."],
  Y: ["#.#", "#.#", "###", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};

// Builds level rows spelling `word`, one brick kind per letter so adjacent
// letters stay distinguishable even with zero gap. Four 3-wide letters fill
// the 12-column grid exactly; shorter words get 1-column gaps and centering.
export function wordRows(word: string, kinds: readonly BrickKind[]): string[] {
  const letters = [...word];
  const glyphs = letters.map((letter) => {
    const glyph = GLYPHS[letter];
    if (!glyph) {
      throw new Error(`wordRows: no 3×5 glyph for "${letter}" in "${word}"`);
    }
    return glyph;
  });

  const gap = letters.length <= 3 ? 1 : 0;
  const width = letters.length * 3 + (letters.length - 1) * gap;
  const { columns } = gameConfig.grid;
  if (width > columns) {
    throw new Error(`wordRows: "${word}" needs ${width} columns, grid has ${columns}`);
  }

  const pad = Math.floor((columns - width) / 2);
  return Array.from({ length: GLYPH_HEIGHT }, (_, rowIndex) => {
    let row = ".".repeat(pad);
    glyphs.forEach((glyph, letterIndex) => {
      if (letterIndex > 0) {
        row += ".".repeat(gap);
      }
      row += glyph[rowIndex].replaceAll("#", kinds[letterIndex % kinds.length]);
    });
    return row.padEnd(columns, ".");
  });
}
