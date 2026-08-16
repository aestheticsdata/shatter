import type { BrickKind, BurstSpec, PowerUpKind } from "@interfaces/types";

export const gameConfig = {
  rules: {
    startLives: 3,
    ballSpeedMultiplier: 1,
    dropRate: 0.13,
  },
  loop: {
    tickMs: 1000 / 60,
    maxCatchUpSteps: 4,
    maxFrameDeltaMs: 50,
  },
  stage: {
    width: 480,
    height: 300,
  },
  field: {
    width: 372,
    height: 300,
    left: 3,
    right: 369,
    top: 3,
  },
  paddle: {
    y: 276,
    height: 7,
    baseWidth: 46,
    wideWidth: 72,
    narrowWidth: 30,
    initialX: 163,
  },
  ball: {
    size: 8,
    collisionInset: 1,
  },
  grid: {
    left: 6,
    top: 38,
    columns: 12,
    brickWidth: 30,
    brickHeight: 12,
  },
  speed: {
    base: 3.1,
    perLevel: 0.25,
    max: 4.6,
  },
  launch: {
    horizontalFactor: 0.55,
    verticalFactor: 0.83,
  },
  bounce: {
    maxAngleRad: 1.05,
  },
  powerUps: {
    durationsTicks: { E: 720, M: 180, L: 720, P: 480, B: 720, W: 0, T: 480, X: 600, J: 360, N: 0 } satisfies Record<
      PowerUpKind,
      number
    >,
    dropWeights: { E: 1, M: 1, L: 1, P: 1, B: 1, W: 1, T: 1, X: 1, J: 0.5, N: 0.3 } satisfies Record<
      PowerUpKind,
      number
    >,
    laserCadenceTicks: 26,
    laserFirstShotDelayTicks: 10,
    shotSpeed: 5.5,
    maxShots: 6,
    dropFallSpeed: 1.3,
    maxDrops: 3,
    maxExtraBalls: 2,
    multiBallAngleRad: 0.6,
    tempoTimeScale: 0.6,
    wallY: 294,
    splashFlashTicks: 3,
  },
  scoring: {
    clearBonusPerLevel: 500,
    paydayMultiplier: 2,
  },
  effects: {
    particlePoolSize: 512,
    particleGravity: 0.12,
    deathFlashTicks: 2,
    // Ordinary last-brick kill: short freeze so the shatter plays before the clear screen.
    clearDelayTicks: 20,
    brickDeathBurst: {
      chunkCount: 6,
      minChunkSize: 2,
      maxChunkSize: 2,
      minSpeed: 0.6,
      maxSpeed: 1.6,
      minLifeTicks: 15,
      maxLifeTicks: 15,
    } satisfies BurstSpec,
    nukeBurst: {
      chunkCount: 10,
      minChunkSize: 2,
      maxChunkSize: 3,
      minSpeed: 1.4,
      maxSpeed: 3,
      minLifeTicks: 30,
      maxLifeTicks: 45,
    } satisfies BurstSpec,
    nuke: {
      ringSpeed: 14,
      maxSweepTicks: 48,
      fieldFlashTicks: 3,
      // Must be >= 1: Detonation.beginHold clamps, since a zero hold would never
      // enter the holding branch and the empty-grid sweep would spin forever.
      holdTicks: 30,
    },
  },
} as const;

export const POWER_UP_NAMES: Record<PowerUpKind, string> = {
  E: "WIDE",
  M: "MULTI",
  L: "LASER",
  P: "PIERCE",
  B: "BLAST",
  W: "WALL",
  T: "TEMPO",
  X: "PAYDAY",
  J: "JAMMER",
  N: "NUKE",
};

export const BRICK_POINTS: Record<BrickKind, number> = {
  "1": 60,
  "2": 70,
  "3": 80,
  "4": 90,
  "5": 100,
  S: 150,
  G: 200,
};

export const BRICK_HIT_POINTS: Record<BrickKind, number> = {
  "1": 1,
  "2": 1,
  "3": 1,
  "4": 1,
  "5": 1,
  S: 2,
  G: 3,
};

export function ballSpeedForLevel(level: number): number {
  const { base, perLevel, max } = gameConfig.speed;
  return Math.min(max, base + level * perLevel) * gameConfig.rules.ballSpeedMultiplier;
}
