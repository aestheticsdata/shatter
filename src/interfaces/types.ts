import type { BrickKind } from "@core/config/bricks";
import type { PowerUpKind } from "@core/config/powerUps";
import type { CreaturePin } from "@interfaces/creatures";
import type { EYE_ACT, EyeLayer, EyePathMode, EyeWatch } from "@interfaces/eye";
import type { ParticlePin } from "@interfaces/particles";

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

// Inferred from the brick roster in `@core/config/bricks`, exactly as
// `PowerUpKind` is from the capsule one, so a new brick widens this union by
// itself. Re-exported here because every consumer already reaches for its
// types through this module.
export type { BrickKind };

/**
 * What a chunk of debris is a chunk of.
 *
 * Every brick, and the deck. The simulation names the material and the renderer
 * owns its tones — which is why this widens with a member rather than the burst
 * widening to take colours: a paddle tearing in two throws pieces of paddle,
 * and nothing in the core has to learn what blue the paddle is to say so.
 */
export type ChunkMaterial = BrickKind | "deck" | "ribbon" | "wormhole";

export interface BrickCell {
  kind: BrickKind;
  hitPoints: number;
  points: number;
  // This brick's own stone, for the one kind that has any: the seed
  // `drawBrick` hashes granite's speckle out of, stamped from (row, column) when
  // the wall was built. Kept on the cell rather than recomputed from where the
  // brick is being painted, because those are not the same thing — QUAKE gives
  // the wall a row and slides every cell down into it, and a pattern read off
  // the paint would reshuffle for the ten ticks that takes.
  seed: number;
  // The capsule this brick drops when a ball or a laser kills it, or `null` —
  // which is most bricks. Rolled once when the wall was built rather than at the
  // moment of the kill, which is what gives XRAY something true to show; see
  // `rollBrickCapsule` in `ShatterGame`. Indirect kills discard it, exactly as
  // they have always dropped nothing — unless it was seeded.
  capsule: PowerUpKind | null;
  // Whether the capsule above was pinned by the level instead of rolled (see
  // `LevelDefinition.drops`). A seeded capsule is a promise and not a chance: it
  // comes out whatever killed the brick, splash and bomb included, it takes a
  // slot in a full pool rather than being dropped, and the dev console's `bonus`
  // re-roll leaves it alone.
  seeded: boolean;
  // THE WRATH's birth flicker, in ticks (SHA-175). Non-zero only on a brick the
  // Observer has put back, and only for the sixteen ticks it takes to cool into
  // the wall. On the cell rather than in a list beside the grid for `seed`'s
  // reason: QUAKE slides cells down by reference, and a flicker tracked by
  // (row, column) would stay behind on the row the brick has left.
  scarTicks: number;
  // MOULD (SHA-142): this brick grew back into a hole rather than being built.
  // It wears a permanent speckle so it never passes for the level's own stone,
  // and on the cell for `seed`'s reason — QUAKE slides cells by reference.
  grown: boolean;
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

// UMBRA's is the third and the only one that is not a kill: it is the caster
// lighting up as the band its shadow sent gets home, and it fires whether or
// not the hit took the brick with it.
export type BrickFlashKind = "death" | "blast" | "umbra";

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

/**
 * SNAP: the mark one snapped bounce leaves, at the point it happened.
 *
 * Render-only, and it outlives nothing — the ball is already gone down its new
 * diagonal, which is what the bracket and the dashes are pointing at. `dirX`
 * and `dirY` are the signs of the heading it left on, so a still frame says
 * which of the four diagonals the bounce chose.
 */
export interface SnapMark {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  ticksLeft: number;
}

/**
 * TRACER: one ball's answer to "where does this one come down".
 *
 * Rebuilt from scratch every tick rather than aged like a `SnapMark`, because it
 * is not a record of something that happened — it is a claim about the next
 * second, and a claim one frame stale is the one thing this capsule may not
 * serve. The simulation computes it, so the path drawn and the path predicted
 * are the same array rather than two walks that agree on a good day.
 *
 * `points` always holds at least the ball's own centre. A thread that could not
 * be honest all the way down simply has fewer of them and a null `pipX`; see
 * `@core/ballTrace`.
 */
export interface TracerThread {
  /** Ball centre, a point per side-wall bounce, then the deck rail. */
  points: readonly { x: number; y: number }[];
  /** The rail mark, or null when the walk gave up before reaching it. */
  pipX: number | null;
  /**
   * The ball arriving first, and the only one that draws its whole thread. The
   * others pin a pip and nothing else: twelve threads under SWARM is a cat's
   * cradle, twelve pips on a rail is a reading.
   */
  full: boolean;
  /**
   * A ball still on its way up, hanging a slack thread under itself. The held
   * cue, and the reason the capsule does not read as broken for the seconds it
   * has nothing to predict.
   */
  slack: boolean;
}

/**
 * PYRE: one spent ball, at the spot it went up.
 *
 * Render-only, and — like `ChainBolt` — it outlives the damage it announced:
 * every brick inside the crater died on the frame the player clicked, and this
 * is the fireball and the shockwave saying so over the next twenty-four ticks.
 * The debris was thrown on that same frame and is in the particle pool with
 * every other chunk of wall — what is left here is the light and the ring.
 */
export interface PyreBlast {
  x: number;
  y: number;
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
export type BackgroundId =
  | "starfield"
  | "nebula"
  | "grid"
  | "horizon"
  | "planet"
  | "circuit"
  | "cathode"
  | "vault"
  // THE OBSERVER (SHA-167): the five veils' field, and the only theme that is
  // painted around a point the level names — the eye's socket.
  | "observer";

// One capsule pinned to one cell of a level's wall, dropped by that brick on
// every run whatever kills it. Rows stay pure layout: a seeded drop is a
// property of the level, not a new character in its alphabet.
export interface SeededDrop {
  row: number;
  column: number;
  kind: PowerUpKind;
}

/**
 * THE OBSERVER (SHA-167): what a veil is, over and above a wall.
 *
 * The whole block is written the day a veil is authored, even where nothing
 * reads it yet — the brood's pins and the diadem's stars are placed against the
 * layout by eye, and a level whose creatures arrive three tickets later would
 * have to be re-composed then. `mode` is what the eye *does* on this veil, and
 * each mode is a ticket: veil watches (SHA-169), iris petrifies (SHA-173), tear
 * weeps (SHA-174), wrath rebuilds (SHA-175), lid seals (SHA-176).
 */
export interface ObserverDefinition {
  mode: "veil" | "iris" | "tear" | "wrath" | "lid";
  // The socket: centre, half-width, half-height, in field pixels. The background
  // is painted around this point and the almond is drawn on it.
  eye: { x: number; y: number; hw: number; hh: number };
  tint: "blue" | "red";
  // One line over the serve prompt, without the veil's own name — the screen
  // puts that in front of it.
  hint: string;
  // Eggs pinned on the band, the way SUPER MAZE pins its two LASERs (SHA-170).
  brood?: readonly { x: number; y: number; form: 0 | 1 | 2 }[];
  // Six star points in an arc under the socket (SHA-170).
  diadem: readonly (readonly [number, number])[];
  // `false` on THE LID and absent everywhere else, which is the whole of the
  // rule: a veil either has the three plaques or it is the one that does not,
  // and there is no third thing to write here (SHA-171).
  oculi?: false;
}

/** A window of the field, in field pixels. */
export interface FieldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * THE 43 (SHA-188): the Observer's posture on an ordinary level.
 *
 * One eye — the almond of SHA-169, unchanged — and what differs from level to
 * level is only where it is, how big, on which side of the wall, how visible,
 * and how much of it the field lets you see. A veil has its own block
 * (`ObserverDefinition`) and none of this; a level with neither has no eye.
 */
/**
 * What a placed eye does (SHA-200 on). One branch per shared trick.
 */
export type EyeAct =
  // THE RISE: the eye rides the wall coming down. `to` is where the socket has
  // got to by the last brick, eased there by the share of the wall broken;
  // `wakeAt` is the share past which it tracks the ball — before it, a dead
  // stare straight out.
  | {
      kind: typeof EYE_ACT.RISE;
      to?: { x?: number; y?: number; hw?: number; hh?: number; opacity?: number };
      wakeAt?: number;
    }
  // THE PATROL: back and forth between the socket and `to`, at most `speed`
  // pixels a tick, slowing into each turn; while a ball is inside `hold` it
  // eases to a stop where it is and watches.
  | {
      kind: typeof EYE_ACT.PATROL;
      to: { x: number; y: number };
      speed: number;
      hold?: FieldRect;
    }
  // THE PULSE: the socket swells to `scale` of itself and lets go, every
  // `period` ticks — a thump, a fifth of the beat up and the rest down.
  // `opacity`, when given, beats too: from its first number to its second.
  | { kind: typeof EYE_ACT.PULSE; scale: number; period: number; opacity?: readonly [number, number] }
  // THE STAIRS: `steps` are socket centres, in order; every blink the eye hops
  // to the next, the lid shut over the move, and landing on the last one with
  // `strike` flashes the field. The next blink takes it back to the first.
  | { kind: typeof EYE_ACT.STAIRS; steps: readonly (readonly [number, number])[]; strike?: boolean }
  // THE THROAT: while a ball is inside `zone`, THE IRIS's gaze is armed and
  // fires straight down the zone's middle — the deck under it turns to stone,
  // as on the veil. A shot that has started finishes; only a resting gaze is
  // put away.
  | { kind: typeof EYE_ACT.GAZE; zone: FieldRect }
  // THE PATH: the socket walks `points` at `speed` pixels a tick. A point may
  // carry an opacity and a scale the eye passes through on its way, which is
  // how a moon comes closer at the bottom of its orbit.
  | {
      kind: typeof EYE_ACT.PATH;
      points: readonly EyePathPoint[];
      speed: number;
      mode?: EyePathMode;
    }
  // THE HAUNT: a list of places, each held while any of its `guard` bricks
  // stands. When the last one falls the eye moves to the next place — on a
  // blink, or gliding at `glide` pixels a tick. A place with no guard is where
  // it ends up.
  | { kind: typeof EYE_ACT.HAUNT; spots: readonly EyeSpot[]; glide?: number }
  // THE DUCK: a ball within `near` of it and it blinks away to another of
  // `spots`, never the one it is leaving.
  | { kind: typeof EYE_ACT.DUCK; spots: readonly (readonly [number, number])[]; near: number }
  // THE BOUNCE: held at rest while any `guard` brick stands; then it is let
  // out, drifting inside `area` at `speed`, off its edges like a ball, at
  // `opacity`.
  | {
      kind: typeof EYE_ACT.BOUNCE;
      guard?: readonly (readonly [number, number])[];
      speed: number;
      area: FieldRect;
      opacity?: number;
    }
  // THE FOLLOW: it rides its own line — the socket's x — and follows the
  // ball's height between `min` and `max`, at most `speed` pixels a tick.
  | { kind: typeof EYE_ACT.FOLLOW; min: number; max: number; speed: number };

/** A point on THE PATH: where, and optionally how visible and how big there. */
export type EyePathPoint = readonly [number, number] | readonly [number, number, number, number];

/** A place THE HAUNT holds, and the bricks that keep it there. */
export interface EyeSpot {
  x: number;
  y: number;
  hw?: number;
  hh?: number;
  layer?: EyeLayer;
  clip?: FieldRect;
  guard?: readonly (readonly [number, number])[];
}

export interface EyePlacement {
  // The socket: centre, half-width, half-height, in field pixels.
  x: number;
  y: number;
  hw: number;
  hh: number;
  // Which side of the wall. `EYE_LAYER.BEHIND` is the veils' room: the wall
  // is drawn over it and it shows through the gaps. `EYE_LAYER.FRONT` is over
  // the wall, out where the ball is — and still not matter. Absent means behind.
  layer?: EyeLayer;
  // 1 is solid, which is what absent means. Under it the eye is drawn through
  // the field — a translucent almond in colour, a halftone one in DEMAKE.
  opacity?: number;
  // Only this window of the field shows it: the sun under the horizon, the
  // pilot through the porthole. Absent means the whole field.
  clip?: FieldRect;
  // No tint here on purpose: a placed eye is always the blue one. Red is a
  // veil's state (THE WRATH, THE LID), not a colour a level may pick.
  // THE BRICK EYE: the bricks it lives in, [column, row], in the order it moves
  // through them. It sits inside the first one still standing — drawn over the
  // brick and masked by the brick's face, a face pressed to a pane — and when
  // that brick dies it blinks and opens in the next. While it holds a brick,
  // `layer` and `clip` are the brick's; `x`, `y` and the rest are where it is
  // left once none of them stands.
  cells?: readonly (readonly [number, number])[];
  // What it does, if anything. Absent means it sits there and watches.
  act?: EyeAct;
  // What it looks at (SHA-196). Absent means the ball.
  watch?: EyeWatch;
  // Its reflection (SHA-189): the same eye drawn again, mirrored across the
  // vertical line `axis`, at `opacity`, looking the opposite way — and it does
  // not blink, because a reflection is of the eye and not of its lid's clock.
  reflection?: { axis: number; opacity: number };
}

export interface LevelDefinition {
  name: string;
  background: BackgroundId;
  rows: readonly string[];
  // The five veils' block, and absent on the other forty — which carry
  // the same eye in `eye` instead, at rest or acting. A level with neither has
  // no eye.
  observer?: ObserverDefinition;
  eye?: EyePlacement;
  // THE BESTIARY (SHA-207): this level's creatures, species and pins. From
  // level 1, and each level's own — the veils keep their brood beside these.
  creatures?: readonly CreaturePin[];
  // THE CHAMBER (SHA-184): particles the level is built with, in on its first
  // serve and counted against the cap. ORBIT's two electrons, so far.
  inhabitants?: readonly ParticlePin[];
  // Empty on all but three: SUPER MAZE, whose two LASERs are the only way
  // through a wall of 4-hit granite in anything under a very long while;
  // HOURGLASS, whose TEMPO and STASIS on the spine are the ticket's promise
  // kept; and CENTIPEDE, whose gold head lets a CRITTER grub out onto the wall
  // the centipede is drawn crawling over.
  drops?: readonly SeededDrop[];
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
  // A rank nobody has claimed yet, drawn dim so the board keeps its full height.
  isEmpty: boolean;
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
  // How many 1UPs the rack has taken and turned away since the page loaded.
  // Counts and not flags: this view is compared field by field, so a boolean
  // would be true for exactly one frame and there would be no way to say it
  // twice. Monotonic and never reset, so a fresh run cannot look like either one
  // by going back to zero.
  //
  // The panel marks its new bar off `lifeGainedCount` rather than off the rack
  // growing by one, which is the same number for two different reasons: a
  // restart whose first render happens to add one bar to what GAME OVER left
  // behind is the rack being set, not a life being caught.
  lifeGainedCount: number;
  lifeRefusedCount: number;
  // CHAIN: how many links are standing since the last deck touch, and what they
  // are paying. Two numbers rather than one, because the readout prints both —
  // and the multiplier is a step function of the count, so a panel deriving it
  // would be the second place that rule lives.
  chainHits: number;
  chainMultiplier: number;
  // THE DIADEM: how many stars are lit, and how many there are. Two numbers so
  // the panel can draw the right number of pips without knowing what a veil is
  // — on the thirty-four levels with no eye, `diademStars` is 0 and the row is
  // simply empty.
  diademLit: number;
  diademStars: number;
  // LEVEL, or VEIL on one of the Observer's five. The word and not a flag: the
  // panel prints it, and a boolean here would only be a flag the panel had to
  // turn back into these two words.
  levelLabel: string;
  muted: boolean;
}
