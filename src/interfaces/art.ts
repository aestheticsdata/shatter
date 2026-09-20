/**
 * THE HD PASS's one word (SHA-215): which set of sprites the renderer paints.
 *
 * Two paths live side by side for the length of the pass. `CLASSIC` is the art
 * this game has shipped since the rebuild, drawn in whole game pixels; `HD` is
 * the same game drawn on the fine grid the 1116x900 backing store has always
 * had. `SPLIT` paints both and hands the left half to classic, which is the
 * only honest way to judge a retouched sprite — a sprite looks better than its
 * predecessor almost by default when the predecessor is a memory.
 *
 * Classic is the default and stays the default until the pass is done: it is
 * the regression net, and the DEMAKE filter is written against its tones.
 */
export const ART_MODE = {
  CLASSIC: "classic",
  HD: "hd",
  SPLIT: "split",
} as const;

export type ArtMode = (typeof ART_MODE)[keyof typeof ART_MODE];

/**
 * How many fine pixels a game pixel is worth — the renderer's `SCALE`, named
 * from the art's side.
 *
 * It is not a new number and it is not a knob. The canvas has been three times
 * the field since the rebuild; what the pass changes is only that a sprite may
 * now address the two pixels in three that `Math.round(x) * SCALE` was rounding
 * away.
 */
export const FINE = 3;

/**
 * Where a sprite lands, in fine pixels, for each art mode.
 *
 * **This one line is what makes HD look like HD**, as much as any bevel. Classic
 * rounds to a game pixel and then multiplies, so the ball steps three fine
 * pixels at a time and a slow-moving sprite visibly ratchets. HD rounds after
 * multiplying, so it steps one. Nothing in the simulation changes — positions
 * have always been floats — and motion is three times finer for free.
 */
export function blitAt(value: number, mode: ArtMode): number {
  return mode === ART_MODE.CLASSIC ? Math.round(value) * FINE : Math.round(value * FINE);
}
