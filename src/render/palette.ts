import { byId, POWER_UPS } from "@core/config/powerUps";

import type { BrickKind, PowerUpKind } from "@interfaces/types";

export interface BrickColorSet {
  flat: string;
  light: string;
  dark: string;
}

export const BRICK_COLORS: Record<BrickKind, BrickColorSet> = {
  "1": { flat: "#e8384f", light: "#ff8a9c", dark: "#8e1220" },
  "2": { flat: "#f07d10", light: "#ffc27a", dark: "#8a3d00" },
  "3": { flat: "#ffcf1c", light: "#fff59a", dark: "#8a6a00" },
  "4": { flat: "#3fbf4f", light: "#a6f0a6", dark: "#155c1f" },
  "5": { flat: "#2d7fe0", light: "#a8d8ff", dark: "#0b3a78" },
  S: { flat: "#b0b4cc", light: "#f2f4ff", dark: "#5a5e80" },
  G: { flat: "#dfae2c", light: "#ffe9a0", dark: "#7a5a08" },
};

// Capsule bodies and letter tones are authored per capsule in
// `@core/config/powerUps`; both tables are derived so they can never drift out
// of step with the roster. Names and types are unchanged for their consumers.
export const DROP_COLORS: Record<PowerUpKind, string> = byId((definition) => definition.color);

// Light and mid-tone capsule bodies need a dark letter to stay readable; white
// on M's green and B's orange sat under 3:1.
export const DARK_LETTER_DROP_KINDS: ReadonlySet<PowerUpKind> = new Set(
  POWER_UPS.filter((definition) => definition.dark).map((definition) => definition.id),
);

// Sprite and effect colors. The playfield field tones live per theme in
// `src/render/backgrounds.ts`.
export const canvasPalette = {
  wallLight: "#dbe4ff",
  wallShade: "#8f9ac8",
  paddleBody: "#2d7fe0",
  paddleCap: "#e8384f",
  paddleTopSheen: "#a8d8ff",
  paddleBottomShade: "#0b3a78",
  laserCannon: "#ffcf1c",
  ballBody: "#ffe14a",
  ballHighlight: "#fff9d0",
  ballShade: "#c98f0a",
  laserShot: "#ffcf1c",
  dropLetterLight: "#ffffff",
  dropLetterDark: "#0b0b26",
  dropSheen: "#ffffff",
  dropShade: "#0b0b26",
  energyWall: "#8fd0ff",
  popBonus: "#c8ffc8",
  popMalus: "#ff70d0",
  popShadow: "#0b0b26",
  blastFlash: "#ffc27a",
  deathFlash: "#ffffff",
  nukeFlash: "#ffffff",
  nukeRing: "#eaf7ff",
  // STASIS's own frost aqua, so the release ring is read as that capsule's.
  stasisRing: "#9effd6",
  // HOMING's signal green, on the four corners of the brick a ball has locked.
  homingMark: "#00e05a",
  // MIRROR's ghost: the paddle's own tones taken down far enough to read as a
  // reflection rather than a second paddle. It reuses `paddleBottomShade` for
  // its shade, which is already dark enough to pass for one.
  mirrorBody: "#1e5796",
  mirrorCap: "#93273a",
  mirrorSheen: "#5f8fc4",
  // CHAIN's arc: the capsule's mint under a white core, so a bolt reads as hot
  // on every field the game paints.
  chainBolt: "#3dff8e",
  chainCore: "#ffffff",
  // MAGNET's tether, the capsule's own seafoam: the pull is silent, so this
  // dashed line is the only thing telling the player it is happening.
  magnetTether: "#6fd0b4",
  // SINGULARITY: a hole darker than any field theme, ringed by a breathing halo
  // in the capsule's violet and an outer rim that fixes its true reach.
  singularityCore: "#05030d",
  singularityHalo: "#c9a7ff",
  singularityRim: "#6d3bd6",
  // PORTAL: three bands scrolling up the wall, bright to nearly black, so a
  // mouth reads as a moving opening rather than a coloured strip.
  portalBright: "#00b3fa",
  portalMid: "#0a6ea8",
  portalDark: "#08324f",
  // GHOST: all that is left of a brick while the wall is intangible. One white
  // outline and the playfield theme showing through where the body was.
  ghostBrick: "#f2f4ff",
  // BUMPERS: the capsule's hot rose, ringed in white so a disc reads against
  // every field theme, with a dark eye that goes white for the kick flash.
  bumperBody: "#ff00aa",
  bumperRim: "#f2f4ff",
  bumperCore: "#0b0b26",
  // CRITTER: the grub's acid lime over a brown belly and feet, and a red jaw at
  // the leading end — the one warm pixel on it, so which way it is walking can
  // be read without waiting to see it move.
  critterBody: "#a3e04a",
  critterUnder: "#8a5a2a",
  critterJaw: "#e8384f",
  critterEye: "#0b0b26",
} as const;
