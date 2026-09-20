// The capsule on the fine grid (SHA-219): fifty-eight pills, one recipe.
//
// Classic draws a drop as a rectangle with its corners cut, a white row under
// the top edge and an ink row above the bottom one — three fills, and at 3x3
// blocks that is the most a 20x8 sprite can say. The fine grid has 60x24 and
// spends it on the thing the name has always claimed: a capsule. Rounded ends
// off `pillRows`, a dark contour, a white glare across the top, the body
// dithering into its own ink at the waterline, and an ink foot.
//
// **The body is the whole sprite here and the letter is not.** The glyph stays
// live text in `drawCapsule`: it is measured against Silkscreen's advance and
// stepped down a ladder so a four-character name fits, it turns itself upright
// under FLIP, and DEMAKE punches it out of the pill in ground. Baking it into
// the sprite would cost all three to save one `fillText`.
//
// The catch box does not move. It is 20x8 and it always was; what changed is
// that the drawn corners are rounder. The full 20 px is still there at the
// rows the deck actually meets.
//
// See the spec: `docs/superpowers/specs/2026-09-20-hd-pixel-art-pass-design.md`.

import { DROP_HEIGHT, DROP_WIDTH } from "@entities/powerups/DropPool";
import { FINE } from "@interfaces/art";
import { canvasPalette, demakeTone } from "@render/palette";
import { BAYER, mix, Pix, pillRows, SpriteCache } from "@render/pix";

const WIDTH = DROP_WIDTH * FINE;
const HEIGHT = DROP_HEIGHT * FINE;

const PILLS = new SpriteCache();

/**
 * One capsule body in `hex`, on its own fine-grid surface.
 *
 * Keyed on the colour rather than the kind, which is the roster's own
 * economy: six capsules wear a brick's exact colour by design and several more
 * share theirs, so fifty-eight kinds come out as rather fewer sprites — and a
 * capsule that is only its colour and its letter is exactly what the player
 * reads.
 *
 * Separate from `hdCapsule` so the recipe can be checked under plain node;
 * `scripts/check-pix.mjs` pins the silhouette against `pillRows`.
 */
export function hdCapsulePix(hex: string, demade = false): Pix {
  const pix = new Pix(WIDTH, HEIGHT, demade ? demakeTone : undefined);
  const outline = mix(hex, "#000000", 0.5);
  const glare = mix(hex, canvasPalette.dropSheen, 0.45);
  const low = mix(hex, canvasPalette.dropShade, 0.5);
  const outer = pillRows(HEIGHT);
  const inner = pillRows(HEIGHT - 2);

  for (let y = 0; y < HEIGHT; y++) {
    pix.rect(outer[y], y, WIDTH - 2 * outer[y], 1, outline);
  }

  for (let y = 1; y < HEIGHT - 1; y++) {
    const inset = inner[y - 1] + 1;
    for (let x = inset; x < WIDTH - inset; x++) {
      // The waterline, three rows of it, indexed by the surface as every dither
      // in the pass is — so a wall of revealed capsules interlocks rather than
      // showing where one pill ends and the next begins.
      const dither = BAYER[y & 3][x & 3] < 8;
      pix.set(
        x,
        y,
        y <= 1
          ? canvasPalette.dropSheen
          : y <= 4
            ? glare
            : y <= 15
              ? hex
              : y <= 18
                ? dither
                  ? hex
                  : low
                : y <= 21
                  ? low
                  : canvasPalette.dropShade,
      );
    }
  }

  return pix;
}

/**
 * One capsule body, baked. At most one per colour the roster uses, and one more
 * per colour while the tube holds (SHA-223).
 *
 * The pill comes out of the filter as more than the flat ink slab classic
 * draws: the contour and the ink underfoot are ground, the glare and the body
 * above the waterline are ink, and the waterline's own dither survives as a
 * halftone between them — which is what a 1-bit port of a capsule looks like.
 * The letter is still punched out of it in ground by `drawCapsule`.
 */
export function hdCapsule(hex: string, demade = false): HTMLCanvasElement {
  return PILLS.get(`${hex}:${demade}`, () => hdCapsulePix(hex, demade).toCanvas());
}
