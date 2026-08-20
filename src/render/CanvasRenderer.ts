import { gameConfig } from "@core/config/GameConfig";
import { MALUS_KINDS, POWER_UP_GLYPHS } from "@core/config/powerUps";
import { mirrorBounds } from "@entities/paddle/MirrorPaddle";
import { BackgroundLayer } from "@render/backgrounds";
import { BRICK_COLORS, canvasPalette, DARK_LETTER_DROP_KINDS, DEMAKE_GROUND_TONES, DROP_COLORS } from "@render/palette";

import type { Ball } from "@entities/ball/Ball";
import type { Critter } from "@entities/effects/Critter";
import type { Detonation } from "@entities/effects/Detonation";
import type { Meteor } from "@entities/effects/MeteorField";
import type { Particle } from "@entities/effects/ParticleField";
import type { Quake } from "@entities/effects/Quake";
import type { Singularity } from "@entities/effects/Singularity";
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
  Peel,
  PowerUpKind,
  StasisRing,
} from "@interfaces/types";

// RUSH's streak, as [how far back along this tick's displacement, tone]. Far
// first, so the near copy paints over it and the smear darkens away from the
// ball. Two is the whole trail: three read as a snake, one as a rendering fault.
const BALL_TRAIL_STEPS: ReadonlyArray<readonly [number, string]> = [
  [0.8, canvasPalette.rushTrailFar],
  [0.4, canvasPalette.rushTrailNear],
];

// PIERCE's sparks, hottest first: white, the ball's own near-white, the
// capsule's yellow. Cycled by slot index exactly as the brick mix below is, so
// a shower is a mix without a colour stored per spark.
const PIERCE_SPARK_TONES: readonly string[] = [
  canvasPalette.dropSheen,
  canvasPalette.ballHighlight,
  canvasPalette.laserCannon,
];

const BALL_PIXEL_ROWS: ReadonlyArray<readonly [number, number]> = [
  [2, 4],
  [1, 6],
  [0, 8],
  [0, 8],
  [0, 8],
  [0, 8],
  [1, 6],
  [2, 4],
];

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

const FLASH_COLORS: Record<BrickFlashKind, string> = {
  death: canvasPalette.deathFlash,
  blast: canvasPalette.blastFlash,
};

export interface PaddleRenderState {
  x: number;
  width: number;
  laserActive: boolean;
  // SPLIT's hole, in game pixels, or 0 while the deck is whole. `width` stays
  // the span end to end either way, so the cannons and MIRROR's ghost need no
  // second number.
  splitGap: number;
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
  mirrorActive: boolean;
  magnetActive: boolean;
  portalActive: boolean;
  // XRAY: show every brick the capsule it is holding, for as long as it lasts.
  xrayActive: boolean;
  // DEMAKE's dissolve, 0 in colour to 1 fully demade. A number rather than a
  // flag because the machine sags into the tube and back out over half a second
  // at each end. Purely presentational — the simulation behind it is not told,
  // and nothing here changes what it does.
  demakeBlend: number;
  // GHOST's fade, 0 solid to 1 fully ghosted. Between the two the renderer
  // runs its plasma mask over the grid, each brick melting to its outline as
  // the field rises past it.
  ghostBlend: number;
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
  // BOMB blew it up: the debris in flight is the paddle, so neither it nor
  // MIRROR's reflection of it may be on screen.
  paddleHidden: boolean;
  bumpers: readonly Bumper[];
  // BANANA's peels on the paddle rail, oldest first.
  peels: readonly Peel[];
  balls: readonly Ball[];
  // RUSH: the scale the simulation is stepping balls at, or 0 when nothing is
  // speeding them up. It is a distance rather than a flag because the streak has
  // to be the ground actually covered — see the note where the view is built.
  ballTrail: number;
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
  energyWallArmed: boolean;
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
 * `fade` is GHOST's per-brick progress: at 1 the body and both bevels are gone,
 * leaving the cell's outline over the playfield theme; between 0 and 1 the body
 * is drawn translucent under an outline still gaining strength, so a brick
 * de-materialises instead of flipping. Damage has no lit face to show while
 * ghosted, and comes back with the brick.
 */
export function drawBrick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: BrickCell,
  scale: number,
  fade = 0,
  demade = false,
): void {
  const ink = inkFor(demade);
  // `CanvasRenderer.pixel`, at the scale asked for: whole game pixels, each one
  // a scale×scale block.
  const pixel = (left: number, top: number, width: number, height: number, color: string): void => {
    ctx.fillStyle = ink(color);
    ctx.fillRect(Math.round(left) * scale, Math.round(top) * scale, width * scale, height * scale);
  };

  if (fade > 0) {
    ctx.globalAlpha = fade;
    pixel(x + 1, y + 1, 28, 1, canvasPalette.ghostBrick);
    pixel(x + 1, y + 10, 28, 1, canvasPalette.ghostBrick);
    pixel(x + 1, y + 2, 1, 8, canvasPalette.ghostBrick);
    pixel(x + 28, y + 2, 1, 8, canvasPalette.ghostBrick);
    ctx.globalAlpha = 1;
    if (fade >= 1) {
      return;
    }
    ctx.globalAlpha = 1 - fade;
  }

  const colors = BRICK_COLORS[cell.kind];
  const flat = cell.hurt ? colors.dark : colors.flat;
  const sheen = cell.hurt ? colors.flat : colors.light;

  pixel(x + 1, y + 1, 28, 10, flat);
  pixel(x + 2, y + 1, 26, 1, sheen);
  pixel(x + 1, y + 2, 1, 8, sheen);
  pixel(x + 2, y + 10, 26, 1, colors.dark);
  pixel(x + 28, y + 2, 1, 8, colors.dark);
  ctx.globalAlpha = 1;
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

  // A newborn is the round sprite clipped to a centred window — and the round
  // rows clipped to 4 or 6 px are exactly a filled square, so it is drawn as
  // one. No lit edge and no shadow: the mask is smaller than the pixels they
  // sit on, and a pip this hot reads as light, not as a lit thing.
  if (birth) {
    const [, width, color] = birth;
    const inset = (BALL_SIZE - width) / 2;
    pixel(x + inset, y + inset, width, width, color);
    return;
  }

  BALL_PIXEL_ROWS.forEach(([offset, span], rowIndex) => {
    pixel(x + offset, y + rowIndex, span, 1, canvasPalette.ballBody);
  });
  pixel(x + 2, y + 1, 2, 1, canvasPalette.ballHighlight);
  pixel(x + 1, y + 2, 1, 2, canvasPalette.ballHighlight);
  pixel(x + 3, y + 6, 3, 1, canvasPalette.ballShade);
  pixel(x + 6, y + 4, 1, 2, canvasPalette.ballShade);
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
    for (const core of view.cores) {
      this.drawSingularity(core);
    }

    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    view.grid.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (cell) {
          const x = left + columnIndex * brickWidth;
          const y = top + rowIndex * brickHeight;
          const fade = ghostProgress(view.ghostBlend, rowIndex, columnIndex, this.frameCount);
          drawBrick(this.ctx, x, y, cell, SCALE, fade, this.demade);
          if (view.xrayActive && cell.capsule) {
            this.drawRevealedCapsule(x, y, cell.capsule);
          }
        }
      });
    });

    for (const flash of view.flashes) {
      this.pixel(flash.x + 1, flash.y + 1, 28, 10, FLASH_COLORS[flash.kind]);
    }
    for (const ball of view.balls) {
      if (ball.active && ball.homingRow >= 0) {
        this.drawHomingMark(ball.homingRow, ball.homingColumn);
      }
    }
    this.drawCritter(view.critter);
    // Slot index cycles the brick's three palette colors — sequential ring-buffer
    // slots give each burst a flat/light/dark mix without storing a color per particle.
    view.particles.forEach((particle, index) => {
      if (particle.ticksLeft <= 0) {
        return;
      }
      const colors = BRICK_COLORS[particle.brickKind];
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
      this.drawChainBolt(bolt);
    }
    if (view.energyWallArmed) {
      this.pixel(gameConfig.field.left, gameConfig.powerUps.wallY, 366, 2, canvasPalette.energyWall);
    }
    for (const bumper of view.bumpers) {
      this.drawBumper(bumper);
    }
    if (view.magnetActive) {
      this.drawMagnetTethers(view.paddle, view.drops);
    }
    // Under the deck as always — except in a blackout, which paints them again
    // above its veil instead. See `drawBlackout` for why they stay lit.
    if (view.blackoutBlend <= 0) {
      this.drawDrops(view);
    }
    for (const shot of view.shots) {
      if (shot.active) {
        this.spritePixel(shot.x, shot.y, 2, 9, canvasPalette.laserShot);
      }
    }
    // Under the deck: a peel is on the rail the paddle slides along, and the
    // paddle sliding over one has to be seen covering it.
    for (const peel of view.peels) {
      this.drawPeel(peel);
    }
    if (view.mirrorActive && !view.paddleHidden) {
      this.drawMirror(view.paddle);
    }
    if (!view.paddleHidden) {
      this.drawPaddle(view.paddle);
    }
    for (const ball of view.balls) {
      if (ball.active) {
        this.drawBall(ball, view.ballTrail);
      }
    }

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

    this.drawDetonation(view.detonation);
    this.ctx.restore();

    // Inside the turn with the field: the frame is closed at the top and open
    // at the bottom, so which edge kills is drawn rather than remembered.
    this.drawWalls();
    if (view.portalActive) {
      this.drawPortals();
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

  // A pinball disc: a rose body with a white outline and a dark eye. It never
  // moves, so it snaps to whole game pixels like the bricks do. A kick turns the
  // eye white and throws a ring out past the body, which is the whole tell that
  // this disc — not one of the others — is the one that just paid.
  private drawBumper(bumper: Bumper): void {
    const { radius, flashTicks } = gameConfig.powerUps.bumpers;
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
    BALL_PIXEL_ROWS.forEach(([offset, span], rowIndex) => {
      this.pixel(left + radius - 4 + offset, top + radius - 4 + rowIndex, span, 1, eye);
    });

    if (flashing) {
      this.ctx.strokeStyle = this.ink(canvasPalette.bumperRim);
      this.ctx.lineWidth = 1 * SCALE;
      this.ctx.globalAlpha = bumper.flashTicksLeft / flashTicks;
      this.ctx.beginPath();
      this.ctx.arc(bumper.x * SCALE, bumper.y * SCALE, (radius + 3) * SCALE, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
    }
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

  // BANANA's peel, lying flush on the rail. It blinks out its last second the
  // way a trap capsule's glyph blinks as it falls: a hazard about to stop being
  // one has to say so, or the player steers around nothing for the rest of the
  // level. Whole game pixels — it never moves.
  private drawPeel(peel: Peel): void {
    const { peelWidth, peelBlinkTicks } = gameConfig.powerUps.banana;
    if (peel.ticksLeft < peelBlinkTicks && (peel.ticksLeft & 4) === 0) {
      return;
    }
    const y = gameConfig.paddle.y - PEEL_HEIGHT;
    this.pixel(peel.x + 1, y, peelWidth - 2, 1, canvasPalette.peelBody);
    this.pixel(peel.x, y + 1, peelWidth, 3, canvasPalette.peelBody);
    this.pixel(peel.x + 1, y + PEEL_HEIGHT - 1, peelWidth - 2, 1, canvasPalette.peelShade);
  }

  private drawPaddle(paddle: PaddleRenderState): void {
    const y = gameConfig.paddle.y;
    this.drawDeck(paddle, paddle.x, y, PADDLE_BANDS);

    if (paddle.laserActive) {
      this.spritePixel(paddle.x + 5, y - 3, 2, 3, canvasPalette.laserCannon);
      this.spritePixel(paddle.x + paddle.width - 7, y - 3, 2, 3, canvasPalette.laserCannon);
    }
  }

  // MIRROR's ghost: the paddle's sprite, dimmed, at the mirrored x — and never
  // any cannons, since the ghost is a surface and not a second paddle.
  private drawMirror(paddle: PaddleRenderState): void {
    const bounds = mirrorBounds(paddle.x, paddle.width);
    this.drawDeck(paddle, bounds.left, bounds.top, MIRROR_BANDS);
  }

  // One pill, or two with SPLIT's hole between them — each half a full pill with
  // its own caps and bevels, so a broken deck reads as two pieces of the same
  // paddle rather than as one paddle with a bite taken out of it.
  private drawDeck(paddle: PaddleRenderState, x: number, y: number, colors: PaddleBandColors): void {
    if (paddle.splitGap === 0) {
      this.drawPaddleBands(x, y, paddle.width, colors);
      return;
    }
    const half = (paddle.width - paddle.splitGap) / 2;
    this.drawPaddleBands(x, y, half, colors);
    this.drawPaddleBands(x + paddle.width - half, y, half, colors);
  }

  private drawPaddleBands(x: number, y: number, width: number, colors: PaddleBandColors): void {
    drawPaddleBands(this.ctx, x, y, width, colors, SCALE, this.demade);
  }

  // A ball at 8 px a tick is genuinely hard to follow, which is the trap — but it
  // has to stay trackable enough to be fair, so RUSH smears it. The copies are
  // computed off the velocity already in hand: no per-ball history, nothing to
  // clear on a reset. A ball glued to the paddle keeps its stored velocity and is
  // going nowhere, so it gets no streak.
  private drawBall(ball: Ball, trail: number): void {
    const { x, y } = ball;

    if (trail > 0 && ball.stuckOffsetX === null) {
      for (const [step, color] of BALL_TRAIL_STEPS) {
        const trailX = x - ball.velocity.x * trail * step;
        const trailY = y - ball.velocity.y * trail * step;
        BALL_PIXEL_ROWS.forEach(([offset, span], rowIndex) => {
          this.spritePixel(trailX + offset, trailY + rowIndex, span, 1, color);
        });
      }
    }

    drawBall(this.ctx, x, y, SCALE, this.demade, { birth: ball.birthTicksLeft });
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
    if (!view.paddleHidden) {
      const { y, height } = gameConfig.paddle;
      torches.push({
        x: view.paddle.x + view.paddle.width / 2 + shakeX,
        y: y + height / 2 + shakeY,
        radius: BLACKOUT_TORCH.paddleRadius * spread,
        // The deck only dims to its glow once the dark has actually arrived:
        // held at 0.55 through the iris it would be a shadow on the paddle
        // while the rest of the field was still fully lit.
        peak: 1 - (1 - BLACKOUT_TORCH.paddlePeak) * view.blackoutBlend,
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
  private drawMagnetTethers(paddle: PaddleRenderState, drops: readonly Drop[]): void {
    const toX = paddle.x + paddle.width / 2;
    const toY = gameConfig.paddle.y;
    const phase = (this.frameCount >> 2) % TETHER_DASH_SPACING;

    for (const drop of drops) {
      const fromX = drop.x + 10;
      const fromY = drop.y + 8;
      if (!drop.active || Math.abs(toX - fromX) > gameConfig.powerUps.magnet.rangeX) {
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
  private drawRevealedCapsule(brickX: number, brickY: number, kind: PowerUpKind): void {
    this.ctx.globalAlpha = XRAY_REVEAL_ALPHA;
    drawCapsule(this.ctx, brickX + 5, brickY + 2, kind, SCALE, this.frameCount, this.demade);
    this.ctx.globalAlpha = 1;
  }

  // CRITTER's grub: a lime body with a brown belly, a red jaw at the leading end
  // and three feet that shuffle one pixel every 8 frames, JAMMER's blink clock —
  // enough to read as walking rather than sliding, on a sprite 10 px wide. Drawn
  // over the bricks it is eating and under the debris it makes, with
  // `spritePixel`, since it moves in thirds of a game pixel.
  private drawCritter(critter: Critter): void {
    if (!critter.alive) {
      return;
    }
    const { x, y } = critter;
    const leading = critter.direction > 0;

    this.spritePixel(x, y + 2, 10, 4, canvasPalette.critterBody);
    this.spritePixel(x + 1, y + 1, 8, 6, canvasPalette.critterBody);
    this.spritePixel(x + 1, y + 6, 8, 1, canvasPalette.critterUnder);
    this.spritePixel(leading ? x + 9 : x, y + 3, 1, 2, canvasPalette.critterJaw);
    this.spritePixel(leading ? x + 7 : x + 2, y + 2, 1, 1, canvasPalette.critterEye);

    const stride = (this.frameCount & 8) === 0 ? 0 : 1;
    for (const foot of [1, 4, 7]) {
      this.spritePixel(x + foot + stride, y + 7, 1, 1, canvasPalette.critterUnder);
    }
  }

  // One METEOR rock: a 4 px white-hot core with a 2 px ember cap behind it. The
  // cap sits on the trailing edge, so the sprite points the way it is falling
  // even in a screenshot, and `spritePixel` keeps it on the backing grid — a
  // rock steps 3.23 px a tick and would judder rounded to whole game pixels.
  private drawMeteor(meteor: Meteor): void {
    this.spritePixel(meteor.x - 2, meteor.y - 2, 4, 4, canvasPalette.meteorCore);
    this.spritePixel(meteor.x - 1, meteor.y - 3, 2, 2, canvasPalette.meteorFlame);
  }

  // A CHAIN arc: the mint stroke laid down first, a thinner white core over it,
  // so the bolt reads as hot rather than as a coloured line.
  private drawChainBolt(bolt: ChainBolt): void {
    // Two-tick blocks, as the catch pop fades: `draw()` runs per frame, so
    // blinking on tick parity would alias against the frame rate.
    if (bolt.ticksLeft <= 4 && (bolt.ticksLeft & 2) === 0) {
      return;
    }
    this.ctx.beginPath();
    this.ctx.moveTo(bolt.points[0].x * SCALE, bolt.points[0].y * SCALE);
    for (let index = 1; index < bolt.points.length; index++) {
      this.ctx.lineTo(bolt.points[index].x * SCALE, bolt.points[index].y * SCALE);
    }
    this.ctx.strokeStyle = this.ink(canvasPalette.chainBolt);
    this.ctx.lineWidth = 2 * SCALE;
    this.ctx.stroke();
    this.ctx.strokeStyle = this.ink(canvasPalette.chainCore);
    this.ctx.lineWidth = 1 * SCALE;
    this.ctx.stroke();
  }

  // The brick a homing ball has locked, cornered rather than outlined: four
  // 2x2 ticks leave the brick's own colour and bevel readable underneath.
  private drawHomingMark(row: number, column: number): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const x = left + column * brickWidth;
    const y = top + row * brickHeight;
    for (const [cornerX, cornerY] of [
      [x, y],
      [x + brickWidth - 2, y],
      [x, y + brickHeight - 2],
      [x + brickWidth - 2, y + brickHeight - 2],
    ]) {
      this.pixel(cornerX, cornerY, 2, 2, canvasPalette.homingMark);
    }
  }

  // Where a ball stood when STASIS let go: a thin ring expanding out of the
  // ball and thinning to nothing, over the sprites so it is read as a release
  // and not as something on the field.
  private drawStasisRing(ring: StasisRing): void {
    const age = gameConfig.powerUps.stasisRingLifeTicks - ring.ticksLeft;
    this.ctx.strokeStyle = this.ink(canvasPalette.stasisRing);
    this.ctx.lineWidth = 1 * SCALE;
    this.ctx.beginPath();
    this.ctx.arc(ring.x * SCALE, ring.y * SCALE, (2 + age * 1.5) * SCALE, 0, Math.PI * 2);
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

  // The two mouths, painted over the wall frame they replace: three bands
  // scrolling upward, so an opening reads as moving even with no ball near it.
  private drawPortals(): void {
    const { portalTop, portalHeight } = gameConfig.powerUps;
    const offset = (this.frameCount >> 1) % PORTAL_STRIPES.length;
    for (let row = 0; row < portalHeight; row++) {
      const color = PORTAL_STRIPES[(row + offset) % PORTAL_STRIPES.length];
      this.pixel(0, portalTop + row, 3, 1, color);
      this.pixel(gameConfig.field.width - 3, portalTop + row, 3, 1, color);
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
