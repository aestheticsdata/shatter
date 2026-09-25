// THE ZODIAC DIAL on the fine grid (SHA-232): the arithmetic, with none of the
// painting.
//
// Split out of `CanvasRenderer` for the reason `hdEye` was: `scripts/check-pix.mjs`
// runs the real module under plain node, and everything the dial can get wrong
// is arithmetic. Its dash is a pitch, and a pitch is the one thing this pass has
// already shipped a dropped factor in (SHA-218), so it is pinned here rather
// than looked at in a screenshot of a circle.
//
// See the spec: `docs/superpowers/specs/2026-09-21-observer-hd-design.md`.

import { gameConfig } from "@core/config/GameConfig";
import { FINE } from "@interfaces/art";

/**
 * The grid this dial is ruled on: a fine pixel in HD, a game pixel otherwise.
 *
 * Every radius, every step round a circle and both halves of the dash are
 * multiplied by it, which is the whole of the conversion — and what keeps
 * classic bit-identical, since all of it is a multiplication by one.
 *
 * Gated on the exact scale as well as the mode, like every other HD sprite
 * here: the title screen draws this same dial at scale 1, where there is no
 * fine grid to rule on.
 */
export function dialUnit(hd: boolean, scale: number): number {
  return hd && scale === FINE ? FINE : 1;
}

/**
 * How many steps of the walk make one pixel of circumference.
 *
 * **One is not enough for a hairline, and is for a block.** The recipe has
 * always been one dot per pixel round the circle, which leaves the chord
 * between two steps at about a pixel — near enough that they touch almost
 * everywhere, and two apart wherever the two roundings tie against each other.
 * Classic never shows that: its pen is three device pixels wide, so a skipped
 * step is still covered. A one-pixel pen leaves a hole, and a ruled circle on
 * an instrument does not have a hole in it.
 *
 * So the fine walk takes two steps per pixel, which puts the chord at half a
 * pixel and makes a skip arithmetically impossible. It costs nothing: half of
 * those steps land on the pixel the step before them did, and `drawZodiac`
 * drops a dot that repeats the last one rather than painting it twice.
 *
 * Coarse stays at one, and not because one is right there — because changing it
 * would move classic's pixels, and classic is this pass's regression net.
 */
export function dialWalk(unit: number): number {
  return unit === 1 ? 1 : 2;
}

/** One dot per pixel of circumference, times the walk — how many steps a circle of this radius takes. */
export function dialSteps(radius: number, walk = 1): number {
  return Math.round(Math.PI * 2 * radius) * walk;
}

/**
 * Whether the dashed inner circle is inked at this step round it.
 *
 * **The dash is a pitch, and this is the one place in the pass that refuses
 * `finePitch`'s trade.** That function closes a dash twice over when a line
 * goes fine, and it is right to, because the deck's dashes were never the
 * idiom: they were the coarse grid's only way of keeping a three-pixel line
 * from reading as a rope, and a one-pixel line does not have that problem.
 *
 * A dial's dashes are the opposite. Four on and two off round a graduated ring
 * *is* the reading — it is what says instrument rather than circle — so here
 * the dash keeps its length on screen and only the pen under it gets finer.
 * Both halves take the stride, which walked three times as finely is twelve on
 * and six off. Take the trade instead and the whole period comes out shorter
 * than one graduation — a solid circle with a stipple, and a band whose two
 * edges no longer read as different marks.
 *
 * `stride` is how many steps of the walk make one game pixel of arc: the unit
 * times `dialWalk`. It is the walk's own resolution and not the grid's, because
 * the dash is counted in steps and a finer walk takes more of them to cover the
 * same arc.
 */
export function dialInked(index: number, stride: number): boolean {
  const { dashOn, dashOff } = gameConfig.observer.ring;
  return index % ((dashOn + dashOff) * stride) < dashOn * stride;
}
