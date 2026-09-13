import type { BurstSpec } from "@interfaces/types";

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
    // The test console's knob (see DevConsole). `true` ships it to players, chord
    // and all, which is how someone else's machine gets to try a capsule on the
    // live site; `false` is the resting value. Read at construction, so flipping
    // it needs a reload — deploy.sh prints the value it ships.
    testConsole: true,
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
    giant: {
      // What the ball's diameter is multiplied by at full swell. 3 makes it
      // 24 px against a 30x12 brick, so the contact patch is up to two columns
      // and three rows — which is what makes a giant ball hit more than one
      // brick without anything having to arrange it.
      scale: 3,
      // The ring the ball's weight carries past what it actually touched, in
      // cells around the contact patch. BLAST's own splash is the same 1 and
      // the two are deliberately the same width: one is a kill throwing its
      // neighbours, this is a mass landing on them, and a heavier-looking
      // number would make GIANT the better BLAST rather than a different one.
      crushRadius: 1,
    },
    laserFirstShotDelayTicks: 10,
    shotSpeed: 5.5,
    maxShots: 6,
    dropFallSpeed: 1.3,
    // How much higher than the ceiling a capsule spawned across the top may
    // start. Rain falls *into* the field: the birth is a full pill-height above
    // the frame, and this is the scatter on top of it, so the shower arrives as
    // weather rather than as four pills crossing the deck line on the same frame
    // spread over 366 px — a set that is uncatchable by construction, which is
    // RAIN promising four capsules and delivering one or two.
    //
    // One-sided, unlike the x jitter it sits beside: a capsule may start higher
    // than the ceiling but never lower, or the entrance it exists to give back
    // would be skipped. `dropFallSpeed` then performs the whole transition — 8 px
    // plus up to 16 at 1.3 a tick is ~6 to ~18 ticks of a pill wiping into view
    // one row at a time from under the frame — so this is a distance and not a
    // fade counter, and a rained capsule enters on exactly the physics a
    // brick-dropped one does. 0 keeps the wipe and drops the weather.
    ceilingSpawnSpread: 16,
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
    /**
     * HAYWIRE: the trap that costs aim instead of speed.
     *
     * **The clock is global and the angle is not.** Every live ball is kicked on
     * the same tick, because what the player is being told is that the machine
     * has a fault — twelve balls jinking on twelve private schedules is twelve
     * faults, which is noise. Each ball then picks its own direction out of that
     * one event, so a SWARM scatters rather than turning as a flock.
     *
     * Nothing here touches speed. The kick is a rotation of the stored velocity,
     * so the trap composes with all four clocks in `ballTimeScale` for free and
     * has nothing to unwind when it ends.
     */
    haywire: {
      // A kick every quarter second. Slower and the fault is a rumour; faster
      // and no heading survives long enough to be read and played, which is the
      // whole difference between chaos you fight and chaos you watch.
      kickTicks: 15,
      // Up to ~34 deg either way, and never under ~3.5. The floor is the point:
      // a kick small enough to be absorbed by the next bounce is a kick that
      // read as the ball being wrong rather than as the machine being wrong,
      // and the sparks would have announced it either way.
      maxKickRad: 0.6,
      minKickRad: 0.06,
      // HOMING's floor, borrowed for a sharper reason. A ball kicked flat
      // rattles between the two walls until the timer runs out, and a trap that
      // ends by boring the player stopped being a trap. A kick that would cross
      // it turns the other way at the same size instead of being dropped —
      // dropping it spends the tick silently while the sparks say one landed.
      // Clamping to the cone's edge survives only as `glitchBall`'s fallback.
      minVerticalFraction: 0.35,
    },
    /**
     * ENGLISH: the deck's own travel, banked on the ball it just hit.
     *
     * The numbers are set against the flight rather than against the deck. A
     * ball leaves the paddle at 3.1 px a tick and meets the wall's underside
     * roughly 65 ticks later, so a spin that decays at `decay` is worth about
     * 48 ticks of turning — `maxSpinRad` times that is 0.67 rad, or a 38 deg
     * banana on the hardest whip the player can throw. Anything much past that
     * and the arc stops being a shot and starts being a spiral.
     *
     * `perPixel` is calibrated the same way round: a deliberate whip moves the
     * deck 6-8 px in a tick, which is where the clamp bites. Ordinary tracking
     * puts on a fraction of it, which is the capsule being *usable* rather than
     * a special move — you steer to the ball, and how you got there is the shot.
     */
    english: {
      // Radians of turn a tick, per pixel the deck travelled in the tick it hit.
      perPixel: 0.0022,
      maxSpinRad: 0.014,
      // Below this the deck was tracking, not whipping, and the ball flies
      // straight. Without it every return curves a little and the capsule reads
      // as the ball being drunk rather than as the player having a tool.
      minPaddleVx: 0.8,
      // What is left of the spin a tick later. The capsule's own end, and the
      // reason the effect never has to be switched off a ball: the curve runs
      // out on its own, so a spin still on a ball when the timer expires simply
      // straightens out over the next couple of seconds.
      decay: 0.99,
      // Below this the arc is under a tenth of a degree a tick and nothing on
      // screen can show it, so it is spent — which is also what puts the last
      // fleck out.
      minSpinRad: 0.0004,
      // A wall mirrors the sense of a spin and takes half of it: the ball is
      // still turning, the other way and less. Negative because that *is* the
      // mirroring, and one number rather than two so the two facts cannot be
      // retuned apart.
      wallKeep: -0.5,
      // HOMING's floor again, and the loosest of the three uses: a curve that
      // would take the heading flatter than this simply does not apply this
      // tick, exactly as HOMING skips its turn. The ball rides the limit rather
      // than being clamped onto it, and the next bounce hands the arc back.
      minVerticalFraction: 0.2,
    },
    /**
     * SNAP: the 45-degree lattice, and the marks a snapped bounce leaves.
     *
     * The cell is the brick's own height, which is the one measure the field is
     * already built on — a lattice on any other pitch would be a second grid
     * arguing with the wall. It divides the 372 px field into 31 columns and the
     * 300 px of height into 25 rows, so nothing is cut off at either edge.
     *
     * The dashes are the promise the snap makes: three of them, one cell apart
     * down the new diagonal, which is far enough to be read as a direction and
     * short enough that they are gone before the ball reaches the end of them.
     */
    snap: {
      cell: 12,
      markTicks: 12,
      dashes: 3,
      dashStep: 7,
      bracketArm: 3,
    },
    /**
     * TRACER: the thread a falling ball pays out, and the pip it pins on the
     * rail.
     *
     * `payOutTicks` and `letGoTicks` are the capsule's two ends and are
     * deliberately different — 15 in, 20 out. Arrival is a thread being paid out
     * ahead of a ball the player is already tracking and wants to be quick;
     * departure is the guide being taken away, and the slower hand is what stops
     * it reading as the capsule having failed rather than expired.
     *
     * `slackSag` and `slackWidth` are the held cue: a climbing ball hangs this
     * many pixels of rope under itself, swinging this far either side. Both are
     * small on purpose. The cue has to say "armed, nothing to predict" from the
     * corner of the eye and must never be mistaken for a live guide pointing
     * somewhere — it is a shape, and the shape is "slack".
     */
    tracer: {
      payOutTicks: 15,
      letGoTicks: 20,
      pipWidth: 7,
      pipHeight: 2,
      slackSag: 12,
      slackWidth: 4,
      // The thread is drawn as a dotted line rather than a solid one: SNAP's
      // dashes already run *along* a diagonal, and a solid rule down the field
      // would be the heaviest thing on it. One pixel lit in every two reads as a
      // thread at this scale and costs the field half as much ink.
      dotPitch: 2,
    },
    /**
     * ERODE: how far a worn brick pulls inside its own 30x12 cell, in whole
     * pixels off each edge, and the grains that come off it while it does.
     *
     * **The two axes are different numbers and the ticket's single 60 % could
     * not be one.** A ball is 8 px across and collides on four corners inset
     * 1 px, so it needs better than 6 px of clear air to thread anything. Take
     * 60 % off both axes of a 30x12 cell and the lanes between columns come out
     * at 12 px — twice what is needed — while the galleries between rows come
     * out at 4.8, which is a channel the ball can see and cannot enter. So the
     * cell is worn on its own terms: `insetX` opens a 10 px lane the ball
     * genuinely threads, and `insetY` opens a 6 px gallery it does not, which is
     * the wall reading as a lattice from a capsule that is honestly about
     * columns.
     *
     * `insetY` is 3 and may not be 4, and that is a collision fact rather than a
     * taste one: at 4 the brick is 4 px tall, thinner than the 6 px between the
     * ball's own top and bottom corners, and a ball crossing it at any speed can
     * have both corners outside it and pass straight through a brick that is
     * still there. At 3 the brick is exactly 6 and the corner test cannot miss
     * it — which is also why the sub-step loop needs nothing added for TURBO and
     * RUSH: it already caps a sub-step at 2 px an axis.
     *
     * Both are spent in **whole pixels**, so the collider is always exactly the
     * rectangle being painted. A brick worn at 3.4 px and drawn at a rounded 3
     * is a brick with half a pixel of hitbox hanging off it, and the player
     * bouncing off nothing is the one thing a capsule about holes may not do.
     */
    erode: {
      insetX: 5,
      insetY: 3,
      // Grains per brick, per seam. Three is enough to read as a trickle at a
      // glance across a 60-brick wall and few enough that the wall does not
      // disappear behind its own dust.
      grains: 3,
      // How far a grain falls below its seam before it is recycled, and how fast
      // it goes. The fall is a hair over a brick's own height so the trickle
      // reaches the brick beneath it — the mortar is going somewhere — and the
      // speed is under a pixel a tick so it reads as sifting rather than as rain.
      grainFall: 14,
      grainSpeed: 0.55,
      // The puff a ball knocks off a brick it has worn thin, and the one thing
      // the capsule adds to a bounce that was not already there. A clip inside
      // the wall sounds exactly like a clip on the front of it — the clank is
      // the brick's, not the lane's — so this is what says the ball is in
      // there. Four chunks and half a second, well under the six a kill throws:
      // a rally down a lane is a dozen of these, and a death's worth of debris
      // each time would bury the wall the player is trying to read.
      clipBurst: {
        chunkCount: 4,
        minChunkSize: 1,
        maxChunkSize: 2,
        minSpeed: 0.4,
        maxSpeed: 1.1,
        minLifeTicks: 10,
        maxLifeTicks: 26,
      },
    },
    /**
     * GRAVEL: what a killed brick leaves on the way down.
     *
     * **The pips are a drop, not debris, and every number here follows from
     * that.** They pay points, so they are on the capsule side of the game's
     * oldest economy line — the one that says a NUKE, a ZAP, the grub, a meteor
     * and a PYRE crater take the wall without paying it out. They are caught on
     * the deck, so they have to be *reachable*: a chip that fell like debris
     * would be a reward the player watches go past.
     *
     * `maxFall` is the whole of that. Under gravity alone a pip leaving the top
     * row arrives at the deck at 6.4 px a tick, which is most of a paddle's
     * height in one frame — it would cross the catch band between two ticks and
     * read as a chip that went through the deck. Capped at 3.2 it accelerates
     * for the first 36 ticks, settles, and takes about a second and a half to
     * come down: long enough to be a decision, short enough that the kill it
     * came out of is still the thing on screen.
     *
     * `drag` is on the horizontal only, and it is what keeps the decision
     * *local*. A pip thrown at 1.9 px a tick with no drag travels 165 px
     * sideways over that fall — across half the field, so the choice stops
     * being "chase the gravel or cover the ball" and becomes "the gravel went
     * somewhere". At 0.97 a tick the whole horizontal budget is about 60 px and
     * a typical one is thirty: the shower lands under the brick that threw it.
     */
    gravel: {
      // Per kill, rolled per brick. The ticket's four to six, and the reason it
      // is a range rather than five: a fixed count over a row of twelve reads
      // as a machine dispensing, and the wall is supposed to be crumbling.
      minPips: 4,
      maxPips: 6,
      // **The cap, and the ticket's note about a NUKE answered as a pool rather
      // than as a clamp.** Sixty-four is a NOVA blast's worth and a little over:
      // 25 cells asking for five each is 125, so the widest thing on the board
      // spends the pool and stops, which is a shower the player can read instead
      // of a screen of stone. A full pool simply gives no more — never a
      // recycled slot, because a pip vanishing mid-fall is a reward taken back.
      poolSize: 64,
      // What one is worth, and what a kill is worth if you take all of it:
      // 120-180 on top of a brick's own 60-200, which is roughly doubling a
      // brick and is only ever collected by leaving the ball to look after
      // itself. PAYDAY doubles it and TURBO does not, by the rule the bumper
      // kick and the clear bonus already follow — the triple is for kills.
      points: 30,
      // A chip, in whole pixels, and **four rather than three because of the
      // starfields**. The background palette's own rule is that a speck tone
      // only ever lands on a 1-3 px detail — stars, nodes, landing pads — so
      // three is exactly the size of the largest thing already scattered across
      // this field, and a chip that size is a reward the player has to pick out
      // of the sky. Four is over the top of that rule and still nothing like a
      // pill: it leaves a 2x2 core between the lit corner and the dark one, so
      // it reads as a block with a light on it rather than as a checker.
      size: 4,
      // The scatter off the dead brick. Slower than the debris burst it is
      // thrown alongside (0.6-1.6) so the pips visibly separate from their own
      // dust inside the first few ticks — the dust is what happened, the pips
      // are what to do about it.
      minSpeed: 0.5,
      maxSpeed: 1.4,
      // Under the debris' own 0.12, for `maxFall`'s reason one rung earlier: a
      // pip has to be catchable, and a catchable thing falls slower than the
      // wreckage it came out of.
      gravity: 0.075,
      maxFall: 3.2,
      drag: 0.97,
      // How long the lit corner holds before it moves round. Seven ticks is
      // about nine turns over a pip's fall — a tumble rather than a flicker,
      // and off the frame count so a shower of them is never in step.
      tumbleTicks: 7,
      // The catch, as a puff of the capsule's own stone. Small: this fires up
      // to sixty times in a shower, and a death's worth of debris a chip would
      // bury the field the player is trying to read.
      catchBurst: {
        chunkCount: 3,
        minChunkSize: 1,
        maxChunkSize: 1,
        minSpeed: 0.4,
        maxSpeed: 1.2,
        minLifeTicks: 8,
        maxLifeTicks: 16,
      },
      /**
       * The cracks the wall wears while the capsule is live, and the fault that
       * puts them there.
       *
       * `wipeSpan` is the share of the fade the front spends crossing the wall,
       * and the rest is what one brick spends splitting: at 0.55 the fault
       * reaches the last column just past halfway through the half second, and
       * every brick still has 45 % of it to open its own cracks in. Both at
       * once is the point — a wipe with no per-brick growth is a curtain, and
       * per-brick growth with no wipe is the whole wall cracking on one frame.
       *
       * Left to right, because the two fronts already on this field are not:
       * PAYDAY's tide runs up the rows and XRAY's bar runs down them. A fault
       * travelling along a course of masonry is the one direction left, and it
       * is the right one for the idiom.
       *
       * `jitter` is how far a cell's own turn may slip behind where the front
       * is. Without it the fault is a ruler crossing the wall; with it the
       * column ahead has started before the column behind has finished, and it
       * reads as stone. **Behind and never ahead**, and the crossing is
       * shortened by exactly this much to pay for it: a slip that could push a
       * cell past the end of the wipe is a cell that never finishes splitting,
       * which would leave it a pixel short of cracked and shedding grit for the
       * whole twelve seconds.
       */
      crack: {
        wipeSpan: 0.55,
        jitter: 0.12,
        // Fractures per brick face, and how far each walks. Two of five is ten
        // dark pixels on a 28x10 body — enough to read as split at a glance
        // across sixty bricks, few enough that the wall keeps its own colour
        // for the twelve seconds it wears them.
        fractures: 2,
        fractureLength: 5,
        // The dusting, per brick, while that brick is actually splitting. Gone
        // by the time it has set, so the grit is the arrival rather than a
        // weather effect the wall wears for twelve seconds.
        grit: 4,
        gritFall: 9,
      },
    },
    /**
     * PYRE: the capsule that spends a ball for a crater.
     *
     * **It brings its own ammo.** The ticket had it arm whatever the field
     * happened to be carrying, and the field is carrying one ball most of the
     * time — a capsule whose rule is that the last ball never burns is a
     * capsule that does nothing at all on a single-ball field, which is the
     * loudest way there is to ship a dud. So the catch tops the field up the
     * way MULTI's first tier does, and the ten seconds are what the two
     * newcomers are for: catch it, and you are holding two grenades and the
     * ball you started with.
     *
     * `ballCount` is deliberately MULTI's own first rung rather than a number
     * of its own. It goes through `topUpBalls`, so a swarm or a stacked MULTI
     * already over it is left exactly alone — the ammo is topped up, never
     * capped.
     */
    pyre: {
      ballCount: 3,
      // The crater, in **cells** — the reading CHAIN's `cellRadius` already
      // uses, and the only one "a 2-brick radius" can honestly mean on a grid
      // of 30x12 cells. Two brick widths is a 60 px disc that takes forty
      // bricks; two brick heights is a 24 px one two columns wide. Measured in
      // cells it is thirteen bricks in a plus five wide and five tall, which is
      // a fifth of a heavy row for one ball — and the shockwave is drawn as the
      // ellipse those cells actually make, so the ring the player reads is the
      // crater they got.
      cellRadius: 2,
      // The flame crown, and the wisp either side of it. One counter per ball
      // runs 0 to `crownTicks + smokeTicks`: the top band is the fire and the
      // bottom band is smoke, so a crown lighting comes up through a wisp and a
      // crown going out falls back into one, off a single number that cannot
      // disagree with itself. It is also what makes a ball that stops being
      // eligible — two balls crossing, so the reserve changes hands — hand its
      // fire over rather than teleport it.
      crownTicks: 18,
      smokeTicks: 12,
      // Expiry: every crown left standing is bumped past full by this much per
      // ball, so they hold and then fall in sequence instead of all going out
      // on one frame. Eight ticks is far enough apart to be read as one after
      // another and close enough that four balls are done inside half a second.
      gutterStaggerTicks: 8,
      // The blast, as a picture. Three frames of white — the ticket's
      // flash-whiten, and the ball's last frame is in them — then the fireball
      // shrinking back into itself while the ring runs out to the full crater.
      // The kill is not on this clock: every brick inside the radius dies on
      // the click, and the ring is the announcement, exactly as CHAIN's bolts
      // outlive the bricks they arced between.
      blastTicks: 24,
      flashTicks: 3,
      // The field takes the hit. Shorter and shallower than QUAKE's 24 at 4 —
      // this is one ball going up inside the wall, not the wall dropping a row,
      // and the two have to be told apart with the eyes shut.
      shakeTicks: 16,
      shakeAmplitude: 3,
      // What the ball itself throws, on top of the debris the thirteen bricks
      // already throw for themselves. Hot sparks rather than material — this is
      // the one burst in the game that comes off something that was neither a
      // brick nor the deck, and PIERCE's shower is already the answer to that:
      // a spark is hot, not branded, so the fireball is white-hot whatever it
      // went up against.
      //
      // Bigger and longer-lived than a drill's shower because it is one event
      // and not a grind: sixteen at up to 3.2 px a tick reach a brick's width
      // out inside ten ticks, which is the fireball spreading rather than a
      // puff sitting where the ball was.
      fireBurst: {
        chunkCount: 16,
        minChunkSize: 1,
        maxChunkSize: 3,
        minSpeed: 0.8,
        maxSpeed: 3.2,
        minLifeTicks: 14,
        maxLifeTicks: 34,
      },
    },
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
    // BANANA. The peels come off the deck that ate the banana, arc out and
    // land on the paddle rail, where they hand the deck to its own momentum for
    // a second when one is swept over.
    banana: {
      peelWidth: 12,
      // Two or three peels a catch, rolled fresh every time: a fixed three is a
      // number the player learns once and then stops reading the rail for. One
      // of them is committed to each side of the deck before the rest roll
      // free, because a trap that can leave you a clear side to retreat to is
      // luck rather than a trap — a deck against a wall has only the one side
      // to be thrown at and takes them all there.
      peelsMinPerDrop: 2,
      peelsMaxPerDrop: 3,
      // Rail kept clear between two peels, and deliberately small: it is there
      // so two peels never melt into one 24 px smear, not to space them out.
      // Anything wider starts pushing them toward even intervals, which is the
      // one thing the scatter may not look like — at 4 px they can land almost
      // shoulder to shoulder and still read as two.
      peelMinGap: 4,
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
      // One catch's worth at its biggest, so a second BANANA replaces the rail
      // rather than adding to it: the newest peels are the ones the player just
      // earned and has to see land, and the set they displace leaves through
      // its blink.
      maxPeels: 3,
      peelLifeTicks: 600,
      peelBlinkTicks: 60,
      // Rail kept clear either side of the deck, so a peel is never thrown
      // under the paddle already standing on it, and the line the sides are
      // divided along. It promises that only for the instant of the throw,
      // which is half of why a peel in the air is no hazard: the deck can be
      // standing on the landing spot 24 ticks later.
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
    // GIANT's swell, each way. The ball is the one object on the field the
    // player is tracking every frame, so it may not jump size: 24 ticks takes
    // it 8 px -> 24 px in even steps of two, which is one new sprite every
    // three ticks and reads as growth rather than as a pop. Long enough to be
    // seen happening, short enough that a ball is at full weight well before
    // its first return trip (37 ticks at the quickest).
    giantFadeTicks: 24,
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
     * HAYWIRE's fray, each way, and the scale on every kick it throws.
     *
     * The magnitude is the blend, which is the whole of both transitions: the
     * first kicks are nudges the player barely has to answer, the middle of the
     * capsule is the full 34 deg, and the last few shrink back to nudges as the
     * fault clears. Nothing switches off — the ball is simply obeying again.
     *
     * 24 ticks against a 15-tick cadence puts the first kick at about 0.6 of
     * full and the second at full, so the trap is felt arriving over two of
     * them rather than announced by one. It is longer than RUSH's six-frame
     * surge on purpose: a surge is a speed and is read instantly, while an
     * angle is only read against the heading it replaced.
     */
    haywireFrayTicks: 24,
    /**
     * ENGLISH's felt, each way: the cloth laid across the deck and taken back.
     *
     * 20 ticks and not the fray's 24, because this transition has a distance to
     * cover as well as a duration — the band grows out of the deck's middle to
     * both ends and drains back the same way, so it is a sweep the player
     * watches rather than a tint that appears. A third of a second is about as
     * slow as a surface can arrive before it starts reading as a load.
     */
    englishFeltTicks: 20,
    // The kick, seen. A tight shower of hot 1 px sparks off the ball on the
    // frame its heading changes — PIERCE's tones and PIERCE's pool, because
    // this is the same fact about the same sprite: something is happening *to*
    // the ball and the ball itself is untouched. Shorter-lived and slower than
    // the drill's, so a kick reads as one crackle rather than as a trail.
    haywireSparkBurst: {
      chunkCount: 7,
      minChunkSize: 1,
      maxChunkSize: 1,
      minSpeed: 0.5,
      maxSpeed: 1.7,
      minLifeTicks: 6,
      maxLifeTicks: 14,
    } satisfies BurstSpec,
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
    // SNAP's lattice dithering in and back out, cell by cell. Half a second, the
    // same length GHOST and the other field-wide pictures take: this one is
    // drawn under everything on the field, so it may not arrive faster than the
    // eye can take it in — and the cells come up in a fixed scatter rather than
    // a wipe, which is what makes it read as a grid resolving rather than as a
    // curtain crossing the screen.
    snapGridTicks: 30,
    // TRACER's thread, paying out and letting go. Asymmetric where every other
    // picture on this list is symmetric, so the two ends are the capsule's own
    // numbers in `powerUps.tracer` rather than one shared here — this holds only
    // the strength the whole guide is drawn at, which is what a `stepBlend` can
    // say. Half a second, like the rest of them.
    tracerFadeTicks: 30,
    // PYRE's ember wash, rolling over the deck and rolling back off it. Both
    // ends of the capsule are this one number: the front sweeps cap to cap as
    // the fire takes and sweeps back the way it came when the ten seconds are
    // up, and the crowns on the balls will not light until it is half across —
    // which is the ticket's "then", spent rather than described.
    pyreEmberTicks: 24,
    // GRAVEL's fault crossing the wall and healing back off it. Thirty, which
    // is the half second the ticket asks for at the expiry and the same length
    // every other field-wide picture takes — this one changes nothing but the
    // face of the bricks, so it may arrive as fast as the eye can follow a
    // crack. The whole of both ends is inside this number: the front crosses
    // the wall in the first 55 % of it and each brick splits in the rest, and
    // running down it does both backwards.
    gravelCrackTicks: 30,
    // ERODE's wear, each way: how long the mortar takes to give and to set again.
    // Sixty rather than the thirty the field-wide pictures take, because this
    // one is not a picture — the collider shrinks with it, and a wall that
    // opened in half a second would put the ball inside itself before the player
    // had read that there were lanes. It is also the only fade in the game spent
    // in visible steps: the insets are whole pixels, so five of these ticks buy
    // one pixel off each side and the grains are what fills the gap between them.
    erodeTicks: 60,
    /**
     * JELLY's sheet. The shape of these numbers came off the prototype the
     * ticket demanded be written first; the numbers themselves came off the
     * running game, and the two disagreed by an order of magnitude — see the
     * note on the strain pair below for what the prototype could not know.
     *
     * The gate was **one ball has to be able to make the wall ring**. It can: a
     * single strike loads a dozen cells and kills none of them, and a rally
     * bursts bricks at nodes several cells from anything the ball touched, in a
     * pattern that is a function of where it struck. That last part is the
     * capsule, and it survived every retune.
     */
    // How far the ball drives the sheet in, in pixels, at the middle of the
    // dimple. Half a brick, which is as far as a brick can move before it stops
    // reading as the wall and starts reading as a bug — and the same number as
    // `jellyMaxBend` for that reason.
    //
    // It is what the press *sets*, not what the eye then sees off one contact:
    // the sheet redistributes a lone dimple within a tick or two and it reads
    // as about three pixels. A wall being worked by a real rally has several
    // dimples in it at once and does reach the clamp.
    jellyPressDepth: 6,
    // The propagation term, `c^2` of the discrete wave equation: 0.25 is a cell
    // every two ticks, so a front crosses the twelve columns in twenty-four and
    // re-crosses its own reflection about half a second after the strike. It is
    // also half the stability ceiling for a five-point Laplacian, which is the
    // other reason it is not higher.
    jellySpeed: 0.25,
    // What the sheet keeps each tick. 0.985 spends a strike's ring over about
    // two seconds, which is long enough for three crossings and short enough
    // that six strikes in ten seconds do not compound into a wall that
    // dissolves on the clock. This is the number the whole capsule is most
    // sensitive to: at 0.995 the wall comes apart whatever the player does.
    jellyDamping: 0.985,
    // How far the sheet may stretch, in pixels either way. Half a brick, and
    // the thing that actually bounds this capsule — see the note in
    // `JellySheet.step`. It is also a collision constraint: at six a displaced
    // brick still overlaps the row it is indexed on, so the hitbox's row band
    // stays one row wide.
    jellyMaxBend: 6,
    // The bend a cell shrugs off, in pixels. A single front passing is about
    // this tall and earns almost nothing; two fronts crossing add, clear it
    // easily, and that difference is the entire damage model.
    jellyStrainThreshold: 1.2,
    // Strain earned per pixel of bend past the threshold per tick, and given
    // back per tick regardless.
    //
    // **The relaxation is the load-bearing half of this pair**, and it is seven
    // times what the first cut had. Without it a cell only has to be bent *at
    // some point* to reach failure, so ten seconds of any ringing at all takes
    // a wall apart on the clock — 67 % of every wall it was measured against,
    // against the 35 % these two give. With it a cell has to be bent *and kept
    // bent*, which is the difference between a wall that dissolves and one the
    // player is working. It also gives the tell an ending: 0.045 a tick spends
    // a whole hit's load in sixty-seven, so a corner of the wall that went dark
    // and was then left alone lightens again over about a second.
    //
    // **Tuned against real rallies, because the obvious benchmark was wrong by
    // an order of magnitude.** A ball that is no longer breaking bricks does
    // not punch a hole and leave — it rattles along the wall's underside, and a
    // jellied wall takes 30 to 130 contacts in the ten seconds where a plain
    // one takes 4 to 11. Over eighteen measured rallies these land the average
    // tear at about a third of the wall; the spread is wide — nothing on one
    // rally, nearly all of it on another — and that is the feedback loop rather
    // than the numbers, since a rally that keeps the ball in the wall keeps
    // feeding the sheet.
    jellyStrainGain: 0.4,
    jellyStrainRelax: 0.045,
    // Strain to a hit. Three, so a cell shows two notches of load before it
    // pays one out — and it is a *hit*, not a kill: granite still takes four of
    // them, through the same damage path a ball uses.
    jellyStrainPerHit: 3,
    // What the trampoline gives back, as a ceiling on the level's own speed
    // rather than a multiplier on whatever the ball happened to be doing.
    // 1.35 is a bounce the player can feel without the ball outrunning the
    // deck — and it is a ceiling because a multiplier compounds: see
    // `reboundOffSheet`.
    jellyRebound: 1.35,
    // How fast the painted offset chases the wave, in pixels a tick. Only
    // binding on a cell coming out of a hold, where snapping to a wave that has
    // moved on would fire a brick out of the wall at the ball that just left.
    jellyCatchUp: 2,
    // The arrival: how long the slack takes to run in from the frames to the
    // middle, how deep it is, and the period it rings down over. Twenty ticks
    // of travel and a twelve-tick period is two decaying overshoots per column,
    // arriving as a rope going slack rather than as a wall dropping.
    jellyArrivalTicks: 20,
    jellyArrivalDepth: 5,
    jellyArrivalPeriod: 12,
    // The expiry: the last ticks of the capsule, over which the propagation
    // walks to zero and the amplitude ceiling collapses from the outer columns
    // inward. Twenty-four rather than the arrival's twenty because it has more
    // to do — the arrival only has to be seen, and this has to actually stop a
    // sheet that may be in full swing.
    jellySettleTicks: 24,
    // How soft the setting front is, as a fraction of the half-span it crosses.
    // A quarter: wide enough that the wall stiffens as a sweep rather than as a
    // line of columns switching off one at a time.
    jellySetSoftness: 0.25,
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
      // What a grub does with its last second, whichever of its two clocks is
      // about to run out — the life timer, or the travel left on the bottom
      // row before it walks off the wall entirely. Three tells stacked rather
      // than one, because under DEMAKE the colour half flattens to a single
      // ink: the stride halves first, then the lime body steps twice toward
      // its own belly brown, then it blinks out in two-tick blocks. Walking
      // speed and bite rate are untouched — slowing a dying grub would quietly
      // take back a brick of the chewing the capsule promised.
      runDown: {
        dragTicks: 60,
        dimTicks: 40,
        darkTicks: 20,
        blinkTicks: 8,
      },
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
      // How long a rock takes to shed the last of itself once it is past the
      // bottom of the wall. Matched to `trailBurst.minLifeTicks`, so the final
      // puff the rock makes outlives the rock by its own shortest chunk life —
      // the smoke closes over the place the core went out rather than ending
      // with it. Four rungs of core at three ticks each; on the deepest grid
      // the last pixel goes out near y 170, a clear 100 px above the rail.
      burnoutTicks: 12,
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
