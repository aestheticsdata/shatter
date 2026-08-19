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
    bonusSpreadAmount: 0.3,
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
    // RUSH, the same knob pulled the other way. 1.8 puts the level-15 ceiling of
    // 4.6 px/tick at 8.28 — a field crossing in ~36 ticks, which reads as much
    // too fast from the first frame without being unplayable. Both scales are one
    // product in `moveBall`, so a TEMPO caught during a RUSH lands at 1.08.
    rushTimeScale: 1.8,
    wallY: 294,
    splashFlashTicks: 3,
    catchPopLifeTicks: 48,
    catchPopRiseSpeed: 0.45,
    // A fifth of a second: the ring has to read as a release, not as an effect
    // the player is meant to watch — the balls are already moving again.
    stasisRingLifeTicks: 12,
    // HOMING. 0.035 rad/tick is 2 deg, ~90 ticks to reverse against a 37-62
    // tick trip from paddle to grid: the ball curves, it does not snap.
    homingTurnRad: 0.035,
    // Re-pick the target on this clock as well as the moment it dies, so a ball
    // that has flown past its brick swings onto a nearer one.
    homingRetargetTicks: 12,
    // Floor on |vy| as a fraction of speed. Below it the turn is skipped and the
    // lock kept: a ball may not be steered into a flat rut it cannot climb out of.
    homingMinVerticalFraction: 0.35,
    // MIRROR's ghost paddle: 3 px of clear field above it, so the ceiling bounce
    // still has somewhere to happen when a ball goes past its end.
    mirrorY: 6,
    // PORTAL's mouths, high on the walls: the centre sits at 144, upper third
    // of the field. On the two 8-row levels (grid bottom 134) the strip
    // overlaps the last brick rows vertically — harmless, the mouths live on
    // the wall columns where no brick reaches, and a ball arriving beside a
    // brick just hits it. Raised three times in playtest; measure any future
    // move by where the CENTRE lands, not the top — the height-doubling grew
    // the mouth downward and made a 10 px raise invisible.
    portalTop: 120,
    // A 48 px mouth — about the paddle's own width, stood on end — so a ball on
    // an ordinary diagonal meets one instead of threading past it. The band
    // still ends at 198, far above the paddle at 276 and WALL's line at 294.
    portalHeight: 48,
    // Where an arriving ball is placed, measured in from the far wall. It has to
    // clear the bounce test it just came through, or the ball would ricochet
    // straight back out of the mouth it arrived from.
    portalInset: 4,
    // Refuses a second transit inside one tick's sub-steps. A real re-crossing
    // cannot happen: 358 px wall to wall at the steepest angle is 90+ ticks, and
    // an arriving ball is already travelling away from the wall behind it.
    portalCooldownTicks: 20,
    // MAGNET. Tuned against real fall budgets rather than feel: closing the full
    // 96 px takes ~127 ticks, and a capsule from the top brick row has 177 ticks
    // of fall left while one from the 7th row has only 121. So the magnet biases
    // a capsule toward the paddle without ever promising it. `pullMax` under the
    // 1.3 px/tick fall keeps the steepest slant at 47 degrees: capsules lean in,
    // they never dive. If a near miss reads as broken rather than as tension,
    // raise `pullMin` first — `rangeX` also decides how many tethers are drawn.
    magnet: { rangeX: 96, pullMax: 1.4, pullMin: 0.6 },
    // SINGULARITY. It opens mid-field: below the deepest grid, which bottoms out
    // at y 134, and 126 px clear of the paddle, so it can bend a ball off the
    // loss line rather than into it.
    singularity: {
      x: 186,
      y: 150,
      discRadius: 12,
      easeTicks: 12,
      // Inverse-square, floored at `minDistance` so the core is not a spike:
      // 0.36 / 0.09 / 0.02 px per tick squared at 30 / 60 / 120 px out.
      pullConstant: 320,
      minDistance: 30,
      // HOMING stands down inside this radius. Two guidance rules pulling one
      // ball in different directions reads as neither, and the orbit is the
      // more legible of the two.
      homingCutoff: 90,
      // A ball that will not leave is let go. The counter climbs by one per tick
      // inside `homingCutoff` and falls twice as fast outside it, so a curve
      // through the field costs nothing while a trapped orbit ends itself: the
      // pull fades from 150 ticks of holding and is gone by 180.
      holdDecay: 2,
      holdRelease: 150,
      holdFree: 180,
      // Capsules are dragged sideways on top of their fall, and swallowed at the
      // core. A swallowed capsule grants nothing — that is the risk.
      dropPull: 0.9,
      dropEatRadius: 10,
      // Debris ignores gravity near the core and spirals instead; the damping is
      // what turns the inward pull into a spiral rather than a straight dive.
      debrisConstant: 900,
      debrisDamping: 0.97,
      debrisEatRadius: 6,
    },
    // BUMPERS. Five discs of radius 9 in the empty band under the grid, so a
    // ball centre inside 9 + 4 px of one is touching it: at <= 2 px per
    // sub-step, a 26 px target cannot be tunnelled through.
    bumpers: {
      radius: 9,
      // The band. `topGap` is measured down from the bottom of whatever grid
      // the level loaded, and `bottom` leaves the lowest disc 27 px clear of
      // the paddle, so no ball can ever be pinned against the deck. The x range
      // keeps every disc off both walls, PORTAL's mouths included.
      topGap: 24,
      bottom: 240,
      left: 40,
      right: 332,
      // Rejected placements: this close to a disc already down, or to
      // SINGULARITY's core, which shares this stretch of field.
      minGap: 64,
      coreKeepOut: 40,
      placementTries: 40,
      flashTicks: 6,
      // Consecutive kicks with nothing else touched in between. A ball wedged
      // between two discs never comes down on its own, so the set lets go.
      streakLimit: 10,
    },
    rainSpawnCount: 4,
  },
  scoring: {
    clearBonusPerLevel: 500,
    paydayMultiplier: 2,
    // One BUMPERS kick, between a brick (60-200) and the clear bonus. PAYDAY
    // doubles it like everything else.
    bumperPoints: 100,
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
    // CHAIN's arc. Distances are in grid cells, not pixels, so a jump reaches
    // three columns sideways but only three rows up — the grid is 30x12, and
    // measuring in cells is what keeps the web inside the brick layout.
    chain: {
      cellRadius: 3.2,
      // Two per node, so the web branches instead of drawing one line.
      linksPerNode: 2,
      maxDepth: 3,
      // The real limiter: on a solid board this binds long before maxDepth.
      maxLinks: 6,
      boltTicks: 9,
    },
    // GHOST's fade: how long the wave takes to roll across the wall, each
    // brick flipping as the front passes it. Cosmetic — the collision follows
    // the timer alone, so the wall is already intangible while it still fades.
    ghostFadeTicks: 30,
    // QUAKE's shake. 24 ticks is 0.4 s, and the amplitude decays linearly over
    // them so the field settles rather than stopping dead. Whole game pixels:
    // the art is drawn at 3x, and a fractional offset would blur every block.
    quake: {
      shakeTicks: 24,
      amplitude: 4,
    },
    // CRITTER's grub. `stepSpeed` is a brick every 18 ticks — 30 px at 1.667 —
    // slow enough to watch it work and slow enough that the row it is eating is
    // still worth playing; over ground it has already cleared it doubles, so a
    // stripped row is crossed rather than paraded across. 15 s of life is about
    // four full rows of chewing, and it usually walks off the bottom first.
    critter: {
      lifeTicks: 900,
      stepSpeed: 1.667,
      emptyRowSpeed: 3.33,
    },
    // BOMB. The fuse is how long the run holds still while the paddle burns:
    // long enough to read as an explosion, short enough not to play the
    // punishment twice. No chunk outlives it, so the reset never snatches
    // debris out of the air.
    paddleBlast: {
      fuseTicks: 45,
      burst: {
        chunkCount: 10,
        minChunkSize: 2,
        maxChunkSize: 3,
        minSpeed: 0.8,
        maxSpeed: 3.2,
        minLifeTicks: 24,
        maxLifeTicks: 45,
      } satisfies BurstSpec,
    },
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
