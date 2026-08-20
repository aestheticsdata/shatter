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
  // HOMING: the grid cell this ball is curving toward, and the countdown to
  // re-picking it. `homingRow < 0` is "no lock", and it is also the whole
  // condition for drawing the corner marks — so whatever ends the steering has
  // to clear it, or the marks outlive the capsule.
  homingRow = -1;
  homingColumn = -1;
  homingRetargetIn = 0;
  // PORTAL: ticks before this ball may take another wormhole. Per ball, so a
  // swarm crossing together does not share one gate.
  portalCooldown = 0;
  // MULTI/SWARM: ticks left of this ball's birth, 0 for a ball that was always
  // here. Purely how the ball is drawn — a clone collides at full 8 px from the
  // frame it is stamped, and the mask is always smaller than that.
  birthTicksLeft = 0;
  // GHOST: this ball is passing through the wall. The capsule's timer arms it;
  // the flag is what ends it, because a ball still inside a brick when the
  // timer runs out has to finish its pass — turning solid in there would bounce
  // it out of the middle of the grid, or wedge it.
  phasing = false;

  clearHoming(): void {
    this.homingRow = -1;
    this.homingColumn = -1;
    this.homingRetargetIn = 0;
  }

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

  // `birthTicks` is the caller's: the same growth curve read over 6 ticks for
  // MULTI's three balls and over 10 for SWARM's twelve, which is how long each
  // fan takes to spread wider than the sprite it is drawn at.
  cloneFrom(source: Ball, angleRad: number, speed: number, birthTicks: number): void {
    this.active = true;
    this.stuckOffsetX = null;
    // A clone picks its own target on its first steered tick; inheriting the
    // source's would send every MULTI ball at one brick.
    this.clearHoming();
    this.portalCooldown = 0;
    this.birthTicksLeft = birthTicks;
    this.phasing = false;
    this.x = source.x;
    this.y = source.y;
    this.velocity = {
      x: Math.sin(angleRad) * speed,
      y: -Math.abs(Math.cos(angleRad) * speed),
    };
  }
}
