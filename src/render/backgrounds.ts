import { gameConfig } from "@core/config/GameConfig";
import { FINE } from "@interfaces/art";
import { bleedRadius, fibreAngle, fibreRadius, fibreSteps, INSIDE_IRIS } from "@render/hdInside";
import { canvasPalette } from "@render/palette";
import { mix, Pix } from "@render/pix";

import type { BackgroundId } from "@interfaces/types";

// Per-level playfield backgrounds. Each theme is painted once into an offscreen
// 1× layer (game pixels, no SCALE) and blitted by CanvasRenderer every frame, so
// a theme can carry as much detail as it likes without costing anything in the
// render loop: the blit replaces the flat field fill the renderer used to do.
//
// Readability is the hard constraint (SHA-20), enforced by two color classes and
// checked by `pnpm run check:backgrounds`:
//   - `area` tones cover large regions (fills, bands, lines, planet bodies) and
//     must stay as dark as the classic field, so bricks/ball/paddle/capsules keep
//     their contrast.
//   - `speck` tones only ever land on 1–3px details (stars, nodes, pads) where a
//     brighter tone reads as sparkle instead of competing with the sprites.
// Nothing here animates: a static layer can never be mistaken for a game object.

interface BackgroundColorSet {
  // Every theme carries the zodiac dial's three tones (SHA-212): the dial is
  // on every level, and it is drawn in the level's own ink so that a sunrise's
  // dial is a sunrise's and a circuit board's is a circuit board's. The two
  // circles are `area` — a 1px circle 172px across is a line — and the ticks
  // are `speck`, five pixels of dot each.
  readonly area: { readonly base: string; readonly dialRing: string; readonly dialBand: string } & Readonly<
    Record<string, string>
  >;
  readonly speck: { readonly dialTick: string } & Readonly<Record<string, string>>;
}

/** The zodiac dial's tones on one theme: the outer circle, the dashed inner one, the ticks. */
export interface DialTones {
  readonly ring: string;
  readonly band: string;
  readonly tick: string;
}

export function dialTonesFor(id: BackgroundId): DialTones {
  const { area, speck } = BACKGROUND_COLORS[id];
  return { ring: area.dialRing, band: area.dialBand, tick: speck.dialTick };
}

export const BACKGROUND_COLORS = {
  // `starBright` was #7f92c8 until SHA-216, when silver was retoned to the
  // handoff's #8f9ac8 and `check:backgrounds` correctly refused the pair: 17
  // apart is a star that reads as a chip of silver brick. It is now #6c7cb4,
  // the brightest of the handoff's own night blues and the tone its starfield
  // is drawn in — darker, further from every sprite, and not a colour invented
  // to get past the guard. `starfield` and `observer` share it.
  starfield: {
    area: { base: "#0b0b26", dialRing: "#151a38", dialBand: "#1b2244" },
    speck: { starDim: "#232a52", starMid: "#3a4a86", starBright: "#6c7cb4", dialTick: "#2b3a72" },
  },
  nebula: {
    area: {
      base: "#120b1e",
      hazeEdge: "#160d24",
      hazeOuter: "#1a1029",
      hazeInner: "#221436",
      dialRing: "#1e1430",
      dialBand: "#281b40",
    },
    speck: { dust: "#402d5e", glint: "#6d54a0", dialTick: "#402d5e" },
  },
  grid: {
    area: { base: "#071119", column: "#0f2130", row: "#0c1a26", dialRing: "#0f2130", dialBand: "#10283a" },
    speck: { node: "#1a3a4e", dialTick: "#1a3a4e" },
  },
  horizon: {
    area: {
      base: "#061019",
      sky1: "#08161f",
      sky2: "#0b1b26",
      sky3: "#0e202c",
      glow: "#112733",
      ground: "#040c12",
      dune: "#020809",
      dialRing: "#0f2436",
      dialBand: "#11283a",
    },
    speck: { star: "#2a4a5c", dialTick: "#2a4a5c" },
  },
  planet: {
    area: {
      base: "#0a0a1c",
      body: "#10152a",
      limb: "#182140",
      band: "#0c1122",
      dialRing: "#141a33",
      dialBand: "#1b2346",
    },
    speck: { star: "#2e3a63", glint: "#6a78ad", dialTick: "#2e3a63" },
  },
  circuit: {
    area: { base: "#05130d", trace: "#0d281b", traceDim: "#0a1e15", dialRing: "#0d281b", dialBand: "#0e2b1d" },
    speck: { pad: "#17482e", dialTick: "#17482e" },
  },
  cathode: {
    area: {
      base: "#14100a",
      bloom1: "#181309",
      bloom2: "#1c160c",
      bloom3: "#201a0f",
      bloom4: "#241d12",
      scan: "#0d0a06",
      dialRing: "#201a0f",
      dialBand: "#2a2215",
    },
    speck: { fleck: "#3d2f1c", dialTick: "#3d2f1c" },
  },
  vault: {
    area: {
      base: "#0e0e13",
      mortar: "#17171f",
      stoneDark: "#0a0a0f",
      stoneLight: "#131319",
      dialRing: "#17171f",
      dialBand: "#1d1d28",
    },
    speck: { chip: "#22222c", dialTick: "#2a2a36" },
  },
  // THE OBSERVER's field: the classic starfield, with the dial's tones the
  // starfield's — the veils are where the dial came from (SHA-211).
  observer: {
    area: { base: "#0b0b26", dialRing: "#151a38", dialBand: "#1b2244" },
    speck: { starDim: "#232a52", starMid: "#3a4a86", starBright: "#6c7cb4", dialTick: "#2b3a72" },
  },
} as const satisfies Record<BackgroundId, BackgroundColorSet>;

/**
 * Where the iris is painted *around*, in field pixels — the pupil's orbit
 * centre. No level theme takes a point any more: the zodiac dial that used to
 * be baked around a veil's socket is drawn by the frame on every level now
 * (`drawZodiac`, SHA-212), so a theme is a function of its seed alone.
 */
export interface BackgroundFocus {
  readonly x: number;
  readonly y: number;
}

/**
 * INSIDE THE EYE (SHA-172): the field, when the field is the iris.
 *
 * Eight bands out from the pupil's orbit centre, fibres spoking across them, a
 * bronze lash bar along the top and the socket's own dark ring at the edge — a
 * whole eye seen from the inside, at the size of the playfield. Painted rather
 * than tinted from a photo of the small one for the reason every sprite in this
 * codebase is drawn twice at two sizes: the 42px eye's iris is nine rows and
 * this is two hundred, and nothing that reads at one reads at the other.
 *
 * **It has its own demade drawing rather than a threshold.** The colour iris is
 * a bright field, so the tube's luma rule would turn nearly all of it to ink —
 * a solid green screen with a hole in it, which loses every band. Inverted
 * instead, the way the brood is: ground everywhere, and the band edges, the
 * fibres and the lash in ink. Same eye, one colour.
 */
const IRIS_BANDS = [104, 98, 88, 76, 66, 56, 46, 38];

/**
 * The two interiors, by tint — and they are **dark**, which is the one place
 * this ticket overruled its own spec.
 *
 * The counter-spec and the mockup both paint the inside of the eye on a white
 * sclera, and at this game's palette that is unplayable: `ballBody` is #ffe14a,
 * which comes out at **1.03:1** against #dbe4ff. The single most important
 * sprite in the game would be invisible for the twenty-two seconds the player
 * most needs to see it, and `check:backgrounds` exists to stop exactly that.
 *
 * So the interior is lit the way an eye is actually lit from the inside: the
 * sclera is not white here, it is backlit tissue, and the iris bands are the
 * tint at the depth every other theme in this file is painted at. Same drawing,
 * same eight rings, same fibres — a fifth of the brightness. These tones are
 * checked by the same guard the themes are; see `check-backgrounds.mjs`.
 */
export const IRIS_COLORS = {
  blue: {
    area: {
      base: "#101528",
      vein: "#1b2244",
      band0: "#0a1130",
      band1: "#142255",
      band2: "#0d1538",
      band3: "#142255",
      band4: "#0d1538",
      band5: "#16234e",
      band6: "#101a40",
      band7: "#142255",
      fibreDim: "#0d1538",
      fibreLit: "#16234e",
      limbal: "#070a1c",
      brow: "#1a1408",
      browRim: "#2e2410",
      lash: "#2d240f",
    },
    speck: {},
  },
  red: {
    area: {
      base: "#1a1018",
      vein: "#33101a",
      band0: "#2a0009",
      band1: "#490e1b",
      band2: "#24060e",
      band3: "#490e1b",
      band4: "#24060e",
      band5: "#49121d",
      band6: "#330a14",
      band7: "#490e1b",
      fibreDim: "#24060e",
      fibreLit: "#441019",
      limbal: "#070a1c",
      brow: "#1a1408",
      browRim: "#2e2410",
      lash: "#2d240f",
    },
    speck: {},
  },
} as const;

export type IrisTint = keyof typeof IRIS_COLORS;

export function paintIris(brush: BackgroundBrush, tint: IrisTint, focus: BackgroundFocus, demade: boolean): void {
  const ink = canvasPalette.demakeInk;
  const ground = canvasPalette.demakeGround;
  const { area } = IRIS_COLORS[tint];
  const bands = [area.band0, area.band1, area.band2, area.band3, area.band4, area.band5, area.band6, area.band7];
  // The centre on the fine grid, rounded then multiplied exactly as the brush's
  // own verbs do it, so the fine work below is concentric with the coarse work
  // beside it rather than a third of a game pixel off.
  const fx = Math.round(focus.x) * FINE;
  const fy = Math.round(focus.y) * FINE;
  brush.rect(0, 0, brush.width, brush.height, demade ? ground : area.base);
  if (!demade) {
    // The white of an eye is not flat, and neither is the back of one: veins,
    // short and horizontal, so the sclera reads as tissue rather than as paper.
    for (let index = 0; index < INSIDE_IRIS.veins; index += 1) {
      brush.rect(brush.randomInt(0, brush.width), brush.randomInt(20, 240), brush.randomInt(4, 14), 1, area.vein);
    }
    if (brush.hd) {
      // Part B's sixty: the shipped forty, unmoved, and twenty finer ones over
      // them. A vein is three fine pixels thick because it was drawn a game
      // pixel thick; these are one, and half way to the base, which is a
      // thickness and a tone the coarse grid has no way of asking for. Tissue
      // is not made of one gauge of thread.
      //
      // **They come after every draw above, and nothing below draws.** The
      // generator rule this brush is written to says the two arts must call
      // `random` the same number of times in the same order — so the extra
      // twenty are appended rather than interleaved, which leaves the first
      // forty on exactly the pixels they occupy in classic.
      const faint = mix(area.vein, area.base, 0.5);
      for (let index = 0; index < INSIDE_IRIS.streaks; index += 1) {
        brush.fineRect(
          brush.randomInt(0, brush.fineWidth),
          brush.randomInt(20 * FINE, 240 * FINE),
          brush.randomInt(4 * FINE, 14 * FINE),
          1,
          faint,
        );
      }
    }
  }
  for (const [index, radius] of IRIS_BANDS.entries()) {
    if (demade) {
      // On the tube the bands are contour lines and nothing else, so on the
      // fine grid they are hairlines: one fine pixel, closed by Bresenham
      // rather than walked by angle, where the coarse ring lays a three-pixel
      // pen round the same circle.
      if (brush.hd) {
        brush.fineRing(fx, fy, radius * FINE, index % 2 === 0 ? ink : ground);
      } else {
        ring(brush, focus.x, focus.y, radius, index % 2 === 0 ? ink : ground);
      }
      continue;
    }
    // Part B's collar, under the band's own disc so only its outside shows.
    // Not on the outermost band: what is outside *that* one is the white of the
    // eye and the limbal ring, and the limbus is the one edge in this drawing
    // that has to stay hard — it is what makes the iris read as a thing set
    // into the sclera rather than as a stain spreading through it.
    if (brush.hd && index > 0) {
      brush.fineDisc(fx, fy, bleedRadius(radius), bands[index], INSIDE_IRIS.bleedCoverage);
    }
    brush.disc(focus.x, focus.y, radius, bands[index]);
  }
  // Fibres from the pupil outward, every fourteenth of a turn: one fine pixel
  // of mark, sampled once per fine pixel of span. Both halves, or neither —
  // a game-pixel mark on the fine grid is a spoke three fine pixels wide, and
  // a fine mark on the coarse walk is a dotted line. See `fibreSteps`.
  const steps = fibreSteps(brush.hd);
  for (let index = 0; index < INSIDE_IRIS.fibres; index += 1) {
    const angle = fibreAngle(index);
    const tone = demade ? (index % 2 === 0 ? ink : ground) : index % 2 === 0 ? area.fibreDim : area.fibreLit;
    for (let step = 0; step < steps; step += 1) {
      const radius = fibreRadius(step, brush.hd);
      if (brush.hd) {
        brush.finePixel(
          Math.round(fx + Math.cos(angle) * radius * FINE),
          Math.round(fy + Math.sin(angle) * radius * FINE),
          tone,
        );
        continue;
      }
      brush.rect(focus.x + Math.cos(angle) * radius, focus.y + Math.sin(angle) * radius, 1, 1, tone);
    }
  }
  // The limbus, four game pixels of rim. Twelve nested hairlines on the fine
  // grid rather than four three-pixel ones: the same band, but its inner and
  // outer edges land where the arithmetic puts them instead of on the nearest
  // multiple of three.
  if (brush.hd) {
    for (let radius = INSIDE_IRIS.limbusFrom * FINE; radius < INSIDE_IRIS.limbusTo * FINE; radius += 1) {
      brush.fineRing(fx, fy, radius, demade ? ink : area.limbal);
    }
  } else {
    for (let radius = INSIDE_IRIS.limbusFrom; radius < INSIDE_IRIS.limbusTo; radius += 1) {
      ring(brush, focus.x, focus.y, radius, demade ? ink : area.limbal);
    }
  }
  // The brow, across the top: the lid the player is looking out from under.
  brush.rect(0, 0, brush.width, 18, demade ? ground : area.brow);
  brush.rect(0, 18, brush.width, 2, demade ? ink : area.browRim);
  brush.rect(0, 20, brush.width, 1, demade ? ink : area.lash);
  for (let x = 6; x < brush.width; x += 22) {
    brush.rect(x, 21, 2, 6, demade ? ink : area.browRim);
  }
}

/** The variant string an iris is seeded from — the shipped one, so no vein moves. */
function irisSeedKey(tint: IrisTint, demade: boolean): string {
  return `${tint}:${demade ? "mono" : "lit"}`;
}

/**
 * One iris onto `ctx`, in whichever art is asked for.
 *
 * The art is **not** in the seed, only in the cache key — exactly as
 * `paintBackground` has it. The two arts have to be the same layout drawn at
 * two resolutions or `art split` is comparing two pictures instead of two
 * drawings of one.
 */
export function paintIrisField(
  ctx: CanvasRenderingContext2D,
  tint: IrisTint,
  demade: boolean,
  width: number,
  height: number,
  hd = false,
): void {
  const { centerX, centerY } = gameConfig.observer.inside;
  paintWith(ctx, width, height, hashSeed(irisSeedKey(tint, demade)), hd, (brush) => {
    paintIris(brush, tint, { x: centerX, y: centerY }, demade);
  });
}

/** A surface the layer repaints in place, rather than a canvas it keeps forever. */
interface IrisSurface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  painted: IrisTint | null;
}

function irisSurface(width: number, height: number): IrisSurface {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D iris context unavailable");
  }
  return { canvas, ctx, painted: null };
}

/**
 * The iris the field is replaced with, one surface per machine and art.
 *
 * Beside `BackgroundLayer` and not inside it: that one holds *the level on
 * screen* and repaints when the level changes, and the iris is neither a level
 * nor a theme — it is one of two pictures that the field is replaced with for
 * twenty-two seconds. Nothing is painted, and no canvas allocated, until a
 * player goes through the door.
 *
 * **Four surfaces at most, and the tint is what repaints them** (SHA-235). It
 * used to hold a `Map` keyed on the tint as well and never drop anything, which
 * cost four small canvases and was not worth a second thought. On the fine grid
 * one of these is 1116 x 900 — four megabytes — and keying the art in beside
 * the tint would have sat on sixteen of them for a whole run. That is the same
 * arithmetic that talked this pass out of baking the eye, and it applies here.
 *
 * So the tint is the axis that repaints and the other two are the axes that
 * get a surface each, because those two are the ones that can both be wanted in
 * a single frame: DEMAKE's crossfade paints both machines, and `art split`
 * paints both arts. A tint change is a player entering a differently-coloured
 * veil, which is a level boundary, and it costs one bake at a moment that is
 * already a load. Each surface is built at its own art's size, which is what
 * `BackgroundLayer` spends a `size()` on — there is nothing to resize when a
 * canvas only ever holds the one resolution.
 */
export class IrisLayer {
  private readonly surfaces = new Map<string, IrisSurface>();

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  imageFor(tint: IrisTint, demade: boolean, hd = false): HTMLCanvasElement {
    const slot = `${demade ? "mono" : "lit"}:${hd ? "hd" : "classic"}`;
    let surface = this.surfaces.get(slot);
    if (!surface) {
      const scale = hd ? FINE : 1;
      surface = irisSurface(this.width * scale, this.height * scale);
      this.surfaces.set(slot, surface);
    }
    if (surface.painted !== tint) {
      paintIrisField(surface.ctx, tint, demade, this.width, this.height, hd);
      surface.painted = tint;
    }
    return surface.canvas;
  }
}

export interface BackgroundBrush {
  readonly width: number;
  readonly height: number;
  rect(x: number, y: number, width: number, height: number, color: string): void;
  disc(x: number, y: number, radius: number, color: string): void;
  // Rows [top, top + height) of a disc, for bands that must stay inside a body.
  discBand(x: number, y: number, radius: number, top: number, height: number, color: string): void;
  random(): number;
  // Lower bound included, upper bound excluded.
  randomInt(min: number, max: number): number;

  /**
   * THE HD PASS (SHA-221): whether this brush paints on the fine grid.
   *
   * **The rule the themes are written to is that the *generator* calls never
   * change.** A painter may draw its own elements differently at the two
   * resolutions — a lattice line is one fine pixel in HD and one game pixel in
   * classic — but `random()` and `randomInt()` must be called the same number
   * of times, in the same order, with the same arguments. That is what keeps
   * every star, dune and stone in the same place on both paths, which is what
   * makes `art split` a comparison of *drawing* rather than of two layouts, and
   * what keeps `check:backgrounds` meaningful.
   *
   * The verbs above take game pixels on both paths and are three times finer in
   * their *rendering* when this is set — a disc is a disc of `radius * 3`, so
   * it is round rather than a 3x nearest-neighbour blow-up of a small one.
   * The verbs below take fine pixels and are only defined when this is set.
   */
  readonly hd: boolean;
  readonly fineWidth: number;
  readonly fineHeight: number;
  finePixel(x: number, y: number, color: string): void;
  fineRect(x: number, y: number, width: number, height: number, color: string): void;
  fineDither(x: number, y: number, width: number, height: number, color: string, coverage: number): void;
  fineVgrad(x: number, width: number, stops: readonly (readonly [number, string])[]): void;
  fineRgrad(x: number, y: number, radius: number, tones: readonly (string | null)[]): void;
  fineDisc(x: number, y: number, radius: number, color: string, coverage?: number): void;
  /** A circle one fine pixel thick, closed by construction — Bresenham's, not a walk by angle. */
  fineRing(x: number, y: number, radius: number, color: string): void;
  fineDiscBand(x: number, y: number, radius: number, top: number, height: number, color: string): void;
}

// mulberry32: the layouts must be identical on every visit to a level, so the
// scatter comes from a seeded generator instead of Math.random.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over "<theme>:<variant>": levels sharing a theme get their own layout.
function hashSeed(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

// What a brush that cannot draw on the fine grid answers when asked to. The
// painters guard every one of these with `brush.hd`; this is what makes the
// omission loud rather than silent if one ever forgets.
function noFineGrid(): never {
  throw new Error("this background brush paints in game pixels — guard fine-grid work with `brush.hd`");
}

function createBrush(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number): BackgroundBrush {
  const random = createRandom(seed);

  const discBand = (x: number, y: number, radius: number, top: number, bandHeight: number, color: string): void => {
    ctx.fillStyle = color;
    const from = Math.max(Math.ceil(y - radius), top);
    const to = Math.min(Math.floor(y + radius), top + bandHeight - 1);
    for (let row = from; row <= to; row += 1) {
      const offset = row + 0.5 - y;
      const half = Math.round(Math.sqrt(Math.max(0, radius * radius - offset * offset)));
      if (half > 0) {
        ctx.fillRect(Math.round(x) - half, row, half * 2, 1);
      }
    }
  };

  return {
    width,
    height,
    rect(x, y, rectWidth, rectHeight, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(rectWidth), Math.round(rectHeight));
    },
    disc(x, y, radius, color) {
      discBand(x, y, radius, Math.ceil(y - radius), Math.ceil(radius * 2) + 1, color);
    },
    discBand,
    random,
    randomInt(min, max) {
      return min + Math.floor(random() * (max - min));
    },
    hd: false,
    fineWidth: width,
    fineHeight: height,
    finePixel: noFineGrid,
    fineRect: noFineGrid,
    fineDither: noFineGrid,
    fineVgrad: noFineGrid,
    fineRgrad: noFineGrid,
    fineDisc: noFineGrid,
    fineRing: noFineGrid,
    fineDiscBand: noFineGrid,
  };
}

/**
 * The same brush on the fine grid, backed by a software raster.
 *
 * **A `Pix` and not the context.** A dithered sky asks a question of every one
 * of a million pixels, and a `fillRect` apiece against a context that
 * re-validates state on each one is not a thing that finishes. The whole field
 * reaches the canvas as one `putImageData` instead — and `Pix` already carries
 * `rect`, `disc`, `discBand`, `dither`, `vgrad` and `rgrad`, which is the
 * "one toolkit, two resolutions" the spec asks for rather than a second
 * toolkit that drifts.
 *
 * Game-pixel coordinates are **rounded and then multiplied**, exactly as
 * classic's `pixel()` does, so every element lands where its classic twin does
 * rather than half a game pixel off. Radii are multiplied unrounded: the row
 * arithmetic is what turns a scaled radius into a round disc instead of a
 * blown-up small one, and that is most of what this ticket buys.
 */
function createFineBrush(pix: Pix, width: number, height: number, seed: number): BackgroundBrush {
  const random = createRandom(seed);
  const at = (value: number): number => Math.round(value) * FINE;

  return {
    width,
    height,
    rect(x, y, rectWidth, rectHeight, color) {
      pix.rect(at(x), at(y), at(rectWidth), at(rectHeight), color);
    },
    disc(x, y, radius, color) {
      pix.disc(at(x), at(y), radius * FINE, color);
    },
    discBand(x, y, radius, top, bandHeight, color) {
      pix.discBand(at(x), at(y), radius * FINE, at(top), at(bandHeight), color);
    },
    random,
    randomInt(min, max) {
      return min + Math.floor(random() * (max - min));
    },
    hd: true,
    fineWidth: pix.width,
    fineHeight: pix.height,
    finePixel(x, y, color) {
      pix.set(x, y, color);
    },
    fineRect(x, y, rectWidth, rectHeight, color) {
      pix.rect(x, y, rectWidth, rectHeight, color);
    },
    fineDither(x, y, rectWidth, rectHeight, color, coverage) {
      pix.dither(x, y, rectWidth, rectHeight, color, coverage);
    },
    fineVgrad(x, gradWidth, stops) {
      pix.vgrad(x, gradWidth, stops);
    },
    fineRgrad(x, y, radius, tones) {
      pix.rgrad(x, y, radius, tones);
    },
    fineDisc(x, y, radius, color, coverage) {
      pix.disc(x, y, radius, color, coverage);
    },
    fineRing(x, y, radius, color) {
      pix.ring(x, y, radius, color);
    },
    fineDiscBand(x, y, radius, top, bandHeight, color) {
      pix.discBand(x, y, radius, top, bandHeight, color);
    },
  };
}

/**
 * One theme onto `ctx`, in whichever art is asked for.
 *
 * The HD path paints into a raster and lands in one `putImageData`, which
 * replaces rather than composites — an opaque field writes its base over
 * whatever was there, and a foreground's holes come back as holes.
 */
function paintWith(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  hd: boolean,
  paint: (brush: BackgroundBrush) => void,
  // Whether the layer goes *over* what is already on the target rather than
  // replacing it (SHA-224).
  //
  // `Pix.blitTo` is `putImageData`, which replaces alpha and all — which is
  // exactly right for a field, since an opaque base clearing whatever the last
  // theme left is how the layer is reused. It is exactly wrong for a sheet with
  // holes in it: the level gallery paints a still's background and its
  // foreground into *one* canvas, and a replacing blit of the horizon's dunes
  // punched the sky back out to transparent — a sunrise with no sunrise in it.
  // The arena never saw it because there the two layers have a canvas each.
  compose = false,
): void {
  if (!hd) {
    paint(createBrush(ctx, width, height, seed));
    return;
  }
  const pix = new Pix(width * FINE, height * FINE);
  paint(createFineBrush(pix, width, height, seed));
  pix.blitTo(ctx, compose);
}

/**
 * A star on the fine grid: a lit centre with four dim arms, where classic
 * paints a solid 3x3 block.
 *
 * **The halo is always darker than the star**, never brighter. `check:backgrounds`
 * caps what a `speck` tone may be, and it only sees the tones named in
 * `BACKGROUND_COLORS` — a derived tone that crept *up* from one would be
 * outside the one rule this module exists to keep. Dimming outward is also the
 * better picture: a point of light with a glow around it rather than a square.
 */
function fineStar(brush: BackgroundBrush, x: number, y: number, color: string, halo: string): void {
  const fx = Math.round(x) * FINE + 1;
  const fy = Math.round(y) * FINE + 1;
  brush.finePixel(fx, fy, color);
  brush.finePixel(fx - 1, fy, halo);
  brush.finePixel(fx + 1, fy, halo);
  brush.finePixel(fx, fy - 1, halo);
  brush.finePixel(fx, fy + 1, halo);
}

/** Single fine pixels: the depth behind a star field, too small for classic to hold. */
function fineDust(
  brush: BackgroundBrush,
  count: number,
  color: string,
  minY = FINE * 4,
  maxY = brush.fineHeight - FINE * 4,
): void {
  for (let index = 0; index < count; index += 1) {
    brush.finePixel(brush.randomInt(FINE * 4, brush.fineWidth - FINE * 4), brush.randomInt(minY, maxY), color);
  }
}

function scatter(
  brush: BackgroundBrush,
  count: number,
  color: string,
  minY = 4,
  maxY = brush.height - 4,
  halo?: string,
): void {
  for (let index = 0; index < count; index += 1) {
    const x = brush.randomInt(4, brush.width - 4);
    const y = brush.randomInt(minY, maxY);
    if (brush.hd && halo !== undefined) {
      fineStar(brush, x, y, color, halo);
      continue;
    }
    brush.rect(x, y, 1, 1, color);
  }
}

const STAR_COUNT = 58;

function paintStarfield(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.starfield;
  const tones = [speck.starDim, speck.starMid, speck.starBright];
  const halos = tones.map((tone) => mix(tone, area.base, 0.55));
  for (let index = 0; index < STAR_COUNT; index += 1) {
    scatter(brush, 1, tones[index % tones.length], undefined, undefined, halos[index % halos.length]);
  }
  // Three cross-shaped stars: the largest detail in the theme, still 3px wide.
  for (let index = 0; index < 3; index += 1) {
    const x = brush.randomInt(24, brush.width - 24);
    const y = brush.randomInt(24, brush.height - 24);
    if (brush.hd) {
      // The same cross, drawn as a diffraction spike: one fine pixel wide with
      // arms that fade out, instead of three game pixels of solid light.
      fineCross(brush, x, y, speck.starBright, mix(speck.starBright, area.base, 0.5));
      continue;
    }
    brush.rect(x - 1, y, 3, 1, speck.starBright);
    brush.rect(x, y - 1, 1, 3, speck.starBright);
  }
  if (brush.hd) {
    // The field behind the field. Drawn from the generator where it now stands,
    // so not one of the 58 above moves.
    fineDust(brush, 150, mix(speck.starDim, area.base, 0.35));
    fineDust(brush, 60, speck.starDim);
  }
}

/** A star with diffraction spikes: a lit core, four arms of four fine pixels. */
function fineCross(brush: BackgroundBrush, x: number, y: number, color: string, arm: string): void {
  const fx = Math.round(x) * FINE + 1;
  const fy = Math.round(y) * FINE + 1;
  brush.finePixel(fx, fy, color);
  for (const step of [1, 2, 3, 4]) {
    const tone = step <= 2 ? color : arm;
    brush.finePixel(fx - step, fy, tone);
    brush.finePixel(fx + step, fy, tone);
    brush.finePixel(fx, fy - step, tone);
    brush.finePixel(fx, fy + step, tone);
  }
}

// Overlapping discs of one tone: a lumpy cloud instead of a circle, without
// needing a gradient (which would band badly once blitted at 3×).
function cloud(brush: BackgroundBrush, x: number, y: number, radius: number, color: string, lobes: number): void {
  const spread = Math.round(radius * 0.45);
  for (let index = 0; index < lobes; index += 1) {
    brush.disc(
      x + brush.randomInt(-spread, spread + 1),
      y + brush.randomInt(-spread, spread + 1),
      Math.round(radius * (0.55 + brush.random() * 0.45)),
      color,
    );
  }
}

function paintNebula(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.nebula;
  const spots = [
    [0.26, 0.26],
    [0.72, 0.46],
    [0.44, 0.8],
  ] as const;
  const centres: Array<readonly [number, number]> = [];
  for (const [fractionX, fractionY] of spots) {
    const x = Math.round(fractionX * brush.width) + brush.randomInt(-16, 17);
    const y = Math.round(fractionY * brush.height) + brush.randomInt(-12, 13);
    centres.push([x, y]);
    // Three layers, each a lumpier ring of lobes than the one inside it, so the
    // haze fades out over ~30px instead of ending on a circle.
    cloud(brush, x, y, 58, area.hazeEdge, 7);
    cloud(brush, x, y, 40, area.hazeOuter, 6);
    cloud(brush, x, y, 20, area.hazeInner, 4);
  }
  if (brush.hd) {
    // Where the haze stops being haze. Classic ends each spot on the outermost
    // ring of lobes, which at 3x is a lumpy but hard edge; a dithered shell a
    // little wider than it lets the cloud run out into the field instead. The
    // centres are kept from the loop above rather than rolled again, so the
    // shells sit on the clouds they belong to.
    for (const [x, y] of centres) {
      brush.fineDisc(Math.round(x) * FINE, Math.round(y) * FINE, 74 * FINE, mix(area.hazeEdge, area.base, 0.45), 0.5);
      brush.fineDisc(Math.round(x) * FINE, Math.round(y) * FINE, 62 * FINE, area.hazeEdge, 0.45);
    }
  }
  scatter(brush, 30, speck.dust, undefined, undefined, mix(speck.dust, area.base, 0.5));
  scatter(brush, 7, speck.glint, undefined, undefined, mix(speck.glint, area.base, 0.5));
  if (brush.hd) {
    fineDust(brush, 220, mix(speck.dust, area.base, 0.4));
  }
}

function paintGrid(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.grid;
  // The lattice matches the brick pitch (30×12) and is offset per level, so it
  // reads as blueprint paper rather than as a ghost row of bricks.
  const columnStep = 30;
  const rowStep = 12;
  const columnOffset = brush.randomInt(0, columnStep);
  const rowOffset = brush.randomInt(0, rowStep);
  // A ruled line is one fine pixel in HD and one game pixel in classic. It is
  // the same lattice in the same place either way — what changes is that
  // blueprint paper is ruled with a pen and not with a brush three times its
  // width. Drawing calls only: the generator has already been asked for its two
  // offsets and is asked for nothing here, so the lattice cannot shift.
  const rule = brush.hd ? 1 : 0;
  for (let x = columnOffset; x < brush.width; x += columnStep) {
    if (rule) {
      brush.fineRect(Math.round(x) * FINE + 1, 0, 1, brush.fineHeight, area.column);
      continue;
    }
    brush.rect(x, 0, 1, brush.height, area.column);
  }
  for (let y = rowOffset; y < brush.height; y += rowStep) {
    if (rule) {
      brush.fineRect(0, Math.round(y) * FINE + 1, brush.fineWidth, 1, area.row);
      continue;
    }
    brush.rect(0, y, brush.width, 1, area.row);
  }
  const nodeGlow = mix(speck.node, area.base, 0.5);
  for (let x = columnOffset; x < brush.width; x += columnStep) {
    for (let y = rowOffset; y < brush.height; y += rowStep) {
      if (brush.random() < 0.14) {
        if (brush.hd) {
          // A drawn junction rather than a 2x2 blot: a lit cross on the
          // intersection with a dimmer ring of four around it.
          const fx = Math.round(x) * FINE + 1;
          const fy = Math.round(y) * FINE + 1;
          brush.fineRect(fx - 1, fy - 1, 3, 3, nodeGlow);
          brush.finePixel(fx, fy, speck.node);
          brush.finePixel(fx - 2, fy, speck.node);
          brush.finePixel(fx + 2, fy, speck.node);
          brush.finePixel(fx, fy - 2, speck.node);
          brush.finePixel(fx, fy + 2, speck.node);
          continue;
        }
        brush.rect(x - 1, y - 1, 2, 2, speck.node);
      }
    }
  }
}

// The horizon sits below the deepest brick row (y 134) and above the paddle
// lane, so neither the grid nor the paddle is ever read against a band edge.
// Fixed at 180 rather than rolled ±12 per variant (SHA-188): SUNRISE sits the
// Observer on this line, and the ground that hides its lower half has to be
// where the level data thinks it is.
function horizonLine(brush: BackgroundBrush): number {
  return Math.round(brush.height * 0.6);
}

function paintHorizon(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.horizon;
  const horizon = horizonLine(brush);
  const bands = [area.sky1, area.sky2, area.sky3, area.glow];
  const bandHeight = 10;
  scatter(brush, 18, speck.star, 6, horizon - bands.length * bandHeight - 10, mix(speck.star, area.base, 0.5));
  if (brush.hd) {
    // The four bands become one gradient. Classic has to step from the base to
    // the glow in four 10 px slabs, and the steps are the one thing a sunrise
    // must not have; ordered dither walks the same four tones over seventy
    // pixels without inventing a fifth. The stops are the bands' own edges, so
    // the sky is the same sky — it just stops having edges.
    const line = horizon * FINE;
    brush.fineVgrad(0, brush.fineWidth, [
      [Math.max(0, line - 210), area.base],
      [line - 120, area.sky1],
      [line - 90, area.sky2],
      [line - 60, area.sky3],
      [line - 30, area.glow],
      [line, area.glow],
    ]);
    // The dome: the sun is still under the horizon, and what says so is the
    // light standing above where it will come up. Dithered radially, so it
    // reads as a glow and not as a disc sitting on the ground.
    brush.fineRgrad(Math.round(brush.fineWidth * 0.56), line, 260, [null, area.sky3, area.glow]);
    brush.fineRect(0, line - 1, brush.fineWidth, 1, mix(area.glow, area.ground, 0.45));
  } else {
    bands.forEach((color, index) => {
      brush.rect(0, horizon - (bands.length - index) * bandHeight, brush.width, bandHeight, color);
    });
  }
  // The ground is painted here too, so the sky is a whole picture on its own;
  // what stands *in front of* the eye is the foreground's, below.
  brush.rect(0, horizon, brush.width, brush.height - horizon, area.ground);
  if (brush.hd) {
    fineDust(brush, 260, mix(area.ground, "#000000", 0.4), horizon * FINE + 2, brush.fineHeight);
  }
}

/**
 * The horizon's foreground (SHA-188): the ground and the dunes, painted over
 * the Observer rather than under it, so a sun on this level sets *behind* the
 * hills. The one theme with a foreground so far; a sun cut off by a straight
 * line while a dune passed behind it read as a rendering fault, which is what
 * this layer exists to prevent.
 */
function paintHorizonGround(brush: BackgroundBrush): void {
  const { area } = BACKGROUND_COLORS.horizon;
  const horizon = horizonLine(brush);
  brush.rect(0, horizon, brush.width, brush.height - horizon, area.ground);
  // Only the cap above the horizon line is painted, off a circle far too big to
  // read as one: a wide shallow hill, not a ball sitting on the ground.
  const dunes = [
    [0.3, 110],
    [0.7, 150],
  ] as const;
  for (const [fractionX, radius] of dunes) {
    const x = Math.round(fractionX * brush.width) + brush.randomInt(-30, 31);
    const rise = brush.randomInt(9, 26);
    if (brush.hd) {
      // A rim of shadow a pixel outside the hill, so one dune passing in front
      // of another reads as two hills rather than as one shape with a dent in
      // it. Drawn from the same three numbers — the generator is untouched.
      const cx = Math.round(x) * FINE;
      const cy = (horizon + radius - rise) * FINE;
      brush.fineDiscBand(
        cx,
        cy,
        radius * FINE + 1,
        (horizon - rise) * FINE - 1,
        rise * FINE + 1,
        mix(area.dune, "#000000", 0.45),
      );
      brush.fineDiscBand(cx, cy, radius * FINE, (horizon - rise) * FINE, rise * FINE, area.dune);
      continue;
    }
    brush.discBand(x, horizon + radius - rise, radius, horizon - rise, rise, area.dune);
  }
  if (brush.hd) {
    fineDust(brush, 300, mix(area.ground, "#000000", 0.45), horizon * FINE + 2, brush.fineHeight);
  }
}

function paintPlanet(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.planet;
  scatter(brush, 34, speck.star);
  scatter(brush, 5, speck.glint);
  // A gas giant hanging off one bottom corner: big, flat and cut by the field
  // edge, which is what makes it read as distance instead of as an obstacle.
  const radius = brush.randomInt(84, 113);
  const x = brush.random() < 0.5 ? brush.randomInt(-36, 24) : brush.randomInt(brush.width - 24, brush.width + 36);
  const y = brush.randomInt(216, 272);
  brush.disc(x, y, radius, area.limb);
  if (brush.hd) {
    // The step between the limb and the body is four game pixels of hard edge
    // in classic. A dithered disc half way between the two turns it into a
    // terminator — the same crescent, with the light running out across it
    // rather than stopping. Drawing only; the generator has already rolled.
    brush.fineDisc(
      Math.round(x + 2) * FINE,
      Math.round(y + 2) * FINE,
      radius * FINE,
      mix(area.limb, area.body, 0.5),
      0.5,
    );
  }
  brush.disc(x + 4, y + 4, radius, area.body);
  for (let index = 0; index < 3; index += 1) {
    const top = y - radius + brush.randomInt(12, 40) + index * 34;
    brush.discBand(x + 4, y + 4, radius, top, brush.randomInt(5, 11), area.band);
  }
}

function paintCircuit(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.circuit;
  const pitch = 12;
  for (let index = 0; index < 10; index += 1) {
    let x = brush.randomInt(1, 12) * 30 + 3;
    let y = brush.randomInt(0, 5) * pitch;
    const color = index % 3 === 0 ? area.traceDim : area.trace;
    const legs = brush.randomInt(2, 5);
    for (let leg = 0; leg < legs; leg += 1) {
      const drop = brush.randomInt(18, 55);
      if (brush.hd) {
        brush.fineRect(Math.round(x) * FINE + 1, Math.round(y) * FINE, 1, drop * FINE, color);
      } else {
        brush.rect(x, y, 1, drop, color);
      }
      y += drop;
      const jog = brush.randomInt(-3, 4) * pitch;
      const next = Math.min(brush.width - 8, Math.max(8, x + jog));
      if (next !== x) {
        if (brush.hd) {
          brush.fineRect(
            Math.round(Math.min(x, next)) * FINE + 1,
            Math.round(y) * FINE + 1,
            (Math.abs(next - x) + 1) * FINE - 1,
            1,
            color,
          );
        } else {
          brush.rect(Math.min(x, next), y, Math.abs(next - x) + 1, 1, color);
        }
        x = next;
      }
      if (brush.hd) {
        // An etched pad rather than a 3x3 blot: a lit square with a hole in it,
        // which is what a via looks like and what a trace is soldered to.
        const fx = Math.round(x) * FINE + 1;
        const fy = Math.round(y) * FINE + 1;
        brush.fineRect(fx - 2, fy - 2, 5, 5, mix(speck.pad, area.base, 0.45));
        brush.fineRect(fx - 1, fy - 1, 3, 3, speck.pad);
        brush.finePixel(fx, fy, mix(speck.pad, area.base, 0.7));
        continue;
      }
      brush.rect(x - 1, y - 1, 3, 3, speck.pad);
    }
  }
}

function paintCathode(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.cathode;
  // Tube bloom first, then the scanlines across the whole field on top: the
  // ribbing covers everything, so the bloom cannot read as a shape. Four barely
  // separated steps, the widest one running past the field edge, keep the ramp
  // from banding into visible circles.
  const x = Math.round(brush.width / 2) + brush.randomInt(-24, 25);
  const y = Math.round(brush.height / 2) + brush.randomInt(-16, 17);
  const bloom = [
    [250, area.bloom1],
    [195, area.bloom2],
    [140, area.bloom3],
    [85, area.bloom4],
  ] as const;
  if (brush.hd) {
    // Four discs become one radial ramp through the same four tones. The
    // classic stack exists because a gradient banded badly once blitted at 3x;
    // ordered dither is the answer that was not available then, and a tube's
    // bloom is the one thing in the roster that most wants it.
    brush.fineRgrad(Math.round(x) * FINE, Math.round(y) * FINE, 250 * FINE, [
      null,
      area.bloom1,
      area.bloom2,
      area.bloom3,
      area.bloom4,
    ]);
  } else {
    for (const [radius, color] of bloom) {
      brush.disc(x, y, radius, color);
    }
  }
  const scanStart = brush.randomInt(0, 3);
  if (brush.hd) {
    // The same third of the field covered, at a third of the pitch: a game
    // pixel of ribbing every three is a grille, and a fine pixel every three is
    // a scanline. The phase is the generator's own, so both arts start on the
    // same row.
    for (let row = scanStart * FINE; row < brush.fineHeight; row += 3) {
      brush.fineRect(0, row, brush.fineWidth, 1, area.scan);
    }
  } else {
    for (let row = scanStart; row < brush.height; row += 3) {
      brush.rect(0, row, brush.width, 1, area.scan);
    }
  }
  scatter(brush, 12, speck.fleck, undefined, undefined, mix(speck.fleck, area.base, 0.5));
}

function paintVault(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.vault;
  const courseHeight = 15;
  const stoneWidth = 36;
  let course = 0;
  for (let y = brush.randomInt(-courseHeight, 1); y < brush.height; y += courseHeight) {
    // Stones are inset by 2px so a tinted stone never eats its own mortar joint.
    const offset = course % 2 === 0 ? 0 : stoneWidth / 2;
    for (let x = offset - stoneWidth; x < brush.width; x += stoneWidth) {
      const roll = brush.random();
      if (roll < 0.16) {
        brush.rect(x + 2, y + 2, stoneWidth - 4, courseHeight - 3, area.stoneDark);
      } else if (roll < 0.3) {
        brush.rect(x + 2, y + 2, stoneWidth - 4, courseHeight - 3, area.stoneLight);
      }
      if (roll > 0.94) {
        brush.rect(x + stoneWidth - 6, y + courseHeight - 5, 2, 2, speck.chip);
      }
      brush.rect(x, y, 1, courseHeight, area.mortar);
      if (brush.hd) {
        // The joint keeps its width — it is what makes the wall a wall — and
        // gains a lit lip on the stone's left edge and a dithered shadow along
        // its foot, so a course reads as blocks set into mortar rather than as
        // a grid ruled over a fill.
        const fx = Math.round(x) * FINE;
        const fy = Math.round(y) * FINE;
        brush.fineRect(fx + FINE, fy + 2, 1, courseHeight * FINE - 2, mix(area.mortar, area.stoneLight, 0.5));
        brush.fineDither(
          fx + FINE,
          fy + courseHeight * FINE - 4,
          stoneWidth * FINE - FINE,
          3,
          mix(area.stoneDark, "#000000", 0.4),
          0.5,
        );
      }
    }
    brush.rect(0, y, brush.width, 1, area.mortar);
    if (brush.hd) {
      brush.fineRect(0, Math.round(y) * FINE + FINE, brush.fineWidth, 1, mix(area.mortar, area.stoneLight, 0.45));
    }
    course += 1;
  }
}

/**
 * A 1px circle, plotted rather than stroked: `ctx.arc` would antialias, and a
 * half-lit pixel is exactly what the blit at 3x turns into a smear.
 *
 * Walked by angle at a step fine enough that no pixel of the circumference is
 * skipped — one step per pixel of arc — and deduplicated by rounding onto the
 * grid, which a `fillRect` of the same pixel does for free.
 */
function ring(brush: BackgroundBrush, x: number, y: number, radius: number, color: string): void {
  const steps = Math.ceil(Math.PI * 2 * radius);
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    brush.rect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 1, 1, color);
  }
}

/**
 * THE OBSERVER's field (SHA-167): the starfield the veils stand on.
 *
 * It used to bake the dial's outer circle around the eye's socket, so that the
 * field said it was built around a point before the eye was uncovered. The
 * whole dial is the renderer's now (`drawZodiac`, SHA-211/212) and drawn on
 * every level, so this is a starfield and nothing else — kept as its own theme
 * because the roster names it, and because the veils' tones are these.
 */
function paintObserver(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.observer;
  const tones = [speck.starDim, speck.starMid, speck.starBright];
  const halos = tones.map((tone) => mix(tone, area.base, 0.55));
  for (let index = 0; index < STAR_COUNT; index += 1) {
    scatter(brush, 1, tones[index % tones.length], undefined, undefined, halos[index % halos.length]);
  }
  if (brush.hd) {
    // Deeper than the starfield's: this is the sky the veils stand on, and the
    // eye reads as further away the more there is behind it.
    fineDust(brush, 190, mix(speck.starDim, area.base, 0.4));
    fineDust(brush, 70, speck.starDim);
  }
}

const PAINTERS: Record<BackgroundId, (brush: BackgroundBrush) => void> = {
  starfield: paintStarfield,
  nebula: paintNebula,
  grid: paintGrid,
  horizon: paintHorizon,
  planet: paintPlanet,
  circuit: paintCircuit,
  cathode: paintCathode,
  vault: paintVault,
  observer: paintObserver,
};

export function paintBackground(
  ctx: CanvasRenderingContext2D,
  id: BackgroundId,
  variant: number,
  width: number,
  height: number,
  hd = false,
): void {
  paintWith(ctx, width, height, hashSeed(`${id}:${variant}`), hd, (brush) => {
    brush.rect(0, 0, width, height, BACKGROUND_COLORS[id].area.base);
    PAINTERS[id](brush);
  });
}

// What a theme paints *over* the room's tenant (SHA-188): drawn after the
// Observer's eye and before the wall. Most themes have nothing in front.
const FOREGROUNDS: Partial<Record<BackgroundId, (brush: BackgroundBrush) => void>> = {
  horizon: paintHorizonGround,
};

/**
 * Paints the theme's foreground onto `ctx` as it is — no base, nothing cleared
 * — and says whether the theme has one. Seeded apart from the background, so
 * the two layers roll their own dice and neither moves when the other is
 * retouched.
 */
export function paintForeground(
  ctx: CanvasRenderingContext2D,
  id: BackgroundId,
  variant: number,
  width: number,
  height: number,
  hd = false,
): boolean {
  const painter = FOREGROUNDS[id];
  if (!painter) {
    return false;
  }
  // Composed, never replaced: the foreground is a sheet with holes in it, and
  // whatever it is painted over has to go on showing through them. On the
  // arena's own front canvas — cleared before every repaint — the two are the
  // same picture; in the level gallery, where the still is one canvas, they are
  // not (SHA-224).
  paintWith(ctx, width, height, hashSeed(`${id}:${variant}:front`), hd, painter, true);
  return true;
}

/**
 * The luma at or above which a theme pixel is ink under DEMAKE, out of 255.
 *
 * Set against the two themes that would lose the most: vault's `stoneLight`
 * sits at 19.4 and its `mortar` at 23.6, so 22 is the one place between them
 * that keeps the stones dark and the joints lit — the wall stays a wall. The
 * threshold is deliberately low because these tones were authored dark by the
 * `check:backgrounds` rules in the first place; the field is meant to come out
 * sparse, the way a real 1-bit port's would.
 */
const MONO_LUMA_THRESHOLD = 22;

function toRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * The tube's reduction, in place: every painted pixel becomes ink or ground by
 * its luma. Transparent pixels are left transparent, which is what lets the
 * same pass serve the foreground — a sheet with holes in it — as well as the
 * field.
 */
function reduceToMono(data: Uint8ClampedArray): void {
  const ink = toRgb(canvasPalette.demakeInk);
  const ground = toRgb(canvasPalette.demakeGround);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) {
      continue;
    }
    const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    const tone = luma >= MONO_LUMA_THRESHOLD ? ink : ground;
    data[index] = tone[0];
    data[index + 1] = tone[1];
    data[index + 2] = tone[2];
  }
}

// Holds the painted field for the level on screen. Levels change rarely, so one
// canvas repainted on change beats caching every theme (each layer is a full
// field bitmap).
//
// DEMAKE gets a second canvas beside it rather than a re-threshold per frame:
// the reduction is a full 372x300 `getImageData` pass, and the capsule lasts
// 480 ticks. Its own painted key, so the two layers can be on different levels
// without either being repainted for the other's sake.
export class BackgroundLayer {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private painted: string | null = null;
  private readonly monoCanvas = document.createElement("canvas");
  private readonly monoCtx: CanvasRenderingContext2D;
  private monoPainted: string | null = null;
  // The foreground (SHA-188): a transparent sheet with the theme's front in it,
  // and its own demade twin. Both keyed like the field, and both empty for the
  // themes that have nothing in front.
  private readonly frontCanvas = document.createElement("canvas");
  private readonly frontCtx: CanvasRenderingContext2D;
  private frontPainted: string | null = null;
  private frontPresent = false;
  private readonly monoFrontCanvas = document.createElement("canvas");
  private readonly monoFrontCtx: CanvasRenderingContext2D;
  private monoFrontPainted: string | null = null;
  private monoFrontPresent = false;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    for (const canvas of [this.canvas, this.monoCanvas, this.frontCanvas, this.monoFrontCanvas]) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = this.canvas.getContext("2d");
    const monoCtx = this.monoCanvas.getContext("2d", { willReadFrequently: true });
    const frontCtx = this.frontCanvas.getContext("2d");
    const monoFrontCtx = this.monoFrontCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !monoCtx || !frontCtx || !monoFrontCtx) {
      throw new Error("2D background context unavailable");
    }
    this.ctx = ctx;
    this.monoCtx = monoCtx;
    this.frontCtx = frontCtx;
    this.monoFrontCtx = monoFrontCtx;
  }

  /**
   * A layer canvas sized for the art it is about to be painted in.
   *
   * Resizing clears the canvas, which is exactly what a repaint wants and why
   * the art mode is part of every key below: a theme painted at one resolution
   * is never reused at the other.
   */
  private size(canvas: HTMLCanvasElement, hd: boolean): void {
    const scale = hd ? FINE : 1;
    if (canvas.width !== this.width * scale) {
      canvas.width = this.width * scale;
      canvas.height = this.height * scale;
    }
  }

  /** The theme's foreground, or null when it has none. Drawn over the eye, under the wall. */
  frontImageFor(id: BackgroundId, variant: number, hd = false): HTMLCanvasElement | null {
    const key = `${id}:${variant}:${hd}`;
    if (this.frontPainted !== key) {
      this.size(this.frontCanvas, hd);
      this.frontCtx.clearRect(0, 0, this.frontCanvas.width, this.frontCanvas.height);
      this.frontPresent = paintForeground(this.frontCtx, id, variant, this.width, this.height, hd);
      this.frontPainted = key;
    }
    return this.frontPresent ? this.frontCanvas : null;
  }

  /** The foreground reduced to the tube's two tones, holes kept; null when the theme has none. */
  monoFrontImageFor(id: BackgroundId, variant: number, hd = false): HTMLCanvasElement | null {
    const key = `${id}:${variant}:${hd}`;
    if (this.monoFrontPainted !== key) {
      this.size(this.monoFrontCanvas, hd);
      const { width, height } = this.monoFrontCanvas;
      this.monoFrontCtx.clearRect(0, 0, width, height);
      this.monoFrontPresent = paintForeground(this.monoFrontCtx, id, variant, this.width, this.height, hd);
      if (this.monoFrontPresent) {
        const image = this.monoFrontCtx.getImageData(0, 0, width, height);
        reduceToMono(image.data);
        this.monoFrontCtx.putImageData(image, 0, 0);
      }
      this.monoFrontPainted = key;
    }
    return this.monoFrontPresent ? this.monoFrontCanvas : null;
  }

  imageFor(id: BackgroundId, variant: number, hd = false): HTMLCanvasElement {
    const key = `${id}:${variant}:${hd}`;
    if (this.painted !== key) {
      this.size(this.canvas, hd);
      paintBackground(this.ctx, id, variant, this.width, this.height, hd);
      this.painted = key;
    }
    return this.canvas;
  }

  // The same field, thresholded to the tube's two tones. Painted through the
  // theme's own painter and *then* reduced, rather than through a 1-bit brush,
  // so a theme is authored once and its demade twin can never drift from it.
  //
  // It takes the art mode now (SHA-223), because the tube is no longer pinned
  // to classic: a fine-grid wall standing on a coarse field is the exact
  // mismatch the pass's first rule exists to catch, and the threshold does not
  // care how many pixels it is given — the tones are the same either way.
  //
  // It runs the painter itself rather than borrowing the colour layer, which it
  // used to do. The colour layer may be on the fine grid now (SHA-221), and
  // asking it for a classic field would repaint it at the other resolution —
  // twice a frame for the whole of DEMAKE's crossfade, where both machines are
  // painted. Same painter, same seed, same picture; only the canvas differs.
  monoImageFor(id: BackgroundId, variant: number, hd = false): HTMLCanvasElement {
    const key = `${id}:${variant}:${hd}`;
    if (this.monoPainted === key) {
      return this.monoCanvas;
    }
    this.size(this.monoCanvas, hd);
    const { width, height } = this.monoCanvas;
    paintBackground(this.monoCtx, id, variant, this.width, this.height, hd);
    const image = this.monoCtx.getImageData(0, 0, width, height);
    reduceToMono(image.data);
    this.monoCtx.putImageData(image, 0, 0);
    this.monoPainted = key;
    return this.monoCanvas;
  }
}
