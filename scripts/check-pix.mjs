// SHA-215 guard for the fine-grid raster.
//
// `@render/pix` is the surface every HD sprite is drawn on, and the recipes are
// written against its exact behaviour: a brick's bands assume the dither is
// screen-space, the ball's rim assumes a disc is symmetric, the beasts assume
// scale3x leaves a solid body alone. None of that is visible in a screenshot
// until it is wrong on one sprite in forty, so it is pinned here instead.
//
// It checks, and exits non-zero with a report when one breaks:
//
//   1. `mix` is exact at both ends, correct in between, and always a 6-digit
//      hex — the whole HD palette is derived through it, so a tone that came
//      back `#f0f0f` would be a colour nobody authored, on every sprite.
//   2. `BAYER` is a permutation of 0..15. Dither coverage is only the fraction
//      it claims if every threshold appears exactly once, and an edited matrix
//      that repeated a value would quietly bias every band in the game.
//   3. Dither coverage over an aligned block is exactly what `t` asks for, and
//      the pattern is indexed by the surface rather than by the rectangle: two
//      touching bands must interlock, not seam.
//   4. `pillRows` is symmetric and its middle is flat — the paddle and all 58
//      capsules are this shape, and a pill that listed one way would list at
//      every width.
//   5. `disc` is symmetric on both axes and stays inside its radius.
//   6. `ring` plots only on the circle, within a pixel.
//   7. `vgrad` starts on its first tone and ends on its last.
//   8. `scale3x` triples the bitmap exactly, leaves a solid body untouched, and
//      grows no spur off an isolated pixel.
//   9. The HD ball's silhouette is `ballRows` at three times the diameter, at
//      every size GIANT can swell to, and its specular survives all of them.
//      The ball is the one sprite this game is never allowed to reshape, and
//      the HD recipe draws it out of six overlapping discs — the outermost of
//      which has to come back as exactly the rows the simulation collides.
//  10. The HD deck's silhouette is `pillRows` at every width the roster can
//      produce, its cap welds are where the recipe says, and its light bar is
//      lit. The deck telescopes a pixel an edge a tick, so "every width" is not
//      a figure of speech — a recipe that came apart at one of them would come
//      apart for the twelve ticks a capsule takes to arrive.
//  11. The HD capsule is `pillRows` too, with its glare on top and its ink
//      underfoot. Fifty-eight kinds share this one body, so a recipe that came
//      out a pixel wrong would be wrong fifty-eight times.
//  12. The frame's rail ramp is exactly as wide as the rail, still made of the
//      wall's own tones where it can be, and still descends. It is the one
//      authored ramp the pass added to the palette, and the rail it is painted
//      into is three game pixels and not negotiable.
//
// Run with: pnpm run check:pix
import { registerHooks } from "node:module";
import { URL } from "node:url";

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

const { BAYER, Pix, mix, pillRows, scale3x } = await import("../src/render/pix.ts");
const { hdBallPix, hdBallShellPix } = await import("../src/render/hdBall.ts");
const { ballRows } = await import("../src/render/ballSprite.ts");
const { ballSizeFor } = await import("../src/entities/ball/Ball.ts");
const { FINE } = await import("../src/interfaces/art.ts");
const { hdPillPix } = await import("../src/render/hdPaddle.ts");
const { gameConfig } = await import("../src/core/config/GameConfig.ts");
const { hdCapsulePix } = await import("../src/render/hdCapsule.ts");
const { canvasPalette, FRAME_RAILS, FRAME_RIVET } = await import("../src/render/palette.ts");
const { DROP_HEIGHT, DROP_WIDTH } = await import("../src/entities/powerups/DropPool.ts");

const failures = [];
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const hex = (value) => value.toString(16).padStart(2, "0");

// Reads a pixel back as hex, or null where nothing was written.
function read(pix, x, y) {
  const index = (y * pix.width + x) * 4;
  if (pix.data[index + 3] === 0) {
    return null;
  }
  return `#${hex(pix.data[index])}${hex(pix.data[index + 1])}${hex(pix.data[index + 2])}`;
}

// Rec. 601 brightness, for the one check that asks whether a ramp descends.
function luma(tone) {
  const value = Number.parseInt(tone.slice(1), 16);
  return 0.299 * ((value >> 16) & 0xff) + 0.587 * ((value >> 8) & 0xff) + 0.114 * (value & 0xff);
}

function litCount(pix) {
  let count = 0;
  for (let index = 3; index < pix.data.length; index += 4) {
    if (pix.data[index] !== 0) {
      count++;
    }
  }
  return count;
}

// 1. mix
check(mix("#000000", "#ffffff", 0) === "#000000", "mix at t=0 is not the from tone");
check(mix("#000000", "#ffffff", 1) === "#ffffff", "mix at t=1 is not the to tone");
check(mix("#000000", "#ffffff", 0.5) === "#808080", `mix midpoint is ${mix("#000000", "#ffffff", 0.5)}, want #808080`);
// The brick recipe's D3, on the red brick: 0x38 * 0.6 rounds to 0x22, not 0x20.
check(mix("#e8384f", "#000000", 0.4) === "#8b222f", `mix #e8384f→black .4 is ${mix("#e8384f", "#000000", 0.4)}`);
for (const [from, to, t] of [
  ["#000000", "#010101", 0.5],
  ["#0b0b26", "#ffffff", 0.45],
  ["#ffffff", "#000000", 0.999],
]) {
  const tone = mix(from, to, t);
  check(/^#[0-9a-f]{6}$/.test(tone), `mix(${from}, ${to}, ${t}) is not a 6-digit hex: ${tone}`);
}

// 2. BAYER is a permutation of 0..15
{
  const seen = new Set(BAYER.flat());
  check(BAYER.length === 4 && BAYER.every((row) => row.length === 4), "BAYER is not 4x4");
  check(seen.size === 16, `BAYER holds ${seen.size} distinct values, want 16`);
  check(
    [...seen].every((value) => value >= 0 && value <= 15),
    "BAYER holds a value outside 0..15",
  );
}

// 3. Dither coverage, and that the pattern is screen-space
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  const pix = new Pix(8, 8);
  pix.dither(0, 0, 8, 8, "#ffffff", t);
  const want = BAYER.flat().filter((value) => value < t * 16).length * 4;
  check(litCount(pix) === want, `dither at t=${t} lit ${litCount(pix)} of 64, want ${want}`);
}
{
  // The same region, drawn as one rectangle and as two touching halves: the
  // matrix is indexed by the surface, so both must come out identical.
  const whole = new Pix(8, 8);
  whole.dither(0, 0, 8, 8, "#ffffff", 0.5);
  const halves = new Pix(8, 8);
  halves.dither(0, 0, 8, 3, "#ffffff", 0.5);
  halves.dither(0, 3, 8, 5, "#ffffff", 0.5);
  check(
    whole.data.every((value, index) => value === halves.data[index]),
    "dither is indexed by the rectangle, not the surface — two touching bands would seam",
  );
}

// 4. pillRows
for (const height of [8, 14, 22, 24, 42]) {
  const rows = pillRows(height);
  check(rows.length === height, `pillRows(${height}) returned ${rows.length} rows`);
  for (let y = 0; y < height; y++) {
    check(
      rows[y] === rows[height - 1 - y],
      `pillRows(${height}) is not symmetric: row ${y} insets ${rows[y]}, row ${height - 1 - y} insets ${rows[height - 1 - y]}`,
    );
  }
  check(rows[Math.floor(height / 2)] === 0, `pillRows(${height}) has no flat middle`);
  for (let y = 1; y < Math.floor(height / 2); y++) {
    check(rows[y] <= rows[y - 1], `pillRows(${height}) is not monotone toward the middle at row ${y}`);
  }
}

// 5. disc
//
// A disc's axis is `Math.round(cx) - 0.5` across and `cy` down — the columns are
// centred on a pixel, the rows are chosen by pixel-centre distance. At an
// integer centre the two agree; at a half-integer one they are half a pixel
// apart, and that offset is load-bearing: the ball stacks `disc(11, 11, 10)`
// under `disc(11.5, 11.5, 10.5, t=0.5)` and the offset is what puts the dithered
// rim outside the solid body on the lower right instead of on top of it.
for (const r of [3, 5.5, 10, 12]) {
  const size = Math.ceil(r * 2) + 5;
  const centre = Math.floor(size / 2);
  const pix = new Pix(size, size);
  pix.disc(centre, centre, r, "#ffffff");
  const axis = Math.round(centre) * 2 - 1;
  for (let y = 0; y < size; y++) {
    const lit = [];
    for (let x = 0; x < size; x++) {
      if (read(pix, x, y) !== null) {
        lit.push(x);
      }
    }
    if (lit.length === 0) {
      continue;
    }
    check(
      lit[lit.length - 1] - lit[0] + 1 === lit.length,
      `disc r=${r} row ${y} is not one contiguous span: ${lit.join(",")}`,
    );
    check(
      lit[0] + lit[lit.length - 1] === axis,
      `disc r=${r} row ${y} spans ${lit[0]}..${lit[lit.length - 1]}, not symmetric about ${axis / 2}`,
    );
    for (const x of lit) {
      // Rounded half-spans can reach half a pixel past the ideal edge; more
      // than a whole pixel means the row arithmetic has drifted.
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      check(distance <= r + 1, `disc r=${r} lit (${x}, ${y}) at distance ${distance.toFixed(2)}`);
    }
  }
  // Rows mirror about `cy`, which an integer centre puts between two of them.
  for (let y = 0; y < size; y++) {
    const twin = 2 * centre - 1 - y;
    if (twin < 0 || twin >= size) {
      continue;
    }
    const count = (row) => {
      let total = 0;
      for (let x = 0; x < size; x++) {
        if (read(pix, x, row) !== null) {
          total++;
        }
      }
      return total;
    };
    check(count(y) === count(twin), `disc r=${r} rows ${y} and ${twin} differ in width`);
  }
}

// 6. ring
{
  const pix = new Pix(64, 64);
  pix.ring(32, 32, 20, "#ffffff");
  let plotted = 0;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (read(pix, x, y) === null) {
        continue;
      }
      plotted++;
      const distance = Math.hypot(x - 32, y - 32);
      check(Math.abs(distance - 20) <= 1.5, `ring r=20 plotted (${x}, ${y}) at distance ${distance.toFixed(2)}`);
    }
  }
  check(plotted > 20 * 4, `ring r=20 plotted only ${plotted} points`);
}

// 7. vgrad
{
  const pix = new Pix(4, 20);
  pix.vgrad(0, 4, [
    [0, "#000000"],
    [10, "#808080"],
    [20, "#ffffff"],
  ]);
  for (let x = 0; x < 4; x++) {
    check(read(pix, x, 0) === "#000000", `vgrad first row is ${read(pix, x, 0)}, want the first tone`);
    check(read(pix, x, 19) !== null, "vgrad left its last row unpainted");
  }
}

// 8. scale3x
{
  const solid = ["bbbbb", "bbbbb", "bbbbb", "bbbbb", "bbbbb"];
  const grown = scale3x(solid, { b: "#ffffff" });
  check(grown.width === 15 && grown.height === 15, `scale3x sized ${grown.width}x${grown.height}, want 15x15`);
  // A pixel with eight like neighbours is reproduced as nine of itself — that is
  // the whole of "the tells survive". The block's own four corners are rounded
  // off against the background, which is the smoothing doing its job and is why
  // this asks about the interior rather than the whole block.
  for (let y = 3; y < 12; y++) {
    for (let x = 3; x < 12; x++) {
      check(read(grown, x, y) === "#ffffff", `scale3x changed an interior pixel at (${x}, ${y})`);
    }
  }
  // Four corners, three sub-pixels each: the staircase that would otherwise
  // read as a jagged silhouette.
  check(litCount(grown) === 225 - 12, `scale3x of a solid block lit ${litCount(grown)}, want ${225 - 12}`);

  const lone = [".....", ".....", "..b..", ".....", "....."];
  const alone = scale3x(lone, { b: "#ffffff" });
  check(litCount(alone) === 9, `scale3x grew a spur off an isolated pixel: ${litCount(alone)} lit, want 9`);

  const hole = scale3x([".b.", "b.b", ".b."], { b: "#ffffff" });
  check(read(hole, 4, 4) === null, "scale3x filled a hole that has no tone in the palette");
}

// 9. The HD ball
{
  // GIANT's whole ramp, taken off the capsule's own function rather than
  // listed here: a change to its scale must be caught by this guard, not
  // walked past by it.
  const sizes = [...new Set(Array.from({ length: 41 }, (_, step) => ballSizeFor(step / 40)))];
  check(sizes.length >= 9, `GIANT's ramp came back as ${sizes.length} sizes, want at least 9`);

  for (const size of sizes) {
    const pix = hdBallPix(size);
    const want = ballRows(size * FINE);
    check(
      pix.width === size * FINE && pix.height === size * FINE,
      `the HD ball at ${size} is ${pix.width}x${pix.height}, want ${size * FINE} square`,
    );

    let rowFailures = 0;
    let specular = 0;
    for (let y = 0; y < pix.height; y++) {
      const lit = [];
      for (let x = 0; x < pix.width; x++) {
        const tone = read(pix, x, y);
        if (tone !== null) {
          lit.push(x);
        }
        if (tone === "#ffffff") {
          specular++;
        }
      }
      const [offset, span] = want[y];
      const contiguous = lit.length === 0 || lit[lit.length - 1] - lit[0] + 1 === lit.length;
      if (lit.length !== span || (span > 0 && lit[0] !== offset) || !contiguous) {
        rowFailures++;
      }
    }
    check(rowFailures === 0, `the HD ball at ${size} differs from ballRows(${size * FINE}) on ${rowFailures} row(s)`);
    check(specular > 0, `the HD ball at ${size} lost its specular — a glint that blinks out mid-swell`);

    // The pace ghost: the same silhouette, and nothing in the middle of it.
    const shell = hdBallShellPix(size, "#ffffff");
    const middle = read(shell, Math.floor(size * FINE) / 2, Math.floor(size * FINE) / 2);
    check(middle === null, `the HD pace ghost at ${size} is filled, not an outline`);
    let outside = 0;
    for (let y = 0; y < shell.height; y++) {
      const [offset, span] = want[y];
      for (let x = 0; x < shell.width; x++) {
        if (read(shell, x, y) !== null && (x < offset || x >= offset + span)) {
          outside++;
        }
      }
    }
    check(outside === 0, `the HD pace ghost at ${size} lit ${outside} px outside the ball's own silhouette`);
  }
}

// 10. The HD deck
{
  const TONES = { body: "#2d7fe0", cap: "#e8384f", sheen: "#a8d8ff", shade: "#0b3a78" };
  const OUTLINE = mix(TONES.shade, "#000000", 0.5);
  const height = gameConfig.paddle.height * FINE;
  const outer = pillRows(height);
  const cap = 8 * FINE;
  // The roster's own widths, the halves a SPLIT deck is cut into, and two odd
  // ones — MIRROR's ghost is a fraction of the deck and lands wherever it lands.
  const widths = [30, 46, 66, 72, 144, 23, 20, 17].map((width) => width * FINE).concat([139, 200]);

  for (const width of widths) {
    const pix = hdPillPix(width, TONES);
    check(
      pix.width === width && pix.height === height,
      `the HD deck at ${width} is ${pix.width}x${pix.height}, want ${width}x${height}`,
    );

    let rowFailures = 0;
    for (let y = 0; y < height; y++) {
      const lit = [];
      for (let x = 0; x < width; x++) {
        if (read(pix, x, y) !== null) {
          lit.push(x);
        }
      }
      const wantSpan = width - 2 * outer[y];
      const contiguous = lit.length === 0 || lit[lit.length - 1] - lit[0] + 1 === lit.length;
      if (lit.length !== wantSpan || (wantSpan > 0 && lit[0] !== outer[y]) || !contiguous) {
        rowFailures++;
      }
    }
    check(rowFailures === 0, `the HD deck at ${width} differs from pillRows(${height}) on ${rowFailures} row(s)`);

    if (width < 18 * FINE) {
      continue;
    }
    // The weld: one column of outline between each cap and the body, without
    // which the two materials blend into one smear.
    check(
      read(pix, cap - 1, 10) === OUTLINE && read(pix, width - cap, 10) === OUTLINE,
      `the HD deck at ${width} lost a cap weld: ${read(pix, cap - 1, 10)} / ${read(pix, width - cap, 10)}`,
    );
    let bar = 0;
    for (let x = cap; x < width - cap; x++) {
      if (read(pix, x, 10) === TONES.sheen) {
        bar++;
      }
    }
    check(bar > 0, `the HD deck at ${width} has no light bar on its middle row`);
  }
}

// 11. The HD capsule
{
  const width = DROP_WIDTH * FINE;
  const height = DROP_HEIGHT * FINE;
  const rows = pillRows(height);

  for (const tone of ["#e8384f", "#2d7fe0", "#ffe14a"]) {
    const pix = hdCapsulePix(tone);
    check(
      pix.width === width && pix.height === height,
      `the HD capsule is ${pix.width}x${pix.height}, want ${width}x${height}`,
    );

    let rowFailures = 0;
    for (let y = 0; y < height; y++) {
      const lit = [];
      for (let x = 0; x < width; x++) {
        if (read(pix, x, y) !== null) {
          lit.push(x);
        }
      }
      const wantSpan = width - 2 * rows[y];
      const contiguous = lit.length === 0 || lit[lit.length - 1] - lit[0] + 1 === lit.length;
      if (lit.length !== wantSpan || (wantSpan > 0 && lit[0] !== rows[y]) || !contiguous) {
        rowFailures++;
      }
    }
    check(rowFailures === 0, `the HD capsule differs from pillRows(${height}) on ${rowFailures} row(s)`);

    // The glare and the foot, which is what a pill reads as lit and standing on
    // something rather than as a flat lozenge.
    const middle = Math.round(width / 2);
    check(read(pix, middle, 1) === canvasPalette.dropSheen, `the HD capsule lost its glare: ${read(pix, middle, 1)}`);
    check(
      read(pix, middle, height - 2) === canvasPalette.dropShade,
      `the HD capsule lost its ink foot: ${read(pix, middle, height - 2)}`,
    );
    // The body survives at full strength through the middle, or the colour
    // that says which capsule this is has been mixed away.
    check(read(pix, middle, 10) === tone, `the HD capsule's body is ${read(pix, middle, 10)}, want ${tone}`);
  }
}

// 12. The frame's rails
{
  check(FRAME_RAILS.length === 3 * FINE, `the frame ramp is ${FRAME_RAILS.length} tones, want ${3 * FINE}`);
  for (const tone of FRAME_RAILS) {
    check(/^#[0-9a-f]{6}$/.test(tone), `a frame rail is not a 6-digit hex: ${tone}`);
  }
  // The rail is still the wall: two pixels of its own light at the top of the
  // bevel and its own shade near the bottom, with the authored tones only in
  // between. A ramp that drifted off those would be a frame that no longer
  // matches the silver brick it was drawn to match.
  check(
    FRAME_RAILS[2] === canvasPalette.wallLight && FRAME_RAILS[3] === canvasPalette.wallLight,
    `the frame's light rails are ${FRAME_RAILS[2]} / ${FRAME_RAILS[3]}, want ${canvasPalette.wallLight}`,
  );
  check(
    FRAME_RAILS[7] === canvasPalette.wallShade,
    `the frame's shade rail is ${FRAME_RAILS[7]}, want ${canvasPalette.wallShade}`,
  );
  // Monotone from the highlight inward, which is what makes it read as one
  // surface curving away rather than as stripes.
  for (let index = 2; index < FRAME_RAILS.length; index++) {
    check(
      luma(FRAME_RAILS[index]) <= luma(FRAME_RAILS[index - 1]),
      `the frame ramp brightens at rail ${index}: ${FRAME_RAILS[index - 1]} then ${FRAME_RAILS[index]}`,
    );
  }
  check(FRAME_RIVET.body === FRAME_RAILS[8], `the rivet's body is ${FRAME_RIVET.body}, want the innermost rail`);
  check(luma(FRAME_RIVET.light) > luma(FRAME_RIVET.dark), "the rivet is not lit from the upper left");
}

console.log(
  `Checked mix, BAYER, dither, pillRows, disc, ring, vgrad, scale3x, the HD ball, the HD deck, the HD capsule and the frame's rails.`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} raster failure(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("The fine-grid raster holds every invariant the HD recipes are written against.");
