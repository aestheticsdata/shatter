// The fine-grid raster: the HD pass's drawing surface, and the blend every one
// of its tones is derived with.
//
// **Why a software raster at all**, when the renderer already has a canvas. The
// HD sprites are built out of ordered dither, discs and gradients — drawings
// where the question asked of every pixel is "which of two tones goes here",
// and the answer depends on the pixel's own coordinates. Canvas 2D has no verb
// for that: it would take a `fillRect` per pixel, several thousand per sprite,
// against a context that re-validates state on each one. A `Uint8ClampedArray`
// answers the question directly, and the whole sprite reaches the canvas as one
// `putImageData`.
//
// **This module imports nothing on purpose**, exactly as `@render/ballSprite`
// and `@core/config/bricks` do, and `toCanvas` is the only method that touches
// the DOM. Everything else is arithmetic over an array, which is what lets
// `scripts/check-pix.mjs` exercise the whole toolkit under plain node.
//
// The unit here is the **fine pixel** — one third of a game pixel, one pixel of
// the 1116x900 backing store the renderer has always had and has always thrown
// away by rounding before it multiplies. See the spec:
// `docs/superpowers/specs/2026-09-20-hd-pixel-art-pass-design.md`.

/**
 * The 4x4 ordered-dither matrix, and the only dither pattern the pass uses.
 *
 * One matrix rather than a choice of several: two dithers of different periods
 * meeting along an edge read as a seam, and the whole point of dithering a
 * material band is that the eye takes it for a tone rather than for a texture.
 */
export const BAYER: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * A linear blend of two hex tones, `t` from 0 (all `from`) to 1 (all `to`).
 *
 * **Every intermediate tone in the HD art is this function of two palette
 * tones.** That is the rule that keeps `palette.ts` and `bricks.ts` the single
 * source of truth through an art pass that needs five tones per material where
 * the roster authored three: a retoned brick carries its own bevel and its own
 * dither bands with it, and no hex outside the palette is ever written down.
 */
export function mix(from: string, to: string, t: number): string {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const blend = (shift: number): number => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return `#${((blend(16) << 16) | (blend(8) << 8) | blend(0)).toString(16).padStart(6, "0")}`;
}

/**
 * The inset of each row of a pill `height` fine pixels tall, top to bottom.
 *
 * The paddle and every capsule are the same shape at different widths — a
 * rectangle with semicircular ends — so the rounding lives here once rather
 * than in each sprite. Read as "row `y` starts `rows[y]` pixels in from either
 * end"; the flat middle rows come back 0.
 *
 * Deliberately the same arithmetic as `ballRows` in `@render/ballSprite`: the
 * half-span is rounded rather than the span, which is what keeps a pill
 * symmetric about its own axis at every height instead of listing to one side
 * at some of them.
 */
export function pillRows(height: number): readonly number[] {
  const radius = height / 2;
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - radius;
    rows.push(Math.round(radius - Math.sqrt(Math.max(0, radius * radius - dy * dy))));
  }
  return rows;
}

type Rgb = readonly [number, number, number];

function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * A fine-grid drawing surface: RGBA bytes, and the verbs the HD sprites need.
 *
 * Every coordinate is in fine pixels and is floored, not rounded — a sprite is
 * authored on the grid it is drawn on, so a fractional coordinate means a
 * centre between pixels (which `disc` wants) rather than a position that should
 * be snapped.
 *
 * Out-of-bounds writes are dropped rather than throwing. Half the recipes draw
 * a rim disc a pixel larger than the sprite it sits in, and clipping that at
 * the edge is the intended reading, not an error to guard against at 400 call
 * sites.
 */
export class Pix {
  // Parameterised on `ArrayBuffer` rather than left as the default
  // `ArrayBufferLike`: `ImageData` will not take a view that might be backed by
  // a `SharedArrayBuffer`, and this one never is.
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  // Hex is what the palette speaks and what a recipe reads; the raster needs
  // bytes. Parsing is the hot path's one avoidable cost, so each tone is parsed
  // once per surface — a sprite uses a handful of tones over tens of thousands
  // of pixels.
  private readonly tones = new Map<string, Rgb>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  }

  set(x: number, y: number, hex: string): void {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
      return;
    }
    let tone = this.tones.get(hex);
    if (tone === undefined) {
      tone = hexRgb(hex);
      this.tones.set(hex, tone);
    }
    const index = (py * this.width + px) * 4;
    this.data[index] = tone[0];
    this.data[index + 1] = tone[1];
    this.data[index + 2] = tone[2];
    this.data[index + 3] = 255;
  }

  rect(x: number, y: number, width: number, height: number, hex: string): void {
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        this.set(x + column, y + row, hex);
      }
    }
  }

  /**
   * `hex` laid over the rectangle at coverage `t`, 0 to 1, as ordered dither.
   *
   * **The matrix is indexed by the surface's coordinates, not the
   * rectangle's.** Two dithered bands that meet — the brick's `M1` fading into
   * its body, then its body into `D1` — then interlock instead of each
   * restarting the pattern at its own corner, which is the difference between a
   * material and a pair of stripes with a seam between them.
   */
  dither(x: number, y: number, width: number, height: number, hex: string, t: number): void {
    const threshold = t * 16;
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const px = Math.floor(x + column);
        const py = Math.floor(y + row);
        if (BAYER[py & 3][px & 3] < threshold) {
          this.set(px, py, hex);
        }
      }
    }
  }

  /**
   * A vertical gradient down a column `width` wide, dithered between stops.
   *
   * `stops` is `[y, tone]` pairs in descending order of height; each band runs
   * from its own `y` to the next one's, dithering the next tone in as it goes.
   * A gradient in a palette of nine tones is the one thing 1987 hardware could
   * not do and a 2026 pixel artist does constantly, and ordered dither is how:
   * no new tones, no alpha, and it survives the DEMAKE threshold as a texture
   * rather than dissolving into a flat slab.
   */
  vgrad(x: number, width: number, stops: readonly (readonly [number, string])[]): void {
    for (let index = 0; index < stops.length - 1; index++) {
      const [fromY, fromTone] = stops[index];
      const [toY, toTone] = stops[index + 1];
      const span = toY - fromY;
      if (span <= 0) {
        continue;
      }
      for (let y = fromY; y < toY; y++) {
        const threshold = ((y - fromY) / span) * 16;
        for (let column = 0; column < width; column++) {
          const px = Math.floor(x + column);
          this.set(px, y, BAYER[y & 3][px & 3] < threshold ? toTone : fromTone);
        }
      }
    }
  }

  /**
   * A filled disc of radius `r` about `(cx, cy)`, solid or dithered at `t`.
   *
   * Row by row off the circle equation with the half-span rounded, which is
   * `ballRows`' rule and for `ballRows`' reason: it is what makes a small disc
   * read as a sphere rather than as a polygon.
   *
   * **The two axes round differently, on purpose.** Columns are centred on
   * `Math.round(cx)` and rows are chosen by pixel-centre distance from `cy`, so
   * an integer centre puts both axes in the same place and a half-integer one
   * puts them half a pixel apart. That offset is load-bearing rather than
   * sloppy: the ball stacks `disc(11, 11, 10)` under `disc(11.5, 11.5, 10.5,
   * 0.5)`, and the half pixel is what lays the dithered rim *outside* the solid
   * body on the lower right instead of on top of it. One pixel of
   * anti-aliasing, and not a blended tone anywhere. `scripts/check-pix.mjs`
   * pins it so it does not get tidied away.
   */
  disc(cx: number, cy: number, r: number, hex: string, t?: number): void {
    for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++) {
      const dy = y + 0.5 - cy;
      const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      if (half <= 0) {
        continue;
      }
      const x = Math.round(cx) - half;
      if (t === undefined) {
        this.rect(x, y, half * 2, 1, hex);
      } else {
        this.dither(x, y, half * 2, 1, hex, t);
      }
    }
  }

  /**
   * The rows of a disc that fall inside `[top, top + height)`, and no others.
   *
   * What a dune is: a circle most of which is under the ground line. The band
   * is applied to the rows rather than to the pixels so the curve keeps its
   * shape where it does show, instead of being a disc with a straight edge
   * clipped onto it.
   */
  discBand(cx: number, cy: number, r: number, top: number, height: number, hex: string): void {
    const from = Math.max(Math.ceil(cy - r), top);
    const to = Math.min(Math.floor(cy + r), top + height - 1);
    for (let y = from; y <= to; y++) {
      const dy = y + 0.5 - cy;
      const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      if (half > 0) {
        this.rect(Math.round(cx) - half, y, half * 2, 1, hex);
      }
    }
  }

  /**
   * A one-pixel circle, optionally dashed — midpoint circle, eight-way mirrored.
   *
   * `dash` is the period in plotted points; roughly two thirds of each period is
   * drawn. Approximate on purpose: the arcs are for the zodiac wheel's rings,
   * where an exactly even dash would read as a machined part rather than as
   * something engraved.
   */
  ring(cx: number, cy: number, r: number, hex: string, dash?: number): void {
    let x = Math.round(r);
    let y = 0;
    let error = 1 - x;
    let step = 0;
    while (x >= y) {
      const on = dash === undefined || step % dash < dash - Math.max(2, Math.round(dash / 3));
      step++;
      if (on) {
        this.set(cx + x, cy + y, hex);
        this.set(cx + y, cy + x, hex);
        this.set(cx - y, cy + x, hex);
        this.set(cx - x, cy + y, hex);
        this.set(cx - x, cy - y, hex);
        this.set(cx - y, cy - x, hex);
        this.set(cx + y, cy - x, hex);
        this.set(cx + x, cy - y, hex);
      }
      y++;
      if (error < 0) {
        error += 2 * y + 1;
      } else {
        x--;
        error += 2 * (y - x) + 1;
      }
    }
  }

  /**
   * A radial gradient out to `r`, dithered through `tones` from rim to centre.
   *
   * `tones[0]` may be `null`, which leaves whatever is already there — that is
   * how a pre-dawn glow is laid over a sky without a disc-shaped edge where it
   * stops. Each neighbouring pair is dithered into the next exactly as `vgrad`
   * does, so a dome and a sky built from the same tone list meet without a seam.
   */
  rgrad(cx: number, cy: number, r: number, tones: readonly (string | null)[]): void {
    const bands = tones.length - 1;
    const fromY = Math.max(0, Math.ceil(cy - r));
    const toY = Math.min(this.height - 1, Math.floor(cy + r));
    const fromX = Math.max(0, Math.ceil(cx - r));
    const toX = Math.min(this.width - 1, Math.floor(cx + r));
    for (let y = fromY; y <= toY; y++) {
      for (let x = fromX; x <= toX; x++) {
        const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (distance >= r) {
          continue;
        }
        const position = (1 - distance / r) * bands;
        const band = Math.min(bands - 1, Math.floor(position));
        const fraction = position - band;
        const tone = BAYER[y & 3][x & 3] < fraction * 16 ? tones[band + 1] : tones[band];
        if (tone !== null && tone !== undefined) {
          this.set(x, y, tone);
        }
      }
    }
  }

  /** The surface as a canvas, ready to blit. The one method that needs a DOM. */
  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D pix context unavailable");
    }
    ctx.putImageData(new ImageData(this.data, this.width, this.height), 0, 0);
    return canvas;
  }
}

// One period of the dither, as a tile. Keyed by tone and coverage; there are a
// few dozen of both across the whole roster.
const DITHER_TILES = new Map<string, HTMLCanvasElement>();

/**
 * A 4x4 tile of `hex` at coverage `t`, transparent elsewhere — the dither as
 * something canvas can repeat.
 *
 * **For the drawings that are not baked.** A dithered band inside a *sprite* is
 * written pixel by pixel into a `Pix` and blitted once, and costs nothing. The
 * wall is not a sprite: `drawBrick` has seven live paint modifiers and is drawn
 * fresh every frame, so a 84x4 band written pixel by pixel would be ~170
 * `fillRect` calls per band, twice per brick, sixty bricks a frame. As a
 * repeating pattern it is one fill.
 *
 * The tile is one Bayer period exactly, so a pattern laid from a sprite's own
 * origin reproduces `Pix.dither` from that origin pixel for pixel — the
 * interlocking that makes two touching bands read as one material is kept, as
 * long as the caller aligns the pattern to the body rather than to the canvas.
 */
export function ditherTile(hex: string, t: number): HTMLCanvasElement {
  const key = `${hex}@${t}`;
  const found = DITHER_TILES.get(key);
  if (found !== undefined) {
    return found;
  }
  const tile = new Pix(4, 4);
  tile.dither(0, 0, 4, 4, hex, t);
  const canvas = tile.toCanvas();
  DITHER_TILES.set(key, canvas);
  return canvas;
}

/**
 * Baked sprites, kept by key.
 *
 * The HD recipes cost thousands of array writes each, and almost none of that
 * work changes between frames: a red brick at full health is the same picture
 * every tick it is on screen. Bake it once, blit it forever.
 *
 * **What belongs here is anything whose drawing is a pure function of a small
 * key** — the ball at each of GIANT's sizes, the 58 pills, the frame, the
 * beasts, a level's background. What does not is the wall: `drawBrick` takes
 * seven live paint modifiers plus a per-cell seed, two of them continuous
 * floats, so its key would be neither small nor finite. Bricks are drawn on the
 * fine grid every frame instead, at about the cost the wall already pays; see
 * the spec.
 *
 * No eviction. The keys are bounded by the roster — tens of sprites, not
 * thousands — and a cache that can forget a sprite is a cache that can stutter
 * the frame it forgets one.
 */
export class SpriteCache {
  private readonly baked = new Map<string, HTMLCanvasElement>();

  get(key: string, bake: () => HTMLCanvasElement): HTMLCanvasElement {
    const found = this.baked.get(key);
    if (found !== undefined) {
      return found;
    }
    const made = bake();
    this.baked.set(key, made);
    return made;
  }

  /** How many sprites are held — for the console, and for the guard scripts. */
  get size(): number {
    return this.baked.size;
  }
}

/**
 * An ASCII bitmap at 3x, with its diagonals resolved — AdvMAME3x.
 *
 * **The 1x bitmaps stay the source of truth.** The beasts and the tears are
 * drawn as character grids precisely so a leg can be moved or an eye lowered by
 * editing a character (see `BROOD_BITMAPS`), and re-authoring them three times
 * larger would trade that away for detail nobody asked for. Scale3x instead
 * reads the eight neighbours of every pixel and rounds off the staircases,
 * which is the one thing a creature this size actually gains at 3x: the
 * silhouette stops being blocky while every tell stays exactly where it was.
 *
 * Nearest-neighbour is what the house does elsewhere and is still right there —
 * a boss is its species *grown*, every pixel drawn twice over, and the blocks
 * are the point. This is the other case: the same creature at the same size,
 * drawn on a finer grid.
 *
 * `palette` maps a character to a tone; a character it has no entry for is a
 * hole, which is how `.` stays transparent.
 */
export function scale3x(rows: readonly string[], palette: Readonly<Record<string, string>>): Pix {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const at = (x: number, y: number): string => (x < 0 || y < 0 || x >= width || y >= height ? "." : rows[y][x]);
  const out = new Pix(width * 3, height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // The nine-neighbourhood, named as the algorithm names it: B above, D
      // left, F right, H below, E the pixel itself, A/C/G/I the corners.
      const a = at(x - 1, y - 1);
      const b = at(x, y - 1);
      const c = at(x + 1, y - 1);
      const d = at(x - 1, y);
      const e = at(x, y);
      const f = at(x + 1, y);
      const g = at(x - 1, y + 1);
      const h = at(x, y + 1);
      const i = at(x + 1, y + 1);
      // An edge runs between two like neighbours that differ from the third, and
      // the corner pixel on that side takes the edge's tone instead of the
      // centre's. The middle of each side additionally asks whether the far
      // corner agrees, which is what stops a single stray pixel from growing a
      // spur.
      const out9: readonly string[] = [
        d === b && b !== f && d !== h ? d : e,
        (d === b && b !== f && d !== h && e !== c) || (b === f && b !== d && f !== h && e !== a) ? b : e,
        b === f && b !== d && f !== h ? f : e,
        (d === b && b !== f && d !== h && e !== g) || (d === h && d !== b && h !== f && e !== a) ? d : e,
        e,
        (b === f && b !== d && f !== h && e !== i) || (h === f && d !== h && b !== f && e !== c) ? f : e,
        d === h && d !== b && h !== f ? d : e,
        (d === h && d !== b && h !== f && e !== i) || (h === f && d !== h && b !== f && e !== g) ? h : e,
        h === f && d !== h && b !== f ? f : e,
      ];
      for (let index = 0; index < 9; index++) {
        const tone = palette[out9[index]];
        if (tone !== undefined) {
          out.set(x * 3 + (index % 3), y * 3 + Math.floor(index / 3), tone);
        }
      }
    }
  }
  return out;
}
