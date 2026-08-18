import { gameConfig } from "@core/config/GameConfig";
import { POWER_UP_GLYPHS } from "@core/config/powerUps";
import { BackgroundLayer } from "@render/backgrounds";
import { BRICK_COLORS, canvasPalette, DARK_LETTER_DROP_KINDS, DROP_COLORS } from "@render/palette";

import type { Ball } from "@entities/ball/Ball";
import type { Detonation } from "@entities/effects/Detonation";
import type { Particle } from "@entities/effects/ParticleField";
import type { Shot } from "@entities/laser/ShotPool";
import type { Drop } from "@entities/powerups/DropPool";
import type { BackgroundId, BrickCell, BrickFlash, BrickFlashKind, CatchPop } from "@interfaces/types";

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

// The backing store is SCALE× the 372×300 game grid. Static art snaps to whole
// game pixels (each drawn as a SCALE×SCALE block, so stills are unchanged);
// moving sprites snap to the finer backing grid, stepping in thirds of a game
// pixel instead of jumping whole ones.
export const SCALE = 3;

// The capsule letter must stay inside the pill's sheen span (x+2 … x+18).
export const DROP_GLYPH_SPAN = 16;

const DROP_GLYPH_FONTS = {
  // One character keeps the 7px the roster has always drawn at.
  single: `${7 * SCALE}px Silkscreen, monospace`,
  // Two drop to 5px: ~8.6 game px at Silkscreen's advance, well inside the span.
  double: `${5 * SCALE}px Silkscreen, monospace`,
} as const;

// Exported for the DEV legibility pass, which must measure exactly what
// `drawDrop` paints — see `@render/checkCapsules`.
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

export interface RenderView {
  background: BackgroundId;
  // Levels sharing a theme get their own layout from this seed (the wrapped
  // level index).
  backgroundVariant: number;
  grid: ReadonlyArray<ReadonlyArray<BrickCell | null>>;
  paddle: PaddleRenderState;
  balls: readonly Ball[];
  drops: readonly Drop[];
  shots: readonly Shot[];
  flashes: readonly BrickFlash[];
  pops: readonly CatchPop[];
  particles: readonly Particle[];
  detonation: Detonation;
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

    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    view.grid.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (cell) {
          this.drawBrick(left + columnIndex * brickWidth, top + rowIndex * brickHeight, cell);
        }
      });
    });

    for (const flash of view.flashes) {
      this.pixel(flash.x + 1, flash.y + 1, 28, 10, FLASH_COLORS[flash.kind]);
    }
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
    if (view.energyWallArmed) {
      this.pixel(gameConfig.field.left, gameConfig.powerUps.wallY, 366, 2, canvasPalette.energyWall);
    }
    for (const drop of view.drops) {
      if (drop.active) {
        this.drawDrop(drop);
      }
    }
    for (const shot of view.shots) {
      if (shot.active) {
        this.spritePixel(shot.x, shot.y, 2, 9, canvasPalette.laserShot);
      }
    }
    this.drawPaddle(view.paddle);
    for (const ball of view.balls) {
      if (ball.active) {
        this.drawBall(ball);
      }
    }

    for (const pop of view.pops) {
      this.drawPop(pop);
    }

    this.drawDetonation(view.detonation);

    this.drawWalls();
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

  private drawBrick(x: number, y: number, cell: BrickCell): void {
    const colors = BRICK_COLORS[cell.kind];
    const flat = cell.hurt ? colors.dark : colors.flat;
    const sheen = cell.hurt ? colors.flat : colors.light;

    this.pixel(x + 1, y + 1, 28, 10, flat);
    this.pixel(x + 2, y + 1, 26, 1, sheen);
    this.pixel(x + 1, y + 2, 1, 8, sheen);
    this.pixel(x + 2, y + 10, 26, 1, colors.dark);
    this.pixel(x + 28, y + 2, 1, 8, colors.dark);
  }

  private drawPaddle(paddle: PaddleRenderState): void {
    const x = paddle.x;
    const y = gameConfig.paddle.y;
    const width = paddle.width;
    const height = gameConfig.paddle.height;

    this.spritePixel(x + 1, y, width - 2, height, canvasPalette.paddleBody);
    this.spritePixel(x, y + 1, width, height - 2, canvasPalette.paddleBody);
    this.spritePixel(x + 1, y, 7, 1, canvasPalette.paddleCap);
    this.spritePixel(x, y + 1, 8, height - 2, canvasPalette.paddleCap);
    this.spritePixel(x + 1, y + height - 1, 7, 1, canvasPalette.paddleCap);
    this.spritePixel(x + width - 8, y, 7, 1, canvasPalette.paddleCap);
    this.spritePixel(x + width - 8, y + 1, 8, height - 2, canvasPalette.paddleCap);
    this.spritePixel(x + width - 8, y + height - 1, 7, 1, canvasPalette.paddleCap);
    this.spritePixel(x + 9, y + 1, width - 18, 1, canvasPalette.paddleTopSheen);
    this.spritePixel(x + 9, y + height - 1, width - 18, 1, canvasPalette.paddleBottomShade);

    if (paddle.laserActive) {
      this.spritePixel(x + 5, y - 3, 2, 3, canvasPalette.laserCannon);
      this.spritePixel(x + width - 7, y - 3, 2, 3, canvasPalette.laserCannon);
    }
  }

  private drawBall(ball: Ball): void {
    const { x, y } = ball;

    BALL_PIXEL_ROWS.forEach(([offset, span], rowIndex) => {
      this.spritePixel(x + offset, y + rowIndex, span, 1, canvasPalette.ballBody);
    });
    this.spritePixel(x + 2, y + 1, 2, 1, canvasPalette.ballHighlight);
    this.spritePixel(x + 1, y + 2, 1, 2, canvasPalette.ballHighlight);
    this.spritePixel(x + 3, y + 6, 3, 1, canvasPalette.ballShade);
    this.spritePixel(x + 6, y + 4, 1, 2, canvasPalette.ballShade);
  }

  private drawDrop(drop: Drop): void {
    const { x, y } = drop;
    const color = DROP_COLORS[drop.kind];

    this.spritePixel(x + 1, y, 18, 8, color);
    this.spritePixel(x, y + 1, 20, 6, color);
    this.spritePixel(x + 2, y + 1, 16, 1, canvasPalette.dropSheen);
    this.spritePixel(x + 2, y + 7, 16, 1, canvasPalette.dropShade);

    // The JAMMER trap telegraphs itself with a blinking letter.
    if (drop.kind === "J" && (this.frameCount & 8) !== 0) {
      return;
    }

    // The glyph, not the id: two-character ids exist and draw one size down.
    const glyph = POWER_UP_GLYPHS[drop.kind];
    this.ctx.fillStyle = DARK_LETTER_DROP_KINDS.has(drop.kind)
      ? canvasPalette.dropLetterDark
      : canvasPalette.dropLetterLight;
    this.ctx.font = dropGlyphFont(glyph);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(glyph, Math.round((x + 10) * SCALE), Math.round((y + 4.5) * SCALE));
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
