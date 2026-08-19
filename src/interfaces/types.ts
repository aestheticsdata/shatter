import type { PowerUpKind } from "@core/config/powerUps";

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

export type ScreenName = "title" | "serve" | "play" | "pause" | "clear" | "over" | "scores" | "entry" | "levels";

export type BrickKind = "1" | "2" | "3" | "4" | "5" | "S" | "G";

export interface BrickCell {
  kind: BrickKind;
  hitPoints: number;
  points: number;
  hurt: boolean;
  // The capsule this brick drops when a ball or a laser kills it, or `null` —
  // which is most bricks. Rolled once when the wall was built rather than at the
  // moment of the kill, which is what gives XRAY something true to show; see
  // `rollBrickCapsule` in `ShatterGame`. Indirect kills discard it, exactly as
  // they have always dropped nothing.
  capsule: PowerUpKind | null;
}

export interface BrickHit {
  cell: BrickCell;
  row: number;
  column: number;
}

// Inferred from the capsule roster in `@core/config/powerUps`, so a new capsule
// widens this union by itself. Re-exported here because every consumer already
// reaches for its types through this module.
export type { PowerUpKind };

export type BrickFlashKind = "death" | "blast";

// Floating text acknowledging a capsule catch at the paddle.
export interface CatchPop {
  x: number;
  y: number;
  label: string;
  malus: boolean;
  ticksLeft: number;
}

// One arc of CHAIN lightning between two brick centres. Render-only, and it
// outlives the damage it announced: the bricks are already gone.
export interface ChainBolt {
  points: Vector2D[];
  ticksLeft: number;
}

// Expanding ring left where a ball stood when STASIS let go of it. Render-only:
// it marks the release, nothing collides with it.
export interface StasisRing {
  x: number;
  y: number;
  ticksLeft: number;
}

// One BANANA peel, lying on the rail the paddle slides along. It has no height
// to speak of and nothing else on the field collides with it: the deck sweeping
// over its span is the whole interaction.
export interface Peel {
  x: number;
  ticksLeft: number;
}

// One BUMPERS disc: its centre, and what is left of the flash from its last
// kick. All five share one radius, which lives in the config; the count itself
// is `FALLBACK_LAYOUT`'s length in `BumperField`, so it moves in one place.
export interface Bumper {
  x: number;
  y: number;
  flashTicksLeft: number;
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
  // DEMAKE: the downgrade is the whole machine, so the panel goes with the
  // field. The Panel owns the class; what it means lives in `components.css`.
  demakeActive: boolean;
  muted: boolean;
}
