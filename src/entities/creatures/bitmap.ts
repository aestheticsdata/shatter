/**
 * Bitmap arithmetic for the bosses (SHA-213): a boss is its species grown
 * huge, and the honest way to grow a sprite in this idiom is to draw every
 * pixel of it twice over — not to zoom the small one at draw time, which the
 * house does not do to any sprite, but to *make* the big bitmap once and draw
 * it as pixels like everything else. What the mother's wing is at 16 wide, it
 * is at 32: the same drawing, a size up.
 */

/** Every pixel a 2 x 2 block. */
export function doubled(rows: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const row of rows) {
    const wide = row
      .split("")
      .map((character) => character + character)
      .join("");
    out.push(wide, wide);
  }
  return out;
}

/** Top for bottom: a snail on the ceiling. */
export function flipped(rows: readonly string[]): readonly string[] {
  return [...rows].reverse();
}
