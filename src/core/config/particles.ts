// THE CHAMBER's roster (SHA-179): one row per particle, and what the game knows
// about each one that is not a number. The numbers — sizes, speeds, points,
// lives, the depth a species joins the bag at — are knobs, and live under
// `gameConfig.particles` beside the gates and the clock.
//
// Adding a species is a row here, a block there and its verb in `Chamber`: the
// bag and the bestiary walk this list, so a row is how a species is let out.

import { PARTICLE } from "@interfaces/particles";

import type { ParticleKind } from "@interfaces/particles";

export interface ParticleDefinition {
  id: ParticleKind;
  // Capitals, one word, the house voice.
  name: string;
  // What it does to a ball, in one word: the four verbs of the premise.
  verb: string;
}

export const PARTICLES: readonly ParticleDefinition[] = [
  { id: PARTICLE.PHOTON, name: "PHOTON", verb: "SCATTER" },
  { id: PARTICLE.ELECTRON, name: "ELECTRON", verb: "SHIELD" },
  { id: PARTICLE.NUCLEUS, name: "NUCLEUS", verb: "SPLIT" },
];

/**
 * The tones each species is drawn in.
 *
 * **None of them is yellow.** The ball is the one yellow thing on the field and
 * nothing that moves beside it may be mistaken for it — the premise's first
 * readability rule, and the reason the photon is the energy wall's white-cyan
 * rather than a star's gold.
 */
export const PARTICLE_TONES = {
  photon: {
    // The energy wall's core and its glow: the one light on the field that is
    // not the ball's, which is what a photon is.
    core: "#f4fbff",
    trail: "#8fd0ff",
  },
  electron: {
    // The deck's sheen: a light, cold thing that belongs to the machine's side
    // of the field rather than to the wall's.
    body: "#a8d8ff",
    // The arc's dim blue, so the orbit is seen from across the field without
    // being mistaken for anything that can be hit.
    ring: "#5b74e8",
  },
  nucleus: {
    // Warm and heavy, a fired-clay red nowhere near the ball's yellow: the one
    // particle that is worth chasing should never be mistaken for the thing
    // doing the chasing.
    body: "#b84a2a",
    shade: "#5a1f0e",
    highlight: "#ffb08a",
  },
} as const;

/**
 * NUCLEUS and its daughters as character grids: nucleons packed into a lump,
 * lit from the upper left.
 *
 * **A cluster, never a disc.** A ten-pixel sphere in two warm tones would be a
 * red ball, and a red ball is the one thing a particle may not look like; the
 * lumpy outline is what says *matter* at a glance and survives the tube, where
 * the shade goes to ground and the nucleons stand out of it. `h` highlight,
 * `b` body, `s` shade, `.` nothing.
 */
export const NUCLEUS_BITMAPS = {
  nucleus: [
    "....hb....",
    "...hbbs...",
    ".hbbbsshb.",
    "hbbssshbbs",
    "bbshbbsbss",
    ".ssbbssss.",
    ".hbbssbbs.",
    ".bbhbbsss.",
    "..sbbsss..",
    "....ss....",
  ],
  daughter: ["...hb.", "..hbbs", ".hbhbs", "hbhbbs", "bbbbss", ".ssss."],
} as const;
