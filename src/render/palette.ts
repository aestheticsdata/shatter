import type { BrickKind, PowerUpKind } from "@interfaces/types";

export interface BrickColorSet {
  flat: string;
  light: string;
  dark: string;
}

export const BRICK_COLORS: Record<BrickKind, BrickColorSet> = {
  "1": { flat: "#e8384f", light: "#ff8a9c", dark: "#8e1220" },
  "2": { flat: "#f07d10", light: "#ffc27a", dark: "#8a3d00" },
  "3": { flat: "#ffcf1c", light: "#fff59a", dark: "#8a6a00" },
  "4": { flat: "#3fbf4f", light: "#a6f0a6", dark: "#155c1f" },
  "5": { flat: "#2d7fe0", light: "#a8d8ff", dark: "#0b3a78" },
  S: { flat: "#b0b4cc", light: "#f2f4ff", dark: "#5a5e80" },
  G: { flat: "#dfae2c", light: "#ffe9a0", dark: "#7a5a08" },
};

export const DROP_COLORS: Record<PowerUpKind, string> = {
  E: "#2d7fe0",
  M: "#3fbf4f",
  L: "#e8384f",
  P: "#ffcf1c",
};

export const canvasPalette = {
  fieldBackground: "#0b0b26",
  starColors: ["#232a52", "#3a4a86", "#7f92c8"],
  wallLight: "#dbe4ff",
  wallShade: "#8f9ac8",
  paddleBody: "#2d7fe0",
  paddleCap: "#e8384f",
  paddleTopSheen: "#a8d8ff",
  paddleBottomShade: "#0b3a78",
  laserCannon: "#ffcf1c",
  ballBody: "#ffe14a",
  ballHighlight: "#fff9d0",
  ballShade: "#c98f0a",
  laserShot: "#ffcf1c",
  dropLetterLight: "#ffffff",
  dropLetterDark: "#0b0b26",
  dropSheen: "#ffffff",
  dropShade: "#0b0b26",
} as const;
