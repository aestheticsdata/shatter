import { gameConfig } from "@core/config/GameConfig";

import type { Paddle } from "@entities/paddle/Paddle";
import type { Vector2D } from "@interfaces/types";

export class Ball {
  x = 0;
  y = 0;
  velocity: Vector2D = { x: 0, y: 0 };
  active = false;
  // GLUE: offset from the paddle's left edge while stuck to it, null in flight.
  stuckOffsetX: number | null = null;

  get centerX(): number {
    return this.x + gameConfig.ball.size / 2;
  }

  followPaddle(paddle: Paddle): void {
    this.x = paddle.centerX - gameConfig.ball.size / 2;
    this.y = gameConfig.paddle.y - gameConfig.ball.size - 1;
  }

  launch(speed: number): void {
    const { horizontalFactor, verticalFactor } = gameConfig.launch;
    this.velocity = {
      x: (Math.random() < 0.5 ? -1 : 1) * speed * horizontalFactor,
      y: -speed * verticalFactor,
    };
  }

  cloneFrom(source: Ball, angleRad: number, speed: number): void {
    this.active = true;
    this.stuckOffsetX = null;
    this.x = source.x;
    this.y = source.y;
    this.velocity = {
      x: Math.sin(angleRad) * speed,
      y: -Math.abs(Math.cos(angleRad) * speed),
    };
  }
}
