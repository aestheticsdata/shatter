import { gameConfig } from "@core/config/GameConfig";
import { BRICK_COLORS, canvasPalette, DARK_LETTER_DROP_KINDS, DROP_COLORS } from "@render/palette";

import type { Ball } from "@entities/ball/Ball";
import type { Shot } from "@entities/laser/ShotPool";
import type { Drop } from "@entities/powerups/DropPool";
import type { BrickCell, SplashFlash } from "@interfaces/types";

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

const STAR_COUNT = 58;

export interface PaddleRenderState {
  x: number;
  width: number;
  laserActive: boolean;
}

export interface RenderView {
  grid: ReadonlyArray<ReadonlyArray<BrickCell | null>>;
  paddle: PaddleRenderState;
  balls: readonly Ball[];
  drops: readonly Drop[];
  shots: readonly Shot[];
  flashes: readonly SplashFlash[];
  energyWallArmed: boolean;
}

interface Star {
  x: number;
  y: number;
  color: string;
}

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: Star[];
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context unavailable");
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    const { width, height } = gameConfig.field;
    this.stars = Array.from({ length: STAR_COUNT }, (_, index) => ({
      x: 4 + Math.floor(Math.random() * (width - 8)),
      y: 4 + Math.floor(Math.random() * (height - 8)),
      color: canvasPalette.starColors[index % canvasPalette.starColors.length],
    }));
  }

  draw(view: RenderView): void {
    this.frameCount++;
    const { width, height } = gameConfig.field;
    this.ctx.fillStyle = canvasPalette.fieldBackground;
    this.ctx.fillRect(0, 0, width, height);

    for (const star of this.stars) {
      this.pixel(star.x, star.y, 1, 1, star.color);
    }

    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    view.grid.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (cell) {
          this.drawBrick(left + columnIndex * brickWidth, top + rowIndex * brickHeight, cell);
        }
      });
    });

    for (const flash of view.flashes) {
      this.pixel(flash.x + 1, flash.y + 1, 28, 10, canvasPalette.blastFlash);
    }
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
        this.pixel(shot.x, shot.y, 2, 9, canvasPalette.laserShot);
      }
    }
    this.drawPaddle(view.paddle);
    for (const ball of view.balls) {
      if (ball.active) {
        this.drawBall(ball);
      }
    }

    this.drawWalls();
  }

  private pixel(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), width, height);
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
    const x = Math.round(paddle.x);
    const y = gameConfig.paddle.y;
    const width = paddle.width;
    const height = gameConfig.paddle.height;

    this.pixel(x + 1, y, width - 2, height, canvasPalette.paddleBody);
    this.pixel(x, y + 1, width, height - 2, canvasPalette.paddleBody);
    this.pixel(x + 1, y, 7, 1, canvasPalette.paddleCap);
    this.pixel(x, y + 1, 8, height - 2, canvasPalette.paddleCap);
    this.pixel(x + 1, y + height - 1, 7, 1, canvasPalette.paddleCap);
    this.pixel(x + width - 8, y, 7, 1, canvasPalette.paddleCap);
    this.pixel(x + width - 8, y + 1, 8, height - 2, canvasPalette.paddleCap);
    this.pixel(x + width - 8, y + height - 1, 7, 1, canvasPalette.paddleCap);
    this.pixel(x + 9, y + 1, width - 18, 1, canvasPalette.paddleTopSheen);
    this.pixel(x + 9, y + height - 1, width - 18, 1, canvasPalette.paddleBottomShade);

    if (paddle.laserActive) {
      this.pixel(x + 5, y - 3, 2, 3, canvasPalette.laserCannon);
      this.pixel(x + width - 7, y - 3, 2, 3, canvasPalette.laserCannon);
    }
  }

  private drawBall(ball: Ball): void {
    const x = Math.round(ball.x);
    const y = Math.round(ball.y);

    BALL_PIXEL_ROWS.forEach(([offset, span], rowIndex) => {
      this.pixel(x + offset, y + rowIndex, span, 1, canvasPalette.ballBody);
    });
    this.pixel(x + 2, y + 1, 2, 1, canvasPalette.ballHighlight);
    this.pixel(x + 1, y + 2, 1, 2, canvasPalette.ballHighlight);
    this.pixel(x + 3, y + 6, 3, 1, canvasPalette.ballShade);
    this.pixel(x + 6, y + 4, 1, 2, canvasPalette.ballShade);
  }

  private drawDrop(drop: Drop): void {
    const x = Math.round(drop.x);
    const y = Math.round(drop.y);
    const color = DROP_COLORS[drop.kind];

    this.pixel(x + 1, y, 18, 8, color);
    this.pixel(x, y + 1, 20, 6, color);
    this.pixel(x + 2, y + 1, 16, 1, canvasPalette.dropSheen);
    this.pixel(x + 2, y + 7, 16, 1, canvasPalette.dropShade);

    // The JAMMER trap telegraphs itself with a blinking letter.
    if (drop.kind === "J" && (this.frameCount & 8) !== 0) {
      return;
    }

    this.ctx.fillStyle = DARK_LETTER_DROP_KINDS.has(drop.kind)
      ? canvasPalette.dropLetterDark
      : canvasPalette.dropLetterLight;
    this.ctx.font = "7px Silkscreen, monospace";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(drop.kind, x + 10, y + 4.5);
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
