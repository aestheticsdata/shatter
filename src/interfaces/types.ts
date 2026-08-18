export interface Vector2D {
  x: number;
  y: number;
}

export interface RectangleBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type ScreenName = "title" | "serve" | "play" | "pause" | "clear" | "over" | "scores" | "entry";

export type BrickKind = "1" | "2" | "3" | "4" | "5" | "S" | "G";

export interface BrickCell {
  kind: BrickKind;
  hitPoints: number;
  points: number;
  hurt: boolean;
}

export interface BrickHit {
  cell: BrickCell;
  row: number;
  column: number;
}

// Inferred from the capsule roster in `@core/config/powerUps`, so a new capsule
// widens this union by itself. Re-exported here because every consumer already
// reaches for its types through this module.
export type { PowerUpKind } from "@core/config/powerUps";

export type BrickFlashKind = "death" | "blast";

// Floating text acknowledging a capsule catch at the paddle.
export interface CatchPop {
  x: number;
  y: number;
  label: string;
  malus: boolean;
  ticksLeft: number;
}

export interface BrickFlash {
  x: number;
  y: number;
  ticksLeft: number;
  kind: BrickFlashKind;
}

export interface BurstSpec {
  chunkCount: number;
  minChunkSize: number;
  maxChunkSize: number;
  minSpeed: number;
  maxSpeed: number;
  minLifeTicks: number;
  maxLifeTicks: number;
}

// Playfield background themes, painted in `src/render/backgrounds.ts`. Every
// level names one: no default, so a new level cannot silently inherit its
// neighbour's field.
export type BackgroundId = "starfield" | "nebula" | "grid" | "horizon" | "planet" | "circuit" | "cathode" | "vault";

export interface LevelDefinition {
  name: string;
  background: BackgroundId;
  rows: readonly string[];
}

export interface HiScoreEntry {
  name: string;
  score: number;
}

export interface ScoreRowView {
  rank: string;
  name: string;
  score: string;
  isTopRank: boolean;
}

export interface PanelView {
  score: number;
  hiScore: number;
  levelNumber: number;
  levelName: string;
  reserveLives: number;
  powerLabel: string;
  paydayActive: boolean;
  muted: boolean;
}
