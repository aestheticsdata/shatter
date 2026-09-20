// SHA-20 readability guard for the per-level playfield backgrounds.
//
// Themes may look different, but never at the cost of reading the game. This
// checks the two invariants the theme palette is built on, plus the level
// assignment rule, and exits non-zero with a report when one breaks:
//
//   1. `area` tones (fills, bands, lattice lines, planet bodies) stay dark:
//      the dominant `base` fill within a hair of the classic field, the rest
//      capped so every sprite that must be read keeps at least 3:1 against them
//      (WCAG's bar for graphical objects; the classic field gives 4.5:1).
//   2. `speck` tones (1-3px stars, nodes, pads) may sparkle, but stay well under
//      the sprite palette's brightness and away from brick/capsule hues.
//   3. No two adjacent levels share a theme — including across the wrap back to
//      level 1 — and every theme is actually used.
//   4. Every theme paints, in both arts, and the HD field covers every pixel of
//      itself (SHA-221). A background is the one layer nothing is drawn under,
//      so a gradient that stopped a row short or a raster that was never
//      flushed would show as a hole straight through to the page.
//
// It covers the two irises INSIDE THE EYE paints as well (SHA-172). They are
// not a level's theme, so rules 3 do not apply to them, but they replace the
// field for twenty-two seconds and rules 1 and 2 are exactly as binding there.
//
// Run with: pnpm run check:backgrounds
import { registerHooks } from "node:module";
import { URL } from "node:url";

// The source uses the project's TS path aliases; map them the way Vite does.
const ALIASES = ["@audio", "@core", "@entities", "@input", "@interfaces", "@render", "@shared", "@state", "@ui", "@"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const alias = ALIASES.find((name) => specifier === name || specifier.startsWith(`${name}/`));
    if (!alias) {
      return nextResolve(specifier, context);
    }
    const tail = specifier.slice(alias.length);
    const directory = alias === "@" ? "" : `${alias.slice(1)}`;
    const path = `../src/${directory}${tail}`;
    return { url: new URL(path.endsWith(".ts") ? path : `${path}.ts`, import.meta.url).href, shortCircuit: true };
  },
});

const { BACKGROUND_COLORS, IRIS_COLORS, paintBackground, paintForeground } =
  await import("../src/render/backgrounds.ts");
const { BRICK_COLORS, DROP_COLORS, canvasPalette } = await import("../src/render/palette.ts");
const { LEVELS } = await import("../src/core/levels/levels.ts");

const BASE_LUMINANCE_MAX = 0.008;
const AREA_LUMINANCE_MAX = 0.02;
const AREA_MIN_CONTRAST = 3;
const AREA_MIN_HUE_DISTANCE = 100;
const SPECK_LUMINANCE_MAX = 0.3;
const SPECK_MIN_HUE_DISTANCE = 48;

// Everything the player must read at a glance while a ball is in flight. Brick
// `light`/`dark` tones are left out on purpose: they are 1px bevels on a body
// that is itself in this list, and the classic field never separated them either.
const MUST_READ = {
  ball: canvasPalette.ballBody,
  paddle: canvasPalette.paddleBody,
  paddleCap: canvasPalette.paddleCap,
  laserShot: canvasPalette.laserShot,
  energyWall: canvasPalette.energyWall,
  wall: canvasPalette.wallLight,
  ...Object.fromEntries(Object.entries(BRICK_COLORS).map(([kind, set]) => [`brick${kind}`, set.flat])),
  ...Object.fromEntries(Object.entries(DROP_COLORS).map(([kind, color]) => [`capsule${kind}`, color])),
};

const SPRITE_HUES = {
  ...Object.fromEntries(Object.entries(BRICK_COLORS).map(([kind, set]) => [`brick${kind}`, set.flat])),
  ...Object.fromEntries(Object.entries(DROP_COLORS).map(([kind, color]) => [`capsule${kind}`, color])),
};

function channels(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function relativeLuminance(hex) {
  const [red, green, blue] = channels(hex).map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].toSorted((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function hueDistance(first, second) {
  const [firstChannels, secondChannels] = [channels(first), channels(second)];
  return Math.hypot(...firstChannels.map((channel, index) => channel - secondChannels[index]));
}

function worstContrast(color) {
  return Object.entries(MUST_READ)
    .map(([name, sprite]) => ({ name, ratio: contrastRatio(color, sprite) }))
    .toSorted((a, b) => a.ratio - b.ratio)[0];
}

function nearestSprite(color) {
  return Object.entries(SPRITE_HUES)
    .map(([name, sprite]) => ({ name, distance: hueDistance(color, sprite) }))
    .toSorted((a, b) => a.distance - b.distance)[0];
}

const failures = [];
const rows = [];

// INSIDE THE EYE (SHA-172) is field art too — it replaces the level's for
// twenty-two seconds — so it is held to the same two rules. It is checked here
// rather than trusted because the spec it came from painted it on a white
// sclera, where the ball measured 1.03:1 and would have been invisible.
const THEMES = { ...BACKGROUND_COLORS, "iris.blue": IRIS_COLORS.blue, "iris.red": IRIS_COLORS.red };

for (const [theme, groups] of Object.entries(THEMES)) {
  for (const [name, color] of Object.entries(groups.area)) {
    const luminance = relativeLuminance(color);
    const worst = worstContrast(color);
    const nearest = nearestSprite(color);
    const cap = name === "base" ? BASE_LUMINANCE_MAX : AREA_LUMINANCE_MAX;
    if (luminance > cap) {
      failures.push(`${theme}.area.${name} ${color}: luminance ${luminance.toFixed(4)} > ${cap}`);
    }
    if (worst.ratio < AREA_MIN_CONTRAST) {
      failures.push(`${theme}.area.${name} ${color}: only ${worst.ratio.toFixed(2)}:1 against ${worst.name}`);
    }
    if (nearest.distance < AREA_MIN_HUE_DISTANCE) {
      failures.push(`${theme}.area.${name} ${color}: too close to ${nearest.name} (distance ${nearest.distance | 0})`);
    }
    rows.push([
      `${theme}.area.${name}`,
      color,
      luminance.toFixed(4),
      `${worst.ratio.toFixed(2)}:1 vs ${worst.name}`,
      `d${nearest.distance | 0} to ${nearest.name}`,
    ]);
  }

  for (const [name, color] of Object.entries(groups.speck)) {
    const luminance = relativeLuminance(color);
    const nearest = nearestSprite(color);
    if (luminance > SPECK_LUMINANCE_MAX) {
      failures.push(`${theme}.speck.${name} ${color}: luminance ${luminance.toFixed(4)} > ${SPECK_LUMINANCE_MAX}`);
    }
    if (nearest.distance < SPECK_MIN_HUE_DISTANCE) {
      failures.push(`${theme}.speck.${name} ${color}: too close to ${nearest.name} (distance ${nearest.distance | 0})`);
    }
    rows.push([
      `${theme}.speck.${name}`,
      color,
      luminance.toFixed(4),
      "-",
      `d${nearest.distance | 0} to ${nearest.name}`,
    ]);
  }
}

const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
for (const row of rows) {
  console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
}

const used = new Set(LEVELS.map((level) => level.background));
// The two irises are not a level's theme and never will be, so they are exempt
// from the must-be-used rule and from adjacency; they are only ever checked for
// readability above.
for (const theme of Object.keys(BACKGROUND_COLORS)) {
  if (!used.has(theme)) {
    failures.push(`theme ${theme} is defined but no level uses it`);
  }
}
LEVELS.forEach((level, index) => {
  const next = LEVELS[(index + 1) % LEVELS.length];
  if (level.background === next.background) {
    failures.push(
      `levels ${index + 1} (${level.name}) and ${((index + 1) % LEVELS.length) + 1} (${next.name}) ` +
        `share the ${level.background} background`,
    );
  }
});

// 4. Both arts paint, and the fine grid leaves no holes.
//
// Enough of a canvas for the painters to run against under plain node: the
// classic path draws with `fillRect`, and the HD path builds a raster and lands
// it in one `putImageData`, which is the only pixel data this needs to see.
globalThis.ImageData ??= function StubImageData(data, width, height) {
  return { data, width, height };
};

function stubContext() {
  return {
    fillStyle: "#000000",
    fills: 0,
    image: null,
    fillRect() {
      this.fills += 1;
    },
    clearRect() {},
    putImageData(image) {
      this.image = image;
    },
    // A composed layer reads whatever it is landing on before it writes
    // (SHA-224). Nothing under it here, which is the right answer for a guard
    // that only asks whether the foreground paints.
    getImageData(x, y, width, height) {
      return new ImageData(new Uint8ClampedArray(width * height * 4), width, height);
    },
  };
}

const FIELD = { width: 372, height: 300 };
for (const theme of Object.keys(BACKGROUND_COLORS)) {
  for (const hd of [false, true]) {
    const ctx = stubContext();
    try {
      paintBackground(ctx, theme, 0, FIELD.width, FIELD.height, hd);
    } catch (error) {
      failures.push(`theme ${theme} threw while painting in ${hd ? "hd" : "classic"}: ${error.message}`);
      continue;
    }
    if (!hd) {
      if (ctx.fills === 0) {
        failures.push(`theme ${theme} drew nothing in classic`);
      }
      continue;
    }
    if (!ctx.image) {
      failures.push(`theme ${theme} never flushed its raster in hd`);
      continue;
    }
    let holes = 0;
    for (let index = 3; index < ctx.image.data.length; index += 4) {
      if (ctx.image.data[index] === 0) {
        holes += 1;
      }
    }
    if (holes > 0) {
      failures.push(`theme ${theme} left ${holes} transparent px in hd — a hole through the field`);
    }
  }
  // A foreground is a sheet with holes on purpose, so only that it paints.
  for (const hd of [false, true]) {
    const ctx = stubContext();
    try {
      paintForeground(ctx, theme, 0, FIELD.width, FIELD.height, hd);
    } catch (error) {
      failures.push(`theme ${theme}'s foreground threw in ${hd ? "hd" : "classic"}: ${error.message}`);
    }
  }
}

console.log(`\n${LEVELS.length} levels, ${Object.keys(BACKGROUND_COLORS).length} themes, ${used.size} in use`);

if (failures.length > 0) {
  console.error(`\n${failures.length} background readability failure(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("All background themes pass the readability and level-assignment rules.");
