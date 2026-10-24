// The bestiary's thirteen species as JSON for tools/gen_assets.py: their
// numbers from gameConfig.creatures, and every look they can wear, drawn by
// the web game's own drawCreature — the bitmap and its decorations, the
// wings, legs, stalks and strands — at one game pixel a pixel.
//
// A look is a pose: a state, a facing and a step of the animation clock (and,
// for the crab, its load). Each is captured as palette indexes into the
// species' own colours, so the cartridge can flash it white by palette. The
// spider's thread is left out: the cartridge draws it as its own strip.

import { gameConfig } from "../../src/core/config/GameConfig";
import { SPECIES } from "../../src/entities/creatures/species";
import { drawCreature } from "../../src/render/CanvasRenderer";

import type { Creature } from "../../src/entities/creatures/Creature";

const KINDS = [
  "moth", "frog", "snail", "spider", "bat", "beetle", "woodpecker",
  "vine", "wisp", "firefly", "crab", "jellyfish", "slug",
] as const;
const STATES: Record<string, readonly string[]> = {
  moth: [""], frog: ["sit", "leap"], snail: ["crawl", "fall"], spider: ["hang", "drop"],
  bat: ["hang", "flit"], beetle: ["walk", "roll", "flipped"], woodpecker: ["fly", "cling", "rest"],
  vine: ["grow"], wisp: ["drift"], firefly: ["drift"], crab: ["walk"], jellyfish: ["sink", "hover", "rise"],
  slug: ["crawl"],
};
const STEPS = 16;   // animation steps a cycle
const STEP = 6;     // frames a step: 16 of them cover the longest cycle, the firefly's 96
const AT = 64;      // where the creature stands on the capture surface
const SIZE = 256;
// A vine is as tall as its hit points; the cartridge has one look per height,
// from a sprout to the field's full height.
const VINE_HEIGHTS = 24;

function capture(creature: Creature, clock: number): Map<number, string> {
  const pixels = new Map<number, string>();
  let fill = "";
  const ctx = {
    set fillStyle(value: string) {
      fill = value.toLowerCase();
    },
    get fillStyle() {
      return fill;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
        for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
          if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE) {
            pixels.set(yy * SIZE + xx, fill);
          }
        }
      }
    },
    save() {},
    restore() {},
  } as unknown as CanvasRenderingContext2D;
  drawCreature(ctx, creature, clock, 1, false, false);
  return pixels;
}

const out = KINDS.map((kind) => {
  const species = SPECIES[kind];
  const poses: { state: string; facing: number; step: number; load: number; height: number; pixels: Map<number, string> }[] =
    [];
  const config = (gameConfig.creatures as unknown as Record<string, Record<string, number>>)[kind];
  // A crab's look counts the capsules it carries; a vine's, its height.
  const loads = kind === "crab" ? Array.from({ length: config.carry + 1 }, (_, i) => i) : [0];
  const heights = kind === "vine" ? Array.from({ length: VINE_HEIGHTS }, (_, i) => i + 1) : [species.hitPoints];
  const steps = kind === "vine" ? 1 : STEPS;
  for (const state of STATES[kind]) {
    for (const facing of [1, -1]) {
      for (const load of loads) {
        for (const height of heights) {
          for (let step = 0; step < steps; step++) {
            const clock = step * STEP;
            // Home is set below the creature, so no spider draws its thread.
            const creature: Creature = {
              kind, alive: true, x: AT, y: AT, vx: 0, vy: 0,
              hitPoints: height, flashTicks: 0, facing: facing as 1 | -1,
              state, clock, phase: kind === "crab" ? load : step * 0.4, home: { x: AT, y: AT + 160 },
            };
            poses.push({ state, facing, step, load, height, pixels: capture(creature, clock) });
          }
        }
      }
    }
  }
  // One box for every pose, and one palette: the species' colours, the
  // outline first.
  let x0 = SIZE, y0 = SIZE, x1 = 0, y1 = 0;
  const colours = new Set<string>();
  for (const pose of poses) {
    for (const [i, c] of pose.pixels) {
      const x = i % SIZE, y = Math.floor(i / SIZE);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      colours.add(c);
    }
  }
  const outline = species.palette[species.outline].toLowerCase();
  const palette = [outline, ...[...colours].filter((c) => c !== outline)];
  return {
    kind,
    width: species.width,
    height: species.height,
    hitPoints: species.hitPoints,
    points: species.points,
    killPoints: species.killPoints,
    solid: species.solid,
    shotOnly: species.shotOnly ?? false,
    frameTicks: species.frameTicks,
    config,
    palette,
    box: { x: x0 - AT, y: y0 - AT, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    poses: poses.map((pose) => ({
      state: pose.state,
      facing: pose.facing,
      step: pose.step,
      load: pose.load,
      height: pose.height,
      rows: Array.from({ length: y1 - y0 + 1 }, (_, dy) =>
        Array.from({ length: x1 - x0 + 1 }, (_, dx) => {
          const c = pose.pixels.get((y0 + dy) * SIZE + x0 + dx);
          return c === undefined ? "." : String.fromCharCode(97 + palette.indexOf(c));
        }).join(""),
      ),
    })),
  };
});

process.stdout.write(JSON.stringify({ flashTicks: gameConfig.creatures.flashTicks, species: out }));
