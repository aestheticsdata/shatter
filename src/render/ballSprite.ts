// The ball's sprite, as geometry: which pixels are lit for a ball of a given
// diameter, and where its glint and its shade sit on one.
//
// GIANT (SHA-135) made the ball's size a variable, and a hand-authored table
// cannot follow it. The eight rows this game shipped for years are still the
// answer at 8 px — `ballRows(8)` reproduces them exactly, which is the one
// thing the scratchpad test pins — but they are now the smallest case of a
// rule rather than the only case.
//
// **This module imports nothing on purpose**, so it runs standalone under
// `node --experimental-transform-types` without alias resolution. That is why a
// glint carries the *name* of a tone rather than a colour: the palette is the
// renderer's business, and a sprite is a shape.

export type BallRow = readonly [offset: number, span: number];

export type BallTone = "highlight" | "shade";

export interface BallGlint {
  x: number;
  y: number;
  width: number;
  height: number;
  tone: BallTone;
}

// One table per size ever asked for. GIANT steps through nine of them and the
// plain ball is the tenth, so the whole cache is ten small arrays for a run.
const ROWS_BY_SIZE = new Map<number, readonly BallRow[]>();

/**
 * The lit span of each row of a ball `size` pixels across, top to bottom.
 *
 * **Diameters are even.** An odd one would put the centre on a pixel boundary
 * and every row half a pixel off-centre, which reads as a ball that wobbles as
 * it grows — so the size that drives this is rounded to even before it arrives
 * (see `ballSizeFor` in `@core/config/GameConfig`).
 *
 * The half-span is **rounded and then doubled**, rather than the span being
 * rounded: that is what keeps every row centred on the same axis, and it is
 * also — not by accident — what reproduces the authored 8 px sprite. Rounding
 * the full span instead puts rows 2 and 3 at 7 px and the ball loses its
 * symmetry at the widest point.
 */
export function ballRows(size: number): readonly BallRow[] {
  const cached = ROWS_BY_SIZE.get(size);
  if (cached) {
    return cached;
  }

  const radius = size / 2;
  const rows: BallRow[] = [];
  for (let row = 0; row < size; row++) {
    // The row's own centre line against the ball's, so the top and bottom rows
    // are inset by the same amount and the sprite is symmetric by construction.
    const dy = Math.abs(row + 0.5 - radius);
    const half = Math.round(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
    rows.push([radius - half, half * 2]);
  }

  ROWS_BY_SIZE.set(size, rows);
  return rows;
}

// The 8 px original, and the proportions every other size is read off. The
// highlight is an L in the upper left and the shade answers it in the lower
// right; that reading is what makes the sprite a sphere rather than a disc, so
// it scales with the ball instead of staying a speck on a 24 px one.
const GLINTS_AT_8: readonly BallGlint[] = [
  { x: 2, y: 1, width: 2, height: 1, tone: "highlight" },
  { x: 1, y: 2, width: 1, height: 2, tone: "highlight" },
  { x: 3, y: 6, width: 3, height: 1, tone: "shade" },
  { x: 6, y: 4, width: 1, height: 2, tone: "shade" },
];

/**
 * Where the highlight and the shade sit on a ball `size` pixels across.
 *
 * Every number is the 8 px one times `size / 8`, floored at one pixel: a glint
 * that rounded to nothing at some intermediate size would blink out part-way
 * through GIANT's swell and read as a dropped frame.
 */
export function ballGlints(size: number): readonly BallGlint[] {
  const scale = size / 8;
  if (scale === 1) {
    return GLINTS_AT_8;
  }
  return GLINTS_AT_8.map((glint) => ({
    x: Math.round(glint.x * scale),
    y: Math.round(glint.y * scale),
    width: Math.max(1, Math.round(glint.width * scale)),
    height: Math.max(1, Math.round(glint.height * scale)),
    tone: glint.tone,
  }));
}
