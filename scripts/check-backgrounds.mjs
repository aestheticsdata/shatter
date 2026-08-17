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

const { BACKGROUND_COLORS } = await import("../src/render/backgrounds.ts");
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

for (const [theme, groups] of Object.entries(BACKGROUND_COLORS)) {
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

console.log(`\n${LEVELS.length} levels, ${Object.keys(BACKGROUND_COLORS).length} themes, ${used.size} in use`);

if (failures.length > 0) {
  console.error(`\n${failures.length} background readability failure(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("All background themes pass the readability and level-assignment rules.");
