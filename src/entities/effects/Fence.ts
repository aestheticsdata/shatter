import { BRICK_BY_ID } from "@core/config/bricks";
import { gameConfig } from "@core/config/GameConfig";

import type { BrickCell } from "@interfaces/types";

// One post that has just finished arriving or leaving, for the dust and the
// debris the game throws at it. A column and nothing else: the fence is one
// row, so the column names the post.
export type FenceEvent = number;

/**
 * FENCE: six posts driven into the field a short hop over the deck.
 *
 * **The posts are wall cells, and they are not the wall.** That sentence is the
 * whole design, and the split falls out of where the two halves of `BrickGrid`
 * are read from. Everything that finds a brick by *pixel* — the ball, a laser
 * bolt, a meteor — goes through `cellAt`, and the fence answers there, so it
 * bounces, it breaks, it takes BLAST's splash and CHAIN's arcs and GRAVEL's
 * chips with no new branch anywhere. Everything that walks the wall by *index*
 * reads `grid.rows`, and the fence is not in it, so PAYDAY's gild front, XRAY's
 * scan span, HOMING's targets, ZAP's bottom row, the critter's first row and
 * `remaining` all go on meaning the wall exactly as they did.
 *
 * That is also why this is not six cells padded into the grid array, which was
 * the obvious build and is the expensive one: `grid.rows.length` is read in
 * eight places as *how far down the field the wall reaches*, and nine empty
 * rows would move BUMPERS' band, METEOR's floor, HOMING's cutoff and the gild
 * front on every level in the game to plant six bricks.
 *
 * **Row 16 is the one number not to shave.** `cellAt` divides by the brick
 * height, so a fence has to sit on a real grid row or none of the wall's
 * collision applies to it; 16 puts the posts at y 230-242 and leaves 34 px of
 * air over the rail at 276. Row 17 reads better at 22 px and GIANT's ball is
 * 24 — it would wedge under its own fence, which is the one failure a trap may
 * not have.
 */
export class Fence {
  // The post in each column, or null where there is none — indexed by column so
  // the grid's lookup is one array read. A cell and not a flag: it carries the
  // hit point the ball takes off and the kind the debris is cut from.
  private posts: Array<BrickCell | null> = Array.from({ length: gameConfig.grid.columns }, () => null);
  // Ticks since each post was last driven, or -1 for a column with no post.
  // Per column rather than one clock for the fence, because a second FENCE
  // caught over a live one re-drives only the posts that are gone: what the
  // player smashed a hole in gets filled back in, and what is still standing is
  // not disturbed.
  private drivenFor: number[] = Array.from({ length: gameConfig.grid.columns }, () => -1);
  // Which of the two alternating column sets is planted, or -1 when nothing is.
  // Held so a top-up repairs the fence it finds rather than interleaving a
  // second one into its gaps — twelve posts in a row is a wall, and the gaps
  // are the capsule.
  private phase = -1;
  // Ticks into the extraction, or -1 while the fence is simply standing.
  private pullingFor = -1;

  get standing(): boolean {
    return this.phase >= 0;
  }

  get row(): number {
    return gameConfig.powerUps.fence.row;
  }

  /**
   * Plant a fence, or repair the one already up.
   *
   * The phase is rolled on the catch, so the two FENCEs a player meets in one
   * level do not stand in the same columns and there is no learned answer for
   * where the gaps are. A top-up keeps the phase it found for the reason above.
   */
  plant(): void {
    const { columns } = gameConfig.grid;
    const { posts } = gameConfig.powerUps.fence;
    if (this.phase < 0) {
      this.phase = Math.random() < 0.5 ? 0 : 1;
    }
    // An extraction in flight is called off: the capsule has been caught again,
    // and posts already on their way out of the ground go back into it.
    this.pullingFor = -1;
    const stride = columns / posts;
    // Counted over the posts this catch actually drives, not over all six: a
    // repair of the one post in the middle starts on the tick it was caught
    // rather than waiting out the stagger of five posts that are already up.
    let driving = 0;
    for (let index = 0; index < posts; index++) {
      const column = this.phase + index * stride;
      if (this.posts[column] !== null) {
        continue;
      }
      this.posts[column] = {
        kind: "F",
        hitPoints: BRICK_BY_ID.F.hitPoints,
        points: BRICK_BY_ID.F.points,
        // Its column, once. Nothing reads it — the post has no grain to hash —
        // but a cell without one is a cell the next thing to touch `BrickCell`
        // has to special-case.
        seed: column,
        // **No capsule, ever.** A trap may not be a points pinata and it may not
        // be a bonus dispenser either; XRAY correctly shows the posts holding
        // nothing.
        capsule: null,
        seeded: false,
      };
      // Staggered left to right across the six, so the player watches a fence go
      // up across their own half of the field rather than having one appear.
      this.drivenFor[column] = -driving * gameConfig.powerUps.fence.driveStaggerTicks;
      driving++;
    }
  }

  /**
   * The capsule is ending: pull the posts, outside in.
   *
   * Armed off the timer's own remaining ticks rather than off its expiry, which
   * is SLUMP's and JELLY's pattern exactly — an extraction that started on the
   * tick the fence stopped existing would be an extraction nobody sees. The two
   * ends are deliberately opposite motions: driven downward in sequence to
   * arrive, pulled upward from the ends to leave.
   */
  release(): void {
    if (this.phase >= 0 && this.pullingFor < 0) {
      this.pullingFor = 0;
    }
  }

  /**
   * One tick. `seated` collects the posts that finished arriving this tick and
   * `pulled` the ones that finished leaving — the game throws the dust and the
   * debris, because the fence owns where its posts are and never what a puff of
   * dust costs.
   *
   * Both arrays are the caller's and are appended to, the way `Slump.step`
   * takes its landings: this runs every tick of a 10-second capsule and has no
   * business allocating.
   */
  step(seated: FenceEvent[], pulled: FenceEvent[]): void {
    if (this.phase < 0) {
      return;
    }
    const { driveTicks } = gameConfig.powerUps.fence;
    for (let column = 0; column < this.posts.length; column++) {
      const ticks = this.drivenFor[column];
      // One clock per post, and its wait in the stagger is the negative half of
      // it: a post counts up from `-index * stagger` and is only on the field
      // from zero — see `depthAt`.
      if (this.posts[column] === null || ticks >= driveTicks) {
        continue;
      }
      this.drivenFor[column] = ticks + 1;
      if (ticks + 1 === driveTicks) {
        seated.push(column);
      }
    }

    if (this.pullingFor < 0) {
      return;
    }
    const before = this.pullingFor;
    this.pullingFor = before + 1;
    for (let column = 0; column < this.posts.length; column++) {
      if (this.posts[column] === null) {
        continue;
      }
      const done = this.pullStartFor(column) + gameConfig.powerUps.fence.pullTicks;
      if (before < done && this.pullingFor >= done) {
        this.posts[column] = null;
        this.drivenFor[column] = -1;
        pulled.push(column);
      }
    }
    if (this.pullingFor >= this.pullSpan()) {
      this.reset();
    }
  }

  // The post in a column, or null. The grid's whole question.
  cellAt(column: number): BrickCell | null {
    return this.posts[column] ?? null;
  }

  /**
   * How far the post's top edge has moved off its own cell, in pixels —
   * negative while it is being pulled, 0 otherwise.
   *
   * The hitbox reads this beside `depthAt`, so a post on its way out of the
   * ground is collided exactly where it is drawn. A ball that catches one
   * mid-extraction breaks it, which is right: the post is still a surface until
   * it is not there.
   */
  riseAt(column: number): number {
    if (this.pullingFor < 0 || this.posts[column] === null) {
      return 0;
    }
    const { pullTicks, pullRise } = gameConfig.powerUps.fence;
    const progress = (this.pullingFor - this.pullStartFor(column)) / pullTicks;
    return -Math.round(Math.max(0, Math.min(1, progress)) * pullRise);
  }

  /**
   * How much of the post is actually in the ground, in pixels down from its top
   * edge: a sliver on the tick it starts and the brick's full height once it is
   * seated.
   *
   * This is the telescope, and it is the hitbox as well as the sprite. A post
   * two pixels out of the ground stops two pixels of ball.
   */
  depthAt(column: number): number {
    const { brickHeight } = gameConfig.grid;
    const { driveTicks } = gameConfig.powerUps.fence;
    const ticks = this.drivenFor[column];
    if (this.posts[column] === null || ticks < 0) {
      return 0;
    }
    if (ticks >= driveTicks) {
      return brickHeight;
    }
    // At least one, so the tick a post starts is a tick it is on the field: a
    // zero-height post would be a frame of a brick that is not there yet and a
    // hitbox that agrees with it, which is a hole in the fence for one tick.
    return Math.max(1, Math.round((ticks / driveTicks) * brickHeight));
  }

  remove(column: number): void {
    this.posts[column] = null;
    this.drivenFor[column] = -1;
  }

  reset(): void {
    this.posts.fill(null);
    this.drivenFor.fill(-1);
    this.phase = -1;
    this.pullingFor = -1;
  }

  // Outside in: the two end posts leave first and the middle pair last, so the
  // fence opens from its ends rather than dissolving. Distance from whichever
  // end is nearer, in pairs.
  private pullStartFor(column: number): number {
    const { posts, pullStaggerTicks } = gameConfig.powerUps.fence;
    const { columns } = gameConfig.grid;
    const index = Math.round((column - this.phase) / (columns / posts));
    return Math.min(index, posts - 1 - index) * pullStaggerTicks;
  }

  private pullSpan(): number {
    const { posts, pullTicks, pullStaggerTicks } = gameConfig.powerUps.fence;
    return (Math.ceil(posts / 2) - 1) * pullStaggerTicks + pullTicks;
  }
}
