// Every level's field art, painted by the web game's own backgrounds.ts and
// brought down to the Neo-Geo's 320x224 for tools/gen_assets.py.
//
// The HD painter rasters into a Pix and lands with one putImageData; a context
// that only keeps that image is all it needs. The 1116x900 picture is then
// area-averaged to 320x224 — the gradients stay gradients — and every pixel
// that was one of the theme's `speck` tones is stamped back on top, crisp, in
// its own colour, since averaging would melt a star into the sky. The
// foreground (the horizon's dunes) comes out the same way with its holes.
//
// Writes build/bg/<level>.rgba (and <level>-front.rgba where the theme has a
// foreground), 320x224 RGBA: alpha 255 is field, 0 a hole, and 254 a speck
// that twinkles (a star or a glint) — the rest of the specks hold still.

import { mkdirSync, writeFileSync } from "node:fs";

import { BACKGROUND_COLORS, paintBackground, paintForeground } from "../../src/render/backgrounds";
import { LEVELS } from "../../src/core/levels/levels";
import { FINE } from "../../src/interfaces/art";

const FIELD_W = 372;
const FIELD_H = 300;
const OUT_W = 320;
const OUT_H = 224;
const TWINKLES = /star|glint/i;

class ImageDataShim {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}
(globalThis as unknown as { ImageData: typeof ImageDataShim }).ImageData = ImageDataShim;

function capture(paint: (ctx: CanvasRenderingContext2D) => boolean | void): ImageDataShim | null {
  let image: ImageDataShim | null = null;
  const ctx = {
    putImageData(data: ImageDataShim) {
      image = data;
    },
    getImageData(_x: number, _y: number, w: number, h: number) {
      return new ImageDataShim(new Uint8ClampedArray(w * h * 4), w, h);
    },
  } as unknown as CanvasRenderingContext2D;
  const painted = paint(ctx);
  return painted === false ? null : image;
}

function hexRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// The fine picture area-averaged onto the Neo-Geo screen, holes kept as holes
// where less than half the area under a pixel was painted.
function shrink(src: ImageDataShim): Uint8Array {
  const out = new Uint8Array(OUT_W * OUT_H * 4);
  const sx = src.width / OUT_W;
  const sy = src.height / OUT_H;
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      const y0 = y * sy;
      const y1 = y0 + sy;
      let r = 0;
      let g = 0;
      let b = 0;
      let lit = 0;
      let area = 0;
      for (let fy = Math.floor(y0); fy < Math.ceil(y1); fy++) {
        const wy = Math.min(y1, fy + 1) - Math.max(y0, fy);
        for (let fx = Math.floor(x0); fx < Math.ceil(x1); fx++) {
          const w = (Math.min(x1, fx + 1) - Math.max(x0, fx)) * wy;
          const i = (fy * src.width + fx) * 4;
          area += w;
          if (src.data[i + 3] === 0) {
            continue;
          }
          r += src.data[i] * w;
          g += src.data[i + 1] * w;
          b += src.data[i + 2] * w;
          lit += w;
        }
      }
      const o = (y * OUT_W + x) * 4;
      if (lit * 2 < area) {
        continue;
      }
      out[o] = Math.round(r / lit);
      out[o + 1] = Math.round(g / lit);
      out[o + 2] = Math.round(b / lit);
      out[o + 3] = 255;
    }
  }
  return out;
}

// Every speck pixel of the fine picture, stamped crisp where it lands.
function stampSpecks(src: ImageDataShim, out: Uint8Array, specks: Record<string, string>): void {
  const tones = Object.entries(specks)
    .filter(([name]) => name !== "dialTick")
    .map(([name, hex]) => ({ rgb: hexRgb(hex), twinkles: TWINKLES.test(name) }));
  for (let fy = 0; fy < src.height; fy++) {
    for (let fx = 0; fx < src.width; fx++) {
      const i = (fy * src.width + fx) * 4;
      if (src.data[i + 3] === 0) {
        continue;
      }
      const tone = tones.find(
        (t) => t.rgb[0] === src.data[i] && t.rgb[1] === src.data[i + 1] && t.rgb[2] === src.data[i + 2],
      );
      if (!tone) {
        continue;
      }
      const x = Math.floor((fx * OUT_W) / src.width);
      const y = Math.floor((fy * OUT_H) / src.height);
      const o = (y * OUT_W + x) * 4;
      out.set(tone.rgb, o);
      out[o + 3] = tone.twinkles ? 254 : 255;
    }
  }
}

mkdirSync("neogeo/build/bg", { recursive: true });
LEVELS.forEach((level, index) => {
  const id = level.background;
  const field = capture((ctx) => paintBackground(ctx, id, index, FIELD_W, FIELD_H, true));
  if (!field || field.width !== FIELD_W * FINE) {
    throw new Error(`${level.name}: no HD field came out of paintBackground`);
  }
  const out = shrink(field);
  stampSpecks(field, out, BACKGROUND_COLORS[id].speck);
  writeFileSync(`neogeo/build/bg/${index}.rgba`, out);
  const front = capture((ctx) => paintForeground(ctx, id, index, FIELD_W, FIELD_H, true));
  if (front) {
    writeFileSync(`neogeo/build/bg/${index}-front.rgba`, shrink(front));
  }
});
