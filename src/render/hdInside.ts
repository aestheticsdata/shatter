// INSIDE THE EYE on the fine grid (SHA-235): the arithmetic, with none of the
// painting.
//
// Split out of `backgrounds` for the reason `hdDial` was split out of the
// renderer: `scripts/check-pix.mjs` runs the real module under plain node, and
// what the iris gets wrong is a loop bound rather than a colour. A fibre that
// steps its radius by whole game pixels on a grid three times finer is not a
// thin fibre — it is a dotted one, and twenty-eight of those are spokes. That
// is a fact about `<` and `+= 1`, and it is checked here rather than looked for
// in a screenshot of a circle.
//
// See the spec: `docs/superpowers/specs/2026-09-21-observer-hd-design.md`.

import { FINE } from "@interfaces/art";

/**
 * The iris the player stands inside, in game pixels from its centre.
 *
 * These are the shipped numbers, not new ones: the fine grid changes how
 * finely the span is walked, never where it starts or stops. `bleed` is the one
 * addition, and it is Part B's.
 */
export const INSIDE_IRIS = {
  /** Fibres, every fourteenth of a turn. */
  fibres: 28,
  /** The span a fibre covers, pupil outward. */
  fibreFrom: 40,
  fibreTo: 100,
  /** The limbal ring: the dark rim that holds the iris in. */
  limbusFrom: 100,
  limbusTo: 104,
  /** How far past its own edge a band bleeds, and at what coverage. */
  bleed: 4,
  bleedCoverage: 0.5,
  /** The sclera's veins, and the finer streaks the fine grid lays over them. */
  veins: 40,
  streaks: 20,
} as const;

/**
 * The `index`-th fibre's angle.
 *
 * The 0.1 is the shipped offset and it stays: it is what keeps a fibre off
 * each axis, where a radial line meeting a row of pixels head-on is the one
 * place it stops looking radial.
 */
export function fibreAngle(index: number): number {
  return (index / INSIDE_IRIS.fibres) * Math.PI * 2 + 0.1;
}

/**
 * How many samples a fibre takes across its span — one per pixel of the grid
 * it is being drawn on, which is 60 coarse and 180 fine.
 *
 * **The mark and the walk have to go fine together, and one without the other
 * is worse than neither.** The shipped recipe samples a sixty-pixel span sixty
 * times and paints each sample as a game pixel, which is a continuous line
 * exactly one pixel wide. Hand that loop the fine brush and every sample comes
 * out three fine pixels square: still continuous, but three times too thick —
 * twenty-eight spokes where the drawing wants twenty-eight fibres. Thin the
 * mark to a fine pixel on its own and the line stops being a line at all,
 * because the walk still steps a whole game pixel and leaves sixty dots three
 * apart.
 *
 * So this is the half of the pair that a screenshot cannot show. A fibre that
 * is too thick is visible at a glance; a fibre sampled in the wrong units only
 * shows once someone has already fixed the thickness.
 */
export function fibreSteps(hd: boolean): number {
  return (INSIDE_IRIS.fibreTo - INSIDE_IRIS.fibreFrom) * (hd ? FINE : 1);
}

/** The radius of a fibre's `step`-th sample, in game pixels. Coarse walks whole ones. */
export function fibreRadius(step: number, hd: boolean): number {
  return INSIDE_IRIS.fibreFrom + step / (hd ? FINE : 1);
}

/**
 * The fine radius of the half-tone collar laid *under* a band's own disc.
 *
 * Under, so only the part of it outside the band survives — one call for what
 * is otherwise an annulus, and the bands stipple into each other instead of
 * stacking like the contours on a map. The band painted next is smaller and
 * goes on top, so its collar falls on the band outside it: the bleed runs
 * outward, which is the direction an iris fibre actually runs.
 */
export function bleedRadius(radius: number): number {
  return (radius + INSIDE_IRIS.bleed) * FINE;
}
