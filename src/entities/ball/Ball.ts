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
  // HOMING's reticle, per ball because the lock is: how far through its travel
  // this ball's four corner ticks are, 0 out at `homingMarkReach` to
  // `homingRetargetTicks` sitting on the brick. It counts up while the capsule
  // is live and back down on the way out, and the lock is released when it
  // reaches 0 — a global blend cannot carry twelve balls holding twelve bricks,
  // and clearing every reticle because one ball's brick died is exactly the
  // defect the counter exists to avoid.
  homingMarkTicks = 0;
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
  // TEMPO: ticks of displacement this ball has failed to cover on the slowed
  // clock, since the last thing that changed its heading. The pace ghost is
  // this debt spent forward along the stored velocity — a projection, never a
  // second ball, because a free-flying phantom walks through bricks and walls
  // and diverges in direction the moment either of them turns the real one.
  tempoDebt = 0;

  clearHoming(): void {
    this.homingRow = -1;
    this.homingColumn = -1;
    this.homingRetargetIn = 0;
    this.homingMarkTicks = 0;
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
    this.tempoDebt = 0;
    this.x = source.x;
    this.y = source.y;
    this.velocity = {
      x: Math.sin(angleRad) * speed,
      y: -Math.abs(Math.cos(angleRad) * speed),
    };
  }
}

/**
 * Where a ball would have been by now had TEMPO not slowed its clock, or null
 * when there is nothing to mark.
 *
 * One reading, shared by the simulation and the renderer, so the marker the
 * player is looking at is the marker the debt stopped growing for. The debt is
 * scaled by the blend rather than drawn raw: at the catch that is what pulls
 * the ghost out of the ball over `tempoDriftTicks`, and at expiry it is what
 * lets the ball overtake and swallow it again over the same twelve.
 *
 * Null once the projection leaves the field. It only ever recedes — the ghost
 * lies ahead along the velocity and the ball is travelling that way — so an
 * off-field marker stays off until whatever turns the ball resets the debt.
 */
export function paceGhost(ball: Ball, blend: number): Vector2D | null {
  if (blend === 0 || ball.tempoDebt === 0 || ball.stuckOffsetX !== null) {
    return null;
  }
  const spent = ball.tempoDebt * blend;
  const x = ball.x + ball.velocity.x * spent;
  const y = ball.y + ball.velocity.y * spent;
  const { left, right, top, height } = gameConfig.field;
  const size = gameConfig.ball.size;
  if (x < left || x > right - size || y < top || y > height - size) {
    return null;
  }
  return { x, y };
}
