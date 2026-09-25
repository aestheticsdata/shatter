import { gameConfig } from "@core/config/GameConfig";

import type { Ball } from "@entities/ball/Ball";

/**
 * Where a descending ball is going to be, walked rather than guessed.
 *
 * **One prediction in the tree, read by two callers.** The autopilot (`DemoHook`,
 * DEV-only) has steered off this arithmetic since SHA-133; TRACER draws it. Two
 * copies would be two things that can disagree, and the one that disagreed
 * silently would be the one the player is looking at — the deck would go where
 * the thread did not.
 *
 * **It replays the engine's own integration rather than solving for the answer**,
 * and that is the whole of why it can be trusted. The closed-form fold it
 * replaced — unfold over twice the span, reflect back — is the textbook answer
 * and is *wrong here*, because the engine does not mirror off a side wall, it
 * clamps to the face and throws the overshoot away. Measured against the live
 * game, the fold drifts up to 3.6 px per bounce. The pip is the one pixel a
 * player acts on, so it is worth the loop: see `MAX_SUB_STEP`.
 *
 * A thread also has to be *drawn*, which the fold could never help with — it
 * gives a landing x and no corners. The walk records a point per bounce as it
 * goes, so the line on screen is the line that was predicted rather than a second
 * artist's impression of it.
 *
 * Everything here is in field pixels, and every x is a **left edge** until it is
 * pushed onto `points` — the engine's own clamps are written against the left
 * edge, and centring early would mean un-centring at every wall.
 */

export interface Arrival {
  /** Where the ball's centre will be when it reaches the deck. */
  x: number;
  /** In how many ticks. */
  ticks: number;
}

export interface TracePoint {
  x: number;
  y: number;
}

export interface Trace {
  /**
   * The ball's centre, then a point per side-wall bounce, then the deck rail —
   * or wherever the walk gave up. Always at least one point.
   */
  points: TracePoint[];
  /**
   * Null when the walk never reached the rail, which is the whole of what makes
   * this capsule honest: a thread with no arrival draws short and pins no pip.
   */
  arrival: Arrival | null;
}

export interface TraceRules {
  /**
   * True where the path may not continue — a live brick, a bumper disc. Sampled
   * along each segment, so it is asked about points and never about spans.
   *
   * Absent means an empty field, which is what the autopilot wants: it steers to
   * where the ball will actually land, and a brick in the way changes that
   * without making the deck's best guess any less the best guess.
   */
  blocked?: (x: number, y: number) => boolean;
  /**
   * PORTAL's aperture, or null for a whole wall. Inside these rows the side
   * walls stop reflecting and start wrapping, so the walk comes out of the other
   * one instead of turning around — one branch, and it is the best picture the
   * capsule makes.
   */
  portal?: { top: number; height: number } | null;
  /**
   * Where the deck's top edge is, which is the line the walk is walking *to*.
   *
   * A rule and not a constant since TIDE: the deck floats 96 px up while the
   * field is flooded, and a thread drawn to the rail it is no longer on would
   * be the one lie this prediction may not tell. Absent means the rail, which
   * is where the deck is for all but sixteen seconds of a run.
   *
   * The water below the deck is deliberately *not* modelled here, and does not
   * need to be: the waterline is the deck's own bottom edge, so a ball still
   * falling toward the deck is falling through air the whole way. Buoyancy only
   * ever acts on a ball that has already missed it.
   */
  deckY?: number;
  /**
   * LEAP: how many ticks of this ball's future the walk is allowed to see,
   * because at the end of them the ball tunnels.
   *
   * **The ruling TRACER's blurb forces.** `THE BALL SHOWS WHERE IT LANDS` is a
   * lie under a live LEAP, and the two ways out were recomputing the walk
   * through the pending jump or stopping the thread at it. Recomputing cannot
   * be honest past the *first* jump — the next gap is rolled when a jump fires,
   * so a fall that takes two of them would be a prediction with an invented
   * number in the middle of it — and half an honest thread is exactly what this
   * capsule may not draw.
   *
   * So the walk stops, which is also the answer `blocked` already gives to the
   * other two ways this prediction can be wrong: it ends early rather than
   * guessing, and a thread that never reached the rail pins no pip. What the
   * player sees is the guide running out where the ball is going to vanish,
   * which is a true and useful thing to be told.
   */
  stopTicks?: number;
}

/**
 * The longest a sub-step may be, copied from `ShatterGame.stepBall`.
 *
 * **This number is why the walk is a simulation and not a formula.** The engine
 * does not reflect off a side wall, it *clamps*: a sub-step that ends past the
 * face is put back on the face and reversed, and the overshoot is thrown away
 * rather than mirrored back into the field. A ball therefore comes off a wall up
 * to one sub-step short of where geometry says it should, every bounce.
 *
 * That is not a rounding error. Measured against the live engine, a closed-form
 * reflection drifts **up to 3.6 px per bounce** — most of a ball — and a guide
 * wrong by half a ball at the rail is exactly the lie this capsule may not tell.
 * So the walk integrates the way the engine integrates, and is then exact by
 * construction rather than nearly right by argument.
 */
const MAX_SUB_STEP = 2;

// A ball cannot take longer than this to cross the field, and a walk that has not
// landed by here is one nobody can read anyway. Not a tuning knob: the point past
// which a thread is a scribble and the honest answer is to stop.
const MAX_TICKS = 900;

/**
 * Walk a descending ball down to the deck.
 *
 * Null-ish by construction for anything not falling: a parked ball, one stuck to
 * the deck under GLUE, one held by STASIS, or one still on its way up all return
 * a single point and no arrival. The held cue is drawn off exactly that.
 */
export function trace(ball: Ball, rules: TraceRules = {}): Trace {
  const size = ball.size;
  const start: TracePoint = { x: ball.x + size / 2, y: ball.y };
  if (!ball.active || ball.stuckOffsetX !== null || ball.velocity.y <= 0) {
    return { points: [start], arrival: null };
  }

  const { left, right } = gameConfig.field;
  const { blocked, portal, deckY = gameConfig.paddle.y, stopTicks } = rules;
  const wall = right - size;

  let x = ball.x;
  let y = ball.y;
  let vx = ball.velocity.x;
  const vy = ball.velocity.y;
  let ticks = 0;

  const points: TracePoint[] = [start];
  for (; ticks < MAX_TICKS; ticks++) {
    // Tested at the top of the tick rather than inside the sub-step walk: a
    // jump happens once a tick, above the sub-steps, which is exactly where
    // `stepBall` puts it. Stopping mid-walk would draw the thread ending in the
    // middle of a tick the ball completes.
    if (stopTicks !== undefined && ticks >= stopTicks) {
      if (ticks > 0) {
        points.push({ x: x + size / 2, y });
      }
      return { points, arrival: null };
    }
    // `stepBall`'s own division, so the clamp lands on the same sub-step the
    // engine clamps on. `timeScale` is deliberately not read: it scales both
    // components together, so it changes how many ticks the fall takes and never
    // which pixels it passes through — and the path is what is being drawn.
    const subSteps = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / MAX_SUB_STEP));
    const dx = vx / subSteps;
    const dy = vy / subSteps;

    for (let index = 0; index < subSteps; index++) {
      x += dx;
      y += dy;

      if (blocked?.(x + size / 2, y + size / 2)) {
        points.push({ x: x - dx + size / 2, y: y - dy });
        return { points, arrival: null };
      }

      // The side walls. Clamp and reverse, overshoot discarded — `stepBall`'s
      // exact shape, guards included, because a ball parked on a wall by one
      // sub-step is walked back into it by the next one and re-clamped.
      const throughPortal = portal != null && y + size / 2 >= portal.top && y + size / 2 < portal.top + portal.height;
      if (x <= left) {
        if (throughPortal) {
          points.push({ x: x + size / 2, y });
          x = wall - gameConfig.powerUps.portalInset;
          points.push({ x: x + size / 2, y });
        } else {
          x = left;
          if (vx < 0) {
            points.push({ x: x + size / 2, y });
          }
          vx = Math.abs(vx);
        }
      }
      if (x >= wall) {
        if (throughPortal) {
          points.push({ x: x + size / 2, y });
          x = left + gameConfig.powerUps.portalInset;
          points.push({ x: x + size / 2, y });
        } else {
          x = wall;
          if (vx > 0) {
            points.push({ x: x + size / 2, y });
          }
          vx = -Math.abs(vx);
        }
      }

      // The deck, tested on the ball's bottom edge — and **after** the wall
      // clamps, which is the order `stepBall` tests them in and is not
      // cosmetic. A ball coming down hard against a side wall is clamped onto
      // the face first and caught there; testing the deck first reports the
      // unclamped x and puts the pip a pixel outside the field. One trial in a
      // hundred and twenty found it, at vy 0.13 pressed against the right wall.
      if (y + size >= deckY) {
        const landing = { x: x + size / 2, y: deckY - size };
        points.push(landing);
        return { points, arrival: { x: landing.x, ticks: ticks + (index + 1) / subSteps } };
      }
    }
  }

  return { points, arrival: null };
}

/**
 * The old `DemoHook` contract: where and when a descending ball meets the deck,
 * or null for one that is not on its way. Derived from the walk so the deck and
 * the thread cannot disagree.
 */
export function arrival(ball: Ball, deckY?: number): Arrival | null {
  return trace(ball, { deckY }).arrival;
}

/** The soonest of them, which is the ball the deck has to answer first. */
export function firstArrival(balls: readonly Ball[], deckY?: number): Arrival | null {
  let first: Arrival | null = null;
  for (const ball of balls) {
    const next = arrival(ball, deckY);
    if (next !== null && (first === null || next.ticks < first.ticks)) {
      first = next;
    }
  }
  return first;
}
