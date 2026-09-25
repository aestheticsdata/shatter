// THE OBSERVER's almond on the fine grid (SHA-228): the geometry, with none of
// the painting.
//
// Split out of `CanvasRenderer` rather than written beside `drawEye` for the
// reason `hdBall` and `hdPaddle` were: `scripts/check-pix.mjs` runs the real
// module under plain node, and everything here is arithmetic over numbers. The
// painting stays in the renderer, because the eye is *drawn* rather than baked
// — fourteen sockets times the eight-to-fourteen distinct lids a blink passes
// through is on the order of two hundred sprites, SUNRISE's is 900x360 fine
// pixels, and `SpriteCache` has no eviction.
//
// See the spec: `docs/superpowers/specs/2026-09-21-observer-hd-design.md`.

import { FINE } from "@interfaces/art";
import { mix, Pix, SpriteCache } from "@render/pix";

const EYES = new SpriteCache();

/**
 * THE VEIL's socket — the one the classic eye's absolute numbers were authored
 * on, and the denominator under every fraction in this module.
 *
 * **The correction the handoff's Part B needs most.** Its eye *is* this eye:
 * the offsets are absolute fine pixels off `HW = hw*3` and `HO = hhO*3` — rim
 * at (HW+4, HO+3), four lashes at ±(HW−9) and ±(HW−27). The game has fourteen
 * sockets spanning a factor of nine in width and ten in height, so those
 * numbers put all four of SUNRISE's lashes (HW 450) in the outermost nine game
 * pixels of a brow three hundred across, and make VORTEX's rim (HW 48) a third
 * of the eye.
 *
 * The shipped code already solved this once and says so at `EYE_LASHES`:
 * *"Fractions rather than pixels so they sit in the same places on a 42px eye
 * and on a 120px one."* Reading the classic numbers as fractions **of this
 * socket** is what makes the HD almond the shipped almond exactly at 42 x 15,
 * and a family rather than a sprite everywhere else.
 */
export const EYE_AUTHORED = {
  hw: 42,
  hh: 15,
  // The same socket's iris and pupil, in fine pixels — `round(hh * FINE * r)`
  // at the shipped `observer.eye` ratios of 0.8 and 0.34. Part B measures the
  // insets inside the disc in absolute fine pixels off exactly these, so they
  // are the denominators its numbers are read against. `check:pix` pins them
  // to the config, because a socket ratio that moved without them would leave
  // every inset here quietly measured against a disc that no longer exists.
  iris: 36,
  pupil: 15,
} as const;

/** How many fibres run out of Part B's iris, and the skew that stops the first one being axis-aligned. */
const IRIS_FIBRES = 28;
const IRIS_FIBRE_SKEW = 0.1;
/**
 * Where the fibres start and the core ends, as a fraction of the disc — Part
 * B's `IR * 0.42`, which is one number doing two jobs: the fibres grow out of
 * the core's edge rather than out of the pupil, so the iris has a middle.
 */
const IRIS_CORE = 0.42;
/** The halo between the core and the fibres, and how much of it is laid. */
const IRIS_HALO = 0.5;
const IRIS_HALO_COVERAGE = 0.35;
/**
 * The smallest a glint is allowed to be, in fine pixels — Part B's own
 * `max(1.5, 0.18 * PR)`, which is this spec's floor rule written one object
 * before the spec noticed it was a rule.
 */
const GLINT_FLOOR = 1.5;

/**
 * One feature of the almond, in fine pixels: the classic drawing's `authored`
 * game pixels read as the fraction of `authoredSpan` they were, and taken of
 * the socket actually being drawn.
 *
 * **Floored at a single fine pixel**, which is what `finePitch` is to the
 * frame's rails and `NARROW_DECK` is to the deck: a drawing allowed to scale
 * down has to be told where to stop, or the smallest socket in the game loses
 * the feature entirely rather than wearing a small one. VORTEX is hw 16, hh 6 —
 * every fraction here lands under a fine pixel on it, and every one of them
 * comes back as one.
 *
 * `span` is in fine pixels and `authoredSpan` in game ones, which is why the
 * answer at THE VEIL is the classic number times `FINE` rather than the classic
 * number: the same feature, at the same size on screen, on a grid three times
 * finer.
 */
export function eyeFeature(authored: number, authoredSpan: number, span: number): number {
  return Math.max(1, Math.round((authored / authoredSpan) * span));
}

/**
 * The almond's half-width at fine row `dy`, measured from the middle.
 *
 * `hw * (1 - t²)` — the parabola that gives an eye its corners rather than the
 * ellipse that would give it a lens, and the one piece of the drawing that is
 * already a fraction in classic. Sampled here three times as finely, which is
 * the whole of what the fine grid buys the biggest curve in the game: **the
 * tread of the staircase is no wider in fine pixels than it was in game ones**,
 * so on screen it is a third of what it was, and the step the outline is
 * painted over stops being a thing the eye can pick out and becomes the curve.
 */
export function almondHalf(hwFine: number, lidFine: number, dy: number): number {
  const t = dy / lidFine;
  return Math.round(hwFine * (1 - t * t));
}

/**
 * The lid's half-height in fine pixels at `open`.
 *
 * The floor is classic's, in the units classic meant it in: *"never under two
 * rows — a lid that shut to a single line would be gone the frame the field art
 * is dark behind it"*, and two rows of a three-times-finer grid is two thirds
 * of a game pixel, which is exactly the vanishing it was written against. Two
 * game pixels' worth, so a shut eye is as visible as it has always been.
 *
 * What does change is the count: a blink walks `hh * FINE` distinct lids where
 * it walked `hh`, so THE VEIL's fourteen ticks stop landing on the same six
 * heights twice each. Same clock, three times the positions — the diadem's
 * twinkle and the gate's march get the identical thing from the same grid.
 */
export function almondLid(hhFine: number, open: number): number {
  return Math.max(2 * FINE, Math.round(hhFine * open));
}

/**
 * THE TEAR's two tracks and its bead (SHA-230), in the game pixels the classic
 * eye draws them at and against `EYE_AUTHORED` like everything else here: how
 * far each track stands off the pupil, and how far each one falls.
 *
 * **The track's width is the one number that does not go through
 * `eyeFeature`.** It is one fine pixel at every socket in the game, which is a
 * third of what classic can draw and the whole reason the spec calls a tear out
 * separately: a track is water running down a face, and water is thinner than
 * the thinnest thing the coarse grid has. The bead at the end of the long one
 * keeps its game pixel — it is the drop, the thing being read, and the only
 * part of a tear a player has to see.
 */
export const EYE_TEAR = {
  left: 7,
  right: 6,
  fall: 9,
  short: 6,
} as const;

/**
 * THE WRATH's hairline, in fine pixels against THE VEIL's *fine* socket rather
 * than its game-pixel one — Part B's veins are two fine pixels thick, which is
 * two thirds of a game pixel and not sayable in classic's units at all.
 *
 * That thinness is the point. A vein drawn a whole game pixel wide on a white
 * 42 px across is a scratch on a lens; the same mark at two thirds of that is a
 * vessel. It still scales with the socket, because THE WRATH's eye is 84 x 30
 * and a fixed two pixels there would be the scratch again, one size down.
 */
export const EYE_VEIN_WEIGHT = 2;

/**
 * THE LID's waking, as nested almonds: `[how much of the socket this band
 * covers, how much of the deep tone it lays]`.
 *
 * **The shipped reading over Part B's** (SHA-230). Part B draws the emptied
 * socket as a `#55000f` disc with a rim — a red pit — and the shipped eye fills
 * the whole almond with one flat tone. The waking is the pupil having *left*,
 * and a dark disc sitting where the pupil was is a pupil-shaped thing still in
 * there; so the depth goes in the socket's own shape instead, which is why
 * these are almonds and not discs. Nothing here is ever laid solid: at full
 * coverage the innermost band would be an object again.
 *
 * Self-similar rather than concentric — `almondHalf(hw*k, lid*k, dy)` is the
 * same parabola shrunk, so each band closes at its own tip the way the lid
 * closes at the corners, and the socket reads as a bowl rather than as a
 * stack of rings.
 */
export const EYE_HOLLOW: ReadonlyArray<readonly [number, number]> = [
  [0.8, 0.25],
  [0.55, 0.5],
  [0.3, 0.75],
];

/**
 * The screen a placed eye goes behind when DEMAKE takes its alpha away
 * (SHA-231): a tile `cells` by `cells`, `keep` of its cells opaque, cut out of
 * the painted almond with `destination-in`. Eight of the game's sockets are
 * placed rather than veiled and three of those are dispositioned under full
 * opacity — SUNRISE at a fifth, PYRAMID at a third, VORTEX at three fifths.
 *
 * **`cell` is a game pixel, and refusing to make it a fine one is the whole of
 * this step.** Everything else in this module went to thirds as the pass
 * reached it; this did not. A half mask on fine cells is a checker at a third
 * of the pitch, and a checker that fine at any display scale near 1:1 is not a
 * texture — it is a grey, which is the one thing a two-tone machine may not
 * show. It is the bricks' kind marks again: the tube's grain is a game pixel
 * wide because that is what makes it read as grain.
 *
 * So the eye now carries two half tones at two pitches, on purpose. The
 * hollow's dither is one fine pixel, because it is a texture *in* a surface
 * and the fine grid is what buys it. This one stays coarse because it is not
 * the eye's tone at all — it is a screen standing in front of the eye, and a
 * screen fine enough to disappear is just a fade.
 *
 * The cost of a coarse screen over a fine drawing is that it can erase rather
 * than thin: at `keep` 1 the kept cells leave a gap of `cells - 1` of them,
 * and anything narrower than that gap can fall in it and vanish outright. The
 * relation between a socket's size, its opacity and the floor is pinned in
 * `check:pix` rather than trusted, because it is three facts apart and the
 * level that broke it would look like a level with no eye.
 */
export const EYE_HALFTONE = {
  /** One game pixel. The number this whole ticket is about. */
  cell: 1,
  /** Two by two, so `keep` is a coverage in quarters. */
  cells: 2,
  /**
   * Where one dot in four gives way to two. A fifth and a third are two
   * different textures on the tube rather than two greys it cannot show, and
   * the threshold is what keeps them from collapsing into one.
   */
  sparse: 0.34,
} as const;

/** How many of the tile's cells an opacity keeps. */
export function halftoneKeep(opacity: number): 1 | 2 {
  return opacity < EYE_HALFTONE.sparse ? 1 : 2;
}

/** The three tones Part B's iris is drawn from: its body, its rim, and its highlight. */
export interface IrisTones {
  body: string;
  edge: string;
  inner: string;
}

/**
 * THE OBSERVER's iris, `radius` fine pixels of it — Part B's drawing on the
 * roster's tones (SHA-229).
 *
 * **The better drawing, and the fine grid is what makes it possible.** The
 * shipped iris scans rows, lays a two-pixel limbal ring at each row's ends and
 * puts a fibre on every fifth row where `(y + ix) % 5 === 0`: a good
 * approximation of radial fibres by a renderer with no discs to draw and no
 * room to draw them in. This is the thing itself — an edge disc, a body inside
 * it, a half-covered ring softening the limbus, twenty-eight fibres alternating
 * rim and highlight out of the core, and the core dithered over twice.
 *
 * **Baked, unlike the almond around it.** The spec refused a per-socket sclera
 * bake because the lid has eight to fourteen distinct heights a blink passes
 * through and SUNRISE's sheet is 1.3 MB; the iris has none of that. Its key is
 * the tint and the radius, the radius is one value per socket height, and the
 * disc does not change when the eye looks somewhere — it *moves*, which is a
 * blit. Twelve radii by four tints is a key that is small and finite, which is
 * the test Part A set, and it is what buys the 4,700 `set` calls the fibres
 * cost at SUNRISE's 144 px radius.
 *
 * That the texture travels with the look comes free from the same fact, and it
 * is the thing the shipped `(y + ix) % 5` seed was hand-rolling: a baked disc
 * moved rigidly keeps its own fibres where they were drawn, instead of the eye
 * sliding under a pattern fixed to the field.
 */
export function hdIrisPix(tones: IrisTones, radius: number): Pix {
  const pix = new Pix(2 * radius + 2, 2 * radius + 2);
  const centre = radius + 1;
  // Part B's `IR - 3` and `IR - 1`, as the fractions of its own disc they were:
  // three fine pixels of rim on a 36 px iris is a twelfth, and a twelfth of
  // VORTEX's 14 px one is the single pixel the floor hands back.
  const rim = eyeFeature(3, EYE_AUTHORED.iris, radius);
  const soft = eyeFeature(1, EYE_AUTHORED.iris, radius);
  pix.disc(centre, centre, radius, tones.edge);
  pix.disc(centre, centre, radius - rim, tones.body);
  pix.disc(centre, centre, radius - soft, tones.body, 0.5);
  for (let index = 0; index < IRIS_FIBRES; index += 1) {
    const angle = (index * Math.PI * 2) / IRIS_FIBRES + IRIS_FIBRE_SKEW;
    const tone = index % 2 ? tones.inner : tones.edge;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Half a fine pixel a step, which is what keeps a ray at any angle landing
    // on touching pixels rather than on a dotted line.
    for (let along = radius * IRIS_CORE; along < radius - rim; along += 0.5) {
      pix.set(centre + cos * along, centre + sin * along, tone);
    }
  }
  pix.disc(centre, centre, radius * IRIS_HALO, tones.inner, IRIS_HALO_COVERAGE);
  pix.disc(centre, centre, radius * IRIS_CORE, tones.edge, 0.5);
  return pix;
}

/** The iris as a canvas, ready to blit. Keyed on the tint and the radius — see `hdIrisPix`. */
export function hdIris(tint: string, tones: IrisTones, radius: number): HTMLCanvasElement {
  return EYES.get(`iris:${tint}:${radius}`, () => hdIrisPix(tones, radius).toCanvas());
}

/** The pupil's three tones: the hole, the wet catch of light, and its answering spark. */
export interface PupilTones {
  pupil: string;
  glint: string;
}

/**
 * THE OBSERVER's pupil, `radius` fine pixels of it, with or without its glint.
 *
 * Classic's glint is a 2 x 2 block at the pupil's upper left, which is a glint
 * drawn by something with no discs. Part B's is a round one with a second,
 * smaller catch off to the other side — the two highlights a wet sphere
 * actually shows — and its own `max(1.5, 0.18 * PR)` is the floor rule again:
 * the smallest pupil in the game is twelve fine pixels across and still gets a
 * glint rather than losing one to rounding.
 *
 * **`glinted` is the shipped reading, kept.** A glint is a reflection off a wet
 * surface and a lid halfway down has covered the part of it that would catch
 * the light, so it goes at `open > 0.5` and not otherwise. Part B has no such
 * rule because its glint is baked into the pupil; here it is one boolean on a
 * key that was already small.
 *
 * The spark is `mix` of the glint and the iris's highlight rather than Part B's
 * literal `#dbe4ff`, which is the pass's third rule (SHA-223) and also the
 * better picture: on a red eye the second catch picks up the red.
 */
export function hdPupilPix(tones: PupilTones, inner: string, radius: number, glinted: boolean): Pix {
  const pix = new Pix(2 * radius + 2, 2 * radius + 2);
  const centre = radius + 1;
  pix.disc(centre, centre, radius, tones.pupil);
  if (!glinted) {
    return pix;
  }
  const glint = Math.max(GLINT_FLOOR, radius * 0.18);
  pix.disc(centre - radius * 0.42, centre - radius * 0.44, glint, tones.glint);
  pix.disc(centre + radius * 0.1, centre - radius * 0.06, Math.max(1, glint * 0.45), mix(tones.glint, inner, 0.25));
  return pix;
}

/** The pupil as a canvas, ready to blit. Keyed on the tint, the radius and the glint. */
export function hdPupil(
  tint: string,
  tones: PupilTones,
  inner: string,
  radius: number,
  glinted: boolean,
): HTMLCanvasElement {
  return EYES.get(`pupil:${tint}:${radius}:${glinted}`, () => hdPupilPix(tones, inner, radius, glinted).toCanvas());
}
