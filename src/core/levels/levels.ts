import type { LevelDefinition } from "@interfaces/types";

export const LEVELS: readonly LevelDefinition[] = [
  {
    name: "SUNRISE",
    rows: ["111111111111", "222222222222", "333333333333", "444444444444", "555555555555"],
  },
  {
    name: "PYRAMID",
    rows: [".....55.....", "....5445....", "...433334...", "..32222223..", ".3111111113."],
  },
  {
    name: "GATEWAY",
    rows: ["SS........SS", "SS4......4SS", "..44....44..", "...333333...", "....2222....", "SS...11...SS"],
  },
  {
    name: "VORTEX",
    rows: ["111111111111", "1..........1", "1.SSSSSSSS.1", "1.S......S.1", "1.S.GGGG.S.1", "1.SSSSSSSS.1"],
  },
  {
    name: "FINALE",
    rows: ["GGGGGGGGGGGG", "S5S5S5S5S5S5", "444444444444", "S3S3S3S3S3S3", "GG22222222GG", "S1S1S1S1S1S1"],
  },
];

export function levelAt(level: number): LevelDefinition {
  return LEVELS[level % LEVELS.length];
}
