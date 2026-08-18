import { ballSpeedForLevel, gameConfig, POWER_UP_NAMES } from "@core/config/GameConfig";
import { DevConsole } from "@core/DevConsole";
import { levelAt, levelIndexOf } from "@core/levels/levels";
import { computePaddleBounceVelocity, relativePaddleHit } from "@core/physics/PaddleBounce";
import { Ball } from "@entities/ball/Ball";
import { BrickGrid } from "@entities/bricks/BrickGrid";
import { Detonation } from "@entities/effects/Detonation";
import { ParticleField } from "@entities/effects/ParticleField";
import { ShotPool } from "@entities/laser/ShotPool";
import { Paddle } from "@entities/paddle/Paddle";
import { DropPool } from "@entities/powerups/DropPool";
import { PowerUpTimers } from "@entities/powerups/PowerUpTimers";
import { InputController } from "@input/InputController";
import { zeroPad } from "@shared/format";

import type { SoundBank } from "@audio/SoundBank";
import type { BrickFlash, BrickHit, BurstSpec, CatchPop, PanelView, PowerUpKind, ScreenName } from "@interfaces/types";
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
const POWER_LABEL_CYCLE_TICKS = 60;

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
  private tickCount = 0;
  // `null` until a `drop` command sets it; see bonusSpreadAmount().
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
    this.grid.load(levelAt(0));
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
      paddle: { x: this.paddle.x, width: this.paddle.width, laserActive: this.timers.isActive("L") },
      balls: this.balls,
      drops: this.dropPool.drops,
      shots: this.shotPool.shots,
      flashes: this.brickFlashes,
      pops: this.catchPops,
      particles: this.particles.particles,
      detonation: this.detonation,
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

    this.tickCount++;
    this.brickFlashes = this.brickFlashes.filter((flash) => --flash.ticksLeft > 0);
    // Pops animate above the freeze returns below, so the catch that started a
    // NUKE (or ended the level) still gets its acknowledgment on screen.
    for (const pop of this.catchPops) {
      pop.y -= gameConfig.powerUps.catchPopRiseSpeed;
    }
    this.catchPops = this.catchPops.filter((pop) => --pop.ticksLeft > 0);
    this.particles.step();

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

    const expired = this.timers.tick();
    if (expired.includes("E") && !this.timers.isActive("J")) {
      this.paddle.setWidth(gameConfig.paddle.baseWidth);
    }
    if (expired.includes("J") && !this.timers.isActive("E")) {
      this.paddle.setWidth(gameConfig.paddle.baseWidth);
    }
    // Expired glue may not strand balls on the paddle with no way to launch.
    if (expired.includes("G")) {
      this.releaseStuckBalls();
    }

    if (this.timers.isActive("L") && --this.laserCountdown <= 0) {
      this.laserCountdown = gameConfig.powerUps.laserCadenceTicks;
      this.shotPool.fireFromPaddle(this.paddle);
      this.deps.sfx.laserFire();
    }
    this.shotPool.step(this.grid, (hit) => this.damageBrick(hit, "laser"));

    for (const ball of this.balls) {
      if (!ball.active) {
        continue;
      }
      if (ball.stuckOffsetX !== null) {
        // Glued balls ride the paddle; the offset re-clamps in case a WIDE or
        // JAMMER catch changed the width underneath them.
        ball.x = this.paddle.x + Math.min(ball.stuckOffsetX, this.paddle.width - gameConfig.ball.size);
        ball.y = gameConfig.paddle.y - gameConfig.ball.size;
        continue;
      }
      this.moveBall(ball);
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
      this.dropPool.step(this.paddle.bounds, (kind) => {
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

  private moveBall(ball: Ball): void {
    // TEMPO scales displacement only, so stored velocities resume full speed on expiry.
    const timeScale = this.timers.isActive("T") ? gameConfig.powerUps.tempoTimeScale : 1;
    const stepVx = ball.velocity.x * timeScale;
    const stepVy = ball.velocity.y * timeScale;
    const subSteps = Math.max(1, Math.ceil(Math.max(Math.abs(stepVx), Math.abs(stepVy)) / 2));
    const dx = stepVx / subSteps;
    const dy = stepVy / subSteps;
    const { left, right, top, height } = gameConfig.field;
    const size = gameConfig.ball.size;
    const pierce = () => this.timers.isActive("P");

    for (let i = 0; i < subSteps; i++) {
      ball.x += dx;
      let hit = this.grid.findBallOverlap(ball.x, ball.y);
      if (hit) {
        if (!pierce()) {
          ball.x -= dx;
          ball.velocity.x = -ball.velocity.x;
        }
        this.damageBrick(hit);
      }

      ball.y += dy;
      hit = this.grid.findBallOverlap(ball.x, ball.y);
      if (hit) {
        if (!pierce()) {
          ball.y -= dy;
          ball.velocity.y = -ball.velocity.y;
        }
        this.damageBrick(hit);
      }

      if (ball.x <= left) {
        ball.x = left;
        ball.velocity.x = Math.abs(ball.velocity.x);
        this.deps.sfx.wallBounce();
      }
      if (ball.x >= right - size) {
        ball.x = right - size;
        ball.velocity.x = -Math.abs(ball.velocity.x);
        this.deps.sfx.wallBounce();
      }
      if (ball.y <= top) {
        ball.y = top;
        ball.velocity.y = Math.abs(ball.velocity.y);
        this.deps.sfx.wallBounce();
      }

      const paddleTop = gameConfig.paddle.y;
      const paddleCatch =
        ball.velocity.y > 0 &&
        ball.y + size >= paddleTop &&
        ball.y + size <= paddleTop + gameConfig.paddle.height + 3 &&
        ball.x + size > this.paddle.x &&
        ball.x < this.paddle.x + this.paddle.width;
      if (paddleCatch) {
        if (this.timers.isActive("G")) {
          // GLUE: the ball parks on the paddle; a click (or Space) releases it.
          ball.velocity = { x: 0, y: 0 };
          ball.stuckOffsetX = ball.x - this.paddle.x;
          ball.y = paddleTop - size;
          this.deps.sfx.wallBounce();
          return;
        }
        const relativeHit = relativePaddleHit(ball.centerX, this.paddle.bounds);
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

  private damageBrick(hit: BrickHit, source: "ball" | "laser" | "splash" = "ball"): void {
    const destroyed = this.grid.damage(hit);
    if (!destroyed) {
      // Splash damage is covered by the single BLAST boom; only direct hits clank.
      if (source !== "splash") {
        this.deps.sfx.brickArmored();
      }
      return;
    }

    this.score += hit.cell.points * this.scoreMultiplier();
    if (source !== "splash") {
      this.deps.sfx.brickDestroyed(hit.row);
    }
    this.emitBurst(hit, gameConfig.effects.brickDeathBurst);

    if (source !== "splash" && Math.random() < this.bonusSpreadAmount()) {
      const { left, top, brickWidth, brickHeight } = gameConfig.grid;
      if (this.dropPool.trySpawn(left + hit.column * brickWidth, top + hit.row * brickHeight)) {
        this.deps.sfx.capsuleSpawn();
      }
    }

    if (source === "ball" && this.timers.isActive("B")) {
      this.blastNeighbors(hit);
    }

    // Idempotent on purpose: a BLAST chain reaches here recursively when the
    // splash kill and its outer ball kill both empty the grid in one tick —
    // the old direct onLevelCleared() call double-scored the clear bonus.
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
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
    this.onLevelCleared(false);
  }

  private onLevelCleared(awardBonus = true): void {
    // Nuke chunks (30-45 ticks) can outlive the 30-tick hold: flush so nothing
    // freezes mid-air behind the CLEARED overlay. The ordinary path is clean
    // by construction (15-tick chunks vs a 20-tick delay).
    this.brickFlashes = [];
    this.catchPops = [];
    this.particles.reset();
    const bonus = awardBonus ? (this.level + 1) * gameConfig.scoring.clearBonusPerLevel * this.scoreMultiplier() : 0;
    this.score += bonus;
    this.deps.screens.updateClear(levelAt(this.level).name, zeroPad(bonus, 5));
    this.setScreen("clear");
    this.deps.sfx.levelClear();
  }

  private applyPowerUp(kind: PowerUpKind): void {
    const durations = gameConfig.powerUps.durationsTicks;

    // Every catch gets an unmistakable on-field acknowledgment: passive effects
    // (PAYDAY, BLAST, PIERCE) and refresh catches are otherwise invisible.
    this.catchPops.push({
      x: this.paddle.centerX,
      y: gameConfig.paddle.y - 6,
      label: POWER_UP_NAMES[kind],
      malus: kind === "J",
      ticksLeft: gameConfig.powerUps.catchPopLifeTicks,
    });

    if (kind === "E") {
      this.timers.deactivate("J");
      this.paddle.setWidth(gameConfig.paddle.wideWidth);
      this.timers.activate("E", durations.E);
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
    if (kind === "J") {
      this.timers.deactivate("E");
      this.paddle.setWidth(gameConfig.paddle.narrowWidth);
      this.timers.activate("J", durations.J);
    }
    if (kind === "N") {
      // The shockwave ring starts where the capsule was caught: the paddle centre.
      this.detonation.start(this.paddle.x + this.paddle.width / 2, gameConfig.paddle.y);
    }
    if (kind === "U") {
      this.lives = Math.min(gameConfig.rules.maxLives, this.lives + 1);
    }
    if (kind === "Z") {
      this.zapBottomRow();
    }
    if (kind === "R") {
      this.dropPool.rainSpawn(gameConfig.powerUps.rainSpawnCount);
    }
    if (kind === "G") {
      this.timers.activate("G", durations.G);
    }

    if (kind === "N") {
      // One detonation instead of a pickup jingle — and instead of ~70 per-brick beeps.
      this.deps.sfx.nukeDetonation();
    } else if (kind === "S") {
      this.deps.sfx.swarmPickup();
    } else if (kind === "J") {
      this.deps.sfx.jammerPickup();
    } else if (kind === "U") {
      this.deps.sfx.extraLife();
    } else if (kind === "Z") {
      // The row vaporizes silently brick-by-brick; one boom covers the sweep.
      this.deps.sfx.blastExplosion();
    } else {
      this.deps.sfx.capsulePickup();
    }
  }

  // ZAP vaporizes the bottom-most occupied row outright: full points (PAYDAY
  // applies), silver and gold die in one hit, but like a nuke it drops no
  // capsules and never chains BLAST.
  private zapBottomRow(): void {
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
    // Same idempotent clear trigger as damageBrick: ZAP can take the last row.
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
    this.grid.load(levelAt(level));
    this.resetServe();
  }

  private resetServe(): void {
    this.balls.forEach((ball, index) => {
      ball.active = index === 0;
      ball.velocity = { x: 0, y: 0 };
      ball.stuckOffsetX = null;
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
    this.particles.reset();
    this.detonation.reset();
    this.clearCountdown = 0;

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
    this.particles.reset();
    this.dropPool.reset();
    this.detonation.reset();
    this.timers.reset();
    this.wallArmed = false;
    this.clearCountdown = 0;
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

  private powerLabel(): string {
    // "MULTI x2" / "MULTI x3" while the ladder is stacked (fits the 13-char inset).
    const names = this.timers
      .activeNames()
      .map((name) => (name === POWER_UP_NAMES.M && this.multiTier >= 2 ? `${name} x${this.multiTier}` : name));
    if (this.wallArmed) {
      names.push(POWER_UP_NAMES.W);
    }
    if (this.detonation.active) {
      names.push(POWER_UP_NAMES.N);
    }
    if (names.length === 0) {
      return "- - -";
    }

    const joined = names.join(" ");
    if (joined.length <= POWER_LABEL_MAX_CHARS) {
      return joined;
    }
    // Too many active effects for the inset: cycle through them one per second.
    return names[Math.floor(this.tickCount / POWER_LABEL_CYCLE_TICKS) % names.length];
  }
}
