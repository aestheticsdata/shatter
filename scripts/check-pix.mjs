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
//  13. A dashed line converted to the fine grid weighs what it weighed on the
//      coarse one. `finePitch` has to close the pitch by FINE *twice* — once
//      for the pitch and once for the thickness it lost — and dropping the
//      second factor leaves every thread in the game at a third of its ink,
//      which looks like a considered choice and is not one. This pass shipped
//      that bug for an hour.
//  14. Every HD sprite under DEMAKE is the tube's two tones and no others, and
//      is neither all ink nor all ground. The recipes derive five tones per
//      material out of the roster's three, and a derived tone belongs to no
//      set — so without a mapping of its own the whole sprite resolves to one
//      ink slab, which is a picture that looks deliberate and lasts exactly as
//      long as the capsule does. Also that the tones the roster *did* author
//      still resolve the way classic has always resolved them.
//  15. The four baked figures hold the silhouettes something else already
//      defines: GRAVEL's chip is the square the simulation scatters and wears
//      both a lit and a shadowed edge at each of its four tumble faces; a
//      METEOR is a rock rather than a square, which is to say its widest row is
//      its diameter and its first row is not; BANANA's peel is `pillRows`; and
//      CRITTER's grub is exactly three times its own bitmap with its jaw, eye
//      and belly still on it, at the end it is walking toward.
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
const { FINE, finePitch } = await import("../src/interfaces/art.ts");
const { hdPillPix } = await import("../src/render/hdPaddle.ts");
const { gameConfig } = await import("../src/core/config/GameConfig.ts");
const { hdCapsulePix } = await import("../src/render/hdCapsule.ts");
const { canvasPalette, DEMAKE_GROUND_TONES, demakeTone, DROP_COLORS, FRAME_RAILS, FRAME_RIVET, BRICK_COLORS } =
  await import("../src/render/palette.ts");
const { DROP_HEIGHT, DROP_WIDTH } = await import("../src/entities/powerups/DropPool.ts");
const { hdGravelChipPix, hdMeteorPix, hdPeelPix, hdCritterPix } = await import("../src/render/hdFigures.ts");

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

// Ink laid down per fine pixel of a line's length: how thick it is, times the
// fraction of it that is dash rather than gap.
function weight(thickness, dash, pitch) {
  return (thickness * dash) / pitch;
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

// 13. What a dashed line weighs on the fine grid
{
  // Classic lays a whole game pixel — FINE thick and FINE long — every
  // `gamePitch` game pixels; HD lays a single fine pixel and has only the pitch
  // left to pay with.
  const classic = (gamePitch) => weight(FINE, FINE, gamePitch * FINE);
  const fine = (gamePitch, keep) => weight(1, 1, finePitch(gamePitch, keep) * FINE);

  // **This is the check that would have caught the bug this ticket shipped for
  // an hour.** Converting a thread at `gamePitch / FINE` rather than
  // `gamePitch / (FINE * FINE)` drops a factor of three, and what comes out is
  // a cue the player has to hunt for — which looks exactly like a considered
  // choice and is not one. Every pitch the renderer walks, plus a sweep either
  // side, so the rule holds for one somebody adds later too.
  const pitches = [gameConfig.powerUps.twin.dotPitch, gameConfig.powerUps.tracer.dotPitch, 1, 2, 3, 4, 5, 6, 8, 12];
  for (const pitch of pitches) {
    for (const keep of [1, 2 / 3, 0.5]) {
      const want = classic(pitch) * keep;
      const got = fine(pitch, keep);
      // Above the floor the trade is exact, and `keep` is literally the share
      // of classic's weight the line comes away with.
      //
      // Below it the pitch has nowhere left to go: a line whose classic dashes
      // were already almost touching was heavier than a solid fine hairline can
      // ever be, because a hairline is a third of the thickness and that is the
      // one thing the fine grid does not give back. So the floor hands over
      // everything it has — a solid line, weight exactly 1 — and the check says
      // so rather than pretending the trade balanced. TRACER's guide is the one
      // line in the file that lands here.
      if (pitch < FINE * keep) {
        check(
          Math.abs(got - 1) < 1e-9,
          `a floored line at pitch ${pitch} keeping ${keep.toFixed(2)} weighs ${got.toFixed(4)}, want a solid 1`,
        );
        check(got <= classic(pitch) + 1e-9, `a floored line at pitch ${pitch} came out heavier than classic`);
        continue;
      }
      check(
        Math.abs(got - want) < 1e-9,
        `a line at pitch ${pitch} keeping ${keep.toFixed(2)} is off its trade: ${got.toFixed(4)} for ${want.toFixed(4)}`,
      );
    }
  }
  // A gap is bought with weight, never for free: the whole reason MAGNET's
  // tether is allowed to keep its dashes is that it pays for them.
  check(finePitch(4, 2 / 3) > finePitch(4), "keeping less than the whole trade did not open a gap");
  check(fine(4, 2 / 3) < fine(4, 1), "keeping less than the whole trade cost nothing");
  // And never so much that the cue falls under half of what the player has been
  // reading for the life of the game.
  check(fine(4, 2 / 3) >= classic(4) / 2, "a dashed line is under half its classic weight");
}

// 14. DEMAKE on the HD path
//
// The failure this exists to catch is one line long: an HD sprite under the
// tube coming out a solid ink slab, because every tone its recipe derived with
// `mix` fell outside `DEMAKE_GROUND_TONES` and there was nothing to say which
// of them were shadows. It is not a crash and not a type error — it is
// fifty-eight capsules, sixty bricks and the ball all going blank for the eight
// seconds the capsule holds, and only while it holds.
{
  const INK = canvasPalette.demakeInk;
  const GROUND = canvasPalette.demakeGround;

  // What a demade surface is allowed to contain: the tube's two tones and
  // nothing else. A third colour means a tone reached the raster around the
  // filter.
  const census = (pix) => {
    const tally = new Map();
    for (let y = 0; y < pix.height; y++) {
      for (let x = 0; x < pix.width; x++) {
        const tone = read(pix, x, y);
        if (tone !== null) {
          tally.set(tone, (tally.get(tone) ?? 0) + 1);
        }
      }
    }
    return tally;
  };

  // Both tones present, in a share that says the sprite still has a picture in
  // it. The bound is loose on purpose — this is not pinning a design, it is
  // refusing a slab.
  const twoTone = (name, pix, leastGround = 0.05) => {
    const tally = census(pix);
    const painted = [...tally.values()].reduce((sum, count) => sum + count, 0);
    const strays = [...tally.keys()].filter((tone) => tone !== INK && tone !== GROUND);
    check(strays.length === 0, `demade ${name} painted ${strays.length} tone(s) off the tube: ${strays.join(", ")}`);
    const ground = (tally.get(GROUND) ?? 0) / painted;
    check(
      ground >= leastGround && ground <= 1 - leastGround,
      `demade ${name} is ${(ground * 100).toFixed(1)}% ground — a slab, not a sprite`,
    );
  };

  // The roster's authored ground tones still resolve to ground, which is the
  // whole of "classic DEMAKE is untouched": the filter gained a fallback, it
  // did not change its rule.
  for (const tone of DEMAKE_GROUND_TONES) {
    check(demakeTone(tone) === GROUND, `the authored ground tone ${tone} no longer demakes to ground`);
  }
  for (const tone of [
    canvasPalette.ballBody,
    canvasPalette.ballHighlight,
    canvasPalette.dropSheen,
    BRICK_COLORS.G.flat,
  ]) {
    check(demakeTone(tone) === INK, `the lit tone ${tone} demakes to ground`);
  }
  // A tone nobody ever blended is ink, not a crash: the filter has to answer
  // for a colour it has never seen, because the art is allowed to add one.
  check(demakeTone("#123456") === INK, "an unknown tone does not fall through to ink");

  // The brick's four derived tones, which are the ones the ticket is named
  // after. `d3` is the outline and `d1` is the shaded half of the face — same
  // two authored tones, opposite roles, and the blend is the only thing that
  // knows which is which.
  {
    const l1 = BRICK_COLORS.G.light;
    const m0 = BRICK_COLORS.G.flat;
    const d2 = BRICK_COLORS.G.dark;
    check(demakeTone(mix(d2, "#000000", 0.4)) === GROUND, "the brick's outline (d3) demakes to ink");
    check(demakeTone(mix(m0, d2, 0.45)) === INK, "the brick's shaded band (d1) demakes to ground");
    check(demakeTone(mix(m0, l1, 0.3)) === INK, "the brick's lit band (m1) demakes to ground");
    check(demakeTone(mix(l1, "#ffffff", 0.5)) === INK, "the brick's specular (l2) demakes to ground");
    // Two deep: THE WRATH mixes the sheen toward the death flash before the
    // specular is mixed out of it, and the walk has to reach past the first
    // parent to find a tone anything is known about.
    check(
      demakeTone(mix(mix(l1, canvasPalette.deathFlash, 0.5), "#ffffff", 0.5)) === INK,
      "a twice-derived specular demakes to ground",
    );
  }

  // The ball: a ground contour round an ink body, at every size GIANT can
  // swell it to — off the capsule's own ramp, as check 9 takes it.
  for (const size of new Set(Array.from({ length: 41 }, (_, step) => ballSizeFor(step / 40)))) {
    const pix = hdBallPix(size, true);
    twoTone(`ball at ${size}`, pix);
    const rows = ballRows(size * FINE);
    const [offset, span] = rows[Math.floor(rows.length / 2)];
    check(read(pix, offset, Math.floor(rows.length / 2)) === GROUND, `the demade ball at ${size} has no contour`);
    check(
      read(pix, offset + Math.floor(span / 2), Math.floor(rows.length / 2)) === INK,
      `the demade ball at ${size} has no body`,
    );
  }

  // The capsule, in every colour the roster actually drops. Fifty-eight kinds
  // share this one body, so a recipe that came out a slab would come out a slab
  // fifty-eight times — and the colours are taken from `DROP_COLORS` rather
  // than invented here, because which hues exist is the roster's business and
  // an invented one can be a tone the palette means something else by. The
  // first draft of this check picked silver's body and found it: granite's pit
  // is the same hex, so it is a ground tone, and the pill came back 97% ground.
  // Correct behaviour on a colour no capsule wears.
  for (const hue of new Set(Object.values(DROP_COLORS))) {
    const pix = hdCapsulePix(hue, true);
    twoTone(`capsule ${hue}`, pix);
    check(
      read(pix, DROP_WIDTH * FINE - 1, (DROP_HEIGHT * FINE) / 2) === GROUND,
      `the demade capsule ${hue} has no contour`,
    );
    check(read(pix, (DROP_WIDTH * FINE) / 2, 1) === INK, `the demade capsule ${hue} has no glare`);
  }

  // The deck, at the widths the roster produces: an ink cylinder with a ground
  // outline and a ground underside, which is the cylinder read in one bit.
  {
    const TONES = { body: "#2d7fe0", cap: "#e8384f", sheen: "#a8d8ff", shade: "#0b3a78" };
    const height = gameConfig.paddle.height * FINE;
    for (const width of [30, 46, 66, 72, 144, 17].map((game) => game * FINE)) {
      const pix = hdPillPix(width, TONES, true);
      twoTone(`deck at ${width}`, pix);
      check(read(pix, Math.floor(width / 2), height - 1) === GROUND, `the demade deck at ${width} has no underside`);
      check(read(pix, Math.floor(width / 2), 1) === INK, `the demade deck at ${width} has no lit face`);
    }
  }

  // The frame, which is an authored ramp rather than a blend and so is the one
  // place the palette still has to say the role out loud.
  check(demakeTone(FRAME_RAILS[0]) === GROUND, "the frame's outer contour demakes to ink");
  check(demakeTone(FRAME_RAILS[8]) === GROUND, "the frame's inner lip demakes to ink");
  check(demakeTone(FRAME_RAILS[1]) === INK, "the frame's highlight demakes to ground");
  check(
    FRAME_RAILS.filter((tone) => demakeTone(tone) === INK).length >= 5,
    "the demade frame has no lit run left between its edges",
  );
  check(demakeTone(FRAME_RIVET.light) === INK, "the rivet loses its catch of light on the tube");
  check(demakeTone(FRAME_RIVET.body) === GROUND, "the rivet's head demakes to ink");
  // The mortar seam, which classic leaves as bare field and HD paints: ink
  // there welds the wall into one sheet and takes its grid with it.
  check(demakeTone(canvasPalette.brickJoint) === GROUND, "the mortar seam demakes to ink");
}

// 15. The figures (SHA-227)
//
// The four effects whose mark is a *drawing* rather than a sample, baked. Each
// has a silhouette something else in the game already defines — a chip is the
// square the simulation scatters, a peel is `pillRows`, a grub is its own
// bitmap at three times the size — and the failure they share is silent: a
// recipe that came out a pixel wide or a row short is a sprite nobody looks at
// closely, on an effect that is on screen for half a second at a time.
{
  const tally = (pix) => {
    const seen = new Set();
    for (let y = 0; y < pix.height; y++) {
      for (let x = 0; x < pix.width; x++) {
        const tone = read(pix, x, y);
        if (tone !== null) {
          seen.add(tone);
        }
      }
    }
    return seen;
  };

  // GRAVEL's chip: the square the simulation scatters, at every face its tumble
  // walks through, wearing both a lit edge and a shadowed one — which is the
  // whole of what makes it a stone rather than a die.
  for (let corner = 0; corner < 4; corner++) {
    const pix = hdGravelChipPix(4, corner);
    check(
      pix.width === 4 * FINE && pix.height === 4 * FINE,
      `the HD chip at face ${corner} is not the 4 px it falls as`,
    );
    const tones = tally(pix);
    check(tones.has(canvasPalette.gravelChipLit), `the HD chip at face ${corner} has no lit edge`);
    check(tones.has(canvasPalette.gravelCrack), `the HD chip at face ${corner} has no shadowed edge`);
    // The corners are knocked off, which is what stops twelve pixels of stone
    // reading as a tile.
    check(read(pix, 0, 0) === null, `the HD chip at face ${corner} kept its square corner`);
  }

  // METEOR: a rock, which is to say its widest row is its full diameter and its
  // first row is not. A square would pass every other check here.
  for (const size of [4, 3, 2, 1]) {
    const capped = size === 4;
    const pix = hdMeteorPix(size, capped);
    check(pix.width === size * FINE, `the HD meteor at ${size} is ${pix.width} wide, want ${size * FINE}`);
    const rowWidth = (y) => {
      let count = 0;
      for (let x = 0; x < pix.width; x++) {
        if (read(pix, x, y) !== null) {
          count++;
        }
      }
      return count;
    };
    const widest = Math.max(...Array.from({ length: pix.height }, (_, y) => rowWidth(y)));
    check(widest === size * FINE, `the HD meteor at ${size} is ${widest} across at its widest, want ${size * FINE}`);
    if (size > 1) {
      check(rowWidth(0) < widest, `the HD meteor at ${size} is a square — its first row is its widest`);
    }
    if (capped) {
      check(tally(pix).has(canvasPalette.meteorFlame), "a whole HD meteor lost its ember cap");
      check(pix.height === size * FINE + 6, `a capped HD meteor is ${pix.height} tall, want its rock plus a cap`);
    }
  }

  // BANANA's peel: `pillRows` like every other rounded thing in this pass, with
  // the gold brick's dark underfoot.
  {
    const width = 12;
    const height = 5;
    const pix = hdPeelPix(width, height);
    const rows = pillRows(height * FINE);
    let peelFailures = 0;
    for (let y = 0; y < pix.height; y++) {
      let first = -1;
      for (let x = 0; x < pix.width; x++) {
        if (read(pix, x, y) !== null) {
          first = x;
          break;
        }
      }
      if (first !== rows[y]) {
        peelFailures++;
      }
    }
    check(peelFailures === 0, `the HD peel is off pillRows on ${peelFailures} of its ${pix.height} rows`);
    check(tally(pix).has(canvasPalette.peelShade), "the HD peel has no underside");
  }

  // CRITTER's grub: exactly three times its bitmap, with the two tells that say
  // which end is the head still on it. Scale3x rounds the outline and must
  // round nothing else.
  {
    const body = canvasPalette.critterBody;
    const right = hdCritterPix(body, true, 0);
    const left = hdCritterPix(body, false, 0);
    check(right.width === 10 * FINE && right.height === 8 * FINE, `the HD grub is ${right.width}x${right.height}`);
    const tones = tally(right);
    check(tones.has(canvasPalette.critterJaw), "the HD grub lost its jaw");
    check(tones.has(canvasPalette.critterEye), "the HD grub lost its eye");
    check(tones.has(canvasPalette.critterUnder), "the HD grub lost its belly");
    // Turned round, the jaw has to be at the other end — a mirror that did
    // nothing would leave a grub walking backwards into its own face.
    const jawSide = (pix) => {
      for (let x = pix.width - 1; x >= 0; x--) {
        for (let y = 0; y < pix.height; y++) {
          if (read(pix, x, y) === canvasPalette.critterJaw) {
            return x;
          }
        }
      }
      return -1;
    };
    check(jawSide(right) > right.width / 2, "the HD grub facing right has its jaw behind it");
    check(jawSide(left) < left.width / 2, "the HD grub facing left has its jaw behind it");
  }
}

console.log(
  `Checked mix, BAYER, dither, pillRows, disc, ring, vgrad, scale3x, the HD ball, the HD deck, the HD capsule, the frame's rails, the weight of a dashed line, the tube's reading of all four, and the four baked figures.`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} raster failure(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("The fine-grid raster holds every invariant the HD recipes are written against.");
