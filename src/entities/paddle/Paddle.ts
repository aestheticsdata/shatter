import { gameConfig } from "@core/config/GameConfig";

import type { RectangleBounds } from "@interfaces/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Paddle {
  x: number = gameConfig.paddle.initialX;
  width: number = gameConfig.paddle.baseWidth;

  get centerX(): number {
    return this.x + this.width / 2;
  }

  get bounds(): RectangleBounds {
    return {
      left: this.x,
      right: this.x + this.width,
      top: gameConfig.paddle.y,
      bottom: gameConfig.paddle.y + gameConfig.paddle.height,
    };
  }

  setWidth(width: number): void {
    this.width = width;
    this.clampX();
  }

  moveCenterTo(fieldX: number): void {
    this.x = fieldX - this.width / 2;
    this.clampX();
  }

  moveByDelta(deltaX: number): void {
    this.x += deltaX;
    this.clampX();
  }

  private clampX(): void {
    this.x = clamp(this.x, gameConfig.field.left, gameConfig.field.right - this.width);
  }
}
