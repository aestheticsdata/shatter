import { byId, POWER_UPS } from "@core/config/powerUps";

import type { BrickKind, ChunkMaterial, PowerUpKind } from "@interfaces/types";

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
  // A cannon still coming out of the deck. `laserCannon` and `laserShot` are the
  // same yellow, so a muzzle painted in either while it rises is painted in the
  // colour it is about to be — the charge would be invisible. This is the ball's
  // own highlight tone, and it cools to the yellow above on the frame the gun
  // locks out and fires.
  laserCharge: "#fff9d0",
  ballBody: "#ffe14a",
  ballHighlight: "#fff9d0",
  ballShade: "#c98f0a",
  // The middle of a MULTI or SWARM clone's birth: the one step between the
  // white-hot pip it is drawn as on its first frame and the ball it settles
  // into. Halfway between the two tones above, so the growth reads as one
  // sprite cooling rather than as three sprites.
  ballNewborn: "#ffed8d",
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
  // The last step of MIRROR's after-image, under its own body tone: still a
  // reflection's blue, but only just — the line has to be gone before the player
  // can wonder whether the ghost is still a surface.
  mirrorFade: "#123258",
  // RUSH's streak: the ball smeared along the path it covered this tick. Amber
  // into the capsule's own crimson, so the trail says both "moving" and "this
  // is the red thing you caught" — a plain grey blur said neither.
  rushTrailNear: "#ff8a1c",
  rushTrailFar: "#e1001b",
  // TURBO's streak, the same smear run cold: the capsule's own electric cyan at
  // the far end into a near-white at the ball. RUSH's is amber into crimson,
  // and the two capsules do the same thing for opposite reasons — the
  // temperature of the comet is what says which one is in hand.
  turboTrailNear: "#d6ffff",
  turboTrailFar: "#00b8d4",
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
  // BANANA: the peel on the rail, in the capsule's own body over the gold
  // brick's shade — what is lying there reads as what was caught, which is the
  // only warning the player gets before stepping on it.
  peelBody: "#e2fe74",
  peelShade: "#8a6a00",
  // JAMMER: the rail the deck has just been shut off, dying through four steps
  // of the capsule's own magenta. Authored rather than alpha-blended, because
  // everything else on this field fades in whole pixels of a named tone and a
  // `globalAlpha` mark would be the one thing on screen that does not.
  railMarkHot: "#d13be8",
  railMarkMid: "#a02fb3",
  railMarkLow: "#6f217d",
  railMarkFaint: "#3e1347",
  // METEOR: a white-hot core under the capsule's own ember, the flame drawn on
  // the trailing side so a rock reads as falling even in a still frame.
  meteorCore: "#ffe8b0",
  meteorFlame: "#c84b19",
  // DEMAKE: the two tones the whole machine collapses onto for 8 seconds. Ink
  // is a P1 phosphor at the brightness a sprite has to hold against the ground,
  // which is the tube's black with just enough green in it to read as glass
  // rather than as a hole in the screen.
  demakeInk: "#6cf08a",
  demakeGround: "#07160c",
  // BLACKOUT: the dark the field goes under for 5 seconds. Near-black with just
  // enough blue left in it to read as the lights going out rather than as a
  // hole cut in the canvas — and it is never seen flat, since the pools around
  // the balls and the deck are punched straight out of it. While DEMAKE holds
  // the machine the tube's own ground stands in for it: a green screen going
  // dark stays green.
  blackoutVeil: "#05050c",
} as const;

/**
 * A chunk of debris, by what it broke off.
 *
 * The bricks bring their own three tones; the deck's are its bands, minus the
 * shade — `flat` is the body, `light` the sheen along its top, and `dark` the
 * red of its caps, which is not dark at all but is the third colour the pill is
 * actually made of. A tear that sprayed only blue would be spraying a rectangle
 * rather than the deck.
 *
 * This is the whole of what widening `ParticleField.burst` past bricks costs:
 * one row here, and the simulation still names a material rather than a colour.
 */
export const CHUNK_COLORS: Record<ChunkMaterial, BrickColorSet> = {
  ...BRICK_COLORS,
  deck: {
    flat: canvasPalette.paddleBody,
    light: canvasPalette.paddleTopSheen,
    dark: canvasPalette.paddleCap,
  },
};

/**
 * The sprite tones DEMAKE paints as ground; everything else becomes ink.
 *
 * The rule is the **shadow role**, not a brightness: 1-bit art is edges, and
 * the game's edges are the 1px bevels every sprite is banded with. Flattening
 * those to one tone would turn the field into green slabs — the bricks would
 * lose their grid, the paddle its ends, the wall its depth.
 *
 * Which is also why the list is longer than the bevels: a hole that goes ink is
 * a disc, and three portal bands that all go ink stop scrolling. A tone earns a
 * place here when going ink would cost a *shape*, not merely a shade.
 *
 * Deduplicated by value, so `paddleBottomShade` (the blue brick's own dark),
 * `peelShade` (the gold brick's), and `popShadow`/`bumperCore`/`critterEye`
 * (all `dropShade`) are already covered by the entries below.
 */
export const DEMAKE_GROUND_TONES: ReadonlySet<string> = new Set([
  ...Object.values(BRICK_COLORS).map((set) => set.dark),
  canvasPalette.wallShade,
  canvasPalette.ballShade,
  canvasPalette.dropShade,
  canvasPalette.singularityCore,
  canvasPalette.portalDark,
]);
