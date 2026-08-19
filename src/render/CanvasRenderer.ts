import { gameConfig } from "@core/config/GameConfig";
import { MALUS_KINDS, POWER_UP_GLYPHS } from "@core/config/powerUps";
import { mirrorBounds } from "@entities/paddle/MirrorPaddle";
import { BackgroundLayer } from "@render/backgrounds";
import { BRICK_COLORS, canvasPalette, DARK_LETTER_DROP_KINDS, DROP_COLORS } from "@render/palette";

import type { Ball } from "@entities/ball/Ball";
import type { Critter } from "@entities/effects/Critter";
import type { Detonation } from "@entities/effects/Detonation";
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

const DROP_GLYPH_FONTS = {
  // One character keeps the 7px the roster has always drawn at.
  single: `${7 * SCALE}px Silkscreen, monospace`,
  // Two drop to 5px: ~8.6 game px at Silkscreen's advance, well inside the span.
  double: `${5 * SCALE}px Silkscreen, monospace`,
} as const;

// Exported for the DEV legibility pass, which must measure exactly what
// `drawCapsule` paints — see `@render/checkCapsules`.
export function dropGlyphFont(glyph: string): string {
  return glyph.length > 1 ? DROP_GLYPH_FONTS.double : DROP_GLYPH_FONTS.single;
}

const FLASH_COLORS: Record<BrickFlashKind, string> = {
  death: canvasPalette.deathFlash,
  blast: canvasPalette.blastFlash,
};

export interface PaddleRenderState {
  x: number;
  width: number;
  laserActive: boolean;
}

// The four tones a paddle is banded from. The ghost is the same sprite in a
// dimmer set, which is what makes it read as the paddle's reflection.
interface PaddleBandColors {
  body: string;
  cap: string;
  sheen: string;
  shade: string;
}

// Game pixels between the dots of a magnet tether.
const TETHER_DASH_SPACING = 4;

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

const PADDLE_BANDS: PaddleBandColors = {
  body: canvasPalette.paddleBody,
  cap: canvasPalette.paddleCap,
  sheen: canvasPalette.paddleTopSheen,
  shade: canvasPalette.paddleBottomShade,
};

const MIRROR_BANDS: PaddleBandColors = {
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
  // GHOST's fade, 0 solid to 1 fully ghosted. Between the two the renderer
  // runs its plasma mask over the grid, each brick melting to its outline as
  // the field rises past it.
  ghostBlend: number;
  // BOMB blew it up: the debris in flight is the paddle, so neither it nor
  // MIRROR's reflection of it may be on screen.
  paddleHidden: boolean;
  bumpers: readonly Bumper[];
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
  detonation: Detonation;
  singularity: Singularity;
  quake: Quake;
  critter: Critter;
  energyWallArmed: boolean;
}

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: BackgroundLayer;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    const { width, height } = gameConfig.field;
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context unavailable");
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.background = new BackgroundLayer(width, height);
  }

  draw(view: RenderView): void {
    this.frameCount++;
    const { width, height } = gameConfig.field;
    // The level's field art, painted at 1× on a theme change and blitted here
    // with smoothing off — an exact 3× nearest-neighbour upscale, so the
    // background keeps the same chunky game pixels as the sprites.
    const layer = this.background.imageFor(view.background, view.backgroundVariant);
    this.ctx.drawImage(layer, 0, 0, width * SCALE, height * SCALE);

    // QUAKE displaces everything that stands on the field, and nothing else: the
    // background stays put so the shake reads as the wall rattling rather than
    // as the camera drifting, and the frame is painted after the restore, which
    // is what hides the overhang a 4 px lurch would otherwise show at the edges.
    // `translate`, never `setTransform` — this has to compose with whatever the
    // renderer is already under.
    this.ctx.save();
    this.ctx.translate(view.quake.offsetX * SCALE, view.quake.offsetY * SCALE);
    this.drawSingularity(view.singularity);

    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    view.grid.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (cell) {
          const x = left + columnIndex * brickWidth;
          const y = top + rowIndex * brickHeight;
          const fade = ghostProgress(view.ghostBlend, rowIndex, columnIndex, this.frameCount);
          this.drawBrick(x, y, cell, fade);
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
      const color = [colors.flat, colors.light, colors.dark][index % 3];
      this.spritePixel(particle.x, particle.y, particle.size, particle.size, color);
    });
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
    for (const drop of view.drops) {
      if (drop.active) {
        this.drawCapsule(drop.x, drop.y, drop.kind);
      }
    }
    for (const shot of view.shots) {
      if (shot.active) {
        this.spritePixel(shot.x, shot.y, 2, 9, canvasPalette.laserShot);
      }
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

    for (const pop of view.pops) {
      this.drawPop(pop);
    }

    this.drawDetonation(view.detonation);
    this.ctx.restore();

    this.drawWalls();
    if (view.portalActive) {
      this.drawPortals();
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
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = width * SCALE;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius * SCALE, 0, Math.PI * 2);
      this.ctx.stroke();
    };

    this.ctx.fillStyle = canvasPalette.singularityCore;
    this.ctx.beginPath();
    this.ctx.arc(x, y, singularity.radius * SCALE, 0, Math.PI * 2);
    this.ctx.fill();
    ring(singularity.radius + 3 + Math.sin(this.frameCount * 0.2), canvasPalette.singularityHalo, 2);
    ring(singularity.radius + 7, canvasPalette.singularityRim, 1);
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
      this.ctx.strokeStyle = canvasPalette.bumperRim;
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
      this.ctx.strokeStyle = canvasPalette.nukeRing;
      this.ctx.lineWidth = 3 * SCALE;
      this.ctx.beginPath();
      this.ctx.arc(detonation.x * SCALE, detonation.y * SCALE, detonation.radius * SCALE, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  private pixel(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x) * SCALE, Math.round(y) * SCALE, width * SCALE, height * SCALE);
  }

  // Same chunky block art as pixel(), but the position snaps to the backing
  // grid instead of the game grid — sub-game-pixel placement for anything that moves.
  private spritePixel(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x * SCALE), Math.round(y * SCALE), width * SCALE, height * SCALE);
  }

  // `fade` is GHOST's per-brick progress: at 1 the body and both bevels are
  // gone, leaving the cell's outline over the playfield theme; between 0 and 1
  // the body is drawn translucent under an outline still gaining strength, so a
  // brick de-materialises instead of flipping. Damage has no lit face to show
  // while ghosted, and comes back with the brick.
  private drawBrick(x: number, y: number, cell: BrickCell, fade = 0): void {
    if (fade > 0) {
      this.ctx.globalAlpha = fade;
      this.pixel(x + 1, y + 1, 28, 1, canvasPalette.ghostBrick);
      this.pixel(x + 1, y + 10, 28, 1, canvasPalette.ghostBrick);
      this.pixel(x + 1, y + 2, 1, 8, canvasPalette.ghostBrick);
      this.pixel(x + 28, y + 2, 1, 8, canvasPalette.ghostBrick);
      this.ctx.globalAlpha = 1;
      if (fade >= 1) {
        return;
      }
      this.ctx.globalAlpha = 1 - fade;
    }

    const colors = BRICK_COLORS[cell.kind];
    const flat = cell.hurt ? colors.dark : colors.flat;
    const sheen = cell.hurt ? colors.flat : colors.light;

    this.pixel(x + 1, y + 1, 28, 10, flat);
    this.pixel(x + 2, y + 1, 26, 1, sheen);
    this.pixel(x + 1, y + 2, 1, 8, sheen);
    this.pixel(x + 2, y + 10, 26, 1, colors.dark);
    this.pixel(x + 28, y + 2, 1, 8, colors.dark);
    this.ctx.globalAlpha = 1;
  }

  private drawPaddle(paddle: PaddleRenderState): void {
    const y = gameConfig.paddle.y;
    this.drawPaddleBands(paddle.x, y, paddle.width, PADDLE_BANDS);

    if (paddle.laserActive) {
      this.spritePixel(paddle.x + 5, y - 3, 2, 3, canvasPalette.laserCannon);
      this.spritePixel(paddle.x + paddle.width - 7, y - 3, 2, 3, canvasPalette.laserCannon);
    }
  }

  // MIRROR's ghost: the paddle's sprite, dimmed, at the mirrored x — and never
  // any cannons, since the ghost is a surface and not a second paddle.
  private drawMirror(paddle: PaddleRenderState): void {
    const bounds = mirrorBounds(paddle.x, paddle.width);
    this.drawPaddleBands(bounds.left, bounds.top, paddle.width, MIRROR_BANDS);
  }

  private drawPaddleBands(x: number, y: number, width: number, colors: PaddleBandColors): void {
    const height = gameConfig.paddle.height;

    this.spritePixel(x + 1, y, width - 2, height, colors.body);
    this.spritePixel(x, y + 1, width, height - 2, colors.body);
    this.spritePixel(x + 1, y, 7, 1, colors.cap);
    this.spritePixel(x, y + 1, 8, height - 2, colors.cap);
    this.spritePixel(x + 1, y + height - 1, 7, 1, colors.cap);
    this.spritePixel(x + width - 8, y, 7, 1, colors.cap);
    this.spritePixel(x + width - 8, y + 1, 8, height - 2, colors.cap);
    this.spritePixel(x + width - 8, y + height - 1, 7, 1, colors.cap);
    this.spritePixel(x + 9, y + 1, width - 18, 1, colors.sheen);
    this.spritePixel(x + 9, y + height - 1, width - 18, 1, colors.shade);
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

    BALL_PIXEL_ROWS.forEach(([offset, span], rowIndex) => {
      this.spritePixel(x + offset, y + rowIndex, span, 1, canvasPalette.ballBody);
    });
    this.spritePixel(x + 2, y + 1, 2, 1, canvasPalette.ballHighlight);
    this.spritePixel(x + 1, y + 2, 1, 2, canvasPalette.ballHighlight);
    this.spritePixel(x + 3, y + 6, 3, 1, canvasPalette.ballShade);
    this.spritePixel(x + 6, y + 4, 1, 2, canvasPalette.ballShade);
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

  // One capsule pill, wherever it is: falling through the field, or showing
  // through the brick that holds it while XRAY is lit. The same sprite for both
  // is the point — what the wall shows is what the player will catch.
  private drawCapsule(x: number, y: number, kind: PowerUpKind): void {
    const color = DROP_COLORS[kind];

    this.spritePixel(x + 1, y, 18, 8, color);
    this.spritePixel(x, y + 1, 20, 6, color);
    this.spritePixel(x + 2, y + 1, 16, 1, canvasPalette.dropSheen);
    this.spritePixel(x + 2, y + 7, 16, 1, canvasPalette.dropShade);

    // A trap telegraphs itself with a blinking letter, so it can be read as one
    // while there is still time to dodge it — in the wall as much as in the air.
    if (MALUS_KINDS.has(kind) && (this.frameCount & 8) !== 0) {
      return;
    }

    // The glyph, not the id: two-character ids exist and draw one size down.
    const glyph = POWER_UP_GLYPHS[kind];
    this.ctx.fillStyle = DARK_LETTER_DROP_KINDS.has(kind)
      ? canvasPalette.dropLetterDark
      : canvasPalette.dropLetterLight;
    this.ctx.font = dropGlyphFont(glyph);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(glyph, Math.round((x + 10) * SCALE), Math.round((y + 4.5) * SCALE));
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
    this.drawCapsule(brickX + 5, brickY + 2, kind);
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
    this.ctx.strokeStyle = canvasPalette.chainBolt;
    this.ctx.lineWidth = 2 * SCALE;
    this.ctx.stroke();
    this.ctx.strokeStyle = canvasPalette.chainCore;
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
    this.ctx.strokeStyle = canvasPalette.stasisRing;
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
    this.ctx.fillStyle = canvasPalette.popShadow;
    this.ctx.fillText(pop.label, x + SCALE, y + SCALE);
    this.ctx.fillStyle = pop.malus ? canvasPalette.popMalus : canvasPalette.popBonus;
    this.ctx.fillText(pop.label, x, y);
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
