import { gameConfig } from "@core/config/GameConfig";

import type { Ball } from "@entities/ball/Ball";

/**
 * HEISEN's vagueness: the longer a ball goes unobserved, the less precisely the
 * machine draws it — and the more it pays for what it breaks.
 *
 * **One number, two jobs.** A ball's vagueness climbs from 0 to 1 over three
 * seconds and is both the picture (up to four extra copies of its own sprite,
 * scattered wider as it climbs) and the payout (x1 rising to x3 on every brick
 * that ball kills). They are the same number on purpose: the trade the capsule
 * is about is only a trade if what the player can see is exactly what they are
 * being paid for. A cloud that paid off a second quantity would be a capsule
 * asking them to guess.
 *
 * A click observes every live ball: the number goes to 0 on the frame of the
 * click and the scatter catches down to it over six ticks. That ordering is
 * `Decoherence.solve`'s read the other way up — there the reward may arrive
 * before the picture finishes, and here the *price* may not arrive after it,
 * or a player could bank one more kill on a multiplier they had already sold.
 *
 * **The ball sprite is never reshaped.** Every copy is `drawBall` at 1:1,
 * moved. GIANT's rule, and it is the roster's oldest: the silhouette is not
 * negotiable, and a blur that smeared it would be a defect wearing the
 * effect's coat.
 *
 * Per-ball state lives here rather than on `Ball` for `Tunnelling`'s reason —
 * a dozen balls under SWARM, and four places that would otherwise have to
 * remember to unwind it.
 */

/** One drawn copy of a ball: where it sits relative to the true sprite, and how strongly. */
export interface Scatter {
  offsetX: number;
  offsetY: number;
  alpha: number;
}

interface Vagueness {
  /** How unobserved this ball is, 0 to 1. */
  level: number;
  /** Where the scatter was when the player last clicked, and how much of the collapse is left. */
  collapseFrom: number;
  collapseLeft: number;
  /** This ball's own drift phase, so no two come apart the same way. */
  seed: number;
}

export class Uncertainty {
  private readonly balls = new Map<Ball, Vagueness>();
  // The capsule's own two-sided blend: out of focus over 15 ticks, back into it
  // over 12. Held here rather than on a `stepBlend` in the game because the two
  // ends are different lengths — see `focusInTicks`, which says why they are
  // allowed to be.
  private focus = 0;
  private phase = 0;
  private live = false;
  private seeds = 0;

  get active(): boolean {
    return this.live;
  }

  /**
   * The catch.
   *
   * Vagueness is **not** cleared: a second HEISEN over a live one is eight more
   * seconds of the same trade, and resetting every ball to crisp would take a
   * multiplier the player had spent six seconds earning as the price of
   * catching the capsule that pays it.
   */
  start(): void {
    this.live = true;
  }

  reset(): void {
    this.live = false;
    this.focus = 0;
    this.phase = 0;
    this.balls.clear();
  }

  /**
   * The capsule ending on its own clock. The levels are **kept**, and that is
   * the expiry idiom rather than an oversight: with `live` false the focus
   * blend runs down over twelve ticks, so the copies converge on the ball they
   * came out of and the multiplier eases back to x1 across the same window. The
   * last copy is absorbed rather than switched off.
   *
   * `reset` is the hard version, for a life lost or a level cleared, where
   * there is no ball left for anything to converge onto.
   */
  retire(): void {
    this.live = false;
  }

  /**
   * A click. Every live ball is observed at once — the capsule is about whether
   * you are looking, and you cannot look at one ball.
   *
   * Returns how many balls actually had something to collapse, so a click that
   * observed nothing makes no sound. Idle clicks are free and unlimited, and a
   * chime on every one of them would be the loudest thing in the game.
   */
  observe(balls: readonly Ball[]): number {
    if (!this.live) {
      return 0;
    }
    const { observeTicks } = gameConfig.powerUps.heisen;
    let collapsed = 0;
    for (const ball of balls) {
      const state = this.balls.get(ball);
      if (!ball.active || state === undefined || state.level === 0) {
        continue;
      }
      state.collapseFrom = Math.max(state.level, state.collapseFrom * (state.collapseLeft / observeTicks));
      state.collapseLeft = observeTicks;
      state.level = 0;
      collapsed++;
    }
    return collapsed;
  }

  /**
   * What this ball's kills are worth, x1 to x3.
   *
   * Scaled by the focus blend as well as the level, so the multiplier eases
   * back to x1 across the twelve ticks the copies take to converge rather than
   * dropping on one frame — the payout and the picture end together, which is
   * the same rule that made them one number to begin with.
   *
   * Null balls answer x1: the five kill paths no ball is behind — a bolt, a
   * nuke, ZAP's sweep, the grub, a meteor — are not uncertain about anything.
   */
  payout(ball: Ball | null): number {
    if (ball === null || this.focus === 0) {
      return 1;
    }
    const { maxMultiplier } = gameConfig.powerUps.heisen;
    return 1 + (maxMultiplier - 1) * this.vaguenessOf(ball);
  }

  /**
   * The copies this ball is wearing right now, nearest-certain first.
   *
   * **Each copy fades in on its own quarter of the climb** rather than all four
   * appearing at a count that steps: at level 0.3 the first copy is most of the
   * way in and the second is just parting, so the ball visibly comes apart
   * instead of gaining a whole sprite on one frame.
   *
   * The offsets wander. A fixed offset travelling with the ball is a rigid
   * five-ball constellation that reads as MULTI drawn wrong; a slow orbit,
   * seeded per ball and per copy, reads as one ball nobody can pin down.
   */
  scatterFor(ball: Ball): readonly Scatter[] {
    const state = this.balls.get(ball);
    if (state === undefined || this.focus === 0) {
      return EMPTY;
    }
    const drawn = this.drawnLevel(state);
    if (drawn === 0) {
      return EMPTY;
    }
    const { copies, maxScatter, copyAlpha, driftTicks } = gameConfig.powerUps.heisen;
    const out: Scatter[] = [];
    for (let index = 0; index < copies; index++) {
      const strength = Math.min(1, Math.max(0, drawn * copies - index));
      if (strength === 0) {
        continue;
      }
      // Each copy runs its own orbit at its own radius, so the cloud breathes
      // rather than spinning as one rigid ring.
      const angle =
        ((this.phase / driftTicks) * Math.PI * 2) / (1 + index * 0.35) + state.seed + (index * Math.PI * 2) / copies;
      const radius = maxScatter * drawn * (0.45 + 0.55 * ((index + 1) / copies));
      /**
       * A Lissajous rather than a circle — the 1.3 is what stops four copies
       * orbiting in lockstep — **clamped back inside the radius**.
       *
       * `cos(a)` and `sin(1.3a)` are not in quadrature, so the pair is not a
       * circle and its length runs up to sqrt(2) times the radius wherever the
       * two happen to peak together. Measured in a browser: a fully vague ball
       * threw a copy 6.05 px out against the 5 px this capsule documents. The
       * clamp only bites at the corners of the figure, so the wobble — the
       * whole reason the shape is not a circle — survives it.
       */
      const wobbleX = Math.cos(angle);
      const wobbleY = Math.sin(angle * 1.3);
      const reach = Math.max(1, Math.hypot(wobbleX, wobbleY));
      out.push({
        offsetX: (wobbleX / reach) * radius,
        offsetY: (wobbleY / reach) * radius,
        alpha: copyAlpha * strength * this.focus,
      });
    }
    return out;
  }

  /**
   * One tick: the focus blend, the drift phase, and every live ball's climb.
   *
   * `frozen` is STASIS holding the field. **A held ball is being observed by
   * definition** — the machine knows exactly where it is, because it is not
   * going anywhere — so the climb stops with it rather than banking three
   * seconds of multiplier the player never risked anything for.
   */
  step(balls: readonly Ball[], frozen: boolean): void {
    const { blurTicks, focusInTicks, focusOutTicks } = gameConfig.powerUps.heisen;
    this.focus = stepFocus(this.focus, this.live, this.live ? focusInTicks : focusOutTicks);
    if (this.focus === 0 && !this.live) {
      this.balls.clear();
      return;
    }
    this.phase++;

    for (const ball of balls) {
      if (!ball.active) {
        this.balls.delete(ball);
        continue;
      }
      let state = this.balls.get(ball);
      if (state === undefined) {
        // Golden-angle seeding: two balls stamped on the same frame by a MULTI
        // fan get phases a third of a turn apart rather than the same one.
        state = { level: 0, collapseFrom: 0, collapseLeft: 0, seed: (this.seeds++ * 2.39996) % (Math.PI * 2) };
        this.balls.set(ball, state);
      }
      if (state.collapseLeft > 0) {
        state.collapseLeft--;
      }
      if (!this.live || frozen || ball.stuckOffsetX !== null) {
        continue;
      }
      state.level = Math.min(1, state.level + 1 / blurTicks);
    }
  }

  /** The vagueness the payout is read off: the number, faded with the capsule's own blend. */
  private vaguenessOf(ball: Ball): number {
    const state = this.balls.get(ball);
    return state === undefined ? 0 : state.level * this.focus;
  }

  /**
   * The vagueness the *picture* is read off, which is the number or the tail of
   * a collapse still catching down to it — whichever is larger.
   *
   * The two can only disagree for six ticks after a click, and during those six
   * the player has already been charged. See the class note.
   */
  private drawnLevel(state: Vagueness): number {
    const { observeTicks } = gameConfig.powerUps.heisen;
    const collapsing = state.collapseLeft > 0 ? state.collapseFrom * (state.collapseLeft / observeTicks) : 0;
    return Math.max(state.level, collapsing);
  }
}

const EMPTY: readonly Scatter[] = [];

/**
 * One tick of the focus blend, with the floor and ceiling `stepBlend` in
 * `ShatterGame` documents — subtracting 1/12 from 1 twelve times lands on 2e-16
 * and never on 0, and a gate asking `focus > 0` then stays open forever over a
 * blend nobody can see.
 *
 * Its own copy rather than an import because the two ends run at different
 * lengths here and the shared helper takes one count for both. The alternative
 * was widening a function five other capsules depend on for the sake of this
 * one, which is the more expensive of the two.
 */
function stepFocus(blend: number, rising: boolean, ticks: number): number {
  const step = 1 / ticks;
  if (rising) {
    const next = blend + step;
    return next > 1 - step / 2 ? 1 : next;
  }
  const next = blend - step;
  return next < step / 2 ? 0 : next;
}
