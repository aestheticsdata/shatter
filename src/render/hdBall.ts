// The ball on the fine grid (SHA-217): the same silhouette, lit as a sphere.
//
// Classic draws the ball as eight rows of 3x3 blocks with an L of highlight in
// one corner and an L of shade in the other — the reading that turns a disc
// into a ball at eight pixels, and the best that can be done with three tones
// and no sub-pixels. The fine grid has 24 pixels across the same ball and it
// spends them on the one thing the small sprite can only imply: a terminator.
// A near-black contour, a ring of shade inside it, the body offset half a pixel
// up and to the left so the shade gathers at the lower right, a dithered rim
// where the two meet, and a highlight with a blown-out specular in it.
//
// **The silhouette does not change.** The outermost disc is exactly
// `ballRows(size * FINE)` — `Pix.disc` and `ballSprite`'s rows are the same
// arithmetic on purpose — so the ball the player sees is the ball the
// simulation collides, at every one of GIANT's nine diameters.
//
// **Nothing here is zoomed.** Every radius is the authored 24 px one times this
// ball's own scale, so a 24 px GIANT is drawn at 72 fine pixels rather than
// being a 24-pixel drawing blown up three times. That is the house rule for the
// ball (GIANT, SHA-135) and for the bosses (SHA-213) alike.
//
// See the spec: `docs/superpowers/specs/2026-09-20-hd-pixel-art-pass-design.md`.

import { FINE } from "@interfaces/art";
import { canvasPalette } from "@render/palette";
import { mix, Pix, SpriteCache } from "@render/pix";

// The sprite the recipe was authored on: the game's 8 px ball at FINE.
const AUTHORED = 24;

/**
 * The blown-out core of the highlight.
 *
 * White is not a palette tone and is not meant to be one — it is the absence of
 * a tone, which is what a specular is. It appears here exactly as it does in the
 * brick's `L2` (`mix(l1, "#ffffff", 0.5)`): as an endpoint to reach toward, not
 * as a colour the roster authored.
 */
const SPECULAR = "#ffffff";

/** How thick the pace ghost's outline is, in fine pixels. */
const SHELL_WIDTH = 2;

const BALLS = new SpriteCache();

/**
 * One ball, `size` game pixels across, on its own fine-grid surface.
 *
 * Kept separate from `hdBallSprite` so the whole recipe can be checked under
 * plain node — `Pix.toCanvas` is the only line in the pass that needs a DOM,
 * and `scripts/check-pix.mjs` pins this drawing's silhouette against
 * `ballRows` at every diameter GIANT can produce.
 */
export function hdBallPix(size: number): Pix {
  const diameter = size * FINE;
  const scale = diameter / AUTHORED;
  const at = (authored: number): number => authored * scale;
  const whole = (authored: number): number => Math.round(authored * scale);
  const pix = new Pix(diameter, diameter);

  // Outside in. The contour and the shade share the sprite's true centre; the
  // body sits one authored pixel up and to the left of it, which is the whole
  // of why the shade reads as a terminator rather than as an outline — it is
  // thick where the light is not.
  pix.disc(at(12), at(12), at(12), mix(canvasPalette.ballShade, "#000000", 0.4));
  pix.disc(at(12), at(12), at(11), canvasPalette.ballShade);
  pix.disc(at(11), at(11), at(10), canvasPalette.ballBody);
  // Half a pixel off both axes on purpose: `Pix.disc` rounds its columns and
  // its rows differently, so a half-integer centre lays this dithered rim
  // *outside* the solid body on the lower right instead of over it. One pixel
  // of anti-aliasing out of ordered dither, with no blended tone anywhere.
  pix.disc(at(11.5), at(11.5), at(10.5), canvasPalette.ballBody, 0.5);
  pix.disc(at(9), at(9), at(4.5), canvasPalette.ballHighlight);
  pix.disc(at(9.5), at(9.5), at(5.5), canvasPalette.ballHighlight, 0.5);

  // The specular: a square with a pixel off two of its corners, which at this
  // size reads as a round catchlight and at 1x would read as a blob. Rounded to
  // whole fine pixels rather than scaled as a rectangle, so it stays the same
  // shape at the half-steps of GIANT's swell instead of growing a ragged edge.
  const core = Math.max(1, whole(2));
  const chip = Math.max(1, whole(1));
  pix.rect(whole(7), whole(7), core, core, SPECULAR);
  pix.rect(whole(9), whole(7), chip, chip, SPECULAR);
  pix.rect(whole(7), whole(9), chip, chip, SPECULAR);

  return pix;
}

/**
 * The ball's silhouette as an outline, hollow inside — TEMPO's pace ghost.
 *
 * Two fine pixels thick rather than the one an outline would naturally be: the
 * ghost is a mark the player reads out of the corner of an eye while tracking
 * the ball itself, and a hairline at this resolution is a mark that is not
 * there. The caps come out solid because there is no room for a hole in them,
 * which is what the classic shell does as well.
 */
export function hdBallShellPix(size: number, hex: string): Pix {
  const diameter = size * FINE;
  const radius = diameter / 2;
  const hollow = radius - SHELL_WIDTH;
  const pix = new Pix(diameter, diameter);

  for (let y = 0; y < diameter; y++) {
    const dy = y + 0.5 - radius;
    // `ballRows`' rule, and `Pix.disc`'s: the half-span is rounded rather than
    // the span, so the outline lands on exactly the pixels the filled ball
    // would have lit on its edge.
    const outer = Math.round(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
    if (outer <= 0) {
      continue;
    }
    const inner = Math.round(Math.sqrt(Math.max(0, hollow * hollow - dy * dy)));
    if (inner <= 0) {
      pix.rect(radius - outer, y, outer * 2, 1, hex);
      continue;
    }
    pix.rect(radius - outer, y, outer - inner, 1, hex);
    pix.rect(radius + inner, y, outer - inner, 1, hex);
  }

  return pix;
}

/** One ball, baked. Ten of these exist in a run: GIANT's nine and the plain one. */
export function hdBallSprite(size: number): HTMLCanvasElement {
  return BALLS.get(`ball:${size}`, () => hdBallPix(size).toCanvas());
}

/** One pace ghost, baked, per size the capsule pair can produce. */
export function hdBallShell(size: number, hex: string): HTMLCanvasElement {
  return BALLS.get(`shell:${size}:${hex}`, () => hdBallShellPix(size, hex).toCanvas());
}

/**
 * A plain disc `diameter` fine pixels across, baked — the ball's shape without
 * its lighting.
 *
 * Two callers, and both want a ball-shaped blot rather than a ball: a newborn
 * clone's growing pip, and one step of the speed trail. Neither carries a
 * terminator, because neither is a sphere — one is light and the other is where
 * the ball was.
 *
 * The diameter is rounded to an even number for `ballRows`' reason: an odd one
 * puts the centre on a pixel boundary and every row half a pixel off-centre,
 * which on a smear that shrinks frame by frame reads as a wobble.
 */
export function hdBallDisc(diameter: number, hex: string): HTMLCanvasElement {
  const even = Math.max(2, Math.round(diameter / 2) * 2);
  return BALLS.get(`disc:${even}:${hex}`, () => {
    const pix = new Pix(even, even);
    pix.disc(even / 2, even / 2, even / 2, hex);
    return pix.toCanvas();
  });
}
