import { isBrickKind } from "@core/config/bricks";
import { gameConfig } from "@core/config/GameConfig";
import { wordRows } from "@core/levels/wordFont";

import type { LevelDefinition, SeededDrop } from "@interfaces/types";

// `background` picks the playfield theme (see `src/render/backgrounds.ts`).
// Two rules when adding or reordering levels: never repeat a theme on adjacent
// levels — including across the wrap, since the run loops back to level 1 —
// and prefer a theme that suits the layout (SUNRISE over a horizon, MAZE on
// blueprint grid). `pnpm run check:backgrounds` verifies the adjacency rule.
export const LEVELS: readonly LevelDefinition[] = [
  {
    name: "SUNRISE",
    background: "horizon",
    rows: ["111111111111", "222222222222", "333333333333", "444444444444", "555555555555"],
  },
  {
    name: "SMILEY",
    background: "starfield",
    rows: ["..55....55..", "..55....55..", "............", ".3........3.", "..33....33..", "....3333...."],
  },
  {
    name: "PYRAMID",
    background: "vault",
    rows: [".....55.....", "....5445....", "...433334...", "..32222223..", ".3111111113."],
  },
  {
    name: "CHOMP",
    background: "cathode",
    rows: [".111.....22.", "1111....2222", "111...5.2222", "1111....2222", ".111....2.2."],
  },
  {
    name: "GATEWAY",
    background: "grid",
    rows: ["SS........SS", "SS4......4SS", "..44....44..", "...333333...", "....2222....", "SS...11...SS"],
  },
  {
    name: "HEART",
    background: "nebula",
    rows: ["...55..55...", "..55555555..", "..44444444..", "...333333...", "....2222....", ".....11....."],
  },
  {
    name: "VORTEX",
    background: "planet",
    rows: ["111111111111", "1..........1", "1.SSSSSSSS.1", "1.S......S.1", "1.S.GGGG.S.1", "1.SSSSSSSS.1"],
  },
  {
    name: "BOLT",
    background: "circuit",
    rows: [
      "......555...",
      ".....555....",
      "....555.....",
      "...555555...",
      "....555.....",
      "...55.......",
      "..5.........",
    ],
  },
  {
    name: "CHECKER",
    background: "vault",
    rows: ["1.2.3.4.5.1.", ".2.3.4.5.1.2", "3.4.5.1.2.3.", ".4.5.1.2.3.4", "5.1.2.3.4.5."],
  },
  {
    name: "INVADER",
    background: "starfield",
    rows: [
      "...2.....2..",
      "....2...2...",
      "...2222222..",
      "..22.222.22.",
      ".22222222222",
      ".2.2222222.2",
      ".2.2.....2.2",
      "....22.22...",
    ],
  },
  {
    name: "RAMPART",
    background: "grid",
    rows: ["SS.SS..SS.SS", "444444444444", "..3..33..3..", "222222222222", "1.1..11..1.1"],
  },
  {
    name: "ROCKET",
    background: "planet",
    rows: [
      ".....11.....",
      "....1111....",
      "....1221....",
      "....1221....",
      "....1111....",
      "...511115...",
      "..5.1111.5..",
      "...5.55.5...",
    ],
  },
  {
    name: "HELIX",
    background: "nebula",
    rows: ["55........55", "..44....44..", "....SSSS....", "....SSSS....", "..22....22..", "11........11"],
  },
  {
    name: "TETRA",
    background: "cathode",
    rows: ["........5...", "........5...", "............", "11224433.211", "22114433.112", "44332211.421"],
  },
  {
    name: "ORBIT",
    background: "starfield",
    rows: ["....5555....", "..55....55..", ".5..GGGG..5.", ".5..GGGG..5.", "..55....55..", "....5555...."],
  },
  {
    name: "COOL",
    background: "circuit",
    rows: wordRows("COOL", ["1", "2", "3", "4"]),
  },
  {
    name: "HIVE",
    background: "vault",
    rows: ["3.3.3.3.3.3.", ".4.4.4.4.4.4", "3.3.3.3.3.3.", ".4.4.4.4.4.4", "S.S.S.S.S.S.", ".G.G.G.G.G.G"],
  },
  {
    name: "DNA",
    background: "nebula",
    rows: [
      ".1GGGGGGGG5.",
      "..1......5..",
      "...1....5...",
      "....1GG5....",
      "...5....1...",
      "..5......1..",
      ".5GGGGGGGG1.",
    ],
  },
  {
    name: "SERPENT",
    background: "horizon",
    rows: ["222222222222", "...........2", "333333333333", "3...........", "444444444444"],
  },
  {
    name: "SKULL",
    background: "cathode",
    rows: ["..44444444..", ".4444444444.", ".44..44..44.", ".4444..4444.", "..44444444..", "..S4S44S4S.."],
  },
  {
    name: "MIRROR",
    background: "grid",
    rows: ["111......SSS", "22........SS", "333......SSS", "22........SS", "111......SSS"],
  },
  {
    name: "BUNKER",
    background: "vault",
    rows: ["....GGGG....", "..SSSSSSSS..", ".S........S.", ".S.555555.S.", ".S.555555.S.", ".SSSSSSSSSS."],
  },
  {
    name: "CASCADE",
    background: "horizon",
    rows: ["GG..........", "11GG........", "..11GG......", "....11GG....", "......11GG..", "........11GG"],
  },
  {
    name: "PLAY",
    background: "circuit",
    rows: wordRows("PLAY", ["2", "3", "4", "5"]),
  },
  {
    name: "MAZE",
    background: "grid",
    rows: [
      "SSSSSSSSSSSS",
      "S........S.S",
      "S.SSSSSS.S.S",
      "S.S.GG.S.S.S",
      "S.S.GG.S.S.S",
      "S.S....S...S",
      "SS.SSSSSS.SS",
    ],
  },
  {
    name: "OMEGA",
    background: "planet",
    rows: ["...SSSSSS...", "..S......S..", "..S.2222.S..", "..S......S..", "...S....S...", ".GGG....GGG."],
  },
  {
    name: "1991",
    background: "cathode",
    rows: wordRows("1991", ["G", "S", "G", "S"]),
  },
  {
    name: "PILLARS",
    background: "vault",
    rows: [
      "S.S.S.S.S.S.",
      "5.5.5.5.5.5.",
      "4.4.4.4.4.4.",
      "3.3.3.3.3.3.",
      "2.2.2.2.2.2.",
      "1.1.1.1.1.1.",
      "G.G.G.G.G.G.",
    ],
  },
  {
    name: "GALAXY",
    background: "nebula",
    rows: [
      "..S555....S.",
      "......55555.",
      ".....GG..35.",
      "..32GGGG23..",
      ".53..GG.....",
      ".55555......",
      ".S....555S..",
    ],
  },
  {
    name: "SUPER MAZE",
    background: "grid",
    rows: [
      "RRRRRRRRRRRR",
      "R..........R",
      "R.RR.RR.RR.R",
      "R.R......R.R",
      "R.R.RR.R.R.R",
      "R...R..R...R",
      "RRR.R.RR.RRR",
      "RR..R.RR..RR",
    ],
    // MAZE's big sibling: the corridors are one cell wide again, but the walls
    // are 53 granite bricks and nothing else — 212 ball hits, or 106 laser
    // bolts. Three mouths in the bottom face let the ball in rather than leaving
    // it to skim the front, and every open cell is reachable from every one of
    // them, so a ball that gets in can get anywhere.
    //
    // Which makes the two LASERs the level rather than a bonus on it. The first
    // is in the bottom face between the left and middle mouths, where a ball
    // working along the front finds it early; the second is dead centre with
    // three open sides, deep enough that reaching it is the middle of the run.
    drops: [
      { row: 7, column: 4, kind: "L" },
      { row: 4, column: 7, kind: "L" },
    ],
  },
  // The run's one exhale, and its only joke. SUPER MAZE before it is 212 hits of
  // granite; this is eleven bricks on an empty court. Two three-brick gold bars
  // hug the side walls at opposite heights, a dotted blue net runs down the
  // middle column, and the silver ball sits one cell past it — high paddle,
  // ball, low paddle, stepping down the diagonal a rally is already on.
  //
  // The ball is beside the net rather than on it because a silver brick with a
  // blue one hard above and below reads as a length of net and not as a ball at
  // all; off the line it has air on four sides. Dot and ball straddle the exact
  // centre of the court between them, which is the closest either gets on their
  // own: twelve columns have no middle cell, only a seam between the sixth and
  // the seventh.
  //
  // 87 % of the cells are air, which is the gag and also the whole difficulty.
  // The 24 hits are nothing; finding the last of them is, because by then what
  // is left is one 30x12 brick alone in open space with no neighbours to catch a
  // stray. The level is the chase, not the wall.
  {
    name: "PONG",
    background: "cathode",
    rows: [
      "G....5......",
      "G...........",
      "G....5......",
      "......S.....",
      ".....5.....G",
      "...........G",
      ".....5.....G",
    ],
  },
  // A peg board, and the ball is the ball. Sixteen lone gold pegs in four
  // staggered courses under a solid blue shelf. G is three hits, which is the
  // whole reason the pegs are gold: a peg survives being struck, so the board
  // thins over the run instead of falling out of it, and the ball goes on
  // rattling off the same pegs it has already been rattling off.
  //
  // The stagger is a period of three offset by two, which makes every course
  // the mirror of the one above and leaves three of each four pegs corner to
  // corner with one in the next course down. A shared corner is a point and not
  // a gap, so those pairs are little diagonal deflectors a climbing ball cannot
  // slip between — the thing a peg board is for. Four courses and not five:
  // two of them run flush to the left wall and two to the right, and an odd
  // number would stand one more peg against one wall than the other.
  //
  // Columns 1, 4, 7 and 10 carry no peg at any depth, so four clear shafts run
  // from the deck to the shelf. Kept on purpose. A board with no way through it
  // is a wall, and a ball that leaves the deck steep enough to thread one,
  // spend itself along the prizes and come back down the same shaft is the
  // level's one lucky drop.
  //
  // The shelf is solid and sits straight on top of the pegs rather than a row
  // above them, because it is the ceiling as much as the prize: a ball that
  // gets up there is held in the board rather than sailing over it. 28 bricks,
  // 60 hits, 4400 points.
  {
    name: "PACHINKO",
    background: "vault",
    rows: ["555555555555", "G..G..G..G..", "..G..G..G..G", "G..G..G..G..", "..G..G..G..G"],
  },
  // A padlock, gutted through its own keyhole. BUNKER's cousin and its
  // opposite: that one packs a core of blue inside a silver shell and the shell
  // is a lid to be broken off, this one is hollow and has a way in. The cavity
  // *is* the keyhole — a chamber four cells wide under the body's top course,
  // narrowing to a two-cell slot that runs down and out through the foot — and
  // it is the only opening in the lock. Plug those two cells and the whole
  // interior seals.
  //
  // The slot is two cells because twelve columns have no middle one: a single
  // cell cannot be centred, and the pair either side of the seam is the
  // narrowest mouth that can be. It is also 60 px against an 8 px ball, which
  // is a mouth a player can steer for rather than one they hit by accident —
  // and 48 px of cavity above it, so a ball that gets in has room to work.
  //
  // Nothing forces the trip. Every brick is reachable from outside, so the lock
  // can be taken apart the ordinary way; threading it just puts the ball on the
  // inner faces, where the silver is two hits deep on both sides of it at once.
  // Autoplay finds the slot one to seven times a run, sometimes on the first
  // serve with all 46 bricks standing.
  //
  // The shackle's legs are one cell, not two. Two read as a second block
  // stacked on the body; one reads as wire, and it opens the loop to 120 x 24 —
  // big enough to be a loop instead of a notch. That loop is the level's one
  // sealed pocket, and no brick is in it, so nothing is lost behind it. The
  // body's shoulders and foot are stepped in for the same reason the legs are
  // thin: a rectangle with a slot in it is a bar, and this has to be a lock.
  // 46 bricks, 102 hits, 7400 points.
  {
    name: "KEYHOLE",
    background: "grid",
    rows: [
      "...GGGGGG...",
      "...G....G...",
      "...G....G...",
      "..SSSSSSSS..",
      ".SSS....SSS.",
      ".SSSS..SSSS.",
      ".SSSS..SSSS.",
      "..SSS..SSS..",
    ],
  },
  // One eye, filling the wall, looking down the field at the deck. An eight-row
  // almond of soft brick — red at the tips, orange where it meets the iris — a
  // silver ring one cell thick all the way round, and a granite pupil.
  //
  // **The pupil is granite and not the ticket's gold, and the ticket is why.**
  // It was written on 21 August, when gold was the hardest brick in the game;
  // granite landed ten days later with SUPER MAZE. The line the level is named
  // for is "the armored pupil", so it takes whatever the armour brick currently
  // is. It is also the only body on the roster that is the colour a pupil
  // actually is: gold against an orange sclera read as a warm blob with no
  // centre at all, and charcoal reads as a hole. Granite chips visibly over its
  // four states, so the pupil cracks while it is being stared at.
  //
  // Four columns wide because twelve columns have no middle one, and four cells
  // by three rows is 120 x 36 — the closest to round anything gets on a grid of
  // 30 x 12 cells. The iris sits one row below the almond's centre, which is
  // what makes the eye look down rather than out.
  //
  // The white is banded by one rule and not by decoration: a soft brick touching
  // the iris is a 2, every other one is a 1. That puts the warm tone against the
  // silver and leaves the tips red, which is what reads as a curve rather than
  // as a slab — and it is why the bottom tip is orange and the top tip is not,
  // since the iris is a row nearer the bottom.
  //
  // **What the ticket promises and the wall cannot deliver:** "all that's left
  // staring" is not a guarantee and no arrangement makes it one. Over six
  // autoplayed runs the pupil is alive for 87 % of the level and is the last
  // brick standing in two of them. Which brick is genuinely last is positional
  // and not a matter of hit points — it is whichever one the ball has not
  // happened to reach, and on a wall this wide that is usually a lone soft brick
  // out at a tip. A bigger pupil, a granite iris, trimming the tips off the
  // almond and sliding the pupil a row up or down were all measured; none of
  // them moved it. The armour buys the reading, not the certainty.
  // 68 bricks, 122 hits, 8180 points.
  {
    name: "EYE",
    background: "nebula",
    rows: [
      "....1111....",
      "..12222221..",
      ".12SSSSSS21.",
      "112SRRRRS211",
      "112SRRRRS211",
      ".12SRRRRS21.",
      "..2SSSSSS2..",
      "....2222....",
    ],
  },
  // An hourglass: two sand piles pinched at a one-brick gold neck. Each
  // triangle grades 5-to-1 toward the waist in PYRAMID's two-tone rows — the
  // outer tier rides the row's ends, the next one fills it — so all five tiers
  // are present in three rows and the pinch is red-hot where it meets the gold.
  //
  // Twelve columns have no middle one, and a neck of one brick cannot sit on a
  // seam. Rather than hang a lopsided neck under centred bulbs, the whole glass
  // is centred on column 5: eleven columns of perfect symmetry and a clear
  // shaft down the right wall, PACHINKO's lucky lane again — the one way a ball
  // gets above the glass without going through it.
  //
  // The funnel is the air, not the sand. The wedges either side of the glass
  // lose two cells of height per column and close to a one-row slot against the
  // neck, so a ball working inward is squeezed onto the gold's flanks — and the
  // neck is the only brick in its row, so cracking it opens a clean channel and
  // visibly snaps the level in two, one pile drifting over the other.
  //
  // The ticket says TEMPO and STASIS are made for this level, so the level
  // promises them: both pinned to the spine, bullet time in the top bulb where
  // the sand still flows, full stop in the bottom one where it has already
  // fallen. 43 bricks, 45 hits, 3600 points — the exhale after EYE's 122, the
  // way PONG breathes out after SUPER MAZE.
  {
    name: "HOURGLASS",
    background: "horizon",
    rows: [
      "54444444445.",
      "..3222223...",
      "....111.....",
      ".....G......",
      "....111.....",
      "..3222223...",
      "54444444445.",
    ],
    drops: [
      { row: 2, column: 5, kind: "T" },
      { row: 4, column: 5, kind: "I" },
    ],
  },
  // The arcade bug, three lanes of it, winding down the field toward the deck.
  // Alternating green and yellow segments along a single unbroken path — tail
  // at the top-left, gold head at the bottom-right — over a field of lone
  // silver mushrooms.
  //
  // **Every turn is a mushroom's fault, which is the whole homage.** In the
  // cabinet the centipede does not wind because winding looks nice; it walks
  // straight until something is in the way, then drops a row and reverses. So
  // the mushroom at the end of each lane is the reason that lane ends there:
  // one at the right of row 0, one at the left of row 3, and one directly in
  // front of the head, which is the turn it has not taken yet. Take those three
  // away and the shape stops meaning anything.
  //
  // The lanes sit three rows apart rather than two, and that spacing is load-
  // bearing twice over. It gives each descent two cells instead of one, so a
  // corner is four bricks tall and reads as a bend rather than a nick; and it
  // puts one column three segments away from itself across a turn, which is
  // odd, so the colour flips and each lane is staggered against the one above.
  // With a one-cell descent that distance is two, the parity comes back around,
  // and the body lands in vertical stripes — a checkerboard, not a bug.
  //
  // The wink at CRITTER is on the head, not in the flavour text: the gold is
  // seeded, and cracking it lets a grub out to eat its way across the same wall
  // the centipede is crawling over. 48 bricks, 65 hits, 5170 points — the
  // exhale carrying on from HOURGLASS before FLOPPY's 138.
  {
    name: "CENTIPEDE",
    background: "starfield",
    rows: [
      ".3434343434S",
      "..S...S...3.",
      "....S...S.4.",
      "S4343434343.",
      ".3.S...S...S",
      ".4...S...S..",
      ".34343434GS.",
      ".S...S...S..",
    ],
    drops: [{ row: 6, column: 9, kind: "CR" }],
  },
  // A 3.5-inch floppy, drawn the way the save icon draws it: label up, metal
  // shutter down. The icon is why — nobody has held one since the machines COOL
  // and 1991 are named after, but everybody still clicks one — and the deck is
  // why too: shutter-down puts the gold on the row the ball reaches first, so
  // the title's promise is load-bearing. The shutter is the armour plate of the
  // whole disk, three hits a cell across the front line, and it is still
  // standing when the shell behind it has gone.
  //
  // The body is silver shell one cell thick, inset a column from either wall so
  // the disk floats on the blueprint grid like a diskette on graph paper — and
  // so the two side lanes are the way behind it. The chamfer is one air cell
  // off the top-right corner, the missing corner that makes a square read as a
  // diskette; it is also the only air inside the outline, which makes this the
  // fullest wall in the game — 79 bricks where EYE carries 68.
  //
  // The label is tier 4 and not the yellow a cheerful label suggests, because
  // yellow and orange both sit inside the gold shutter's own family and a label
  // the colour of the shutter reads as more metal. Green is the one vivid tier
  // that reads as paper against both silvers. 79 bricks, 138 hits, 10530
  // points — the heaviest wall in the game, and the last one before FINALE.
  {
    name: "FLOPPY",
    background: "grid",
    rows: [
      ".SSSSSSSSS..",
      ".S44444444S.",
      ".S44444444S.",
      ".S44444444S.",
      ".S44444444S.",
      ".SSSSSSSSSS.",
      ".SSGGGGGGSS.",
      ".SSGGGGGGSS.",
    ],
  },
  {
    name: "FINALE",
    background: "starfield",
    rows: ["GGGGGGGGGGGG", "S5S5S5S5S5S5", "444444444444", "S3S3S3S3S3S3", "GG22222222GG", "S1S1S1S1S1S1"],
  },
];

// Runs loop past the last level; the wrapped index is also the background
// variant, so a level's field art is the same on every visit.
export function levelIndexOf(level: number): number {
  return level % LEVELS.length;
}

export function levelAt(level: number): LevelDefinition {
  return LEVELS[levelIndexOf(level)];
}

// Which rows a run's opening DEMAKE may be seeded in, counted from the bottom of
// the wall. Never the front two: those go in the opening rally, and a capsule
// meant to be the first level's showpiece may not fire before the player has a
// machine to miss.
const DEMAKE_SEED_ROWS_FROM_BOTTOM: readonly number[] = [3, 4, 5];

/**
 * The wall a level builds, which is `levelAt` plus the one capsule a run is
 * promised: **the first level always holds a DEMAKE**.
 *
 * It draws at a common's rate and the user has still twice said they never see
 * it, so the run opens by handing it over rather than hoping. One is pinned into
 * level 1's wall every run, in a random cell of whichever row
 * `DEMAKE_SEED_ROWS_FROM_BOTTOM` picks.
 *
 * Pinned through `drops` — the door SUPER MAZE's two LASERs already come
 * through — rather than by reaching into the built grid, which buys the whole of
 * what a seeded cell means for free: it comes out however the brick dies, splash
 * and bomb included, XRAY shows the truth about it, and the console's `bonus`
 * re-roll leaves it alone.
 *
 * **It costs the bag nothing.** A seeded capsule is not a draw, so the pass is
 * untouched and every other level's odds are exactly what they were — the
 * guarantee is added to the first level, not taken out of the rest of the run.
 * `FIRST_LEVEL_EXCLUDES` in `ShatterGame` is the other half of the rule: DEMAKE
 * stays barred from level 1's *rolls*, so the level holds this one and no other.
 * Lifting that bar would let a second land in the front row and fire on the
 * third brick, which is the thing these rows exist to prevent.
 */
export function wallFor(level: number): LevelDefinition {
  const definition = levelAt(level);
  if (level !== 0) {
    return definition;
  }
  const drop = openingDemakeDrop(definition);
  // Ours first: `BrickGrid.load` stamps drops in order, so a level that pins its
  // own capsule on the cell this one chose keeps it.
  return drop === null ? definition : { ...definition, drops: [drop, ...(definition.drops ?? [])] };
}

/**
 * A cell for the opening DEMAKE: a row drawn uniformly from the ones the rule
 * allows that actually hold a brick, then a column drawn uniformly from that
 * row's bricks.
 *
 * Rows are counted off the wall's own height rather than written down, so
 * editing SUNRISE or putting another level first still obeys the rule instead of
 * quietly pointing at rows that moved. `null` when none of the three holds a
 * brick, which no first level has ever been — a wall the rule cannot place in is
 * a wall without a promise, not a crash.
 */
function openingDemakeDrop(definition: LevelDefinition): SeededDrop | null {
  const candidates = DEMAKE_SEED_ROWS_FROM_BOTTOM.map((fromBottom) => definition.rows.length - fromBottom)
    .filter((row) => row >= 0)
    .map((row) => ({ row, columns: brickColumns(definition.rows[row]) }))
    .filter((candidate) => candidate.columns.length > 0);
  if (candidates.length === 0) {
    return null;
  }
  const { row, columns } = candidates[Math.floor(Math.random() * candidates.length)];
  return { row, column: columns[Math.floor(Math.random() * columns.length)], kind: "D" };
}

// Which columns of a row are bricks, over the grid's width rather than the
// string's: `BrickGrid.load` reads a short row as air past its end, and a
// promise placed in a cell the wall never built would be no promise at all.
function brickColumns(row: string): number[] {
  const columns: number[] = [];
  for (let column = 0; column < gameConfig.grid.columns; column++) {
    if (isBrickKind(row[column] ?? ".")) {
      columns.push(column);
    }
  }
  return columns;
}
