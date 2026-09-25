import { gameConfig } from "@core/config/GameConfig";

import type { Paddle } from "@entities/paddle/Paddle";
import type { Vector2D } from "@interfaces/types";

/**
 * The diameter a ball has at a given point in GIANT's swell.
 *
 * **Even, always.** An odd diameter puts the sprite's centre on a pixel
 * boundary and every row half a pixel off-centre, which reads as a ball
 * wobbling as it grows rather than growing — see `ballRows` in
 * `@render/ballSprite`, which is drawn from this.
 *
 * The blend and not the timer, so the ball is as big as it looks on every tick
 * of both ends: the collision the player sees is the collision they get.
 */
export function ballSizeFor(blend: number): number {
  const { size } = gameConfig.ball;
  const grown = size * (1 + (gameConfig.powerUps.giant.scale - 1) * blend);
  return Math.round(grown / 2) * 2;
}

export class Ball {
  x = 0;
  y = 0;
  velocity: Vector2D = { x: 0, y: 0 };
  active = false;
  // GIANT: how wide this ball is right now, which is `gameConfig.ball.size`
  // for every ball on every tick the capsule is not live. On the ball rather
  // than read globally because the geometry that needs it is the ball's own —
  // `centerX`, the deck it parks on, the box the grid tests — and threading a
  // size through all of them says less than a ball knowing how big it is.
  size: number = gameConfig.ball.size;
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
  // UMBRA: ticks before this ball may charge another shadow. Per ball for the
  // cooldown above's reason, and it exists for a different one: one contact is
  // several sub-steps of overlap, and a ball that grazed a wedge would take
  // four hit points off the brick for it without this.
  umbraCooldown = 0;
  // WORMHOLE: ticks before this ball may be swallowed again, so the frame it
  // leaves the exit on cannot hand it straight back.
  wormholeCooldown = 0;
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
  // PYRE: this ball's flame crown, in ticks, 0 for a ball wearing none. It runs
  // up to `crownTicks + smokeTicks` and back down, and the two bands are the
  // two halves of the picture: the top one is fire and the bottom one is smoke,
  // so a crown lighting comes up through a wisp and a crown going out falls
  // back into one. Above the top of the range on purpose while the capsule is
  // expiring — see `gutterStaggerTicks`, which is how the crowns are made to go
  // out one at a time off this same counter.
  pyreCrown = 0;
  // ENGLISH: radians this ball's heading turns per tick, signed — the shot the
  // deck put on it, not a property of the capsule. It outlives the timer on
  // purpose and simply decays away, so a ball still curving when the forty
  // seconds run out straightens out instead of snapping level.
  spin = 0;
  // ENGLISH's cue, and a real quantity rather than an animation clock: the
  // total heading this ball's spin has actually turned it through. The flecks
  // orbit on it, so they go round the way the ball is bending and slow as the
  // spin decays without a second number that could disagree with the first.
  spinPhase = 0;

  clearHoming(): void {
    this.homingRow = -1;
    this.homingColumn = -1;
    this.homingRetargetIn = 0;
    this.homingMarkTicks = 0;
  }

  get centerX(): number {
    return this.x + this.size / 2;
  }

  followPaddle(paddle: Paddle): void {
    this.x = paddle.centerX - this.size / 2;
    this.y = paddle.y - this.size - 1;
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
    // A clone is a new ball off a split, not a ball the deck hit: it carries no
    // english. Inheriting it would send a whole MULTI fan round the same bend.
    this.spin = 0;
    this.spinPhase = 0;
    this.portalCooldown = 0;
    // A recycled slot may still be carrying the crown of the ball that was in
    // it: `topUpBalls` clones into whatever is free, and a PYRE ball burned a
    // moment ago is exactly the free slot the next MULTI reaches for.
    this.pyreCrown = 0;
    this.birthTicksLeft = birthTicks;
    this.phasing = false;
    this.tempoDebt = 0;
    // A clone is born the size the field is running at, not the 8 px a fresh
    // ball starts on: a MULTI fan thrown under a live GIANT is three big balls,
    // and one that had to grow into it would spend its first ticks colliding
    // smaller than it looks.
    this.size = source.size;
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
  const size = ball.size;
  if (x < left || x > right - size || y < top || y > height - size) {
    return null;
  }
  return { x, y };
}
