import { BRICK_COLORS, canvasPalette } from "@render/palette";

/**
 * THE BROOD's three shapes (SHA-170), as character grids.
 *
 * ASCII rather than a list of rects, because these are drawings and the point
 * of the mockup handing them over in this form is that they can be *edited* —
 * a leg moved or an eye lowered is a character, not a coordinate. One row per
 * pixel row, one character per pixel, `.` for nothing.
 *
 * The bitmaps are the mockup's, refined in one place: the hatchling's legs were
 * drawn in its outline tone, which is the green brick's `dark`, and that tone is
 * a DEMAKE ground — so on the tube the legs vanished and the one tell the ticket
 * asks the hatchling to keep was the one it lost. They are in the body tone now.
 */
export const BROOD_BITMAPS = {
  egg: [
    ".....aaaaaa.....",
    "...aabbbbbbaa...",
    "..abbbccbbbbba..",
    ".abbbcwwcbbbbba.",
    ".abbbcwwcbkbbba.",
    "abbbbccbbkbbbbba",
    "abbbbbbbkbbbbbba",
    "abbbbbbkbbbbbbba",
    ".abbbbbkbbbbbba.",
    ".abbbbbbbbbbbba.",
    "..aabbbbbbbbaa..",
    "....aaaaaaaa....",
  ],
  hatchA: [
    "....g..........g....",
    ".....g........g.....",
    "....gGGGGGGGGGGg....",
    "...gGGllGGGGllGGg...",
    "..gGGleeGGGGeelGGg..",
    "..gGGlepGGGGpelGGg..",
    ".gGGGGGGGGGGGGGGGGg.",
    ".gGGGGGrrrrrrGGGGGg.",
    ".gGGGGGGGGGGGGGGGGg.",
    "..gGGGGGGGGGGGGGGg..",
    "...ggGGgggggGGgg....",
    "..G..G..G..G..G..G..",
    ".G...G..G..G..G...G.",
    "....................",
  ],
  hatchB: [
    "....g..........g....",
    ".....g........g.....",
    "....gGGGGGGGGGGg....",
    "...gGGllGGGGllGGg...",
    "..gGGleeGGGGeelGGg..",
    "..gGGlepGGGGpelGGg..",
    ".gGGGGGGGGGGGGGGGGg.",
    ".gGGGGGrrrrrrGGGGGg.",
    ".gGGGGGGGGGGGGGGGGg.",
    "..gGGGGGGGGGGGGGGg..",
    "...ggGGgggggGGgg....",
    ".G...G..G..G..G...G.",
    "..G..G..G..G..G..G..",
    "....................",
  ],
  wingA: [
    "k..........................k",
    "kk........................kk",
    "kRk......................kRk",
    "kRRk........kkkk........kRRk",
    ".kRRk......kRRRRk......kRRk.",
    ".kRRRk....kRRRRRRk....kRRRk.",
    "..kRRRk..kRRoyyoRRk..kRRRk..",
    "..kRRRRkkRRRoeeoRRRkkRRRRk..",
    "...kRRRRRRRRopepoRRRRRRRk...",
    "....kRRRRRRRRooooRRRRRRk....",
    "......kkRRRRRRRRRRRRkk......",
    "........kkRRRRRRRRkk........",
    "..........kkRkkRkk..........",
    "...........k....k...........",
  ],
  wingB: [
    "............................",
    "............................",
    "............kkkk............",
    "...........kRRRRk...........",
    "..........kRRRRRRk..........",
    "kk.......kRRoyyoRRk.......kk",
    "kRRkk...kRRRoeeoRRRk...kkRRk",
    ".kRRRRkkRRRRopepoRRRRkkRRRRk",
    "..kRRRRRRRRRRooooRRRRRRRRRk.",
    "...kkRRRRRRRRRRRRRRRRRRkk...",
    ".....kkkRRRRRRRRRRRRkkk.....",
    "........kkRRRRRRRRkk........",
    "..........kkRkkRkk..........",
    "...........k....k...........",
  ],
  // THE TEAR's drop (SHA-174). In the family because it is one: a tear is what
  // the eye lays its eggs as, and the thing it turns into on landing is the
  // first frame above.
  tear: ["..w..", ".wbw.", ".bbb.", "wbbbd", "bbbbd", "wbbbd", ".bbd.", "..d.."],
} as const satisfies Record<string, readonly string[]>;

export type BroodSprite = keyof typeof BROOD_BITMAPS;

/** Which frames each form cycles through, in order. */
export const BROOD_FRAMES: ReadonlyArray<readonly BroodSprite[]> = [["egg"], ["hatchA", "hatchB"], ["wingA", "wingB"]];

type Palette = Readonly<Record<string, string>>;

/**
 * A character to a colour, per form — and a second set for the tube.
 *
 * **Each sprite reduces itself rather than going through `ink()`**, for
 * `drawEye`'s reason and one of its own. The default rule sends a tone that
 * plays a *shadow* role to the tube's ground and everything else to ink, which
 * keeps a 1px bevel legible; these are not bevelled sprites, they are filled
 * bodies with an outline, and under that rule the hatchling loses its legs and
 * its eyes while the egg becomes a solid green blob.
 *
 * So each one is inverted for the tube instead: **body to ground, outline and
 * detail to ink**. That is how a 1-bit port would have drawn a creature on a
 * dark field, and it is what keeps the three tells the ticket asks for — the
 * egg's oval, the hatchling's legs, the wyvern's span.
 *
 * None of the three is yellow: the house keeps that colour for what pays.
 */
const EGG: Palette = {
  a: "#12276a",
  b: canvasPalette.eyeIrisEdge,
  c: canvasPalette.eyeIrisInner,
  w: canvasPalette.paddleTopSheen,
  k: canvasPalette.dropShade,
};

const HATCHLING: Palette = {
  g: BRICK_COLORS["4"].dark,
  G: BRICK_COLORS["4"].flat,
  l: BRICK_COLORS["4"].light,
  e: canvasPalette.deathFlash,
  p: canvasPalette.dropShade,
  r: BRICK_COLORS["1"].flat,
};

const WYVERN: Palette = {
  k: BRICK_COLORS["1"].dark,
  R: BRICK_COLORS["1"].flat,
  o: BRICK_COLORS["2"].flat,
  y: canvasPalette.chainSheen,
  e: canvasPalette.deathFlash,
  p: canvasPalette.dropShade,
};

const TEAR: Palette = {
  b: canvasPalette.eyeIrisInner,
  w: canvasPalette.paddleTopSheen,
  d: canvasPalette.eyeIrisEdge,
};

const ink = canvasPalette.demakeInk;
const ground = canvasPalette.demakeGround;

const EGG_DEMADE: Palette = { a: ink, b: ground, c: ink, w: ink, k: ink };
const HATCHLING_DEMADE: Palette = { g: ink, G: ground, l: ink, e: ink, p: ground, r: ink };
const WYVERN_DEMADE: Palette = { k: ink, R: ground, o: ink, y: ink, e: ink, p: ground };
// A drop the other way up from the rest: five pixels across is too little to
// outline, so the tube keeps the *body* and drops the highlight — a solid ink
// tear rather than a ring nobody could see the inside of.
const TEAR_DEMADE: Palette = { b: ink, w: ground, d: ink };

const PALETTES: Record<BroodSprite, readonly [Palette, Palette]> = {
  egg: [EGG, EGG_DEMADE],
  hatchA: [HATCHLING, HATCHLING_DEMADE],
  hatchB: [HATCHLING, HATCHLING_DEMADE],
  wingA: [WYVERN, WYVERN_DEMADE],
  wingB: [WYVERN, WYVERN_DEMADE],
  tear: [TEAR, TEAR_DEMADE],
};

export function broodPalette(sprite: BroodSprite, demade: boolean): Palette {
  return PALETTES[sprite][demade ? 1 : 0];
}

/**
 * The character each sprite draws its outline with.
 *
 * Named because the strike flash cools through it: a struck beast is a white
 * silhouette for the first half of the flash and then keeps only its outline
 * white for the second, so the hit fades out through the shape rather than
 * switching off. A hard cut back to the body tones would be the one thing the
 * house does not allow an effect to do at either end.
 */
export const BROOD_OUTLINE: Record<BroodSprite, string> = {
  egg: "a",
  hatchA: "g",
  hatchB: "g",
  wingA: "k",
  wingB: "k",
  // A tear is never struck twice, so it never cools through anything; this is
  // here to keep the record total.
  tear: "d",
};
