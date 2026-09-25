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

export const PARTICLES: readonly ParticleDefinition[] = [{ id: PARTICLE.PHOTON, name: "PHOTON", verb: "SCATTER" }];

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
} as const;
