/**
 * Bitmap arithmetic for the bosses (SHA-213): a boss is its species grown
 * huge, and the honest way to grow a sprite in this idiom is to *make* the big
 * bitmap once and draw it as pixels like everything else — not to zoom the
 * small one at draw time, which the house does not do to any sprite. What the
 * mother's wing is at 16 wide, it is at 64: the same drawing, sizes up, with
 * its edges redrawn at the new size rather than blown up into blocks
 * (SHA-258) — a 4 x 4 block is a pixel four times coarser than everything else
 * on an HD field.
 */

/**
 * How many times its species a boss is, on each axis (SHA-258). Twice read as
 * a big moth rather than the end of a level; four times is a thing the whole
 * room is about.
 */
export const BOSS_GROWTH = 4;

/** A species at `BOSS_GROWTH`: Scale2x over and over, so every edge stays a line. */
export function grown(rows: readonly string[]): readonly string[] {
  let out = rows;
  for (let size = 1; size < BOSS_GROWTH; size *= 2) {
    out = smoothDoubled(out);
  }
  return out;
}

/**
 * Twice the size with the staircases kept to one pixel: Scale2x (SHA-258).
 *
 * Nearest-neighbour doubling turns a one-pixel diagonal into a stair of
 * 2 x 2 blocks, which the fine grid's Scale3x then breaks into dashes. Scale2x
 * doubles a drawing the way it would have been drawn at that size: an edge
 * between two like neighbours takes their tone, so a diagonal stays a line.
 * `grown` is this, twice; THE SPIDER QUEEN, her own drawing, is this once.
 */
export function smoothDoubled(rows: readonly string[]): readonly string[] {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const at = (x: number, y: number): string => (x < 0 || y < 0 || x >= width || y >= height ? "." : rows[y][x]);
  const out: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let upper = "";
    let lower = "";
    for (let x = 0; x < width; x += 1) {
      // Above, right, left and below, as the algorithm names them.
      const e = at(x, y);
      const a = at(x, y - 1);
      const b = at(x + 1, y);
      const c = at(x - 1, y);
      const d = at(x, y + 1);
      upper += (c === a && c !== d && a !== b ? a : e) + (a === b && a !== c && b !== d ? b : e);
      lower += (d === c && d !== b && c !== a ? c : e) + (b === d && b !== a && d !== c ? d : e);
    }
    out.push(upper, lower);
  }
  return out;
}

/** Top for bottom: a snail on the ceiling. */
export function flipped(rows: readonly string[]): readonly string[] {
  return rows.toReversed();
}

/**
 * Left for right: a grub walking the other way (SHA-227).
 *
 * `flipped`'s other axis, and the one a creature that *travels* needs — a
 * sprite with a jaw at one end and an eye behind it has to turn round when it
 * does, and authoring the same drawing twice is two places for a leg to be
 * moved in one of them.
 */
export function mirrored(rows: readonly string[]): readonly string[] {
  return rows.map((row) => row.split("").toReversed().join(""));
}
