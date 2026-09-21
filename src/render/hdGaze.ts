// THE GAZE on the fine grid (SHA-236): the arithmetic, with none of the
// painting. The last of THE HD PASS.
//
// Split out for the reason `hdDial` and `hdInside` were: `scripts/check-pix.mjs`
// runs the real module under plain node, and both of the gaze's readings are
// clocks. A clock photographs perfectly however wrong it is — a ring that
// closes in sixteen jumps and a hatching that strobes between two places both
// look exactly right in a still.
//
// See the spec: `docs/superpowers/specs/2026-09-21-observer-hd-design.md`.

import { FINE } from "@interfaces/art";

export const GAZE_BEAM = {
  /** The rungs' pitch down the beam, in game pixels. */
  rungPitch: 7,
  /** How far a rung overhangs the beam on each side, in game pixels. */
  rungOverhang: 1,
  /**
   * The two places a coarse rung can be.
   *
   * Not a speed — a pair. The shipped beam alternates its hatching between
   * these on frame parity, which is what a grid with seven whole pixels of
   * pitch can offer when the thing wanted is travel.
   */
  coarseStops: [0, 3],
} as const;

/**
 * Part B's three nested beam tones, as widths in fine pixels, widest first.
 *
 * **The widest is the hitbox and may never be anything else.** `beamWidth` is
 * six game pixels because six game pixels is what the beam *catches* with, and
 * a drawing wider than its hitbox is a beam that misses what it touches. The
 * two inside it are the ones the fine grid pays for: ten and four fine pixels
 * are three and a third and one and a third game pixels, and neither is a
 * width the coarse grid can be asked for. That is the whole of the nesting —
 * not a bigger beam, a beam with an inside.
 */
export const BEAM_NEST = [18, 10, 4] as const;

/**
 * Where the hatching sits this frame, in pixels of the grid it is drawn on.
 *
 * **This is the gate's complaint again** (SHA-234), and it arrives at the same
 * answer. The rungs do not travel down the beam; they alternate between two
 * places three pixels apart, thirty times a second. What reads is a shimmer, and
 * a shimmer is what a beam does when it is *stuck*, not when something is
 * running through it.
 *
 * On the fine grid the seven-pixel pitch has twenty-one places in it and the
 * pattern advances one fine pixel a frame. Over the fifty ticks a shot lasts
 * that is two and a half rungs down the column — slow enough to be a current
 * rather than a strobe, and fast enough to be seen at all, which is the pair of
 * things the coarse grid could not have at once.
 */
export function rungSlide(frame: number, unit: number): number {
  const { rungPitch, coarseStops } = GAZE_BEAM;
  if (unit === 1) {
    return coarseStops[frame % coarseStops.length];
  }
  return (frame % (rungPitch * unit)) / unit;
}

/**
 * The charge ring's radius, in pixels of the grid it is drawn on.
 *
 * The ring closes from the iris's edge onto the pupil's over forty-five ticks,
 * and on the coarse grid it has about fifteen pixels to cross — so it holds
 * each radius for three frames and arrives in fifteen visible jumps. It is the
 * diadem's twinkle a third time (SHA-234): a continuous movement delivered in
 * whole game pixels, which is a movement the player sees the *steps* of. Three
 * times the radii is a ring that closes.
 *
 * `unit` is the grid, so classic is a multiplication by one around the rounding
 * it already did — bit-identical, which is what makes it the regression net.
 */
export function chargeRadius(inner: number, outer: number, progress: number, unit: number): number {
  return Math.round((outer - (outer - inner) * progress) * unit);
}

/** How many distinct radii a whole charge shows on this grid — the number the ring is judged by. */
export function chargeSteps(inner: number, outer: number, ticks: number, unit: number): number {
  const seen = new Set<number>();
  for (let frame = 0; frame < ticks; frame += 1) {
    seen.add(chargeRadius(inner, outer, frame / ticks, unit));
  }
  return seen.size;
}

/** The beam's nest as offsets from its centre, in fine pixels. */
export function beamNestOffsets(): readonly number[] {
  return BEAM_NEST.map((width) => Math.floor(width / 2));
}

/** Whether the nest fits the hitbox exactly: widest equal to it, each one strictly inside the last. */
export function beamNestFits(beamWidth: number): boolean {
  if (BEAM_NEST[0] !== beamWidth * FINE) {
    return false;
  }
  return BEAM_NEST.every((width, index) => index === 0 || width < BEAM_NEST[index - 1]);
}
