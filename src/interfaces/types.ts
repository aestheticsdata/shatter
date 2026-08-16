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

export type PowerUpKind = "E" | "M" | "L" | "P" | "B" | "W" | "T" | "X" | "J" | "N" | "S";

export type BrickFlashKind = "death" | "blast";

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

export interface LevelDefinition {
  name: string;
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
