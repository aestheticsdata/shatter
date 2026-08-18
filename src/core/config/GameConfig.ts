import type { BrickKind, BurstSpec } from "@interfaces/types";

export const gameConfig = {
  rules: {
    startLives: 3,
    // 1UP stops counting here: the LIVES inset fits 5 reserve bars.
    maxLives: 6,
    ballSpeedMultiplier: 1,
    // THE bonus knob: chance (0..1) that a destroyed brick drops a capsule.
    // Crank to 1 while debugging (every brick drops one), set back to what
    // players should get before deploying — deploy.sh prints the value it ships.
    bonusSpreadAmount: 0.7,
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
  // Per-capsule durations, weights, names and colors are not here: they live one
  // row per capsule in `src/core/config/powerUps.ts`. What stays is the shared
  // machinery no single capsule owns.
  powerUps: {
    laserCadenceTicks: 26,
    laserFirstShotDelayTicks: 10,
    shotSpeed: 5.5,
    maxShots: 6,
    dropFallSpeed: 1.3,
    // 3 slots silently swallowed spawns whenever 3 capsules were airborne —
    // constant at ?droprate=1, where QA reads the missing capsules as a bug.
    maxDrops: 6,
    // MULTI ladder: field ball count per stacked catch; SWARM jumps straight to 12.
    multiTierBallCounts: [3, 6, 9],
    swarmBallCount: 12,
    // Half-width of the upward spawn fan; n=2 extras land at today's ∓0.6 rad.
    ballFanRad: 1.2,
    // Tiny per-ball angle jitter: same-tick stacked pickups (?power=MMM) would
    // otherwise spawn balls on identical trajectories that never diverge.
    ballFanJitterRad: 0.12,
    tempoTimeScale: 0.6,
    wallY: 294,
    splashFlashTicks: 3,
    catchPopLifeTicks: 48,
    catchPopRiseSpeed: 0.45,
    rainSpawnCount: 4,
  },
  scoring: {
    clearBonusPerLevel: 500,
    paydayMultiplier: 2,
  },
  effects: {
    // Must hold a full-field NUKE: FINALE's 72 bricks x 10 chunks with 30-45
    // tick lifetimes peak above 512, which recycled the earliest bursts mid-air.
    particlePoolSize: 1024,
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
