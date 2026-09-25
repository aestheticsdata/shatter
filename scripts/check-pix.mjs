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
//  16. THE OBSERVER's almond holds at the sockets that bracket the game's
//      fourteen. Every feature of it is a fraction of the socket with a floor
//      of one fine pixel, so the check is that the fractions come back as the
//      classic drawing exactly at THE VEIL — the 42 x 15 socket those numbers
//      were authored on — that none of them falls under a fine pixel at VORTEX,
//      which is hw 16, and that the ones the classic eye left absolute have
//      actually grown by SUNRISE, which is hw 150. This is the whole of why the
//      handoff's Part B could not be cut as drawn, so it is pinned rather than
//      left to a screenshot of one veil. Part B's iris and pupil ride on the
//      same rule, against THE VEIL's own discs rather than its socket, so those
//      two denominators are pinned to `observer.eye` as well.
//  17. THE OBSERVER's three states hold on the levels that actually carry them,
//      and each of the three spends the fine grid differently. THE TEAR's
//      tracks take the resolution — one fine pixel, thinner than the coarse
//      grid can draw — while the bead at the end keeps its whole game pixel,
//      because it is the thing a player has to find and burst. THE WRATH's
//      veins take a weight classic could not write down: two thirds of a game
//      pixel at THE VEIL, and more than a whole one on the 84 x 30 socket that
//      rages, which is the number the coarse grid had to round away. THE LID's
//      emptied socket takes a dither it had no room for, in nested almonds that
//      deepen inward, none of them solid and none of them reaching the rim.
//      Read off `LEVELS`, because none of the three states happens on the
//      socket the drawing was authored on.
//  18. A placed eye under full opacity survives the screen DEMAKE fades it
//      behind. The halftone's cell stayed a game pixel while the almond under
//      it went to thirds, so the screen is now three times coarser than the
//      thing it is cutting and can erase a mark rather than thin it: at one
//      dot in four the dropped columns run a whole cell wide, and anything
//      narrower than that can fall in the gap and be gone. Nothing in a
//      screenshot says which eye is missing on purpose. The rule is three
//      facts apart — a socket's size, its opacity and the floor of one fine
//      pixel — so it is pinned off `LEVELS` here instead of being trusted.
//  19. THE ZODIAC DIAL rules as a line on the fine grid and keeps its dash.
//      One dot per pixel of circumference lands two neighbours two pixels
//      apart wherever the rounding ties, and classic gets away with that
//      because its pen is three device pixels wide and covers the skip. A
//      hairline does not, so the circles are checked comparatively and in
//      device pixels: ruled three times as finely, none of them may leave a
//      wider hole than the block ring it replaces. The dash is the other
//      trap. It is a pitch measured along the circumference, and stepping the
//      circumference three times finer without taking both halves of the dash
//      with it leaves every graduation a third of its length on screen. This
//      is the one place in the pass that refuses `finePitch`, so the duty and
//      the run are pinned against classic's rather than against a formula.
//  20. THE BESTIARY bakes to the silhouette it was authored as. The strike
//      flash is the risk: classic paints it with an `override` keyed on the
//      source character, and after `scale3x` there are no source characters
//      left, so it becomes a palette instead — and a palette that gained an
//      entry for `.` would white the creature's *hole* as well as its body and
//      hand back a rectangle. So a whited sprite has to cover exactly the
//      pixels the plain one does, and the outline flash exactly the outline's.
//      Then the boss question the spec says to watch: a boss is its species
//      grown, and on a doubled bitmap every cell is a 2 x 2 block, so Scale3x
//      can end up spending its rounding on the doubling's own corners rather
//      than on the authored silhouette's — a boss that comes out softer than
//      its species instead of bigger came from there. And the frog's legs,
//      which are a bitmap drawn live rather than baked and have to be rounded
//      by the same algorithm or the creature is smooth above the hip.
//  21. THE VEIL's furniture gains time rather than size. The plaques are the
//      one place in this pass with no arithmetic to do — 20 x 14 game pixels
//      is already the handoff's 60 x 42 fine plate — so what is pinned here
//      are the two clocks. A star's twinkle had two arm lengths to switch
//      between and a switch is all a boolean can drive; in fine pixels it has
//      four, so it has to come back as a breath that rises and falls once per
//      period, never shorter than the star that ships and never longer than
//      the roster allows. The gate's march is the opposite complaint: its
//      cells never move at all on the coarse grid, only their tones, so the
//      light arrives four pixels at a time. On the fine grid the pattern
//      slides, and the check is that one cell really does have twelve places
//      to be inside it rather than one.
//  22. INSIDE THE EYE is a span walked in the wrong units. The chamber's iris
//      samples sixty game pixels of fibre sixty times and paints each sample
//      as a game pixel — a line one pixel wide, and on the fine grid a line
//      three fine pixels wide, which is a spoke. Thinning the mark is the
//      obvious half and the one a screenshot shows; the half it hides is that
//      a fine mark on a coarse walk is sixty dots three apart, a fibre that
//      has stopped being a line. Pinned as a gap: the largest step between two
//      consecutive samples, in fine pixels, which is one when the walk is in
//      the units it will be drawn in and three when it is not.
//      Then the thing a screenshot could never show — the sclera gains twenty
//      finer streaks in HD and not one of them may be drawn before the forty
//      veins that ship, because both arts draw from one seeded generator and
//      an extra call moves every vein after it. Same seed, same layout, or
//      `art split` is comparing two pictures instead of two drawings of one.
//  23. THE GAZE is two clocks and a hitbox, and the last of the pass. The
//      hatching inside the beam does not travel down it — it alternates
//      between two places three pixels apart, thirty times a second, which is
//      a shimmer rather than a current; the fine grid gives its seven-pixel
//      pitch twenty-one places and one fine pixel a frame. The charge ring is
//      the diadem's twinkle a third time: a ring closing over three quarters
//      of a second across a span that, on most of the game's sockets, is two
//      or three whole pixels wide, so the warning arrives in three jumps.
//      And the hitbox is the thing that must *not* move — `beamWidth` is what
//      the beam catches with, so the nest is pinned to it rather than around
//      it. The pupil's health bar is the one readout in this pass that goes
//      fine rather than keeping its game pixel, because it is read per hit
//      and not per frame; what is pinned is the cliff, one hit past the
//      deepest fight the game can currently deal.
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
const {
  EYE_AUTHORED,
  EYE_HALFTONE,
  EYE_HOLLOW,
  EYE_TEAR,
  EYE_VEIN_WEIGHT,
  almondHalf,
  almondLid,
  eyeFeature,
  halftoneKeep,
  hdIrisPix,
  hdPupilPix,
} = await import("../src/render/hdEye.ts");
const { LEVELS } = await import("../src/core/levels/levels.ts");
const { dialInked, dialSteps, dialUnit, dialWalk } = await import("../src/render/hdDial.ts");
const { FLASH, flashOf, hdBeastPix } = await import("../src/render/hdBeast.ts");
const { gateSlide, twinkleArm, twinkleSwell } = await import("../src/render/hdVeil.ts");
const { scale3xRows } = await import("../src/render/pix.ts");
const { SPECIES } = await import("../src/entities/creatures/species/index.ts");
const { paintRows } = await import("../src/entities/creatures/species/frog.ts");
const { BROOD_BITMAPS, BROOD_OUTLINE, broodPalette } = await import("../src/render/broodSprite.ts");
const { IRIS_COLORS, paintIris } = await import("../src/render/backgrounds.ts");
const { INSIDE_IRIS, bleedRadius, fibreAngle, fibreRadius, fibreSteps } = await import("../src/render/hdInside.ts");
const { BEAM_NEST, GAZE_BEAM, beamNestFits, chargeRadius, chargeSteps, rungSlide } = await import(
  "../src/render/hdGaze.ts"
);

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
// biome-ignore lint/complexity/noUselessLoneBlockStatements: every numbered check is its own block
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

  // THE OBSERVER's iris, which reaches the tube through no filter at all:
  // `EYE_TONES` picks the machine's tones itself, so what this pins is that the
  // *drawing* survives being handed two of them. Twenty-eight fibres in ink
  // over a ground body is the picture; twenty-eight fibres in ground over a
  // ground body is a disc with nothing in it, and nothing else would say so.
  {
    const TUBE = { body: GROUND, edge: INK, inner: GROUND };
    for (const radius of [14, 36, 144]) {
      const pix = hdIrisPix(TUBE, radius);
      twoTone(`iris at ${radius}`, pix);
      check(read(pix, radius + 1, 1) === INK, `the demade iris at ${radius} has no rim`);
    }
    const pupil = hdPupilPix({ pupil: INK, glint: GROUND }, GROUND, 15, true);
    twoTone("pupil", pupil, 0.01);
    check(read(pupil, 16, 16) === INK, "the demade pupil is not a hole");
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

// How many distinct lid heights a blink walks, from shut to wide, on a socket
// `span` tall with a floor of `floor`.
function lids(span, floor) {
  const seen = new Set();
  for (let step = 0; step <= 1000; step++) {
    seen.add(Math.max(floor, Math.round(span * (step / 1000))));
  }
  return seen.size;
}

// 16. THE OBSERVER's almond (SHA-228).
//
// The three sockets the spec brackets the range with, and the one the classic
// numbers were written on sits in the middle of them on purpose: VORTEX is the
// smallest eye in the game, SUNRISE the largest, and everything the recipe
// draws has to survive both without being authored twice.
{
  const sockets = [
    ["VORTEX", 16, 6],
    ["THE VEIL", 42, 15],
    ["SUNRISE", 150, 60],
  ];
  // The classic drawing's absolute numbers, by the span each was measured
  // against: the outline and the lashes' two rises off the half-height, the
  // corner tick's length and the lash's width off the half-width.
  const byHeight = [1, 2, 3, 4];
  const byWidth = [1, 3];

  for (const [name, hw, hh] of sockets) {
    const hwFine = hw * FINE;
    const hhFine = hh * FINE;
    for (const authored of byHeight) {
      const feature = eyeFeature(authored, EYE_AUTHORED.hh, hhFine);
      check(feature >= 1, `${name}: a ${authored} px feature of the almond came back ${feature} fine pixels wide`);
      if (hw === EYE_AUTHORED.hw && hh === EYE_AUTHORED.hh) {
        check(
          feature === authored * FINE,
          `THE VEIL: a ${authored} px feature came back ${feature} fine pixels, want the classic ${authored * FINE}`,
        );
      }
    }
    for (const authored of byWidth) {
      const feature = eyeFeature(authored, EYE_AUTHORED.hw, hwFine);
      check(feature >= 1, `${name}: a ${authored} px feature of the almond came back ${feature} fine pixels wide`);
    }

    // The parabola closes at both tips and is widest in the middle, which is
    // what makes an eye an almond rather than a lens.
    const lidFine = almondLid(hhFine, 1);
    check(almondHalf(hwFine, lidFine, -lidFine) === 0, `${name}: the almond does not close at its top`);
    check(almondHalf(hwFine, lidFine, lidFine) === 0, `${name}: the almond does not close at its foot`);
    check(almondHalf(hwFine, lidFine, 0) === hwFine, `${name}: the almond is not widest at its middle`);

    // **The tread, which is the whole of what the fine grid buys the biggest
    // curve in the game.** Near the tip the half-width jumps four and five
    // pixels a row, which is why the outline is painted as steps rather than as
    // dots. Sampling three times as finely does not make that number smaller:
    // the jump at the first row off the tip is about `2 * hw / lid` on either
    // grid, so the *count* is the same and what changes is the size of the
    // pixel it is counted in. That is the claim — the same tread on a grid
    // three times finer is a third of the tread on screen — so the test is that
    // it does not rise, give or take the one pixel the tip's own rounding moves
    // it by (THE VEIL, THE TEAR).
    const tread = (span, lid) => {
      let worst = 0;
      let previous = 0;
      for (let dy = -lid; dy <= lid; dy++) {
        const half = almondHalf(span, lid, dy);
        worst = Math.max(worst, Math.abs(half - previous));
        previous = half;
      }
      return worst;
    };
    const fine = tread(hwFine, lidFine);
    const classic = tread(hw, Math.max(2, hh));
    check(
      fine <= classic + 1,
      `${name}: the fine almond's tread is ${fine} fine pixels against the classic ${classic} game pixels`,
    );

    // The lid never shuts to a line, and a blink now walks three times the
    // heights it did — same fourteen ticks, three times the positions, which is
    // what the diadem's twinkle and the gate's march get from the same grid.
    check(almondLid(hhFine, 0) === 2 * FINE, `${name}: a shut lid is not two game pixels of rows`);
    const fineLids = lids(hhFine, 2 * FINE);
    const classicLids = lids(hh, 2);
    check(
      fineLids > classicLids * 2,
      `${name}: a blink walks ${fineLids} lids on the fine grid against ${classicLids} on the coarse one`,
    );
  }

  // Part B's insets are absolute fine pixels off THE VEIL's own iris and pupil,
  // so those two discs are denominators here exactly as the socket is. If a
  // ratio in `observer.eye` moves, every inset below is quietly being measured
  // against a disc that does not exist any more.
  {
    const { irisRadius, pupilRadius } = gameConfig.observer.eye;
    const iris = Math.round(EYE_AUTHORED.hh * FINE * irisRadius);
    const pupil = Math.round(EYE_AUTHORED.hh * FINE * pupilRadius);
    check(EYE_AUTHORED.iris === iris, `EYE_AUTHORED.iris is ${EYE_AUTHORED.iris}, but THE VEIL's iris is ${iris}`);
    check(EYE_AUTHORED.pupil === pupil, `EYE_AUTHORED.pupil is ${EYE_AUTHORED.pupil}, but THE VEIL's is ${pupil}`);
  }

  // Part B's iris, at the radii the sockets produce. The rim inset is three
  // fine pixels on the 36 px disc it was drawn for; what has to hold at the
  // other end is that VORTEX's 14 px disc keeps one rather than losing it, and
  // that the fibres are still reaching out of the core at both.
  {
    const TONES = { body: "#2d7fe0", edge: "#1d47a8", inner: "#63b0ff" };
    for (const radius of [14, 36, 144]) {
      const pix = hdIrisPix(TONES, radius);
      const side = 2 * radius + 2;
      check(pix.width === side && pix.height === side, `the iris at ${radius} is ${pix.width}x${pix.height}`);
      const rim = eyeFeature(3, EYE_AUTHORED.iris, radius);
      check(rim >= 1, `the iris rim at ${radius} came back ${rim} fine pixels`);
      // Row zero is the sprite's padding — `disc` at `radius + 1` starts on row
      // one, which is why Part B blits the thing at `IX - IR - 1`.
      check(read(pix, radius + 1, 0) === null, `the iris at ${radius} has lost its padding row`);
      check(read(pix, radius + 1, 1) === TONES.edge, `the iris at ${radius} has no rim at its top`);
      // A fibre is the highlight tone somewhere out past the core, which is the
      // one part of this drawing the classic scan could not make at all.
      let fibres = 0;
      for (let x = 0; x < side; x++) {
        for (let y = 0; y < side; y++) {
          const from = Math.hypot(x + 0.5 - (radius + 1), y + 0.5 - (radius + 1));
          if (from > radius * 0.6 && from < radius - rim && read(pix, x, y) === TONES.inner) {
            fibres++;
          }
        }
      }
      check(fibres > radius / 2, `the iris at ${radius} has ${fibres} fibre pixels past its core`);
    }
  }

  // The glint's floor, which is Part B's own `max(1.5, 0.18 * PR)`: the
  // smallest pupil in the game is twelve fine pixels across and still catches
  // the light. And that `glinted` off leaves none, since that is the shipped
  // reading a baked pupil had to be given a key for.
  {
    const TONES = { pupil: "#05050f", glint: "#ffffff" };
    const lit = hdPupilPix(TONES, "#63b0ff", 6, true);
    const shut = hdPupilPix(TONES, "#63b0ff", 6, false);
    const glints = (pix) => {
      let count = 0;
      for (let x = 0; x < pix.width; x++) {
        for (let y = 0; y < pix.height; y++) {
          if (read(pix, x, y) === TONES.glint) {
            count++;
          }
        }
      }
      return count;
    };
    check(glints(lit) > 0, "the smallest pupil lost its glint to rounding");
    check(glints(shut) === 0, "a half-shut eye keeps a glint the lid has covered");
  }

  // The one number the shipped eye did not fractionalise, and the reason
  // SUNRISE's brow has four stubs on it: three and four game pixels of lash
  // over an eye a hundred and twenty tall.
  for (const rise of [3, 4]) {
    const sunrise = eyeFeature(rise, EYE_AUTHORED.hh, 60 * FINE);
    check(sunrise > rise * FINE, `SUNRISE's ${rise} px lash came back ${sunrise} fine pixels — still the stub`);
    const vortex = eyeFeature(rise, EYE_AUTHORED.hh, 6 * FINE);
    check(vortex >= 1, `VORTEX's ${rise} px lash came back ${vortex} fine pixels`);
    check(vortex < rise * FINE, `VORTEX's ${rise} px lash did not come down with the socket`);
  }
}

// 17. THE OBSERVER's three states (SHA-230).
//
// Read off the real levels rather than off a copy of their numbers, because
// each state exists on exactly one socket and none of the three is the socket
// the drawing was authored on: THE TEAR is 62 x 23, THE WRATH 84 x 30, THE LID
// 120 x 27, against THE VEIL's 42 x 15. Half of what this section is for is
// catching a designer widening one of those three and nothing following.
{
  const socketFor = (mode) => {
    const level = LEVELS.find((entry) => entry.observer?.mode === mode);
    return level === undefined ? null : level.observer.eye;
  };
  const VORTEX = { hw: 16, hh: 6 };
  const VEIL = { hw: EYE_AUTHORED.hw, hh: EYE_AUTHORED.hh };

  // THE TEAR. Where the tracks hang and how far they fall are fractions of the
  // socket; only their width is not, and that is the state's whole point.
  const tear = socketFor("tear");
  check(tear !== null, "no level weeps any more, so the tear's tracks are unchecked");
  for (const [name, socket] of [
    ["VORTEX", VORTEX],
    ["THE VEIL", VEIL],
    ["THE TEAR", tear ?? VEIL],
  ]) {
    const hwFine = socket.hw * FINE;
    const hhFine = socket.hh * FINE;
    const left = eyeFeature(EYE_TEAR.left, EYE_AUTHORED.hw, hwFine);
    const right = eyeFeature(EYE_TEAR.right, EYE_AUTHORED.hw, hwFine);
    const fall = eyeFeature(EYE_TEAR.fall, EYE_AUTHORED.hh, hhFine);
    const short = eyeFeature(EYE_TEAR.short, EYE_AUTHORED.hh, hhFine);
    for (const [what, value] of [
      ["left track", left],
      ["right track", right],
      ["long fall", fall],
      ["short fall", short],
    ]) {
      check(value >= 1, `${name}: the tear's ${what} came back ${value} fine pixels`);
    }
    // The bead is a whole game pixel laid centred on a one-pixel thread, so it
    // overhangs its track by a fine pixel on each side. Both tracks have to
    // stay clear of that, or the drop reads as bridging the two.
    check(
      left + right > FINE,
      `${name}: the tear's tracks are ${left + right} fine pixels apart, and the bead is ${FINE} wide`,
    );
    check(fall > short, `${name}: the tear's two tracks fall the same distance, so the eye weeps symmetrically`);
    if (socket === VEIL) {
      check(
        left === EYE_TEAR.left * FINE && fall === EYE_TEAR.fall * FINE,
        `THE VEIL: the tear came back ${left}/${fall}, want the classic ${EYE_TEAR.left * FINE}/${EYE_TEAR.fall * FINE}`,
      );
    }
    if (socket === tear) {
      // Half again THE VEIL's socket, so a track pinned at seven game pixels
      // off the pupil would run down the middle of this eye rather than out of
      // its corner.
      check(left > EYE_TEAR.left * FINE, `THE TEAR: the track hangs at ${left}, no further out than THE VEIL's`);
      check(fall > EYE_TEAR.fall * FINE, `THE TEAR: the track falls ${fall}, no further than THE VEIL's`);
    }
  }

  // THE WRATH. Part B's two fine pixels is a weight classic cannot write down
  // at all — two thirds of the only unit it has — and that thinness is what
  // makes a vein a vein rather than a scratch on the white.
  const wrath = socketFor("wrath");
  check(wrath !== null, "no level rages any more, so the veins' weight is unchecked");
  const veinAt = (hh) => eyeFeature(EYE_VEIN_WEIGHT, EYE_AUTHORED.hh * FINE, hh * FINE);
  check(
    veinAt(VEIL.hh) === EYE_VEIN_WEIGHT,
    `THE VEIL's vein came back ${veinAt(VEIL.hh)}, want Part B's ${EYE_VEIN_WEIGHT}`,
  );
  check(veinAt(VEIL.hh) < FINE, "THE VEIL's vein is a whole game pixel, which is the scratch the fine grid was for");
  check(veinAt(VORTEX.hh) >= 1, `VORTEX's vein came back ${veinAt(VORTEX.hh)} fine pixels`);
  if (wrath !== null) {
    // The one classic could not say: THE WRATH's eye is twice THE VEIL's, so
    // the same *fraction* of a white is wider than the single game pixel the
    // coarse grid had to round it to.
    check(
      veinAt(wrath.hh) > FINE,
      `THE WRATH's vein came back ${veinAt(wrath.hh)} fine pixels, no more than the game pixel classic draws`,
    );
  }

  // THE LID. The bands deepen inward, none of them is ever solid, and every one
  // of them stays off the outline — a dither that reached the rim would read as
  // a second lid rather than as the far side of a socket.
  const lidSocket = socketFor("lid");
  check(lidSocket !== null, "nothing wakes any more, so the hollow's depth is unchecked");
  let outer = 1;
  let laid = 0;
  for (const [covers, coverage] of EYE_HOLLOW) {
    check(covers < outer, `the hollow's bands do not shrink inward: ${covers} follows ${outer}`);
    check(coverage > laid, `the hollow's bands do not deepen inward: ${coverage} follows ${laid}`);
    check(coverage < 1, `the hollow's ${covers} band is laid solid, which makes the socket an object again`);
    outer = covers;
    laid = coverage;
  }
  for (const socket of [VORTEX, VEIL, lidSocket ?? VEIL]) {
    const hwFine = socket.hw * FINE;
    const lidFine = almondLid(socket.hh * FINE, 1);
    for (const [covers] of EYE_HOLLOW) {
      const bandLid = Math.round(lidFine * covers);
      const bandHw = Math.round(hwFine * covers);
      check(bandLid >= 1 && bandHw >= 1, `hw ${socket.hw}: the hollow's ${covers} band has no rows in it`);
      check(
        almondHalf(bandHw, bandLid, bandLid) <= 0 && almondHalf(bandHw, bandLid, 0) > 0,
        `hw ${socket.hw}: the hollow's ${covers} band is not an almond — it does not close at its own tip`,
      );
      for (let dy = -bandLid; dy <= bandLid; dy++) {
        const band = almondHalf(bandHw, bandLid, dy);
        const white = almondHalf(hwFine, lidFine, dy);
        check(
          band < white,
          `hw ${socket.hw}: the hollow's ${covers} band reaches ${band} at row ${dy}, and the almond is ${white}`,
        );
      }
    }
  }
}

// 18. The screen a placed eye fades behind on the tube (SHA-231).
//
// Colour has nothing to check: `globalAlpha` fades a fine almond exactly as it
// faded a coarse one. DEMAKE has no alpha, so the eye is cut to a halftone
// instead — and that cell stayed a game pixel while everything under it went
// to thirds, which leaves a screen three times coarser than the drawing.
//
// Coarser cuts differently. A cell that is the same size as the mark thins it;
// a cell three times the mark's width takes the mark or leaves it whole, and
// at one dot in four the dropped columns run a full cell across, so a mark
// narrower than that can land in the gap and be erased outright. VORTEX is the
// live example: its outline is one fine pixel, a third of the cell, and the
// only thing keeping it on screen is that three fifths of opacity puts it on
// two dots in four, where no column is dropped. Take it down to a fifth and
// that eye would vanish — a level with no eye rather than a faint one, which
// is not a bug any screenshot names.
{
  const cellFine = EYE_HALFTONE.cell * FINE;
  const tile = EYE_HALFTONE.cells * cellFine;
  check(
    EYE_HALFTONE.cell === 1,
    `the halftone's cell is ${EYE_HALFTONE.cell} game pixels, and a screen is cut in whole ones`,
  );
  check(EYE_HALFTONE.cells >= 2, `a ${EYE_HALFTONE.cells}-cell tile has no dropped cell to make a halftone out of`);
  check(
    Number.isInteger(tile),
    `the halftone's tile is ${tile} fine pixels, so its cells land on fractions of the grid`,
  );

  // The two textures have to be two. Collapse the coverages and the tube shows
  // one veil for every opacity in the game, which is the grey again by
  // another route.
  const cells = EYE_HALFTONE.cells * EYE_HALFTONE.cells;
  check(1 / cells < 2 / cells && 2 / cells < 1, `one dot in ${cells} and two are not two different textures`);

  const placed = LEVELS.filter((level) => level.eye !== undefined && (level.eye.opacity ?? 1) < 1);
  check(placed.length > 0, "no level places a faded eye any more, so the halftone is unchecked");
  const used = new Set();
  for (const level of placed) {
    const eye = level.eye;
    // Against the spec's own reading — one dot in four under a third, two above
    // — rather than against `sparse`, which is this code's answer to it. A
    // threshold moved to a half would put PYRAMID on the sparse texture and
    // agree with itself all the way down.
    const keep = halftoneKeep(eye.opacity);
    check(
      keep === (eye.opacity < 1 / 3 ? 1 : 2),
      `${level.name} at ${eye.opacity} opacity keeps ${keep} cells, and the spec says ${eye.opacity < 1 / 3 ? 1 : 2}`,
    );
    check(
      keep >= 1 && keep <= EYE_HALFTONE.cells,
      `${level.name} keeps ${keep} of ${cells} cells, which is not a halftone`,
    );
    used.add(keep);

    // The widest run of columns the screen drops, and the thinnest mark the
    // almond puts in front of it. A mark has to be wider than the gap to be
    // guaranteed a kept column whatever phase it lands on.
    const gap = (EYE_HALFTONE.cells - keep) * cellFine;
    const edge = eyeFeature(1, EYE_AUTHORED.hh, eye.hh * FINE);
    check(
      edge > gap,
      `${level.name}: the almond's outline is ${edge} fine px and at ${eye.opacity} opacity the screen drops ${gap} in a row, so the eye can be cut away rather than faded`,
    );
  }

  // Both textures earn their keep. If every faded eye in the game lands on the
  // same one, the other is a tile nobody has looked at in a year.
  check(used.size === 2, `the game's faded eyes use ${used.size} of the tube's two textures`);
}

// 19. THE ZODIAC DIAL on the fine grid (SHA-232).
//
// The dial is the one thing moving on the field before the ball is, and it is
// drawn rather than baked precisely so that it can be ruled at whatever
// resolution the field has. Two things have to survive the conversion: the
// circles have to stay closed rather than becoming strings of beads, and the
// dashed band has to keep the dash. The first is not a given — one dot per
// pixel of circumference lands two neighbours two pixels apart wherever the
// rounding ties, and classic gets away with it only because its pen is three
// device pixels wide. So the check is comparative and in device pixels: ruling
// the circle three times as finely must not open a wider hole than the coarse
// one already has. The second is a pitch, and this pass has shipped a dropped
// factor in a pitch before (item 13).
{
  const { field, title, dashOn, dashOff } = gameConfig.observer.ring;

  check(dialUnit(false, FINE) === 1, "classic rules the dial on something other than the game pixel");
  check(dialUnit(true, FINE) === FINE, "HD does not rule the dial on the fine grid");
  check(dialUnit(true, 1) === 1, "the title's dial is drawn at scale 1, where there is no fine grid to rule on");
  check(
    dialWalk(1) === 1,
    "classic's dial no longer walks one step per pixel, which moves pixels the pass is not allowed to move",
  );

  // A circle, walked the way the renderer walks it, reporting the widest hole
  // it leaves in device pixels — the gap between two dots, less the pen that
  // is laid at each of them.
  const ruled = (radius, unit) => {
    const steps = dialSteps(radius * unit, dialWalk(unit));
    const pen = FINE / unit;
    const dots = [];
    for (let index = 0; index < steps; index++) {
      const angle = (index / steps) * Math.PI * 2;
      dots.push([Math.round(Math.cos(angle) * radius * unit), Math.round(Math.sin(angle) * radius * unit)]);
    }
    let jump = 0;
    let painted = 0;
    for (let index = 0; index < dots.length; index++) {
      const [x, y] = dots[index];
      const [nx, ny] = dots[(index + 1) % dots.length];
      const step = Math.max(Math.abs(x - nx), Math.abs(y - ny));
      jump = Math.max(jump, step);
      if (step > 0) {
        painted++;
      }
    }
    return { steps, painted, hole: Math.max(0, (jump - 1) * pen) };
  };

  for (const [name, ring] of [
    ["the field's", field],
    ["the title's", title],
  ]) {
    for (const [edge, radius] of [
      ["outer", ring.outer],
      ["inner", ring.inner],
    ]) {
      const coarse = ruled(radius, 1);
      const fine = ruled(radius, FINE);
      // The whole of what the finer walk buys: the hairline is closed, which
      // one step per pixel is not — it ties against its own rounding and skips.
      check(
        fine.hole === 0,
        `${name} ${edge} hairline leaves a ${fine.hole} device px hole, and a ruled circle has no hole in it`,
      );
      check(
        fine.hole <= coarse.hole,
        `${name} ${edge} circle leaves a ${fine.hole} device px hole ruled fine and ${coarse.hole} ruled coarse, so the hairline is gappier than the block ring it replaces`,
      );
      // And it buys it for nothing: the repeats the finer walk makes are
      // dropped, so the ring costs about the three times the spec asked for.
      check(
        fine.painted <= dialSteps(radius) * FINE * 1.2,
        `${name} ${edge} hairline paints ${fine.painted} dots against ${dialSteps(radius) * FINE} for one per fine pixel, so the finer walk is not free after all`,
      );
    }
    // A tick is a ray, so both its coordinates advance monotonically and it
    // cannot skip — but it has to reach the outer circle exactly, and stepping
    // a band of 4 in units of 1 is the kind of arithmetic that stops being
    // exact the day someone gives the band a fractional width.
    for (const unit of [1, FINE]) {
      const to = ring.outer * unit;
      let reached = ring.inner * unit;
      let last = null;
      let jump = 0;
      for (let radius = ring.inner * unit; radius <= to; radius += 1) {
        const dot = [Math.round(Math.cos(0.7) * radius), Math.round(Math.sin(0.7) * radius)];
        if (last) jump = Math.max(jump, Math.abs(dot[0] - last[0]), Math.abs(dot[1] - last[1]));
        last = dot;
        reached = radius;
      }
      check(jump <= 1, `${name} tick at unit ${unit} breaks by ${jump} px across the band`);
      check(reached === to, `${name} tick at unit ${unit} stops at ${reached} and the outer circle is at ${to}`);
    }
  }

  // The dash, against classic's own rather than against a formula. The duty is
  // the fraction of the circumference inked; the run is how long one graduation
  // is *on screen*, and it is the run that a naive conversion loses.
  // Measured through the stride the renderer actually passes — the grid's unit
  // times the walk's steps per pixel — and reported in game pixels of arc,
  // which is the only unit the two grids can be compared in.
  const stride = (unit) => unit * dialWalk(unit);
  const duty = (unit) => {
    const steps = (dashOn + dashOff) * stride(unit) * 4;
    let inked = 0;
    for (let index = 0; index < steps; index++) {
      if (dialInked(index, stride(unit))) {
        inked++;
      }
    }
    return inked / steps;
  };
  // One graduation, in game pixels of arc: how many steps it runs for, over how
  // many steps make a game pixel.
  const run = (unit) => {
    let steps = 0;
    while (dialInked(steps, stride(unit))) {
      steps++;
    }
    return steps / stride(unit);
  };
  check(
    duty(1) === dashOn / (dashOn + dashOff),
    `the dial's dash inks ${duty(1)} of the band, and the roster says ${dashOn}/${dashOn + dashOff}`,
  );
  check(
    Math.abs(duty(1) - duty(FINE)) < 1e-9,
    `the dial's dash inks ${duty(1)} of the band coarse and ${duty(FINE)} fine`,
  );
  check(
    run(FINE) === run(1),
    `a graduation is ${run(1)} game px of arc coarse and ${run(FINE)} fine, so on the fine grid it is ${(run(FINE) / run(1)).toFixed(2)} of its length on screen`,
  );
  check(run(1) === dashOn, `a graduation runs ${run(1)} game px of arc and the roster says ${dashOn}`);
  // And it really is the refusal it claims to be: take `finePitch`'s trade at
  // this pitch and the whole period comes out shorter than one graduation,
  // which is a solid circle with a stipple rather than a graduated band.
  const traded = finePitch(dashOn + dashOff);
  check(
    traded < run(FINE),
    `finePitch would leave the dial's whole period ${traded.toFixed(2)} game px of arc against a graduation of ${run(FINE)}, so the trade is not the one being refused`,
  );
}

// 20. THE BESTIARY on the fine grid (SHA-233).
//
// `scale3x` of the ASCII bitmap is the whole recipe and item 8 already pins the
// algorithm. What is new here is what the bestiary wraps round it: a flash that
// had to stop being an override and become a palette, a boss that is its
// species doubled, and a set of decorations that stay drawn while the body
// bakes. Each of those can fail silently into a picture that still looks like a
// creature — a rectangle where a spider was, a soft boss, a frog with blocky
// legs — so none of them is left to a screenshot.
{
  // Not `deathFlash`, which is what the game actually strikes with: the frog's
  // eye whites and the brood's are already `#ffffff`, so a check that looked
  // for white would find the creature's own highlights and call them the
  // flash. A sentinel no palette holds is what makes the question answerable,
  // and it is asserted below rather than assumed.
  const WHITE = "#fe00fe";
  const opaque = (pix) => {
    const marks = [];
    for (let y = 0; y < pix.height; y++) {
      for (let x = 0; x < pix.width; x++) {
        if (read(pix, x, y) !== null) {
          marks.push(`${x},${y}`);
        }
      }
    }
    return marks;
  };
  const tones = (pix) => new Set(opaque(pix).map((at) => read(pix, ...at.split(",").map(Number))));

  // Every frame of every species, plus the brood's five sprites and the tear.
  const sprites = [];
  for (const [kind, species] of Object.entries(SPECIES)) {
    for (const [index, rows] of species.frames.entries()) {
      sprites.push([`${kind} frame ${index}`, rows, species.palette, species.outline]);
    }
  }
  for (const [name, rows] of Object.entries(BROOD_BITMAPS)) {
    sprites.push([`the brood's ${name}`, rows, broodPalette(name, false), BROOD_OUTLINE[name] ?? ""]);
  }
  check(sprites.length >= 20, `the bestiary is ${sprites.length} sprites, which is fewer than the roster has`);

  for (const [name, rows, palette, outline] of sprites) {
    check(
      !Object.values(palette).includes(WHITE),
      `${name} is painted in the sentinel this check strikes it with, so the flash cannot be told from the creature`,
    );
    const plain = hdBeastPix(rows, palette, outline, FLASH.NONE, WHITE);
    const whole = hdBeastPix(rows, palette, outline, FLASH.WHOLE, WHITE);
    const cooled = hdBeastPix(rows, palette, outline, FLASH.OUTLINE, WHITE);

    check(
      plain.width === rows[0].length * FINE && plain.height === rows.length * FINE,
      `${name} bakes to ${plain.width}x${plain.height} from a ${rows[0].length}x${rows.length} bitmap`,
    );
    const body = opaque(plain);
    check(body.length > 0, `${name} bakes to nothing at all`);
    // The flash may not change the silhouette. A palette that whited `.` would
    // hand back the bounding box, which still reads as a strike for one frame
    // and as a bug forever after.
    check(
      opaque(whole).join(" ") === body.join(" "),
      `${name} covers ${opaque(whole).length} px struck and ${body.length} px at rest, so the flash is reshaping it`,
    );
    check(opaque(cooled).join(" ") === body.join(" "), `${name} changes shape as its strike cools`);
    const whited = [...tones(whole)];
    check(
      whited.length === 1 && whited[0] === WHITE,
      `${name} struck is ${whited.join(" ")} rather than one white silhouette`,
    );
    // And the outline flash is the outline: white where that character is, the
    // species' own tones everywhere else.
    if (outline !== "" && palette[outline] !== undefined) {
      const outlineOnly = hdBeastPix(rows, { [outline]: palette[outline] }, outline, FLASH.NONE, WHITE);
      const lit = opaque(outlineOnly);
      let wrong = 0;
      for (const at of lit) {
        const [x, y] = at.split(",").map(Number);
        if (read(cooled, x, y) !== WHITE) {
          wrong++;
        }
      }
      check(wrong === 0, `${name} leaves ${wrong} px of its outline unlit while the strike cools`);
      const strayed = body
        .filter((at) => !lit.includes(at))
        .filter((at) => {
          const [x, y] = at.split(",").map(Number);
          return read(cooled, x, y) === WHITE;
        });
      check(strayed.length === 0, `${name} whites ${strayed.length} px that are not its outline`);
    }
  }

  // A boss is its species grown. How much of its ink Scale3x has to round is
  // the number the spec says to watch: more than the species' and the boss has
  // come out softer rather than bigger, which is what a doubled bitmap's own
  // 2 x 2 corners do to the algorithm.
  const rounded = (rows) => {
    const out = scale3xRows(rows);
    let ink = 0;
    let changed = 0;
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const centre = rows[y][x];
        if (centre === ".") {
          continue;
        }
        ink++;
        for (let cell = 0; cell < 9; cell++) {
          if (out[y * FINE + Math.floor(cell / FINE)][x * FINE + (cell % FINE)] !== centre) {
            changed++;
          }
        }
      }
    }
    return ink === 0 ? 0 : changed / (ink * 9);
  };
  for (const [small, big] of [
    ["spider", "spiderQueen"],
    ["moth", "mothMother"],
    ["frog", "frogKing"],
    ["snail", "snailElder"],
    ["jellyfish", "manOWar"],
    ["bat", "batCount"],
    ["beetle", "scarab"],
    ["crab", "crabBaron"],
    ["woodpecker", "drummer"],
    ["slug", "greatSlug"],
  ]) {
    const species = rounded(SPECIES[small].frames[0]);
    const boss = rounded(SPECIES[big].frames[0]);
    check(
      boss <= species,
      `${big} rounds ${(boss * 100).toFixed(1)}% of its ink against ${small}'s ${(species * 100).toFixed(1)}%, so the boss is softer than its species rather than bigger`,
    );
    check(
      SPECIES[big].width > SPECIES[small].width && SPECIES[big].height > SPECIES[small].height,
      `${big} is ${SPECIES[big].width}x${SPECIES[big].height} against ${small}'s ${SPECIES[small].width}x${SPECIES[small].height}`,
    );
  }

  // The frog's legs: a bitmap drawn live through the renderer's brush rather
  // than baked, and rounded by the same algorithm or the frog is smooth above
  // the hip and blocky below it.
  const legs = SPECIES.frog.frames[0];
  for (const unit of [1, FINE]) {
    const marks = new Set();
    const brush = (x, y, w, h) => {
      for (let dx = 0; dx < Math.round(w * unit); dx++) {
        for (let dy = 0; dy < Math.round(h * unit); dy++) {
          marks.add(`${Math.round(x * unit) + dx},${Math.round(y * unit) + dy}`);
        }
      }
    };
    paintRows(brush, legs, 0, 0, "#ffffff", unit);
    const grid = unit === 1 ? legs : scale3xRows(legs);
    const want = new Set();
    for (const [row, line] of grid.entries()) {
      for (let x = 0; x < line.length; x++) {
        if (line[x] !== ".") {
          want.add(`${x},${row}`);
        }
      }
    }
    const missing = [...want].filter((at) => !marks.has(at)).length;
    const extra = [...marks].filter((at) => !want.has(at)).length;
    check(
      missing === 0 && extra === 0,
      `paintRows at unit ${unit} misses ${missing} px of the bitmap and paints ${extra} that are not in it`,
    );
    check(marks.size > 0, `paintRows at unit ${unit} draws nothing`);
  }

  // The flash's three steps, read off the same fraction the renderer reads.
  check(flashOf(0) === FLASH.NONE, "a creature that was not struck is wearing a flash");
  check(flashOf(1) === FLASH.WHOLE, "the frame a strike lands on is not a white silhouette");
  check(flashOf(0.75) === FLASH.WHOLE, "the first half of a strike is not the whole silhouette");
  check(flashOf(0.25) === FLASH.OUTLINE, "the second half of a strike is not the outline alone");

  // The key space, which is the argument for baking these and not the almond.
  // 320 since the veils' five bosses (SHA-261) took it past 256: still a few
  // hundred canvases baked once, not a key that grows with play.
  const keys = sprites.length * 3 * 2;
  check(keys <= 320, `the bestiary would bake ${keys} sprites, which is no longer a small and finite key`);
}

// 21. THE PLAQUES, THE DIADEM and THE GATE (SHA-234).
//
// The plate needs nothing: `OCULUS_WIDTH` x `OCULUS_HEIGHT` is exactly the
// handoff's fine plate, so its chamfer and its states are already these
// numbers. What the fine grid buys the other two is not a bigger drawing but a
// finer clock, and a clock is the kind of thing that looks right in a
// screenshot however wrong it is — a twinkle stuck at one length and a march
// running at a twelfth of its intended speed both photograph perfectly.
{
  const { twinkleTicks, twinkleStagger } = gameConfig.observer.diadem;
  const GATE_CELL = 4;

  // The breath. It has to reach both ends, rise and fall exactly once, and be
  // staggered — six stars at the same phase are one blinking block.
  const walk = (index) => {
    const swells = [];
    for (let frame = 0; frame < twinkleTicks; frame++) {
      swells.push(twinkleSwell(frame, index, twinkleStagger, twinkleTicks));
    }
    return swells;
  };
  const first = walk(0);
  check(
    Math.min(...first) < 0.05,
    `the diadem's breath never reaches its trough, bottoming at ${Math.min(...first).toFixed(3)}`,
  );
  check(
    Math.max(...first) > 0.95,
    `the diadem's breath never reaches its peak, topping at ${Math.max(...first).toFixed(3)}`,
  );
  let turns = 0;
  for (let i = 1; i < first.length - 1; i++) {
    if ((first[i] - first[i - 1]) * (first[i + 1] - first[i]) < 0) {
      turns++;
    }
  }
  check(turns === 1, `the diadem's breath turns ${turns} times in a period, and a breath turns once`);
  check(
    walk(1)[0] !== first[0] || twinkleStagger === 0,
    "the diadem's stars are all at the same phase, so six of them blink as one block",
  );

  // Four lengths where the coarse grid had two, and never shorter than the
  // star that ships. The colour star is the one that may not lose a pixel:
  // its shipped arm is three game pixels and the twinkle may only add.
  for (const [name, shortest, longest, floor] of [
    ["the tube's star", 2 * FINE, 3 * FINE, 2 * FINE],
    ["the colour star", 3 * FINE, 3 * FINE + 2, 3 * FINE],
  ]) {
    const arms = new Set(first.map((swell) => twinkleArm(swell, shortest, longest)));
    check(
      arms.size >= 3,
      `${name} takes ${arms.size} arm length(s) through a twinkle, which is no more than the two a boolean already gave it`,
    );
    check(
      Math.min(...arms) >= floor,
      `${name} shrinks to ${Math.min(...arms)} fine px, under the ${floor} it is drawn at`,
    );
    check(Math.max(...arms) === longest, `${name} tops out at ${Math.max(...arms)} fine px rather than ${longest}`);
    // And in game pixels it is still the same star: a twinkle that changed the
    // star's size by a whole pixel would be a star growing, not twinkling.
    check(
      (Math.max(...arms) - Math.min(...arms)) / FINE <= 1,
      `${name} swings ${((Math.max(...arms) - Math.min(...arms)) / FINE).toFixed(2)} game px through its twinkle, which is a star changing size`,
    );
  }

  // The march. One cell has to have `cell * FINE` places to be inside it, the
  // slide has to cover exactly three cells before it repeats, and it has to
  // advance one fine pixel a frame — a march that slid a whole cell a frame
  // would be the coarse one again, drawn the long way round.
  const period = GATE_CELL * 3;
  const slides = [];
  for (let frame = 0; frame < period * FINE; frame++) {
    slides.push(gateSlide(frame, GATE_CELL));
  }
  check(
    new Set(slides).size === period * FINE,
    `the gate's march has ${new Set(slides).size} positions in a period of ${period * FINE}`,
  );
  // Counted in fine pixels rather than in game ones: a slide of a third comes
  // back as 0.3333333333333339 as often as not, and a set of those counts
  // every rounding error as a position.
  const inCell = new Set(slides.map((at) => Math.round(at * FINE) % (GATE_CELL * FINE)));
  check(
    inCell.size === GATE_CELL * FINE,
    `the gate's march has ${inCell.size} places to be inside one cell, and a cell is ${GATE_CELL * FINE} fine pixels`,
  );
  check(gateSlide(period * FINE, GATE_CELL) === gateSlide(0, GATE_CELL), "the gate's march does not close on itself");
  const steps = new Set(slides.slice(1).map((at, i) => Math.round((at - slides[i]) * FINE)));
  check(
    steps.size === 1 && steps.has(1),
    `the gate's march advances ${[...steps].join("/")} fine px a frame rather than exactly one`,
  );

  // The plaque's relief, which is a `mix` and nothing else: half way between
  // the mark and the plate, so it reads as the lit wall of a groove. Equal to
  // either end and it is either invisible or a second stroke.
  const mark = BRICK_COLORS["4"].light;
  const plate = BRICK_COLORS["4"].dark;
  const relief = mix(mark, plate, 0.5);
  check(relief !== mark && relief !== plate, `the plaque's relief is ${relief}, which is the mark or the plate itself`);
}

// ---------------------------------------------------------------------------
// 22. INSIDE THE EYE on the fine grid (SHA-235).
//
// The iris the player stands in was the last field surface still painted in
// game pixels, and porting it is mostly a matter of handing the painter the
// other brush. Two things in it are not, and both are invisible in a still.
//
// The first is the fibres, which walk a sixty-pixel span in sixty steps. That
// is one sample per pixel right up until the pixel is a third of the size, at
// which point the same loop lays sixty dots three fine pixels apart and the
// iris grows twenty-eight spokes. The second is the generator: the two arts
// share one seed so that `art split` compares a drawing rather than a layout,
// which means the twenty streaks the fine grid adds may only be appended —
// slip one in among the forty veins that ship and every vein after it moves.
{
  const { centerX, centerY } = gameConfig.observer.inside;
  const { area } = IRIS_COLORS.blue;
  const FIELD = { width: 372, height: 300 };

  // A brush that paints nothing and remembers everything, so the painter can
  // be asked what it did rather than what it drew. Its generator is the
  // guard's own and deterministic, which is the point: both arts get the same
  // numbers, so a vein that lands somewhere else landed there because a call
  // moved it.
  const recordingBrush = (hd) => {
    let state = 0x2545f491;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const log = [];
    const note = (verb, fields) => log.push({ verb, ...fields });
    return {
      log,
      width: FIELD.width,
      height: FIELD.height,
      hd,
      fineWidth: FIELD.width * (hd ? FINE : 1),
      fineHeight: FIELD.height * (hd ? FINE : 1),
      rect: (x, y, w, h, color) => note("rect", { x, y, w, h, color }),
      disc: (x, y, r, color) => note("disc", { x, y, r, color }),
      discBand: (x, y, r, top, h, color) => note("discBand", { x, y, r, top, h, color }),
      random() {
        note("random", {});
        return random();
      },
      randomInt(min, max) {
        note("randomInt", { min, max });
        return min + Math.floor(random() * (max - min));
      },
      finePixel: (x, y, color) => note("finePixel", { x, y, color }),
      fineRect: (x, y, w, h, color) => note("fineRect", { x, y, w, h, color }),
      fineDither: (x, y, w, h, color, t) => note("fineDither", { x, y, w, h, color, t }),
      fineVgrad: (x, w, stops) => note("fineVgrad", { x, w, stops }),
      fineRgrad: (x, y, r, tones) => note("fineRgrad", { x, y, r, tones }),
      fineDisc: (x, y, r, color, t) => note("fineDisc", { x, y, r, color, t }),
      fineRing: (x, y, r, color) => note("fineRing", { x, y, r, color }),
      fineDiscBand: (x, y, r, top, h, color) => note("fineDiscBand", { x, y, r, top, h, color }),
    };
  };

  const run = (hd, demade) => {
    const brush = recordingBrush(hd);
    paintIris(brush, "blue", { x: centerX, y: centerY }, demade);
    return brush.log;
  };
  const coarse = run(false, false);
  const fine = run(true, false);

  // -- The generator, which is the whole of the "same layout" promise. --
  const coarseDraws = coarse.filter((call) => call.verb === "randomInt" || call.verb === "random");
  const fineDraws = fine.filter((call) => call.verb === "randomInt" || call.verb === "random");
  check(
    coarseDraws.length === INSIDE_IRIS.veins * 3,
    `classic takes ${coarseDraws.length} draws from the generator where ${INSIDE_IRIS.veins} veins want ${INSIDE_IRIS.veins * 3}`,
  );
  check(
    fineDraws.length === (INSIDE_IRIS.veins + INSIDE_IRIS.streaks) * 3,
    `hd takes ${fineDraws.length} draws where ${INSIDE_IRIS.veins} veins and ${INSIDE_IRIS.streaks} streaks want ${(INSIDE_IRIS.veins + INSIDE_IRIS.streaks) * 3}`,
  );
  const shared = coarseDraws.findIndex(
    (call, index) =>
      fineDraws[index] === undefined ||
      call.verb !== fineDraws[index].verb ||
      call.min !== fineDraws[index].min ||
      call.max !== fineDraws[index].max,
  );
  check(
    shared === -1,
    `hd's generator diverges from classic's at draw ${shared} — every vein from there on is somewhere else`,
  );

  // ...and the veins themselves, which is the same promise read off the
  // picture instead of off the call log.
  const veins = (log) => log.filter((call) => call.verb === "rect" && call.color === area.vein);
  const coarseVeins = veins(coarse);
  const fineVeins = veins(fine);
  check(
    coarseVeins.length === INSIDE_IRIS.veins && fineVeins.length === INSIDE_IRIS.veins,
    `the sclera carries ${coarseVeins.length} veins in classic and ${fineVeins.length} in hd, and the shipped forty are not negotiable`,
  );
  const moved = coarseVeins.filter(
    (vein, index) => vein.x !== fineVeins[index]?.x || vein.y !== fineVeins[index]?.y || vein.w !== fineVeins[index]?.w,
  ).length;
  check(moved === 0, `${moved} of the shipped veins land somewhere else in hd`);

  // The twenty are additional, and they are finer than the forty rather than
  // twenty more of the same: one fine pixel where a vein is three, in a tone
  // that is neither the vein's nor the sclera's.
  const streaks = fine.filter((call) => call.verb === "fineRect");
  check(
    streaks.length === INSIDE_IRIS.streaks,
    `hd lays ${streaks.length} streaks over the veins rather than ${INSIDE_IRIS.streaks}`,
  );
  check(
    streaks.every((streak) => streak.h === 1),
    `a streak is ${streaks.find((streak) => streak.h !== 1)?.h} fine px thick, which is a vein and not a streak`,
  );
  check(
    streaks.every((streak) => streak.color !== area.vein && streak.color !== area.base),
    "the streaks are painted in the vein's own tone, so they read as veins rather than as tissue under them",
  );
  check(
    coarse.filter((call) => call.verb.startsWith("fine")).length === 0,
    "the classic path reached for a fine-grid verb",
  );

  // -- The fibres: the gap between two consecutive samples of one. --
  const gapOf = (hd) => {
    const angle = fibreAngle(0);
    const steps = fibreSteps(hd);
    let worst = 0;
    let last = null;
    for (let step = 0; step < steps; step += 1) {
      const radius = fibreRadius(step, hd) * FINE;
      const at = [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)];
      if (last) {
        worst = Math.max(worst, Math.abs(at[0] - last[0]), Math.abs(at[1] - last[1]));
      }
      last = at;
    }
    return worst;
  };
  check(gapOf(true) === 1, `a fine fibre steps ${gapOf(true)} fine px at a time, which is a dotted line`);
  check(
    gapOf(false) > gapOf(true),
    "the coarse walk is already continuous on the fine grid, so there was nothing here to fix",
  );
  // Finer, not longer: the span is the shipped one at both resolutions.
  for (const hd of [false, true]) {
    const steps = fibreSteps(hd);
    check(
      fibreRadius(0, hd) === INSIDE_IRIS.fibreFrom && fibreRadius(steps, hd) === INSIDE_IRIS.fibreTo,
      `${hd ? "hd" : "classic"} walks the fibres from ${fibreRadius(0, hd)} to ${fibreRadius(steps, hd)} rather than ${INSIDE_IRIS.fibreFrom} to ${INSIDE_IRIS.fibreTo}`,
    );
  }
  // And the painter actually takes that walk, rather than the module owning an
  // arithmetic nothing calls.
  const plotted = fine.filter((call) => call.verb === "finePixel").length;
  check(
    plotted === INSIDE_IRIS.fibres * fibreSteps(true),
    `hd plots ${plotted} fibre pixels where ${INSIDE_IRIS.fibres} fibres at ${fibreSteps(true)} samples want ${INSIDE_IRIS.fibres * fibreSteps(true)}`,
  );

  // -- The bleed: a half tone, four game pixels out, and under its own band. --
  const discs = fine.filter((call) => call.verb === "disc");
  const collars = fine.filter((call) => call.verb === "fineDisc");
  check(
    collars.length === discs.length - 1,
    `${collars.length} collars for ${discs.length} bands — every band but the outermost gets one, and the outermost must not`,
  );
  check(
    INSIDE_IRIS.bleedCoverage > 0 && INSIDE_IRIS.bleedCoverage < 1,
    `a collar at ${INSIDE_IRIS.bleedCoverage} coverage is either invisible or a second band`,
  );
  // Paired only once the count is right: a collar that belongs to no band has
  // nothing to be four pixels outside of, and the count above already said so.
  if (collars.length === discs.length - 1) {
    let outward = 0;
    let over = 0;
    for (const [index, collar] of collars.entries()) {
      const band = discs[index + 1];
      if (bleedRadius(band.r) !== collar.r) {
        outward += 1;
      }
      if (fine.indexOf(collar) > fine.indexOf(band)) {
        over += 1;
      }
    }
    check(outward === 0, `${outward} collars are not ${INSIDE_IRIS.bleed} game px outside the band they belong to`);
    check(
      over === 0,
      `${over} collars are painted over their own band rather than under it, which stipples the band instead of the one outside it`,
    );
  }

  // -- The limbus, and the tube's contours: hairlines, closed and contiguous. --
  const limbus = fine.filter((call) => call.verb === "fineRing" && call.color === area.limbal);
  const want = (INSIDE_IRIS.limbusTo - INSIDE_IRIS.limbusFrom) * FINE;
  check(limbus.length === want, `the fine limbus is ${limbus.length} hairlines rather than ${want}`);
  const radii = limbus.map((call) => call.r).toSorted((a, b) => a - b);
  const holes = radii.filter((r, index) => index > 0 && r - radii[index - 1] !== 1).length;
  check(holes === 0, `the fine limbus has ${holes} gaps in it, so the rim is a stack of rings rather than a band`);

  const monoFine = run(true, true);
  const monoCoarse = run(false, true);
  const hairlines = monoFine.filter((call) => call.verb === "fineRing").length;
  check(
    hairlines === discs.length + want,
    `the tube's iris draws ${hairlines} hairlines where ${discs.length} bands and ${want} of rim want ${discs.length + want}`,
  );
  check(
    monoFine.filter((call) => call.verb === "disc" || call.verb === "fineDisc").length === 0,
    "the tube's iris fills a band, and a tube has one ink — a filled band is a solid screen",
  );
  check(
    monoCoarse.filter((call) => call.verb.startsWith("fine")).length === 0,
    "the tube's classic iris reached for a fine-grid verb",
  );
}

// How many of a fight's hits leave the health bar exactly where it was. A bar
// read per hit rather than per frame has to answer every one of them.
function barStalls(radius, hits, unit) {
  let worst = 0;
  let previous = Math.round(radius * 2 * unit);
  for (let left = hits - 1; left >= 0; left -= 1) {
    const width = Math.round(radius * 2 * (left / hits) * unit);
    if (width === previous) {
      worst += 1;
    }
    previous = width;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// 23. THE GAZE and THE LOOSE PUPIL (SHA-236) — the last of the pass.
//
// Everything left in the Observer is a clock or a hitbox. A clock photographs
// perfectly however wrong it is, and a hitbox photographs nothing at all, so
// none of this is a thing a screenshot could have caught.
{
  const { beamWidth, chargeTicks, fireTicks } = gameConfig.observer.gaze;
  const { irisRadius, pupilRadius } = gameConfig.observer.eye;

  // -- The hatching: two places, or twenty-one. --
  const stops = (unit) => new Set(Array.from({ length: 240 }, (_, frame) => rungSlide(frame, unit)));
  check(
    stops(1).size === GAZE_BEAM.coarseStops.length,
    `the coarse hatching has ${stops(1).size} places rather than the ${GAZE_BEAM.coarseStops.length} it alternates between`,
  );
  const wanted = GAZE_BEAM.rungPitch * FINE;
  check(
    stops(FINE).size === wanted,
    `the fine hatching has ${stops(FINE).size} places in its pitch rather than ${wanted}`,
  );
  const walk = Array.from({ length: wanted + 1 }, (_, frame) => Math.round(rungSlide(frame, FINE) * FINE));
  const steps = new Set(walk.slice(1, -1).map((at, index) => at - walk[index]));
  check(
    steps.size === 1 && steps.has(1),
    `the hatching advances ${[...steps].join("/")} fine px a frame rather than exactly one`,
  );
  check(walk.at(-1) === walk[0], "the hatching does not close on itself, so the beam jumps once a pitch");

  // -- The hitbox, which is the one thing the drawing may not outgrow. --
  check(beamNestFits(beamWidth), `the beam's nest ${BEAM_NEST.join("/")} does not sit inside ${beamWidth} game px`);
  check(
    BEAM_NEST[0] === beamWidth * FINE,
    `the beam is drawn ${BEAM_NEST[0]} fine px wide against a hitbox of ${beamWidth * FINE}`,
  );
  check(
    BEAM_NEST.at(-1) >= 1 && BEAM_NEST.length === 3,
    `Part B's nest is three tones and its core is at least a pixel; this one is ${BEAM_NEST.length} and ${BEAM_NEST.at(-1)}`,
  );

  // -- The charge ring, over every socket in the game. --
  const sockets = LEVELS.flatMap((level) => (level.observer?.eye ? [level.observer.eye.hh] : []));
  check(sockets.length > 0, "no sockets found, so the charge ring was checked against nothing");
  let worstCoarse = Infinity;
  let bestFine = 0;
  let stuck = 0;
  for (const hh of sockets) {
    const inner = Math.round(hh * pupilRadius) + 2;
    const outer = Math.round(hh * irisRadius);
    const coarse = chargeSteps(inner, outer, chargeTicks, 1);
    const fine = chargeSteps(inner, outer, chargeTicks, FINE);
    worstCoarse = Math.min(worstCoarse, coarse);
    bestFine = Math.max(bestFine, fine);
    if (fine <= coarse) {
      stuck += 1;
    }
    // A ring cannot show more radii than there are frames to show them in.
    if (fine > chargeTicks) {
      failures.push(
        `a socket of hh ${hh} shows ${fine} radii over ${chargeTicks} ticks, which is more than it has frames`,
      );
    }
  }
  check(
    stuck === 0,
    `${stuck} sockets close their charge ring in no more steps on the fine grid than on the coarse one`,
  );
  // Stated as what the player sees rather than as a count: the smallest socket's
  // ring holds each radius for an eighth of a second, so the warning arrives in
  // six visible jumps. If that ever stops being true the fix has been done twice.
  const held = chargeTicks / worstCoarse;
  check(
    held > 4,
    `the coarse charge ring's worst socket holds a radius for ${held.toFixed(1)} frames, so there was nothing here to fix`,
  );
  check(
    bestFine > Math.max(...sockets.map(() => worstCoarse)),
    `the fine ring's best socket shows ${bestFine} radii, which is no better than the coarse grid's worst`,
  );

  // Classic is a multiplication by one around the rounding it already did, and
  // that is the whole reason it can be the regression net. Pinned literally.
  let drifted = 0;
  for (let step = 0; step <= 100; step += 1) {
    const progress = step / 100;
    if (chargeRadius(10, 30, progress, 1) !== Math.round(30 - 20 * progress)) {
      drifted += 1;
    }
  }
  check(drifted === 0, `the coarse charge radius drifts from the shipped expression at ${drifted} of 101 points`);

  // -- The health bar: the one readout in this pass that goes fine. --
  //
  // Read per hit rather than per frame, so a step of zero is the bar failing to
  // answer. Checked over every count the game can deal — THE LID's fixed
  // twenty-four, and the chamber's base plus three for each veil the player is
  // deep — and then the cliff beyond them is pinned on both grids, because the
  // margin is what a future config change walks off.
  const { radius: lidRadius, hits: lidHits } = gameConfig.observer.lid;
  const { radius: insideRadius, baseHits, hitsPerVeil } = gameConfig.observer.inside;
  const veils = LEVELS.filter((level) => level.observer).length;
  const dealt = [
    { what: "the lid's pupil", radius: lidRadius, hits: lidHits },
    ...Array.from({ length: veils }, (_, index) => ({
      what: `the chamber's pupil at veil ${index + 1}`,
      radius: insideRadius,
      hits: baseHits + hitsPerVeil * index,
    })),
  ];
  for (const fight of dealt) {
    const stalled = barStalls(fight.radius, fight.hits, FINE);
    check(
      stalled === 0,
      `${fight.what} takes ${fight.hits} hits and ${stalled} of them leave the bar exactly where it was`,
    );
  }
  const cliff = (radius, unit) => {
    for (let hits = 2; hits < 400; hits += 1) {
      if (barStalls(radius, hits, unit) > 0) {
        return hits;
      }
    }
    return Infinity;
  };
  const deepest = Math.max(...dealt.map((fight) => fight.hits));
  const coarseCliff = cliff(insideRadius, 1);
  const fineCliff = cliff(insideRadius, FINE);
  // The margin, which is the number worth knowing: five hits, and a veil is
  // worth three of them. Two more veils and the coarse bar starts lying.
  check(
    coarseCliff - deepest <= hitsPerVeil * 2,
    `the coarse bar's first stall is at ${coarseCliff} hits against a deepest fight of ${deepest} — ${coarseCliff - deepest} of margin, which was never the risk this pins`,
  );
  check(
    fineCliff > deepest * 2,
    `the fine bar's first stall is at ${fineCliff} hits against a deepest fight of ${deepest} — not the headroom this was for`,
  );

  // The beam's reach is a gesture: whole length after a fifth of the fire, so
  // the fine grid must not have quietly turned it into a delay.
  const full = Math.ceil(fireTicks / 5);
  check(
    full < fireTicks / 2,
    `the beam takes ${full} of its ${fireTicks} ticks to reach, which is a delay and not a gesture`,
  );
}

console.log(
  `Checked mix, BAYER, dither, pillRows, disc, ring, vgrad, scale3x, the HD ball, the HD deck, the HD capsule, the frame's rails, the weight of a dashed line, the tube's reading of all four, the four baked figures, the almond, the iris and the pupil at three sockets, the tear, the veins and the hollow on the levels that carry them, the screen a faded eye survives on the tube, the dial's circles and dash on both grids, the bestiary's bakes, flashes and bosses, the diadem's breath and the gate's march, the chamber iris's fibre walk, seed and collars, and the gaze's two clocks against the hitbox it may not outgrow.`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} raster failure(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("The fine-grid raster holds every invariant the HD recipes are written against.");
