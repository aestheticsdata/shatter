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

export type ScreenName =
  | "title"
  | "serve"
  | "play"
  | "pause"
  | "clear"
  | "over"
  | "scores"
  | "entry"
  | "levels"
  | "capsules";

export type BrickKind = "1" | "2" | "3" | "4" | "5" | "S" | "G";

/**
 * What a chunk of debris is a chunk of.
 *
 * Every brick, and the deck. The simulation names the material and the renderer
 * owns its tones — which is why this widens with a member rather than the burst
 * widening to take colours: a paddle tearing in two throws pieces of paddle,
 * and nothing in the core has to learn what blue the paddle is to say so.
 */
export type ChunkMaterial = BrickKind | "deck";

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

// One BANANA peel, thrown clear of the deck that ate the banana and then lying
// on the rail the paddle slides along. It has no height to speak of and nothing
// else on the field collides with it: the deck sweeping over the span it came
// to rest on is the whole interaction.
export interface Peel {
  // Where it lands, and where it is drawn from the moment it has.
  x: number;
  ticksLeft: number;
  // The throw, counted one past the end: above 0 the peel is still in the air
  // and no hazard at all, exactly 0 is the tick it lands and squashes on, below
  // 0 it is at rest. With `fromX` — the deck centre it was thrown from — and
  // `x`, this is the whole parabola: the renderer keeps no state of its own.
  flightTicksLeft: number;
  fromX: number;
}

// A 1 px mark on the rail the deck has just given up, left only by JAMMER
// (SHA-85): a trap taking the wood away is the thing being said, and the mark
// is how long you can still see where it was. Render-only.
/**
 * One of the three pieces the deck comes apart into when a BOMB is caught.
 *
 * `x` is the piece's centre, not its left edge: the shard burns down to nothing
 * over the break, and a piece that shrank toward one end would be sliding while
 * it did it. `width` is what it was cut at — the drawn width is that times the
 * break blend.
 */
export interface PaddleShard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
}

export interface RailMark {
  x: number;
  width: number;
  ticksLeft: number;
}

// One BUMPERS disc: its centre, and what is left of the flash from its last
// kick. All five share one radius, which lives in the config; the count itself
// is `FALLBACK_LAYOUT`'s length in `BumperField`, so it moves in one place.
export interface Bumper {
  x: number;
  y: number;
  flashTicksLeft: number;
  // The disc's own two ends. While either is running the disc is a ring and not
  // a surface: `arriveTicksLeft` counts its ring closing onto the spot it will
  // occupy — and can start above `arriveTicks`, which is the disc waiting its
  // turn in the stagger — and `leaveTicksLeft` counts the ring travelling back
  // out after the power is cut, with the record spliced when it reaches zero.
  arriveTicksLeft: number;
  leaveTicksLeft: number;
}

export interface BrickFlash {
  x: number;
  y: number;
  ticksLeft: number;
  kind: BrickFlashKind;
  // Killed behind PAYDAY's front, so it flashes gold rather than white.
  gild: boolean;
  // Whether the position above is in wall coordinates. Brick flashes ride the
  // wall while QUAKE's is still falling; the paddle's own death flash is on the
  // rail and stays where it was put.
  onWall: boolean;
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
  // PAYDAY or TURBO: the SCORE readout blinks while points are worth more than
  // they say. Which capsule is doing it is the POWER inset's job to name.
  scoreBoosted: boolean;
  // DEMAKE: the downgrade is the whole machine, so the panel goes with the
  // field. The Panel owns the class; what it means lives in `components.css`.
  demakeActive: boolean;
  muted: boolean;
}
