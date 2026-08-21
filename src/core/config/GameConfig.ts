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
    // XWIDE: twice the WIDE deck. 144 is 39 % of the 366 px field and still
    // leaves 222 px of travel, so the deck is enormous without being parked
    // against both walls at once.
    extraWideWidth: 144,
    narrowWidth: 30,
    // SPLIT: the deck breaks into two 20 px halves either side of the hole.
    // Wider than `baseWidth` end to end, but only 40 px of it catches anything.
    //
    // The gap is the whole trap, and it has to be measured rather than guessed:
    // the band of positions a ball is actually lost from is roughly the gap less
    // the ball's 8 px, and a *diagonal* ball loses another 5 on top, because it
    // crosses the deck's 10 px catch band over several sub-steps and clips a
    // half's edge on one of them. At the 18 the ticket drafted, a ball arriving
    // at 0.5 rad drops through a 7.5 px window — too fine to aim the paddle's
    // hole at while steering it, and playtest could not hit it at all. 26 puts
    // that at 15.5 px, which is a hole the player can steer onto or away from.
    //
    // Past 20 a 20 px capsule fits through as well, from a band of `gap - 20`.
    // Taken deliberately: a trap that never costs anything is not a trap, and
    // losing the odd bonus down the same hole reads as the same accident.
    splitWidth: 66,
    splitGap: 26,
    initialX: 163,
    // The deck telescopes rather than jumping between widths: one pixel per
    // edge per tick. The rate is the spec and the durations follow from the
    // distance, so nothing here has to be kept in step with the widths above —
    // WIDE runs out over 13 ticks, XWIDE over 49, JAMMER shuts in 8.
    widthEasePxPerEdge: 1,
    // Only a capsule caught over another capsule is bounded. XWIDE from base is
    // 49 ticks and stays 49: watching it keep going after WIDE would have
    // stopped is the capsule, and capping that would be capping the effect.
    // What this exists for is XWIDE over a live JAMMER — 57 px an edge — and
    // the other swaps of that size.
    widthEaseSwapMaxTicks: 30,
    // How long the rail keeps the mark of a deck that shut on it. Only JAMMER
    // leaves them: a reward retracting is the player's own timer running out,
    // and a trap taking the wood away is the thing being said.
    railMarkTicks: 24,
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
    // STROBE (LASER+TEMPO): the cannons keep real time while the balls run at
    // 0.6. Half the cadence, because the fusion has to be worth more than the
    // slow motion took away from it.
    comboLaserCadenceTicks: 13,
    // NOVA (PIERCE+BLAST): the splash ring, in cells either side of the kill.
    // BLAST's own 1 is the 8 neighbours; 2 is the 5x5 block, 24 cells.
    comboBlastRadius: 2,
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
    // How long a clone is drawn smaller than it collides, per capsule. Both are
    // the tick the fan has spread wider than the 8 px sprite, so the balls reach
    // full size as separate objects rather than resolving out of one blob.
    //
    // MULTI: two clones are 1.2 rad apart (`ballFanRad` is an absolute angle
    // from vertical, so clone-to-parent can be zero — the chord that is always
    // there is clone-to-clone), which at ~4 px/tick clears 8 px inside 2 ticks.
    // 6 is that with room to be seen happening.
    //
    // SWARM: twelve balls over the same 1.2 rad are 0.218 rad apart, and
    // neighbour separation passes 8 px at t ~ 9.2 — 10 is the first tick twelve
    // balls are twelve things.
    multiBirthTicks: 6,
    swarmBirthTicks: 10,
    tempoTimeScale: 0.6,
    // RUSH, the same knob pulled the other way. 1.8 puts the level-15 ceiling of
    // 4.6 px/tick at 8.28 — a field crossing in ~36 ticks, which reads as much
    // too fast from the first frame without being unplayable. Both scales are one
    // product in `moveBall`, so a TEMPO caught during a RUSH lands at 1.08.
    rushTimeScale: 1.8,
    // TURBO, the same knob again and the only one that pays. 1.5 puts the
    // level-15 ceiling of 4.6 px/tick at 6.9 — quick enough to feel like a
    // boost, short of RUSH's 8.28, which is the trap's job. All three scales
    // are one product in `moveBall`: TEMPO under a TURBO lands at 0.9, and a
    // RUSH caught over one reaches 12.42 and about six sub-steps. That last one
    // is deliberate — a trap that speeds you up and a bonus that speeds you up
    // compose rather than cancel, and a TURBO that quietly did nothing under a
    // RUSH would read as a broken capsule.
    turboTimeScale: 1.5,
    // ANGEL puts the ball it saved back at this height: below the deck's 276,
    // so it rises through it and reads as caught at the last instant, and clear
    // enough of the 300 death line that the very next tick cannot drain it
    // again before the launch has turned it around.
    angelReturnY: 288,
    // GAMBLE's reel, above the deck. Ten faces at 6 ticks each is a second of
    // spinning — long enough to be read as a machine deciding, short enough
    // that the field is not on hold — and then the winner is held still for
    // `holdTicks` before it fires, so the result is seen *before* it happens
    // rather than inferred from whatever went off.
    gamble: {
      stepTicks: 6,
      reelTicks: 60,
      holdTicks: 18,
    },
    wallY: 294,
    splashFlashTicks: 3,
    catchPopLifeTicks: 48,
    catchPopRiseSpeed: 0.45,
    // Every pop rises at the same speed, so two spawned on the same spot never
    // separate — a same-tick pair (`DropPool.step` catches every drop in one
    // pass) prints over itself into a smear: SINGULARITY under VORTEX read
    // "SINVORTEXTY". A fresh label climbs in steps of this until it clears the
    // live ones. 10 is the 7 px label plus its 1 px shadow plus two of air.
    catchPopStackGap: 10,
    // A fifth of a second: the ring has to read as a release, not as an effect
    // the player is meant to watch — the balls are already moving again.
    stasisRingLifeTicks: 12,
    // HOMING. 0.035 rad/tick is 2 deg, ~90 ticks to reverse against a 37-62
    // tick trip from paddle to grid: the ball curves, it does not snap.
    homingTurnRad: 0.035,
    // Re-pick the target on this clock as well as the moment it dies, so a ball
    // that has flown past its brick swings onto a nearer one.
    //
    // It is also the reticle's whole travel, and that is a constraint rather
    // than reuse: four corner ticks that took longer to shut than a lock is
    // allowed to live would still be closing when their brick was re-chosen.
    homingRetargetTicks: 12,
    /**
     * How far outside the brick the reticle starts, in whole game pixels.
     *
     * Four, against the twelve above it, is one pixel of travel every three
     * ticks — four discrete steps, so the corners snap shut in stages rather
     * than gliding, which is the only way a 2×2 tick can move on a grid this
     * size and still be read as moving. Nothing is drawn at partial strength:
     * the marks are full green from the first frame, they are simply somewhere
     * else, and the distance left to travel is exactly how much steering the
     * ball has yet to earn.
     */
    homingMarkReach: 4,
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
    magnet: {
      rangeX: 96,
      pullMax: 1.4,
      pullMin: 0.6,
      // The reach opening out of the deck and closing back into it. What
      // arrives and leaves is the *range* and never the strength: a magnet that
      // warmed up everywhere at once would feel unreliable exactly where
      // catches are decided, and 96 px over 20 ticks is 4.8 a tick — nearly
      // four times the 1.3 a capsule falls, so the edge overtakes the field
      // rather than crawling after it, taking hold of each capsule in order of
      // distance as it sweeps past.
      reachTicks: 20,
    },
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
    // VORTEX. The same hole and every number above it, one and a half times
    // across and adrift: only what differs lives here, and `Singularity.reach`
    // derives the rest, so the two can never fall out of step.
    vortex: {
      scale: 1.5,
      // 21 px/s — about two thirds of the field over the 12 s it stays open. A
      // hole the player has to keep re-reading, not one that outruns the rally.
      driftSpeed: 0.35,
      // The box the centre stays inside. `top` clears the deepest grid, which
      // bottoms out at y 134, and `bottom` leaves 104 px to the paddle: that is
      // the property the fixed core's y was chosen for, that a hole above the
      // balls bends them off the loss line rather than into it. x is inset by
      // the 18 px disc and a margin, so a full-size disc clears both walls.
      left: 56,
      right: 316,
      top: 138,
      bottom: 172,
      // How far off horizontal it may set out, in radians. The box is 260 px
      // wide and 34 tall, so a steep heading is a hole that bounces top to
      // bottom and never crosses; 0.5 rad is a 29° drift that zigzags gently.
      driftMaxAngle: 0.5,
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
      // The rack lighting up and losing power. Per-disc counters and not a
      // blend, because the arrival is staggered and a single number cannot say
      // where five discs are: `arriveTicks` is one disc's own ring closing onto
      // the spot it will occupy, `staggerTicks` is the gap between one disc
      // starting and the next, and `leaveTicks` is every ring travelling back
      // out on the expiry. Twelve is the singularity iris exactly — already the
      // game's duration for an object arriving on the field.
      //
      // Six apart over five discs puts the last one down at tick 36, which is
      // slow enough to count them and 5 % of a 720-tick life.
      arriveTicks: 12,
      staggerTicks: 6,
      leaveTicks: 12,
      // Consecutive kicks with nothing else touched in between. A ball wedged
      // between two discs never comes down on its own, so the set lets go.
      streakLimit: 10,
    },
    // BANANA. The peel comes off the deck that ate the banana, arcs out and
    // lands on the paddle rail, where it hands the deck to its own momentum for
    // a second when it is swept over.
    banana: {
      peelWidth: 12,
      // The throw. A constant speed with the flight derived from it, rather
      // than a constant flight with the speed derived from it: the landing spot
      // can be anywhere from 40 to ~350 px away, and a fixed flight would make
      // the far one a streak five times faster than the ball ever moves. The
      // clamps are the two ends of the same arm.
      peelThrowSpeed: 12,
      peelFlightMinTicks: 8,
      peelFlightMaxTicks: 24,
      // Apex per tick of flight, for the reason the speed is constant: a longer
      // throw arcs higher, or it is a flat line drive. A mid-field throw runs
      // ~12 ticks and rises ~24 px; the longest rises 48.
      peelApexPerTick: 2,
      // A fourth peel pushes the oldest off the rail rather than being refused:
      // the newest is the one the player just earned and has to see land.
      maxPeels: 3,
      peelLifeTicks: 600,
      peelBlinkTicks: 60,
      // Rail kept clear either side of the deck, so a peel is never thrown
      // under the paddle already standing on it. It promises that only for the
      // instant of the throw, which is half of why a peel in the air is no
      // hazard: the deck can be standing on the landing spot 24 ticks later.
      peelClearX: 40,
      skidTicks: 60,
      // The slide is the paddle's own last movement, held and decayed. At the
      // 6 px ceiling `skidDecay` covers ~98 px over the 60 ticks and is at rest
      // by the end of them; a deck standing still still slides, at `skidMinVx`.
      // `skidDecay` is the first knob to reach for if the slide reads long.
      skidMaxVx: 6,
      skidMinVx: 1.5,
      skidDecay: 0.94,
      // No chained skid: a peel is ignored for this long after one ends.
      skidCooldownTicks: 30,
      // Absolute tracking only (see `pointToStage`): how long the deck takes to
      // glide back under a pointer that never stopped moving, and how much of
      // the gap it closes a tick. 0.18 over 20 ticks closes 98 % of it.
      resyncTicks: 20,
      resyncRate: 0.18,
    },
    rainSpawnCount: 4,
  },
  scoring: {
    clearBonusPerLevel: 500,
    paydayMultiplier: 2,
    // TURBO's cut, stacking with PAYDAY to x6 on a brick. Kills only: the
    // level-clear bonus and a BUMPERS kick take PAYDAY alone, or FINALE would
    // pay 42 000 and a ball parked between two discs would farm 300 a kick.
    turboMultiplier: 3,
    // JACKPOT (BLAST+PAYDAY), on splash kills only. It rides *on top of*
    // PAYDAY's own double, which is live by definition here, so a splashed
    // brick pays x4 — or x12 with TURBO over it, which is the point of lining
    // three of them up. The direct hit that started the splash pays its own
    // multiplier and is not touched.
    jackpotMultiplier: 2,
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
    // ANGEL's feathers, thrown from where the ball was caught. Wider and
    // longer-lived than a brick's debris — this is the one burst that has to be
    // seen at the very bottom of the field, under the deck, in the half second
    // the player is already braced for a lost ball.
    angelBurst: {
      chunkCount: 14,
      minChunkSize: 1,
      maxChunkSize: 2,
      minSpeed: 0.8,
      maxSpeed: 2.2,
      minLifeTicks: 20,
      maxLifeTicks: 34,
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
    // PIERCE's drill: a shower of hot 1 px sparks wherever the ball is grinding
    // through a brick, and nowhere else — the ball itself stays the ball. The
    // burst rides the debris pool but is painted in the drill's own tones, over
    // the brick chunks the kill throws anyway; 1 px against their 2 px is what
    // keeps the two readable as sparks off debris rather than more debris.
    pierceSparks: {
      burst: {
        chunkCount: 9,
        minChunkSize: 1,
        maxChunkSize: 1,
        minSpeed: 1,
        maxSpeed: 2.6,
        minLifeTicks: 8,
        maxLifeTicks: 18,
      } satisfies BurstSpec,
      // Both ends of the capsule, in the sparks' own idiom: the drill spins up
      // over the first 24 ticks — GHOST's arrival ratio — and loses its bite
      // over the last two seconds, each shower thinner than the one before,
      // so the player watches the drill dying while it still works. There is
      // no sprite to round off, so the warning has to be long enough to span
      // several drills; 120 ticks is two or three wall contacts at play speed.
      riseTicks: 24,
      fallTicks: 120,
    },
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
    // DEMAKE's dissolve, each way. The machine sags into the tube and back out
    // rather than flipping: an instant swap read as a dropped frame, not as
    // hardware giving up. 30 ticks is half a second — long enough to be seen
    // happening, short enough that a third of the capsule is not spent on it.
    //
    // `--demake-fade` in `css/tokens/motion.css` is this same half second, and
    // has to move with it: the side panel is DOM and dissolves on a CSS
    // transition while the field dissolves on this counter.
    demakeFadeTicks: 30,
    // GHOST's fade: how long the wave takes to roll across the wall, each
    // brick flipping as the front passes it. Cosmetic — the collision follows
    // the timer alone, so the wall is already intangible while it still fades.
    ghostFadeTicks: 30,
    // PAYDAY's tide, each way: how long the gild takes to run up the wall from
    // the bottom row and to drain back out through it. The fade above it exactly
    // — the two are the same length of half-second weather over a rule that
    // switched instantly, and the wall has no reason to gild faster than it
    // dissolves.
    paydayFadeTicks: 30,
    // XRAY's scan, each way: how long the bar takes to cross the live wall,
    // top to bottom on the catch and bottom to top on the expiry. Not a
    // strength ramp — what moves is how deep into the wall you can read, and a
    // pill is whole, sliced, or not there. 20 ticks over the deepest wall is
    // under 5 px a tick, so the bar still spends two and a half frames on every
    // 12 px row instead of jumping it.
    xrayFadeTicks: 20,
    // BLACKOUT's iris, each way. Longer than the other two because it is not a
    // cross-fade but a travelling edge: the lit ground collapses from the whole
    // field down to the ball's own pool, and 45 ticks is what it takes to read
    // as a light dying rather than as a wipe. Catching the capsule fires a
    // 0.35 s power-down, so the sound is the switch and this is the lights
    // going with it.
    blackoutFadeTicks: 45,
    // PORTAL's door, each way: how long the mouths take to cut open from their
    // own centre line and to pinch shut again. Twenty rather than the fade's
    // thirty because a door is a mechanism and not a dissolve — 48 px at 1.2 a
    // tick per lip, more than twice the speed the stripes inside it scroll at,
    // so the aperture visibly outruns its own contents.
    //
    // Spent out of the capsule's own 1800 ticks at the far end, not after them:
    // the mouth is a hitbox, and a hitbox that outlives its timer would be the
    // first in the game.
    portalFadeTicks: 20,
    // WALL's bar writing itself out of the deck, and being spent. A charge is
    // deliberate and spending is not, so the two are different lengths: 366 px
    // of field either way from the origin means 24.4 px a tick going out and
    // 36.6 coming back in. The strike is the three ticks the two pixels the
    // ball actually struck stay white-hot.
    wallChargeTicks: 15,
    wallDischargeTicks: 10,
    wallStrikeTicks: 3,
    // FLIP's turn, each way. The field does not switch over: it rotates about
    // its own centre, shrinking just enough on the way round to clear the wall
    // frame, and rotates back out when the capsule expires. 30 ticks is the
    // same half second DEMAKE sags in — long enough to be seen turning, short
    // enough that the ball is only unreadable for a moment — and it is what the
    // catch's four-note tumble is scored to.
    flipTurnTicks: 30,
    // TURBO's spool, each way. The balls do not jump to 1.5x, they wind up to
    // it and wind back down — half a second, the same as the turn above, and
    // long enough that the boost is felt arriving rather than noticed after the
    // fact. The streak grows out of the ball over the same ramp.
    turboSpoolTicks: 30,
    /**
     * RUSH's surge, each way — the shortest ease in the game, deliberately.
     *
     * 1.8 arriving in one frame is a ball lost to a frame rather than to a
     * decision, so the clock is eased like TURBO's. But RUSH is a trap made of
     * suddenness, and a leisurely wind-up would soften the one thing it is for:
     * 10 ticks is a sixth of a second, three times shorter than the spool, and
     * it costs the trap about 8 ticks of displacement across its 300.
     *
     * The streak reads the same blend, which is the whole idiom here. A smear is
     * a distance, so the honest way to ramp one is length: the far copy noses
     * out of the back of the 8 px sprite and the near one appears in the gap
     * behind it, instead of 3 px of solid red popping into being at full size.
     */
    rushSurgeTicks: 10,
    /**
     * TEMPO's drift, each way, and the clock its pace ghost is drawn on.
     *
     * 12 ticks costs about 2.4 ticks of displacement at the front and gives
     * them back at the tail — 5 % of TEMPO's 480, which is the cheapest ease in
     * the wave for the longest capsule in it.
     *
     * The ghost's offset is the accumulated debt *times this blend*, so the
     * marker slides out of the ball as the clock winds down and is overtaken by
     * the ball on the way back out. The debt itself only ever grows: scaling it
     * is what makes the departure a mirror rather than a marker that vanishes.
     */
    tempoDriftTicks: 12,
    /**
     * GLUE's resin, wetting the deck and drying off it.
     *
     * A ceiling and not a divisor. The film creeps out from each half's own
     * centre at `glueCreepPx` a tick, so a 20 px SPLIT half and a 144 px XWIDE
     * deck wet at the same *visible* speed rather than the same duration — the
     * wide one simply takes longer to finish, which is what a spreading liquid
     * does. Twenty ticks is what the widest of them needs (72 px a side at 4 a
     * tick is 18), so nothing is ever caught half-wet by its own clock.
     *
     * Twenty is bounded above by flight time, too: the trip from deck to grid is
     * 37-62 ticks, so a ball that left as the capsule was caught is back in 37
     * at the earliest, and this leaves at least seventeen ticks of a fully wet
     * deck before any ball can return. No ball ever sticks to a deck that does
     * not already look sticky.
     *
     * The dry-down runs over the capsule's *last* twenty ticks rather than the
     * twenty after it, so the resin is gone by the time the POWER inset clears.
     */
    glueFadeTicks: 20,
    glueCreepPx: 4,
    // How far a parked ball rides above the deck, sitting on the resin rather
    // than on the wood — and the length of the thread under it. Three pixels is
    // the most a ball can be lifted before the gap reads as a ball that missed.
    glueLiftPx: 3,
    /**
     * SPLIT's tear, each way — the deck coming apart, and welding back.
     *
     * Not a fade over a picture like the five above it: the hole *is* the trap,
     * so this eases the simulation. `splitGap()` reads the blend, and the catch
     * tests, MIRROR's ghost and a glued ball all read `splitGap()` — a drawn
     * hole that is not a real hole is the one disagreement SPLIT cannot afford.
     *
     * 11 ticks buys the fairness window. The gap has to be wider than the 8 px
     * ball before anything can drop through it, and it crosses 8 around the
     * sixth tick from a base-width deck, because the width ease is running at
     * the same time and the gap is derived from the width. So the player gets
     * four or five ticks of a crack they can see and steer away from before the
     * deck is a trap. Rushing this to 4 or 5 would make SPLIT a hole that
     * appears under a ball already over it.
     */
    splitTearTicks: 11,
    // The weld: the seam flashes on the tick the gap reaches 0. Two ticks is a
    // spark, not an animation — the halves arriving is the event, and this is
    // the only thing on screen that says the deck is whole again.
    splitWeldFlashTicks: 2,
    // Chunks off the seam on the tick it cracks. Small on purpose — a brick
    // dying throws 6 of these and a paddle is not more important than a brick.
    // Short-lived too: the debris must be gone before the hole it announced is
    // wide enough to matter, or it reads as the hole rather than as the tear.
    /**
     * MIRROR's reflection resolving onto the ceiling, and leaving it.
     *
     * Like SPLIT's tear and unlike the five fades above, this one eases the
     * *simulation*: the span the ghost is drawn at is the span it returns balls
     * off. A drawn surface narrower than the one that bounces is the lie the
     * capsule cannot afford, at the one end of the field the player is not
     * looking at.
     *
     * 12 ticks is 200 ms and 2 % of MIRROR's ten seconds, and it is deliberately
     * *not* the deck's one-pixel-an-edge — a reflection is not hydraulics, so it
     * takes the same fifth of a second to arrive whether the deck under it is
     * 46 px or a 144 px XWIDE.
     *
     * The height does not ease with it. A two-pixel-tall bounce surface would be
     * a coin flip nobody could see coming; a narrow full-height one is honest,
     * because it looks narrow. What the height does instead is unfold, anchored
     * at the bottom edge the balls actually meet.
     */
    mirrorFormTicks: 12,
    // The after-image: the line stays on the ceiling for a moment after the
    // surface is gone, walking down three tones. It bounces nothing — that is
    // the whole point of it. Without this, MIRROR's departure is a surface that
    // was there last frame and is not now, and the ball that would have come
    // back flat-ricochets off the ceiling with nothing to explain why.
    mirrorAfterImageTicks: 6,
    // What the reflection starts and ends as: a few pixels of line at the
    // mirrored centre, before it has opened into anything. Also the floor on the
    // span all the way down, so the retreat has something left to leave behind.
    mirrorSeedSpan: 6,
    splitTearBurst: {
      chunkCount: 8,
      minChunkSize: 1,
      maxChunkSize: 2,
      minSpeed: 0.5,
      maxSpeed: 1.7,
      minLifeTicks: 10,
      maxLifeTicks: 20,
    } satisfies BurstSpec,
    // QUAKE's shake. 24 ticks is 0.4 s, and the amplitude decays linearly over
    // them so the field settles rather than stopping dead. Whole game pixels:
    // the art is drawn at 3x, and a fractional offset would blur every block.
    quake: {
      shakeTicks: 24,
      amplitude: 4,
      // How long the wall takes to fall the row the shift just gave it. Twelve
      // pixels on a squared curve: about 3 px over the first five ticks and 9
      // over the next five, so it accelerates into its landing. Well inside the
      // rattle, and deliberately not the same length as it — the last thing the
      // player sees is the ground going quiet under a wall that has already
      // arrived, not two things stopping on the same frame.
      dropTicks: 10,
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
    // METEOR's volley. One rock per third of the 12 columns, so `count` is meant
    // to divide them evenly. `fallSpeed` 3 crosses the deepest grid in 44 ticks
    // and the shallowest in 36 — long enough to watch a lane being carved, and
    // 3 px against 12 px rows means no row is ever skipped between samples.
    // `driftSpeed` leans each rock toward the middle: over a full fall that is
    // under two columns, which converges the three lanes without crossing them.
    meteor: {
      count: 3,
      fallSpeed: 3,
      driftSpeed: 1.2,
      // The burning trail: a puff every other tick, so ~48 chunks are alive
      // across a volley — a fifth of the pool, with a full-field NUKE's 720
      // still able to land on top of it.
      trailBurst: {
        chunkCount: 2,
        minChunkSize: 1,
        maxChunkSize: 2,
        minSpeed: 0.2,
        maxSpeed: 0.8,
        minLifeTicks: 12,
        maxLifeTicks: 20,
      } satisfies BurstSpec,
    },
    // BOMB. The fuse is how long the run holds still while the paddle burns:
    // long enough to read as an explosion, short enough not to play the
    // punishment twice. No chunk outlives it, so the reset never snatches
    // debris out of the air.
    paddleBlast: {
      fuseTicks: 45,
      // How long the deck is still on screen as pieces. A quarter of the fuse,
      // and the first quarter of the debris' own 24-45 tick flight, so the
      // sprite pieces and the chunks are in the air together instead of one
      // after the other — and the 33 ticks of empty rail that follow are the
      // beat that says the life is gone.
      breakTicks: 12,
      // The kick on the three pieces. Outward for the outer two and nothing for
      // the middle one, which is the piece the charge was under: a deck coming
      // apart at two seams throws its ends and drops its middle. The lift is
      // small on purpose — these are pieces of paddle, not sparks, and they
      // answer to `particleGravity` from the first tick.
      shardSpread: 2.2,
      shardLift: 1.1,
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

// How long a peel thrown `distance` px is in the air. The thrower and the
// renderer drawing the parabola both need it, and the two may never disagree
// about where the peel is, so neither owns the formula.
export function peelFlightTicks(distance: number): number {
  const { peelThrowSpeed, peelFlightMinTicks, peelFlightMaxTicks } = gameConfig.powerUps.banana;
  return Math.max(peelFlightMinTicks, Math.min(peelFlightMaxTicks, Math.round(distance / peelThrowSpeed)));
}
