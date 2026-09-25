import { gameConfig } from "@core/config/GameConfig";

import type { Ball } from "@entities/ball/Ball";

/**
 * One block of track: where it stands, how big, and where it is in its life.
 *
 * `chain` is the index of the ball that laid it and `order` its place along
 * that ball's line, which is all the reel needs to walk a line back toward the
 * ball that laid it.
 */
export interface Stamp {
  x: number;
  y: number;
  size: number;
  chain: number;
  order: number;
  // Ticks since it was laid. Under `setTicks` it is still congealing and is
  // only a picture.
  age: number;
  // Whether a ball can hit it. Set once, on the first tick it is both old
  // enough and clear of every ball — a block may not close around the ball
  // that laid it.
  solid: boolean;
  // The reel: the tick it starts sliding toward the block ahead of it, where
  // that block stood, and how far into the slide it is. -1 while it is simply
  // standing.
  leaveAt: number;
  towardX: number;
  towardY: number;
  sliding: number;
}

/**
 * RIBBON (SHA-139): every ball lays solid track behind it.
 *
 * **Discrete stamps, not a rail.** Every `spacing` pixels of *travel* — a
 * distance and not a tick count, so TEMPO, RUSH, TURBO and a level-nine ball
 * all lay the same line — the ball leaves one square block. The spacing is just
 * under four ball-widths, so a fresh tail is a dotted line and not a wall: the
 * mesh only closes where the player has doubled back across their own path,
 * which is Snake's rule and what keeps the first seconds fair.
 *
 * Nothing is stored on the ball. What a ball has travelled since its last block
 * lives here, indexed by its slot in the game's pool, so the capsule ending
 * leaves nothing on the ball to unwind. A ball that drains simply stops laying,
 * and its line stays where it was put.
 */
export class Ribbon {
  readonly stamps: Stamp[] = [];
  // Per ball slot: distance since the last block, where it was last tick, and
  // how many blocks its line has. NaN for a slot with no position yet.
  private readonly travelled: number[] = [];
  private readonly lastX: number[] = [];
  private readonly lastY: number[] = [];
  private readonly laid: number[] = [];
  private laying = false;
  // Whether the next tick lays a block under every ball whatever it has
  // travelled — the catch frame's.
  private primed = false;
  // Ticks into the reel, or -1 while the track is simply standing.
  private reelFor = -1;

  get active(): boolean {
    return this.laying || this.stamps.length > 0;
  }

  get reeling(): boolean {
    return this.reelFor >= 0;
  }

  /**
   * The catch, or a second one over a live track: start laying, and lay the
   * first block now. A reel already under way is called off — the line is
   * wanted again, and whatever is still standing stands.
   *
   * The first block goes down on the catch frame rather than a spacing later:
   * the exhaust setting behind the ball *is* the arrival, and a capsule that
   * did nothing for the first thirty pixels would read as a dud.
   */
  start(): void {
    this.laying = true;
    this.reelFor = -1;
    for (const stamp of this.stamps) {
      stamp.leaveAt = -1;
      stamp.sliding = 0;
    }
    this.primed = true;
  }

  /**
   * The timer is running out: reel the track in.
   *
   * Every line is walked from its oldest block toward its newest, each block
   * jumping onto the one ahead of it and vanishing there, so the line visibly
   * shortens toward the ball like a fuse burning the wrong way. The oldest
   * blocks are the outside of whatever cage the player built, so a ball still
   * boxed in is freed from the outside in rather than having the walls blink
   * off around it. All the lines finish together, on the tick the capsule ends.
   */
  release(): void {
    if (this.reelFor >= 0) {
      return;
    }
    this.laying = false;
    this.reelFor = 0;
    const { reelTicks, slideTicks } = gameConfig.powerUps.ribbon;
    const span = reelTicks - slideTicks;
    const chains = new Map<number, Stamp[]>();
    for (const stamp of this.stamps) {
      const line = chains.get(stamp.chain) ?? [];
      line.push(stamp);
      chains.set(stamp.chain, line);
    }
    for (const line of chains.values()) {
      line.sort((a, b) => a.order - b.order);
      line.forEach((stamp, index) => {
        const ahead = line[index + 1] ?? stamp;
        stamp.leaveAt = Math.floor((index / line.length) * span);
        stamp.towardX = ahead.x + (ahead.size - stamp.size) / 2;
        stamp.towardY = ahead.y + (ahead.size - stamp.size) / 2;
      });
    }
  }

  /**
   * One tick: lay, set and reel.
   *
   * `blocked` is whether a point is inside something a block may not be laid
   * in — a live brick, today. A ball drilling through the wall under PIERCE
   * lays nothing inside it.
   */
  step(balls: readonly Ball[], blocked: (x: number, y: number) => boolean): void {
    if (this.laying) {
      this.lay(balls, blocked);
    }
    const { setTicks } = gameConfig.powerUps.ribbon;
    for (const stamp of this.stamps) {
      stamp.age++;
      if (!stamp.solid && stamp.age >= setTicks && stamp.leaveAt < 0 && !balls.some((ball) => touches(stamp, ball))) {
        stamp.solid = true;
      }
    }
    if (this.reelFor < 0) {
      return;
    }
    const { slideTicks } = gameConfig.powerUps.ribbon;
    for (let index = this.stamps.length - 1; index >= 0; index--) {
      const stamp = this.stamps[index];
      if (this.reelFor < stamp.leaveAt) {
        continue;
      }
      // Off the collision the tick it starts moving: a block on its way to the
      // next one is the line shortening, not a wall.
      stamp.solid = false;
      stamp.sliding++;
      if (stamp.sliding > slideTicks) {
        this.stamps.splice(index, 1);
      }
    }
    this.reelFor++;
    if (this.stamps.length === 0) {
      this.reelFor = -1;
    }
  }

  /**
   * The solid block a ball's box is inside, or null. Tested per axis by the
   * caller exactly as a brick is, so SNAP, ENGLISH and every other thing that
   * reads a rebound off the sub-step reads this one too.
   */
  overlap(x: number, y: number, size: number): Stamp | null {
    for (const stamp of this.stamps) {
      if (
        stamp.solid &&
        x < stamp.x + stamp.size &&
        x + size > stamp.x &&
        y < stamp.y + stamp.size &&
        y + size > stamp.y
      ) {
        return stamp;
      }
    }
    return null;
  }

  /**
   * A LASER bolt's box against the track: the solid block it is in, taken off
   * the field. The only way to open a lane the player has shut.
   */
  vaporize(x: number, y: number, width: number, height: number): Stamp | null {
    const index = this.stamps.findIndex(
      (stamp) =>
        stamp.solid &&
        x < stamp.x + stamp.size &&
        x + width > stamp.x &&
        y < stamp.y + stamp.size &&
        y + height > stamp.y,
    );
    if (index < 0) {
      return null;
    }
    const [stamp] = this.stamps.splice(index, 1);
    return stamp;
  }

  reset(): void {
    this.stamps.length = 0;
    this.travelled.length = 0;
    this.lastX.length = 0;
    this.lastY.length = 0;
    this.laid.length = 0;
    this.laying = false;
    this.primed = false;
    this.reelFor = -1;
  }

  private lay(balls: readonly Ball[], blocked: (x: number, y: number) => boolean): void {
    const { spacing, block, floorY, maxStamps, jumpLimit } = gameConfig.powerUps.ribbon;
    const { left, right, top } = gameConfig.field;
    const primed = this.primed;
    this.primed = false;
    balls.forEach((ball, slot) => {
      if (!ball.active) {
        this.lastX[slot] = Number.NaN;
        return;
      }
      const centerX = ball.centerX;
      const centerY = ball.y + ball.size / 2;
      const was = this.lastX[slot];
      this.lastX[slot] = centerX;
      const moved = Number.isNaN(was ?? Number.NaN) ? 0 : Math.hypot(centerX - was, centerY - this.lastY[slot]);
      this.lastY[slot] = centerY;
      // A PORTAL transit or a LEAP is a teleport, not travel: a block laid on
      // the far side of one would string track across the wrap.
      if (moved > jumpLimit) {
        return;
      }
      this.travelled[slot] = (this.travelled[slot] ?? 0) + moved;
      if (this.travelled[slot] < spacing && !primed) {
        return;
      }
      this.travelled[slot] = 0;
      // A GIANT ball lays a slab its own width.
      const size = Math.max(block, ball.size);
      const x = Math.round(centerX - size / 2);
      const y = Math.round(centerY - size / 2);
      // Nothing below the floor — the air over the deck stays clear, so the
      // trap can never block the player's own catch — nothing outside the
      // frame, and nothing inside the wall.
      if (y + size > floorY || y < top || x < left || x + size > right || blocked(centerX, centerY)) {
        return;
      }
      if (this.stamps.length >= maxStamps) {
        return;
      }
      const order = this.laid[slot] ?? 0;
      this.laid[slot] = order + 1;
      this.stamps.push({
        x,
        y,
        size,
        chain: slot,
        order,
        age: 0,
        solid: false,
        leaveAt: -1,
        towardX: x,
        towardY: y,
        sliding: 0,
      });
    });
  }
}

function touches(stamp: Stamp, ball: Ball): boolean {
  return (
    ball.active &&
    ball.x < stamp.x + stamp.size &&
    ball.x + ball.size > stamp.x &&
    ball.y < stamp.y + stamp.size &&
    ball.y + ball.size > stamp.y
  );
}
