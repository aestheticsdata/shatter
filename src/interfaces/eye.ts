/**
 * THE 43's shared words (SHA-188): the constants a placed eye is described
 * with, in one place, so level data, the Observer, the renderer and the still
 * all spell them the same way and a typo is a type error rather than a level
 * that quietly draws its eye on the wrong side of the wall.
 */

/** Which side of the wall a placed eye is drawn on. */
export const EYE_LAYER = {
  BEHIND: "behind",
  FRONT: "front",
} as const;

export type EyeLayer = (typeof EYE_LAYER)[keyof typeof EYE_LAYER];

/** The veils' two tints. A placed eye is always BLUE; RED is THE WRATH's and THE LID's. */
export const EYE_TINT = {
  BLUE: "blue",
  RED: "red",
} as const;

export type EyeTint = (typeof EYE_TINT)[keyof typeof EYE_TINT];

/**
 * What a placed eye does, when it does anything (SHA-200 on). A handful of
 * shared tricks that the thirty-eight ordinary levels are built out of; a
 * level names at most one, and a name joins this list the day its trick lands.
 */
export const EYE_ACT = {
  RISE: "rise",
  PATROL: "patrol",
  PULSE: "pulse",
  STAIRS: "stairs",
} as const;

export type EyeActKind = (typeof EYE_ACT)[keyof typeof EYE_ACT];
