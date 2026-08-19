import { ballSpeedForLevel, gameConfig } from "@core/config/GameConfig";
import { MALUS_KINDS, POWER_UP_DURATIONS, POWER_UP_GLYPHS, POWER_UP_IDS, POWER_UP_NAMES } from "@core/config/powerUps";
import { DevConsole } from "@core/DevConsole";
import { levelAt, levelIndexOf } from "@core/levels/levels";
import { computePaddleBounceVelocity, relativePaddleHit } from "@core/physics/PaddleBounce";
import { Ball } from "@entities/ball/Ball";
import { BrickGrid } from "@entities/bricks/BrickGrid";
import { BumperField } from "@entities/effects/BumperField";
import { Critter } from "@entities/effects/Critter";
import { Detonation } from "@entities/effects/Detonation";
import { MeteorField } from "@entities/effects/MeteorField";
import { ParticleField } from "@entities/effects/ParticleField";
import { Quake } from "@entities/effects/Quake";
import { Singularity } from "@entities/effects/Singularity";
import { ShotPool } from "@entities/laser/ShotPool";
import { mirrorBounds } from "@entities/paddle/MirrorPaddle";
import { Paddle } from "@entities/paddle/Paddle";
import { DropPool, rollDropKind } from "@entities/powerups/DropPool";
import { PowerUpTimers } from "@entities/powerups/PowerUpTimers";
import { InputController } from "@input/InputController";
import { zeroPad } from "@shared/format";

import type { SoundBank } from "@audio/SoundBank";
import type {
  BrickFlash,
  BrickHit,
  BurstSpec,
  CatchPop,
  ChainBolt,
  PanelView,
  PowerUpKind,
  RectangleBounds,
  ScreenName,
  StasisRing,
} from "@interfaces/types";
import type { CanvasRenderer } from "@render/CanvasRenderer";
import type { HiScores } from "@state/HiScores";
import type { Panel } from "@ui/Panel";
import type { Screens } from "@ui/Screens";
import type { StageScaler } from "@ui/StageScaler";

export interface ShatterGameDeps {
  renderer: CanvasRenderer;
  panel: Panel;
  screens: Screens;
  sfx: SoundBank;
  hiScores: HiScores;
  scaler: StageScaler;
  lockTarget: HTMLElement;
}

const ENTRY_LENGTH = 3;
const ENTRY_COMMIT_DELAY_MS = 260;
// The pool is exactly the SWARM size; MULTI tier 3's 9 balls fit inside it.
const MAX_BALLS = 12;

// Longest label that fits the POWER inset at 7px Silkscreen.
const POWER_LABEL_MAX_CHARS = 13;

// Sideways kick on a bolt's three middle points, in game pixels.
const CHAIN_BOLT_JITTER = 3;

// The capsules that resize the deck, and the width each one sets. They are a
// group because only one of these widths can hold at a time: catching any of
// them cancels the other two, and the deck goes back to `baseWidth` only once
// the last of them has run out.
const PADDLE_WIDTH_KINDS = ["E", "XW", "J", "SP"] as const satisfies readonly PowerUpKind[];

type PaddleWidthKind = (typeof PADDLE_WIDTH_KINDS)[number];

const PADDLE_WIDTHS: Record<PaddleWidthKind, number> = {
  E: gameConfig.paddle.wideWidth,
  XW: gameConfig.paddle.extraWideWidth,
  J: gameConfig.paddle.narrowWidth,
  // SPLIT is in the group for the same reason the others are: it owns the deck
  // while it lasts. Its width is the span end to end, hole included — what
  // actually catches is the two 20 px halves `splitSegments` cuts out of it.
  SP: gameConfig.paddle.splitWidth,
};

function isPaddleWidthKind(kind: PowerUpKind): kind is PaddleWidthKind {
  return Object.hasOwn(PADDLE_WIDTHS, kind);
}

// What dealt the damage. Only the first two are things the player did: the rest
// are consequences of one, and the game stays quiet about them so a single kill
// is acknowledged once however far it spreads.
type BrickDamageSource = "ball" | "laser" | "splash" | "chain";

function isDirectHit(source: BrickDamageSource): boolean {
  return source === "ball" || source === "laser";
}

export class ShatterGame {
  private screen: ScreenName = "title";
  private score = 0;
  private lives: number = gameConfig.rules.startLives;
  private level = 0;
  private entry = "";
  private booted = false;
  private wallArmed = false;
  private brickFlashes: BrickFlash[] = [];
  private catchPops: CatchPop[] = [];
  private stasisRings: StasisRing[] = [];
  private bolts: ChainBolt[] = [];
  private readonly singularity = new Singularity();
  private readonly bumpers = new BumperField();
  private readonly quake = new Quake();
  private readonly critter = new Critter();
  private readonly meteors = new MeteorField();
  // Ticks each ball has spent inside the core's reach. Indexed by ball slot,
  // which is a stable identity: `balls` is a fixed array built once at
  // construction and never reordered. If that ever changes, this moves onto Ball.
  private readonly singularityHold: number[] = Array.from({ length: MAX_BALLS }, () => 0);
  // `null` until a `bonus` command sets it; see bonusSpreadAmount().
  private bonusSpreadOverride: number | null = null;

  // Dev-only test console (see DevConsole). Production builds get `null`, and
  // the module drops out of the bundle with this branch.
  private readonly devConsole: DevConsole | null = import.meta.env.DEV
    ? new DevConsole({
        grantPowerUp: (kind) => this.applyPowerUp(kind),
        // `level N` is 1-based; rebuilding the grid serves at the new level.
        jumpToLevel: (levelNumber) => {
          this.level = levelNumber - 1;
          this.buildLevel(this.level);
        },
        setBonusSpread: (amount) => {
          this.bonusSpreadOverride = amount;
          // The wall standing right now was seeded at the old rate, so re-roll
          // it: `bonus 1` has to mean every brick from the next kill on, not
          // every brick of the next level.
          this.grid.reseedCapsules(() => this.rollBrickCapsule());
        },
      })
    : null;

  private readonly paddle = new Paddle();
  private readonly grid = new BrickGrid();
  private readonly timers = new PowerUpTimers();
  private readonly dropPool = new DropPool();
  private readonly shotPool = new ShotPool();
  private readonly balls: Ball[] = Array.from({ length: MAX_BALLS }, () => new Ball());
  private readonly particles = new ParticleField();
  private readonly detonation = new Detonation();
  private multiTier = 0;
  private swarmLive = false;
  private clearCountdown = 0;
  private deathCountdown = 0;
  // GHOST's fade, 0 solid to 1 ghosted. It chases the timer rather than being
  // the timer: the renderer sweeps a wave across the wall as this moves, while
  // the collision stays binary on the capsule itself.
  private ghostBlend = 0;
  // Armed by a MAGNET catch, spent by the next brick a ball or a laser kills.
  // A magnet with nothing falling is a magnet nobody can see working.
  private guaranteedDrop = false;
  private laserCountdown = 0;

  private readonly input: InputController;
  private lastTime = 0;
  private accumulator = 0;
  private animationFrameId: number | null = null;
  private entryCommitTimeoutId: number | null = null;

  constructor(private readonly deps: ShatterGameDeps) {
    this.input = new InputController(deps.lockTarget, deps.scaler, {
      onPointerMoveTo: (stageX) => this.paddle.moveCenterTo(stageX),
      onPointerMoveBy: (deltaX) => this.paddle.moveByDelta(deltaX),
      onAdvance: () => this.advanceGated(),
      onKeyDown: (event) => this.onKeyDown(event),
      onInputLost: () => this.onInputLost(),
    });
  }

  start(): void {
    this.deps.scaler.fit();
    this.input.attach();
    this.deps.hiScores.onChange = () => this.onScoresChanged();
    this.deps.hiScores.sync();
    this.grid.load(levelAt(0), () => this.rollBrickCapsule());
    this.resetServe();
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.frame);
  }

  // A remote score sync can land on any screen; refresh whichever one shows the table.
  private onScoresChanged(): void {
    if (this.screen === "title") {
      const top = this.deps.hiScores.top;
      this.deps.screens.updateTitle(zeroPad(Math.max(top.score, this.score), 6), top.name);
    }
    if (this.screen === "scores" || this.screen === "entry") {
      this.refreshScoreRows();
    }
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.input.detach();
  }

  private readonly frame = (now: number): void => {
    this.animationFrameId = requestAnimationFrame(this.frame);

    const delta = Math.min(gameConfig.loop.maxFrameDeltaMs, now - this.lastTime);
    this.lastTime = now;
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= gameConfig.loop.tickMs && steps++ < gameConfig.loop.maxCatchUpSteps) {
      this.stepSimulation();
      this.accumulator -= gameConfig.loop.tickMs;
    }

    this.deps.renderer.draw({
      background: levelAt(this.level).background,
      backgroundVariant: levelIndexOf(this.level),
      grid: this.grid.rows,
      paddle: {
        x: this.paddle.x,
        width: this.paddle.width,
        laserActive: this.timers.isActive("L"),
        splitGap: this.splitGap(),
      },
      mirrorActive: this.timers.isActive("Y"),
      magnetActive: this.timers.isActive("K"),
      portalActive: this.timers.isActive("PO"),
      xrayActive: this.timers.isActive("XR"),
      ghostBlend: this.ghostBlend,
      paddleHidden: this.deathCountdown > 0,
      bumpers: this.bumpers.discs,
      balls: this.balls,
      // The streak draws the ground a ball actually covers, so it is the live
      // product and not the RUSH scale alone — a TEMPO in hand shortens it. Zero
      // while STASIS holds the field: frozen balls cover nothing.
      ballTrail: this.timers.isActive("RU") && !this.timers.isActive("I") ? this.ballTimeScale() : 0,
      drops: this.dropPool.drops,
      shots: this.shotPool.shots,
      flashes: this.brickFlashes,
      pops: this.catchPops,
      stasisRings: this.stasisRings,
      bolts: this.bolts,
      particles: this.particles.particles,
      meteors: this.meteors.meteors,
      detonation: this.detonation,
      singularity: this.singularity,
      quake: this.quake,
      critter: this.critter,
      energyWallArmed: this.wallArmed,
    });
    this.deps.panel.update(this.panelView());
  };

  private stepSimulation(): void {
    if (this.screen !== "play" && this.screen !== "serve") {
      return;
    }
    if (this.screen === "serve") {
      this.balls[0].followPaddle(this.paddle);
      return;
    }
    // An open console freezes the run exactly like the pause screen: a command
    // is typed one key at a time and may not land in a field still moving.
    if (this.devConsole?.isOpen) {
      return;
    }

    // Belt over the pointer-lock gate: however "play" was reached, it may not
    // keep running unlocked while this setup is expected to lock. Any leak
    // lands on the pause screen instead of playing with a free, hidden cursor.
    if (!this.input.isLocked && this.input.lockExpected) {
      this.setScreen("pause");
      return;
    }

    this.brickFlashes = this.brickFlashes.filter((flash) => --flash.ticksLeft > 0);
    this.stasisRings = this.stasisRings.filter((ring) => --ring.ticksLeft > 0);
    this.bolts = this.bolts.filter((bolt) => --bolt.ticksLeft > 0);
    // Pops animate above the freeze returns below, so the catch that started a
    // NUKE (or ended the level) still gets its acknowledgment on screen.
    for (const pop of this.catchPops) {
      pop.y -= gameConfig.powerUps.catchPopRiseSpeed;
    }
    this.catchPops = this.catchPops.filter((pop) => --pop.ticksLeft > 0);
    this.particles.step(this.singularity.active ? this.singularity : undefined);
    this.quake.step();
    // Above the freeze gates like the shake: a NUKE caught mid-fade must not
    // hold the wall half-dissolved on screen.
    const ghostStep = 1 / gameConfig.effects.ghostFadeTicks;
    this.ghostBlend = this.timers.isActive("GH")
      ? Math.min(1, this.ghostBlend + ghostStep)
      : Math.max(0, this.ghostBlend - ghostStep);

    // A pending level clear freezes the rest of the simulation so the final
    // brick's shatter can play out — no ball can be lost, no capsule caught,
    // no timer expiring behind the effect.
    // A NUKE detonation freezes the rest of the simulation the same way while
    // its shockwave sweeps the field and its debris falls.
    if (this.detonation.active) {
      this.stepDetonation();
      return;
    }
    if (this.clearCountdown > 0) {
      if (--this.clearCountdown === 0) {
        this.onLevelCleared();
      }
      return;
    }
    // BOMB's fuse, and the same freeze: the paddle is in pieces, so nothing may
    // be bounced, caught or drained while they are still in the air. Below the
    // clear gate on purpose — a pending clear already refuses catches, so a
    // bomb can never be taken after the last brick has gone.
    if (this.deathCountdown > 0) {
      if (--this.deathCountdown === 0) {
        this.die();
      }
      return;
    }

    const expired = this.timers.tick();
    if (this.singularity.active) {
      this.singularity.step();
    }
    this.bumpers.step();
    // The deck goes back to base only when the last width capsule has run out:
    // a WIDE expiring under the JAMMER caught over it must not widen it again.
    if (expired.some(isPaddleWidthKind) && !PADDLE_WIDTH_KINDS.some((kind) => this.timers.isActive(kind))) {
      this.paddle.setWidth(gameConfig.paddle.baseWidth);
    }
    // Expired glue may not strand balls on the paddle with no way to launch.
    if (expired.includes("G")) {
      this.releaseStuckBalls();
    }
    // Time restarting: a ring where each ball stood. This runs above the ball
    // loop, so the rings mark the frozen positions rather than the first step
    // out of them.
    if (expired.includes("I")) {
      this.popStasisRings();
    }
    // The marks are drawn straight off the ball's lock, so the lock is what has
    // to go when the capsule runs out.
    if (expired.includes("H")) {
      for (const ball of this.balls) {
        ball.clearHoming();
      }
    }
    if (expired.includes("V")) {
      this.closeSingularity();
    }
    if (expired.includes("O")) {
      this.bumpers.reset();
    }
    // The wall setting again. Balls still inside it stay intangible until they
    // are out — `ghosted` owns that — so this is only the announcement.
    if (expired.includes("GH")) {
      this.deps.sfx.ghostSolidify();
    }
    // Nothing to undo — the scale is gone the moment the timer is — but the ball
    // dropping back to true speed has to be heard by someone whose eyes are on it.
    if (expired.includes("RU")) {
      this.deps.sfx.rushRelease();
    }

    if (this.timers.isActive("L") && --this.laserCountdown <= 0) {
      this.laserCountdown = gameConfig.powerUps.laserCadenceTicks;
      this.shotPool.fireFromPaddle(this.paddle);
      this.deps.sfx.laserFire();
    }
    this.shotPool.step(this.grid, this.timers.isActive("GH"), (hit) => this.damageBrick(hit, "laser"));
    this.stepCritter();
    this.stepMeteors();

    for (let index = 0; index < this.balls.length; index++) {
      const ball = this.balls[index];
      if (!ball.active) {
        continue;
      }
      if (ball.stuckOffsetX !== null) {
        // Glued balls ride the paddle; the offset re-clamps in case a WIDE or
        // JAMMER catch changed the width underneath them — or a SPLIT opened a
        // hole where one was parked.
        ball.x = this.paddle.x + this.clampStuckOffset(ball.stuckOffsetX);
        ball.y = gameConfig.paddle.y - gameConfig.ball.size;
        continue;
      }
      // STASIS stops the balls and nothing else — capsules keep falling, shots
      // keep flying, the paddle keeps moving, and this is the whole of it.
      // Skipping the body writes no position or velocity, so the ball resumes
      // on exactly the trajectory it was frozen on.
      if (this.timers.isActive("I")) {
        continue;
      }
      this.moveBall(ball, index);
    }
    // The MULTI ladder and the swarm end as soon as a single ball is left —
    // checked before capsule catches so a fresh pickup is not instantly reset.
    if (this.balls.filter((ball) => ball.active).length <= 1) {
      this.multiTier = 0;
      this.swarmLive = false;
    }
    // Trigger-tick guard: a kill earlier in this same tick may have set
    // clearCountdown; the freeze must already apply — a drained ball must not
    // cost a life on a cleared level, and no capsule may be caught behind a
    // pending clear.
    if (this.clearCountdown === 0 && !this.balls.some((ball) => ball.active)) {
      this.die();
    }

    if (this.clearCountdown === 0) {
      const field = {
        magnetActive: this.timers.isActive("K"),
        core: this.singularity.active ? this.singularity : null,
        onSwallowed: (x: number, y: number) => {
          this.particles.burst(x, y, "S", gameConfig.effects.brickDeathBurst);
        },
      };
      this.dropPool.step(this.paddleSegments(), field, (kind) => {
        // Two capsules can reach the paddle on one tick; nothing applies once a
        // NUKE detonation has started — the refused drop stays live and freezes.
        if (this.detonation.active) {
          return false;
        }
        this.applyPowerUp(kind);
        return true;
      });
    }
  }

  /**
   * SINGULARITY: bend one ball toward the core, at unchanged speed.
   *
   * Returns whether the ball is inside the core's reach, which is where HOMING
   * stands aside. A ball is never eaten and never accelerated: the impulse goes
   * on and the speed comes straight back off, so what the core changes is
   * heading alone — and a ball dragged in from low on the field is dragged
   * *away* from the loss line, never into it.
   */
  private pullIntoSingularity(ball: Ball, index: number): boolean {
    const { pullConstant, minDistance, homingCutoff, holdDecay, holdRelease, holdFree } =
      gameConfig.powerUps.singularity;
    const toCoreX = this.singularity.x - ball.centerX;
    const toCoreY = this.singularity.y - (ball.y + gameConfig.ball.size / 2);
    const distance = Math.hypot(toCoreX, toCoreY);
    const inside = distance <= homingCutoff;

    // Held time climbs while the ball is close and drains twice as fast once it
    // is out, so passing through costs nothing and circling ends itself.
    this.singularityHold[index] = inside
      ? this.singularityHold[index] + 1
      : Math.max(0, this.singularityHold[index] - holdDecay);
    const held = this.singularityHold[index];
    const pullScale = Math.max(0, Math.min(1, 1 - (held - holdRelease) / (holdFree - holdRelease)));
    if (pullScale === 0 || distance === 0) {
      return inside;
    }

    const acceleration = (pullConstant / Math.max(distance, minDistance) ** 2) * pullScale;
    ball.velocity.x += (toCoreX / distance) * acceleration;
    ball.velocity.y += (toCoreY / distance) * acceleration;

    // One renormalise for the whole guidance step: the core bends a ball, it
    // never speeds one up. HOMING preserves speed on its own, so running after
    // this cannot undo it.
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    const wanted = this.speed();
    ball.velocity.x = (ball.velocity.x / speed) * wanted;
    ball.velocity.y = (ball.velocity.y / speed) * wanted;
    return inside;
  }

  private closeSingularity(): void {
    this.singularity.reset();
    this.singularityHold.fill(0);
  }

  /**
   * HOMING: bend this ball one step toward the brick it has locked, at constant
   * speed. The turn is capped per tick, so the ball arcs onto its target over
   * about ninety ticks rather than snapping to it — a curve the player can read
   * and still bounce off, not a magnet.
   */
  private steerBall(ball: Ball): void {
    const { homingTurnRad, homingMinVerticalFraction } = gameConfig.powerUps;
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const size = gameConfig.ball.size;

    // Below the grid on the way down there is nothing ahead to steer toward,
    // and a mark under the bricks would point at a brick this ball is leaving.
    if (ball.velocity.y > 0 && ball.y > top + this.grid.rows.length * brickHeight) {
      ball.clearHoming();
      return;
    }

    // Re-pick on the clock, and the instant the locked brick stops existing.
    if (--ball.homingRetargetIn <= 0 || this.grid.hitAtCell(ball.homingRow, ball.homingColumn) === null) {
      this.lockNearestBrick(ball);
    }
    // An empty grid: the tick the last brick died, before the clear delay engages.
    if (ball.homingRow < 0) {
      return;
    }

    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed === 0) {
      return;
    }
    const heading = Math.atan2(ball.velocity.y, ball.velocity.x);
    const wanted = Math.atan2(
      top + (ball.homingRow + 0.5) * brickHeight - (ball.y + size / 2),
      left + (ball.homingColumn + 0.5) * brickWidth - (ball.x + size / 2),
    );
    // Wrapped into (-pi, pi] so the ball always turns the short way round.
    let difference = (wanted - heading) % (Math.PI * 2);
    if (difference > Math.PI) {
      difference -= Math.PI * 2;
    } else if (difference <= -Math.PI) {
      difference += Math.PI * 2;
    }
    const steered = heading + Math.max(-homingTurnRad, Math.min(homingTurnRad, difference));

    // A ball steered flat never comes back down. Skip the turn, keep the lock:
    // the next bounce changes the heading and the arc resumes on its own.
    if (Math.abs(Math.sin(steered)) < homingMinVerticalFraction) {
      return;
    }
    // Rebuilt in place from the unchanged speed: exact, and no allocation on a
    // path that runs for every ball on every tick.
    ball.velocity.x = Math.cos(steered) * speed;
    ball.velocity.y = Math.sin(steered) * speed;
  }

  // Nearest live brick by centre distance, compared squared and scanned over
  // indices — this runs per ball whenever a lock expires, and allocates nothing.
  private lockNearestBrick(ball: Ball): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const size = gameConfig.ball.size;
    const ballX = ball.x + size / 2;
    const ballY = ball.y + size / 2;
    const rows = this.grid.rows;
    let bestRow = -1;
    let bestColumn = -1;
    let bestDistance = Infinity;

    for (let row = 0; row < rows.length; row++) {
      for (let column = 0; column < rows[row].length; column++) {
        if (!rows[row][column]) {
          continue;
        }
        const dx = left + (column + 0.5) * brickWidth - ballX;
        const dy = top + (row + 0.5) * brickHeight - ballY;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRow = row;
          bestColumn = column;
        }
      }
    }

    ball.homingRow = bestRow;
    ball.homingColumn = bestColumn;
    ball.homingRetargetIn = gameConfig.powerUps.homingRetargetTicks;
  }

  /**
   * BUMPERS: kick this ball off the first disc it is touching.
   *
   * The ball reflects off the disc's surface normal, is pushed clear of it and
   * put back to the level's speed — a kick changes heading and pays, never
   * pace. Only an approaching ball is kicked: one already travelling outward
   * was kicked on an earlier sub-step, and reflecting it again would drag it
   * back into the disc it is leaving.
   *
   * Returns whether a kick happened, which is what the streak counts.
   */
  private kickOffBumpers(ball: Ball): boolean {
    const size = gameConfig.ball.size;
    const contact = gameConfig.powerUps.bumpers.radius + size / 2;
    const centerY = ball.y + size / 2;

    for (const disc of this.bumpers.discs) {
      const toBallX = ball.centerX - disc.x;
      const toBallY = centerY - disc.y;
      const distance = Math.hypot(toBallX, toBallY);
      if (distance >= contact) {
        continue;
      }
      // A ball dead on the centre has no normal to work with; up is the one
      // direction that cannot answer it by shoving it at the deck.
      const normalX = distance === 0 ? 0 : toBallX / distance;
      const normalY = distance === 0 ? -1 : toBallY / distance;
      const approach = ball.velocity.x * normalX + ball.velocity.y * normalY;
      if (approach >= 0) {
        continue;
      }

      ball.velocity.x -= 2 * approach * normalX;
      ball.velocity.y -= 2 * approach * normalY;
      // Half a pixel past the surface, so the next sub-step reads as clear of
      // the disc rather than as a second contact at exactly the contact radius.
      const push = contact - distance + 0.5;
      ball.x += push * normalX;
      ball.y += push * normalY;
      // A reflection preserves speed on paper; this is what keeps it true after
      // a few hundred of them.
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      if (speed > 0) {
        const scale = this.speed() / speed;
        ball.velocity.x *= scale;
        ball.velocity.y *= scale;
      }

      disc.flashTicksLeft = gameConfig.powerUps.bumpers.flashTicks;
      this.score += gameConfig.scoring.bumperPoints * this.scoreMultiplier();
      this.deps.sfx.bumperKick();
      return true;
    }
    return false;
  }

  /**
   * GHOST: whether this ball is passing through the wall on this tick.
   *
   * The capsule's timer arms the pass; the per-ball flag is what ends it. A ball
   * still overlapping a brick when the timer runs out keeps going until it is
   * clear — turning solid inside the grid would bounce it out of the middle of
   * the wall, or wedge it between two cells with nowhere to go.
   *
   * Called once per tick rather than per sub-step, so a ball that leaves and
   * re-enters the wall inside one tick finishes that tick intangible.
   */
  private ghosted(ball: Ball, capsuleLive: boolean): boolean {
    if (capsuleLive) {
      ball.phasing = true;
      return true;
    }
    if (ball.phasing && this.grid.findBallOverlap(ball.x, ball.y) === null) {
      ball.phasing = false;
    }
    return ball.phasing;
  }

  // Both time scales in one product: TEMPO slows, RUSH speeds, and a field
  // holding both lands at 1.08 — near-normal, which is the counter-play TEMPO is
  // meant to be and wants no special case. Displacement only, so stored
  // velocities are untouched and either capsule expiring restores the true speed
  // with nothing to unwind.
  private ballTimeScale(): number {
    const { tempoTimeScale, rushTimeScale } = gameConfig.powerUps;
    return (this.timers.isActive("T") ? tempoTimeScale : 1) * (this.timers.isActive("RU") ? rushTimeScale : 1);
  }

  private moveBall(ball: Ball, index: number): void {
    // Guidance, then physics. Anything that bends a ball without touching its
    // speed belongs here, once per tick — never inside the sub-step loop, where
    // a fast ball would be steered four times and a slow one once.
    //
    // The core goes first because it is physics; HOMING is aim, and it gives way
    // wherever the core has real hold of the ball.
    const insideCore = this.singularity.active && this.pullIntoSingularity(ball, index);
    if (this.timers.isActive("H") && !insideCore) {
      this.steerBall(ball);
    }
    const timeScale = this.ballTimeScale();
    const stepVx = ball.velocity.x * timeScale;
    const stepVy = ball.velocity.y * timeScale;
    const subSteps = Math.max(1, Math.ceil(Math.max(Math.abs(stepVx), Math.abs(stepVy)) / 2));
    const dx = stepVx / subSteps;
    const dy = stepVy / subSteps;
    const { left, right, top, height } = gameConfig.field;
    const size = gameConfig.ball.size;
    const pierce = () => this.timers.isActive("P");
    const phasing = this.ghosted(ball, this.timers.isActive("GH"));
    // Neither deck can move between sub-steps — the paddle only moves on input —
    // so both are cut once per tick rather than per sub-step. The ghost is split
    // wherever the paddle is: it is the paddle's reflection, and a solid ghost
    // over a broken deck would be a surface the player cannot read.
    const mirror = this.timers.isActive("Y")
      ? this.splitSegments(mirrorBounds(this.paddle.x, this.paddle.width))
      : null;
    const deck = this.paddleSegments();
    const { portalTop, portalHeight, portalInset } = gameConfig.powerUps;
    const portalsOpen = this.timers.isActive("PO");
    if (ball.portalCooldown > 0) {
      ball.portalCooldown--;
    }

    // The order every sub-step runs in, and the one the rest of the wave writes
    // into: bricks -> bumpers -> mirror ceiling -> portal transit -> wall clamp
    // -> paddle. Anything that moves a ball without bouncing it goes above the
    // clamps; anything that bounces it goes below whatever it bounces off.
    //
    // The frame and the paddle also zero the bumper streak wherever they touch
    // the ball: a ball that reached either of them is not wedged between discs.

    for (let i = 0; i < subSteps; i++) {
      ball.x += dx;
      let hit = phasing ? null : this.grid.findBallOverlap(ball.x, ball.y);
      if (hit) {
        if (!pierce()) {
          ball.x -= dx;
          ball.velocity.x = -ball.velocity.x;
        }
        this.damageBrick(hit);
      }

      ball.y += dy;
      hit = phasing ? null : this.grid.findBallOverlap(ball.x, ball.y);
      if (hit) {
        if (!pierce()) {
          ball.y -= dy;
          ball.velocity.y = -ball.velocity.y;
        }
        this.damageBrick(hit);
      }

      // A disc is a free-standing thing to bounce off, so it sits with the
      // bricks rather than with the frame.
      if (this.bumpers.active && this.kickOffBumpers(ball)) {
        this.bumpers.streak++;
        if (this.bumpers.streak >= gameConfig.powerUps.bumpers.streakLimit) {
          this.timers.deactivate("O");
          this.bumpers.reset();
        }
      }

      // The paddle test upside down, over the same 10 px window. A ball that
      // misses the ghost sideways falls through to the ceiling clamp below and
      // ricochets flat, exactly as it always has.
      const mirrorCatch =
        mirror !== null && ball.velocity.y < 0 && ball.y >= top
          ? (mirror.find((half) => ball.y <= half.bottom && ball.x + size > half.left && ball.x < half.right) ?? null)
          : null;
      if (mirrorCatch) {
        const relativeHit = relativePaddleHit(ball.centerX, mirrorCatch);
        const bounced = computePaddleBounceVelocity(relativeHit, this.speed(), gameConfig.bounce.maxAngleRad);
        ball.velocity.x = bounced.x;
        // Downward: the ghost returns balls into the field, not out of it.
        ball.velocity.y = Math.abs(bounced.y);
        ball.y = mirrorCatch.bottom;
        this.bumpers.streak = 0;
        this.deps.sfx.mirrorBounce(relativeHit);
      }

      // A transit replaces the bounce the ball would otherwise have taken, which
      // is why it sits above the clamps. Neither `y` nor `velocity` is touched,
      // so the ball arrives at the same height on the same heading.
      if (portalsOpen && ball.portalCooldown === 0) {
        const center = ball.y + size / 2;
        const inMouth = center >= portalTop && center <= portalTop + portalHeight;
        const leftward = ball.x <= left && ball.velocity.x < 0 ? right - size - portalInset : null;
        const rightward = ball.x >= right - size && ball.velocity.x > 0 ? left + portalInset : null;
        const landing = leftward ?? rightward;
        if (inMouth && landing !== null) {
          ball.x = landing;
          ball.portalCooldown = gameConfig.powerUps.portalCooldownTicks;
          this.deps.sfx.portalWarp();
        }
      }

      if (ball.x <= left) {
        ball.x = left;
        ball.velocity.x = Math.abs(ball.velocity.x);
        this.bumpers.streak = 0;
        this.deps.sfx.wallBounce();
      }
      if (ball.x >= right - size) {
        ball.x = right - size;
        ball.velocity.x = -Math.abs(ball.velocity.x);
        this.bumpers.streak = 0;
        this.deps.sfx.wallBounce();
      }
      if (ball.y <= top) {
        ball.y = top;
        ball.velocity.y = Math.abs(ball.velocity.y);
        this.bumpers.streak = 0;
        this.deps.sfx.wallBounce();
      }

      const paddleTop = gameConfig.paddle.y;
      // Which half of the deck took it, or null. Solid, that list is one box and
      // this is the test it has always been; split, a ball down the middle finds
      // neither half and carries on into the drain — which is the whole capsule.
      const paddleCatch =
        ball.velocity.y > 0 && ball.y + size >= paddleTop && ball.y + size <= paddleTop + gameConfig.paddle.height + 3
          ? (deck.find((half) => ball.x + size > half.left && ball.x < half.right) ?? null)
          : null;
      if (paddleCatch) {
        this.bumpers.streak = 0;
        if (this.timers.isActive("G")) {
          // GLUE: the ball parks on the paddle; a click (or Space) releases it.
          ball.velocity = { x: 0, y: 0 };
          ball.stuckOffsetX = this.clampStuckOffset(ball.x - this.paddle.x);
          ball.x = this.paddle.x + ball.stuckOffsetX;
          ball.y = paddleTop - size;
          this.deps.sfx.wallBounce();
          return;
        }
        // Measured against the half that caught it, so each one throws its own
        // full fan: the inner edges fire hard across the hole, the outer edges
        // hard toward the walls.
        const relativeHit = relativePaddleHit(ball.centerX, paddleCatch);
        ball.velocity = computePaddleBounceVelocity(relativeHit, this.speed(), gameConfig.bounce.maxAngleRad);
        ball.y = paddleTop - size;
        this.deps.sfx.paddleBounce(relativeHit);
      }

      if (this.wallArmed && ball.velocity.y > 0 && ball.y + size >= gameConfig.powerUps.wallY) {
        this.wallArmed = false;
        ball.y = gameConfig.powerUps.wallY - size;
        ball.velocity.y = -Math.abs(ball.velocity.y);
        this.deps.sfx.energyWallBounce();
      }

      if (ball.y > height) {
        ball.active = false;
        return;
      }
    }
  }

  // The width of SPLIT's hole, or 0 while the deck is whole. One reading of the
  // timer, shared by the catch tests and the renderer, so the gap a ball falls
  // through is the gap the player is looking at.
  private splitGap(): number {
    return this.timers.isActive("SP") ? gameConfig.paddle.splitGap : 0;
  }

  // A deck, as the pieces that actually catch things: one box whole, two while
  // SPLIT holds. Applied to the paddle and to MIRROR's ghost alike.
  private splitSegments(bounds: RectangleBounds): RectangleBounds[] {
    const gap = this.splitGap();
    if (gap === 0) {
      return [bounds];
    }
    const half = (bounds.right - bounds.left - gap) / 2;
    return [
      { ...bounds, right: bounds.left + half },
      { ...bounds, left: bounds.right - half },
    ];
  }

  private paddleSegments(): RectangleBounds[] {
    return this.splitSegments(this.paddle.bounds);
  }

  /**
   * Where a glued ball may sit on the deck, as an offset from its left edge.
   *
   * Whole, that is the length that keeps the ball on the wood. Split, it is the
   * two halves, and a ball caught over the hole — or standing where a hole has
   * just opened under it — slides to the inner edge of the nearer one. A ball
   * hovering in mid-air over the gap would be GLUE contradicting SPLIT.
   */
  private clampStuckOffset(offset: number): number {
    const size = gameConfig.ball.size;
    const rightmost = this.paddle.width - size;
    const gap = this.splitGap();
    if (gap === 0) {
      return Math.max(0, Math.min(offset, rightmost));
    }
    const leftEdge = (this.paddle.width - gap) / 2 - size;
    const rightEdge = this.paddle.width - (this.paddle.width - gap) / 2;
    if (offset <= leftEdge) {
      return Math.max(0, offset);
    }
    if (offset >= rightEdge) {
      return Math.min(offset, rightmost);
    }
    return offset - leftEdge < rightEdge - offset ? leftEdge : rightEdge;
  }

  private damageBrick(hit: BrickHit, source: BrickDamageSource = "ball"): void {
    const destroyed = this.grid.damage(hit);
    if (!destroyed) {
      // A BLAST splash is covered by its one boom and a CHAIN link by its one
      // crack; only what the player aimed clanks.
      if (isDirectHit(source)) {
        this.deps.sfx.brickArmored();
      }
      return;
    }

    this.score += hit.cell.points * this.scoreMultiplier();
    if (isDirectHit(source)) {
      this.deps.sfx.brickDestroyed(hit.row);
    }
    this.emitBurst(hit, gameConfig.effects.brickDeathBurst);

    // What falls was rolled into the brick when the wall was built, so a capsule
    // XRAY showed is the capsule that comes out. MAGNET's guarantee still rolls
    // live: it promises the next kill drops something, whichever brick that is.
    const capsule = isDirectHit(source) ? (hit.cell.capsule ?? (this.guaranteedDrop ? rollDropKind() : null)) : null;
    if (capsule !== null) {
      const { left, top, brickWidth, brickHeight } = gameConfig.grid;
      if (this.dropPool.trySpawn(capsule, left + hit.column * brickWidth, top + hit.row * brickHeight)) {
        // Spent on a capsule that actually got a slot: a full drop pool would
        // otherwise swallow MAGNET's one guaranteed demonstration.
        this.guaranteedDrop = false;
        this.deps.sfx.capsuleSpawn();
      }
    }

    if (source === "ball" && this.timers.isActive("B")) {
      this.blastNeighbors(hit);
    }
    // After the splash, so a chain starts outside the crater BLAST just made.
    // `"ball"` and not `isDirectHit`: a laser shot arcs nothing, and a chained
    // kill may not chain again — the web's reach is `chainFrom`'s to decide.
    if (source === "ball" && this.timers.isActive("C")) {
      this.chainFrom(hit);
    }

    // Idempotent on purpose: a BLAST chain reaches here recursively when the
    // splash kill and its outer ball kill both empty the grid in one tick —
    // the old direct onLevelCleared() call double-scored the clear bonus.
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  /**
   * CHAIN: walk lightning out from a brick a ball just killed, two jumps per
   * node, until the link budget runs out.
   *
   * Breadth-first in cell space and self-contained — it damages through
   * `damageBrick(_, "chain")`, which cannot start another chain, so this walk is
   * the only thing deciding how far the web reaches.
   */
  private chainFrom(seed: BrickHit): void {
    const { maxDepth, maxLinks, boltTicks } = gameConfig.effects.chain;
    const { columns } = gameConfig.grid;
    const key = (row: number, column: number): number => row * columns + column;
    // The seed is already dead, but it still has to be unreachable: an arc back
    // onto it would spend a link on nothing.
    const visited = new Set<number>([key(seed.row, seed.column)]);
    const queue = [{ row: seed.row, column: seed.column, depth: 0 }];
    let links = 0;

    for (let head = 0; head < queue.length && links < maxLinks; head++) {
      const node = queue[head];
      if (node.depth >= maxDepth) {
        continue;
      }
      for (const target of this.chainTargets(node.row, node.column, visited)) {
        if (links >= maxLinks) {
          break;
        }
        links++;
        // Marked before the damage: the cell may survive as a chipped silver,
        // and either way no later node may spend a second link on it.
        visited.add(key(target.row, target.column));
        this.bolts.push(chainBolt(node.row, node.column, target.row, target.column, boltTicks));
        queue.push({ row: target.row, column: target.column, depth: node.depth + 1 });
        this.damageBrick(target, "chain");
      }
    }

    if (links > 0) {
      this.deps.sfx.chainArc();
    }
  }

  // The nearest live cells a bolt may jump to from one node. The 8 touching
  // cells are excluded on purpose — reaching them is BLAST's job, and skipping
  // them is what makes a chain read as a jump rather than a wider crater.
  private chainTargets(row: number, column: number, visited: ReadonlySet<number>): BrickHit[] {
    const { cellRadius, linksPerNode } = gameConfig.effects.chain;
    const { columns } = gameConfig.grid;
    const reach = Math.floor(cellRadius);
    const found: Array<{ hit: BrickHit; distance: number }> = [];

    for (let deltaRow = -reach; deltaRow <= reach; deltaRow++) {
      for (let deltaColumn = -reach; deltaColumn <= reach; deltaColumn++) {
        if (Math.max(Math.abs(deltaRow), Math.abs(deltaColumn)) < 2) {
          continue;
        }
        const distance = Math.hypot(deltaRow, deltaColumn);
        if (distance > cellRadius) {
          continue;
        }
        const target = this.grid.hitAtCell(row + deltaRow, column + deltaColumn);
        if (!target || visited.has(target.row * columns + target.column)) {
          continue;
        }
        found.push({ hit: target, distance });
      }
    }

    // Nearest first, then row before column: the same board always arcs the
    // same way, so a chain can be read as a rule rather than as noise.
    found.sort((a, b) => a.distance - b.distance || a.hit.row - b.hit.row || a.hit.column - b.hit.column);
    return found.slice(0, linksPerNode).map((entry) => entry.hit);
  }

  // Splash kills never chain and never drop capsules — one explosion per ball hit.
  private blastNeighbors(center: BrickHit): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    let blasted = false;

    for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
      for (let deltaColumn = -1; deltaColumn <= 1; deltaColumn++) {
        if (deltaRow === 0 && deltaColumn === 0) {
          continue;
        }
        const neighbor = this.grid.hitAtCell(center.row + deltaRow, center.column + deltaColumn);
        if (!neighbor) {
          continue;
        }
        blasted = true;
        this.brickFlashes.push({
          x: left + neighbor.column * brickWidth,
          y: top + neighbor.row * brickHeight,
          ticksLeft: gameConfig.powerUps.splashFlashTicks,
          kind: "blast",
        });
        this.damageBrick(neighbor, "splash");
      }
    }

    // The neighbors themselves stay silent (source "splash"): the chain reads as
    // one explosion, not eight overlapping pops.
    if (blasted) {
      this.deps.sfx.blastExplosion();
    }
  }

  // White death flash on the brick footprint plus a debris burst in the
  // brick's own colors, shared by ordinary kills and NUKE kills.
  private emitBurst(hit: BrickHit, spec: BurstSpec): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    this.brickFlashes.push({
      x: left + hit.column * brickWidth,
      y: top + hit.row * brickHeight,
      ticksLeft: gameConfig.effects.deathFlashTicks,
      kind: "death",
    });
    this.particles.burst(
      left + hit.column * brickWidth + brickWidth / 2,
      top + hit.row * brickHeight + brickHeight / 2,
      hit.cell.kind,
      spec,
    );
  }

  private stepDetonation(): void {
    if (this.detonation.holding) {
      if (this.detonation.stepHold()) {
        this.detonation.reset();
        this.onLevelCleared();
      }
      return;
    }
    this.detonation.step();
    this.nukeBricksWithin(this.detonation.sweepExpired ? Number.POSITIVE_INFINITY : this.detonation.radius);
    if (this.grid.remaining <= 0) {
      this.detonation.beginHold();
    }
  }

  // Detonates every live brick whose centre the shockwave has reached. Nuke
  // kills bypass damageBrick(): full points (PAYDAY applies), but no capsule
  // drops, no BLAST chaining, no per-brick beep, and silver/gold die outright.
  private nukeBricksWithin(radius: number): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const radiusSquared = radius * radius;

    this.grid.rows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (!cell) {
          return;
        }
        const deltaX = left + columnIndex * brickWidth + brickWidth / 2 - this.detonation.x;
        const deltaY = top + rowIndex * brickHeight + brickHeight / 2 - this.detonation.y;
        if (deltaX * deltaX + deltaY * deltaY > radiusSquared) {
          return;
        }
        const hit = { cell, row: rowIndex, column: columnIndex };
        this.grid.destroy(hit);
        this.score += cell.points * this.scoreMultiplier();
        this.emitBurst(hit, gameConfig.effects.nukeBurst);
      });
    });
  }

  /**
   * CRITTER: one tick of the grub, and the brick it closes its jaws on.
   *
   * Bites are of the nuke's kill class rather than the ball's: full points
   * (PAYDAY doubles them) and silver and gold go in one, but no capsule drops,
   * no per-brick beep and neither BLAST nor CHAIN spreads off them. The pet
   * plays *for* the player, not *as* them, and a grub that could set off the
   * player's own combos would be doing the level rather than helping with it.
   *
   * Nothing collides with it — balls, shots and capsules all pass straight
   * through. A pet that deflected a ball would be an obstacle the player never
   * asked to place.
   */
  private stepCritter(): void {
    if (!this.critter.alive) {
      return;
    }
    // It crawls while there is something to chew in the column ahead and scoots
    // over ground already cleared: 30 px of brick is 18 ticks either way, and a
    // stripped row costs a third of that to cross.
    const { stepSpeed, emptyRowSpeed } = gameConfig.effects.critter;
    const ahead = this.grid.hitAtCell(this.critter.row, this.critterColumn() + this.critter.direction);
    this.critter.step(ahead ? stepSpeed : emptyRowSpeed);

    // Out of life, or chewed its way off the bottom of the grid.
    if (this.critter.ticksLeft <= 0 || this.critter.row >= this.grid.rows.length) {
      this.despawnCritter();
      return;
    }

    const hit = this.grid.hitAtCell(this.critter.row, this.critterColumn());
    if (!hit) {
      return;
    }
    this.grid.destroy(hit);
    this.score += hit.cell.points * this.scoreMultiplier();
    this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
    this.deps.sfx.critterBite();
    // Same idempotent clear trigger as damageBrick: the pet can take the last brick.
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  // Which column the grub's jaws are over. Its own centre, so the bite lands
  // when the sprite is on the brick rather than when its nose touches it.
  private critterColumn(): number {
    return Math.floor((this.critter.centerX - gameConfig.grid.left) / gameConfig.grid.brickWidth);
  }

  // Dropped on the top row that still has bricks, walking in from the paddle's
  // own side of the field: the pet arrives from where the player is looking.
  private spawnCritter(): void {
    const row = this.grid.rows.findIndex((cells) => cells.some((cell) => cell !== null));
    if (row < 0) {
      return;
    }
    this.critter.spawn(row, this.paddle.centerX < gameConfig.field.width / 2);
  }

  // It goes out in a puff of yellow: `ParticleField` colours debris by
  // `BrickKind`, and "3" is the closest the field can paint to a lime grub.
  private despawnCritter(): void {
    this.particles.burst(this.critter.centerX, this.critter.centerY, "3", gameConfig.effects.brickDeathBurst);
    this.critter.reset();
  }

  /**
   * METEOR: one tick of the volley, and the bricks the rocks drill through.
   *
   * Kills are of the nuke's class rather than the ball's: full points (PAYDAY
   * doubles them) and silver and gold go in one pass, but no capsule drops and
   * neither BLAST nor CHAIN spreads off them. Three lanes carved out of the
   * wall is the whole of the capsule — a volley that also spilled capsules and
   * set off the player's combos would be playing the level for them.
   *
   * Nothing collides with a rock and nothing bends one: balls, shots and
   * capsules pass through, and SINGULARITY does not reach them. They fall the
   * line they were launched on until the grid runs out beneath them.
   */
  private stepMeteors(): void {
    if (!this.meteors.active) {
      return;
    }
    const { top, brickHeight } = gameConfig.grid;
    this.meteors.step(top + this.grid.rows.length * brickHeight);

    let drilled = false;
    for (const meteor of this.meteors.meteors) {
      if (!meteor.active) {
        continue;
      }
      // Every other tick: one puff per rock per two ticks is a trail, and one
      // per tick is a smoke screen over the wall it is drilling.
      if ((meteor.age & 1) === 0) {
        this.particles.burst(meteor.x, meteor.y, "2", gameConfig.effects.meteor.trailBurst);
      }
      const hit = this.grid.cellAt(meteor.x, meteor.y);
      if (!hit) {
        continue;
      }
      this.grid.destroy(hit);
      this.score += hit.cell.points * this.scoreMultiplier();
      this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
      // The 30 ms guard folds rocks landing on the same tick into one beep,
      // which is what keeps a volley from sounding like a drum roll.
      this.deps.sfx.brickDestroyed(hit.row);
      drilled = true;
    }

    // Same idempotent clear trigger as damageBrick: a rock can take the last brick.
    if (drilled && this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  private scoreMultiplier(): number {
    return this.timers.isActive("X") ? gameConfig.scoring.paydayMultiplier : 1;
  }

  // Chance that this kill drops a bonus capsule: the console's `drop` command
  // beats the config knob. Clamped, so a typo in the knob (1.5, -1) cannot make
  // the roll nonsensical.
  private bonusSpreadAmount(): number {
    const amount = this.bonusSpreadOverride ?? gameConfig.rules.bonusSpreadAmount;
    return Math.min(1, Math.max(0, amount));
  }

  // One brick's worth of luck, asked for once when the wall is built: whether it
  // holds a capsule at all, and which one. The odds are the same ones the kill
  // used to roll — moving them here is what lets XRAY show the truth instead of
  // a guess.
  private rollBrickCapsule(): PowerUpKind | null {
    return Math.random() < this.bonusSpreadAmount() ? rollDropKind() : null;
  }

  // WARP (the Ctrl+Option+Command+N easter egg): finish the level on the spot. The
  // bricks are removed without scoring and the clear bonus is skipped — the hall
  // of fame is shared across all players, so a warp must never be worth points.
  // Allowed from pause too: pausing to reach for a three-modifier chord is normal.
  private warpLevel(): void {
    if (this.screen !== "play" && this.screen !== "serve" && this.screen !== "pause") {
      return;
    }
    this.grid.wipe();
    this.detonation.reset();
    this.clearCountdown = 0;
    this.deathCountdown = 0;
    this.guaranteedDrop = false;
    this.onLevelCleared(false);
  }

  private onLevelCleared(awardBonus = true): void {
    // Nuke chunks (30-45 ticks) can outlive the 30-tick hold: flush so nothing
    // freezes mid-air behind the CLEARED overlay. The ordinary path is clean
    // by construction (15-tick chunks vs a 20-tick delay).
    this.brickFlashes = [];
    this.catchPops = [];
    this.stasisRings = [];
    this.bolts = [];
    this.closeSingularity();
    this.bumpers.reset();
    this.quake.reset();
    this.critter.reset();
    this.meteors.reset();
    this.ghostBlend = 0;
    this.particles.reset();
    const bonus = awardBonus ? (this.level + 1) * gameConfig.scoring.clearBonusPerLevel * this.scoreMultiplier() : 0;
    this.score += bonus;
    // The board is won: every running effect dies with it, so no portal mouths,
    // ghost paddle or tethers stay painted behind the CLEARED overlay. After
    // the bonus on purpose — PAYDAY was earned on this level and still doubles it.
    this.timers.reset();
    this.deps.screens.updateClear(levelAt(this.level).name, zeroPad(bonus, 5));
    this.setScreen("clear");
    this.deps.sfx.levelClear();
  }

  private applyPowerUp(kind: PowerUpKind): void {
    const durations = POWER_UP_DURATIONS;

    // Every catch gets an unmistakable on-field acknowledgment: passive effects
    // (PAYDAY, BLAST, PIERCE) and refresh catches are otherwise invisible.
    this.catchPops.push({
      // The label is centred on the paddle, so a long name at the wall would
      // hang off the frame — SINGULARITY is 11 characters and today's shortest
      // already graze it.
      x: Math.max(40, Math.min(332, this.paddle.centerX)),
      y: gameConfig.paddle.y - 6,
      label: POWER_UP_NAMES[kind],
      malus: MALUS_KINDS.has(kind),
      ticksLeft: gameConfig.powerUps.catchPopLifeTicks,
    });

    if (isPaddleWidthKind(kind)) {
      // The newest catch owns the deck: a WIDE taken under an XWIDE genuinely
      // shrinks it, exactly as a JAMMER has always undone a WIDE.
      for (const other of PADDLE_WIDTH_KINDS) {
        this.timers.deactivate(other);
      }
      this.paddle.setWidth(PADDLE_WIDTHS[kind]);
      this.timers.activate(kind, durations[kind]);
    }
    if (kind === "L") {
      this.timers.activate("L", durations.L);
      this.laserCountdown = gameConfig.powerUps.laserFirstShotDelayTicks;
    }
    if (kind === "P") {
      this.timers.activate("P", durations.P);
    }
    if (kind === "M" && !this.swarmLive) {
      // Stacking ladder: each catch climbs a tier and tops the field up to its
      // count. While a swarm is live, MULTI is inert (only the chime plays).
      this.multiTier = Math.min(gameConfig.powerUps.multiTierBallCounts.length, this.multiTier + 1);
      this.topUpBalls(gameConfig.powerUps.multiTierBallCounts[this.multiTier - 1]);
      this.timers.activate("M", durations.M);
    }
    if (kind === "S") {
      // SWARM replaces the MULTI ladder outright and never stacks with anything:
      // a second catch only tops the field back up to the same 12.
      this.swarmLive = true;
      this.multiTier = 0;
      this.timers.deactivate("M");
      this.timers.activate("S", durations.S);
      this.topUpBalls(gameConfig.powerUps.swarmBallCount);
    }
    if (kind === "B") {
      this.timers.activate("B", durations.B);
    }
    if (kind === "W") {
      this.wallArmed = true;
    }
    if (kind === "T") {
      this.timers.activate("T", durations.T);
    }
    if (kind === "X") {
      this.timers.activate("X", durations.X);
    }
    if (kind === "N") {
      // The shockwave ring starts where the capsule was caught: the paddle centre.
      this.detonation.start(this.paddle.x + this.paddle.width / 2, gameConfig.paddle.y);
    }
    if (kind === "U") {
      this.lives = Math.min(gameConfig.rules.maxLives, this.lives + 1);
    }
    if (kind === "Z") {
      this.destroyBottomRow();
    }
    if (kind === "R") {
      this.dropPool.rainSpawn(gameConfig.powerUps.rainSpawnCount);
    }
    if (kind === "G") {
      this.timers.activate("G", durations.G);
    }
    if (kind === "I") {
      this.timers.activate("I", durations.I);
    }
    if (kind === "H") {
      this.timers.activate("H", durations.H);
    }
    if (kind === "Y") {
      this.timers.activate("Y", durations.Y);
    }
    if (kind === "C") {
      this.timers.activate("C", durations.C);
    }
    if (kind === "K") {
      this.timers.activate("K", durations.K);
      // The pull is silent and the tethers only appear once something is
      // falling, so the next kill is made to drop one. Without it a magnet
      // caught over a dry stretch looks like a capsule that did nothing.
      this.guaranteedDrop = true;
    }
    if (kind === "V") {
      this.timers.activate("V", durations.V);
      this.singularity.open(durations.V);
    }
    if (kind === "BM") {
      this.blowUpPaddle();
    }
    if (kind === "GH") {
      this.timers.activate("GH", durations.GH);
    }
    if (kind === "Q") {
      // The kill first: it is the bottom-most live row that goes, so the slide
      // below can never push a brick off the end of the grid.
      this.destroyBottomRow();
      this.grid.shiftDown();
      this.quake.start();
    }
    if (kind === "PO") {
      this.timers.activate("PO", durations.PO);
    }
    if (kind === "O") {
      // A second catch buys time on the set already out there: moving the discs
      // out from under a ball mid-rally would be the game changing its mind.
      if (!this.bumpers.active) {
        this.bumpers.spawn(gameConfig.grid.top + this.grid.rows.length * gameConfig.grid.brickHeight);
      }
      this.timers.activate("O", durations.O);
    }
    if (kind === "CR") {
      this.spawnCritter();
    }
    if (kind === "RU") {
      this.timers.activate("RU", durations.RU);
    }
    if (kind === "XR") {
      this.timers.activate("XR", durations.XR);
    }
    if (kind === "MT") {
      // A volley already in the air keeps flying and a second one joins it; a
      // third catch inside the same fall finds the pool full and is the sound
      // alone, exactly as a BUMPERS catch over live discs only buys time.
      this.meteors.launch();
    }

    if (kind === "N") {
      // One detonation instead of a pickup jingle — and instead of ~70 per-brick beeps.
      this.deps.sfx.nukeDetonation();
    } else if (kind === "S") {
      this.deps.sfx.swarmPickup();
    } else if (kind === "GH") {
      this.deps.sfx.ghostFade();
    } else if (kind === "SP") {
      // Its own snap ahead of the shared womp, the way GHOST's fade is: the trap
      // is heard as the thing that happened — a deck coming apart.
      this.deps.sfx.splitPickup();
    } else if (kind === "BM") {
      // Its own boom instead of the shared womp: this trap is not a setback.
      this.deps.sfx.paddleExplode();
    } else if (MALUS_KINDS.has(kind)) {
      // One womp for every trap: the blink and the pink pop already say which.
      this.deps.sfx.malusPickup();
    } else if (kind === "V") {
      this.deps.sfx.singularityOpen();
    } else if (kind === "I") {
      this.deps.sfx.stasisFreeze();
    } else if (kind === "U") {
      this.deps.sfx.extraLife();
    } else if (kind === "Z") {
      // The row vaporizes silently brick-by-brick; one boom covers the sweep.
      this.deps.sfx.blastExplosion();
    } else if (kind === "Q") {
      this.deps.sfx.quakeRumble();
    } else if (kind === "MT") {
      // One incoming howl for the volley instead of a pickup chime; the bricks
      // it drills speak for themselves as it goes.
      this.deps.sfx.meteorFall();
    } else {
      this.deps.sfx.capsulePickup();
    }
  }

  // The bottom-most occupied row, vaporized outright: full points (PAYDAY
  // applies), silver and gold die in one hit, but like a nuke it drops no
  // capsules and never chains BLAST. ZAP is this and nothing else; QUAKE runs
  // it and then slides what is left down a row.
  /**
   * BOMB: the paddle detonates, and the life goes with it.
   *
   * Three bursts across its width rather than one at the middle, so the whole
   * deck comes apart instead of a spark appearing at its centre. The life is
   * not taken here — the fuse gate in `stepSimulation` calls `die()` when the
   * debris has flown, which is what buys the player the beat to see what hit
   * them.
   */
  private blowUpPaddle(): void {
    const { fuseTicks, burst } = gameConfig.effects.paddleBlast;
    const y = gameConfig.paddle.y + gameConfig.paddle.height / 2;
    for (const at of [0.15, 0.5, 0.85]) {
      this.particles.burst(this.paddle.x + this.paddle.width * at, y, "1", burst);
    }
    this.brickFlashes.push({
      x: this.paddle.centerX - 15,
      y: gameConfig.paddle.y - 2,
      ticksLeft: gameConfig.effects.deathFlashTicks,
      kind: "death",
    });
    this.deathCountdown = fuseTicks;
  }

  // One ring per ball on screen, centred where it hung. Glued balls get one
  // too: they were held by the paddle rather than by the freeze, but the ring
  // is the field saying it is moving again, not a per-ball claim.
  private popStasisRings(): void {
    const half = gameConfig.ball.size / 2;
    for (const ball of this.balls) {
      if (ball.active) {
        this.stasisRings.push({
          x: ball.x + half,
          y: ball.y + half,
          ticksLeft: gameConfig.powerUps.stasisRingLifeTicks,
        });
      }
    }
    this.deps.sfx.stasisRelease();
  }

  private destroyBottomRow(): void {
    for (let row = this.grid.rows.length - 1; row >= 0; row--) {
      const hits: BrickHit[] = [];
      for (let column = 0; column < gameConfig.grid.columns; column++) {
        const hit = this.grid.hitAtCell(row, column);
        if (hit) {
          hits.push(hit);
        }
      }
      if (hits.length === 0) {
        continue;
      }
      for (const hit of hits) {
        this.grid.destroy(hit);
        this.score += hit.cell.points * this.scoreMultiplier();
        this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
      }
      break;
    }
    // Same idempotent clear trigger as damageBrick: either capsule can take the
    // last row.
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  // GLUE release: every stuck ball leaves with a fresh paddle bounce, exactly
  // as if it had struck the paddle at its current spot.
  private releaseStuckBalls(): void {
    for (const ball of this.balls) {
      if (ball.active && ball.stuckOffsetX !== null) {
        ball.stuckOffsetX = null;
        const relativeHit = relativePaddleHit(ball.centerX, this.paddle.bounds);
        ball.velocity = computePaddleBounceVelocity(relativeHit, this.speed(), gameConfig.bounce.maxAngleRad);
        ball.y = gameConfig.paddle.y - gameConfig.ball.size;
        this.deps.sfx.paddleBounce(relativeHit);
      }
    }
  }

  // Fills the field up to targetCount from whatever is alive, cloning from the
  // first live ball in an even upward fan. Never removes a ball.
  private topUpBalls(targetCount: number): void {
    const source = this.balls.find((ball) => ball.active);
    if (!source) {
      return;
    }
    const missing = targetCount - this.balls.filter((ball) => ball.active).length;
    if (missing <= 0) {
      return;
    }
    const { ballFanRad, ballFanJitterRad } = gameConfig.powerUps;
    this.balls
      .filter((ball) => !ball.active)
      .slice(0, missing)
      .forEach((ball, index) => {
        const angle = ballFanRad * ((2 * (index + 0.5)) / missing - 1) + (Math.random() - 0.5) * ballFanJitterRad;
        ball.cloneFrom(source, angle, this.speed());
      });
  }

  private die(): void {
    this.deps.sfx.ballLost();
    this.lives--;
    if (this.lives <= 0) {
      this.gameOver();
    } else {
      this.resetServe();
    }
  }

  // A run must never keep playing while the paddle has no input: the ball and the
  // capsules would go on without the player, who has no cue that anything is wrong
  // because the cursor is hidden. Only "play" is at risk — on "serve" the ball is
  // still parked on the paddle. Resuming goes through advance(), whose click also
  // re-arms pointer lock.
  private onInputLost(): void {
    if (this.screen === "play") {
      this.setScreen("pause");
    }
  }

  // Serve and pause are the screens whose advance enters live play: that
  // advance re-arms pointer lock and waits for the grant, whether a click,
  // Space or P asked for it. Menu screens advance ungated — they must never
  // stall on a lock rejection — and a click during play is the GLUE release.
  private advanceGated(): void {
    // A click dismisses the console instead of launching a ball behind it — one
    // that did nothing at all would read as a frozen game.
    if (this.devConsole?.isOpen) {
      this.devConsole.close();
      return;
    }
    if (this.screen === "pause" || this.screen === "serve") {
      this.input.runGated(() => this.advance());
    } else {
      this.advance();
    }
  }

  private advance(): void {
    switch (this.screen) {
      case "title":
        this.startRun();
        break;
      case "serve":
        this.launch();
        break;
      case "play":
        // A click during play only means something while GLUE holds balls.
        this.releaseStuckBalls();
        break;
      case "pause":
        this.setScreen("play");
        break;
      case "clear":
        this.level++;
        this.buildLevel(this.level);
        break;
      case "over":
        this.afterOver();
        break;
      case "scores":
        this.showTitle();
        break;
      default:
        break;
    }
  }

  private startRun(): void {
    this.booted = true;
    this.score = 0;
    this.lives = gameConfig.rules.startLives;
    this.level = 0;
    this.buildLevel(this.level);
    this.deps.sfx.gameStart();
  }

  private buildLevel(level: number): void {
    this.grid.load(levelAt(level), () => this.rollBrickCapsule());
    this.resetServe();
  }

  private resetServe(): void {
    this.balls.forEach((ball, index) => {
      ball.active = index === 0;
      ball.velocity = { x: 0, y: 0 };
      ball.stuckOffsetX = null;
      ball.clearHoming();
      ball.portalCooldown = 0;
      ball.phasing = false;
    });
    this.balls[0].followPaddle(this.paddle);
    this.paddle.setWidth(gameConfig.paddle.baseWidth);
    this.timers.reset();
    this.dropPool.reset();
    this.shotPool.reset();
    this.laserCountdown = 0;
    this.wallArmed = false;
    this.multiTier = 0;
    this.swarmLive = false;
    this.brickFlashes = [];
    this.catchPops = [];
    this.stasisRings = [];
    this.bolts = [];
    this.closeSingularity();
    this.bumpers.reset();
    this.quake.reset();
    this.critter.reset();
    this.meteors.reset();
    this.ghostBlend = 0;
    this.particles.reset();
    this.detonation.reset();
    this.clearCountdown = 0;
    this.deathCountdown = 0;
    this.guaranteedDrop = false;

    if (this.booted) {
      this.setScreen("serve");
    } else {
      this.showTitle();
    }
  }

  private launch(): void {
    const ball = this.balls[0];
    ball.active = true;
    ball.followPaddle(this.paddle);
    ball.launch(this.speed());
    this.setScreen("play");
    this.deps.sfx.launch();
  }

  private gameOver(): void {
    // Esc can end a run mid-effect, and a last-life drain lands here mid-tick:
    // no stale effect may stay frozen behind the GAME OVER overlay, and the
    // emptied capsule pool makes this tick's trailing dropPool.step a no-op —
    // nothing can be caught on the over screen. Timers and the wall charge must
    // die too: the side panel stays visible, and a leaked WIDE/PAYDAY label (or
    // the PAYDAY score blink) would keep showing through the overlay.
    this.brickFlashes = [];
    this.catchPops = [];
    this.stasisRings = [];
    this.bolts = [];
    this.closeSingularity();
    this.bumpers.reset();
    this.quake.reset();
    this.critter.reset();
    this.meteors.reset();
    this.ghostBlend = 0;
    this.particles.reset();
    this.dropPool.reset();
    this.detonation.reset();
    this.timers.reset();
    // The deck too: it is run state like the rest, and the panel keeps drawing it
    // behind the overlay — a run ended under a JAMMER or a SPLIT used to leave a
    // stunted or broken paddle sitting on the GAME OVER screen.
    this.paddle.setWidth(gameConfig.paddle.baseWidth);
    this.wallArmed = false;
    this.clearCountdown = 0;
    this.deathCountdown = 0;
    this.guaranteedDrop = false;
    this.deps.screens.updateOver(zeroPad(this.score, 6));
    this.setScreen("over");
    this.deps.sfx.gameOver();
  }

  private afterOver(): void {
    this.refreshScoreRows();
    // Every run with points ends with initials entry: the server records all scores,
    // even those that do not reach the displayed top 5 of the shared board.
    if (this.score > 0) {
      this.entry = "";
      this.updateEntryText();
      this.setScreen("entry");
    } else {
      this.setScreen("scores");
    }
  }

  private showTitle(): void {
    const top = this.deps.hiScores.top;
    this.deps.screens.updateTitle(zeroPad(Math.max(top.score, this.score), 6), top.name);
    this.setScreen("title");
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.screen === "entry") {
      this.handleEntryKey(event);
      return;
    }

    // Dev test console: Ctrl+Option+Command+K, WARP's neighbour on the keyboard
    // and matched the same way, on the physical key. The whole branch folds away
    // in production builds, where `import.meta.env.DEV` is a literal `false`.
    if (import.meta.env.DEV && event.code === "KeyK" && event.ctrlKey && event.altKey && event.metaKey) {
      event.preventDefault();
      if (this.devConsole?.isOpen) {
        this.devConsole.close();
        return;
      }
      // Serve, play and pause, exactly like WARP: the console freezes a run to
      // take a command, so it has no meaning on a menu, and pausing to reach for
      // a three-modifier chord is normal. Never over the two effects that
      // already own the simulation, whose freeze it would have to unwind.
      const live = this.screen === "play" || this.screen === "serve" || this.screen === "pause";
      if (live && !this.detonation.active && this.clearCountdown === 0) {
        // Frees the cursor and hands Escape back to the page. Losing the lock
        // pauses a live run through onInputLost, which is the freeze we want.
        this.input.releaseLock();
        this.devConsole?.open();
      }
      return;
    }

    // An open console owns the keyboard, so no command can also drive the game.
    if (this.devConsole?.isOpen) {
      this.devConsole.handleKey(event);
      return;
    }

    if (event.key === " ") {
      // Space mirrors the mouse click: start on title, launch on serve, advance end screens.
      event.preventDefault();
      this.advanceGated();
      return;
    }

    // WARP easter egg: Ctrl+Option+Command+N clears the level on the spot (see
    // warpLevel). All three modifiers together are claimed by nothing: Chrome binds
    // ⌘N and ⇧⌘N only, and macOS has no ⌃⌥⌘ default.
    //
    // Matched on `event.code`, not `event.key`: Option rewrites `event.key` into
    // the alternate glyph (⌥N is even a dead key), while the N keycap sits at the
    // same physical spot on AZERTY, QWERTY and QWERTZ — so the physical key is the
    // layout-proof one here. Read before the plain-letter keys below.
    if (event.code === "KeyN" && event.ctrlKey && event.altKey && event.metaKey) {
      event.preventDefault();
      this.warpLevel();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "p" && this.screen === "play") {
      this.setScreen("pause");
      this.deps.sfx.pauseToggle();
    } else if (key === "p" && this.screen === "pause") {
      // Resuming by key must re-arm the lock exactly like the resume click: an
      // ungated P would silently rebuild the free-cursor run the gate prevents.
      this.input.runGated(() => {
        this.setScreen("play");
        this.deps.sfx.pauseToggle();
      });
    }
    if (key === "m") {
      this.deps.sfx.toggleMuted();
    }
    if (event.key === "Escape" && (this.screen === "play" || this.screen === "pause" || this.screen === "serve")) {
      this.gameOver();
    }
  }

  private handleEntryKey(event: KeyboardEvent): void {
    if (/^[a-z0-9]$/i.test(event.key) && this.entry.length < ENTRY_LENGTH) {
      this.entry += event.key.toUpperCase();
      this.updateEntryText();
      this.deps.sfx.uiKeyClick();
      if (this.entry.length === ENTRY_LENGTH) {
        this.entryCommitTimeoutId = window.setTimeout(() => this.commitScore(this.entry), ENTRY_COMMIT_DELAY_MS);
      }
      return;
    }

    if (event.key === "Backspace") {
      this.clearEntryCommitTimeout();
      this.entry = this.entry.slice(0, -1);
      this.updateEntryText();
      return;
    }

    // Exactly 3 initials: the server rejects shorter names, which would leave the
    // score on the local board but silently missing from the shared one.
    if (event.key === "Enter" && this.entry.length === ENTRY_LENGTH) {
      this.commitScore(this.entry);
    }
  }

  private commitScore(name: string): void {
    this.clearEntryCommitTimeout();
    if (this.screen !== "entry" || name.length !== ENTRY_LENGTH) {
      return;
    }

    this.deps.hiScores.commit(name, this.score);
    this.entry = "";
    this.refreshScoreRows();
    this.setScreen("scores");
  }

  private clearEntryCommitTimeout(): void {
    if (this.entryCommitTimeoutId !== null) {
      window.clearTimeout(this.entryCommitTimeoutId);
      this.entryCommitTimeoutId = null;
    }
  }

  private refreshScoreRows(): void {
    const rows = this.deps.hiScores.entries.map((entry, index) => ({
      rank: zeroPad(index + 1, 2),
      name: entry.name,
      score: zeroPad(entry.score, 6),
      isTopRank: index === 0,
    }));
    this.deps.screens.updateScoreRows(rows);
  }

  private updateEntryText(): void {
    this.deps.screens.updateEntryText(`${this.entry}___`.slice(0, ENTRY_LENGTH));
  }

  private setScreen(screen: ScreenName): void {
    this.screen = screen;
    this.deps.screens.show(screen);
  }

  private speed(): number {
    return ballSpeedForLevel(this.level);
  }

  private panelView(): PanelView {
    const top = this.deps.hiScores.top;
    return {
      score: this.score,
      hiScore: Math.max(top.score, this.score),
      levelNumber: this.level + 1,
      levelName: levelAt(this.level).name,
      reserveLives: Math.max(0, this.lives - 1),
      powerLabel: this.powerLabel(),
      paydayActive: this.timers.isActive("X"),
      muted: this.deps.sfx.muted,
    };
  }

  // Every live effect, in roster order. WALL and NUKE are named here by hand
  // because no timer holds them — an armed charge and a running detonation —
  // and any later effect carrying its own state is added the same way. Order
  // comes from the roster, not from insertion, so the inset never reshuffles
  // itself under the player mid-rally.
  private activeEffects(): PowerUpKind[] {
    const live = new Set<PowerUpKind>(this.timers.activeKinds());
    if (this.wallArmed) {
      live.add("W");
    }
    if (this.detonation.active) {
      live.add("N");
    }
    if (this.critter.alive) {
      live.add("CR");
    }
    if (this.meteors.active) {
      live.add("MT");
    }
    return POWER_UP_IDS.filter((kind) => live.has(kind));
  }

  /**
   * The POWER inset, 13 characters wide at 7px Silkscreen.
   *
   * One or two effects read as their names, the way the inset always has. Past
   * that the names give way to a still glyph row: the old label cycled one name
   * per second, so five live effects took five seconds to read and never showed
   * the same thing twice in a rally. A row that holds still is read at a glance,
   * and glyphs fall off the end for a `+n` count rather than wrap or truncate.
   */
  private powerLabel(): string {
    const kinds = this.activeEffects();
    if (kinds.length === 0) {
      return "- - -";
    }

    const names = kinds.map((kind) => this.effectName(kind)).join(" ");
    if (names.length <= POWER_LABEL_MAX_CHARS) {
      return names;
    }

    const glyphs = kinds.map((kind) => this.effectGlyph(kind));
    if (glyphs.join(" ").length <= POWER_LABEL_MAX_CHARS) {
      return glyphs.join(" ");
    }
    let shown = glyphs.length - 1;
    while (shown > 1 && countedGlyphRow(glyphs, shown).length > POWER_LABEL_MAX_CHARS) {
      shown--;
    }
    return countedGlyphRow(glyphs, shown);
  }

  // MULTI carries its tier into the inset either way it is written:
  // "MULTI x3" spelled out, "M3" in the glyph row.
  private effectName(kind: PowerUpKind): string {
    const name = POWER_UP_NAMES[kind];
    return kind === "M" && this.multiTier >= 2 ? `${name} x${this.multiTier}` : name;
  }

  private effectGlyph(kind: PowerUpKind): string {
    const glyph = POWER_UP_GLYPHS[kind];
    return kind === "M" && this.multiTier >= 2 ? `${glyph}${this.multiTier}` : glyph;
  }
}

// A bolt from one cell centre to the other as five points, the middle three
// kicked sideways so it reads as lightning and not as a ruler line.
function chainBolt(fromRow: number, fromColumn: number, toRow: number, toColumn: number, ticks: number): ChainBolt {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  const fromX = left + (fromColumn + 0.5) * brickWidth;
  const fromY = top + (fromRow + 0.5) * brickHeight;
  const spanX = left + (toColumn + 0.5) * brickWidth - fromX;
  const spanY = top + (toRow + 0.5) * brickHeight - fromY;
  const length = Math.hypot(spanX, spanY) || 1;

  const points = [];
  for (let step = 0; step <= 4; step++) {
    const along = step / 4;
    const kick = step === 0 || step === 4 ? 0 : (Math.random() * 2 - 1) * CHAIN_BOLT_JITTER;
    points.push({
      x: fromX + spanX * along - (spanY / length) * kick,
      y: fromY + spanY * along + (spanX / length) * kick,
    });
  }
  return { points, ticksLeft: ticks };
}

// "E L P X J +2" — the glyphs that fit, then how many did not.
function countedGlyphRow(glyphs: readonly string[], shown: number): string {
  return `${glyphs.slice(0, shown).join(" ")} +${glyphs.length - shown}`;
}
