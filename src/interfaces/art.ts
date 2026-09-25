/**
 * THE HD PASS's one word (SHA-215): which set of sprites the renderer paints.
 *
 * Two paths live side by side. `CLASSIC` is the art this game shipped from the
 * rebuild to the end of the pass, drawn in whole game pixels; `HD` is the same
 * game drawn on the fine grid the 1116x900 backing store has always had.
 * `SPLIT` paints both and hands the left half to classic, which is the only
 * honest way to judge a retouched sprite — a sprite looks better than its
 * predecessor almost by default when the predecessor is a memory.
 *
 * HD is the default since the pass closed (SHA-248). Classic stays, untouched
 * and one console word away: it is the regression net, and the left half of
 * every split.
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

/**
 * THE HD PASS (SHA-222): the pitch a dashed line walks at on the fine grid, so
 * that it weighs on screen what it weighed on the coarse one.
 *
 * **A line's weight is its thickness times its duty.** Classic lays a whole
 * game pixel — `FINE` fine pixels thick — every `gamePitch` game pixels, so it
 * puts down `FINE / (gamePitch * FINE)` fine pixels of ink per fine pixel of
 * length. HD lays a single fine pixel, a third as thick, and the only thing
 * left to pay with is the pitch: it has to close by `FINE` again, which is
 * `FINE * FINE` in total.
 *
 * Getting this wrong is not a subtle bug. A thread converted at `gamePitch /
 * FINE` — the obvious arithmetic, and the one this pass shipped for an hour —
 * comes out at a third of its weight, which on a dark field is a cue the player
 * has to hunt for. It looks like a considered choice and it is a dropped
 * factor.
 *
 * `keep` is how much of the trade a line is allowed to take. One is the whole
 * of it, and the dashes close into a hairline — right for anything whose gaps
 * were only ever the coarse grid's way of keeping a 3 px line from reading as a
 * rope. Below one, a proportional gap survives, for the one kind of line whose
 * dashes are the cue rather than the drawing: MAGNET's tether crawls, and a
 * tether with nothing to crawl in says nothing at all.
 *
 * Floored at a single fine pixel, because a pitch shorter than that walks the
 * same pixel twice and buys nothing with the second visit.
 */
export function finePitch(gamePitch: number, keep = 1): number {
  return Math.max(1 / FINE, gamePitch / (FINE * FINE * keep));
}
