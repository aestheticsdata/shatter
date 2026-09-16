import { gameConfig } from "@core/config/GameConfig";

import type { Ball } from "@entities/ball/Ball";

/**
 * LEAP's tunnelling: every second or so a ball is not where it was.
 *
 * It blinks out, and reappears a short hop further along its own heading with
 * its speed and direction untouched — having crossed the gap without being
 * anywhere in between. **Nothing in the gap is hit, because the ball was never
 * in the gap**, and that is the whole cost: sometimes it skips a granite brick
 * you were dreading, mostly it skips the brick you had lined up.
 *
 * **Not PORTAL, and built on the same fact.** A transit also moves a ball
 * across the field without passing through the middle, and `stepBall` puts it
 * above the wall clamps for the reason a jump is done here, once a tick, before
 * the sub-step walk: a displacement that skipped collision *inside* the walk
 * would be a ball stepping over half a brick. The difference is what the two
 * are for — a mouth is fixed, announced by the level's geometry and worth
 * aiming for; a leap is unannounced except by its pip, goes 20-32 px, and is
 * never something you want.
 *
 * **The clocks live here and not on `Ball`.** Twelve balls exist under SWARM,
 * and state parked on a ball has to be unwound on expiry, on `resetServe`, on
 * level clear and on game over — four places, each of which is a place to
 * forget. State in the effect is dropped with the effect: `reset` empties the
 * map and there is nothing left anywhere else. The map is keyed by ball
 * identity because the pool recycles slots, and a `Map` rather than a
 * `WeakMap` because the pool is twelve objects that outlive every capsule and
 * what is wanted is `clear()`.
 *
 * Three guardrails, and `landingFor` holds all three. They are in one function
 * rather than three because the pip and the jump have to be the same answer:
 * the player is told where the ball is going and then it goes there, or the
 * held cue is decoration.
 */

/** One end of a jump: the square closing where the ball left, or opening where it arrived. */
export interface LeapFlash {
  x: number;
  y: number;
  size: number;
  ticksLeft: number;
  /** True at the landing, false at the departure — which way the square runs. */
  opening: boolean;
}

/** Where a ball's next jump would put it, and how big the pip announcing it is. */
export interface LeapLanding {
  x: number;
  y: number;
  /** The pip's half-width, in px: the reach running down shrinks it. */
  reach: number;
}

/** What the field looks like to a jump, handed in rather than reached for. */
export interface LeapField {
  /**
   * The deck's top edge — the line a jump may never cross.
   *
   * `paddle.y` and not `gameConfig.paddle.y`, for TRACER's reason: the deck
   * floats 96 px up under TIDE, and a guard measured against the rail would let
   * a jump land in water the player is standing above.
   */
  deckY: number;
  /** STASIS has the field. A held ball is not loose, so it does not jump. */
  frozen: boolean;
  /**
   * Whether a ball's box at this position is standing clear of everything
   * solid — bricks, echoes, posts, discs, shadows.
   *
   * Handed in the way `TraceRules.blocked` is, and for the same reason: what
   * counts as solid is six capsules' business and none of it is this effect's.
   */
  free: (x: number, y: number, size: number) => boolean;
}

interface Clock {
  /** Ticks until this ball's next jump. */
  nextIn: number;
  /**
   * How far that jump goes, in px, rolled *with* the clock rather than at the
   * moment it fires.
   *
   * The pip has to be able to tell the truth. A span rolled on the tick of the
   * jump would leave the cue guessing for the whole second it is up, which is
   * the one thing a held cue may not do.
   */
  span: number;
  /**
   * Where that jump lands, recomputed every tick because the ball is moving.
   *
   * **This is the pip.** The renderer reads this field and the jump spends it,
   * so "you are shown where the ball is going and then it goes there" is one
   * value rather than two calculations that agree today.
   */
  landing: LeapLanding | null;
}

export class Tunnelling {
  private readonly clocks = new Map<Ball, Clock>();
  private flashes: LeapFlash[] = [];
  private elapsed = 0;
  private duration = 0;
  private live = false;

  get active(): boolean {
    return this.live;
  }

  get marks(): readonly LeapFlash[] {
    return this.flashes;
  }

  /**
   * The catch. Every live ball starts its first clock behind the settle, so the
   * twelve ticks of flicker are always seen before the first jump.
   *
   * A second LEAP over a live one re-rolls every clock rather than topping the
   * six seconds up, which is `Decoherence.start`'s rule: a trap is allowed to
   * charge twice, and the player who caught two of these gets two of them.
   */
  start(durationTicks: number): void {
    this.elapsed = 0;
    this.duration = durationTicks;
    this.live = true;
    this.clocks.clear();
    this.flashes = [];
  }

  reset(): void {
    this.live = false;
    this.elapsed = 0;
    this.duration = 0;
    this.clocks.clear();
    this.flashes = [];
  }

  /**
   * The capsule ending on its own clock: the jumps stop and the clocks go, and
   * **the flashes of the last jump are left running.**
   *
   * They belong to a jump that really happened, and blinking them out on the
   * frame the timer noticed is the one part of this capsule a player would read
   * as a dropped frame — which is the exact thing the pip exists to stop it
   * looking like. `reset` is the hard version, for a life lost or a level
   * cleared, where there is no frame left to finish.
   */
  retire(): void {
    const marks = this.flashes;
    this.reset();
    this.flashes = marks;
  }

  /**
   * How much reach the capsule has left, 1 through its body and running to 0
   * over the last three seconds.
   *
   * Every span is scaled by it and so is the pip that announces one, so the
   * last jumps are visibly shorter and the cue shrinks with them. The capsule
   * runs out of reach in front of the player rather than switching off between
   * one jump and the next.
   */
  get reach(): number {
    if (!this.live) {
      return 0;
    }
    const { runDownTicks } = gameConfig.powerUps.leap;
    return Math.min(1, Math.max(0, (this.duration - this.elapsed) / runDownTicks));
  }

  /**
   * How far through the arrival's flicker the capsule is, 1 at the catch to 0
   * once the first jump is due.
   *
   * **Drawn and never simulated.** A ball genuinely shaken a pixel either way
   * is a ball that can be shaken into a brick; the picture of the machine
   * losing its grip costs nothing and says the same thing.
   */
  get settling(): number {
    const { settleTicks } = gameConfig.powerUps.leap;
    if (!this.live || this.elapsed >= settleTicks) {
      return 0;
    }
    return 1 - this.elapsed / settleTicks;
  }

  /**
   * Ticks until this ball jumps, or null when it is not going to.
   *
   * Read by TRACER, which may not see past a jump — see `stepTracer`.
   */
  ticksToJump(ball: Ball): number | null {
    const clock = this.clocks.get(ball);
    return clock === undefined ? null : clock.nextIn;
  }

  /** The pip this ball is wearing, which is where its next jump puts it. */
  pipFor(ball: Ball): LeapLanding | null {
    return this.clocks.get(ball)?.landing ?? null;
  }

  /**
   * Where a jump of this span would land, or null when there is nowhere legal.
   *
   * Called once a tick per ball from `step`, which stores the answer on the
   * clock: the renderer paints that answer and the jump spends it, so the cue
   * and the move cannot come apart.
   *
   * The three guardrails, in the order they bind:
   *
   * 1. **A jump can never cross the death line.** The span is cut so the ball's
   *    box stays above the deck. The ball may be teleported *past* the deck
   *    sideways — that is the joke — but never into the gutter, because a trap
   *    that takes a life with no rally to play is a bug with a blurb on it.
   *    The frame is cut the same way and for a plainer reason: a landing
   *    outside the field would be clamped back onto the wall by the next
   *    sub-step and reversed, which is a leap that bounces.
   * 2. **Never lands inside anything.** The span walks back toward the ball
   *    until it finds a free position.
   * 3. If nothing along it is free, there is no landing at all and the jump is
   *    skipped — the caller re-rolls the clock.
   *
   * **Null is also how the pip goes out, and it is honest when it does.** The
   * one case that reaches it in ordinary play is a ball pressed within a walk
   * step of a side wall on a heading into it: measured over a six-second
   * capsule that is two ticks in three hundred and sixty, and on both of them
   * there really is no jump to announce, because the ball is about to bounce
   * rather than travel. The alternative — holding the last pip up — would point
   * at a place the ball is no longer going, which is the one thing a held cue
   * may never do.
   */
  private landingFor(ball: Ball, field: LeapField, rolled: number): LeapLanding | null {
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed === 0) {
      return null;
    }
    const unitX = ball.velocity.x / speed;
    const unitY = ball.velocity.y / speed;
    const { walkStep, pipReach, minLiveSpan } = gameConfig.powerUps.leap;
    const reach = this.reach;

    // The floor first and the room second, which is the only order that is
    // safe: a floor applied after the clamps could push a landing through the
    // deck, and one applied before them is simply a longer span for the clamps
    // to cut down.
    let span = Math.max(rolled, minLiveSpan);
    span = Math.min(span, this.roomAlong(ball.x, unitX, gameConfig.field.left, gameConfig.field.right - ball.size));
    // The ceiling and the death line. The deck's edge is the floor a *box* may
    // not cross, so the ball's own height comes off it before the solve.
    span = Math.min(span, this.roomAlong(ball.y, unitY, gameConfig.field.top, field.deckY - ball.size));
    if (span < walkStep) {
      return null;
    }

    for (let walked = span; walked >= walkStep; walked -= walkStep) {
      const x = ball.x + unitX * walked;
      const y = ball.y + unitY * walked;
      if (field.free(x, y, ball.size)) {
        return { x, y, reach: Math.max(1, pipReach * reach) };
      }
    }
    return null;
  }

  /**
   * One tick: the clocks, the flashes, and any jump that came due.
   *
   * Returns how many balls actually moved, which is what the sound is scored
   * off — a SWARM crossing the field can spend two on one tick, and two blinks
   * are one event to the ear.
   *
   * Every live ball is iterated wholesale rather than tracked on arrival, so a
   * MULTI thrown mid-capsule picks up a clock on its first tick with nothing
   * subscribing anywhere.
   */
  step(balls: readonly Ball[], field: LeapField): number {
    for (const flash of this.flashes) {
      flash.ticksLeft--;
    }
    this.flashes = this.flashes.filter((flash) => flash.ticksLeft > 0);
    if (!this.live) {
      return 0;
    }
    this.elapsed++;
    if (this.elapsed > this.duration) {
      this.retire();
      return 0;
    }

    const { settleTicks, serveGuardTicks, flashTicks } = gameConfig.powerUps.leap;
    let jumped = 0;

    for (const ball of balls) {
      if (!ball.active) {
        this.clocks.delete(ball);
        continue;
      }
      let clock = this.clocks.get(ball);
      if (clock === undefined) {
        // The first gap is measured from the end of the settle, so the flicker
        // is always seen before anything moves. A ball that joins the field
        // later — a MULTI fan, an ANGEL save — settles for nothing and takes an
        // ordinary gap, since the machine has not just lost its grip on it.
        const settle = this.elapsed < settleTicks ? settleTicks - this.elapsed : 0;
        clock = { nextIn: settle + this.rollGap(), span: this.rollSpan(), landing: null };
        this.clocks.set(ball, clock);
      }

      // Held is not loose. A ball stuck to the deck under GLUE or stopped in
      // mid-air by STASIS has no heading of its own to be thrown along, and its
      // clock is pinned above the serve guard rather than merely paused — a
      // ball released with three ticks on the clock would be teleported out of
      // the launch the player just took.
      if (!this.jumpable(ball, field)) {
        clock.nextIn = Math.max(clock.nextIn, serveGuardTicks);
        clock.landing = null;
        continue;
      }
      // The cue first, every tick, whether or not this is the tick it is spent
      // on: the pip hangs there for the whole gap and has to follow the ball.
      clock.landing = this.landingFor(ball, field, clock.span * this.reach);
      if (--clock.nextIn > 0) {
        continue;
      }

      const landing = clock.landing;
      clock.nextIn = this.rollGap();
      clock.span = this.rollSpan();
      if (landing === null) {
        // Nowhere legal along the whole span: the jump does not happen and the
        // clock is re-rolled. Silent on purpose — there is no event, and a
        // blink with no move would be the capsule lying about itself.
        continue;
      }

      this.flashes.push({ x: ball.x, y: ball.y, size: ball.size, ticksLeft: flashTicks, opening: false });
      ball.x = landing.x;
      ball.y = landing.y;
      this.flashes.push({ x: ball.x, y: ball.y, size: ball.size, ticksLeft: flashTicks, opening: true });
      // The next one, off the position the ball has just arrived at. Without
      // this the pip sits on top of the sprite for a frame, which is the one
      // reading the cue may never give: *here* is the one place the ball is not
      // about to go.
      clock.landing = this.landingFor(ball, field, clock.span * this.reach);
      jumped++;
    }

    return jumped;
  }

  /**
   * Whether this ball is in a state a jump can act on at all.
   *
   * The same test gates the pip, so a held ball shows no cue: a landing drawn
   * for a ball that cannot take it is the held cue promising something it will
   * not do.
   */
  private jumpable(ball: Ball, field: LeapField): boolean {
    return ball.active && ball.stuckOffsetX === null && !field.frozen;
  }

  /**
   * How far a coordinate may travel along one axis before it leaves [min, max].
   *
   * `Infinity` on an axis the ball is not moving along, so the other one binds
   * — a flat rally has no vertical room to run out of.
   */
  private roomAlong(at: number, unit: number, min: number, max: number): number {
    if (unit === 0) {
      return Number.POSITIVE_INFINITY;
    }
    return unit > 0 ? (max - at) / unit : (min - at) / unit;
  }

  private rollGap(): number {
    const { minGapTicks, maxGapTicks } = gameConfig.powerUps.leap;
    return minGapTicks + Math.floor(Math.random() * (maxGapTicks - minGapTicks + 1));
  }

  private rollSpan(): number {
    const { minSpan, maxSpan } = gameConfig.powerUps.leap;
    return minSpan + Math.random() * (maxSpan - minSpan);
  }
}
