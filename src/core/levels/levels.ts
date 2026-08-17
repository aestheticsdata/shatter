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
