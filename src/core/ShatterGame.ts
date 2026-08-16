import { ballSpeedForLevel, gameConfig, POWER_UP_NAMES } from "@core/config/GameConfig";
import { levelAt } from "@core/levels/levels";
import { computePaddleBounceVelocity, relativePaddleHit } from "@core/physics/PaddleBounce";
import { Ball } from "@entities/ball/Ball";
import { BrickGrid } from "@entities/bricks/BrickGrid";
import { ShotPool } from "@entities/laser/ShotPool";
import { Paddle } from "@entities/paddle/Paddle";
import { DropPool } from "@entities/powerups/DropPool";
import { PowerUpTimers } from "@entities/powerups/PowerUpTimers";
import { InputController } from "@input/InputController";
import { zeroPad } from "@shared/format";

import type { Sound } from "@audio/Sound";
import type { BrickHit, PanelView, PowerUpKind, ScreenName, SplashFlash } from "@interfaces/types";
import type { CanvasRenderer } from "@render/CanvasRenderer";
import type { HiScores } from "@state/HiScores";
import type { Panel } from "@ui/Panel";
import type { Screens } from "@ui/Screens";
import type { StageScaler } from "@ui/StageScaler";

export interface ShatterGameDeps {
  renderer: CanvasRenderer;
  panel: Panel;
  screens: Screens;
  sound: Sound;
  hiScores: HiScores;
  scaler: StageScaler;
  lockTarget: HTMLElement;
}

const ENTRY_LENGTH = 3;
const ENTRY_COMMIT_DELAY_MS = 260;
const MAX_BALLS = 3;

// Longest label that fits the POWER inset at 7px Silkscreen.
const POWER_LABEL_MAX_CHARS = 13;
const POWER_LABEL_CYCLE_TICKS = 60;

// Dev-only level select (?level=N, 1-based); always 0 in production builds.
function resolveDebugStartLevel(): number {
  if (!import.meta.env.DEV) {
    return 0;
  }
  const requested = Number(new URLSearchParams(window.location.search).get("level"));
  return Number.isInteger(requested) && requested >= 1 ? requested - 1 : 0;
}

// Dev-only capsule drop-rate override (?droprate=0..1) to test power-ups quickly.
function resolveDebugDropRate(): number | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  const requested = Number(new URLSearchParams(window.location.search).get("droprate"));
  return Number.isFinite(requested) && requested >= 0 && requested <= 1 ? requested : null;
}

// Dev-only power-up grant at every launch (?power=BWX — a string of capsule letters).
function resolveDebugPowerKinds(): PowerUpKind[] {
  if (!import.meta.env.DEV) {
    return [];
  }
  const requested = new URLSearchParams(window.location.search).get("power") ?? "";
  return [...requested.toUpperCase()].filter((char): char is PowerUpKind => char in POWER_UP_NAMES);
}

export class ShatterGame {
  private screen: ScreenName = "title";
  private score = 0;
  private lives = gameConfig.rules.startLives;
  private level = 0;
  private entry = "";
  private booted = false;
  private wallArmed = false;
  private splashFlashes: SplashFlash[] = [];
  private tickCount = 0;
  private readonly debugStartLevel = resolveDebugStartLevel();
  private readonly debugDropRate = resolveDebugDropRate();
  private readonly debugPowerKinds = resolveDebugPowerKinds();

  private readonly paddle = new Paddle();
  private readonly grid = new BrickGrid();
  private readonly timers = new PowerUpTimers();
  private readonly dropPool = new DropPool();
  private readonly shotPool = new ShotPool();
  private readonly balls: Ball[] = Array.from({ length: MAX_BALLS }, () => new Ball());
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
      onAdvance: () => this.advance(),
      onKeyDown: (event) => this.onKeyDown(event),
    });
  }

  start(): void {
    this.deps.scaler.fit();
    this.input.attach();
    this.grid.load(levelAt(0));
    this.resetServe();
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.frame);
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
      grid: this.grid.rows,
      paddle: { x: this.paddle.x, width: this.paddle.width, laserActive: this.timers.isActive("L") },
      balls: this.balls,
      drops: this.dropPool.drops,
      shots: this.shotPool.shots,
      flashes: this.splashFlashes,
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

    this.tickCount++;
    this.splashFlashes = this.splashFlashes.filter((flash) => --flash.ticksLeft > 0);

    const expired = this.timers.tick();
    if (expired.includes("E") && !this.timers.isActive("J")) {
      this.paddle.setWidth(gameConfig.paddle.baseWidth);
    }
    if (expired.includes("J") && !this.timers.isActive("E")) {
      this.paddle.setWidth(gameConfig.paddle.baseWidth);
    }

    if (this.timers.isActive("L") && --this.laserCountdown <= 0) {
      this.laserCountdown = gameConfig.powerUps.laserCadenceTicks;
      this.shotPool.fireFromPaddle(this.paddle);
      this.deps.sound.beep(880, 0.04, "square", 0.035);
    }
    this.shotPool.step(this.grid, (hit) => this.damageBrick(hit));

    for (const ball of this.balls) {
      if (ball.active) {
        this.moveBall(ball);
      }
    }
    if (!this.balls.some((ball) => ball.active)) {
      this.die();
    }

    this.dropPool.step(this.paddle.bounds, (kind) => this.applyPowerUp(kind));
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
        this.deps.sound.beep(240, 0.05, "square", 0.05);
      }
      if (ball.x >= right - size) {
        ball.x = right - size;
        ball.velocity.x = -Math.abs(ball.velocity.x);
        this.deps.sound.beep(240, 0.05, "square", 0.05);
      }
      if (ball.y <= top) {
        ball.y = top;
        ball.velocity.y = Math.abs(ball.velocity.y);
        this.deps.sound.beep(240, 0.05, "square", 0.05);
      }

      const paddleTop = gameConfig.paddle.y;
      const paddleCatch =
        ball.velocity.y > 0 &&
        ball.y + size >= paddleTop &&
        ball.y + size <= paddleTop + gameConfig.paddle.height + 3 &&
        ball.x + size > this.paddle.x &&
        ball.x < this.paddle.x + this.paddle.width;
      if (paddleCatch) {
        const relativeHit = relativePaddleHit(ball.centerX, this.paddle.bounds);
        ball.velocity = computePaddleBounceVelocity(relativeHit, this.speed(), gameConfig.bounce.maxAngleRad);
        ball.y = paddleTop - size;
        this.deps.sound.beep(420 + relativeHit * 90, 0.08, "square", 0.06);
      }

      if (this.wallArmed && ball.velocity.y > 0 && ball.y + size >= gameConfig.powerUps.wallY) {
        this.wallArmed = false;
        ball.y = gameConfig.powerUps.wallY - size;
        ball.velocity.y = -Math.abs(ball.velocity.y);
        this.deps.sound.beep(320, 0.08, "square", 0.05);
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
      this.deps.sound.beep(180, 0.07, "square", 0.07);
      return;
    }

    this.score += hit.cell.points * this.scoreMultiplier();
    this.deps.sound.beep(560 + (5 - hit.row) * 45, 0.09, "square", 0.07);

    if (source !== "splash" && Math.random() < (this.debugDropRate ?? gameConfig.rules.dropRate)) {
      const { left, top, brickWidth, brickHeight } = gameConfig.grid;
      this.dropPool.trySpawn(left + hit.column * brickWidth, top + hit.row * brickHeight);
    }

    if (source === "ball" && this.timers.isActive("B")) {
      this.blastNeighbors(hit);
    }

    if (this.grid.remaining <= 0) {
      this.onLevelCleared();
    }
  }

  // Splash kills never chain and never drop capsules — one explosion per ball hit.
  private blastNeighbors(center: BrickHit): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;

    for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
      for (let deltaColumn = -1; deltaColumn <= 1; deltaColumn++) {
        if (deltaRow === 0 && deltaColumn === 0) {
          continue;
        }
        const neighbor = this.grid.hitAtCell(center.row + deltaRow, center.column + deltaColumn);
        if (!neighbor) {
          continue;
        }
        this.splashFlashes.push({
          x: left + neighbor.column * brickWidth,
          y: top + neighbor.row * brickHeight,
          ticksLeft: gameConfig.powerUps.splashFlashTicks,
        });
        this.damageBrick(neighbor, "splash");
      }
    }
  }

  private scoreMultiplier(): number {
    return this.timers.isActive("X") ? gameConfig.scoring.paydayMultiplier : 1;
  }

  private onLevelCleared(): void {
    const bonus = (this.level + 1) * gameConfig.scoring.clearBonusPerLevel * this.scoreMultiplier();
    this.score += bonus;
    this.deps.screens.updateClear(levelAt(this.level).name, zeroPad(bonus, 5));
    this.setScreen("clear");
    this.deps.sound.arp([523, 659, 784, 1046]);
  }

  private applyPowerUp(kind: PowerUpKind): void {
    const durations = gameConfig.powerUps.durationsTicks;

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
    if (kind === "M") {
      this.timers.activate("M", durations.M);
      const source = this.balls.find((ball) => ball.active);
      if (source) {
        const spread = gameConfig.powerUps.multiBallAngleRad;
        this.balls
          .filter((ball) => !ball.active)
          .slice(0, gameConfig.powerUps.maxExtraBalls)
          .forEach((ball, index) => ball.cloneFrom(source, index === 0 ? -spread : spread, this.speed()));
      }
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

    if (kind === "J") {
      this.deps.sound.arp([392, 196], 50);
    } else {
      this.deps.sound.arp([659, 880], 50);
    }
  }

  private die(): void {
    this.deps.sound.beep(140, 0.3, "sawtooth", 0.06);
    this.lives--;
    if (this.lives <= 0) {
      this.gameOver();
    } else {
      this.resetServe();
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
    this.level = this.debugStartLevel;
    this.buildLevel(this.level);
    this.deps.sound.arp([392, 523, 659]);
  }

  private buildLevel(level: number): void {
    this.grid.load(levelAt(level));
    this.resetServe();
  }

  private resetServe(): void {
    this.balls.forEach((ball, index) => {
      ball.active = index === 0;
      ball.velocity = { x: 0, y: 0 };
    });
    this.balls[0].followPaddle(this.paddle);
    this.paddle.setWidth(gameConfig.paddle.baseWidth);
    this.timers.reset();
    this.dropPool.reset();
    this.shotPool.reset();
    this.laserCountdown = 0;
    this.wallArmed = false;
    this.splashFlashes = [];

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
    this.deps.sound.beep(520, 0.07);
    for (const kind of this.debugPowerKinds) {
      this.applyPowerUp(kind);
    }
  }

  private gameOver(): void {
    this.deps.screens.updateOver(zeroPad(this.score, 6));
    this.setScreen("over");
    this.deps.sound.arp([392, 330, 262, 196], 130);
  }

  private afterOver(): void {
    this.refreshScoreRows();
    if (this.deps.hiScores.qualifies(this.score)) {
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

    if (event.key === " ") {
      // Space mirrors the mouse click: start on title, launch on serve, advance end screens.
      event.preventDefault();
      this.advance();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "p" && (this.screen === "play" || this.screen === "pause")) {
      this.setScreen(this.screen === "play" ? "pause" : "play");
      this.deps.sound.beep(300, 0.06);
    }
    if (key === "m") {
      this.deps.sound.toggleMuted();
    }
    if (event.key === "Escape" && (this.screen === "play" || this.screen === "pause" || this.screen === "serve")) {
      this.gameOver();
    }
  }

  private handleEntryKey(event: KeyboardEvent): void {
    if (/^[a-z0-9]$/i.test(event.key) && this.entry.length < ENTRY_LENGTH) {
      this.entry += event.key.toUpperCase();
      this.updateEntryText();
      this.deps.sound.beep(700, 0.04);
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

    if (event.key === "Enter" && this.entry.length > 0) {
      this.commitScore(this.entry);
    }
  }

  private commitScore(name: string): void {
    this.clearEntryCommitTimeout();
    if (this.screen !== "entry" || name.length === 0) {
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
      muted: this.deps.sound.muted,
    };
  }

  private powerLabel(): string {
    const names = this.timers.activeNames();
    if (this.wallArmed) {
      names.push(POWER_UP_NAMES.W);
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
