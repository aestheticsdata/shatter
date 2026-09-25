import { firstArrival } from "@core/ballTrace";
import { gameConfig } from "@core/config/GameConfig";
import { POWER_UP_BY_ID } from "@core/config/powerUps";
import { DROP_HEIGHT, DROP_WIDTH } from "@entities/powerups/DropPool";

import type { Arrival } from "@core/ballTrace";
import type { Ball } from "@entities/ball/Ball";
import type { Paddle } from "@entities/paddle/Paddle";
import type { Drop } from "@entities/powerups/DropPool";
import type { ScreenName } from "@interfaces/screens";

/**
 * The run as numbers, for the film (SHA-133).
 *
 * Everything on the field is canvas, so the storyboard cannot ask a screenshot
 * what it shows. It asks this instead — the screen it landed on, a catch
 * counted, a ball still in play — and fails the take on the answer.
 */
export interface DemoSnapshot {
  screen: ScreenName;
  /** 1-based, as the panel prints it. */
  levelNumber: number;
  levelName: string;
  score: number;
  lives: number;
  ballsInPlay: number;
  /** Of those, the ones GLUE is holding on the deck — only a click (or Space) frees them. */
  ballsStuck: number;
  capsulesFalling: number;
  capsulesCaught: number;
  /** Of those, the traps — what the autopilot steps around and a rally sometimes takes anyway. */
  trapsCaught: number;
  autopilot: boolean;
  paddle: {
    centerX: number;
    width: number;
    y: number;
    /**
     * Where a hand would be holding the mouse, in stage pixels, for the deck to
     * be where it is: the centre, mirrored while FLIP has the field over. The
     * film keeps its drawn cursor there, and a mouse move sent to that point is
     * one the game reads as "stay".
     */
    pointerX: number;
  };
}

/** What the game hands over; the hook adds its own switch. */
export type DemoReading = Omit<DemoSnapshot, "autopilot">;

// The deck's top speed under the autopilot, in px a tick. A hand, not a servo:
// six a tick crosses the field in about a second, keeps up with a level-one
// ball, and reads as someone playing rather than a deck that is simply always
// there.
const MAX_STEP = 6;
// A ball this close to the deck wins over any capsule: three quarters of a
// second, about what a capsule chase and the way back cost.
const THREAT_TICKS = 45;
// How far the ball's landing spot sweeps either side of the deck's centre and
// how slowly, and how much deck stays outside the sweep so a peak can never
// carry the ball past a cap.
const AIM_SWEEP = 12;
const AIM_PERIOD = 150;
const AIM_MARGIN = 8;
// The bit of deck not counted on for a capsule: any part of the deck catches
// one on paper, but the caps are the part a hand misses with.
const CATCH_MARGIN = 4;
// A trap about to land on the deck is stepped around: how close it has to be
// before it counts, and the clearance kept past the two sprites' half-widths.
const TRAP_TICKS = 40;
const TRAP_CLEARANCE = 4;
// The one thing a trap does not move the deck for: a ball due inside this many
// ticks. A life lost costs more than any trap.
const TRAP_DODGE_MIN_TICKS = 20;

/**
 * The film's hook: an autopilot that plays, and a snapshot that says what
 * happened. Dev-only — constructed behind `import.meta.env.DEV` in
 * `ShatterGame`, reachable as `window.__shatter.demo` through the dev handle
 * `main.ts` hangs on `window`, absent from production bundles.
 *
 * The autopilot writes one thing, the deck's position, through the same path a
 * mouse move takes (`ShatterGame.steerTo`). Score, lives, drops, timers and the
 * RNG stay the game's: it steers the ball, it never touches the state.
 *
 * It plays the way a hand does. The deck goes under the ball that will reach it
 * first, and when no ball is on its way down it drifts under the nearest
 * capsule it can reach in time — never a trap, which it steps around instead
 * when the ball leaves it the time, as a player who has read the catalogue
 * would. It moves at a hand's speed rather than
 * teleporting, and it takes the ball at a slowly sweeping spot on the deck: a
 * fixed spot locks a rally into the same three bounces forever, the first thing
 * tuning levels by hand teaches.
 */
export class DemoHook {
  private enabled = false;
  private clock = 0;

  constructor(private readonly read: () => DemoReading) {}

  snapshot(): DemoSnapshot {
    return { ...this.read(), autopilot: this.enabled };
  }

  autopilot(on: boolean): void {
    this.enabled = on;
  }

  /** The field x the deck's centre moves to this tick, or null while the autopilot is off. */
  steer(balls: readonly Ball[], drops: readonly Drop[], paddle: Paddle): number | null {
    if (!this.enabled) {
      return null;
    }
    this.clock++;
    const target = this.target(balls, drops, paddle);
    return paddle.centerX + clamp(target - paddle.centerX, -MAX_STEP, MAX_STEP);
  }

  private target(balls: readonly Ball[], drops: readonly Drop[], paddle: Paddle): number {
    const threat = firstArrival(balls, paddle.y);
    return dodgeTraps(this.wanted(balls, drops, paddle, threat), drops, paddle, threat);
  }

  private wanted(balls: readonly Ball[], drops: readonly Drop[], paddle: Paddle, threat: Arrival | null): number {
    if (threat !== null && threat.ticks <= THREAT_TICKS) {
      return threat.x + this.aim(paddle);
    }
    const capsule = catchableCapsule(drops, paddle, threat);
    if (capsule !== null) {
      return capsule;
    }
    if (threat !== null) {
      return threat.x + this.aim(paddle);
    }
    // Every ball is on its way up. The lowest is the one coming back first, and
    // waiting under it is what a hand does between two rallies.
    const lowest = lowestBall(balls);
    return lowest === null ? paddle.centerX : lowest.centerX;
  }

  private aim(paddle: Paddle): number {
    const reach = Math.max(0, paddle.width / 2 - AIM_MARGIN);
    return clamp(AIM_SWEEP * Math.sin(this.clock / AIM_PERIOD), -reach, reach);
  }
}

// The centre of the lowest capsule the deck can get under before it lands and
// still be back for the ball — never a trap. Null when there is none.
function catchableCapsule(drops: readonly Drop[], paddle: Paddle, threat: Arrival | null): number | null {
  let best: number | null = null;
  let bestY = -Infinity;
  for (const drop of drops) {
    if (!drop.active || POWER_UP_BY_ID[drop.kind].tier === "trap" || drop.y <= bestY) {
      continue;
    }
    const ticks = (paddle.y - DROP_HEIGHT - drop.y) / gameConfig.powerUps.dropFallSpeed;
    if (ticks < 0) {
      continue;
    }
    const centerX = drop.x + DROP_WIDTH / 2;
    // Under it in time, counting the deck's own width...
    const travel = Math.abs(centerX - paddle.centerX) - (paddle.width / 2 - CATCH_MARGIN);
    if (travel > MAX_STEP * ticks) {
      continue;
    }
    // ...and back under the ball before the ball needs the deck.
    if (threat !== null && ticks + Math.abs(threat.x - centerX) / MAX_STEP > threat.ticks) {
      continue;
    }
    best = centerX;
    bestY = drop.y;
  }
  return best;
}

// The target moved off any trap about to land on it, to whichever side is
// nearer (or away from the wall), unless the ball is due first — then the trap
// is taken, and the ball is not lost.
function dodgeTraps(target: number, drops: readonly Drop[], paddle: Paddle, threat: Arrival | null): number {
  if (threat !== null && threat.ticks < TRAP_DODGE_MIN_TICKS) {
    return target;
  }
  const halfDeck = paddle.width / 2;
  const clearance = halfDeck + DROP_WIDTH / 2 + TRAP_CLEARANCE;
  const min = gameConfig.field.left + halfDeck;
  const max = gameConfig.field.right - halfDeck;
  let dodged = target;
  for (const drop of drops) {
    if (!drop.active || POWER_UP_BY_ID[drop.kind].tier !== "trap") {
      continue;
    }
    const ticks = (paddle.y - DROP_HEIGHT - drop.y) / gameConfig.powerUps.dropFallSpeed;
    if (ticks < -5 || ticks > TRAP_TICKS) {
      continue;
    }
    const trapX = drop.x + DROP_WIDTH / 2;
    if (Math.abs(trapX - dodged) >= clearance) {
      continue;
    }
    const left = trapX - clearance;
    const right = trapX + clearance;
    dodged = dodged <= trapX ? (left >= min ? left : right) : right <= max ? right : left;
  }
  return dodged;
}

function lowestBall(balls: readonly Ball[]): Ball | null {
  let lowest: Ball | null = null;
  for (const ball of balls) {
    if (ball.active && (lowest === null || ball.y > lowest.y)) {
      lowest = ball;
    }
  }
  return lowest;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
