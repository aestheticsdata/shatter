// The figures on the fine grid (SHA-227): the effects whose mark is a *drawing*
// rather than a sample.
//
// SHA-222 took every effect whose mark is a sample — a dot of thread, a grain
// of dust, a speck of grit — and gave it the fine grid through `mote` and
// `fineRect`, because a sample only ever needed a resolution. What is in this
// module is the other half: a handful of small pictures where each pixel means
// something, so each had to be *redrawn* three times larger rather than
// switched over.
//
// **Baked, unlike the rest of that half.** The brackets, reticles and diamonds
// that went back into `CanvasRenderer` are parametric — they take a life, a
// reach, a direction — so they are drawn fresh every frame at about the cost
// they already paid. These four are not: a chip has four tumble faces, a rock
// five burn sizes, a peel two poses, a grub twelve states, and that is the
// whole key space. Bake once, blit forever; see `SpriteCache`.
//
// See the spec: `docs/superpowers/specs/2026-09-20-hd-pixel-art-pass-design.md`.

import { mirrored } from "@entities/creatures/bitmap";
import { FINE } from "@interfaces/art";
import { canvasPalette, demakeTone } from "@render/palette";
import { mix, Pix, pillRows, SpriteCache, scale3x } from "@render/pix";

const FIGURES = new SpriteCache();

function inkFor(demade: boolean): ((hex: string) => string) | undefined {
  return demade ? demakeTone : undefined;
}

/**
 * GRAVEL's chip, `size` game pixels square, tumbling face `corner`.
 *
 * Classic has a 4 px square with one pixel lit at a corner and one darkened
 * opposite, and the corner walks round on `tumbleTicks` — which is as much as
 * sixteen pixels can say about a stone turning over. On the fine grid the same
 * square is twelve across, and what it spends that on is the thing the classic
 * sprite could only point at: a *facet*. A wedge of light at the leading corner
 * and its answering wedge of shadow opposite, with the square's own corners
 * knocked off, so the chip reads as a piece of something broken rather than as
 * a die.
 *
 * The count does not change and neither does the size. GRAVEL spills four to
 * six chips a kill and they are 4 px because that is what the simulation
 * scatters; this is the same shower, made of stones instead of pixels.
 */
export function hdGravelChipPix(size: number, corner: number, demade = false): Pix {
  const span = size * FINE;
  const pix = new Pix(span, span, inkFor(demade));
  // The body, with a pixel off each corner — the smallest cut that stops a
  // square reading as a square, and the same one the classic brick's outline
  // makes for the same reason.
  pix.rect(1, 0, span - 2, span, canvasPalette.gravelChip);
  pix.rect(0, 1, span, span - 2, canvasPalette.gravelChip);

  // Which corner the light is on, as a pair of signs. `corner` walks 0..3 round
  // the square exactly as classic's does, so a chip's tumble is the same
  // rotation at both resolutions and a GRAVEL shower does not change its
  // rhythm on the fine grid.
  const lightX = corner === 1 || corner === 2 ? 1 : 0;
  const lightY = corner >= 2 ? 1 : 0;

  // **A bevel and a wedge, not a triangle across the face.** The first draft of
  // this drew a third of the chip as a lit right triangle and a third as a dark
  // one, which at twelve pixels is not a facet — it is a square with two
  // stripes on it. What says "a piece broken off something" is the same thing
  // that says it on every brick in this game: an edge lit on two sides and
  // shaded on the other two, with the light gathering at one corner.
  const face = (nearX: number, nearY: number, hex: string): void => {
    pix.rect(nearX === 1 ? span - 1 : 0, 1, 1, span - 2, hex);
    pix.rect(1, nearY === 1 ? span - 1 : 0, span - 2, 1, hex);
    // The corner itself, a step deeper: two rows of the bevel's own tone turned
    // inward, which is the catch of light on a facet rather than the edge of
    // one. Small on purpose — at three rows it is a triangle again.
    for (let step = 0; step < FACET; step++) {
      const run = FACET - step;
      pix.rect(nearX === 1 ? span - 1 - run : 1, nearY === 1 ? span - 2 - step : 1 + step, run, 1, hex);
    }
  };
  face(lightX, lightY, canvasPalette.gravelChipLit);
  face(1 - lightX, 1 - lightY, canvasPalette.gravelCrack);
  return pix;
}

// How far the catch of light reaches in from its corner, in fine pixels. Two:
// enough that the corner reads as turned toward the light, and short enough
// that what the eye takes in is a stone with a bevel rather than a square cut
// in half diagonally.
const FACET = 2;

/** One chip, baked. Four faces, and a second set while the tube holds. */
export function hdGravelChip(size: number, corner: number, demade = false): HTMLCanvasElement {
  return FIGURES.get(`chip:${size}:${corner}:${demade}`, () => hdGravelChipPix(size, corner, demade).toCanvas());
}

/**
 * One METEOR rock, `size` game pixels across, with or without its ember cap.
 *
 * Classic draws a 4 px square of white-hot core with a 2 px cap of ember on the
 * trailing edge, and the cap is what points the rock the way it is falling. A
 * square is not a rock and never was; twelve fine pixels are enough for a disc,
 * and a disc with a hot centre and a trailing flame is the same reading drawn
 * rather than implied.
 *
 * **The burn-out keeps its steps.** Below the wall the rock is being used up —
 * the cap goes out and the core steps down four rungs, three ticks each — and
 * that ramp is the drawing of a rock turning into its own smoke. It is walked
 * in game pixels here too, because the trail behind it thickens on the same
 * rungs and the two have to stay in step.
 */
export function hdMeteorPix(size: number, capped: boolean, demade = false): Pix {
  const span = size * FINE;
  const height = capped ? span + CAP : span;
  const pix = new Pix(span, height, inkFor(demade));
  const radius = span / 2;
  // The rock sits at the bottom of its own sprite, so the cap has somewhere to
  // be: a meteor falls, so the ember streams off the trailing edge, which is
  // the top.
  const bottom = height - radius;
  if (capped) {
    // The ember as a crown round the rock's leading half — one disc a cap
    // wider than the core, with the core laid over it. What shows is a rim of
    // flame above and to the sides and nothing below, which is the shape of
    // something being burned off by the air in front of it.
    // **The flame is the rock's own width, a cap higher up** — the two discs
    // make one teardrop rather than a cap on a ball. A wider flame disc banded
    // across the rock's shoulders was the first draft and it came out a
    // mushroom: an ember overhanging the stone it is coming off reads as
    // something growing on it. Same radius, centre raised by the cap, and the
    // silhouette is one falling object whose leading end is on fire.
    pix.discBand(radius, bottom - CAP, radius, 0, CAP, canvasPalette.meteorFlame);
    // The ember's leading rows cooled toward the core, so the flame ends in air
    // rather than on a line.
    pix.discBand(
      radius,
      bottom - CAP,
      radius,
      0,
      SHADE,
      mix(canvasPalette.meteorFlame, canvasPalette.meteorCore, 0.45),
    );
  }
  pix.disc(radius, bottom, radius, canvasPalette.meteorCore);
  // The rock's own shadow, on the side away from the air: one fine ring of the
  // flame's tone under the core's lower edge, which is the only thing in this
  // sprite that says the cream disc is a sphere.
  if (span > CAP) {
    pix.discBand(radius, bottom, radius, height - SHADE, SHADE, mix(canvasPalette.meteorCore, "#000000", 0.2));
  }
  return pix;
}

// The ember cap's reach past the core, in fine pixels — the two game pixels
// classic puts above the rock, at the resolution it is drawn on — and how many
// rows of the rock's underside are turned away from the light.
const CAP = 6;
const SHADE = 3;

/** One rock, baked. Five sizes down the burn ramp, and the whole one. */
export function hdMeteor(size: number, capped: boolean, demade = false): HTMLCanvasElement {
  return FIGURES.get(`meteor:${size}:${capped}:${demade}`, () => hdMeteorPix(size, capped, demade).toCanvas());
}

/**
 * BANANA's peel, `width` game pixels across and `height` tall.
 *
 * Classic's is a three-row band with the corners of the top and bottom rows cut
 * — a lozenge, which is as near a peel as five rows of whole pixels reach. The
 * fine grid has fifteen rows and spends them on the curl: the ends round off
 * through `pillRows`, the top carries the light, and the underside goes to the
 * gold brick's dark where the peel is lying against the rail.
 *
 * The same shape serves the one in the air and the one at rest, because it is
 * the same object — what changes between them is only where it is drawn and
 * whether anything is under it.
 */
export function hdPeelPix(width: number, height: number, demade = false): Pix {
  const span = width * FINE;
  const rows = height * FINE;
  const pix = new Pix(span, rows, inkFor(demade));
  const outer = pillRows(rows);
  const lit = mix(canvasPalette.peelBody, "#ffffff", 0.35);
  for (let y = 0; y < rows; y++) {
    const inset = outer[y];
    const tone = y >= rows - UNDER ? canvasPalette.peelShade : canvasPalette.peelBody;
    pix.rect(inset, y, span - 2 * inset, 1, tone);
  }
  // The underside dithering up into the body rather than stepping into it,
  // which is what turns two bands into one curled surface — the deck's
  // waterline, on a skin.
  for (let y = rows - UNDER - 2; y < rows - UNDER; y++) {
    pix.dither(outer[y], y, span - 2 * outer[y], 1, canvasPalette.peelShade, 0.5);
  }
  // The light along the top, held off both ends: a peel is a curled skin, and
  // the one thing that says so is a highlight that stops before the curl turns
  // away from it.
  const shoulder = outer[LIT] + CURL;
  pix.rect(shoulder, 1, span - 2 * shoulder, LIT, lit);
  return pix;
}

// The peel's three bands, in fine pixels: how much of the top is lit, how much
// of the underside is the gold brick's dark, and how far the highlight is held
// off the ends so the curl turns away from it.
const LIT = 3;
const UNDER = 4;
const CURL = 3;

/** One peel, baked. */
export function hdPeel(width: number, height: number, demade = false): HTMLCanvasElement {
  return FIGURES.get(`peel:${width}:${height}:${demade}`, () => hdPeelPix(width, height, demade).toCanvas());
}

/**
 * CRITTER's grub, as a character grid — the house idiom for a creature.
 *
 * ASCII rather than a list of rects, exactly as `BROOD_BITMAPS` is and for the
 * same reason: this is a drawing, and a leg moved or an eye lowered should be a
 * character rather than a coordinate. It is the same ten by eight pixels
 * `CanvasRenderer` has always painted the grub as, transcribed — a full-width
 * body with its top and bottom rows inset, a brown belly under it, a red jaw at
 * the leading end and an eye behind it.
 *
 * Written facing right; `mirrored` turns it round, so the grub that walks left
 * is the same drawing rather than a second one to keep in step.
 */
const CRITTER_BITMAP: readonly string[] = [
  "..........",
  ".bsbbsbbb.",
  "bbsbbsbebb",
  "bbsbbsbbbj",
  "bbsbbsbbbj",
  "bbsbbsbbbb",
  ".uuuuuuuu.",
  "..........",
];

// The three feet, as their own row: they shuffle a pixel sideways on the stride
// clock, so they are laid over the body rather than authored into it — twelve
// bitmaps that differed by one character each would be twelve places to edit a
// grub's gait.
const CRITTER_FEET = [1, 4, 7];

/**
 * One grub, on the fine grid, in `body` with its feet at `stride`.
 *
 * **`scale3x`, not a redrawing.** The 1x bitmap stays the source of truth — it
 * is what makes the jaw and the eye editable — and what the creature gains at
 * three times the size is the one thing it can gain without being re-authored:
 * its staircases rounded off. A grub's silhouette is a body with its corners
 * knocked in, and on the coarse grid those corners are 3 px steps; Scale3x
 * reads the eight neighbours of every pixel and turns them into the curve they
 * were always meant to be. Every tell stays exactly where the bitmap put it.
 */
export function hdCritterPix(body: string, leading: boolean, stride: number, demade = false): Pix {
  const rows = [...CRITTER_BITMAP];
  const feet = rows[7].split("");
  for (const foot of CRITTER_FEET) {
    feet[foot + stride] = "u";
  }
  rows[7] = feet.join("");
  const palette = {
    b: body,
    // The two creases behind the head, which is the one thing the fine grid had
    // to *add* rather than resolve. Scale3x rounds the grub's outline into the
    // curve it was always drawing; what it cannot do is give thirty by
    // twenty-four pixels of flat body anything to be. A grub is segmented, so
    // the body reads as a body — and the creases stay clear of the head, where
    // the jaw and the eye are already saying which end is which.
    s: mix(body, canvasPalette.critterUnder, 0.35),
    u: canvasPalette.critterUnder,
    j: canvasPalette.critterJaw,
    e: canvasPalette.critterEye,
  };
  return scale3x(leading ? rows : mirrored(rows), palette, inkFor(demade));
}

/** One grub, baked: three body tones by two directions by two strides. */
export function hdCritter(body: string, leading: boolean, stride: number, demade = false): HTMLCanvasElement {
  return FIGURES.get(`critter:${body}:${leading}:${stride}:${demade}`, () =>
    hdCritterPix(body, leading, stride, demade).toCanvas(),
  );
}
