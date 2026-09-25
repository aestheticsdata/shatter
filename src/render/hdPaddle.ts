// The deck on the fine grid (SHA-218): one pill, at whatever width it is.
//
// Classic paints the paddle as five overlapping `fillRect`s — a body, a cap at
// each end, a sheen row and a shade row — which at 3x3 blocks is a bar with a
// light line on top. The fine grid has twenty-one rows to spend on the same
// seven pixels, and it spends them on a cylinder: a dark outline round a
// rounded-off pill, a sheen fading through a half-tone into the body, the body
// dithering into its own shade at the waterline, and a dashed light bar down
// the middle that says the deck is a lit surface rather than a coloured shape.
//
// **The recipe is a function of the width and nothing else.** The deck
// telescopes one pixel per edge per tick, so there is no such thing as "the
// WIDE sprite" — there is the sprite at 58 fine pixels and the sprite at 60,
// and every state the game has (base 46, WIDE 72, XWIDE 144, JAMMER 30, each
// half of a SPLIT 66, and MIRROR's ghost at any fraction of all of them) is one
// width among the rest. A recipe written per named state would flicker between
// two sprites for the twelve ticks a capsule takes to arrive.
//
// See the spec: `docs/superpowers/specs/2026-09-20-hd-pixel-art-pass-design.md`.

import { gameConfig } from "@core/config/GameConfig";
import { FINE } from "@interfaces/art";
import { demakeTone } from "@render/palette";
import { BAYER, mix, Pix, pillRows, SpriteCache } from "@render/pix";

import type { PaddleBandColors } from "@render/palette";

// What the classic deck reserves at each end for a cap, in fine pixels. Kept as
// the same 8 game pixels rather than retuned: the cap is where the ball's
// english is read off, `drawResin` and the cannons are placed against it, and a
// cap that moved would move all three.
const CAP = 8 * FINE;

/**
 * The narrowest deck that is still a pill, in game pixels.
 *
 * Classic's reason and classic's number: below 18 there is not room for two
 * 8 px caps and the 9 px sheen inset between them. The HD recipe has the same
 * problem — two caps would overlap and the light bar would have negative width
 * — and answers it the same way, with a plain bar. Only MIRROR's ghost ever
 * gets there, on the first frames of forming.
 */
const NARROW = 18;

// The light bar's dash: thirteen fine pixels lit, two dark, down the middle
// three rows. A continuous line reads as a machined edge; a dash reads as a
// reflection broken up by the surface it is on.
const DASH_PERIOD = 15;
const DASH_LIT = 13;
const DASH_INSET = 6;

/**
 * How far the light bar is held off the cap welds, for a body `span` fine
 * pixels wide.
 *
 * The handoff's six is right on a deck with room for it and wrong on one
 * without: two caps take 48 of the 60 fine pixels a 20 px SPLIT half has, so
 * six a side leaves the bar nothing and the half comes out unlit. Classic still
 * shows two game pixels of sheen there, and a state that loses its highlight on
 * the HD path only is the defect rule 1 exists to catch. A quarter of the span
 * reaches six at every width the bar was authored on, so the wide deck is
 * untouched and the narrow one keeps its glint.
 */
function dashInset(span: number): number {
  return Math.min(DASH_INSET, Math.floor(span / 4));
}

const PILLS = new SpriteCache();

/**
 * One deck, `fineWidth` fine pixels across, on its own surface.
 *
 * Separate from `hdPill` so the whole recipe can be checked under plain node —
 * `scripts/check-pix.mjs` pins its silhouette against `pillRows` at every width
 * the roster can produce.
 */
export function hdPillPix(fineWidth: number, colors: PaddleBandColors, demade = false): Pix {
  const height = gameConfig.paddle.height * FINE;
  const pix = new Pix(fineWidth, height, demade ? demakeTone : undefined);
  const outline = mix(colors.shade, "#000000", 0.5);
  const outer = pillRows(height);
  const inner = pillRows(height - 2);

  // The silhouette first, in the outline tone, and everything else drawn inside
  // it — so the pill keeps exactly the shape `pillRows` gives it however the
  // bands are filled in.
  for (let y = 0; y < height; y++) {
    pix.rect(outer[y], y, fineWidth - 2 * outer[y], 1, outline);
  }

  if (fineWidth < NARROW * FINE) {
    // The bar: the same pill, the same three bands, no caps and no light — at
    // this width there is nothing for a cap to be at the end *of*.
    for (let y = 1; y < height - 1; y++) {
      const inset = inner[y - 1] + 1;
      const tone = y <= 2 ? colors.sheen : y >= height - 3 ? colors.shade : colors.body;
      pix.rect(inset, y, fineWidth - 2 * inset, 1, tone);
    }
    return pix;
  }

  const capLight = mix(colors.cap, "#ffffff", 0.4);
  const capDark = mix(colors.cap, "#000000", 0.45);
  const bodyLight = mix(colors.body, colors.sheen, 0.4);
  const bodyDark = mix(colors.body, colors.shade, 0.55);
  const bodyBar = mix(colors.body, colors.sheen, 0.5);
  const inlet = dashInset(fineWidth - 2 * CAP);

  for (let y = 1; y < height - 1; y++) {
    const inset = inner[y - 1] + 1;
    for (let x = inset; x < fineWidth - inset; x++) {
      // The waterline: rows 14 to 16 are the body dithering into its own shade
      // rather than stepping into it, which is what makes seven pixels of deck
      // read as something round. Indexed by the surface, as every dither in the
      // pass is, so the cap's band and the body's interlock across the seam
      // between them.
      const dither = BAYER[y & 3][x & 3] < 8;
      const capped = x < CAP || x >= fineWidth - CAP;
      let tone: string;
      if (x === CAP - 1 || x === fineWidth - CAP) {
        // The weld between a cap and the body: one column of outline, which is
        // what stops the two materials from blending into a single smear.
        tone = outline;
      } else if (capped) {
        tone = y <= 2 ? capLight : y <= 13 ? colors.cap : y <= 16 ? (dither ? colors.cap : capDark) : capDark;
      } else if (
        y >= 9 &&
        y <= 11 &&
        x >= CAP + inlet &&
        x < fineWidth - CAP - inlet &&
        (x - CAP - inlet) % DASH_PERIOD < DASH_LIT
      ) {
        tone = y === 10 ? colors.sheen : bodyBar;
      } else {
        tone =
          y <= 2
            ? colors.sheen
            : y <= 5
              ? bodyLight
              : y <= 13
                ? colors.body
                : y <= 16
                  ? dither
                    ? colors.body
                    : bodyDark
                  : y <= 18
                    ? bodyDark
                    : colors.shade;
      }
      pix.set(x, y, tone);
    }
  }

  return pix;
}

/**
 * One deck, baked.
 *
 * Keyed on the width and the four tones together, which is what keeps the key
 * small: the tones are a fixed set — the player's deck, its JAMMER caps, the
 * chain's gold sheen, MIRROR's ghost, a BOMB's whiteout — except while THE IRIS
 * is turning the deck to stone, and `petrifyBlend` is a ramp of sixths and
 * twelfths, so that adds at most eighteen tone sets rather than one a frame.
 *
 * Baked and not drawn, unlike the wall. A brick is bands and the HD recipe is
 * twenty fills; this one asks a question of every pixel — which side of the
 * dither, inside the dash or between two of them — so drawn straight it would
 * be several hundred fills for each of the six pills a frame can hold.
 */
export function hdPill(fineWidth: number, colors: PaddleBandColors, demade = false): HTMLCanvasElement {
  const key = `${fineWidth}:${colors.body}:${colors.cap}:${colors.sheen}:${colors.shade}:${demade}`;
  return PILLS.get(key, () => hdPillPix(fineWidth, colors, demade).toCanvas());
}
