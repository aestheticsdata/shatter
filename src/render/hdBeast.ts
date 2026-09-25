// THE BESTIARY on the fine grid (SHA-233): the bakes, with none of the walking.
//
// `scale3x` of the ASCII bitmap is the whole recipe and it is the house idiom —
// `pix.ts` has carried it since SHA-215 and SHA-227 used it in anger for
// CRITTER's grub. What is here is the two things the bestiary needs that the
// grub did not: the strike flash, which has to be baked rather than overridden,
// and a cache key for an inventory of a hundred and twenty-odd sprites.
//
// See the spec: `docs/superpowers/specs/2026-09-21-observer-hd-design.md`.

import { SpriteCache, scale3x } from "@render/pix";

import type { Pix } from "@render/pix";

const BEASTS = new SpriteCache();

/**
 * The three ways a creature is painted while a strike cools off it.
 *
 * **It has to be baked, and that is the one thing this step could not take
 * from Part B.** Classic paints the flash with `drawBitmap`'s `override`, a
 * function handed each source character that may answer a tone instead of the
 * palette's — which is how a struck beast wears white without a second copy of
 * the walk. After `scale3x` there are no source characters left to key on: a
 * baked sprite is pixels. So the override becomes a palette, the palette
 * becomes part of the key, and each frame bakes three times.
 *
 * Eight species at two frames, three brood forms at five sprites between them,
 * three flashes and two machines is under a hundred and thirty small sprites —
 * a key that is small and finite, unlike the eye's, which is why the beasts
 * bake and the almond does not.
 */
export const FLASH = { NONE: "none", WHOLE: "whole", OUTLINE: "outline" } as const;

export type Flash = (typeof FLASH)[keyof typeof FLASH];

/**
 * Which of the three a strike wears, from how much of it is left.
 *
 * Two steps and not a blend, exactly as classic reads it: these are flat
 * sprites with no in-between tone, and a lerp on a five-colour bitmap only
 * dithers. The whole silhouette goes white for the first half of the strike,
 * then the outline alone, then the creature is itself again.
 */
export function flashOf(left: number): Flash {
  if (left <= 0) {
    return FLASH.NONE;
  }
  return left > 0.5 ? FLASH.WHOLE : FLASH.OUTLINE;
}

/**
 * The palette a flash paints through.
 *
 * `WHOLE` maps every character the palette knows, and only those — a character
 * with no entry is a hole, which is how `.` stays transparent and why whiting
 * a sprite cannot fatten it. `OUTLINE` maps the one character the species
 * cools through and leaves the rest alone.
 */
function flashed(
  palette: Readonly<Record<string, string>>,
  outline: string,
  flash: Flash,
  white: string,
): Readonly<Record<string, string>> {
  if (flash === FLASH.NONE) {
    return palette;
  }
  if (flash === FLASH.WHOLE) {
    return Object.fromEntries(Object.keys(palette).map((character) => [character, white]));
  }
  return { ...palette, [outline]: white };
}

/**
 * One creature's bitmap at three times the size, with its staircases rounded.
 *
 * **Applied to the bitmap the game would have drawn, whatever produced it.** A
 * boss is `grown()` of its species, a ceiling snail is `flipped()`, a grub
 * walking the other way is `mirrored()` — all three produce rows, and the art
 * path takes it from there, so the transforms compose in any order without a
 * second recipe. The one thing to watch is what that does to the rounding: on
 * a bitmap grown by blocks, Scale3x spends its work on the blocks' own corners
 * rather than on the authored silhouette's — which is why `grown` is Scale2x
 * and not nearest-neighbour (SHA-258).
 *
 * No `ink` argument, because the palette has already been chosen for the
 * machine — a species carries its own `demade` set, and a brood sprite gets
 * one from `broodPalette`. Same reason the classic brush is built with
 * `demade: false`.
 */
export function hdBeastPix(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
  outline: string,
  flash: Flash,
  white: string,
): Pix {
  return scale3x(rows, flashed(palette, outline, flash, white));
}

/** The same, baked and kept. `key` names the sprite, its frame, its flash and its machine. */
export function hdBeastSprite(
  key: string,
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
  outline: string,
  flash: Flash,
  white: string,
): HTMLCanvasElement {
  return BEASTS.get(key, () => hdBeastPix(rows, palette, outline, flash, white).toCanvas());
}

/** How many sprites the bestiary is holding — for the console, and for the guard. */
export function hdBeastCount(): number {
  return BEASTS.size;
}
