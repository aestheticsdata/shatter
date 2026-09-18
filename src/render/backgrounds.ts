import { gameConfig } from "@core/config/GameConfig";
import { canvasPalette } from "@render/palette";

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
  readonly area: { readonly base: string } & Readonly<Record<string, string>>;
  readonly speck: Readonly<Record<string, string>>;
}

export const BACKGROUND_COLORS = {
  starfield: {
    area: { base: "#0b0b26" },
    speck: { starDim: "#232a52", starMid: "#3a4a86", starBright: "#7f92c8" },
  },
  nebula: {
    area: { base: "#120b1e", hazeEdge: "#160d24", hazeOuter: "#1a1029", hazeInner: "#221436" },
    speck: { dust: "#402d5e", glint: "#6d54a0" },
  },
  grid: {
    area: { base: "#071119", column: "#0f2130", row: "#0c1a26" },
    speck: { node: "#1a3a4e" },
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
    },
    speck: { star: "#2a4a5c" },
  },
  planet: {
    area: { base: "#0a0a1c", body: "#10152a", limb: "#182140", band: "#0c1122" },
    speck: { star: "#2e3a63", glint: "#6a78ad" },
  },
  circuit: {
    area: { base: "#05130d", trace: "#0d281b", traceDim: "#0a1e15" },
    speck: { pad: "#17482e" },
  },
  cathode: {
    area: {
      base: "#14100a",
      bloom1: "#181309",
      bloom2: "#1c160c",
      bloom3: "#201a0f",
      bloom4: "#241d12",
      scan: "#0d0a06",
    },
    speck: { fleck: "#3d2f1c" },
  },
  vault: {
    area: { base: "#0e0e13", mortar: "#17171f", stoneDark: "#0a0a0f", stoneLight: "#131319" },
    speck: { chip: "#22222c" },
  },
  // THE OBSERVER's field: the classic starfield with a zodiac ring cut into it
  // around the eye's socket. The two rings are `area` because a 1px circle 172px
  // across is a line and the class rule counts lines as area; the twelve ticks
  // are `speck` because each is five pixels of dot, which is what the brighter
  // tone is allowed to be.
  observer: {
    area: { base: "#0b0b26", ringOuter: "#151a38", ringInner: "#1b2244" },
    speck: { starDim: "#232a52", starMid: "#3a4a86", starBright: "#7f92c8", tick: "#2b3a72" },
  },
} as const satisfies Record<BackgroundId, BackgroundColorSet>;

/**
 * Where a theme is painted *around*, in field pixels.
 *
 * One theme reads it — `observer`, whose ring belongs to the eye's socket and
 * moves veil by veil. Every other painter ignores it, and a caller with no
 * point to give (the capsule catalogue's scenes) leaves it out.
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

function paintIris(brush: BackgroundBrush, tint: IrisTint, focus: BackgroundFocus, demade: boolean): void {
  const ink = canvasPalette.demakeInk;
  const ground = canvasPalette.demakeGround;
  const { area } = IRIS_COLORS[tint];
  const bands = [area.band0, area.band1, area.band2, area.band3, area.band4, area.band5, area.band6, area.band7];
  brush.rect(0, 0, brush.width, brush.height, demade ? ground : area.base);
  if (!demade) {
    // The white of an eye is not flat, and neither is the back of one: veins,
    // short and horizontal, so the sclera reads as tissue rather than as paper.
    for (let index = 0; index < 40; index += 1) {
      brush.rect(brush.randomInt(0, brush.width), brush.randomInt(20, 240), brush.randomInt(4, 14), 1, area.vein);
    }
  }
  for (const [index, radius] of IRIS_BANDS.entries()) {
    if (demade) {
      ring(brush, focus.x, focus.y, radius, index % 2 === 0 ? ink : ground);
      continue;
    }
    brush.disc(focus.x, focus.y, radius, bands[index]);
  }
  // Fibres from the pupil outward, every fourteenth of a turn.
  for (let index = 0; index < 28; index += 1) {
    const angle = (index / 28) * Math.PI * 2 + 0.1;
    const tone = demade ? (index % 2 === 0 ? ink : ground) : index % 2 === 0 ? area.fibreDim : area.fibreLit;
    for (let radius = 40; radius < 100; radius += 1) {
      brush.rect(focus.x + Math.cos(angle) * radius, focus.y + Math.sin(angle) * radius, 1, 1, tone);
    }
  }
  for (let radius = 100; radius < 104; radius += 1) {
    ring(brush, focus.x, focus.y, radius, demade ? ink : area.limbal);
  }
  // The brow, across the top: the lid the player is looking out from under.
  brush.rect(0, 0, brush.width, 18, demade ? ground : area.brow);
  brush.rect(0, 18, brush.width, 2, demade ? ink : area.browRim);
  brush.rect(0, 20, brush.width, 1, demade ? ink : area.lash);
  for (let x = 6; x < brush.width; x += 22) {
    brush.rect(x, 21, 2, 6, demade ? ink : area.browRim);
  }
}

/**
 * The two irises, painted once each and kept.
 *
 * Beside `BackgroundLayer` and not inside it: that one holds *the level on
 * screen* and repaints when the level changes, and the iris is neither a level
 * nor a theme — it is one of two pictures that the field is replaced with for
 * twenty-two seconds. Four canvases in all, and they are painted the first time
 * a player goes through the door rather than at boot.
 */
export class IrisLayer {
  private readonly cache = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  imageFor(tint: IrisTint, demade: boolean): HTMLCanvasElement {
    const key = `${tint}:${demade ? "mono" : "lit"}`;
    const held = this.cache.get(key);
    if (held) {
      return held;
    }
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D iris context unavailable");
    }
    const { centerX, centerY } = gameConfig.observer.inside;
    paintIris(createBrush(ctx, this.width, this.height, hashSeed(key)), tint, { x: centerX, y: centerY }, demade);
    this.cache.set(key, canvas);
    return canvas;
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
  };
}

function scatter(brush: BackgroundBrush, count: number, color: string, minY = 4, maxY = brush.height - 4): void {
  for (let index = 0; index < count; index += 1) {
    brush.rect(brush.randomInt(4, brush.width - 4), brush.randomInt(minY, maxY), 1, 1, color);
  }
}

const STAR_COUNT = 58;

function paintStarfield(brush: BackgroundBrush): void {
  const { speck } = BACKGROUND_COLORS.starfield;
  const tones = [speck.starDim, speck.starMid, speck.starBright];
  for (let index = 0; index < STAR_COUNT; index += 1) {
    scatter(brush, 1, tones[index % tones.length]);
  }
  // Three cross-shaped stars: the largest detail in the theme, still 3px wide.
  for (let index = 0; index < 3; index += 1) {
    const x = brush.randomInt(24, brush.width - 24);
    const y = brush.randomInt(24, brush.height - 24);
    brush.rect(x - 1, y, 3, 1, speck.starBright);
    brush.rect(x, y - 1, 1, 3, speck.starBright);
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
  for (const [fractionX, fractionY] of spots) {
    const x = Math.round(fractionX * brush.width) + brush.randomInt(-16, 17);
    const y = Math.round(fractionY * brush.height) + brush.randomInt(-12, 13);
    // Three layers, each a lumpier ring of lobes than the one inside it, so the
    // haze fades out over ~30px instead of ending on a circle.
    cloud(brush, x, y, 58, area.hazeEdge, 7);
    cloud(brush, x, y, 40, area.hazeOuter, 6);
    cloud(brush, x, y, 20, area.hazeInner, 4);
  }
  scatter(brush, 30, speck.dust);
  scatter(brush, 7, speck.glint);
}

function paintGrid(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.grid;
  // The lattice matches the brick pitch (30×12) and is offset per level, so it
  // reads as blueprint paper rather than as a ghost row of bricks.
  const columnStep = 30;
  const rowStep = 12;
  const columnOffset = brush.randomInt(0, columnStep);
  const rowOffset = brush.randomInt(0, rowStep);
  for (let x = columnOffset; x < brush.width; x += columnStep) {
    brush.rect(x, 0, 1, brush.height, area.column);
  }
  for (let y = rowOffset; y < brush.height; y += rowStep) {
    brush.rect(0, y, brush.width, 1, area.row);
  }
  for (let x = columnOffset; x < brush.width; x += columnStep) {
    for (let y = rowOffset; y < brush.height; y += rowStep) {
      if (brush.random() < 0.14) {
        brush.rect(x - 1, y - 1, 2, 2, speck.node);
      }
    }
  }
}

function paintHorizon(brush: BackgroundBrush): void {
  const { area, speck } = BACKGROUND_COLORS.horizon;
  // The horizon sits below the deepest brick row (y 134) and above the paddle
  // lane, so neither the grid nor the paddle is ever read against a band edge.
  const horizon = Math.round(brush.height * 0.6) + brush.randomInt(-12, 13);
  const bands = [area.sky1, area.sky2, area.sky3, area.glow];
  const bandHeight = 10;
  scatter(brush, 18, speck.star, 6, horizon - bands.length * bandHeight - 10);
  bands.forEach((color, index) => {
    brush.rect(0, horizon - (bands.length - index) * bandHeight, brush.width, bandHeight, color);
  });
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
    brush.discBand(x, horizon + radius - rise, radius, horizon - rise, rise, area.dune);
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
      brush.rect(x, y, 1, drop, color);
      y += drop;
      const jog = brush.randomInt(-3, 4) * pitch;
      const next = Math.min(brush.width - 8, Math.max(8, x + jog));
      if (next !== x) {
        brush.rect(Math.min(x, next), y, Math.abs(next - x) + 1, 1, color);
        x = next;
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
  for (const [radius, color] of bloom) {
    brush.disc(x, y, radius, color);
  }
  for (let row = brush.randomInt(0, 3); row < brush.height; row += 3) {
    brush.rect(0, row, brush.width, 1, area.scan);
  }
  scatter(brush, 12, speck.fleck);
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
    }
    brush.rect(0, y, brush.width, 1, area.mortar);
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

// The zodiac ring: two circles and twelve ticks across the band between them.
const RING_OUTER = 86;
const RING_INNER = 82;
const RING_TICKS = 12;

/**
 * THE OBSERVER's field: a starfield with a zodiac ring around the eye's socket.
 *
 * The ring is here and not on the eye because it has to be there **before** the
 * eye is — on THE VEIL the wall covers the socket and only two gaps show any of
 * it, so a player who has not yet broken through still sees that this level's
 * field is built around a point. It is the one thing in this file painted at a
 * position the caller chooses, which is why `focus` exists.
 *
 * A veil's socket can sit near an edge (THE TEAR's is in the top-left corner)
 * and the ring simply runs off the field there; clipping it to fit would move
 * the centre, and the centre is the whole statement.
 */
function paintObserver(brush: BackgroundBrush, focus: BackgroundFocus): void {
  const { area, speck } = BACKGROUND_COLORS.observer;
  const tones = [speck.starDim, speck.starMid, speck.starBright];
  for (let index = 0; index < STAR_COUNT; index += 1) {
    scatter(brush, 1, tones[index % tones.length]);
  }
  ring(brush, focus.x, focus.y, RING_OUTER, area.ringOuter);
  ring(brush, focus.x, focus.y, RING_INNER, area.ringInner);
  // The ticks are drawn across the whole band rather than as dots on one
  // circle, so the two rings read as a dial with divisions rather than as two
  // unrelated circles that happen to be concentric.
  for (let index = 0; index < RING_TICKS; index += 1) {
    const angle = (index / RING_TICKS) * Math.PI * 2;
    for (let radius = RING_INNER; radius <= RING_OUTER; radius += 1) {
      brush.rect(focus.x + Math.cos(angle) * radius, focus.y + Math.sin(angle) * radius, 1, 1, speck.tick);
    }
  }
}

const PAINTERS: Record<BackgroundId, (brush: BackgroundBrush, focus: BackgroundFocus) => void> = {
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
  focus?: BackgroundFocus,
): void {
  const brush = createBrush(ctx, width, height, hashSeed(`${id}:${variant}`));
  brush.rect(0, 0, width, height, BACKGROUND_COLORS[id].area.base);
  // The field's middle when the caller has nothing to say, which is every theme
  // but one and every caller but the two that know which level they are on.
  PAINTERS[id](brush, focus ?? { x: Math.round(width / 2), y: Math.round(height / 2) });
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

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.monoCanvas.width = width;
    this.monoCanvas.height = height;
    const ctx = this.canvas.getContext("2d");
    const monoCtx = this.monoCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !monoCtx) {
      throw new Error("2D background context unavailable");
    }
    this.ctx = ctx;
    this.monoCtx = monoCtx;
  }

  // `focus` is not part of the key and must not be: it is a function of the
  // level, the variant already is the level, and a key carrying a point would
  // repaint the field every time a veil's socket was nudged in the source
  // without ever being able to be wrong about it.
  imageFor(id: BackgroundId, variant: number, focus?: BackgroundFocus): HTMLCanvasElement {
    const key = `${id}:${variant}`;
    if (this.painted !== key) {
      paintBackground(this.ctx, id, variant, this.width, this.height, focus);
      this.painted = key;
    }
    return this.canvas;
  }

  // The same field, thresholded to the tube's two tones. Reduced from the
  // colour layer rather than repainted through a 1-bit brush, so a theme is
  // authored once and its demade twin can never drift from it.
  monoImageFor(id: BackgroundId, variant: number, focus?: BackgroundFocus): HTMLCanvasElement {
    const key = `${id}:${variant}`;
    if (this.monoPainted === key) {
      return this.monoCanvas;
    }
    this.monoCtx.drawImage(this.imageFor(id, variant, focus), 0, 0);
    const image = this.monoCtx.getImageData(0, 0, this.width, this.height);
    const { data } = image;
    const ink = toRgb(canvasPalette.demakeInk);
    const ground = toRgb(canvasPalette.demakeGround);
    for (let index = 0; index < data.length; index += 4) {
      const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      const tone = luma >= MONO_LUMA_THRESHOLD ? ink : ground;
      data[index] = tone[0];
      data[index + 1] = tone[1];
      data[index + 2] = tone[2];
    }
    this.monoCtx.putImageData(image, 0, 0);
    this.monoPainted = key;
    return this.monoCanvas;
  }
}
