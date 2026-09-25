/**
 * THE CHAMBER (SHA-179): the four things loose in the field that are not
 * creatures and not capsules — matter, in the observer's own vocabulary.
 *
 * The names are the roster's ids, spelled once. `@core/config/particles` holds
 * a row per kind, `gameConfig.particles` its numbers, and the union below is
 * what every one of them is typed against — so a species is a name here first,
 * and the compiler walks you to everywhere else it has to be.
 */
export const PARTICLE = {
  PHOTON: "photon",
  ELECTRON: "electron",
  NUCLEUS: "nucleus",
} as const;

export type ParticleKind = (typeof PARTICLE)[keyof typeof PARTICLE];

/** Which side bar a gate is cut into. */
export const GATE_SIDE = {
  LEFT: "left",
  RIGHT: "right",
} as const;

export type GateSide = (typeof GATE_SIDE)[keyof typeof GATE_SIDE];
