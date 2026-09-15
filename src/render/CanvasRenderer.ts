import { BRICK_BY_ID, BRICK_RAMPS, BRICK_STRAIN_RAMPS } from "@core/config/bricks";
import { gameConfig, peelFlightTicks } from "@core/config/GameConfig";
import { MALUS_KINDS, POWER_UP_GLYPHS } from "@core/config/powerUps";
import { type Ball, paceGhost } from "@entities/ball/Ball";
import { mirrorBounds, mirrorGap, mirrorSpan } from "@entities/paddle/MirrorPaddle";
import { DROP_HEIGHT } from "@entities/powerups/DropPool";
import { BackgroundLayer } from "@render/backgrounds";
import { type BallRow, ballGlints, ballRows } from "@render/ballSprite";
import {
  BRICK_COLORS,
  canvasPalette,
  CHUNK_COLORS,
  DARK_LETTER_DROP_KINDS,
  DEMAKE_GROUND_TONES,
  DROP_COLORS,
} from "@render/palette";

import type { BrickGrain } from "@core/config/bricks";
import type { WallErosion, WallSheet } from "@entities/bricks/BrickGrid";
import type { Critter } from "@entities/effects/Critter";
import type { Decoherence } from "@entities/effects/Decoherence";
import type { Detonation } from "@entities/effects/Detonation";
import type { Entanglement } from "@entities/effects/Entanglement";
import type { Fence } from "@entities/effects/Fence";
import type { Pip } from "@entities/effects/GravelField";
import type { JellySheet } from "@entities/effects/JellySheet";
import type { Meteor } from "@entities/effects/MeteorField";
import type { Particle } from "@entities/effects/ParticleField";
import type { Quake } from "@entities/effects/Quake";
import type { ShadowCast } from "@entities/effects/ShadowCast";
import type { Singularity } from "@entities/effects/Singularity";
import type { Slump } from "@entities/effects/Slump";
import type { Superposition } from "@entities/effects/Superposition";
import type { Shot } from "@entities/laser/ShotPool";
import type { Drop } from "@entities/powerups/DropPool";
import type {
  BackgroundId,
  BrickCell,
  BrickFlash,
  BrickFlashKind,
  Bumper,
  CatchPop,
  ChainBolt,
  PaddleShard,
  Peel,
  PyreBlast,
  RailMark,
  PowerUpKind,
  SnapMark,
  TracerThread,
  StasisRing,
} from "@interfaces/types";

// The speed streak, as how far back along this tick's displacement each copy of
// the ball is laid. Far first, so the near copy paints over it and the smear
// fades away from the ball. Two is the whole trail: three read as a snake, one
// as a rendering fault.
const BALL_TRAIL_STEPS: readonly number[] = [0.8, 0.4];

// The two tones a streak is drawn in, far end first, and the only difference
// between the two capsules that draw one: RUSH runs hot, TURBO runs cold. Same
// smear, same lengths — a player who has met both reads which is in hand off
// the colour alone.
// Newest first: a mark is drawn at the step its remaining life falls in, so it
// walks down the ladder as it dies.
const RAIL_MARK_TONES: readonly string[] = [
  canvasPalette.railMarkHot,
  canvasPalette.railMarkMid,
  canvasPalette.railMarkLow,
  canvasPalette.railMarkFaint,
];

// MIRROR's after-image, newest first: its own sheen, its own body, then a step
// under both. Three whole tones rather than an alpha ramp, like every other
// thing on this field that dies.
const MIRROR_FADE_TONES: readonly string[] = [
  canvasPalette.mirrorSheen,
  canvasPalette.mirrorBody,
  canvasPalette.mirrorFade,
];

const RUSH_TRAIL_TONES: readonly string[] = [canvasPalette.rushTrailFar, canvasPalette.rushTrailNear];
const TURBO_TRAIL_TONES: readonly string[] = [canvasPalette.turboTrailFar, canvasPalette.turboTrailNear];

// HAYWIRE's static, at full strength: six arcs reaching up to five pixels past
// the ball's own radius. Six is the most that still reads as sparks rather than
// as a halo — beyond it the scatter closes into a ring and the ball looks like
// it has grown, which is the one thing the arc exists to avoid. Both are scaled
// by the blend at the draw, so the static is thinner than this at either end of
// the capsule and never wider than it in the middle.
const HAYWIRE_ARCS = 6;
const HAYWIRE_REACH = 5;

// ENGLISH's cue, in game pixels. Three flecks because two read as an axis and
// four as a ring, and neither of those turns; 6 px of orbit puts them a pixel
// clear of the sprite's 4 px radius, so the ball keeps its outline. The gain is
// how much of an orbit one radian of delivered curve is worth — see
// `drawSpinFlecks`. The cloth's row is the deck's middle of seven, the one row
// that is body from cap to cap.
const FLECKS = 3;
const FLECK_ORBIT = 6;
const FLECK_GAIN = 24;
const FELT_ROW = 3;

// PYRE's wash: the two deck rows nobody else has claimed, and the cap width
// `drawPaddleBands` reserves at each end of them.
const EMBER_ROWS: readonly number[] = [4, 5];
const EMBER_CAP = 8;

// PYRE's crown, across the ball's own 8 px: six licks starting a pixel in, so
// the fire is as wide as the sprite under it and no wider. Two specks of smoke,
// which is enough to read as a wisp and few enough that a crown coming up is
// still mostly a crown coming up.
const CROWN_LICKS = 6;
const CROWN_LEFT = 1;
const CROWN_TAPER: readonly number[] = [0.5, 0.8, 1, 1, 0.8, 0.5];
const CROWN_SMOKE = 2;
// The fireball at its widest, and the white the first three frames flash at.
// Both a good deal larger than the 8 px ball that made them: what went up is
// not the size of what is standing there.
const PYRE_FIREBALL = 9;
const PYRE_FLASH = 6;
// The shockwave at its heaviest, on the frame it leaves. It thins to 1 px by
// the time it reaches the crater's edge.
const PYRE_RING_WIDTH = 3;

// PIERCE's sparks, hottest first: white, the ball's own near-white, the
// capsule's yellow. Cycled by slot index exactly as the brick mix below is, so
// a shower is a mix without a colour stored per spark.
const PIERCE_SPARK_TONES: readonly string[] = [
  canvasPalette.dropSheen,
  canvasPalette.ballHighlight,
  canvasPalette.laserCannon,
];

// Whether one row of the ball's sprite table covers a given column — the whole
// of what `drawBallShell` needs to know about its neighbours.
function ballRowCovers(row: BallRow | undefined, column: number): boolean {
  return row !== undefined && column >= row[0] && column < row[0] + row[1];
}

/**
 * GLUE's leading edge, as how many pixels a given column lags behind the front.
 *
 * A film does not arrive everywhere at once, and a straight-edged one reads as a
 * coloured rectangle rather than as a liquid. Indexed by distance from the
 * half's centre rather than by screen x, so the ragged edge belongs to the deck
 * and does not shimmer as the player steers.
 *
 * The columns lagging furthest are also the ones that bead: a drop that arrived
 * late sits proud, catching the row of `paddleCap` above the film line.
 */
const RESIN_LAG: readonly number[] = [0, 2, 1, 0, 1, 2, 0, 1, 1, 2, 0, 2];

/**
 * How far a ball parked on a wet deck rides above it, and the length of the
 * thread under it.
 *
 * Read off the film's reach rather than off a clock of its own, so the ball
 * settles as the resin dries and no second number can disagree with the deck
 * about how sticky it is. Two pixels of film is enough to sit on.
 */
function glueLift(reach: number): number {
  return Math.min(gameConfig.effects.glueLiftPx, Math.floor(reach / 2));
}

const BALL_SIZE = gameConfig.ball.size;

/**
 * A MULTI or SWARM clone's birth, as [ticks left at or above which this stage
 * holds, how wide the sprite is masked to, what it is painted in].
 *
 * The mask is centred and the growth runs outward: a white-hot 4 px pip, one
 * step cooler at 6 px, then the ball itself once the counter is spent — three
 * whole-pixel stages, the same three every clone runs through. What differs
 * between the two capsules is only how long the counter was stamped for, which
 * is the caller's business.
 *
 * Strictly a picture. `findBallOverlap` samples four corners inset 1 px of a
 * full 8 px ball from the frame the clone is stamped, so even the 4 px pip
 * collides as a whole ball — a newborn that passed through bricks would be
 * PIERCE's trick showing up as a bug.
 */
const BALL_BIRTH_STAGES: ReadonlyArray<readonly [number, number, string]> = [
  [3, 4, canvasPalette.ballHighlight],
  [1, 6, canvasPalette.ballNewborn],
];

function birthStage(ticksLeft: number): readonly [number, number, string] | null {
  return BALL_BIRTH_STAGES.find(([from]) => ticksLeft >= from) ?? null;
}

// A bumper disc, as two circles: the radius-9 outline, and a radius-8 fill laid
// one pixel inside it, which is what leaves a clean 1 px ring all the way round
// rather than only down the sides. One [x offset, span] per pixel row, drawn
// from tables for the same reason the ball is — the game's circles are pixel
// art, and a stroked arc lands on a different set of pixels at every position.
const BUMPER_PIXEL_ROWS: ReadonlyArray<readonly [number, number]> = [
  [6, 6],
  [4, 10],
  [3, 12],
  [2, 14],
  [1, 16],
  [1, 16],
  [0, 18],
  [0, 18],
  [0, 18],
  [0, 18],
  [0, 18],
  [0, 18],
  [1, 16],
  [1, 16],
  [2, 14],
  [3, 12],
  [4, 10],
  [6, 6],
];

const BUMPER_FILL_ROWS: ReadonlyArray<readonly [number, number]> = [
  [5, 6],
  [3, 10],
  [2, 12],
  [1, 14],
  [1, 14],
  [0, 16],
  [0, 16],
  [0, 16],
  [0, 16],
  [0, 16],
  [0, 16],
  [1, 14],
  [1, 14],
  [2, 12],
  [3, 10],
  [5, 6],
];

// How far one brick is through GHOST's fade, 0 solid to 1 outline. The
// dissolve mask is a little plasma — four sines over the cell grid, drifting
// slowly on the frame clock — so the wall melts in boiling blobs that spread
// and merge rather than in a directional sweep; the return drains back through
// the same field. Each brick spends `GHOST_SOFTNESS` of the blend cross-fading
// once its threshold is passed, which is what keeps the blobs soft-edged.
const GHOST_SOFTNESS = 0.45;

function ghostProgress(blend: number, row: number, column: number, frame: number): number {
  if (blend <= 0) {
    return 0;
  }
  // The drift is far slower than the blend (0.001 vs 0.033 of threshold per
  // tick), so a brick mid-fade boils without ever running backwards.
  const t = frame * 0.02;
  const plasma =
    Math.sin(column * 0.9 + t) +
    Math.sin(row * 1.3 - t * 0.7) +
    Math.sin((column + row) * 0.7 + t * 0.45) +
    Math.sin(Math.hypot(column - 5.5, row - 2.5) * 1.1 - t * 0.6);
  const threshold = ((plasma + 4) / 8) * (1 - GHOST_SOFTNESS);
  return Math.min(1, Math.max(0, (blend - threshold) / GHOST_SOFTNESS));
}

// The backing store is SCALE× the 372×300 game grid. Static art snaps to whole
// game pixels (each drawn as a SCALE×SCALE block, so stills are unchanged);
// moving sprites snap to the finer backing grid, stepping in thirds of a game
// pixel instead of jumping whole ones.
export const SCALE = 3;

// The capsule letter must stay inside the pill's sheen span (x+2 … x+18).
export const DROP_GLYPH_SPAN = 16;

// How solid a capsule revealed by XRAY is drawn. Measured against the cases that
// decide it — the six capsules wearing their own brick's colour, LASER on the red
// brick worst of all: at 0.65 and below that pill sinks into the brick and the
// glyph goes with it, and by 0.9 it stops reading as something seen *inside* the
// wall. 0.75 is the lowest value where all six stay legible.
const XRAY_REVEAL_ALPHA = 0.75;

// The sizes a capsule letter may draw at, largest first. Walked by measuring the
// glyph, not by counting it: Silkscreen is proportional, so a length is not a
// width and a name nobody has written yet cannot quietly overflow the pill.
//
// Against the 16px span, that puts more on the top rung than character-counting
// ever did: today's two-letter glyphs measure 8.8-12.3px and all keep the 7px the
// roster has drawn at since it was single letters, three letters (`MIR`) reach 14
// and still do, and only four (`BLAS`, 20px) drop a rung, to 14.4px at 5px. The
// 4px rung is the floor — a glyph too long even for that overflows, and the DEV
// legibility pass says whose it is.
const DROP_GLYPH_SIZES = [7, 5, 4] as const;

// One canvas for every measurement this module ever takes, made on first use so
// the module stays importable outside a document.
let glyphMeasurer: CanvasRenderingContext2D | null = null;
// Silkscreen's advance never changes, so a glyph is measured once and its size
// kept — capsule sprites are drawn every frame.
const glyphSizes = new Map<string, number>();

/**
 * The largest font a glyph fits the pill's sheen span in, at the scale the pill
 * is being painted at.
 *
 * The rung is chosen once by measuring at SCALE, where the type is biggest and
 * the measurement most honest, and multiplied out from there: the capsule
 * catalogue paints the same pill at 1 and has to land on the same rung, or a
 * glyph would fit in the field and overflow in the list that teaches it.
 *
 * Exported for the DEV legibility pass, which must measure exactly what
 * `drawCapsule` paints — see `@render/checkCapsules`.
 */
export function dropGlyphFont(glyph: string, scale = SCALE): string {
  return `${dropGlyphSize(glyph) * scale}px Silkscreen, monospace`;
}

function dropGlyphSize(glyph: string): number {
  const cached = glyphSizes.get(glyph);
  if (cached !== undefined) {
    return cached;
  }
  const size = widestSizeThatFits(glyph);
  // Before Silkscreen is in, the fallback `monospace` measures wider and would
  // pin the glyph a rung too low. Such an answer is used for that frame and
  // dropped, not remembered.
  if (document.fonts.check(`${size * SCALE}px Silkscreen, monospace`)) {
    glyphSizes.set(glyph, size);
  }
  return size;
}

function widestSizeThatFits(glyph: string): number {
  glyphMeasurer ??= document.createElement("canvas").getContext("2d");
  let chosen: number = DROP_GLYPH_SIZES[0];
  for (const size of DROP_GLYPH_SIZES) {
    chosen = size;
    // Nothing to measure with: fall through the ladder to the size that fits
    // whatever anyone writes.
    if (glyphMeasurer === null) {
      continue;
    }
    glyphMeasurer.font = `${size * SCALE}px Silkscreen, monospace`;
    if (glyphMeasurer.measureText(glyph).width <= DROP_GLYPH_SPAN * SCALE) {
      break;
    }
  }
  return chosen;
}

/**
 * How far inside its own flank UMBRA's liseré runs, in game pixels.
 *
 * **A liseré, not a border**, and the difference is the whole of what makes it
 * read as a shadow rather than as a cut-out: the outer two pixels stay black,
 * so the shape still ends in darkness and the line sits *within* it. Outlining
 * the silhouette instead gives every wedge a hard contour and the field turns
 * into twelve stickers.
 *
 * Two rather than one, because at one the line and the edge touch at this
 * scale and the pair reads as a single thick edge; and rather than three,
 * because the tip of a wedge is only twelve pixels across.
 */
const UMBRA_INSET = 2;

const FLASH_COLORS: Record<BrickFlashKind, string> = {
  death: canvasPalette.deathFlash,
  blast: canvasPalette.blastFlash,
  umbra: canvasPalette.umbraFlash,
};

// SPLIT's two seams, split out of the paddle's state so `drawDeck` can be given
// a span that is not the paddle's — MIRROR's ghost is the same deck at a
// fraction of it, and carries the same seam.
export interface DeckSeamState {
  // The deck under tension with no hole in it yet — the first ticks of a tear,
  // the last of a weld, or a SPLIT on a deck too narrow to hold two halves.
  splitCrack: boolean;
  // The two ticks after the halves meet. Both of these are seams down the deck's
  // middle and both can be up at once — a JAMMER shutting the deck under a live
  // SPLIT welds it on the tick there is no room left for a hole, while the tear
  // still has blend to spend. The weld wins the pixel: it is the event, and the
  // hairline behind it is the scar closing.
  splitWeld: boolean;
}

export interface PaddleRenderState extends DeckSeamState {
  x: number;
  /**
   * The deck's top edge, which was `gameConfig.paddle.y` everywhere in this file
   * until TIDE floated it.
   *
   * On the paddle's own record and not loose on the view, for the reason the
   * resin and the felt are: this is the deck's, and MIRROR's ghost deliberately
   * does *not* read it — the reflection lives on the ceiling at a fixed
   * `mirrorY` and is a mirror of where the paddle is left to right, never up and
   * down. A flooded field is a narrower one, with the ghost where it has always
   * been and the deck risen to meet it.
   */
  y: number;
  width: number;
  /**
   * LASER's cannons coming out of the deck, 0 bare to 1 locked out.
   *
   * Presentational and nothing else: it drives a pixel height and one colour.
   * The fire gate, the cadence and the first-shot delay all read the timer, so a
   * LASER fires the same shots on the same ticks it always has.
   */
  laserBlend: number;
  // SPLIT's hole, in game pixels, or 0 while the deck is whole. `width` stays
  // the span end to end either way, so the cannons and MIRROR's ghost need no
  // second number.
  splitGap: number;
  // JAMMER, and only while its caps are still travelling: both ends wear the
  // capsule's magenta instead of the deck's red for the eight ticks the trap
  // takes to shut. The deck losing its own colour is the point.
  capsJammed: boolean;
  /**
   * GLUE's resin, in pixels of film out from the middle of each half of the
   * deck. On the paddle's own state and not loose on the view because the deck
   * is what paints it — and MIRROR's ghost gets it through the same record,
   * which is right: the reflection is the paddle.
   */
  glueReach: number;
  /**
   * PYRE's ember wash, 0 to 1 — how far the fire has rolled across the deck.
   *
   * Beside the resin and the felt and on the same record for their reason: the
   * deck is what paints it. Unlike either of them it is a *front* and not a
   * spread — it enters from one cap and leaves back through it, which is what
   * makes the ten seconds start and end with something moving.
   */
  ember: number;
  /**
   * ENGLISH's felt, 0 to 1 — how far the cloth has been rolled out from the
   * middle of each half of the deck.
   *
   * Beside the resin and on the same record for its reason: the deck is what
   * paints it, and MIRROR's ghost is the paddle, so the reflection wears the
   * cloth too. It cannot *use* it — the ghost is mirrored across the field and
   * therefore travels the opposite way, so english taken off it would fight the
   * hand that threw it — but a reflection of a felted deck is a felted deck.
   */
  english: number;
}

// The four tones a paddle is banded from. The ghost is the same sprite in a
// dimmer set, which is what makes it read as the paddle's reflection.
export interface PaddleBandColors {
  body: string;
  cap: string;
  sheen: string;
  shade: string;
}

// Game pixels between the dots of a magnet tether.
const TETHER_DASH_SPACING = 4;

// How opaque TIDE's water is over what it covers. The one alpha-blended fill on
// the field, and the number is the whole of why: at 0.34 a green brick under the
// surface is still a green brick and the ball is still the ball, while the field
// below the line is unmistakably wet. Much past 0.45 the sea becomes a floor
// with sprites lost in it; much under 0.25 it reads as a tint on the background
// rather than as water standing in front of things.
const TIDE_WASH_ALPHA = 0.34;

// DEMAKE's scanlines: one dark backing-store row every `DEMAKE_SCANLINE_STEP`,
// in *device* pixels rather than game ones — the ribbing is a property of the
// tube, not of the art, and at SCALE it would be a third of the field. Painted
// last of all, over the wall frame, because a real tube ribs the glass and not
// the picture behind it.
const DEMAKE_SCANLINE_STEP = 3;

// A BANANA peel, in game pixels. The width is shared with the simulation (the
// deck's overlap test is against the same span) and lives in the config; the
// height is the sprite's alone, and only decides how far up the rail it sits.
const PEEL_HEIGHT = 5;

// The height a doorway reaches when it has finished cutting itself open, which
// is the one thing that tells a travelling lip from a settled edge.
const PORTAL_FULL = gameConfig.powerUps.portalHeight;

// One entry per pixel row of a portal mouth, repeating: three bands of three.
const PORTAL_STRIPES: readonly string[] = [
  canvasPalette.portalBright,
  canvasPalette.portalBright,
  canvasPalette.portalBright,
  canvasPalette.portalMid,
  canvasPalette.portalMid,
  canvasPalette.portalMid,
  canvasPalette.portalDark,
  canvasPalette.portalDark,
  canvasPalette.portalDark,
];

export const PADDLE_BANDS: PaddleBandColors = {
  body: canvasPalette.paddleBody,
  cap: canvasPalette.paddleCap,
  sheen: canvasPalette.paddleTopSheen,
  shade: canvasPalette.paddleBottomShade,
};

// The deck on the frame a BOMB goes off: every band its own top sheen, which is
// the brightest tone the pill owns. Not white — the flash under it already is,
// and a deck that whited out to something it is not made of would read as a
// sprite swap rather than as the paddle catching the light of its own charge.
export const BLAST_BANDS: PaddleBandColors = {
  body: canvasPalette.paddleTopSheen,
  cap: canvasPalette.paddleTopSheen,
  sheen: canvasPalette.paddleTopSheen,
  shade: canvasPalette.paddleTopSheen,
};

// A deck with no seam to draw: the pieces of one are past having a middle.
const NO_SEAM: DeckSeamState = { splitCrack: false, splitWeld: false };

export const MIRROR_BANDS: PaddleBandColors = {
  body: canvasPalette.mirrorBody,
  cap: canvasPalette.mirrorCap,
  sheen: canvasPalette.mirrorSheen,
  shade: canvasPalette.paddleBottomShade,
};

export interface RenderView {
  background: BackgroundId;
  // Levels sharing a theme get their own layout from this seed (the wrapped
  // level index).
  backgroundVariant: number;
  grid: ReadonlyArray<ReadonlyArray<BrickCell | null>>;
  paddle: PaddleRenderState;
  /**
   * MIRROR's reflection, 0 absent to 1 fully resolved.
   *
   * A number rather than a flag, and — like SPLIT's tear and unlike GHOST's or
   * BLACKOUT's fades — one the simulation reads too: this is the fraction of the
   * deck's width the ghost both draws at and bounces off. The renderer is
   * looking at the same span the ball is.
   */
  mirrorForm: number;
  // The line left on the ceiling after the surface is gone, 1 on the tick it
  // was last a surface down to 0. It returns nothing; it is the explanation for
  // the ball that just went straight through where the ghost was.
  mirrorAfterImage: number;
  /**
   * MAGNET's reach in px either side of the deck's centre, 0 when there is
   * none. The band the pull actually has this frame, so the tethers are cut to
   * exactly the range that is holding the capsules they are drawn on.
   */
  magnetReach: number;
  /**
   * PORTAL's doorway as it stands this frame: the top of the aperture and how
   * many rows of it there are, 0 when the wall is whole. Two numbers off the
   * simulation rather than a blend to re-derive here, because these exact rows
   * are also the hole a ball is let through.
   */
  portalMouthTop: number;
  portalMouthHeight: number;
  // XRAY: show every brick the capsule it is holding, for as long as it lasts —
  // 0 unread, 1 the whole wall read, and in between how far down the reading
  // edge has got. What changes over a sweep is the *depth* that can be seen
  // through and never the strength: a pill is whole, sliced, or not there.
  xrayBlend: number;
  // Where that edge stands, in whole game pixels. Whole and not a fraction of
  // the wall, because a row is sliced against it with a clip rect and a clip
  // between two device pixels is a soft edge on a wall made of hard ones.
  xrayBeamY: number;
  // Which way that edge is travelling: down the wall while the capsule is being
  // read in, back up it on the way out. The blend cannot say — it is symmetric,
  // and one frame of it looks the same going either way.
  xrayReading: boolean;
  /**
   * The topmost row PAYDAY's tide has reached, running up from the bottom one —
   * the wall's row count when nothing is gilded. A row index and not a blend,
   * so the standing wall and the flashes a kill leaves read the same one number
   * and cannot disagree about where the front is.
   *
   * A hard boundary, deliberately, where GHOST's fade has `GHOST_SOFTNESS`:
   * that one cross-fades a whole brick and needs a soft edge, this swaps a
   * single pixel row, and a half-gold pixel is a muddy pixel rather than a soft
   * one. The wall is five or six rows, not twelve, so the front is five visible
   * steps at about five ticks a row — a chunky march, which is both right for
   * the idiom and the only thing a one-pixel sheen can say.
   */
  paydayFront: number;
  // DEMAKE's dissolve, 0 in colour to 1 fully demade. A number rather than a
  // flag because the machine sags into the tube and back out over half a second
  // at each end. Purely presentational — the simulation behind it is not told,
  // and nothing here changes what it does.
  demakeBlend: number;
  // GHOST's fade, 0 solid to 1 fully ghosted. Between the two the renderer
  // runs its plasma mask over the grid, each brick melting to its outline as
  // the field rises past it.
  ghostBlend: number;
  /**
   * ERODE's wear, and the only thing on this view the renderer asks a *question*
   * of rather than reading a number off.
   *
   * Per cell, because that is the only honest answer: the wall wears as one
   * wall but it grows back a cell at a time, holding wherever a ball is standing
   * so a brick cannot close on one. A single number could not say that, and a
   * wall painted off one while it was collided off forty would put the player
   * through a brick that is on screen.
   */
  erosion: WallErosion;
  // How heavy the trickle out of the seams is, and which way it runs. The wear
  // above says how far the mortar has gone and cannot say either: it is
  // symmetric, and a wall halfway open looks the same whether it is opening or
  // closing. Grains fall while it gives and are drawn back up into the seams
  // while it sets.
  erodeBlend: number;
  erodeSetting: boolean;
  /**
   * JELLY's sheet, and the second thing on this view the renderer asks a
   * question of rather than reading a number off.
   *
   * Per cell for ERODE's reason and one harder: the wear changes how big a
   * brick is and this changes *where it is*, so a wall painted off one number
   * while it was collided off ninety-six would hand the player a bounce off a
   * brick that is not where they can see it. The same object answers both —
   * the renderer's `offsetAt` and the grid's are one call on one field.
   */
  offsets: WallSheet;
  /**
   * JELLY's load on the bricks' faces, which is one capsule's alone and not
   * geometry — so it is its own field rather than a method on the object above.
   * The wall's shape is the sum of every capsule moving it; what a brick is
   * *made* of under strain is not.
   */
  jelly: JellySheet;
  // SLUMP's two pictures: the hesitation before anything moves, and the line of
  // mortar running up the pile as it sets. Neither is geometry either — the
  // fall itself is already in `offsets`.
  slump: Slump;
  /**
   * FENCE's posts, the way the wall effects above it go over: the renderer asks
   * where each one is and how much of it there is, because both are per post
   * and no single number stands for the fence.
   *
   * The same object the hitbox reads, which is the point — a post is drawn at
   * exactly the height it stops a ball at, at every tick of the telescope going
   * in and of the snap coming out.
   */
  fence: Fence;
  /**
   * UMBRA's shadow field, as the object.
   *
   * The whole of it, unlike the three above: this one is not a displacement on
   * the wall or a load on its faces, it is twelve shapes of its own hanging
   * under it, and what the renderer needs is the rows the rasterizer already
   * cut — the same rows the physics collides. Handing over a blend and
   * re-deriving the quads here is precisely the two-approximations failure the
   * effect exists to prevent.
   */
  shadows: ShadowCast;
  /**
   * SUPERPOSE's echo field, handed over whole for the shadows' reason exactly:
   * the effect has already placed every echo's rect this tick for the
   * collision test, and re-deriving them here would be two answers to where a
   * surface is. The renderer reads the list, the shimmer and the pops off it
   * and decides nothing.
   */
  superpose: Superposition;
  /**
   * COLLAPSE's fog, handed over whole for the echoes' reason: the effect
   * already knows how out of focus every cell is, in one number that folds the
   * arrival, a pass through and the closing condense together. The renderer
   * reads it per cell and decides nothing.
   */
  fog: Decoherence;
  /**
   * TWIN's couples, handed over whole for the two above it: the effect has
   * already placed both anchors of every thread this tick, against the same
   * displacements the wall is painted with, and the renderer walks that list
   * and decides nothing but how a hairline is inked.
   */
  twin: Entanglement;
  /**
   * GRAVEL's fault, 0 whole wall to 1 every face split.
   *
   * One number and no companion flag, which is where it parts company with the
   * pair above it. ERODE's wear is symmetric and needs to be told which way it
   * is running; this one is a *front*, and a front says so by itself — each
   * cell's turn comes at its own point in the blend, so running the number down
   * heals the wall from the far end backwards with nothing else passed over.
   */
  gravelBlend: number;
  // The chips in the air. Their own list rather than the debris pool, because
  // they are a drop: what is falling here can still be caught.
  pips: readonly Pip[];
  // BLACKOUT's iris, 0 lit to 1 fully dark. A number rather than a flag because
  // the light does not switch off, it collapses: the pools open wider than the
  // field at 0 and close onto the ball at 1, which is the same journey run
  // backwards when the capsule expires. Like DEMAKE, purely presentational —
  // the simulation under it is not told and plays exactly as it would lit.
  blackoutBlend: number;
  // FLIP's turn, 0 upright to 1 fully over. A number rather than a flag for the
  // same reason the three above it are: the field does not switch round, it
  // rotates — and it is only ever 0 or 1 for the frames it is not turning.
  flipTurn: number;
  // ANGEL: a save in hand. The deck wears wings for as long as it holds one.
  angelArmed: boolean;
  // GAMBLE: the face its reel is showing, or null when nothing is turning.
  gambleFace: PowerUpKind | null;
  // BOMB blew it up: the debris in flight is the paddle, so neither it nor
  // MIRROR's reflection of it may be on screen.
  paddleHidden: boolean;
  // BOMB's break, 1 on the frame the deck goes up and 0 twelve ticks later. It
  // is what is left of each piece, and what is left of the light on the rail.
  paddleBreak: number;
  // The three pieces themselves. Per-piece position and velocity is not a blend
  // and is not pretending to be one.
  paddleShards: readonly PaddleShard[];
  bumpers: readonly Bumper[];
  // BANANA's peels on the paddle rail, oldest first.
  peels: readonly Peel[];
  // The rail JAMMER has taken back, dying out where the deck used to be.
  railMarks: readonly RailMark[];
  balls: readonly Ball[];
  // RUSH and TURBO: the scale the simulation is stepping balls at, or 0 when
  // nothing is speeding them up. It is a distance rather than a flag because the
  // streak has to be the ground actually covered — see the note where the view
  // is built.
  ballTrail: number;
  // Which of the two comets to paint. RUSH takes it whenever it is live: the
  // trap is the thing the player has to react to, and a boost underneath it
  // does not get to soften how it looks.
  turboTrail: boolean;
  // TEMPO: how much of each ball's banked debt to spend on its pace ghost, 0
  // when there is no bullet time to mark.
  tempoGhost: number;
  // HAYWIRE: how hard the fault is running, 0 when there is none. The static
  // around each ball is drawn from it, and so is the size of the kicks the
  // simulation is throwing — one number, so the picture cannot overstate them.
  haywire: number;
  // STASIS closing on the field, 0 to 1 — and 0 for the whole of the release,
  // which the ring pool owns on its own.
  stasisClosing: number;
  // HOMING: whether the reticles are walking out rather than in. How far each
  // one has got is `ball.homingMarkTicks`; this is only which way it is going.
  homingOpening: boolean;
  // SNAP's lattice, 0 no paper to 1 the whole grid, and the marks the snapped
  // bounces have left on it. The blend is a dither threshold rather than an
  // alpha: cells come up whole, in a fixed scatter, which is how a grid
  // resolves on a machine that has no alpha to fade with.
  snapGrid: number;
  snapMarks: readonly SnapMark[];
  /**
   * TRACER's guide: how strongly it is drawn, and one thread per live ball.
   *
   * The threads are the simulation's, walked there this tick — the renderer is
   * told where the ball is going rather than working it out, so the line drawn
   * and the line predicted cannot come apart. A thread whose walk could not stay
   * honest arrives here already short, with a null pip; there is no judgement
   * left to make down here.
   */
  tracerBlend: number;
  tracerThreads: readonly TracerThread[];
  /**
   * Which way the guide is going. The blend cannot say — it is symmetric, and
   * one frame of it looks the same arriving or leaving — and the two ends differ
   * by one thing: on the way in the pip is not stamped until the thread has
   * actually reached the rail, and on the way out it is the first thing to go.
   */
  tracerArriving: boolean;
  // PYRE's craters, each already spent: the bricks went on the frame the player
  // clicked, and these are the light and the ring saying so.
  pyreBlasts: readonly PyreBlast[];
  drops: readonly Drop[];
  shots: readonly Shot[];
  flashes: readonly BrickFlash[];
  pops: readonly CatchPop[];
  stasisRings: readonly StasisRing[];
  bolts: readonly ChainBolt[];
  particles: readonly Particle[];
  meteors: readonly Meteor[];
  detonation: Detonation;
  cores: readonly Singularity[];
  quake: Quake;
  critter: Critter;
  /**
   * WALL's bar: how much of it is written, the x it is written out of, and
   * whether the two pixels a ball just struck are still white-hot.
   *
   * The reach is normalised to the field's own 366 px either side of the
   * origin and clamped to the frame, which is what buys a constant sweep speed
   * out of a single 0-to-1 number: the deck is rarely centred, so the near end
   * lands on its wall first and the far end runs on alone — the same bar every
   * time, drawn out of wherever the player happened to be standing.
   */
  energyWallBlend: number;
  energyWallOriginX: number;
  energyWallStrike: boolean;
  /**
   * TIDE's sea: how much of it there is, where its surface is, how far through
   * its swell, which way it is going, and what the deck is still shedding once
   * it has gone.
   *
   * Five fields where most capsules have one, and every one of them says
   * something the others cannot. The **blend** is how flooded the field is and
   * is what the wash is drawn at. The **waterline** is where the sea actually
   * is, passed rather than re-derived: capsules sink against this line and the
   * deck floats on it, so a surface the renderer worked out for itself would be
   * a second sea half a pixel from the real one. The **phase** is the swell's
   * own clock, which the frame count cannot stand in for — the foam has to
   * travel with the water the deck is riding, and a picture on the renderer's
   * clock would drift out of step with it the first time the game skipped a
   * frame. **Draining** is the one thing a symmetric blend can never say: a sea
   * half in looks exactly like a sea half out, and only one of the two has a
   * plughole in the bottom of it. And the **drip** outlives all four — it is
   * what runs off the deck's caps for twelve ticks after the water has gone.
   */
  tideBlend: number;
  tideWaterline: number;
  tidePhase: number;
  tideDraining: boolean;
  tideDrip: number;
}

// A palette filter: what a colour becomes on the machine it is being painted on.
// Off, the identity. On, the sprite palette collapses to the tube's two tones:
// the shadow role goes to ground, everything else to ink — see
// `DEMAKE_GROUND_TONES`. One implementation, shared by the class and by the
// sprites lifted out of it, so a capsule added later is demade by construction
// rather than by remembering to.
type InkFilter = (color: string) => string;

// The identity, for a caller painting on nothing but a colour screen — the level
// gallery's stills and the capsule catalogue's pills, neither of which is ever
// demade.
const litInk: InkFilter = (color) => color;
const demakeInk: InkFilter = (color) =>
  DEMAKE_GROUND_TONES.has(color) ? canvasPalette.demakeGround : canvasPalette.demakeInk;

function inkFor(demade: boolean): InkFilter {
  return demade ? demakeInk : litInk;
}

/**
 * `CanvasRenderer.spritePixel`, for the sprites that live outside the class.
 *
 * The position snaps to the backing grid rather than the game grid, which is
 * what lets a moving sprite step in thirds of a game pixel; a still one lands
 * on the same place either way.
 */
function spriteBrush(
  ctx: CanvasRenderingContext2D,
  scale: number,
  demade: boolean,
): (x: number, y: number, width: number, height: number, color: string) => void {
  const ink = inkFor(demade);
  return (x, y, width, height, color) => {
    ctx.fillStyle = ink(color);
    ctx.fillRect(Math.round(x * scale), Math.round(y * scale), width * scale, height * scale);
  };
}

/**
 * One brick, at whatever scale it is asked for.
 *
 * Module-level and scale-taking because two things paint this sprite: the
 * renderer at SCALE into the arena, and the level gallery at 1 into a
 * field-sized still (`@render/levelStill`). A second copy of the bevel would
 * drift the first time a brick is retouched — GHOST already changed it once.
 *
 * The three ways a brick can be painted differently from its own kind, as an
 * object rather than three trailing optionals — a fourth silent slot would have
 * been the point at which a caller starts passing `0, false` to reach the one
 * it means.
 */
export interface BrickPaint {
  // GHOST's per-brick progress: at 1 the body and both bevels are gone, leaving
  // the cell's outline over the playfield theme; between 0 and 1 the body is
  // drawn translucent under an outline still gaining strength, so a brick
  // de-materialises instead of flipping. Damage has no lit face to show while
  // ghosted, and comes back with the brick.
  fade?: number;
  demade?: boolean;
  // PAYDAY's tide has reached this row. The sheen and the lit left edge go
  // gold and nothing else does: kind colour, hurt state, dark shade and
  // silhouette all stay, so a fully gilded wall still reads as the level it is.
  gilded?: boolean;
  // ERODE's wear, in whole pixels off each edge of the cell — the same two
  // numbers the hitbox is cut with, so the brick the ball bounces off is the
  // brick on screen. Every part of the sprite is measured off the body they
  // leave rather than off the cell, which is what lets one bevel serve a 28x10
  // brick and a 20x6 one.
  erodeX?: number;
  erodeY?: number;
  // JELLY's load on this cell, 0 whole to 1 about to burst. Painted as notches
  // down the brick's own strain ramp, so a charging cell steps its tones
  // exactly as a hit one does — see `BRICK_STRAIN_RAMPS`.
  strain?: number;
  // SLUMP's hesitation: the brick's bottom bevel steps to its own shade rather
  // than the definition's, for the four ticks between the wall being let go of
  // and the wall moving. One tone on one edge, and it is the whole of the
  // arrival — what is being drawn is the shadow a brick casts on the brick
  // underneath it going away.
  unmoored?: boolean;
}

export function drawBrick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: BrickCell,
  scale: number,
  paint: BrickPaint = {},
): void {
  const { fade = 0, demade = false, gilded = false, erodeX = 0, erodeY = 0, strain = 0, unmoored = false } = paint;
  // The body the whole sprite is laid out on. A whole brick is its cell inset by
  // one, which is the mortar seam it has always been drawn with; a worn one is
  // inset by whatever the erosion has taken, and the seam is simply the first
  // pixel of that.
  const padX = Math.max(1, erodeX);
  const padY = Math.max(1, erodeY);
  const bodyX = x + padX;
  const bodyY = y + padY;
  const bodyWidth = gameConfig.grid.brickWidth - padX * 2;
  const bodyHeight = gameConfig.grid.brickHeight - padY * 2;
  const ink = inkFor(demade);
  // `CanvasRenderer.pixel`, at the scale asked for: whole game pixels, each one
  // a scale×scale block.
  const pixel = (left: number, top: number, width: number, height: number, color: string): void => {
    ctx.fillStyle = ink(color);
    ctx.fillRect(Math.round(left) * scale, Math.round(top) * scale, width * scale, height * scale);
  };

  if (fade > 0) {
    ctx.globalAlpha = fade;
    pixel(bodyX, bodyY, bodyWidth, 1, canvasPalette.ghostBrick);
    pixel(bodyX, bodyY + bodyHeight - 1, bodyWidth, 1, canvasPalette.ghostBrick);
    pixel(bodyX, bodyY + 1, 1, bodyHeight - 2, canvasPalette.ghostBrick);
    pixel(bodyX + bodyWidth - 1, bodyY + 1, 1, bodyHeight - 2, canvasPalette.ghostBrick);
    ctx.globalAlpha = 1;
    if (fade >= 1) {
      return;
    }
    ctx.globalAlpha = 1 - fade;
  }

  const definition = BRICK_BY_ID[cell.kind];
  // How many hits this brick has taken, which is the whole of the damage model:
  // the ramp holds one body tone per hit point plus the intact sheen, so silver
  // gets two states, gold three and granite four out of the same two lines. It
  // replaced a single `hurt` flag that made gold — a three-hit brick — show the
  // player two.
  const hurt = BRICK_RAMPS[cell.kind].length - 1 - cell.hitPoints;
  // JELLY's load, as however many further notches the tones left under this
  // brick will carry. A one-hit brick has one, granite at full health has
  // three, and a silver brick already on its last body tone has none — there
  // is nowhere darker for it to go, and inventing a tone for it would put a
  // colour on the wall the brick was never drawn in.
  const ramp = BRICK_STRAIN_RAMPS[cell.kind];
  const headroom = ramp.length - 2 - hurt;
  const stage = hurt + (headroom > 0 ? Math.min(headroom, Math.floor(strain * (headroom + 1))) : 0);
  // Both the brick's own sheen and PAYDAY's gild step with the damage, so the
  // tell survives the tide instead of being flattened by it.
  const sheen = gilded ? GILD_RAMP[Math.min(stage, GILD_RAMP.length - 1)] : ramp[stage];

  pixel(bodyX, bodyY, bodyWidth, bodyHeight, ramp[stage + 1]);
  if (definition.grain) {
    drawGrain(pixel, bodyX, bodyY, bodyWidth, bodyHeight, cell.seed, definition.grain, ramp, stage);
  }
  pixel(bodyX + 1, bodyY, bodyWidth - 2, 1, sheen);
  pixel(bodyX, bodyY + 1, 1, bodyHeight - 2, sheen);
  // The bottom bevel, and the one edge SLUMP's hesitation touches: a brick that
  // has stopped being held up is lit from under as well as over for those four
  // ticks, so the shade goes to the sheen's own tone and the wall visibly
  // un-seats itself before a single pixel of it moves.
  pixel(bodyX + 1, bodyY + bodyHeight - 1, bodyWidth - 2, 1, unmoored ? sheen : definition.dark);
  pixel(bodyX + bodyWidth - 1, bodyY + 1, 1, bodyHeight - 2, definition.dark);
  ctx.globalAlpha = 1;
}

/**
 * PAYDAY's gild: the gold brick's own damage ramp, rather than a pair of tones
 * of its own.
 *
 * The capsule's body colour (#dfae2c) is darker than every brick's `light`, so
 * a sheen painted in it strips the highlight — the wall reads dirty and flat,
 * which is the opposite of expensive — and it *is* gold's `flat`, which would
 * make the gild a no-op on a damaged gold brick, on exactly the levels a player
 * expects PAYDAY to light up. Walking gold's own ramp keeps the damage tell
 * under the gild at every stage, and the sweep reads as the whole wall turning
 * into the gold brick.
 *
 * Clamped where it is read, since the deepest brick is deeper than gold: a
 * granite brick three hits in wears gold's shade and stays there.
 */
const GILD_RAMP = BRICK_RAMPS.G;

// One fleck's position, hashed rather than walked out of a generator: the
// pattern has to be identical on every frame of a brick's life and unrelated to
// its neighbour's, and a hash is both without keeping any state between frames.
// Two rounds of mixing because one leaves `seed` and `index` visible in the low
// bits, and a column of bricks whose specks line up is a tiling artefact.
function grainHash(seed: number, index: number): number {
  let hash = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2545f491);
  return (hash ^ (hash >>> 13)) >>> 0;
}

/**
 * Granite's stone: `count` flecks over the body, and `pitsPerHit` fractures for
 * every hit it has taken.
 *
 * The flecks alternate between the sheen tone above the body and one a notch
 * below it, so the grain brackets whatever the body currently is and is legible
 * the whole way down the ramp. The pits come off the *end* of the same hashed
 * sequence, which is what makes damage cumulative — stage 2 opens stage 1's
 * holes and five more, so a brick is chipped away rather than re-speckled.
 */
function drawGrain(
  pixel: (left: number, top: number, width: number, height: number, color: string) => void,
  // The brick's body, not its cell: a fleck may land inside the sheen along the
  // top and left and the shade along the bottom and right, so the stone never
  // eats its own frame — and a granite brick ERODE has worn down to 20x6 speckles
  // over what it has left rather than over where it used to be.
  bodyX: number,
  bodyY: number,
  bodyWidth: number,
  bodyHeight: number,
  seed: number,
  grain: BrickGrain,
  ramp: readonly string[],
  stage: number,
): void {
  const pale = ramp[stage];
  const shade = ramp[Math.min(stage + 2, ramp.length - 1)];
  const total = grain.count + grain.pitsPerHit * stage;
  for (let index = 0; index < total; index++) {
    const hash = grainHash(seed, index);
    const tone = index >= grain.count ? grain.pit : index % 2 === 0 ? pale : shade;
    pixel(bodyX + 1 + (hash % (bodyWidth - 2)), bodyY + 1 + ((hash >>> 8) % (bodyHeight - 2)), 1, 1, tone);
  }
}

/**
 * One capsule pill, wherever it is: falling through the field, showing through
 * the brick that holds it while XRAY is lit, or standing still in the capsule
 * catalogue. The same sprite for all three is the point — what the wall shows,
 * and what the list teaches, is what the player will catch.
 *
 * Module-level and scale-taking for the same reason `drawBrick` is: the renderer
 * paints it at SCALE, the catalogue at 1, and a hand-drawn lookalike would drift
 * the first time the sheen is retouched.
 *
 * `frame` drives the trap blink and nothing else, so a caller with no frame
 * clock of its own can hand it any number it likes — as long as it keeps the
 * game's cadence if it wants the blink to look the same.
 */
export function drawCapsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: PowerUpKind,
  scale: number,
  frame: number,
  demade = false,
): void {
  const pixel = spriteBrush(ctx, scale, demade);
  const color = DROP_COLORS[kind];
  pixel(x + 1, y, 18, 8, color);
  pixel(x, y + 1, 20, 6, color);
  pixel(x + 2, y + 1, 16, 1, canvasPalette.dropSheen);
  pixel(x + 2, y + 7, 16, 1, canvasPalette.dropShade);

  // A trap telegraphs itself with a blinking letter, so it can be read as one
  // while there is still time to dodge it — in the wall as much as in the air.
  if (MALUS_KINDS.has(kind) && (frame & 8) !== 0) {
    return;
  }

  // The glyph, not the id: the player reads the name's opening letters, and
  // a long one draws a size down rather than over the sheen.
  const glyph = POWER_UP_GLYPHS[kind];
  // Demade, the pill is one flat ink slab, so the glyph is punched out of it
  // in ground. It cannot go through the ink filter: `dropLetterLight` is not a
  // shadow tone, so it would resolve to ink on ink and every light-lettered
  // capsule would lose the one thing that says which capsule it is.
  ctx.fillStyle = demade
    ? canvasPalette.demakeGround
    : DARK_LETTER_DROP_KINDS.has(kind)
      ? canvasPalette.dropLetterDark
      : canvasPalette.dropLetterLight;
  ctx.font = dropGlyphFont(glyph, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // The pill's own centre, not a typed offset: glyphs run two to four
  // characters and `dropGlyphFont` picks the size, so the only place the middle
  // of the letters can be read off is the box they are drawn in.
  const glyphX = Math.round((x + 10) * scale);
  const glyphY = Math.round((y + 4.5) * scale);
  uprightText(ctx, glyphX, glyphY, () => ctx.fillText(glyph, glyphX, glyphY));
}

/**
 * Text the player has to read, kept off its head whatever the field is doing
 * under it.
 *
 * FLIP turns the whole playfield over, and a capsule's name is the one thing on
 * it that may not end up upside down. **Half a turn back, or nothing** — never
 * the exact counter-angle: a label pinned horizontal on a pill lying at 50°
 * hangs off both of its long sides, and the letters stop reading as something
 * printed on the capsule. Snapping instead leaves the glyph glued to its pill
 * all the way round, never more than a quarter turn from upright, and puts the
 * one moment it changes over where the field is edge-on and the mouse changes
 * over too.
 *
 * The angle is read off the context's own matrix rather than passed in, so it
 * is right by construction everywhere these labels are painted — the arena
 * mid-turn, the arena settled, the capsule catalogue and the level gallery —
 * and a caller under no rotation at all pays one matrix read and nothing else.
 *
 * `cx`/`cy` are the label's own centre in device pixels, so it turns about
 * itself and lands exactly where it was — and two half turns compose to the
 * identity, which is what keeps a shadow offset on the side it was drawn.
 */
function uprightText(ctx: CanvasRenderingContext2D, cx: number, cy: number, paint: () => void): void {
  const { a, b } = ctx.getTransform();
  if (Math.abs(Math.atan2(b, a)) <= Math.PI / 2) {
    paint();
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI);
  ctx.translate(-cx, -cy);
  paint();
  ctx.restore();
}

// ANGEL's wing, from the deck upward: [rows above the deck top, how far outside
// the deck's end it starts, how wide, tone]. Brightest at the tip, and never
// more than 2 px past the end — a wing that reached out sideways would be read
// as a wider deck, which is a different capsule.
const ANGEL_WING_ROWS: ReadonlyArray<readonly [number, number, number, string]> = [
  [1, -1, 7, BRICK_COLORS.S.flat],
  [2, 0, 6, BRICK_COLORS.S.flat],
  [3, 1, 4, BRICK_COLORS.S.light],
  [4, 2, 3, BRICK_COLORS.S.light],
  [5, 2, 2, canvasPalette.dropSheen],
];

/**
 * GAMBLE's reel, turning above the deck.
 *
 * On the field rather than only in the POWER inset, and that is the whole
 * design of the capsule: the effect *is* the reel, so a player watching the
 * panel instead of the ball would miss the one second it exists. It rides the
 * deck, because that is where the eye already is when a capsule is caught.
 *
 * The frame is what stops it being read as one more capsule to catch: a pill
 * boxed in the capsule's own magenta, holding station over the paddle and
 * changing face six times a second, is a machine and not something falling.
 */
export function drawGambleReel(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  deckY: number,
  face: PowerUpKind,
  scale: number,
  frame: number,
  demade = false,
): void {
  const pixel = spriteBrush(ctx, scale, demade);
  const left = centerX - 12;
  const top = deckY - 16;
  const tone = DROP_COLORS.GB;
  pixel(left, top, 24, 1, tone);
  pixel(left, top + 11, 24, 1, tone);
  pixel(left, top + 1, 1, 10, tone);
  pixel(left + 23, top + 1, 1, 10, tone);
  drawCapsule(ctx, left + 2, top + 2, face, scale, frame, demade);
}

/**
 * ANGEL's wings, on a deck that is carrying a charge.
 *
 * Without them the capsule is invisible from the catch until the instant it
 * fires, which can be a minute of holding something the player cannot see they
 * hold — and the first QA pass said exactly that. Two silver tufts on the ends
 * of the deck say it at a glance, in the same feathers the save throws.
 *
 * They beat the two obvious alternatives: a line along the floor is WALL's
 * sprite, and a spare ball parked below the deck would promise a return
 * position the save does not honour — it puts the ball back where it fell, not
 * where the deck is.
 *
 * Module-level and scale-taking like the deck itself: the arena paints them at
 * SCALE and the capsule catalogue at 1.
 */
export function drawAngelWings(
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  y: number,
  scale: number,
  frame: number,
  demade = false,
): void {
  const pixel = spriteBrush(ctx, scale, demade);
  // A slow beat on the same clock a trap's glyph blinks to: the feathers stir
  // rather than sit, which is most of what makes them read as wings.
  const lift = (frame & 16) === 0 ? 0 : 1;
  for (const [rise, outset, span, tone] of ANGEL_WING_ROWS) {
    const top = y - rise - lift;
    pixel(x - outset, top, span, 1, tone);
    pixel(x + width + outset - span, top, span, 1, tone);
  }
}

/**
 * The paddle deck, at whatever scale it is asked for — one pill, caps and all.
 *
 * `colors` is which deck: the player's, or MIRROR's ghost. SPLIT's hole is two
 * calls rather than a parameter, since each half is a whole deck with its own
 * caps.
 */
export function drawPaddleBands(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  colors: PaddleBandColors,
  scale: number,
  demade = false,
): void {
  const pixel = spriteBrush(ctx, scale, demade);
  const height = gameConfig.paddle.height;

  pixel(x + 1, y, width - 2, height, colors.body);
  pixel(x, y + 1, width, height - 2, colors.body);
  pixel(x + 1, y, 7, 1, colors.cap);
  pixel(x, y + 1, 8, height - 2, colors.cap);
  pixel(x + 1, y + height - 1, 7, 1, colors.cap);
  pixel(x + width - 8, y, 7, 1, colors.cap);
  pixel(x + width - 8, y + 1, 8, height - 2, colors.cap);
  pixel(x + width - 8, y + height - 1, 7, 1, colors.cap);
  pixel(x + 9, y + 1, width - 18, 1, colors.sheen);
  pixel(x + 9, y + height - 1, width - 18, 1, colors.shade);
}

/**
 * What the capsules holding a ball have done to how it is drawn.
 *
 * The capsules that restyle the ball all mutate the same eight rows, so the
 * order they compose in is settled once, here: **the birth mask is innermost,
 * and GLUE's squash (SHA-93) goes over whatever is inside it.** Everything on
 * this record is a picture and nothing else — the simulation behind it
 * collides a full round 8 px ball throughout.
 */
export interface BallSprite {
  // MULTI/SWARM: ticks left of this clone's birth, 0 for a full-grown ball.
  birth?: number;
  // GIANT: the ball's diameter, defaulting to the 8 px every caller but the
  // field itself wants — the capsule catalogue and the demo stills draw a
  // plain ball and should not have to say so.
  size?: number;
}

// The ball's body, without the trail behind it: the smear is the renderer's,
// since it is made of where the ball was rather than of what it is.
export function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  demade = false,
  sprite: BallSprite = {},
): void {
  const pixel = spriteBrush(ctx, scale, demade);
  const birth = birthStage(sprite.birth ?? 0);
  const size = sprite.size ?? BALL_SIZE;

  // A newborn is the round sprite clipped to a centred window — and the round
  // rows clipped to 4 or 6 px are exactly a filled square, so it is drawn as
  // one. No lit edge and no shadow: the mask is smaller than the pixels they
  // sit on, and a pip this hot reads as light, not as a lit thing.
  //
  // The window scales with the ball: a clone born under a live GIANT is a
  // 24 px ball, and a 4 px pip inside that footprint would read as a speck
  // sitting in a hole rather than as something growing into itself.
  if (birth) {
    const [, width, color] = birth;
    const grown = Math.max(1, Math.round((width * size) / BALL_SIZE));
    const inset = Math.round((size - grown) / 2);
    pixel(x + inset, y + inset, grown, grown, color);
    return;
  }

  ballRows(size).forEach(([offset, span], rowIndex) => {
    pixel(x + offset, y + rowIndex, span, 1, canvasPalette.ballBody);
  });
  for (const glint of ballGlints(size)) {
    pixel(
      x + glint.x,
      y + glint.y,
      glint.width,
      glint.height,
      glint.tone === "highlight" ? canvasPalette.ballHighlight : canvasPalette.ballShade,
    );
  }
}

// BLACKOUT's pools, in game pixels. A solo ball carries 58 px of light; each
// extra live ball takes 6 off every pool, down to a floor of 26 — so MULTI and
// SWARM light more of the field between them without ever lifting the trap.
// The deck's pool is smaller and never clears the veil outright: at 0.55 it
// glows rather than switching the lights back on where the player is standing.
//
// Exported because the capsule catalogue stages the same picture at 1× and a
// miniature may not draw the effect at a size the field would not — see
// `@render/capsuleScenes`.
export const BLACKOUT_TORCH = {
  ballRadius: 58,
  crowding: 6,
  minRadius: 26,
  paddleRadius: 34,
  paddlePeak: 0.55,
  // Where the light starts from and comes back to: the field's diagonal, so a
  // pool at either end of the iris reaches every corner from wherever the ball
  // happens to be and the dark has nothing to pop into.
  openReach: 480,
} as const;

/**
 * How much wider than its settled size a pool is, part-way through the iris.
 *
 * Geometric rather than linear: a light's reach falls off by ratio, so a
 * straight lerp from 480 would crawl through the wide end and wipe through the
 * near one. The blend is square-rooted first for the other half of the same
 * problem — the widest reaches are off the edges of a 372 px field and change
 * nothing anyone can see, so they are spent in the first few ticks and the rest
 * of the fade is the part that reads. What comes out is a light dropping fast
 * and then dying slowly, which is what a power-down looks like.
 *
 * Both pools are multiplied by the one factor, so the deck's glow keeps its
 * proportion to the ball's the whole way in and the whole way back out.
 */
function blackoutSpread(blend: number): number {
  return Math.pow(BLACKOUT_TORCH.openReach / BLACKOUT_TORCH.ballRadius, 1 - Math.sqrt(blend));
}

// One pool of light punched out of the veil: where it is, how far it reaches,
// and how far it clears the dark at its centre.
export interface Torch {
  x: number;
  y: number;
  radius: number;
  peak: number;
}

// The veil is built at 1× and blitted up, so a fill costs a ninth of what it
// would at SCALE and the gradients' falloff comes out in whole game pixels —
// chunky steps, which is the same art the rest of the field is drawn in. Lazy
// and module-level: the renderer paints it at SCALE and the capsule catalogue
// at 1, and a player who never catches the capsule never allocates it.
let veilCtx: CanvasRenderingContext2D | null = null;

/**
 * The dark, with a hole in it wherever there is something to see by.
 *
 * `destination-out` on a scratch canvas rather than a gradient painted over the
 * field: a pool has to *remove* the veil, and laying one on top would only be
 * a lighter patch of it. The blit lands at whatever origin the caller's
 * transform puts it — see `drawBlackout`, which is careful about that.
 */
export function drawBlackoutVeil(
  ctx: CanvasRenderingContext2D,
  torches: readonly Torch[],
  tone: string,
  scale: number,
): void {
  const { width, height } = gameConfig.field;
  if (veilCtx === null) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    veilCtx = canvas.getContext("2d");
    if (veilCtx === null) {
      return;
    }
  }
  const veil = veilCtx;

  veil.globalCompositeOperation = "source-over";
  veil.fillStyle = tone;
  veil.fillRect(0, 0, width, height);

  veil.globalCompositeOperation = "destination-out";
  for (const torch of torches) {
    const gradient = veil.createRadialGradient(torch.x, torch.y, 0, torch.x, torch.y, torch.radius);
    // Flat across the middle and falling only over the outer half: a pool that
    // starts fading at its centre puts the ball in a smudge, and the one thing
    // this capsule may not do is hide the ball.
    gradient.addColorStop(0, `rgba(0, 0, 0, ${torch.peak})`);
    gradient.addColorStop(0.55, `rgba(0, 0, 0, ${torch.peak * 0.85})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    veil.fillStyle = gradient;
    veil.fillRect(torch.x - torch.radius, torch.y - torch.radius, torch.radius * 2, torch.radius * 2);
  }
  veil.globalCompositeOperation = "source-over";

  ctx.drawImage(veil.canvas, 0, 0, width * scale, height * scale);
}

export class CanvasRenderer {
  // The canvas on screen, and the context every draw method actually writes to.
  // They are the same thing except mid-dissolve, when `ctx` is pointed at the
  // offscreen layer for one pass — which is the whole reason the two are not
  // one field.
  private readonly mainCtx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  private fadeCtx: CanvasRenderingContext2D | null = null;
  // UMBRA's 1-bit shadow fill, made on first use and kept: see `halftone`.
  private halftoneFill: CanvasPattern | null = null;
  private readonly background: BackgroundLayer;
  private frameCount = 0;
  // Set once per frame from the view, and read by every colour this class
  // paints. A field rather than a parameter because it applies to all of them:
  // threading it through twenty private draw methods would be the same fact
  // written twenty times.
  private demade = false;

  constructor(canvas: HTMLCanvasElement) {
    const { width, height } = gameConfig.field;
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context unavailable");
    }
    this.mainCtx = ctx;
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.background = new BackgroundLayer(width, height);
  }

  /**
   * One frame, and DEMAKE's dissolve across it.
   *
   * At either end of the fade there is one machine to paint and this is a
   * single pass. In between, both are painted in full and the demade one is
   * laid over the colour one at the blend: a true crossfade of the whole
   * picture — field art, sprites, the letters on the pills and the scanlines —
   * for one `globalAlpha`. The alternative, lerping every tone toward its tube
   * equivalent, would have to be invented separately for the palette, the
   * thresholded background and the ribbing, and the three would drift apart.
   *
   * The doubled pass costs two renders for the 30 frames at each end, and the
   * offscreen layer is allocated the first time one is needed — a player who
   * never catches the capsule never pays for either.
   */
  draw(view: RenderView): void {
    this.frameCount++;
    const blend = view.demakeBlend;

    if (blend <= 0 || blend >= 1) {
      this.demade = blend >= 1;
      this.paint(view);
      return;
    }

    this.demade = false;
    this.paint(view);

    this.demade = true;
    const fade = this.fadeContext();
    this.ctx = fade;
    this.paint(view);
    this.ctx = this.mainCtx;

    this.mainCtx.globalAlpha = blend;
    this.mainCtx.drawImage(fade.canvas, 0, 0);
    this.mainCtx.globalAlpha = 1;
  }

  // The offscreen twin the dissolve needs, made on first use. Never cleared:
  // `paint` opens by blitting the field layer over every pixel of it.
  private fadeContext(): CanvasRenderingContext2D {
    if (this.fadeCtx === null) {
      const canvas = document.createElement("canvas");
      canvas.width = this.mainCtx.canvas.width;
      canvas.height = this.mainCtx.canvas.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("2D fade context unavailable");
      }
      ctx.imageSmoothingEnabled = false;
      this.fadeCtx = ctx;
    }
    return this.fadeCtx;
  }

  // One machine's worth of frame, into whatever `this.ctx` currently is.
  private paint(view: RenderView): void {
    const { width, height } = gameConfig.field;
    // The level's field art, painted at 1× on a theme change and blitted here
    // with smoothing off — an exact 3× nearest-neighbour upscale, so the
    // background keeps the same chunky game pixels as the sprites.
    const layer = this.demade
      ? this.background.monoImageFor(view.background, view.backgroundVariant)
      : this.background.imageFor(view.background, view.backgroundVariant);
    this.ctx.drawImage(layer, 0, 0, width * SCALE, height * SCALE);

    // SNAP's paper goes straight onto the field art, outside both the turn and
    // the shake: it is part of the room, exactly as the background is, and a
    // lattice that rode QUAKE would be a grid measuring a wall that is moving
    // relative to it. A 180-degree turn maps the lattice onto itself anyway.
    if (view.snapGrid > 0) {
      this.drawSnapGrid(view.snapGrid);
    }

    // FLIP turns the arena over: the wall, everything standing on it, and the
    // frame around it — but not the field art under them, which stays put for
    // the same reason it does not ride QUAKE's shake. It is the room, and a
    // room that spun would leave the canvas empty at the corners mid-turn.
    this.ctx.save();
    this.applyTurn(view.flipTurn);

    // QUAKE displaces everything that stands on the field, and nothing else: the
    // background stays put so the shake reads as the wall rattling rather than
    // as the camera drifting, and the frame is painted after the restore, which
    // is what hides the overhang a 4 px lurch would otherwise show at the edges.
    // `translate`, never `setTransform` — this has to compose with whatever the
    // renderer is already under.
    this.ctx.save();
    this.ctx.translate(view.quake.offsetX * SCALE, view.quake.offsetY * SCALE);
    // UMBRA's wedges, first of everything that stands on the field and
    // therefore under all of it: a shadow is the fill and not the layer, so a
    // drop, a disc, a singularity's core or the ball crossing the band passes
    // over it the way it would pass over the field art. It rides the shake,
    // because it is cast by a wall that is shaking.
    if (view.shadows.casting) {
      this.drawShadows(view.shadows);
    }
    for (const core of view.cores) {
      this.drawSingularity(core);
    }

    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    // Where the wall's top edge is *this frame*, which is not always where its
    // index says. QUAKE's shift gives the wall a row and this is it falling
    // into it; the rest of the time it is `grid.top` exactly. Everything drawn
    // in wall coordinates below reads this one number, and so does `cellAt` —
    // a wall painted 12 px above the hitbox that plays it would cheat the
    // player at the exact moment the screen is shaking and they can least tell
    // what happened.
    const wallY = top - view.quake.dropOffset;
    const beamY = view.xrayBeamY - view.quake.dropOffset;
    view.grid.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (cell) {
          const x = left + columnIndex * brickWidth;
          // JELLY: this cell's own hang, on top of the wall's own top edge. The
          // one displacement in the game that is per cell rather than per wall,
          // and the hitbox reads the same number off the same sheet — a brick
          // that is drawn six pixels into the row below has to be collided
          // there too, or the capsule would be a lie the player can see.
          const y = wallY + rowIndex * brickHeight + view.offsets.offsetAt(rowIndex, columnIndex);
          const fade = ghostProgress(view.ghostBlend, rowIndex, columnIndex, this.frameCount);
          const erodeX = view.erosion.insetXAt(rowIndex, columnIndex);
          const erodeY = view.erosion.insetYAt(rowIndex, columnIndex);
          // COLLAPSE: how out of focus this brick is, 0 solid to 1 full fog.
          // It buys two things off the same number — the body goes thin and the
          // brick pulls inside its own cell — and both run backwards over the
          // six ticks after a ball has passed through it.
          //
          // **The brick keeps its own colours the whole way down.** GHOST's
          // `fade` hollows a brick out to an outline, which is the right
          // picture for a wall that is simply not there; this one is a wall the
          // player is choosing what to carve out of, and a granite they cannot
          // tell from a red is a choice they cannot make. See `fogAlpha`.
          const fog = view.fog.fogAt(rowIndex, columnIndex);
          const { fogAlpha, fogInsetX, fogInsetY } = gameConfig.powerUps.collapse;
          if (fog > 0) {
            this.ctx.globalAlpha = 1 - fog * (1 - fogAlpha);
          }
          drawBrick(this.ctx, x, y, cell, SCALE, {
            fade,
            demade: this.demade,
            gilded: rowIndex >= view.paydayFront,
            erodeX: erodeX + Math.round(fog * fogInsetX),
            erodeY: erodeY + Math.round(fog * fogInsetY),
            strain: view.jelly.strainAt(rowIndex, columnIndex),
            // SLUMP's arrival: for four ticks every brick's bottom bevel goes
            // to its own shade, which is the picture of something that is no
            // longer resting on anything.
            unmoored: view.slump.hesitating,
          });
          // The fog eating this brick's edge, drawn from the brick for the
          // trickle's reason below: it rides the wall through QUAKE's shake and
          // stops the tick the brick is killed.
          if (fog > 0) {
            this.drawFogGrain(x, y, cell.seed, fog);
          }
          // The seams this brick is opening, drawn from the brick itself so the
          // trickle rides the wall through QUAKE's shake and stops the tick the
          // brick is killed. Under the revealed pill below, which is a thing to
          // read rather than weather.
          if (view.erodeBlend > 0 && view.erodeBlend < 1) {
            this.drawErodeGrains(x, y, erodeX, erodeY, view.erodeBlend, view.erodeSetting);
          }
          // The fractures this brick is opening, drawn from the brick for the
          // trickle's reason exactly: they ride the wall through QUAKE's shake
          // and stop the tick the brick is killed. Over the wear above them —
          // a crack is on the face of whatever stone is left, so it is drawn
          // last of the two — and under the revealed pill, which is a thing to
          // read rather than weather.
          // SLUMP setting: the line of mortar being poured back in, running up
          // the pile from the floor. Drawn along the top edge of the row it has
          // reached, over the brick rather than beside it — what is being shown
          // is the seam closing, and a line in the gap between two rows would
          // belong to neither of them.
          if (rowIndex === view.slump.settingAt) {
            this.pixel(x + 1, y, brickWidth - 2, 1, canvasPalette.erodeDust);
            this.pixel(x + 3, y - 1, brickWidth - 8, 1, canvasPalette.erodeGrain);
          }
          if (view.gravelBlend > 0) {
            this.drawGravelCracks(x, y, rowIndex, columnIndex, erodeX, erodeY, view.gravelBlend);
          }
          // Branched rather than clipped blind. Gating on the blend alone would
          // pay a save/beginPath/rect/clip/restore on every revealed pill on
          // every one of the capsule's 300 frames, and lean on a negative-height
          // rect to keep the rows under the bar off the wall.
          if (cell.capsule && view.xrayBlend > 0) {
            if (view.xrayBlend === 1 || y + brickHeight <= beamY) {
              this.drawRevealedCapsule(x, y, cell.capsule);
            } else if (y < beamY) {
              this.drawRevealedCapsule(x, y, cell.capsule, beamY);
            }
          }
        }
      });
    });

    // SUPERPOSE's echoes, over the wall rather than under it. A double
    // exposure is the picture, and echoes painted beneath the bricks would be
    // hidden everywhere the wall is dense — which is everywhere that matters,
    // and would leave a surface the ball can be turned by that the player
    // cannot see. Over the bricks and inside the shake, because they hang off
    // a wall that is shaking.
    if (view.superpose.active) {
      this.drawEchoes(view.superpose);
    }

    // TWIN's threads, over the wall for the echoes' reason and inside the shake
    // for theirs: a thread is tied to two bricks and crosses everything between
    // them, so one drawn under the wall would be a wire the player can only see
    // in the gaps. It rides the quake because both of its anchors do.
    if (view.twin.active) {
      this.drawThreads(view.twin);
    }

    // FENCE's posts, after the wall and in coordinates of their own: they ride
    // the shake, because a fence planted in a field that is shaking shakes, and
    // they take none of `wallY` — the drop is the *wall* falling into the row
    // QUAKE gave it, and the fence was never in the wall.
    if (view.fence.standing) {
      this.drawFence(view.fence);
    }

    // Over the bricks it has just read and under everything that stands on the
    // wall — and inside the shake, so the bar rides the wall it is reading
    // rather than detaching from it for QUAKE's ten ticks.
    // The third clause is the empty wall: a last brick killed with XRAY in hand
    // freezes the timers for the clear but not this blend, and without it a bar
    // would sit on the wall's top edge for twenty ticks with nothing to read.
    if (view.xrayBlend > 0 && view.xrayBlend < 1 && view.xrayBeamY > gameConfig.grid.top) {
      this.drawXrayBeam(beamY, view.xrayReading);
    }

    for (const flash of view.flashes) {
      const flashY = flash.onWall ? flash.y - view.quake.dropOffset : flash.y;
      // Whether the front had reached this brick is decided when it dies, not
      // when it is drawn: a two-tick flash is a record of the kill, and the
      // tide moving on cannot retroactively make an earlier one gold.
      const tone = flash.gild ? canvasPalette.paydayFlash : FLASH_COLORS[flash.kind];
      // Cut to the brick that died rather than to its cell. A flash is the shape
      // the brick had on the frame it was killed, and a full-cell one over a
      // wall ERODE has worn down to 20x6 would paint a brick back into the lane
      // the ball is still travelling up.
      const flashPad = flash.onWall ? this.flashWear(flash, view) : { x: 1, y: 1 };
      this.pixel(
        flash.x + flashPad.x,
        flashY + flashPad.y,
        gameConfig.grid.brickWidth - flashPad.x * 2,
        gameConfig.grid.brickHeight - flashPad.y * 2,
        tone,
      );
    }
    // Under the balls and inside the shake: a thread is a line between a ball and
    // the rail, and one that ignored QUAKE would point somewhere the deck is not.
    // Drawn before the balls so the sprite always wins over its own guide.
    if (view.tracerBlend > 0) {
      for (const thread of view.tracerThreads) {
        this.drawTracerThread(thread, view.tracerBlend, view.tracerArriving, view.paddle);
      }
    }
    // Inside the shake and over the wall: a bracket marks a point on the field
    // where something happened, and a mark that ignored QUAKE would drift off
    // the brick it was struck against.
    for (const mark of view.snapMarks) {
      this.drawSnapMark(mark);
    }
    for (const ball of view.balls) {
      if (ball.active && ball.homingRow >= 0) {
        this.drawHomingMark(ball, view.homingOpening, wallY);
      }
    }
    this.drawCritter(view.critter, view.quake.dropOffset);
    // Slot index cycles the brick's three palette colors — sequential ring-buffer
    // slots give each burst a flat/light/dark mix without storing a color per particle.
    view.particles.forEach((particle, index) => {
      if (particle.ticksLeft <= 0) {
        return;
      }
      const colors = CHUNK_COLORS[particle.material];
      const color = particle.spark
        ? PIERCE_SPARK_TONES[index % PIERCE_SPARK_TONES.length]
        : [colors.flat, colors.light, colors.dark][index % 3];
      this.spritePixel(particle.x, particle.y, particle.size, particle.size, color);
    });
    // Over their own trail, which is what the particles above just painted.
    for (const meteor of view.meteors) {
      if (meteor.active) {
        this.drawMeteor(meteor);
      }
    }
    for (const bolt of view.bolts) {
      this.drawChainBolt(bolt, view.quake.dropOffset);
    }
    if (view.energyWallBlend > 0) {
      this.drawEnergyWall(view);
    }
    for (const bumper of view.bumpers) {
      this.drawBumper(bumper);
    }
    if (view.magnetReach > 0) {
      this.drawMagnetTethers(view.paddle, view.drops, view.magnetReach);
    }
    // Under the deck as always — except in a blackout, which paints them again
    // above its veil instead. See `drawBlackout` for why they stay lit.
    if (view.blackoutBlend <= 0) {
      this.drawDrops(view);
    }
    // With the capsules and under the deck, because a pip is one: it is caught
    // on the same surface, it is worth points, and the deck sliding over one
    // has to be seen covering it. Unlike a capsule it is *not* redrawn above a
    // blackout veil — that carve-out exists so a trap cannot be caught blind,
    // and there is no such thing as a pip you regret taking.
    this.drawPips(view);
    for (const shot of view.shots) {
      if (shot.active) {
        this.spritePixel(shot.x, shot.y, 2, 9, canvasPalette.laserShot);
      }
    }
    // Under the deck: a peel is on the rail the paddle slides along, and the
    // paddle sliding over one has to be seen covering it. The rail marks sit in
    // the same band for the same reason — they are where the deck was, so the
    // deck has to be drawn over them.
    for (const mark of view.railMarks) {
      this.drawRailMark(mark);
    }
    for (const peel of view.peels) {
      this.drawPeel(peel);
    }
    // A reflection has nothing left to reflect once the deck is in pieces, so
    // the ghost leaves on the break's own curve rather than being cut at the
    // frame the bomb lands. It is only a picture by then — the fuse gate has
    // already refused every bounce for its whole 45 ticks.
    const deckDim = view.paddleHidden ? view.paddleBreak : 1;
    if ((view.mirrorForm > 0 || view.mirrorAfterImage > 0) && deckDim > 0) {
      this.drawMirror(view.paddle, view.mirrorForm * deckDim, view.mirrorAfterImage * deckDim);
    }
    if (view.paddleHidden) {
      this.drawPaddleBreak(view);
    }
    if (!view.paddleHidden) {
      this.drawPaddle(view.paddle);
      if (view.angelArmed) {
        drawAngelWings(this.ctx, view.paddle.x, view.paddle.width, view.paddle.y, SCALE, this.frameCount, this.demade);
      }
      if (view.gambleFace) {
        const center = view.paddle.x + view.paddle.width / 2;
        drawGambleReel(this.ctx, center, view.paddle.y, view.gambleFace, SCALE, this.frameCount, this.demade);
      }
    }
    view.balls.forEach((ball, index) => {
      if (ball.active) {
        const ghost = paceGhost(ball, view.tempoGhost);
        if (ghost) {
          this.drawBallShell(ghost.x, ghost.y, canvasPalette.paceGhost, ball.size);
        }
        // GLUE: a parked ball rides on the resin rather than on the wood, with
        // a thread of it under the ball. Both settle as the film dries, so the
        // ball is flush and untethered by the time the capsule lets go — the
        // release itself stays instant, which is what a bounce is.
        const lift = ball.stuckOffsetX === null ? 0 : glueLift(view.paddle.glueReach);
        if (lift > 0) {
          this.spritePixel(ball.centerX - 1, ball.y + ball.size - lift, 2, lift, canvasPalette.glueResin);
        }
        this.drawBall(ball, view.ballTrail, view.turboTrail ? TURBO_TRAIL_TONES : RUSH_TRAIL_TONES, lift);
        // Around the ball rather than in the ring pool: this one rides a ball
        // that is still coasting, while the release ring has to stay where the
        // ball stopped.
        if (view.stasisClosing > 0) {
          const half = ball.size / 2;
          this.strokeStasisRing(ball.x + half, ball.y + half, 2 + (1 - view.stasisClosing) * 18);
        }
        // Over the ball and last, so the arc is the topmost thing on the sprite
        // it is arcing off. Indexed rather than `for..of` for the seed alone:
        // two balls side by side may not crackle in lockstep.
        if (view.haywire > 0) {
          this.drawHaywireArc(ball, index, view.haywire, lift);
        }
        // Beside the arc and drawn the same way — around the sprite, never on
        // it. Gated on the ball's own spin rather than on a blend, because that
        // is what the flecks are showing: a ball with english on it wears them
        // whether or not the capsule that put it there is still live.
        if (ball.spin !== 0) {
          this.drawSpinFlecks(ball, lift);
        }
        // Last of the three, and above the ball rather than around it: the arc
        // and the flecks orbit the sprite, and a crown is standing on it. Gated
        // on the ball's own counter and not on the capsule, so a crown guttering
        // out after the ten seconds are up is still drawn — which is the point
        // of the stagger that put it there.
        if (ball.pyreCrown > 0) {
          this.drawPyreCrown(ball, index, lift);
        }
      }
    });

    for (const ring of view.stasisRings) {
      this.drawStasisRing(ring);
    }

    // The lights go out here: over the field, the wall, the deck and the balls,
    // and under everything below — the capsules, the catch pops, the shockwave
    // and the wall frame that ends the frame.
    if (view.blackoutBlend > 0) {
      this.drawBlackout(view);
      this.drawDrops(view);
    }

    for (const pop of view.pops) {
      this.drawPop(pop);
    }

    // Under the nuke and over everything else on the field: a crater is the
    // brightest thing the game does short of a shockwave taking the whole wall.
    for (const blast of view.pyreBlasts) {
      this.drawPyreBlast(blast);
    }

    this.drawDetonation(view.detonation);
    this.ctx.restore();

    // The sea, over everything standing in it and under the frame around it.
    //
    // Outside QUAKE's shake and inside FLIP's turn, which is the same pair of
    // decisions SNAP's lattice and the frame itself make: water does not ride a
    // wall rattling, and a field turned over takes its contents with it.
    //
    // Over the deck and the balls rather than under them, deliberately. The
    // wash is what makes something *submerged* — the half of the deck below the
    // surface goes green on the frame the water reaches it, with no second
    // sprite and no clip — and drawing the sea underneath them would be drawing
    // a green floor with the field standing on top of it.
    if (view.tideBlend > 0 || view.tideDrip > 0) {
      this.drawTide(view);
    }

    // Inside the turn with the field: the frame is closed at the top and open
    // at the bottom, so which edge kills is drawn rather than remembered.
    this.drawWalls();
    // The sun itself, on the frame and therefore over it: a light source is in
    // front of the cabinet's own woodwork, and it is the one thing this capsule
    // draws that is not black. Inside the turn with the frame it is painted on,
    // so a flipped field's sun comes up along the bottom — which is the honest
    // answer rather than a special case, because FLIP turns the arena over and
    // the shadows it is throwing have turned over with it.
    if (view.shadows.casting) {
      this.drawUmbraSky(view.shadows);
    }
    // After the frame and never instead of it: the rows outside the aperture
    // are simply not painted, so what closes the gap as the door pinches shut
    // is the real wall this call has just laid down, not a tint of it. A door
    // cut into a wall, rather than stripes ghosting up through one.
    if (view.portalMouthHeight > 0) {
      this.drawPortals(view.portalMouthTop, view.portalMouthHeight, view.portalMouthHeight < PORTAL_FULL);
    }
    this.ctx.restore();

    // Outside it: the ribbing is on the glass, not on the field.
    if (this.demade) {
      this.drawScanlines();
    }
  }

  /**
   * FLIP's turn, as a matrix.
   *
   * Settled, it is an exact point reflection about the field centre — whole
   * device pixels in, whole device pixels out, so an upside-down field is as
   * crisp as an upright one and nothing resamples. Turning, it is the same
   * rotation part-way through, shrunk by however much it takes for the rotated
   * field to still fit inside the frame: at a quarter turn a 372x300 field
   * standing on its side is 372 tall in a 300 tall canvas, and without the fit
   * the wall would be sliced off at both ends of the turn.
   *
   * `transform`, never `setTransform` — this has to compose with whatever the
   * renderer is already under, exactly as QUAKE's shake does under it.
   */
  private applyTurn(turn: number): void {
    if (turn <= 0) {
      return;
    }
    const width = gameConfig.field.width * SCALE;
    const height = gameConfig.field.height * SCALE;
    if (turn >= 1) {
      this.ctx.transform(-1, 0, 0, -1, width, height);
      return;
    }
    const angle = turn * Math.PI;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const fit = Math.min(1, width / (width * cos + height * sin), height / (width * sin + height * cos));
    this.ctx.translate(width / 2, height / 2);
    this.ctx.rotate(angle);
    this.ctx.scale(fit, fit);
    this.ctx.translate(-width / 2, -height / 2);
  }

  // The tube's ribbing: one ground row every third device pixel, over
  // everything. Static and unblinking — a scanline that crawls reads as a
  // rendering fault, and this one has to read as the hardware.
  private drawScanlines(): void {
    const width = gameConfig.field.width * SCALE;
    const height = gameConfig.field.height * SCALE;
    this.ctx.fillStyle = canvasPalette.demakeGround;
    for (let y = 0; y < height; y += DEMAKE_SCANLINE_STEP) {
      this.ctx.fillRect(0, y, width, 1);
    }
  }

  // A hole in the field: a disc darker than any theme, a halo that breathes on
  // the frame clock, and a still outer rim marking how far it really reaches.
  // Painted over the background and under the bricks, so it reads as depth
  // rather than as a sprite laid on the playfield.
  /**
   * UMBRA's twelve wedges, as the rows the rasterizer cut.
   *
   * One `fillStyle` for the whole field and a bare `fillRect` per row rather
   * than `pixel`: this is up to twelve hundred rows a frame for ten seconds,
   * and every one of them is the same flat black. The spans are already whole
   * pixels and already clipped to the field, so there is nothing left here to
   * round or to bound — which is the point of rasterizing once. The renderer
   * does not know what shape it is painting, and cannot disagree with the
   * physics about it.
   */
  /**
   * One echo per live pair: the brick's own body at half a breath of alpha,
   * with the capsule's violet round it.
   *
   * **The fill is the brick's flat tone and not a colour of this capsule's**,
   * because what is being claimed is that the brick is in two places — a
   * violet rectangle beside a red brick is a violet rectangle, not a second
   * red brick. And the alpha is what says which of the two you are looking at,
   * except that it keeps changing its mind: the shimmer trades brightness
   * between the pair, so the echo is faint while the brick is solid and then
   * nearly solid while the brick is faint, and neither is ever the answer.
   *
   * The liseré is SHA-137's lesson taken in advance. UMBRA shipped its shadows
   * without an edge and they could not be found on a dark field; a brick's own
   * tone at a third of an alpha, laid over a wall made of that tone, is the
   * same bug with better camouflage. The edge is the one pixel in the sprite
   * that belongs to SUPERPOSE, which is exactly what makes the shape findable.
   */
  /**
   * COLLAPSE's grain: the pixels a decohering brick is losing off its edge.
   *
   * Hashed off the cell's own seed the way `drawGrain` hashes granite's flecks,
   * so the pattern is identical on every frame of a brick's life and unrelated
   * to its neighbour's — a column of bricks shedding the same six pixels would
   * read as a tiling artefact rather than as fog.
   *
   * Outside the body and not on it. The brick has already pulled inside its own
   * cell by this point (see the `erodeX` the loop above adds), so the grain
   * lands in the gap that opened — what is drawn is the brick's edge coming
   * apart into the space it used to fill, which is also exactly the space the
   * ball is now allowed through.
   */
  private drawFogGrain(x: number, y: number, seed: number, fog: number): void {
    const { brickWidth, brickHeight } = gameConfig.grid;
    const { fogGrains } = gameConfig.powerUps.collapse;
    this.ctx.globalAlpha = fog;
    for (let index = 0; index < fogGrains; index++) {
      const hash = grainHash(seed, index + 64);
      // Around the rim rather than anywhere in the cell: a grain in the middle
      // of a brick is a speck on its face, which is granite's picture.
      const along = (hash >>> 8) % (brickWidth + brickHeight);
      const flip = (hash & 1) === 1;
      const grainX = along < brickWidth ? along : flip ? 0 : brickWidth - 1;
      const grainY = along < brickWidth ? (flip ? 0 : brickHeight - 1) : along - brickWidth;
      this.pixel(x + grainX, y + grainY, 1, 1, canvasPalette.collapseGrain);
    }
    this.ctx.globalAlpha = 1;
  }

  private drawEchoes(superpose: Superposition): void {
    const { alphaFrom, alphaTo, popTicks } = gameConfig.powerUps.superpose;
    const alpha = alphaFrom + (alphaTo - alphaFrom) * superpose.shimmer;
    for (const rect of superpose.rects) {
      const { x, y, width, height } = rect;
      this.ctx.globalAlpha = alpha;
      this.pixel(x, y, width, height, BRICK_COLORS[rect.kind].flat);
      // Full strength, over the body rather than under the same alpha it is
      // drawn at: an edge that breathed with the fill would vanish at the
      // bottom of every breath, and the bottom of the breath is exactly when
      // the shape most needs an outline.
      //
      // **Two sides and not four**, which is the one thing about this sprite
      // that had to be seen on a field before it could be decided. A closed
      // rectangle round every echo tiles a dense wall into a violet mesh — a
      // net thrown over the bricks, which is SNAP's picture and not this one,
      // and it says *lattice* where the capsule means *double*. The bottom and
      // the right are exactly the L that hangs clear of the caster, because
      // that is the direction the echo is offset in: what is drawn is the part
      // of the double that is not behind its own brick, which is also the only
      // part with open field behind it to be read against.
      this.ctx.globalAlpha = 1;
      this.pixel(x, y + height - 1, width, 1, canvasPalette.superposeEdge);
      this.pixel(x + width - 1, y, 1, height - 1, canvasPalette.superposeEdge);
    }
    // The pairs spent this tick: a closed ring, opening a pixel a tick off
    // every side as it fades. What is being said is that the double was there
    // and is not — the opposite of the brick's own death burst, which throws
    // its body outward in chunks. An echo has no body to throw.
    //
    // Closed where the standing echo's edge is an L, and deliberately: this one
    // is a shape *leaving*, which is a ring opening outward, and there are only
    // ever a few in a frame. The mesh the L exists to prevent needs the whole
    // wall wearing one at once.
    for (const pop of superpose.pops) {
      const grow = popTicks - pop.ticksLeft;
      this.ctx.globalAlpha = pop.ticksLeft / popTicks;
      this.outline(
        pop.x - grow,
        pop.y - grow,
        pop.width + grow * 2,
        pop.height + grow * 2,
        canvasPalette.superposeEdge,
      );
    }
    this.ctx.globalAlpha = 1;
  }

  /**
   * TWIN's threads, and the flashes running down the ones just spent.
   *
   * **Spaced pixels and not a rule**, which is two decisions at once. A solid
   * hairline across 300 px of field competes with the ball for the eye, and
   * twelve of them would be a cat's cradle laid over the thing the player is
   * actually tracking. And a pattern is the one thing DEMAKE cannot take away:
   * the tube flattens every tone on the field to one ink, so a line that said
   * *thread* by being coral would say nothing at all down there — this one says
   * it by being dotted and by moving, which survives the demake exactly as
   * MOULD's fur has to (SHA-142).
   *
   * The shiver is a travelling wave under a standing envelope: the offset is
   * zero at both anchors and widest in the middle, because the thread is *tied*
   * at each end, and the wave runs along it rather than pulsing in place. A
   * thread breathing on the spot reads as a rendering fault; one with something
   * running down it reads as under tension, and tension is the whole of what
   * this capsule has to say while nothing is happening.
   *
   * **Under the blackout veil, and that is the ruling the ticket asked for.**
   * A thread is drawn here, with the wall, so the torch finds it near the ball
   * and loses it everywhere else — which costs nothing and is the honest
   * answer. The carve-out that redraws capsules *above* the veil exists so a
   * trap cannot be caught blind; there is no such thing as a thread you regret
   * not seeing, and a field of hairlines glowing through the dark would be a
   * better picture than this capsule has earned.
   */
  private drawThreads(twin: Entanglement): void {
    const { dotPitch, shiverAmplitude, shiverWavelength, shiverTicks, slackFall, slackSag, snapTicks, snapHead } =
      gameConfig.powerUps.twin;
    const slack = twin.slack;
    // The wave's own travel, in pixels along a thread, so every thread on the
    // field shivers in step: they are all one capsule, and twelve independent
    // phases would read as twelve things rather than as one wall wired up.
    const travel = (twin.phase / shiverTicks) * shiverWavelength;
    this.ctx.globalAlpha = 1 - slack;
    for (const thread of twin.threads) {
      const alongX = thread.bx - thread.ax;
      const alongY = thread.by - thread.ay;
      const length = Math.hypot(alongX, alongY);
      if (length === 0) {
        continue;
      }
      // Both ends at once: a dot exists once the nearer anchor has paid out to
      // it, so the two halves close on the middle. `drawn` is per couple, since
      // the refill clock keeps adding them all the way through the nine seconds.
      const reach = (length / 2) * thread.drawn;
      const unitX = alongX / length;
      const unitY = alongY / length;
      // Where one pixel of this thread lands, at a distance along it. Written
      // into two locals rather than returned as a point: a 300 px thread is 75
      // dots and there are twelve of them on the field, so a fresh object per
      // pixel would be nine hundred allocations a frame for nine seconds.
      let dotX = 0;
      let dotY = 0;
      const at = (walked: number): void => {
        const envelope = Math.sin((Math.PI * walked) / length);
        const wave = Math.sin(((walked - travel) / shiverWavelength) * Math.PI * 2) * shiverAmplitude * envelope;
        // The expiry, in the thread's own idiom: it bows out of its anchors and
        // then falls, squared so the drop accelerates the way a rope let go
        // does. The bow rides the same envelope the shiver does, because it is
        // the same string — and the two add rather than replacing each other,
        // so a thread goes limp before it goes.
        const sag = slack * (slackSag * envelope + slackFall * slack);
        dotX = thread.ax + unitX * walked - unitY * wave;
        dotY = thread.ay + unitY * walked + unitX * wave + sag;
      };
      for (let walked = 0; walked <= length; walked += dotPitch) {
        if (Math.min(walked, length - walked) > reach) {
          continue;
        }
        at(walked);
        this.spritePixel(dotX, dotY, 1, 1, canvasPalette.twinThread);
        // **DEMAKE, and the one thing a 1 px line owes itself on a 1-bit tube.**
        // The demake flattens every tone on the field to one ink, so a thread
        // laid over a brick is the brick's own colour and simply is not there —
        // which is MOULD's fur problem (SHA-142) and takes MOULD's answer:
        // density and pattern, never tone. The gap between two dots is painted
        // in the *ground* here, so the thread alternates ink and hole all the
        // way along. Over bare field the ink half reads and the hole is
        // invisible; over a brick the hole reads and the ink half is invisible.
        // Exactly one of the pair lands wherever it is, which is what makes the
        // line survive a wall it crosses rather than only the mortar.
        //
        // Not through `ink()`: that maps a tone to ink or ground by a set
        // membership, and what is wanted here is the ground itself.
        if (this.demade) {
          at(walked + dotPitch / 2);
          this.ctx.fillStyle = canvasPalette.demakeGround;
          this.ctx.fillRect(Math.round(dotX * SCALE), Math.round(dotY * SCALE), SCALE, SCALE);
        }
      }
    }
    this.ctx.globalAlpha = 1;

    // A spent couple: two hot heads, one running out from the brick the player
    // struck and one running back from its partner. **A break is an event and
    // not a fade** — the thread itself is already gone, and what is left is the
    // report that the damage went both ways rather than travelling one.
    for (const snap of twin.snaps) {
      const alongX = snap.bx - snap.ax;
      const alongY = snap.by - snap.ay;
      const length = Math.hypot(alongX, alongY);
      if (length === 0) {
        continue;
      }
      const gone = (snapTicks - snap.ticksLeft) / snapTicks;
      const unitX = alongX / length;
      const unitY = alongY / length;
      const head = length * gone;
      for (let back = 0; back < snapHead; back += 1) {
        const at = head - back;
        if (at < 0 || at > length) {
          continue;
        }
        // Brightest at the head and dimming behind it, so the flash reads as
        // something arriving rather than as a bar sliding along the line.
        this.ctx.globalAlpha = (1 - back / snapHead) * (1 - gone * gone);
        this.spritePixel(snap.ax + unitX * at, snap.ay + unitY * at, 1, 1, canvasPalette.twinFlash);
        this.spritePixel(snap.bx - unitX * at, snap.by - unitY * at, 1, 1, canvasPalette.twinFlash);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  // A closed 1 px rectangle as four fills, the way `drawBrick` draws a ghost's
  // outline. `strokeRect` would put the line on the pixel boundary and land it
  // a half pixel either side of where every other edge in this renderer sits.
  private outline(x: number, y: number, width: number, height: number, color: string): void {
    this.pixel(x, y, width, 1, color);
    this.pixel(x, y + height - 1, width, 1, color);
    this.pixel(x, y + 1, 1, height - 2, color);
    this.pixel(x + width - 1, y + 1, 1, height - 2, color);
  }

  private drawShadows(shadows: ShadowCast): void {
    const { columns } = gameConfig.grid;
    const fill = this.demade ? this.halftone() : canvasPalette.umbraCast;
    const edge = this.ink(canvasPalette.umbraEdge);
    const field = gameConfig.field;
    for (let column = 0; column < columns; column++) {
      const wedge = shadows.wedgeAt(column);
      for (let index = 0; index < wedge.count; index++) {
        const left = shadows.leftAt(column, index);
        const right = shadows.rightAt(column, index);
        if (right <= left) {
          continue;
        }
        const y = (wedge.top + index) * SCALE;
        this.ctx.fillStyle = fill;
        this.ctx.fillRect(left * SCALE, y, (right - left) * SCALE, SCALE);
        // The liseré needs shadow on both sides of it to be a liseré. Under
        // four pixels a row cannot hold an inset, a line and a pixel of dark
        // inboard of it — which is the arrival's first dark pixel and the
        // sunset's last, and both are supposed to leave dark.
        if (right - left < UMBRA_INSET + 2) {
          continue;
        }
        // The right flank, always — not whichever one the sun happens to be
        // facing. A liseré that changed sides mid-run would be twelve wedges
        // flipping together as the shear passes zero, which reads as a fault
        // rather than as light; one fixed side is a house style, and the sun's
        // position is already said by the mark on the frame and by the rake of
        // the shadows themselves.
        //
        // Never against the frame: a raking wedge is clipped at the field's own
        // margin, so its clipped flank is not an edge of the shadow at all and
        // a line measured off it would be a rule painted up the inside of the
        // wall.
        if (right >= field.right) {
          continue;
        }
        this.ctx.fillStyle = edge;
        this.ctx.fillRect((right - 1 - UMBRA_INSET) * SCALE, y, SCALE, SCALE);
      }
    }
    this.drawUmbraSurges(shadows);
  }

  /**
   * A 50 % dither of ink and ground, which is what a shadow is on a 1-bit tube.
   *
   * **The one place in this renderer where `ink()` gives the wrong answer.**
   * Every other tone the demake flattens is a sprite or a bevel, so ink or
   * ground is a real choice between them. A shadow is neither: it is *darker
   * than whatever is under it*, and a machine with two tones cannot say that.
   * Sent through `ink()` it comes back as the bright one and the twelve wedges
   * paint as twelve beams of light — the picture exactly inverted, and inverted
   * in the one capsule whose whole subject is where the light is not.
   *
   * `demakeGround` is not the answer either: over the dark half of a field the
   * shape would simply not be there, which is the invisible collider this
   * capsule retires BLACKOUT to avoid.
   *
   * So it halftones, the way a 1-bit machine has said "shaded" since before
   * this genre existed. Half the pixels ink and half ground reads as a region
   * against a solid field of either tone, and reads as nothing else on screen —
   * no sprite here is dithered. Two game pixels square, built once.
   */
  private halftone(): CanvasPattern {
    if (this.halftoneFill === null) {
      const tile = document.createElement("canvas");
      tile.width = 2 * SCALE;
      tile.height = 2 * SCALE;
      const ctx = tile.getContext("2d");
      if (!ctx) {
        throw new Error("2D halftone context unavailable");
      }
      ctx.fillStyle = canvasPalette.demakeGround;
      ctx.fillRect(0, 0, 2 * SCALE, 2 * SCALE);
      ctx.fillStyle = canvasPalette.demakeInk;
      ctx.fillRect(0, 0, SCALE, SCALE);
      ctx.fillRect(SCALE, SCALE, SCALE, SCALE);
      const pattern = this.mainCtx.createPattern(tile, "repeat");
      if (!pattern) {
        throw new Error("halftone pattern unavailable");
      }
      this.halftoneFill = pattern;
    }
    return this.halftoneFill;
  }

  /**
   * The bright band a struck wedge sends home, in the wedge's own rows.
   *
   * It is the same spans painted a second time in a different tone, which is
   * what keeps it *on* the shadow: a band drawn from the quad would drift off a
   * tapering shape by a pixel at the tip, and the one thing this picture has to
   * do is read as light travelling inside the dark rather than over it.
   *
   * The head climbs from the contact to the mouth over the surge's life and the
   * tail follows it up, so what the player sees leaves the ball and arrives at
   * the brick — the direction is the whole lesson, and it is the reverse of
   * every other bright thing this game throws at a wall.
   */
  private drawUmbraSurges(shadows: ShadowCast): void {
    const { surgeTicks, surgeTail } = gameConfig.powerUps.umbra;
    this.ctx.fillStyle = this.ink(canvasPalette.umbraSurge);
    for (const surge of shadows.surges) {
      const wedge = shadows.wedgeAt(surge.column);
      if (wedge.count === 0) {
        continue;
      }
      const home = 1 - surge.ticksLeft / surgeTicks;
      const head = surge.fromY + (wedge.mouthY - surge.fromY) * home;
      const from = Math.max(0, Math.round(head) - wedge.top);
      const to = Math.min(wedge.count - 1, from + surgeTail);
      for (let index = from; index <= to; index++) {
        const left = shadows.leftAt(surge.column, index);
        const right = shadows.rightAt(surge.column, index);
        if (right > left) {
          this.ctx.fillRect(left * SCALE, (wedge.top + index) * SCALE, (right - left) * SCALE, SCALE);
        }
      }
    }
  }

  /**
   * The light: a hot mark crossing the top frame, and the rim it comes up on.
   *
   * The sun spends the first seventy ticks of the capsule off the left of the
   * frame and the last seventy off the right, which is deliberate and is the
   * whole reason the rims exist: the shadows are already on the field while the
   * light throwing them is still behind the cabinet, and a field with no light
   * source in it is a field with a black smear on it. So the frame it is behind
   * lights instead — top to bottom on the left as it comes up, and on the right
   * as it goes down, which is the same sun and the opposite end of its day.
   *
   * The rim narrows from the frame's full three pixels to one as the sun climbs
   * off it, in whole pixels of two named tones: everything else on this field
   * fades by losing pixels rather than by losing opacity, and a `globalAlpha`
   * glow would be the one thing on screen that does not.
   */
  private drawUmbraSky(shadows: ShadowCast): void {
    const { width, height } = gameConfig.field;
    const left = shadows.leftRim;
    if (left > 0) {
      const thickness = Math.ceil(left * 3);
      this.pixel(0, 0, thickness, height, thickness > 1 ? canvasPalette.umbraSun : canvasPalette.umbraRim);
    }
    const right = shadows.rightRim;
    if (right > 0) {
      const thickness = Math.ceil(right * 3);
      this.pixel(
        width - thickness,
        0,
        thickness,
        height,
        thickness > 1 ? canvasPalette.umbraSun : canvasPalette.umbraRim,
      );
    }
    const sun = Math.round(shadows.sunX);
    if (sun < -6 || sun > width + 6) {
      return;
    }
    // Three pixels of frame, and the mark is the frame: a light on the woodwork
    // rather than a disc floating in front of it. The warm edge either side is
    // what stops a nine pixel block reading as a gap in the wall.
    this.pixel(sun - 4, 0, 9, 3, canvasPalette.umbraSun);
    this.pixel(sun - 7, 0, 3, 3, canvasPalette.umbraRim);
    this.pixel(sun + 5, 0, 3, 3, canvasPalette.umbraRim);
  }

  private drawSingularity(singularity: Singularity): void {
    if (!singularity.active) {
      return;
    }
    const x = singularity.x * SCALE;
    const y = singularity.y * SCALE;
    const ring = (radius: number, color: string, width: number): void => {
      this.ctx.strokeStyle = this.ink(color);
      this.ctx.lineWidth = width * SCALE;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius * SCALE, 0, Math.PI * 2);
      this.ctx.stroke();
    };

    this.ctx.fillStyle = this.ink(canvasPalette.singularityCore);
    this.ctx.beginPath();
    this.ctx.arc(x, y, singularity.radius * SCALE, 0, Math.PI * 2);
    this.ctx.fill();
    // Both offsets go through `reach`, so VORTEX wears its halo a proportional
    // way out rather than the small hole's 3 px collar on a disc half again as
    // wide — the two read as one object at two sizes.
    ring(singularity.radius + singularity.reach(3 + Math.sin(this.frameCount * 0.2)), canvasPalette.singularityHalo, 2);
    ring(singularity.radius + singularity.reach(7), canvasPalette.singularityRim, 1);
  }

  // WALL's bar, written out from its origin and clamped to the frame. The white
  // core is the point a ball actually struck, which is where the bar collapses
  // to when it is spent — so the last pixel to go out is the one under the ball
  // it saved, and the player learns which bounce was the free one.
  private drawEnergyWall(view: RenderView): void {
    const { left, right } = gameConfig.field;
    const { wallY } = gameConfig.powerUps;
    const reach = (right - left) * view.energyWallBlend;
    const from = Math.max(left, Math.round(view.energyWallOriginX - reach));
    const to = Math.min(right, Math.round(view.energyWallOriginX + reach));
    if (to > from) {
      this.pixel(from, wallY, to - from, 2, canvasPalette.energyWall);
    }
    if (view.energyWallStrike) {
      this.pixel(view.energyWallOriginX - 1, wallY, 2, 2, canvasPalette.energyWallCore);
    }
  }

  // A pinball disc: a rose body with a white outline and a dark eye. It never
  // moves, so it snaps to whole game pixels like the bricks do. A kick turns the
  // eye white and throws a ring out past the body, which is the whole tell that
  // this disc — not one of the others — is the one that just paid.
  private drawBumper(bumper: Bumper): void {
    const { radius, flashTicks, arriveTicks, leaveTicks } = gameConfig.powerUps.bumpers;

    // Arriving: a ring 12 px out from the spot the disc will take, closing onto
    // it and brightening as it tightens, and nothing else on the field. The
    // counter starts above `arriveTicks` while a disc waits its turn in the
    // stagger, and nothing at all is drawn until its own twelve ticks begin —
    // which is what makes the rack light bottom-up rather than all at once.
    //
    // Growing the sprite was never available: the radius is baked into two
    // hand-tabled pixel row sets, and a scaled draw would resample pixel art
    // the game deliberately does not resample.
    if (bumper.arriveTicksLeft > 0) {
      if (bumper.arriveTicksLeft > arriveTicks) {
        return;
      }
      const out = bumper.arriveTicksLeft / arriveTicks;
      // Floored rather than run from zero: a one-pixel stroke at 8 % alpha is
      // not a faint ring, it is nothing, and the first frame is the one that
      // has to say a disc is coming.
      this.strokeBumperRing(bumper, radius + 3 + out * 9, 0.25 + 0.75 * (1 - out));
      return;
    }
    // Leaving: the same ring travelling the other way, on the kick flash's own
    // alpha ramp — the ring is the disc's own material, so a power cut is said
    // in the language the disc already uses for paying out.
    if (bumper.leaveTicksLeft > 0) {
      const left = bumper.leaveTicksLeft / leaveTicks;
      this.strokeBumperRing(bumper, radius + 3 + (1 - left) * 9, left);
      return;
    }

    const left = bumper.x - radius;
    const top = bumper.y - radius;
    const flashing = bumper.flashTicksLeft > 0;

    BUMPER_PIXEL_ROWS.forEach(([offset, span], rowIndex) => {
      this.pixel(left + offset, top + rowIndex, span, 1, canvasPalette.bumperRim);
    });
    BUMPER_FILL_ROWS.forEach(([offset, span], rowIndex) => {
      this.pixel(left + 1 + offset, top + 1 + rowIndex, span, 1, canvasPalette.bumperBody);
    });
    // The eye is the ball's own sprite table: same 8 px circle, centred.
    const eye = flashing ? canvasPalette.bumperRim : canvasPalette.bumperCore;
    ballRows(BALL_SIZE).forEach(([offset, span], rowIndex) => {
      this.pixel(left + radius - 4 + offset, top + radius - 4 + rowIndex, span, 1, eye);
    });

    if (flashing) {
      this.strokeBumperRing(bumper, radius + 3, bumper.flashTicksLeft / flashTicks);
    }
  }

  // The one ring a disc ever draws, at whatever radius and strength the thing
  // asking for it is at: the kick, the arrival and the departure are the same
  // white circle read three ways.
  private strokeBumperRing(bumper: Bumper, radius: number, alpha: number): void {
    this.ctx.strokeStyle = this.ink(canvasPalette.bumperRim);
    this.ctx.lineWidth = 1 * SCALE;
    this.ctx.globalAlpha = alpha;
    this.ctx.beginPath();
    this.ctx.arc(bumper.x * SCALE, bumper.y * SCALE, radius * SCALE, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }

  // Full-field impact flash for the first ticks, then the expanding shockwave
  // ring (it lingers at its final radius through the debris hold). Drawn over
  // the sprites, under the wall frame.
  private drawDetonation(detonation: Detonation): void {
    if (!detonation.active) {
      return;
    }
    if (detonation.flashTicksLeft > 0) {
      this.pixel(0, 0, gameConfig.field.width, gameConfig.field.height, canvasPalette.nukeFlash);
    }
    if (detonation.radius > 0) {
      this.ctx.strokeStyle = this.ink(canvasPalette.nukeRing);
      this.ctx.lineWidth = 3 * SCALE;
      this.ctx.beginPath();
      this.ctx.arc(detonation.x * SCALE, detonation.y * SCALE, detonation.radius * SCALE, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  /**
   * Every colour this class paints, resolved for the machine it is painting on.
   *
   * Off, this is the identity. On, the sprite palette collapses to the tube's
   * two tones: the shadow role goes to ground, everything else to ink — see
   * `DEMAKE_GROUND_TONES`. One choke point, so a capsule added later is demade
   * by construction rather than by remembering to.
   */
  private ink(color: string): string {
    if (!this.demade) {
      return color;
    }
    return DEMAKE_GROUND_TONES.has(color) ? canvasPalette.demakeGround : canvasPalette.demakeInk;
  }

  private pixel(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = this.ink(color);
    this.ctx.fillRect(Math.round(x) * SCALE, Math.round(y) * SCALE, width * SCALE, height * SCALE);
  }

  // Same chunky block art as pixel(), but the position snaps to the backing
  // grid instead of the game grid — sub-game-pixel placement for anything that moves.
  private spritePixel(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = this.ink(color);
    this.ctx.fillRect(Math.round(x * SCALE), Math.round(y * SCALE), width * SCALE, height * SCALE);
  }

  // BANANA's peel: thrown off the deck that ate it, then lying flush on the
  // rail. Three states, and the pixel grid each one belongs on — in the air it
  // moves in fractions of a game pixel, so it is drawn through `spritePixel`
  // like everything else that does; once it is down it never moves again, so it
  // goes back to whole game pixels. It blinks out its last second the way a
  // trap capsule's glyph blinks as it falls: a hazard about to stop being one
  // has to say so, or the player steers around nothing for the rest of the
  // level.
  private drawPeel(peel: Peel): void {
    const { peelWidth, peelBlinkTicks, peelApexPerTick } = gameConfig.powerUps.banana;
    if (peel.ticksLeft < peelBlinkTicks && (peel.ticksLeft & 4) === 0) {
      return;
    }
    const restY = gameConfig.paddle.y - PEEL_HEIGHT;

    if (peel.flightTicksLeft > 0) {
      // It leaves the rail and comes back down to it, so the arc is symmetric
      // and its apex sits at the halfway point. The flight is recomputed rather
      // than stored: it is a function of the distance and nothing else, and one
      // formula in the config beats two copies drifting apart.
      const ticks = peelFlightTicks(Math.abs(peel.x - peel.fromX));
      const progress = (ticks - peel.flightTicksLeft) / ticks;
      const x = peel.fromX + (peel.x - peel.fromX) * progress;
      const y = restY - 4 * peelApexPerTick * ticks * progress * (1 - progress);
      this.spritePixel(x + 1, y, peelWidth - 2, 1, canvasPalette.peelBody);
      this.spritePixel(x, y + 1, peelWidth, 3, canvasPalette.peelBody);
      this.spritePixel(x + 1, y + PEEL_HEIGHT - 1, peelWidth - 2, 1, canvasPalette.peelShade);
      return;
    }

    if (peel.flightTicksLeft === 0) {
      // The landing tick, and only that one: the three-row band flattened to
      // two and spread 2 px wider, sitting on the rail. It is a single frame,
      // and it is the whole difference between a thrown object and one that
      // teleported. Clipped to the field, since a peel can land against either
      // wall and the extra pixel would be drawn on the frame.
      const left = Math.max(gameConfig.field.left, peel.x - 1);
      const right = Math.min(gameConfig.field.right, peel.x + peelWidth + 1);
      this.pixel(left, restY + 2, right - left, 2, canvasPalette.peelBody);
      this.pixel(peel.x, restY + PEEL_HEIGHT - 1, peelWidth, 1, canvasPalette.peelShade);
      return;
    }

    this.pixel(peel.x + 1, restY, peelWidth - 2, 1, canvasPalette.peelBody);
    this.pixel(peel.x, restY + 1, peelWidth, 3, canvasPalette.peelBody);
    this.pixel(peel.x + 1, restY + PEEL_HEIGHT - 1, peelWidth - 2, 1, canvasPalette.peelShade);
  }

  private drawPaddle(paddle: PaddleRenderState): void {
    const { y } = paddle;
    // The tint is resolved here and nowhere else. MIRROR's ghost draws the same
    // sprite through `MIRROR_BANDS`, whose whole point is that every tone is
    // desaturated enough to read as a reflection — a full-strength magenta cap
    // on it would be the reflection shouting louder than the deck.
    this.drawDeck(
      paddle.x,
      y,
      paddle.width,
      paddle.splitGap,
      paddle.capsJammed ? { ...PADDLE_BANDS, cap: DROP_COLORS.J } : PADDLE_BANDS,
      paddle,
      paddle.glueReach,
      paddle.english,
      paddle.ember,
    );

    this.drawCannons(paddle, y);
  }

  /**
   * BOMB: the deck going up, out of its own pieces.
   *
   * One frame of whiteout — the whole pill in its own top sheen, which is the
   * paddle catching the light of the charge under it — and then eleven of three
   * pieces thrown apart and falling, each burning down to nothing as the break
   * runs out. The pieces tile the deck exactly on the frame they are cut, so
   * there is no moment where a different sprite appears; the paddle simply stops
   * being one thing.
   *
   * Deliberately no tumble. `spriteBrush` is axis-aligned `fillRect` at
   * `Math.round(x * scale)`, and a rotation transform would break the pixel grid
   * every other sprite in this file is built on — falling, shrinking,
   * outward-kicked pills say the deck came apart without it.
   *
   * After the twelfth tick the rail is empty for the remaining thirty-three of
   * the fuse. That emptiness is the point: it is the beat that says the life is
   * gone, and it is why this stops well before the serve screen does.
   */
  private drawPaddleBreak(view: RenderView): void {
    if (view.paddleBreak === 0) {
      return;
    }
    if (view.paddleBreak === 1) {
      const { paddle } = view;
      this.drawDeck(paddle.x, paddle.y, paddle.width, paddle.splitGap, BLAST_BANDS, NO_SEAM);
      return;
    }
    for (const shard of view.paddleShards) {
      const width = shard.width * view.paddleBreak;
      this.drawDeckPill(shard.x - width / 2, shard.y, width, PADDLE_BANDS);
    }
  }

  /**
   * The two studs, extruded out of the deck's top edge rather than switched on.
   *
   * Drawn from `y - barrel` down, so the base stays welded into the housing and
   * only the muzzle climbs — a stud that grew from the top down would be a
   * cannon floating a pixel above the deck for the first frames.
   *
   * **Thirds of a game pixel, not whole ones.** Three whole steps over the ten
   * ticks of the first-shot delay is a three-frame pop and not a growth;
   * `spritePixel` rounds to the backing grid, so a barrel of 1/3 is exactly one
   * device pixel and the extrusion gets nine legible steps in the sub-pixel
   * granularity everything else that moves is already drawn in. At blend 1 the
   * arithmetic lands on `y - 3, 2x3` — the same sprite as before, to the pixel.
   *
   * The muzzle runs white while it is still coming out and cools on the frame
   * the gun locks, which normally is the frame the first bolt leaves: this blend
   * steps above the freeze gates and `laserCountdown` is decremented below them,
   * so a NUKE caught mid-extrusion leaves the gun finished and idle for the
   * length of the shockwave. That is exactly today's dead air under finished
   * hardware, and no worse for having a picture on it.
   */
  private drawCannons(paddle: PaddleRenderState, y: number): void {
    const barrel = Math.round(9 * paddle.laserBlend) / 3;
    if (barrel === 0) {
      return;
    }
    const top = y - barrel;
    for (const stud of [paddle.x + 5, paddle.x + paddle.width - 7]) {
      this.spritePixel(stud, top, 2, barrel, canvasPalette.laserCannon);
      if (paddle.laserBlend < 1) {
        this.spritePixel(stud, top, 2, 1 / 3, canvasPalette.laserCharge);
      }
    }
  }

  /**
   * MIRROR's ghost: the paddle's sprite, dimmed, at the mirrored x — and never
   * any cannons, since the ghost is a surface and not a second paddle.
   *
   * It resolves rather than switching on. The span and the gap both scale with
   * `form`, so the ghost is a shrunken copy of the deck growing to full size and
   * not a window onto a full-size one — which matters the moment SPLIT is live,
   * because a window opening from the centre of a split deck would reveal the
   * hole first. `mirrorSpan` is shared with the bounce test, so the surface the
   * ball meets is this one to the pixel.
   *
   * The height does not scale: it unfolds, **anchored on the bottom edge**. That
   * edge at `mirrorY + height` is where an upward ball is returned from, so a
   * band growing downward from the top would be drawn three pixels up the screen
   * from the surface doing the work — visible on the first rally. Clipped rather
   * than drawn short, because `drawPaddleBands` hardcodes its rows against the
   * deck's full height and a four-tone bevel has nothing to say at 3 px.
   */
  private drawMirror(paddle: PaddleRenderState, form: number, afterImage: number): void {
    const { height } = gameConfig.paddle;
    const bounds = mirrorBounds(paddle.x, paddle.width);
    const center = (bounds.left + bounds.right) / 2;
    const span = mirrorSpan(paddle.width, form);
    const x = center - span / 2;

    // The surface is gone and only its mark is left: one line at the row the
    // ghost used to return balls from, walking down three tones as it goes.
    if (form === 0) {
      const step = Math.min(MIRROR_FADE_TONES.length - 1, Math.floor((1 - afterImage) * MIRROR_FADE_TONES.length));
      this.spritePixel(x, bounds.top + height - 1, span, 1, MIRROR_FADE_TONES[step]);
      return;
    }

    const rows = Math.max(1, Math.round(height * form));
    const top = bounds.top + height - rows;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(Math.round(x * SCALE), Math.round(top * SCALE), Math.round(span * SCALE), rows * SCALE);
    this.ctx.clip();
    // The ghost is wet too, and through the same record: a reflection of a
    // sticky deck is a sticky deck. It is scaled with the span like the gap is,
    // so a half-formed reflection is not showing more film than there is.
    this.drawDeck(
      x,
      bounds.top,
      span,
      mirrorGap(paddle.splitGap, span, paddle.width),
      MIRROR_BANDS,
      paddle,
      (paddle.glueReach * span) / paddle.width,
      paddle.english,
    );
    this.ctx.restore();

    // The leading edge, riding the top of whatever has unfolded so far — and
    // gone the moment there is nothing left to lead. Deliberately the ghost's
    // own sheen and not something brighter: the dimness is what says reflection,
    // and the signal a departure needs is bought with the after-image instead.
    if (form < 1) {
      this.spritePixel(x, top, span, 1, canvasPalette.mirrorSheen);
    }
  }

  /**
   * One pill, or two with SPLIT's hole between them — each half a full pill with
   * its own caps and bevels, so a broken deck reads as two pieces of the same
   * paddle rather than as one paddle with a bite taken out of it. The inner
   * ends grow their caps for free: `drawPaddleBands` puts one at each end of
   * whatever it is given, so the halves are capped the moment there are two.
   *
   * Any non-zero gap opens the deck. The gap arrives two pixels at a time rather
   * than at its full 26, and the first of those steps is exactly the crack the
   * player is being warned by — swallowing it would be swallowing the warning.
   *
   * The width and the gap are arguments rather than read off `paddle`, because
   * MIRROR's ghost is the same deck at a fraction of both. `seam` still comes
   * from the paddle: the crack and the weld are the deck's, and the reflection
   * carries them because it is a reflection.
   */
  private drawDeck(
    x: number,
    y: number,
    width: number,
    gap: number,
    colors: PaddleBandColors,
    seam: DeckSeamState,
    glueReach = 0,
    english = 0,
    ember = 0,
  ): void {
    const half = (width - gap) / 2;
    if (gap === 0 || half < 1) {
      this.drawDeckPill(x, y, width, colors, glueReach, english, ember);
    } else {
      this.drawDeckPill(x, y, half, colors, glueReach, english, ember);
      this.drawDeckPill(x + width - half, y, half, colors, glueReach, english, ember);
    }
    this.drawDeckSeam(seam, x, y, width, colors);
  }

  /**
   * A pill, or a plain bar where there is not room for one.
   *
   * `drawPaddleBands` hardcodes 8 px caps at each end and paints its sheen and
   * shade as `width - 18` — inset 9 px a side, not the caps' 8 — so 18 is the
   * narrowest width that is still a pill, and anything under it draws a
   * negative `fillRect` leftward over its own cap.
   *
   * Two callers reach it and only one can go under. The deck cannot: SHA-86
   * makes its halves 20 px at the tightest, and this stays the second line of
   * defence it was there. MIRROR's ghost does, every time it forms — and the bar
   * is why the floor is a fallback and not a clamp. A pill drawn wider than the
   * span it was asked for would put the drawn surface and the bouncing one back
   * out of step, which is the whole thing SHA-87 exists to fix.
   */
  private drawDeckPill(
    x: number,
    y: number,
    width: number,
    colors: PaddleBandColors,
    glueReach = 0,
    english = 0,
    ember = 0,
  ): void {
    if (width >= 18) {
      this.drawPaddleBands(x, y, width, colors);
    } else {
      const { height } = gameConfig.paddle;
      this.spritePixel(x, y, width, height, colors.body);
      this.spritePixel(x, y, width, 1, colors.sheen);
    }
    this.drawResin(x, y, width, glueReach);
    // Under the cloth on purpose. The two can be live together, and a deck
    // wearing both is a deck with fire under its felt, which is the right way
    // round: ENGLISH is a surface the player put on, PYRE is what is happening
    // to the wood.
    this.drawEmber(x, y, width, ember);
    this.drawFelt(x, y, width, english);
  }

  /**
   * GLUE's film across the pill's top edge, spreading from its own middle.
   *
   * The whole top edge and not the sheen span: `drawPaddleBands` insets its
   * sheen nine pixels a side, which is 28 px on a base deck but 12 under a
   * JAMMER and **two** on each half of a SPLIT one. A two-pixel cue is no cue,
   * so the resin runs cap to cap — and over `paddleCap` it reads at least as
   * strongly as over the pale sheen it covers in the middle.
   *
   * Row `y + 1` is the film and row `y` is where it beads, so the front has a
   * fringe rather than an edge and the layer sits *on* the deck instead of
   * being part of it.
   */
  private drawResin(x: number, y: number, width: number, reach: number): void {
    if (reach <= 0 || width < 3) {
      return;
    }
    const center = width / 2;
    for (let column = 1; column < width - 1; column++) {
      const distance = Math.floor(Math.abs(column + 0.5 - center));
      const lag = RESIN_LAG[distance % RESIN_LAG.length];
      if (distance + lag > reach) {
        continue;
      }
      this.spritePixel(x + column, y + 1, 1, 1, canvasPalette.glueResin);
      if (lag === 2) {
        this.spritePixel(x + column, y, 1, 1, canvasPalette.glueResin);
      }
    }
  }

  /**
   * ENGLISH's cloth, laid across the middle of the pill and rolled out from its
   * own centre.
   *
   * `FELT_ROW` is the deck's fourth row of seven — the one row that is body on
   * every column, cap to cap. The resin above it owns rows 0 and 1 and the
   * shade owns row 6, so the two capsules can be live together without either
   * painting over the other, and the sheen the deck has always had is untouched.
   *
   * The full width less the bevel, and not `drawPaddleBands`' nine-pixel inset
   * span, for the reason the resin gives: that span is 2 px on each half of a
   * SPLIT deck, and a two-pixel cue is no cue. The nap at the leading edge is
   * what makes it a sweep — the cloth is 2 px of light where it is still moving
   * and flat felt behind, so the arrival reads as rolling out and the departure
   * as rolling back in, which is the whole of both transitions in one number.
   */
  /**
   * PYRE's ember wash: fire rolling across the deck, and back off it.
   *
   * A **front**, not a spread, and that is the whole difference between this
   * and the two layers either side of it. GLUE's resin and ENGLISH's felt both
   * open from the middle of the deck outward and are symmetric by construction;
   * this enters at the left cap and travels, so what the player sees at the
   * catch is fire *arriving*, and what they see ten seconds later is the same
   * fire going back out the way it came. One blend, read as a position rather
   * than as a strength, and both ends of the capsule come out of it.
   *
   * The band is the deck's rows 4 and 5, which is the only pair of rows on a
   * seven-row deck that belongs to nobody: row 0 is the top bevel, row 1 the
   * sheen, row 3 the felt, row 6 the shade. Fire on the lower half also reads as
   * the deck burning from underneath, which is what a pyre is.
   *
   * The span is the body's and not the pill's — `drawPaddleBands` puts 8 px of
   * cap at each end of these rows, and an ember drawn over the cap's red would
   * be one warm colour on another and read as nothing at all. A deck too narrow
   * to have a body between its caps simply has no room for this, and says so by
   * drawing nothing rather than by drawing a negative span.
   */
  private drawEmber(x: number, y: number, width: number, blend: number): void {
    if (blend <= 0) {
      return;
    }
    const span = width - 2 * EMBER_CAP;
    if (span <= 0) {
      return;
    }
    const front = blend * span;
    for (let column = 0; column < span; column++) {
      if (column > front) {
        continue;
      }
      // The leading two pixels are the hot ones. On the way out the front is
      // receding, so the same two pixels are the trailing edge — which is right:
      // the bright part is wherever the fire is moving.
      const tone = front - column < 2 ? canvasPalette.pyreWashHot : canvasPalette.pyreWash;
      for (const row of EMBER_ROWS) {
        this.spritePixel(x + EMBER_CAP + column, y + row, 1, 1, tone);
      }
    }
  }

  private drawFelt(x: number, y: number, width: number, blend: number): void {
    if (blend <= 0 || width < 3) {
      return;
    }
    const center = width / 2;
    const reach = blend * center;
    for (let column = 1; column < width - 1; column++) {
      const distance = Math.abs(column + 0.5 - center);
      if (distance > reach) {
        continue;
      }
      const tone = reach - distance < 2 ? canvasPalette.englishFeltNap : canvasPalette.englishFelt;
      this.spritePixel(x + column, y + FELT_ROW, 1, 1, tone);
    }
  }

  /**
   * The tear before it is a hole, and the weld after it stops being one: a 1 px
   * line down the deck's middle, dark going in and lit coming back. The two ends
   * of one event, so they share a line rather than each getting their own.
   *
   * `spritePixel`, not `pixel`, because the deck it is cutting is drawn through
   * `spriteBrush`: the paddle's x is whatever the pointer left it on, and a seam
   * snapped to the game grid over a body snapped to the backing grid drifts a
   * device pixel off centre as the player moves.
   *
   * Under DEMAKE the crack survives and the flash does not — the shade is a
   * ground tone and the sheen is not, so the deck is one ink block with a line
   * cut out of it either way. That is the downgrade working, not a gap in it.
   */
  private drawDeckSeam(seam: DeckSeamState, x: number, y: number, width: number, colors: PaddleBandColors): void {
    if (!seam.splitCrack && !seam.splitWeld) {
      return;
    }
    const { height } = gameConfig.paddle;
    // The crack is drawn a pixel in from each bevel; the weld is not, because a
    // weld is the halves touching and the touch is the full height of them.
    const inset = seam.splitWeld ? 0 : 1;
    this.spritePixel(
      x + Math.floor(width / 2),
      y + inset,
      1,
      height - 2 * inset,
      seam.splitWeld ? colors.sheen : colors.shade,
    );
  }

  // A 1 px trace on the rail the deck used to hold, walking down four authored
  // magenta steps as it dies. Drawn in the deck's own middle row, so it lines up
  // with the wood that was there rather than floating above it.
  private drawRailMark(mark: RailMark): void {
    const step = Math.min(
      RAIL_MARK_TONES.length - 1,
      Math.floor(
        ((gameConfig.paddle.railMarkTicks - mark.ticksLeft) / gameConfig.paddle.railMarkTicks) * RAIL_MARK_TONES.length,
      ),
    );
    this.pixel(mark.x, gameConfig.paddle.y + 3, mark.width, 1, RAIL_MARK_TONES[step]);
  }

  private drawPaddleBands(x: number, y: number, width: number, colors: PaddleBandColors): void {
    drawPaddleBands(this.ctx, x, y, width, colors, SCALE, this.demade);
  }

  // A ball at 8 px a tick is genuinely hard to follow, which is the trap — but it
  // has to stay trackable enough to be fair, so RUSH smears it, and TURBO after
  // it. The copies are computed off the velocity already in hand: no per-ball
  // history, nothing to clear on a reset. A ball glued to the paddle keeps its
  // stored velocity and is going nowhere, so it gets no streak.
  /**
   * The ball as a one-pixel shell: the same sprite table with its interior cut
   * out, which is the only honest way to mark a position with the ball's own
   * silhouette without drawing a ball.
   *
   * TEMPO's pace ghost is the one caller. A filled sprite is the game's most
   * loaded signal, and under a live SWARM twelve white ones would be TEMPO
   * saying MULTI's sentence — an outline says "where you would have been" and
   * nothing else. It takes the size for that reason: the mark has to be the
   * shape of the ball that would have been there, and under GIANT that is a
   * 24 px outline.
   */
  private drawBallShell(x: number, y: number, color: string, size: number): void {
    const rows = ballRows(size);
    rows.forEach(([offset, span], rowIndex) => {
      const above = rows[rowIndex - 1];
      const below = rows[rowIndex + 1];
      for (let column = offset; column < offset + span; column++) {
        // On the shell if anything beside it is off the sprite: the ends of
        // every row, and the caps at top and bottom where there is no row to
        // hide behind. Twenty pixels of the fifty-two, and a hollow middle.
        const edge =
          column === offset ||
          column === offset + span - 1 ||
          !ballRowCovers(above, column) ||
          !ballRowCovers(below, column);
        if (edge) {
          this.spritePixel(x + column, y + rowIndex, 1, 1, color);
        }
      }
    });
  }

  /**
   * HAYWIRE's static: a few stray pixels arcing off the ball, never on it.
   *
   * **Outside the sprite by construction.** Every arc sits at or beyond the
   * ball's own radius, so the eight-pixel silhouette is untouched — what the
   * player is looking at is a ball with something wrong *around* it, which is
   * the truth of the capsule, rather than a ball drawn wrong, which is the one
   * thing this sprite is never allowed to be.
   *
   * The scatter is hashed off the frame, the ball and the arc's own index
   * rather than drawn from `Math.random()`. A random one resamples all of them
   * every frame at 60 Hz and comes out as a uniform shimmer; held for four
   * frames at a time this crackles, because the eye gets long enough to read
   * each arrangement as an arrangement before it is replaced.
   *
   * `strength` is the blend, spent on how many arcs there are and how far they
   * reach, so the static thickens and thins with the kicks it belongs to — and
   * both ends of the capsule are in it without a second clock. The dim tone
   * takes the outer half of the scatter: a discharge has a hot core and a cool
   * edge, and one flat colour blinking reads as a fault in the renderer instead
   * of a fault in the machine.
   */
  private drawHaywireArc(ball: Ball, index: number, strength: number, lift: number): void {
    const half = ball.size / 2;
    const centerX = ball.x + half;
    const centerY = ball.y - lift + half;
    const arcs = Math.max(1, Math.round(HAYWIRE_ARCS * strength));
    const seed = (this.frameCount >> 2) * 977 + index * 131;
    for (let arc = 0; arc < arcs; arc++) {
      // A cheap integer hash — two odd multipliers and a shift — which is all
      // the decorrelation a handful of pixels needs, and allocates nothing on a
      // path that runs for every ball on every frame.
      const noise = ((seed + arc * 2749) * 1103515245 + 12345) >>> 8;
      const angle = ((noise & 255) / 256) * Math.PI * 2;
      const reach = half + 1 + (((noise >> 8) & 3) / 3) * HAYWIRE_REACH * strength;
      const tone = arc * 2 < arcs ? canvasPalette.haywireArc : canvasPalette.haywireArcDim;
      this.spritePixel(centerX + Math.cos(angle) * reach - 0.5, centerY + Math.sin(angle) * reach - 0.5, 1, 1, tone);
    }
  }

  /**
   * ENGLISH's spin, orbiting the ball that is carrying it.
   *
   * Three flecks at 120 deg, riding just outside the sprite's own radius — the
   * silhouette is never touched, for the reason the arc above states and the
   * reason every ball capsule states: the ball is one shape, and a spinning one
   * that changed shape would be a different object.
   *
   * The phase is `Ball.spinPhase`, which is the total heading the spin has
   * actually turned this ball through, multiplied up into something an eye can
   * follow. Read that way both halves of the cue come out for free and cannot
   * disagree with the simulation: the flecks go round the way the ball is
   * bending, and they slow as the spin decays, stopping on the tick it is spent.
   * A clock of their own would be a picture of a curve rather than the curve.
   *
   * `FLECK_GAIN` is the only authored number here: a hard whip turns the ball
   * about 0.67 rad over its flight, and 24 makes that two and a half orbits —
   * fast enough to read as spin, slow enough that a single fleck can be
   * followed round.
   */
  private drawSpinFlecks(ball: Ball, lift: number): void {
    const half = ball.size / 2;
    const centerX = ball.x + half;
    const centerY = ball.y - lift + half;
    const phase = ball.spinPhase * FLECK_GAIN;
    for (let fleck = 0; fleck < FLECKS; fleck++) {
      const angle = phase + (fleck / FLECKS) * Math.PI * 2;
      this.spritePixel(
        centerX + Math.cos(angle) * FLECK_ORBIT - 0.5,
        centerY + Math.sin(angle) * FLECK_ORBIT - 0.5,
        1,
        1,
        canvasPalette.englishFleck,
      );
    }
  }

  /**
   * PYRE's flame crown: a ball that is loaded, wearing fire.
   *
   * **Above the sprite and never on it.** Every pixel here sits at `ball.y - 1`
   * or higher, so the eight-pixel silhouette is untouched — the ball is one
   * shape, and a loaded one that changed shape would be a different object. What
   * the player reads is a ball with something burning on top of it, which is
   * exactly what it is.
   *
   * The fire is drawn **cooling upward**, which is what makes it legible at all:
   * the base of a flame is its hottest part, and the base here is the ball's own
   * `#ffe14a`. So the ball is the heat and the licks above it run orange to deep
   * red as they leave. A pale core painted over a yellow sprite would have been
   * a crown nobody could see.
   *
   * `Ball.pyreCrown` carries both ends of the cue on one counter: its top band
   * is fire and its bottom band is smoke, so a crown lighting comes up through a
   * wisp and one going out falls back into one. Above the top of the band it
   * simply clamps — that is the expiry stagger holding this crown at full while
   * the one before it burns down.
   *
   * The scatter is hashed off the frame and the ball rather than sampled, and
   * held for four frames at a time: resampled every frame a flame is a uniform
   * shimmer, and held it flickers, because the eye gets long enough to read each
   * arrangement before it is replaced. The same clock every other ball-held cue
   * in this file blinks on.
   */
  private drawPyreCrown(ball: Ball, index: number, lift: number): void {
    const { crownTicks, smokeTicks } = gameConfig.powerUps.pyre;
    const flame = Math.min(1, Math.max(0, (ball.pyreCrown - smokeTicks) / crownTicks));
    const smoke = 1 - flame;
    const top = ball.y - lift;
    const seed = (this.frameCount >> 2) * 599 + index * 149;

    for (let lick = 0; lick < CROWN_LICKS; lick++) {
      // The same cheap integer hash the static uses, for its reason: a handful
      // of pixels needs decorrelation and not randomness, and this allocates
      // nothing on a path that runs for every loaded ball on every frame.
      const noise = ((seed + lick * 3121) * 1103515245 + 12345) >>> 8;
      // Four heights, tapered toward the ends. The taper is what makes this a
      // flame rather than a comb: fire on a round object is tallest over the
      // middle of it, and six licks all reaching the same height read as
      // machinery. It also keeps the outer two inside the ball's own silhouette
      // width, so the crown is as wide as the sprite and no wider.
      const height = Math.round(flame * CROWN_TAPER[lick] * (2 + ((noise >> 4) & 3)));
      if (height <= 0) {
        continue;
      }
      const column = CROWN_LEFT + lick;
      for (let step = 0; step < height; step++) {
        // The last pixel of a lick is its tip, and the tip is the cool one.
        const tone = step === height - 1 ? canvasPalette.pyreFlameTip : canvasPalette.pyreFlame;
        this.spritePixel(ball.x + column, top - 1 - step, 1, 1, tone);
      }
    }

    if (smoke <= 0) {
      return;
    }
    // The wisp: two specks well clear of the licks, drifting on the same clock.
    // They are what the crown comes up through and what it falls back into, so
    // they ride the *inverse* of the fire and are at their thickest on the frame
    // it is at its thinnest.
    for (let speck = 0; speck < CROWN_SMOKE; speck++) {
      const noise = ((seed + speck * 7919) * 1103515245 + 12345) >>> 8;
      const column = CROWN_LEFT + (noise % CROWN_LICKS);
      const rise = 2 + Math.round(smoke * (2 + ((noise >> 6) & 1)));
      this.spritePixel(ball.x + column, top - 1 - rise, 1, 1, canvasPalette.pyreSmoke);
    }
  }

  /**
   * PYRE's crater: a spent ball, three frames of white, and the reach it took.
   *
   * The ring is an **ellipse**, and that is not a stylistic choice. The crater
   * is measured in cells — a radius of two on a grid of 30x12 bricks — so the
   * set of bricks that died is an ellipse in pixels, five columns wide and five
   * rows tall. A circular shockwave over it would be a picture of a different
   * blast from the one that happened, and the ring is the only thing that tells
   * the player what one of these is worth. It runs out to exactly the centres of
   * the outermost bricks it took, which is the locus of the kill itself.
   *
   * The white goes first and covers the ball's own last frame; the fireball
   * blooms behind it and collapses back into nothing while the ring runs on. The
   * bricks are long gone by any of this — they went on the frame the player
   * clicked, and this is the twenty-four ticks of light that say so.
   */
  private drawPyreBlast(blast: PyreBlast): void {
    const { blastTicks, flashTicks, cellRadius } = gameConfig.powerUps.pyre;
    const { brickWidth, brickHeight } = gameConfig.grid;
    const age = blastTicks - blast.ticksLeft;
    const progress = age / blastTicks;
    const x = blast.x * SCALE;
    const y = blast.y * SCALE;

    const disc = (radius: number, color: string): void => {
      this.ctx.fillStyle = this.ink(color);
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius * SCALE, 0, Math.PI * 2);
      this.ctx.fill();
    };

    // The fireball first and the white over it, so the three frames of flash are
    // the whole sprite rather than a rim around a hotter middle.
    // `sqrt` puts the peak a quarter of the way in: a fireball is at its widest
    // almost at once and spends the rest of its life collapsing.
    const fire = PYRE_FIREBALL * Math.sin(Math.PI * Math.sqrt(progress));
    if (fire >= 1) {
      disc(fire, canvasPalette.pyreFireball);
    }
    if (age < flashTicks) {
      disc(PYRE_FLASH, canvasPalette.deathFlash);
    }

    this.ctx.strokeStyle = this.ink(canvasPalette.pyreRing);
    // Thinning as it goes, so the wave runs out rather than stopping at full
    // weight on the frame it reaches the edge of the crater. The one thing this
    // ring may not do is disappear mid-stride: it is the only drawing of the
    // reach, and a shockwave cut off short would understate what a ball buys.
    this.ctx.lineWidth = (PYRE_RING_WIDTH - (PYRE_RING_WIDTH - 1) * progress) * SCALE;
    this.ctx.beginPath();
    this.ctx.ellipse(
      x,
      y,
      cellRadius * brickWidth * progress * SCALE,
      cellRadius * brickHeight * progress * SCALE,
      0,
      0,
      Math.PI * 2,
    );
    this.ctx.stroke();
  }

  private drawBall(ball: Ball, trail: number, tones: readonly string[], lift = 0): void {
    const { x } = ball;
    const y = ball.y - lift;
    const rows = ballRows(ball.size);

    if (trail > 0 && ball.stuckOffsetX === null) {
      BALL_TRAIL_STEPS.forEach((step, index) => {
        const trailX = x - ball.velocity.x * trail * step;
        const trailY = y - ball.velocity.y * trail * step;
        rows.forEach(([offset, span], rowIndex) => {
          this.spritePixel(trailX + offset, trailY + rowIndex, span, 1, tones[index]);
        });
      });
    }

    drawBall(this.ctx, x, y, SCALE, this.demade, { birth: ball.birthTicksLeft, size: ball.size });
  }

  private drawDrops(view: RenderView): void {
    for (const drop of view.drops) {
      if (drop.active) {
        drawCapsule(this.ctx, drop.x, drop.y, drop.kind, SCALE, this.frameCount, this.demade);
      }
    }
  }

  /**
   * BLACKOUT: the field by torchlight.
   *
   * The capsules are deliberately left lit above it. Hiding them would chain
   * the trap into blind catches — a JAMMER taken because it could not be read
   * is the capsule punishing the player twice — and it would make RAIN a
   * shower of nothing.
   *
   * The veil does not ride QUAKE's shake, for the same reason the background
   * does not: the dark is the room, not something standing on the field. So the
   * transform is wound back for the blit — and the shake is added to the pools
   * instead, since those do have to stay centred on sprites that are moving.
   *
   * The iris is the arrival and the departure both: the pools start wider than
   * the field and close onto the ball, then run the same way back out when the
   * capsule expires. Nothing cross-fades — the dark is never painted at half
   * strength, it simply has not reached you yet.
   */
  private drawBlackout(view: RenderView): void {
    const shakeX = view.quake.offsetX;
    const shakeY = view.quake.offsetY;
    const spread = blackoutSpread(view.blackoutBlend);

    // Counted first, because every pool's radius depends on how many there are.
    let live = 0;
    for (const ball of view.balls) {
      if (ball.active) {
        live++;
      }
    }
    const settled = Math.max(
      BLACKOUT_TORCH.minRadius,
      BLACKOUT_TORCH.ballRadius - BLACKOUT_TORCH.crowding * (live - 1),
    );
    const radius = settled * spread;

    const torches: Torch[] = [];
    for (const ball of view.balls) {
      if (ball.active) {
        torches.push({ x: ball.x + 4 + shakeX, y: ball.y + 4 + shakeY, radius, peak: 1 });
      }
    }
    // The deck's own glow — and what is left of it. A BOMB takes the light the
    // player was steering by with the deck, over the same twelve ticks the
    // pieces are in the air, rather than switching it off under them.
    const deckLight = view.paddleHidden ? view.paddleBreak : 1;
    if (deckLight > 0) {
      const { y, height } = gameConfig.paddle;
      torches.push({
        x: view.paddle.x + view.paddle.width / 2 + shakeX,
        y: y + height / 2 + shakeY,
        radius: BLACKOUT_TORCH.paddleRadius * spread * deckLight,
        // The deck only dims to its glow once the dark has actually arrived:
        // held at 0.55 through the iris it would be a shadow on the paddle
        // while the rest of the field was still fully lit.
        peak: (1 - (1 - BLACKOUT_TORCH.paddlePeak) * view.blackoutBlend) * deckLight,
      });
    }

    this.ctx.save();
    this.ctx.translate(-shakeX * SCALE, -shakeY * SCALE);
    drawBlackoutVeil(this.ctx, torches, this.demade ? canvasPalette.demakeGround : canvasPalette.blackoutVeil, SCALE);
    this.ctx.restore();
  }

  // MAGNET's pull is silent and gentle enough to miss, so every capsule it has
  // hold of is tied to the paddle by a dashed line. The dashes step one place
  // every four frames, which reads as a crawl toward the paddle.
  private drawMagnetTethers(paddle: PaddleRenderState, drops: readonly Drop[], reach: number): void {
    const toX = paddle.x + paddle.width / 2;
    const toY = paddle.y;
    const phase = (this.frameCount >> 2) % TETHER_DASH_SPACING;

    // The two edges of the band, on the rail. Without them the whole transition
    // is usually invisible: the reach opens across an empty field, because the
    // capsule the catch guarantees is only guaranteed on the *next* kill and
    // then falls for a hundred ticks before it means anything. They are also
    // the first thing the game has ever drawn that says the magnet is a
    // horizontal band and not a radius.
    const { left, right } = gameConfig.field;
    for (const edge of [toX - reach, toX + reach]) {
      // Skipped rather than clamped when the band runs off the field: a mark
      // pinned to the wall would claim the reach ends there, which is a lie
      // about the only thing these marks exist to say.
      if (edge >= left && edge < right) {
        this.pixel(edge, paddle.y + 2, 1, 3, canvasPalette.magnetTether);
      }
    }

    for (const drop of drops) {
      const fromX = drop.x + 10;
      const fromY = drop.y + DROP_HEIGHT;
      // Nothing is tethered to a capsule the player cannot see yet. A rained one
      // is born above the frame, and these dashes are drawn before `drawWalls`,
      // so without this the only rows covered would be the frame's own three and
      // the rest would be a line running down to a head that is not there. The
      // bound is the pill's bottom edge against the ceiling, so the tether
      // appears on the same frame the pill does.
      //
      // The pull itself is deliberately not gated with it. The capsule really is
      // inside the band, and the band is still one number — this culls what can
      // be drawn, not what the magnet is holding. Gated too, a pill would clear
      // the frame on its launch line and only then start sliding, which is the
      // magnet visibly picking it up late.
      if (!drop.active || drop.y + DROP_HEIGHT <= gameConfig.field.top || Math.abs(toX - fromX) > reach) {
        continue;
      }
      const spanX = toX - fromX;
      const spanY = toY - fromY;
      const length = Math.hypot(spanX, spanY);
      for (let along = phase; along < length; along += TETHER_DASH_SPACING) {
        const step = along / length;
        this.spritePixel(fromX + spanX * step, fromY + spanY * step, 1, 1, canvasPalette.magnetTether);
      }
    }
  }

  /**
   * XRAY: the capsule a brick is holding, shown inside it.
   *
   * The pill is 20x8 and a brick 30x12, so it sits centred with the brick's own
   * colour framing it — the wall still reads as a wall. Drawn as the pill rather
   * than as a tint because six capsules wear a brick's exact colour by design: a
   * tint would say something is in there without ever saying what.
   */
  private drawRevealedCapsule(brickX: number, brickY: number, kind: PowerUpKind, sliceY?: number): void {
    // Device pixels, by hand. This ctx is not pre-scaled — `pixel()` and
    // `spritePixel()` multiply by SCALE themselves, as does `drawChainBolt`
    // with its points — so a rect given in game units would land at a third of
    // its coordinates up in the corner and clip every pill on the wall to
    // nothing. Whole game pixels in, so the cut stays on the 3x grid.
    const sliced = sliceY !== undefined;
    if (sliced) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(brickX * SCALE, brickY * SCALE, gameConfig.grid.brickWidth * SCALE, (sliceY - brickY) * SCALE);
      this.ctx.clip();
    }
    this.ctx.globalAlpha = XRAY_REVEAL_ALPHA;
    drawCapsule(this.ctx, brickX + 5, brickY + 2, kind, SCALE, this.frameCount, this.demade);
    this.ctx.globalAlpha = 1;
    if (sliced) {
      this.ctx.restore();
    }
  }

  /**
   * XRAY's reading edge, crossing the wall once on the catch and once on the
   * way out.
   *
   * Two tones and not one: the dimmer line sits on the side the bar has come
   * from, which is the only thing in a still frame that says whether the wall
   * is being read or unread. Drawn for the forty ticks the sweeps take and not
   * for the two hundred and sixty in between — a line parked on the wall stops
   * being a scan and starts being a scratch on the glass.
   */
  /**
   * FENCE: the six posts, each at the height it actually has this frame.
   *
   * The two ends of the capsule are one loop, because they are one number: a
   * post being driven in has a `depth` short of the brick height and sits at
   * its own row, and a post being pulled out has its full depth and a negative
   * `rise`. Both come off the same object the ball is collided against, so the
   * post on screen is the post in the way at every tick of either.
   *
   * The telescope is a clip and a leading edge rather than a squashed sprite.
   * A brick scaled to six pixels is a brick with a half-pixel bevel and reads
   * as a rendering fault; a brick cut off at six is a brick that is only six
   * pixels *out of the ground*, which is what is happening. The edge is the
   * post's own shade, laid along the cut, so the thing coming down has a bottom
   * to it — and it is skipped on a seated post, which has its real bevel back.
   */
  private drawFence(fence: Fence): void {
    const { left, top, columns, brickWidth, brickHeight } = gameConfig.grid;
    const fenceY = top + fence.row * brickHeight;
    for (let column = 0; column < columns; column++) {
      const cell = fence.cellAt(column);
      if (cell === null) {
        continue;
      }
      const depth = fence.depthAt(column);
      if (depth <= 0) {
        continue;
      }
      const x = left + column * brickWidth;
      const y = fenceY + fence.riseAt(column);
      if (depth >= brickHeight) {
        drawBrick(this.ctx, x, y, cell, SCALE, { demade: this.demade });
        continue;
      }
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(Math.round(x) * SCALE, Math.round(y) * SCALE, brickWidth * SCALE, depth * SCALE);
      this.ctx.clip();
      drawBrick(this.ctx, x, y, cell, SCALE, { demade: this.demade });
      this.ctx.restore();
      this.pixel(x + 1, y + depth - 1, brickWidth - 2, 1, BRICK_COLORS.F.dark);
    }
  }

  private drawXrayBeam(beamY: number, descending: boolean): void {
    const { left, columns, brickWidth } = gameConfig.grid;
    const span = columns * brickWidth;
    this.pixel(left, beamY, span, 1, canvasPalette.xrayScan);
    this.pixel(left, descending ? beamY - 1 : beamY + 1, span, 1, canvasPalette.xrayScanTrail);
  }

  // CRITTER's grub: a lime body with a brown belly, a red jaw at the leading end
  // and three feet that shuffle one pixel every 8 frames, JAMMER's blink clock —
  // enough to read as walking rather than sliding, on a sprite 10 px wide. Drawn
  // over the bricks it is eating and under the debris it makes, with
  // `spritePixel`, since it moves in thirds of a game pixel.
  //
  // It is an animal, so it runs down before it goes: `critter.deathTicks` is how
  // long it has left by whichever exit is coming, and the last second of it is
  // spent dragging, going the colour of its own belly, and blinking. Under
  // DEMAKE `ink()` flattens the colour half of that to one tone, which is why
  // the stride and the blink carry it too.
  /**
   * SNAP's lattice: one pixel at every crossing of a 12 px grid, dithered in.
   *
   * **A threshold and not an alpha.** Each cell has a fixed pseudo-random value
   * and comes up whole the moment the blend passes it, so the grid resolves out
   * of the dark in a scatter and dissolves back into it the same way — which is
   * how a machine with two states per pixel fades anything, and is the same
   * trick GHOST plays on the wall a few hundred lines up.
   *
   * The hash is over the cell's own coordinates, so a given crossing arrives at
   * the same point in the fade every time the capsule is caught; a per-frame
   * random would boil.
   */
  /**
   * ERODE: how far in the brick that just died had been worn, recovered from
   * where its flash was put.
   *
   * The flash carries a position and not a cell — it is a record of a kill and
   * outlives the brick by two ticks — so the cell is read back out of it. Safe
   * because the wear is positional too: `Erosion` keeps one number per cell of
   * the wall and never clears the one under a brick that has gone, so what
   * comes back is the size the brick was at the moment it was hit.
   */
  private flashWear(flash: BrickFlash, view: RenderView): { x: number; y: number } {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const column = Math.round((flash.x - left) / brickWidth);
    const row = Math.round((flash.y - top) / brickHeight);
    return {
      x: Math.max(1, view.erosion.insetXAt(row, column)),
      y: Math.max(1, view.erosion.insetYAt(row, column)),
    };
  }

  /**
   * The mortar leaving one brick's seams, or being drawn back into them.
   *
   * Hashed off the cell's own coordinates rather than kept as particles, for
   * SNAP's lattice reason and one more: this runs on every brick of every wall
   * for the two seconds the wear takes, and a pool would be sixty bricks times
   * three grains of state to allocate, step and recycle for a picture that owns
   * nothing. Hashed, a grain is at the same point of its fall every time the
   * wall is at the same point of its wear, and no per-frame random can make it
   * boil.
   *
   * The scatter runs across the **cell** and not the body, which is what puts
   * grains in the lane beside the brick as well as under it: the vertical seams
   * are the ones opening widest, and a trickle that came only off the bottom
   * edge would say the wall was settling rather than coming apart.
   */
  private drawErodeGrains(x: number, y: number, erodeX: number, erodeY: number, blend: number, setting: boolean): void {
    const { grains, grainFall, grainSpeed } = gameConfig.powerUps.erode;
    const { brickWidth, brickHeight } = gameConfig.grid;
    // The lip they leave from: the bottom of the body, which is the seam that
    // is opening. It travels up the cell as the brick shrinks, so the trickle
    // starts higher the further the wear has got.
    const seam = y + brickHeight - Math.max(1, erodeY);
    for (let index = 0; index < grains; index++) {
      const hash = ((x * 73856093) ^ (y * 19349663) ^ ((index + 1) * 83492791)) >>> 4;
      // Where in its own fall this grain is. Offset per grain so three of them
      // never leave a seam together, and taken modulo the fall so it is a loop
      // rather than a clock anybody has to reset.
      const travelled = (this.frameCount * grainSpeed + (hash % grainFall)) % grainFall;
      // Setting, the fall runs backwards: the grains climb the same distance
      // back into the seam they came out of, which is the only picture the
      // capsule's ending has.
      const fallen = setting ? grainFall - travelled : travelled;
      // Thinner as the wear settles at either end, so the trickle starts and
      // stops instead of being switched on. `blend` is the *depth* of the wear,
      // and this is a triangle over it: heaviest while the mortar is actually
      // moving, gone by the time it has finished either giving or setting.
      if ((hash >>> 12) % 100 >= Math.round(Math.min(blend, 1 - blend) * 200)) {
        continue;
      }
      this.pixel(
        x + (hash % brickWidth),
        seam + fallen,
        1,
        1,
        index % 2 === 0 ? canvasPalette.erodeGrain : canvasPalette.erodeDust,
      );
    }
  }

  /**
   * GRAVEL: the fault crossing one brick's face, and the grit it lets go while
   * it crosses.
   *
   * **A front and not a curtain.** The blend is one number for the wall, and
   * each cell turns it into a moment of its own: the front's position is the
   * column's share of `wipeSpan`, the cell's own hash nudges it either way by
   * `jitter`, and whatever is left of the fade is what that brick spends
   * splitting. So the crack arrives along the wall a course at a time with a
   * ragged edge, every brick visibly opens rather than switching on, and the
   * expiry is the same thing read backwards — the far column heals first,
   * because it is the one whose turn came last.
   *
   * Hashed off the cell's coordinates rather than kept as state, for the erode
   * trickle's reason and its own: a brick's fractures have to be in the same
   * place on every frame of the twelve seconds it wears them, and a wall that
   * re-cracked each frame would boil.
   *
   * The grit is on the **face**, drifting down across the stone and looping,
   * which is the one thing holding it apart from the trickle a few lines up:
   * ERODE's grains come out of the seams *between* the bricks, because that
   * capsule is about the mortar. This one is about the brick, so the dust is on
   * it.
   */
  private drawGravelCracks(
    x: number,
    y: number,
    row: number,
    column: number,
    erodeX: number,
    erodeY: number,
    blend: number,
  ): void {
    const { wipeSpan, jitter, fractures, fractureLength, grit, gritFall } = gameConfig.powerUps.gravel.crack;
    const { brickWidth, brickHeight, columns } = gameConfig.grid;
    // The body, not the cell: a wall ERODE has worn to 20x6 has to crack over
    // what it has left, or the fault would run through the lane beside it.
    const padX = Math.max(1, erodeX);
    const padY = Math.max(1, erodeY);
    const bodyWidth = brickWidth - padX * 2;
    const bodyHeight = brickHeight - padY * 2;
    const cellHash = grainHash(column * 7 + 1, row * 13 + 1);
    // The cell's turn: the column's share of the crossing, plus a slip of its
    // own. The slip is **one-sided** and the share is shortened by exactly its
    // size, so `start` lands inside `[0, wipeSpan]` by construction and every
    // cell has the whole of `1 - wipeSpan` left to split in. Two-sided, the far
    // column would finish past 1 — its crack would stop a pixel short for the
    // whole twelve seconds and, worse, it would sit inside its own split
    // shedding grit the entire time, since the dust is drawn while a cell is
    // still moving.
    const start = (column / (columns - 1)) * (wipeSpan - jitter) + (((cellHash >>> 7) % 1001) / 1000) * jitter;
    const progress = Math.min(1, Math.max(0, (blend - start) / (1 - wipeSpan)));
    if (progress <= 0) {
      return;
    }

    for (let index = 0; index < fractures; index++) {
      const hash = grainHash(cellHash, index);
      // Started inside the body by two, so a fracture at full length still has
      // room to run without eating the bevel it is drawn on.
      let crackX = x + padX + 1 + (hash % Math.max(1, bodyWidth - fractureLength - 2));
      let crackY = y + padY + 1 + ((hash >>> 8) % Math.max(1, bodyHeight - 3));
      const drawn = Math.round(progress * fractureLength);
      for (let step = 0; step < drawn; step++) {
        this.pixel(crackX, crackY, 1, 1, canvasPalette.gravelCrack);
        // Always along, sometimes down: a line that stepped both ways every
        // pixel is a diagonal, and a diagonal is a cut rather than a crack.
        crackX++;
        crackY += (hash >>> (step + 12)) & 1;
        if (crackY >= y + padY + bodyHeight - 1) {
          crackY = y + padY + bodyHeight - 2;
        }
      }
    }

    if (progress >= 1) {
      return;
    }
    // A triangle over the cell's own split, so the dust starts and stops with
    // it rather than being switched on: heaviest while the face is actually
    // opening, gone by the time it has set. The same shape ERODE puts over the
    // wall's wear, spent per brick because this front is per brick.
    const weight = Math.round(Math.min(progress, 1 - progress) * 200);
    for (let index = 0; index < grit; index++) {
      const hash = grainHash(cellHash, fractures + index);
      if ((hash >>> 12) % 100 >= weight) {
        continue;
      }
      const fallen = (this.frameCount * 0.5 + (hash % gritFall)) % gritFall;
      this.pixel(x + padX + (hash % bodyWidth), y + padY + (fallen % bodyHeight), 1, 1, canvasPalette.gravelDust);
    }
  }

  /**
   * GRAVEL's chips, tumbling.
   *
   * Three tones on a 4 px square, which is the smallest block that can turn
   * over and still be told from a star: the body is the capsule's own stone,
   * one corner carries the pale and
   * the opposite corner carries the crack's own near-black, and the pair walks
   * round the square on `tumbleTicks`. A lit corner alone would only blink; a
   * lit corner with a shadow across from it is a solid object catching the
   * light from a different side, which is what says the chips are stone and not
   * sparks.
   *
   * Off the frame count plus the pip's own seed, so a shower of sixty is never
   * in step — sixty blocks turning together would read as one flashing object.
   */
  private drawPips(view: RenderView): void {
    const { size, tumbleTicks } = gameConfig.powerUps.gravel;
    for (const pip of view.pips) {
      if (!pip.active) {
        continue;
      }
      this.spritePixel(pip.x, pip.y, size, size, canvasPalette.gravelChip);
      const corner = (Math.floor(this.frameCount / tumbleTicks) + pip.seed) % 4;
      const litX = pip.x + (corner === 1 || corner === 2 ? size - 1 : 0);
      const litY = pip.y + (corner >= 2 ? size - 1 : 0);
      this.spritePixel(litX, litY, 1, 1, canvasPalette.gravelChipLit);
      this.spritePixel(
        pip.x + (size - 1) - (litX - pip.x),
        pip.y + (size - 1) - (litY - pip.y),
        1,
        1,
        canvasPalette.gravelCrack,
      );
    }
  }

  private drawSnapGrid(blend: number): void {
    const { cell } = gameConfig.powerUps.snap;
    const { width, height } = gameConfig.field;
    for (let x = cell; x < width; x += cell) {
      for (let y = cell; y < height; y += cell) {
        // Two large odd primes, which is the cheapest hash that does not comb:
        // a plain `x * y` puts every multiple of a row on the same value and the
        // grid would arrive in stripes.
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 8;
        if ((hash & 0xff) / 255 < blend) {
          this.pixel(x, y, 1, 1, canvasPalette.snapGrid);
        }
      }
    }
  }

  /**
   * One snapped bounce: a right-angle bracket at the point of contact, opening
   * along the diagonal the ball left on, and dashes down that diagonal.
   *
   * The bracket is the drafting mark for a right angle and it is the whole
   * claim the capsule makes — this rebound is exact. The dashes are the
   * promise: they lie where the ball is about to be, so the player reads the
   * bank shot before it happens rather than after.
   *
   * They go out one at a time as the mark dies, furthest first, so the guide
   * retracts toward the corner it came from instead of dimming. Whole pixels of
   * one tone, like every other thing on this field that ends.
   *
   * Every arm and dash is drawn with a *signed* width, so the mark mirrors with
   * the diagonal rather than needing four cases: `fillRect` normalises a
   * negative extent, and the sign is the whole of what `dirX`/`dirY` mean.
   */
  /**
   * TRACER: one ball's thread, and the pip it pins on the rail.
   *
   * **A dotted line and never a solid one.** A solid rule from the ball to the
   * deck is the longest mark anything in this game draws and would sit on top of
   * the field for ten seconds; one pixel lit in two reads as a thread at this
   * scale and costs the field half the ink. It is also what keeps it clear of
   * SNAP, whose dashes run *along* the diagonal a ball just left on — these run
   * *ahead* of one, and the two capsules are frequently up together.
   *
   * The dotting is walked in field pixels along the whole polyline rather than
   * per segment, so the phase carries through a bounce: a thread that restarted
   * its pattern at every wall would put a bright double pixel in the corner and
   * read as the corner being the point.
   *
   * `reach` is the pay-out and the letting-go, as a fraction of the thread's
   * total length. Arrival grows it from the ball; expiry is not its mirror — the
   * thread comes away from the *rail* end first, so what the player keeps
   * longest is the few pixels next to the ball, which is the half they are
   * actually reading.
   */
  private drawTracerThread(thread: TracerThread, blend: number, arriving: boolean, deck: PaddleRenderState): void {
    const { pipWidth, pipHeight, slackSag, slackWidth, dotPitch } = gameConfig.powerUps.tracer;
    const [head] = thread.points;
    if (head === undefined) {
      return;
    }

    // The held cue. A ball on its way up has nothing to predict, and a capsule
    // that draws nothing for four seconds reads as one that broke — so the rope
    // is there, visibly slack, swinging with the ball rather than pointing.
    if (thread.slack) {
      const swing = Math.sin(this.frameCount / 9) * slackWidth;
      for (let step = 1; step <= slackSag; step++) {
        const fall = step / slackSag;
        // A catenary is a cosh; at nine pixels a square is the same picture and
        // costs nothing. The rope hangs off the ball and drifts behind it.
        this.spritePixel(head.x + swing * fall * fall, head.y + step, 1, 1, canvasPalette.tracerSlack);
      }
      return;
    }

    if (!thread.full) {
      // Not the ball the deck has to answer: it gets its pip and no thread.
      this.drawTracerPip(thread, blend, pipWidth, pipHeight, deck);
      return;
    }

    // Segment lengths once, so the pay-out can be spent evenly across the whole
    // thread rather than racing through the short bits between bounces.
    const lengths: number[] = [];
    let total = 0;
    for (let index = 1; index < thread.points.length; index++) {
      const from = thread.points[index - 1]!;
      const to = thread.points[index]!;
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      lengths.push(length);
      total += length;
    }
    if (total === 0) {
      return;
    }

    // Arrival pays out from the ball; expiry lets go at the rail. Both are the
    // same number — how much of the thread, measured from the ball, exists this
    // frame — which is why the two ends need no second variable.
    const reach = total * blend;

    // **One walk along the whole polyline, not a loop per segment.** The dots
    // have to keep their spacing *through* a bounce: a pattern restarted at each
    // corner puts a double-bright pixel there and reads as the corner being the
    // point, when the corner is just geometry. Walking one distance and finding
    // the segment it falls in carries the phase for free.
    let segment = 0;
    let consumed = 0;
    for (let walked = 0; walked <= reach; walked += dotPitch) {
      while (segment < lengths.length && walked > consumed + lengths[segment]!) {
        consumed += lengths[segment]!;
        segment++;
      }
      if (segment >= lengths.length) {
        break;
      }
      const from = thread.points[segment]!;
      const to = thread.points[segment + 1]!;
      const length = lengths[segment]!;
      const at = length === 0 ? 0 : (walked - consumed) / length;
      this.spritePixel(from.x + (to.x - from.x) * at, from.y + (to.y - from.y) * at, 1, 1, canvasPalette.tracerThread);
    }

    // The pip is the answer and is drawn whatever the thread did on the way
    // down — it must never be lost to an early exit in the loop above, which is
    // exactly the bug that cost this capsule its mark the first time it was
    // drawn. On the way in it waits until the thread has actually arrived.
    if (!arriving || blend >= 1) {
      this.drawTracerPip(thread, blend, pipWidth, pipHeight, deck);
    }
  }

  /**
   * The mark on the rail: the one pixel of this capsule the player acts on.
   *
   * Drawn at the deck's own y and in the hot tone rather than the thread's,
   * because it is the answer and the thread is only the working. A thread that
   * could not stay honest all the way down has no pip at all — that absence is
   * the capsule admitting it does not know, and it is load-bearing.
   */
  private drawTracerPip(
    thread: TracerThread,
    blend: number,
    width: number,
    height: number,
    deck: PaddleRenderState,
  ): void {
    if (thread.pipX === null) {
      return;
    }
    // Shrinks to its centre as the capsule goes, so the last thing on the rail
    // is a single pixel over the spot rather than a bar that blinks out.
    const span = Math.max(1, Math.round(width * blend));

    // **SPLIT: is this landing on wood, or in the hole?** The single most useful
    // thing this capsule can ever say. SPLIT breaks the deck around a gap that
    // is the whole trap, and a ball dropping through it is a life — so the mark
    // that means "be here" has to be able to mean "you cannot catch this from
    // here" as well, or it is quietly lying on the one tick it matters most.
    //
    // Hazard pink and a blink, which is what the roster already says "trap"
    // with: the malus pop is this exact tone, and the blinking glyph is how a
    // falling trap tells on itself. Two-tick blocks rather than per-frame, the
    // CHAIN bolt's device — a 7 px mark strobing every frame is a rendering
    // fault, not a warning.
    const gapHalf = deck.splitGap / 2;
    const middle = deck.x + deck.width / 2;
    const intoTheGap = gapHalf > 0 && thread.pipX > middle - gapHalf && thread.pipX < middle + gapHalf;
    if (intoTheGap && (this.frameCount & 2) === 0) {
      return;
    }
    this.pixel(
      thread.pipX - span / 2,
      deck.y - height,
      span,
      height,
      intoTheGap ? canvasPalette.popMalus : canvasPalette.tracerPip,
    );
  }

  private drawSnapMark(mark: SnapMark): void {
    const { markTicks, dashes, dashStep, bracketArm } = gameConfig.powerUps.snap;
    const life = mark.ticksLeft / markTicks;
    const x = Math.round(mark.x);
    const y = Math.round(mark.y);
    this.pixel(x, y, bracketArm * mark.dirX, 1, canvasPalette.snapMark);
    this.pixel(x, y, 1, bracketArm * mark.dirY, canvasPalette.snapMark);
    for (let index = 0; index < dashes; index++) {
      // The furthest dash is the first to go: `index` is how far out it is, and
      // a mark with a third of its life left keeps only its first third.
      if ((index + 1) / dashes > life) {
        return;
      }
      const step = (index + 1) * dashStep;
      this.pixel(x + step * mark.dirX, y + step * mark.dirY, 2 * mark.dirX, 1, canvasPalette.snapMark);
    }
  }

  private drawCritter(critter: Critter, dropOffset: number): void {
    if (!critter.alive) {
      return;
    }
    const { dragTicks, dimTicks, darkTicks, blinkTicks } = gameConfig.effects.critter.runDown;
    const left = critter.deathTicks;
    // Two-tick blocks, the CHAIN bolt's device: `draw()` runs per frame, so a
    // per-frame blink on a 10 px sprite would strobe rather than flash.
    if (left < blinkTicks && (left & 2) === 0) {
      return;
    }
    // The grub's y is its own row's, set when it was dropped onto it, so it
    // rides QUAKE's fall with the row it is chewing. Today the wall and the
    // grub agree because neither moves; this is what would break them apart.
    const { x } = critter;
    const y = critter.y - dropOffset;
    const leading = critter.direction > 0;
    // Two discrete steps rather than a blend: a two-colour 10x8 sprite has no
    // in-between, and a lerp on it would just dither.
    const body =
      left < darkTicks
        ? canvasPalette.critterUnder
        : left < dimTicks
          ? canvasPalette.critterSpent
          : canvasPalette.critterBody;

    this.spritePixel(x, y + 2, 10, 4, body);
    this.spritePixel(x + 1, y + 1, 8, 6, body);
    this.spritePixel(x + 1, y + 6, 8, 1, canvasPalette.critterUnder);
    this.spritePixel(leading ? x + 9 : x, y + 3, 1, 2, canvasPalette.critterJaw);
    this.spritePixel(leading ? x + 7 : x + 2, y + 2, 1, 1, canvasPalette.critterEye);

    // The stride clock halves once it is running down, so the feet drag instead
    // of trotting — the one tell that survives both DEMAKE and the blink.
    const stride = (this.frameCount & (left < dragTicks ? 16 : 8)) === 0 ? 0 : 1;
    for (const foot of [1, 4, 7]) {
      this.spritePixel(x + foot + stride, y + 7, 1, 1, canvasPalette.critterUnder);
    }
  }

  // One METEOR rock: a 4 px white-hot core with a 2 px ember cap behind it. The
  // cap sits on the trailing edge, so the sprite points the way it is falling
  // even in a screenshot, and `spritePixel` keeps it on the backing grid — a
  // rock steps 3.23 px a tick and would judder rounded to whole game pixels.
  //
  // Below the wall it is being used up: the ember cap goes out on the first
  // burning tick, then the core steps down 4 -> 3 -> 2 -> 1 px, three ticks a
  // rung. It shrinks at exactly the rate the trail behind it thickens, so what
  // the player watches is a rock turning into its own smoke rather than one
  // being deleted at the bottom of the grid.
  private drawMeteor(meteor: Meteor): void {
    if (meteor.burnTicks === 0) {
      this.spritePixel(meteor.x - 2, meteor.y - 2, 4, 4, canvasPalette.meteorCore);
      this.spritePixel(meteor.x - 1, meteor.y - 3, 2, 2, canvasPalette.meteorFlame);
      return;
    }
    const size = Math.ceil((4 * meteor.burnTicks) / gameConfig.effects.meteor.burnoutTicks);
    this.spritePixel(meteor.x - size / 2, meteor.y - size / 2, size, size, canvasPalette.meteorCore);
  }

  // A CHAIN arc: the mint stroke laid down first, a thinner white core over it,
  // so the bolt reads as hot rather than as a coloured line.
  private drawChainBolt(bolt: ChainBolt, dropOffset: number): void {
    // Two-tick blocks, as the catch pop fades: `draw()` runs per frame, so
    // blinking on tick parity would alias against the frame rate.
    if (bolt.ticksLeft <= 4 && (bolt.ticksLeft & 2) === 0) {
      return;
    }
    // Struck between two cells, so it is drawn in wall coordinates like the
    // wall it is arcing across — a CHAIN taken over a live QUAKE would
    // otherwise leave the arc hanging where the bricks used to be.
    const drop = dropOffset * SCALE;
    this.ctx.beginPath();
    this.ctx.moveTo(bolt.points[0].x * SCALE, bolt.points[0].y * SCALE - drop);
    for (let index = 1; index < bolt.points.length; index++) {
      this.ctx.lineTo(bolt.points[index].x * SCALE, bolt.points[index].y * SCALE - drop);
    }
    this.ctx.strokeStyle = this.ink(canvasPalette.chainBolt);
    this.ctx.lineWidth = 2 * SCALE;
    this.ctx.stroke();
    this.ctx.strokeStyle = this.ink(canvasPalette.chainCore);
    this.ctx.lineWidth = 1 * SCALE;
    this.ctx.stroke();
  }

  /**
   * The brick a homing ball has locked, cornered rather than outlined: four 2x2
   * ticks that leave the brick's own colour and bevel readable underneath — and
   * that fly in from outside it as the lock takes hold.
   *
   * The offset is the ball's own counter, so twelve balls run twelve reticles
   * on twelve clocks. It steps a whole pixel at a time: a 2x2 tick sliding on
   * fractions would smear, and four discrete steps read as a mechanism closing.
   *
   * Going the other way the corners blink out over the last third of their
   * travel, on the four-frame clock a trap's glyph and a dying peel share.
   */
  private drawHomingMark(ball: Ball, opening: boolean, wallY: number): void {
    const { left, brickWidth, brickHeight } = gameConfig.grid;
    const { homingRetargetTicks, homingMarkReach } = gameConfig.powerUps;
    if (opening && ball.homingMarkTicks < homingRetargetTicks / 3 && (ball.homingMarkTicks & 4) === 0) {
      return;
    }
    const out = homingMarkReach - Math.floor((ball.homingMarkTicks * homingMarkReach) / homingRetargetTicks);
    const x = left + ball.homingColumn * brickWidth;
    const y = wallY + ball.homingRow * brickHeight;
    for (const [cornerX, cornerY] of [
      [x - out, y - out],
      [x + brickWidth - 2 + out, y - out],
      [x - out, y + brickHeight - 2 + out],
      [x + brickWidth - 2 + out, y + brickHeight - 2 + out],
    ]) {
      this.pixel(cornerX, cornerY, 2, 2, canvasPalette.homingMark);
    }
  }

  // Where a ball stood when STASIS let go: a thin ring expanding out of the
  // ball and thinning to nothing, over the sprites so it is read as a release
  // and not as something on the field.
  private drawStasisRing(ring: StasisRing): void {
    const age = gameConfig.powerUps.stasisRingLifeTicks - ring.ticksLeft;
    this.strokeStasisRing(ring.x, ring.y, 2 + age * 1.5);
  }

  // One ring, drawn twice over: the release expands it out of the frozen pixel
  // at 1.5 px a tick over `stasisRingLifeTicks`, and the arrival is that same
  // sweep read backwards, 20 px down to 2, riding each ball as it coasts to a
  // stop. Any second number here would give the capsule two ring speeds.
  private strokeStasisRing(centerX: number, centerY: number, radius: number): void {
    this.ctx.strokeStyle = this.ink(canvasPalette.stasisRing);
    this.ctx.lineWidth = 1 * SCALE;
    this.ctx.beginPath();
    this.ctx.arc(centerX * SCALE, centerY * SCALE, radius * SCALE, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  // Rising catch label; blinks through its last third so the fade-out reads as
  // pixel-era decay instead of a smooth alpha ramp.
  private drawPop(pop: CatchPop): void {
    const fading = pop.ticksLeft < 16 && (pop.ticksLeft & 4) === 0;
    if (fading) {
      return;
    }
    const x = Math.round(pop.x * SCALE);
    const y = Math.round(pop.y * SCALE);
    this.ctx.font = `${7 * SCALE}px Silkscreen, monospace`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    // A trap's pink and a bonus's mint both go ink, so the one thing the pop
    // exists to say would be lost. Demade, a malus label is inverted instead —
    // ground letters on an ink shadow — which is the 1-bit way to say the same
    // thing, and the blink and the womp still say it twice over.
    const inverted = this.demade && pop.malus;
    // Both layers inside one counter-rotation: turned separately, the shadow's
    // one-pixel offset would end up on the other side of the label.
    uprightText(this.ctx, x, y, () => {
      this.ctx.fillStyle = this.ink(inverted ? canvasPalette.popMalus : canvasPalette.popShadow);
      this.ctx.fillText(pop.label, x + SCALE, y + SCALE);
      this.ctx.fillStyle = this.ink(
        inverted ? canvasPalette.popShadow : pop.malus ? canvasPalette.popMalus : canvasPalette.popBonus,
      );
      this.ctx.fillText(pop.label, x, y);
    });
  }

  /**
   * The two mouths, painted over the wall frame they replace: three bands
   * scrolling upward, so an opening reads as moving even with no ball near it.
   *
   * `lips` marks the two rows the cut is travelling on while the door is still
   * moving, white-hot so the edge is legible against its own contents. They are
   * `bumperRim` and not `portalBright` for a measurable reason: three of the
   * nine stripe rows are already `portalBright`, so a leading edge painted in
   * it would vanish every time the scroll put a bright band under it — the tell
   * blinking on and off at the stripe cycle's own rate. And they are dropped
   * once the door is fully open, because a lip is where the cut has *reached*;
   * a door that has finished opening is not cutting anything.
   */
  private drawPortals(top: number, height: number, lips: boolean): void {
    const offset = (this.frameCount >> 1) % PORTAL_STRIPES.length;
    const width = gameConfig.field.width;
    for (let row = 0; row < height; row++) {
      const onLip = lips && (row === 0 || row === height - 1);
      const color = onLip ? canvasPalette.bumperRim : PORTAL_STRIPES[(row + offset) % PORTAL_STRIPES.length];
      this.pixel(0, top + row, 3, 1, color);
      this.pixel(width - 3, top + row, 3, 1, color);
    }
  }

  /**
   * TIDE's sea, in columns.
   *
   * **Columns and not one rectangle**, because the surface is only level on the
   * way in. Draining, it sags over the plughole — a sea leaving down a drain
   * rather than being lowered on a lift — and a per-column surface is what makes
   * that one line of arithmetic instead of a clipped second rectangle. Two game
   * pixels a column is also the dither step the crest needs, so the loop pays
   * for itself twice.
   *
   * The dip is **render-only** and stays that way. The water is a region with a
   * force in it, not a surface anything bounces off, so nothing is owed a
   * reading of where the crest is to the pixel — and a buoyancy that changed
   * strength depending on how near the plughole a ball was would be a mechanic
   * nobody could see well enough to play.
   *
   * Everything below a column's surface is one alpha-blended fill: the field,
   * the wall's bottom rows, the discs, the sinking capsules and whatever part of
   * the deck is under water all go green together, which is what makes the
   * arrival read as the sea covering them rather than as a shape being drawn
   * over the top.
   */
  private drawTide(view: RenderView): void {
    // The drips outlive the sea by twelve ticks, so they are drawn on their own
    // and the water is skipped once there is none. Without the gate the surface
    // sits on `field.height`, and the crest and its foam are painted along the
    // open bottom edge of the frame — a line of sea left behind by a sea that
    // has gone.
    if (view.tideBlend === 0) {
      this.drawTideDrips(view.paddle, view.tideDrip);
      return;
    }
    const { left, right, height } = gameConfig.field;
    const { plugDip, plugSpan } = gameConfig.powerUps.tide;
    const center = gameConfig.field.width / 2;
    // The dip is at full depth only once the drain is properly under way, so the
    // surface does not jump out of level on the frame the plug is pulled.
    const dip = view.tideDraining ? plugDip * (1 - view.tideBlend) : 0;

    this.ctx.globalAlpha = TIDE_WASH_ALPHA;
    for (let x = left; x < right; x += 2) {
      const width = Math.min(2, right - x);
      const surface = view.tideWaterline + dip * Math.max(0, 1 - Math.abs(x + 1 - center) / plugSpan);
      const top = Math.round(surface);
      this.pixel(x, top, width, height - top, canvasPalette.tideBody);
      // The crest, half a row of it: the sea climbs in whole pixel rows and a
      // ruled edge on the top one would read as a lid. The parity is the
      // column's own, so the dither is a fixed checker on the water rather than
      // a pattern crawling along it.
      if ((x & 2) === 0) {
        this.pixel(x, top - 1, width, 1, canvasPalette.tideBody);
      }
    }
    this.ctx.globalAlpha = 1;

    // The surface itself, opaque, so the sea has one legible edge whatever it is
    // lying over — and the foam on it, one pixel per 6 px of width, travelling
    // on the swell's own clock so the water the deck is riding and the water the
    // player is watching are moving together.
    for (let x = left; x < right; x += 2) {
      const width = Math.min(2, right - x);
      const surface = view.tideWaterline + dip * Math.max(0, 1 - Math.abs(x + 1 - center) / plugSpan);
      this.pixel(x, Math.round(surface), width, 1, canvasPalette.tideCrest);
    }
    const foamStep = 6;
    for (let x = left; x < right; x += foamStep) {
      // A cheap hash off the column, so the flecks sit at irregular places
      // inside their own 6 px lanes instead of on a grid, and drift with the
      // swell rather than blinking in place.
      const seed = (x * 2654435761) >>> 11;
      const lane = (x + ((seed + (view.tidePhase >> 1)) % foamStep)) % (right - left);
      const at = left + lane;
      const surface = view.tideWaterline + dip * Math.max(0, 1 - Math.abs(at - center) / plugSpan);
      this.pixel(at, Math.round(surface) - 1, 1, 1, canvasPalette.tideFoam);
    }

    if (dip > 0) {
      this.drawTidePlug(view.tideBlend);
    }
    if (view.tideDrip > 0) {
      this.drawTideDrips(view.paddle, view.tideDrip);
    }
  }

  /**
   * The plughole, at the bottom of the field's centre line.
   *
   * A dark ellipse with a ring of dither turning around it, and the turn is the
   * whole of what it says: a still dark patch is a stain, and one that rotates
   * is water going down something. It opens as the sea falls, so the hole is
   * widest at the end — the last of the water visibly leaving rather than a hole
   * that was always there.
   */
  private drawTidePlug(blend: number): void {
    const open = 1 - blend;
    const x = gameConfig.field.width / 2;
    const y = gameConfig.field.height - 10;
    const radiusX = 16 * open;
    const radiusY = 5 * open;
    this.ctx.fillStyle = this.ink(canvasPalette.tidePlug);
    this.ctx.beginPath();
    this.ctx.ellipse(x * SCALE, y * SCALE, radiusX * SCALE, radiusY * SCALE, 0, 0, Math.PI * 2);
    this.ctx.fill();
    // Eight marks on the rim, turning. Whole pixels of a named tone rather than
    // a stroked arc, because everything else on this field that spins is drawn
    // that way and a smooth ring would be the one thing on screen that is not.
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + this.frameCount * 0.14;
      this.spritePixel(
        x + Math.cos(angle) * (radiusX + 2) - 0.5,
        y + Math.sin(angle) * (radiusY + 1.5) - 0.5,
        1,
        1,
        canvasPalette.tideCrest,
      );
    }
  }

  /**
   * What runs off the deck once it is back on the rail: three streaks from the
   * caps and the middle, shortening as they go.
   *
   * The last thing this capsule does, and the only part of it the player sees
   * after the water has gone — which is what stops the departure being a sea
   * that simply stopped existing. They fall as they thin, so the deck is
   * visibly shedding rather than wearing a fringe for twelve ticks.
   */
  private drawTideDrips(paddle: PaddleRenderState, drip: number): void {
    const length = Math.max(1, Math.round(4 * drip));
    const fall = Math.round((1 - drip) * 5);
    for (const at of [0.1, 0.5, 0.9]) {
      this.spritePixel(
        paddle.x + paddle.width * at,
        paddle.y + gameConfig.paddle.height + fall,
        1,
        length,
        canvasPalette.tideCrest,
      );
    }
  }

  private drawWalls(): void {
    const { width, height } = gameConfig.field;
    this.pixel(0, 0, 3, height, canvasPalette.wallLight);
    this.pixel(2, 0, 1, height, canvasPalette.wallShade);
    this.pixel(width - 3, 0, 3, height, canvasPalette.wallLight);
    this.pixel(width - 3, 0, 1, height, canvasPalette.wallShade);
    this.pixel(0, 0, width, 3, canvasPalette.wallLight);
    this.pixel(0, 2, width, 1, canvasPalette.wallShade);
  }
}
