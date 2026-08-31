import { wordRows } from "@core/levels/wordFont";

import type { LevelDefinition } from "@interfaces/types";

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
