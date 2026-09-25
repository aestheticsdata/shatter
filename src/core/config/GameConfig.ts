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
    // **The rail, not the deck.** Where the deck sits when nothing is holding
    // it up, and for the first forty years of this genre that was the same
    // sentence. TIDE floats it, so the live position is `Paddle.y` — state the
    // deck owns — and this is what it rests on and returns to. Anything that
    // means "where the paddle is" reads the paddle; only the things that mean
    // "the wood along the bottom of the field" read this one, which is BANANA's
    // peels and the marks JAMMER leaves.
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
    /**
     * FENCE: the half row of posts planted over the deck.
     *
     * The whole capsule is here and in `@entities/effects/Fence`. Nothing about
     * it is a brick roster question except the post's own three tones, and
     * nothing about it is a wall question at all — see the class comment for
     * why six cells outside the grid array cost less than nine empty rows
     * inside it.
     */
    fence: {
      /**
       * The grid row the posts are seated on, and the one number here not to
       * shave.
       *
       * `BrickGrid.cellAt` names a row by dividing by the brick height, so a
       * fence either sits on a real grid row or none of the wall's collision
       * applies to it. 16 is y 230-242, which leaves **34 px of air** between
       * the posts and the rail at 276.
       *
       * Row 17 is tighter, reads better and is wrong: it leaves 22 px, and
       * GIANT's ball is 24 — a player who caught both would have a ball that
       * could not pass under its own fence. If GIANT is ever allowed to snap a
       * post instead of wedging, 17 is the better seat and this is the note
       * that says so.
       */
      row: 16,
      // Six on alternating columns of the twelve, which is what makes the gaps
      // a whole empty column wide — 30 px, against an 8 px ball and a 24 px
      // giant one. Both numbers are read together: the stride is the columns
      // over the posts, so this is a half row by construction rather than by a
      // hand-written list of columns that could disagree with it.
      posts: 6,
      // One post's telescope, and the stagger between them. Eight ticks of a
      // post coming out of the ground, started three ticks apart left to right:
      // the last of the six seats at 23 ticks, so a fence goes up across the
      // player's own half of the field in a bit under four tenths of a second
      // and is watched doing it.
      //
      // Three and not two, which the arithmetic would also allow: the thud a
      // post makes as it seats is its own sound, and two ticks apart is 33 ms,
      // which is six thuds heard as one.
      driveTicks: 8,
      driveStaggerTicks: 3,
      // And the other end, in the opposite motion: each post snaps *up* out of
      // its seat over seven ticks, the two ends going first and the middle pair
      // last, five ticks between pairs. Seventeen ticks all told, which is what
      // `PowerUpTimers` has to arm the release at — see `fenceReleaseTicks` in
      // `effects`, which is this span and must stay it.
      pullTicks: 7,
      pullStaggerTicks: 5,
      // How far a post travels out of its seat before it bursts, in pixels. A
      // whole brick height and a half: far enough that the post is visibly
      // *out* of the ground rather than jittering in it, and short enough to
      // stay clear of the empty rows above, where nothing is ever drawn.
      pullRise: 18,
      // The puff a post throws as it seats. Small, low and short — this is the
      // ground closing around a post, not a brick dying, and six brick-deaths'
      // worth of debris arriving over 23 ticks would read as the fence
      // exploding on the way in.
      seatBurst: {
        chunkCount: 4,
        minChunkSize: 1,
        maxChunkSize: 2,
        minSpeed: 0.3,
        maxSpeed: 1.1,
        minLifeTicks: 8,
        maxLifeTicks: 14,
      },
    },
    /**
     * RIBBON (SHA-139): the track every ball lays behind it. The whole capsule is
     * here and in `@entities/effects/Ribbon`.
     */
    /**
     * MOULD (SHA-142): the wall growing back. The whole capsule is here and in
     * `@entities/effects/Mould`.
     */
    mould: {
      // The fur creeping along the seams on arrival, and the first round of
      // growth fires on the tick it lands — something the capsule is about is
      // happening inside the first half second, not on the fur's credit alone.
      furTicks: 24,
      // Nine rounds of two buds, fifty ticks apart: the last is sown at 424 of
      // the 540, and nothing is sown in the last `quietTicks`, so no bud is
      // still rising when the fur dries.
      roundTicks: 50,
      rounds: 9,
      budsPerRound: 2,
      quietTicks: 90,
      // A bud rising out of the cell floor, a pixel every few ticks. Not a
      // collider until it finishes — a player can watch one grow straight
      // through the ball's lane and it will not touch the ball.
      riseTicks: 45,
      // The fur drying on the way out, green to grey to gone from the bottom
      // course up, armed off the timer so the last course lifts as it ends.
      dryTicks: 45,
      // What a grown brick pays of its kind's points. It holds no capsule.
      pointsShare: 0.25,
      // The puff a bud throws as it hardens: the fence's seat, a touch softer.
      sproutBurst: {
        chunkCount: 3,
        minChunkSize: 1,
        maxChunkSize: 2,
        minSpeed: 0.2,
        maxSpeed: 0.8,
        minLifeTicks: 8,
        maxLifeTicks: 14,
      },
    },
    ribbon: {
      // Pixels of travel between two blocks — a distance, not a tick count, so
      // every speed the game has lays the same line. Just under four ball-widths:
      // a fresh tail is a dotted line and not a wall, and the mesh only closes
      // where the player doubles back across it.
      spacing: 31,
      // A block's side. A GIANT ball lays a slab its own width instead.
      block: 8,
      // No block's bottom edge below this: the 26 px over the rail at 276 stay
      // clear, so the trap can never block the player's own catch.
      floorY: 250,
      // Ticks a block takes to congeal out of the trail before it is a collider.
      setTicks: 4,
      // A ceiling on the whole track, for SWARM's sake. Eight seconds of one ball
      // at base speed lays about seventy; twelve balls would lay nine hundred.
      maxStamps: 240,
      // More than this in one tick is a PORTAL transit or a LEAP, not travel.
      jumpLimit: 40,
      // The reel at expiry: the whole of it, and one block's slide onto the next.
      // Armed off the timer's remaining ticks, so the last block goes on the
      // tick the capsule ends.
      reelTicks: 40,
      slideTicks: 4,
    },
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
       * whole twenty-four seconds.
       */
      crack: {
        wipeSpan: 0.55,
        jitter: 0.12,
        // Fractures per brick face, and how far each walks. Two of five is ten
        // dark pixels on a 28x10 body — enough to read as split at a glance
        // across sixty bricks, few enough that the wall keeps its own colour
        // for the twenty-four seconds it wears them.
        fractures: 2,
        fractureLength: 5,
        // The dusting, per brick, while that brick is actually splitting. Gone
        // by the time it has set, so the grit is the arrival rather than a
        // weather effect the wall wears for twenty-four seconds.
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
     * way MULTI's first tier does, and the twenty seconds are what the two
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
      // 21 px/s — about a field and a third of travel over the 24 s it stays
      // open, so it crosses its box and turns back rather than parking at an
      // edge. A hole the player has to keep re-reading, not one that outruns
      // the rally.
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
    // TIDE. The field floods, the deck floats up on the surface, and everything
    // under the water is pushed back out of it.
    tide: {
      // Where the sea tops out. 180 puts the floated deck's top edge at 173 —
      // 96 px above the rail and 39 px under the deepest wall in the game,
      // which bottoms out at 134 — so the wall is genuinely in the deck's face
      // without the two ever touching. It clears SINGULARITY's core (y 150,
      // 12 px across) by design. It does **not** clear BUMPERS' band, whose
      // lowest disc sits at 240: a rack caught under a flood is five discs
      // under water, which is a picture the capsule can carry and a hazard the
      // buoyancy already bounds. The sea is a region, not a collider.
      waterline: 180,
      // Buoyancy, in px a tick squared. The whole promise of the capsule is
      // read off this number: a ball entering the water at the fastest speed
      // the game reaches (4.6) turns round after 21.16 / (2 x 0.14) = 76 px, so
      // the deepest anything can dive is y 256 against a floor at 300. There is
      // nothing to clamp and nothing to guard — the arithmetic is the guarantee.
      lift: 0.14,
      // And the horizontal, per tick while submerged. Not a stop: 0.97 over the
      // ~44 ticks a full dive takes keeps about 40 % of the sideways speed, so
      // a ball comes out of the water *steeper* than it went in rather than
      // vertical. A damp that took all of it would stand every returned ball in
      // a column between the water and the ceiling, which is a rally nobody is
      // playing.
      drag: 0.97,
      // A capsule in the water sinks at a third of its fall and rides the
      // swell on top of that. The bob is bigger than the sink on purpose — a
      // pill that only ever slowed down is a pill in treacle, and one that
      // visibly rises and falls is floating. The sine integrates to nothing
      // over a period, so it is still sinking.
      sinkScale: 1 / 3,
      bobSpeed: 0.55,
      // How deep the deck sits in the water, in px of its 7 px body.
      //
      // **Not zero, and this is the whole of the arrival reading as a lift.**
      // Floated with its bottom exactly on the surface, the deck is never once
      // seen wet: the sea comes up under it and starts carrying it on the same
      // tick, which is a paddle being raised by a lift rather than a paddle
      // finding its own level. At a 2 px draft the water climbs the deck's side
      // first and only then picks it up, foam breaks along its flank for the
      // whole sixteen seconds instead of for one frame, and the bob makes the
      // draft itself breathe between 1 and 3 px — which is what a thing
      // floating looks like and what a thing being held up does not.
      draft: 2,
      // The swell itself: how far the deck rides either side of the waterline
      // and how long one heave takes. 1 px each way is the 2 px bob, which is
      // the most a 7 px deck can move without reading as a stutter — and it is
      // scaled by the flood, so the deck comes to rest on the water rather than
      // starting to bounce the instant it lifts. 96 ticks is a slow swell: a
      // second and a half a heave, about ten over the capsule's sixteen seconds.
      bobAmplitude: 1,
      bobPeriodTicks: 96,
      // The drain's dip, in px and in px either side of the plughole. What the
      // surface does over the hole on the way out, so the sea leaves down a
      // drain instead of being lowered by a lift: the crest sags 7 px at the
      // centre line and is level again 60 px out.
      plugDip: 7,
      plugSpan: 60,
    },
    /**
     * UMBRA. A low sun crosses the top frame and the shadows it throws are
     * surfaces: one wedge per column, hanging off the lowest live brick, that a
     * ball rebounds from and that costs the caster a hit point.
     *
     * The numbers below are the whole of the geometry, and the geometry is the
     * whole of the capsule — the rasterizer, the renderer and the rebound all
     * read this block, so the shape a player sees is the shape they collide
     * with by construction rather than by two sides agreeing.
     */
    umbra: {
      // Where the sun starts and where it ends, in field x. Both are off the
      // frame — 63 px past either side — so the field is raked from one hard
      // angle to the other rather than starting and ending overhead.
      sunFrom: -60,
      sunTo: 432,
      /**
       * How far above the field's top edge the sun hangs, which is the one
       * number that decides what the picture looks like.
       *
       * **A sun on the frame itself was the ticket's reading and it does not
       * work.** At y 0 the light is 50 px above a full wall and 411 px to the
       * side of it, so the far column's shadow leaves at a shear of 8 — flat,
       * off the frame within a brick's height, and nothing a ball could meet.
       * The near column's is at 1.6 on the same tick. Twelve wedges at twelve
       * unrelated angles is not a low sun, it is a bug.
       *
       * Hung at 240 the fan is still a fan — a point source close enough that
       * the outer columns rake harder than the inner ones, which is what says
       * *sun* rather than *stage light* — but the spread across the wall is
       * about 5:1 of shear instead of 30:1, and every column swings through
       * vertical at some point in the twenty seconds.
       */
      sunHeight: 240,
      // And the bound on it, in px of run per px of drop. 1.1 is a shade over
      // 45 degrees, which is as flat as a surface can lie and still turn a
      // ball that meets it: past this the wedge is a smear the ball skates
      // along. It bites only at the two ends of the sun's travel, and only on
      // the columns furthest from it.
      maxShear: 1.1,
      /**
       * How far a shadow reaches below its caster, in px of *drop* rather than
       * of length.
       *
       * Vertical because the invariant is vertical: the deepest grid the game
       * ships bottoms out at y 134, so a 96 px drop puts the shadow floor at
       * 230 against a deck rail at 276. Measured along the wedge instead, a
       * raking shadow would fall 96 px at a shear of 0 and 65 px at 1.1, and
       * the floor would move with the sun — the one number in this capsule
       * that may not.
       */
      reach: 96,
      /**
       * Clearance kept between the lowest shadow row and the top of the deck.
       *
       * **The ticket proved the floor was safe and TIDE moved the deck.** A
       * flooded field floats the paddle to y 173, which is 57 px above the
       * shadow floor the arithmetic above guarantees — so the constant is no
       * longer the answer and the live deck is. The wedge is cut short against
       * whatever the paddle is standing on this tick, and under a flood that
       * genuinely is a shorter shadow: the band it hangs in is shorter too.
       */
      deckGap: 6,
      /**
       * The width of a wedge at its far end, in px, against the caster's own
       * collider width at its mouth.
       *
       * **This taper is what makes the field a forest instead of a slab**, and
       * it is the load-bearing shape decision the way one caster per column is
       * the load-bearing set decision. One shadow per column at the brick's
       * full 30 px is twelve rectangles on a 30 px pitch, and on a fresh wall —
       * where every column's lowest brick is in the same row — they tile the
       * band edge to edge into one black slab 96 px tall. Tapered, the same
       * twelve leave a V of open field between every pair that grows the
       * further it gets from the wall, and the picture reads as twelve things
       * rather than one.
       *
       * The mouth is the collider rect and not the cell, so ERODE's worn bricks
       * throw narrower shadows with nothing here to know about it.
       */
      tipWidth: 12,
      /**
       * The sun rising, in ticks: how long one column's wedge takes to unfold
       * from a single dark pixel at the foot of its caster to its full drop,
       * and how far behind the column to its left each one starts.
       *
       * Twelve columns a tick apart plus nineteen to unfold is thirty ticks
       * end to end, which is the half second the capsule's arrival is worth.
       * Left to right because the sun comes up on the left frame.
       *
       * Nothing is drawn at partial strength anywhere in it: a shadow is black
       * at whatever length it has reached, or it is not there yet.
       */
      riseUnfoldTicks: 19,
      riseStaggerTicks: 1,
      /**
       * The sun setting, in ticks, and the two distances it runs over them.
       *
       * The expiry is deliberately not the arrival backwards. Shadows do not
       * shorten — they *stretch*: the mouth leaves the brick and runs down the
       * wedge's own vector while the tip runs further still, so the whole shape
       * lengthens and slides off the bottom of the field at once. 330 px of
       * mouth travel clears the field from the shallowest caster the game can
       * have, and the extra 260 on the tip is what keeps it stretching the
       * whole way down rather than sliding as a rigid bar.
       *
       * They stop being surfaces on the first tick of this, which is the honest
       * half of the trade: a shadow the player can see running away is not one
       * they can still be turned by.
       */
      setTicks: 30,
      setMouthRun: 330,
      setTipRun: 260,
      // And the width over the same thirty ticks: the whole quad scales down to
      // a twelfth, so the far end goes from `tipWidth` to the single pixel the
      // arrival was born as. Growing out of the foot and running off the edge
      // are the same sun and the opposite picture.
      setThinTo: 1 / 12,
      // The bright band that runs back up a struck wedge to its caster, and the
      // flash waiting for it there. Six ticks is a tenth of a second — long
      // enough to be read as travelling and short enough that the hit and the
      // report are one event, which is what teaches the capsule on the first
      // contact.
      surgeTicks: 6,
      // How many rows of the wedge the band lights at once. Five is a streak
      // rather than a spark and short enough that a 96 px wedge is never more
      // than a twentieth lit — what travels has to be read as travelling.
      surgeTail: 5,
      flashTicks: 6,
      // Ticks a ball must wait before the same wedge can charge it again. One
      // contact is several sub-steps of overlap, and without this a ball that
      // grazed a shadow would pay four hit points for it.
      contactCooldownTicks: 8,
    },
    /**
     * SUPERPOSE. Every live brick stands in two places at once: itself, and an
     * echo half a cell off it. Both are surfaces, a hit on either collapses the
     * pair into the brick, and the wall resolves itself back to one wall over
     * the twenty seconds.
     */
    superpose: {
      // Half a cell, diagonally. Not a whole one — an echo on the next cell's
      // footprint is a wall drawn one column to the right, which is a picture
      // with no double in it. At half, every echo lands on the mortar cross
      // between four bricks and the wall reads as interleaved.
      offsetX: 15,
      offsetY: 6,
      /**
       * The split, in ticks, and how far behind its neighbour each cell starts.
       *
       * Staggered on `row + column` so the wall comes apart as a diagonal wave
       * running with the offset, rather than every brick budding at once —
       * which at 96 cells is not an arrival, it is a second wall appearing.
       * Twelve columns and eight rows is 19 ticks of stagger over a 10 tick
       * split, so the far corner has finished inside half a second.
       */
      splitTicks: 10,
      splitStaggerTicks: 1,
      /**
       * The merge, and the one asymmetry with the split: the echoes come home
       * together rather than in a wave. A departure staggered the same way
       * would leave the last corner holding a surface for nineteen ticks after
       * the player has watched the capsule end, and that corner is exactly
       * where they have stopped looking.
       */
      mergeTicks: 12,
      /**
       * The shimmer: one full trade of brightness between a brick and its echo
       * and back, in ticks.
       *
       * **It is the whole tell and it may never settle.** The capsule's claim
       * is that neither of the two is the real one, and a static ghost beside a
       * static brick says the opposite — the bright one is the brick and the
       * faint one is decoration. At 40 ticks the trade is slow enough to read
       * as breathing rather than flicker, and long enough that a rally crosses
       * the wall at several different points in it.
       */
      shimmerTicks: 40,
      // What the echo's alpha swings between. The floor is what keeps it
      // findable on a dark theme with the liseré; the ceiling stays under 1 so
      // the brick is never fully hidden behind its own double.
      alphaFrom: 0.34,
      alphaTo: 0.66,
      // How long a collapsed pair's pop is drawn for. Six ticks is the same
      // tenth of a second UMBRA gives its flash — long enough to be read as
      // the echo being spent rather than as a brick blinking.
      popTicks: 6,
    },
    /**
     * COLLAPSE. The wall stops colliding with the ball and goes to fog; a brick
     * a ball has passed *through* condenses back to solid and stays solid, so
     * the eight seconds are spent carving the wall back into existence in the
     * shape of where the ball has been.
     */
    collapse: {
      /**
       * The wall decohering, in ticks, and the stagger that makes it a wave.
       *
       * On `row + column` like SUPERPOSE's split, and the same argument: 96
       * cells losing definition on one frame is not an arrival, it is the wall
       * being swapped for a different wall. Twenty ticks plus nineteen of
       * stagger is about two thirds of a second, which is long enough to be
       * read as something spreading and short enough that the trap has started
       * before the player has finished reading it.
       */
      fogTicks: 20,
      fogStaggerTicks: 1,
      /**
       * The wall condensing again at the end, in ticks, **from the bottom
       * course up**.
       *
       * Not a stagger on `row + column` this time: what the player cares about
       * at the end of a trap is the row nearest their deck, so the picture
       * starts there and runs away from them. It is also the honest order for
       * a capsule whose whole cost was measured in bricks they could not hit —
       * the first thing handed back is the first thing they will hit.
       */
      condenseTicks: 15,
      /**
       * How long a brick takes to snap solid once a ball has left it.
       *
       * Short, because this is the capsule's reward and a reward that eases in
       * over half a second is a reward the player cannot connect to the pass
       * that earned it. Six ticks is a tenth of a second — the same window
       * UMBRA gives its flash, and for the same reason.
       */
      solveTicks: 6,
      /**
       * What is left of a fogged brick's body.
       *
       * **Not zero, and this is the one number that separates this trap from
       * GHOST.** GHOST draws a hollow outline: the wall is gone and there is
       * nothing to plan against. Here the player is choosing *what to carve*,
       * which means they have to be able to read a granite from a red at a
       * glance while it is fogged — so the brick keeps its own body tone and
       * loses only its solidity. A quarter is where a brick stops reading as
       * something you can hit and still reads as what it is.
       */
      fogAlpha: 0.28,
      // How far the fog eats into the cell, in px, and how many grains it
      // throws outside it. The inset is what makes a fogged brick visibly
      // smaller than the space it is standing in — the gap is the tell that the
      // ball will go through, before the player has tried it.
      //
      // Two on x and one on y because the cell is 30 by 12: two off each edge
      // of the height would leave a body 6 px tall wearing a 1 px sheen and a
      // 1 px bevel, which is a brick with no face left to read the damage on.
      fogInsetX: 2,
      fogInsetY: 1,
      fogGrains: 6,
    },
    /**
     * TWIN. The wall pairs itself up: twelve couples drawn at random out of the
     * live bricks and joined by a hairline that crosses the whole field. Break
     * one and its partner takes the same damage on the same tick, wherever it
     * is standing.
     */
    twin: {
      /**
       * How many couples stand at once.
       *
       * Twelve against a full wall of ninety-six is a quarter of the bricks
       * wired, which is the number this had to land on from both ends. Fewer
       * and a thread is a curiosity the player never happens to hit; many more
       * and the field is a cat's cradle nobody can read a shot through — and
       * the capsule's claim is that you *read the wiring before choosing*, so
       * the wiring has to stay readable.
       */
      couples: 12,
      /**
       * The arrival: a thread grows from both of its ends at once and meets in
       * the middle.
       *
       * From both ends and not from one, because a thread paid out from a
       * single anchor reads as something being *thrown* at the far brick —
       * which is CHAIN's picture, and this capsule's whole argument is that it
       * is not CHAIN. Two ends closing is a link being *declared*, and it names
       * both bricks at once instead of a source and a target.
       *
       * Fifteen ticks is a quarter-second and it is the arrival of the couple
       * rather than of the capsule: the refill clock draws new ones all the way
       * through the eighteen seconds and each of those grows in the same way, so a
       * thread appearing at full length is never the picture.
       */
      drawTicks: 15,
      /**
       * The expiry: the threads go slack, sag out of their anchors and fall
       * through the field, fading as they drop.
       *
       * The idiom is the capsule's own and deliberately not an opacity fade
       * (SHA-59): what a thread does when nothing is holding it is *fall*. It
       * is also the honest tell for the couples themselves — the pairing stops
       * paying the tick the slack begins, so the player watching the threads
       * let go is watching the thing that actually happened.
       *
       * Twenty ticks against the arrival's fifteen, for UMBRA's and
       * SUPERPOSE's reason: the two ends of a capsule are two events and a
       * departure that is the arrival reversed is neither of them.
       */
      slackTicks: 20,
      // How far a slack thread has fallen by the time it is gone, in px, and
      // how deep it bows out of its anchors on the way. The fall is squared
      // against the blend so it accelerates — a rope let go does — and the sag
      // is what says the line went limp before it dropped rather than simply
      // sliding down the screen.
      slackFall: 40,
      slackSag: 9,
      /**
       * How often the pairing tops back up, in ticks.
       *
       * **Without this the capsule spends itself in the first two seconds and
       * stands there for sixteen more.** Twelve couples against a wall being
       * actively eaten is about two seconds of play, and a rare capsule whose
       * whole visible life is its opening two seconds is one the player
       * remembers as having done nothing. A second and a half between refills
       * keeps the wall re-threading as fast as it is being taken apart without
       * the pairing looking like it never changes.
       */
      refillTicks: 90,
      // The thread itself: one pixel every four along its length, rather than a
      // solid rule. Spaced because a hairline drawn solid across 300 px of
      // field competes with the ball for the eye, and because a pattern is the
      // one thing DEMAKE cannot flatten — the tube takes the tone away and
      // leaves the dots and the wave, which is what SHA-142 says a 1 px line
      // owes itself on a 1-bit field.
      dotPitch: 4,
      // The shiver: how far a dot is pushed off the line, how long a wave is
      // along it, and how many ticks a wave takes to travel one wavelength.
      //
      // Two pixels and thirty-four is a slow ripple rather than a zigzag, and it
      // travels rather than pulsing in place — a thread breathing on the spot
      // reads as a rendering artefact, and one with something running along it
      // reads as under tension. It is the only thing on the field that says the
      // link is live while nothing is happening to it.
      shiverAmplitude: 2,
      shiverWavelength: 34,
      shiverTicks: 50,
      /**
       * A broken couple: how long the two flashes are drawn for.
       *
       * **A break is an event, not a fade**, so this is the one part of the
       * capsule that does not ease: the thread is gone on the tick one half
       * dies and what is left is the report of it — a bright head running out
       * from the struck brick and another running back from its partner, so the
       * discharge is seen going both ways rather than travelling one.
       *
       * Ten ticks is a sixth of a second, which is long enough to cross the
       * field at a readable speed and short enough that four couples spent in
       * one NUKE do not leave the field lit.
       */
      snapTicks: 10,
      // How long the flash head is, in px of thread behind it. Short: what is
      // being read is a thing moving, and a streak long enough to see the whole
      // of at once is not moving, it is a line.
      snapHead: 14,
    },
    /**
     * LEAP. Every second or so the ball is not where it was: it blinks out, and
     * reappears a short hop further along its own heading with its speed and
     * direction untouched, having crossed the gap without being anywhere in
     * between. Nothing in the gap is hit, because the ball was never in it.
     */
    leap: {
      /**
       * The gap between two jumps, rolled fresh each time.
       *
       * **A range and not a number, and the range is the capsule.** At a fixed
       * cadence the player counts ticks and simply stops swinging on the beat,
       * which turns a trap into a metronome with a tax. Rolled, the jump is
       * always somewhere in the next second and a half and never on a count.
       *
       * The floor is what keeps two jumps from reading as one long one, and the
       * ceiling is what keeps the six seconds from holding only three.
       */
      minGapTicks: 75,
      maxGapTicks: 105,
      /**
       * How far a jump goes, in px, rolled with the gap above it rather than at
       * the moment it fires — the landing pip has to be able to tell the truth,
       * and a distance rolled on the tick of the jump is a pip that was
       * guessing.
       *
       * Two and a half to four ball-widths. Short enough that the ball is
       * plainly the same ball arriving further on, and long enough to clear a
       * brick course: at 32 px a leap crosses a whole 30 px cell, which is the
       * shot the player had lined up going missing.
       */
      minSpan: 20,
      maxSpan: 32,
      /**
       * The arrival: the ball goes unsure before it goes anywhere.
       *
       * Twelve ticks of flicker in place — the machine losing its grip on where
       * the ball is, then using it. **Drawn and not simulated**, which is the
       * whole reason it is affordable: a ball genuinely shaken a pixel either
       * way is a ball that can be shaken into a brick, and the picture of
       * uncertainty costs nothing while the fact of it costs a collision.
       */
      settleTicks: 12,
      // How far the flicker throws the sprite, in px. One, because two reads as
      // the ball moving and nought reads as nothing happening.
      settleJitter: 1,
      /**
       * The expiry: the jumps run down rather than stopping.
       *
       * Every span is scaled by how much of this window is left, so the last
       * jumps are visibly shorter and the pip that announces them shrinks in
       * step — the capsule runs out of reach in front of the player instead of
       * switching off between one jump and the next, which is SHA-59's rule and
       * the one this roster keeps relearning.
       *
       * Three seconds is about two jumps at the cadence above, which is what the
       * ticket asked for: at 90 ticks left a 26 px span comes out at 13 and at
       * 20 ticks left at 3.
       */
      runDownTicks: 180,
      /**
       * How long after a ball is loosed it may first jump, in ticks.
       *
       * **A launch is always the player's.** A ball teleported out of its own
       * serve is the one moment in the capsule where the player has made no
       * choice yet and can be punished for it anyway. Held while a ball is
       * parked or stuck and counted from the tick it is let go, so GLUE's
       * release is covered by the same number as the serve.
       */
      serveGuardTicks: 20,
      /**
       * The walk back, in px: a landing that is not free is pulled toward the
       * ball in steps this size until one is.
       *
       * Two, which is `stepBall`'s own sub-step — the resolution the engine
       * actually decides collisions at. A coarser walk would step over a gap the
       * ball would have fitted in, and a finer one would cost tests to land on a
       * position the physics cannot tell apart from its neighbour.
       */
      walkStep: 2,
      /**
       * The shortest a jump may be while the capsule is still live, in px.
       *
       * **Without a floor the run-down ends in silence**, which is the exact
       * failure the run-down exists to prevent. The reach reaches 0 at the
       * timer, so the last jump due before it rolls a span of under a pixel —
       * and a span shorter than one walk step is no landing at all, so the jump
       * silently does not happen, the pip goes out with it, and the final
       * second of the capsule has no cue in it. Measured in a browser, not
       * argued: the fourth jump of a six-second LEAP came due at tick 355 with
       * a 0.7 px span and was dropped.
       *
       * Six is the ticket's own number for the last one and it is about
       * three-quarters of a ball — a visible twitch rather than a leap, which
       * is what a capsule running out of reach should look like. The frame and
       * death-line clamps are still applied *after* it, so a floor can never
       * push a landing anywhere a full-strength jump could not have gone.
       */
      minLiveSpan: 6,
      /**
       * The flash at each end of a jump, in ticks, and how long the pip's arms
       * are at full reach.
       *
       * Seven ticks is about a tenth of a second, which is UMBRA's flash and
       * SUPERPOSE's pop: long enough to be caught out of the corner of the eye
       * while the player is watching the ball, short enough that four jumps
       * across six seconds do not leave the field lit.
       *
       * The two flashes are drawn as a square closing at the spot the ball left
       * and opening at the spot it arrived, which is the one thing in the
       * capsule that says which way the jump went.
       */
      flashTicks: 7,
      // The landing pip: a diamond this many px from centre to point, faint, on
      // the heading, the whole time. It is the held cue and the capsule is
      // armed and idle for a full second at a stretch — without it the jumps
      // read as the game dropping frames, which is the failure this roster has
      // shipped before.
      pipReach: 4,
    },
    /**
     * HEISEN. The longer a ball goes unobserved the less precisely the machine
     * draws it — and the more it pays for what it breaks. A click observes every
     * ball: the scatter collapses and the multiplier drops back to x1. You can
     * know where the ball is, or you can be paid.
     */
    heisen: {
      /**
       * How long a ball takes to go fully vague, in ticks.
       *
       * Three seconds, which is two or three wall contacts at play speed — long
       * enough that reaching the top of the curve is a decision the player
       * *held*, short enough that they get to make it several times inside the
       * eight seconds. Per ball and from 0 on every observation, so a swarm is
       * a dozen different multipliers in one rally rather than one number.
       */
      blurTicks: 180,
      // How many extra copies of the sprite a fully vague ball wears, and how
      // far out they scatter, in px. Four and five: enough to crowd the ball
      // without ever hiding it, since the true sprite is drawn last and at full
      // strength on top of them.
      copies: 4,
      maxScatter: 5,
      // What the copies are drawn at, at full strength. Low enough that the
      // real ball is unmistakable in the middle of them and high enough that
      // four of them are a cloud rather than a smudge.
      copyAlpha: 0.38,
      /**
       * How long a copy takes to drift once round its own orbit, in ticks.
       *
       * **The copies wander, and that is not decoration.** A fixed offset moving
       * with the ball is a rigid five-ball constellation — it reads as MULTI
       * drawn wrong rather than as one ball nobody can pin down. Seeded per ball
       * and per copy, so no two balls come apart the same way.
       */
      driftTicks: 70,
      /**
       * What a fully vague ball's kills pay, as a multiplier on the brick.
       *
       * Three, and it multiplies with PAYDAY and TURBO rather than capping under
       * them — the ticket asked for that call out loud. Every multiplier in this
       * game is an independent timer and they have stacked since PAYDAY met
       * TURBO; a capsule that quietly stopped paying because another one was
       * live would be a lie the player has no way to see. It also cuts the wrong
       * way round: TURBO makes the balls faster, which makes a vague one harder
       * to follow, so that is exactly the moment the trade should be worth most.
       */
      maxMultiplier: 3,
      /**
       * The arrival and the expiry, in ticks: the ball going out of focus and
       * coming back into it.
       *
       * Different numbers on purpose, for the reason UMBRA's sunset and
       * SUPERPOSE's merge are: the two ends of a capsule are two events, and a
       * departure that is the arrival reversed is neither of them. Going out is
       * the slower of the two because it is the claim being made; coming back is
       * the machine getting its grip again, which is a thing that happens *to*
       * the player rather than something they watch.
       */
      focusInTicks: 15,
      focusOutTicks: 12,
      /**
       * A click observing: how long the scatter takes to collapse, in ticks.
       *
       * **The number resets on the frame of the click and the picture catches
       * down to it**, which is COLLAPSE's ordering read the other way up. There
       * it is a reward and may arrive before the picture finishes; here it is a
       * price the player chose to pay, and a price that waited a tenth of a
       * second would let them bank one more kill on a multiplier they had
       * already sold.
       */
      observeTicks: 6,
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
    // level-clear bonus and a BUMPERS kick do not take it, or FINALE would pay
    // 42 000 and a ball parked between two discs would farm 300 a kick. The kick
    // does take CHAIN, which the streak limit already caps; the clear bonus
    // takes PAYDAY and nothing else.
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
  /**
   * THE OBSERVER (SHA-167): the universe's own knobs, in one block.
   *
   * Kept together rather than filed under `scoring` and `effects` by what each
   * number happens to drive, because the eye is one thing arriving and a later
   * veil should add a key beside these rather than a knob in somebody else's
   * table.
   */
  observer: {
    /**
     * THE EYE (SHA-169): the clock it blinks to, and how it follows the ball.
     *
     * Every number here is the mockup's except the ease, which it does not have
     * — it assigns the look outright. See `Observer.step` for why a glide is
     * right and a cut is not.
     */
    eye: {
      blinkTicks: 14,
      // The next blink is `blinkMin + random(blinkRand)`, so between three and
      // just over seven seconds. Random on purpose and by a wide margin: a lid
      // on a fixed beat is a metronome, and the one thing a watching eye may
      // not be is predictable.
      blinkMin: 180,
      blinkRand: 260,
      // How much of the offset from the socket to the ball the iris takes, per
      // axis. Under 1 by a long way because the iris travels inside the sclera
      // rather than across the field, and the vertical is the smaller of the two
      // because the almond is much wider than it is tall.
      trackX: 0.4,
      trackY: 0.22,
      // The iris and the pupil, as fractions of the socket's half-height. The
      // iris is most of the eye by design — it is a creature's eye, not a
      // person's — and it is what makes the socket's proportions the whole of
      // how much the look can travel: see `drawEye`.
      irisRadius: 0.8,
      pupilRadius: 0.34,
      // How much of the remaining distance the look closes each tick.
      trackEase: 0.35,
      // THE RISE (SHA-200): how much of the way to where the wall says it
      // should be the eye closes each tick. A brick moves it on over about
      // half a second, so each one is a nudge rather than a jump.
      riseEase: 0.08,
      // THE PATROL (SHA-202): how much of the way to its cruising speed the
      // eye closes each tick — about a third of a second to start or stop —
      // and how many pixels from the end of its beat it starts slowing.
      patrolEase: 0.12,
      patrolBrake: 14,
      // THE PULSE (SHA-203): the share of each beat spent swelling; the rest
      // is the let-go.
      pulseRise: 0.2,
      // THE BOUNCE (SHA-188): how long a let-out eye takes to fade to its own
      // opacity and get up to its speed.
      releaseTicks: 45,
    },
    /**
     * THE STAIRS' strike (SHA-204): the lightning reaching the ground. A white
     * frame that decays over `fadeTicks`, at `peak` rather than full white so
     * the ball is never lost in it, and a rattle.
     */
    /**
     * THE THROAT (SHA-205): ticks between a ball entering the mouth and the
     * charge starting — and between shots while it stays in there.
     */
    throat: {
      idleTicks: 20,
    },
    strike: {
      fadeTicks: 18,
      peak: 0.55,
      shakeTicks: 10,
    },
    /**
     * THE ZODIAC RING (SHA-211): the dial round the eye, from the mockup —
     * two circles and ticks across the band between them — and how it turns.
     * The field's is the veils'; the title's is bigger, with twice the ticks.
     */
    ring: {
      field: { inner: 82, outer: 86, ticks: 12, alternate: false },
      title: { inner: 98, outer: 104, ticks: 24, alternate: true },
      // Ticks for one full turn: a minute. Slow enough to be a dial, fast
      // enough that a player waiting on the serve sees it move.
      turnTicks: 3600,
      // The inner circle's dash: pixels on, pixels off, along its circumference.
      dashOn: 4,
      dashOff: 2,
    },
    /**
     * THE CHART (SHA-212): the run's constellation on the dial. See `Chart`.
     */
    chart: {
      // The figures, as the skip between the two stars a junction joins, in
      // drawing order: the twelve-pointed star, the four triangles, the three
      // squares, the two hexagons, then the six bars across the middle.
      skips: [5, 4, 3, 2, 6],
      // Strokes one junction takes. Three, so that a kill draws a third of a
      // line rather than a whole one — a perfect run has about two hundred
      // strokes in it and the fifty-four junctions should take most of them,
      // or the cage would close by the middle of the run and the second half
      // would have nothing left to draw.
      strokesPerJunction: 3,
      // What draws them.
      clearStrokes: 1,
      killStrokes: 1,
      bossStrokes: 3,
      // What a finished junction pays when the run ends — at GAME OVER, or on
      // THE LID's card. Per junction and not per stroke: the chart is counted
      // in lines, and a third of a line is not a line.
      junctionPoints: 500,
      // The new stroke's arrival: gold for this long, stepping down to the
      // thread's bronze.
      revealTicks: 40,
    },
    /**
     * THE BROOD (SHA-170): the eye's creatures, and what they are worth.
     *
     * **A beast that is struck does not die, it grows** — which is the whole
     * Devil's Crush inheritance and the reason the roster has three forms and
     * one kill rather than three hit points. Every number is the mockup's
     * except the points, which are the roster's: a brick here pays 60 to 250,
     * so the mockup's 400/800/1500 and 5000 have been brought down by four and
     * by five. The kill is worth four bricks and the whole beast is worth
     * seven, which is what a creature that took three deliberate hits should be
     * beside a wall you can clear by accident.
     */
    brood: {
      forms: [
        { width: 16, height: 12, speed: 0.32, points: 100, bob: 1.5, bobRate: 0.05, frameTicks: 12 },
        { width: 20, height: 14, speed: 0.8, points: 150, bob: 1.5, bobRate: 0.05, frameTicks: 12 },
        { width: 28, height: 14, speed: 1.45, points: 250, bob: 3, bobRate: 0.11, frameTicks: 6 },
      ],
      killPoints: 1000,
      // Ticks of white a struck beast wears. Short: it is a flinch, not a
      // state, and the thing that says the hit landed is the sprite changing.
      flashTicks: 8,
      // How many of a veil's pins are used. Three is what the band holds beside
      // the chamber's particles without either becoming noise — if that picture
      // ever gets crowded this is the number that comes down first.
      cap: 3,
      // THE TEAR's, which is higher because the veil *makes* them: its eggs
      // arrive by hatching rather than by being pinned, so the cap is a ceiling
      // on a tap rather than a count of what the level was built with.
      tearCap: 5,
    },
    /**
     * THE TEAR (SHA-174): what the eye weeps, and what it leaves behind.
     *
     * **A clock the player can bank against.** A tear every four and a half
     * seconds, falling slowly at first and reaching its terminal speed most of
     * the way down — so there is always time to reach one, and always a cost to
     * deciding not to. Burst it for a hundred and a link; miss it and there is
     * one more creature on the band for the rest of the level.
     */
    tears: {
      firstTicks: 200,
      intervalTicks: 270,
      fall: 0.6,
      gravity: 0.012,
      maxFall: 1.7,
      // Where a tear lands and hatches: the bottom of the band the brood walks,
      // well clear of the deck. A tear that reached the rail would be a second
      // thing to catch, and this veil already asks enough of the paddle.
      floorY: 236,
      points: 100,
      width: 5,
      height: 8,
    },
    /**
     * THE WRATH (SHA-175): what the eye puts back every time it blinks.
     *
     * **The blink is the clock, so there is no interval here.** The rebuild
     * rides the lid the player has been watching since THE VEIL, which is the
     * whole of its fairness: the tell was taught four levels ago and costs
     * nothing to read. That also makes the rate irregular by construction —
     * between three and just over seven seconds, the eye's own `blinkMin` and
     * `blinkRand` — so the wall is never repaired on a beat a player can plan a
     * lap around.
     */
    wrath: {
      // One hole a blink. Two would repair the wall about as fast as a good
      // rally opens it, and a level that cannot be finished is not difficulty.
      bricksPerBlink: 1,
      // Scar tissue: a rebuilt brick has one hit point whatever it was, so a
      // granite hole comes back as something a single touch takes out again. It
      // also paints itself that way for free — the damage ramp reads the hit
      // points, so a one-hit granite wears its own deepest tone and *looks*
      // like a repair rather than like a fresh wall.
      hitPoints: 1,
      // Ticks of white the new brick cools through. A little over a quarter of a
      // second: long enough to catch out of the corner of an eye tracking a
      // ball, short enough that it is over before the ball could reach it.
      flickerTicks: 16,
    },
    /**
     * THE LID (SHA-176): the seal, the waking, and the thing that comes out.
     *
     * **The loop's last level, and the only one that is not won by clearing a
     * wall.** Everything here is in service of one turn: a plate of bronze the
     * player digs at with no idea which brick is the tenth, and then a fight
     * with no wall in it at all.
     */
    lid: {
      // How far open the slit is before the waking. A closed eye would be a
      // black line and a sleeping one has to be *seen* to be sleeping, so this
      // is the smallest opening that still draws an eye rather than a crack.
      slit: 0.08,
      // The seal: the sixteen cells at these rows and columns, inclusive, of
      // which this many have to die. Ten of sixteen rather than all of them,
      // so the waking lands while the plate is still mostly whole — a seal that
      // needed every cell would be a level that ends and then starts again.
      sealTop: 1,
      sealBottom: 4,
      sealLeft: 4,
      sealRight: 7,
      sealNeeded: 10,
      // Every third one is called out. Not every one: ten pops over a plate the
      // player is already hammering is a counter, and what they need is a sense
      // of how close it is.
      sealPopEvery: 3,
      radius: 15,
      hits: 24,
      // Pixels a tick, plus this much for every hit it has taken — so the last
      // hit is on something moving at twice the speed of the first. **This is
      // the fight's only clock.** There is no timer here, unlike INSIDE THE EYE:
      // a thing that keeps getting faster is already counting.
      speed: 1.1,
      speedPerHit: 0.045,
      // The box it bounces in, vertically. The sides are the field's own, inset
      // by the radius, so they follow the frame rather than being written down
      // twice. The top is below the lid's bricks and the bottom is well clear of
      // the rail: a pupil that could reach the deck would be a boss that kills
      // you by standing on you.
      boxTop: 122,
      boxBottom: 232,
      // A hit, and the kill. The hit is five gold bricks and the kill is more
      // than a whole veil's clear bonus — twenty-four hits is the longest single
      // engagement in the game, and it has to pay like one. Both are the
      // roster's scale rather than the mockup's 4000/250 000, by the same fifth
      // the brood came down.
      hitPoints: 500,
      killPoints: 25000,
      flashTicks: 8,
      shakeTicks: 5,
      // The waking's jolt, in ticks. Longer than a hit's, because what has just
      // happened is the level changing into a different one.
      wakeShakeTicks: 12,
      // The loose pupil fires THE IRIS's gaze from wherever it is, on a shorter
      // idle than the veil that introduced it: the beam is a known quantity by
      // now, and the fourth-and-a-half seconds is what stops the fight being a
      // pure chase.
      gazeIdleTicks: 220,
    },
    /**
     * THE GAZE (SHA-173): what THE IRIS does to the deck, and what THE LID's
     * loose pupil does with it later.
     *
     * **A metronome the player can learn.** Idle, charge, fire, idle: five and a
     * half seconds of nothing, three quarters of a second of warning, and most
     * of a second of beam. The charge is the whole fairness of it — the ring on
     * the pupil is a held cue, so being caught is always a thing the player was
     * shown coming and did not move for.
     */
    gaze: {
      idleTicks: 330,
      chargeTicks: 45,
      fireTicks: 50,
      beamWidth: 6,
      // How much of the distance to the deck the beam closes each tick while it
      // fires. Slow enough to be outrun sideways and fast enough that standing
      // still is never the answer.
      tracking: 0.03,
      // How long the deck is stone. Deliberately longer than the beam: what is
      // taken is the steering, and taking it for less than a rally would be
      // taking nothing.
      petrifyTicks: 70,
      // The field's jolt on the catch, in ticks.
      shakeTicks: 5,
    },
    /**
     * THE OCULI (SHA-171): three plaques, and the door the third one opens.
     *
     * The points are the roster's rather than the mockup's 1500 — three of them
     * is 900, a gold brick and a half, which is what solving a three-step
     * combination should be worth beside the door it opens. The door is the
     * real payment.
     */
    oculi: {
      points: 300,
      // Ten seconds of open eye. Long enough to bring a ball back from the deck
      // and aim it, short enough that a player who was not ready loses it —
      // which is what makes the third plaque a decision about *when* rather than
      // a thing you do on the way past.
      windowTicks: 600,
      // The gap's width, cut over the socket. Wider than a brick and narrower
      // than two, so it is a target and not a corridor.
      gapWidth: 52,
    },
    /**
     * INSIDE THE EYE (SHA-172): the pupil fight, behind the door THE OCULI cut.
     *
     * **The clock is the whole design of it.** There is no wall in here and
     * nothing can be lost — a ball that drains costs no life, it only ends the
     * visit — so the only thing being spent is the twenty-two seconds, and every
     * hit makes the pupil harder to catch. A player who arrives with a good
     * rally can finish it; a player who arrives late cannot.
     */
    inside: {
      radius: 15,
      // How many hits the pupil takes: this many plus `hitsPerVeil` for each
      // veil deep the player is, so the fifth eye is a real fight and the first
      // is a lesson.
      baseHits: 14,
      hitsPerVeil: 3,
      ticks: 1300,
      // The orbit: a Lissajous figure, wide and shallow, whose vertical runs at
      // 1.7 times the horizontal — so the path never repeats inside a visit and
      // the pupil is never where it was last time round.
      orbitX: 66,
      orbitY: 40,
      verticalRatio: 1.7,
      centerX: 186,
      centerY: 100,
      // Radians a tick: a base, plus this much for every hit it has taken, plus
      // this much for every veil. It speeds up as it is hurt, which is what
      // stops the last four hits being the same as the first four.
      speed: 0.018,
      speedPerHit: 0.0035,
      speedPerVeil: 0.002,
      // Scaled to the roster like the rest of the universe: a hit is two gold
      // bricks and the kill is forty. The two stars it lights are worth 5000
      // more at the clear, so a pupil killed is a third of a full diadem.
      hitPoints: 500,
      killPoints: 10000,
      killStars: 2,
      flashTicks: 8,
    },
    /**
     * THE DIADEM (SHA-170): six stars over the socket, one for each of the
     * Observer's creatures sent back.
     *
     * Lit by three different things across three tickets — a beast killed
     * (this one), the oculi completed (SHA-171), the pupil killed inside
     * (SHA-172, two stars) — so the array lives on the eye and each lighter
     * takes the next dark star rather than owning an index.
     */
    diadem: {
      // What a lit star pays when the veil is cleared, on top of the roster's
      // own clear bonus. Scaled from the mockup's 25 000 by the same fifth the
      // brood was: a full diadem is 15 000, which is a third of the loop's
      // clear bonuses and is meant to be the reason to hunt the brood at all.
      starPoints: 2500,
      // The twinkle's period and its duty, in ticks. Staggered per star by
      // `twinkleStagger` so a finished diadem shimmers rather than flashing as
      // one block.
      twinkleTicks: 30,
      twinkleStagger: 7,
    },
    /**
     * CHAIN (SHA-168): what the ball is paid for not coming back.
     *
     * Every hit the ball or a cannon lands between two deck touches is a link,
     * and three links buy a step. The cap is where it stops being a reward for
     * a good rally and starts being a reason to farm one brick — eight is
     * twenty-one hits without a catch, which is a rally nobody has by accident.
     */
    chain: {
      hitsPerStep: 3,
      cap: 8,
      // The step the deck's sheen goes gold on, and the same step the panel's
      // xN turns yellow: the field and the readout say the same thing at the
      // same moment, so a player watching the ball never has to look away to
      // find out the chain is paying.
      goldFrom: 4,
      // Shorter than a catch pop's 48. These land at every brick the ball takes
      // rather than once a capsule, and a number still climbing off a dead
      // brick while the next three print over it is a smear, not a readout.
      popTicks: 26,
    },
  },
  /**
   * THE BESTIARY (SHA-207): the creatures on ordinary levels — every level's
   * own, from level 1. The brood on the veils keeps its own block above.
   */
  creatures: {
    // Ticks of white a struck creature wears: the brood's flinch. No hit lands
    // while it is on, which is what keeps a ball passing through a moth from
    // striking it every tick of the crossing.
    flashTicks: 8,
    moth: {
      hitPoints: 1,
      points: 100,
      // On the hit that kills — with the capsule it was carrying.
      killPoints: 300,
      // The loop round the eye: half-axes, and how far round it goes a tick.
      orbitX: 64,
      orbitY: 28,
      turn: 0.028,
      // The wobble on the loop — a moth never flies a clean circle.
      wobble: 4,
      wobbleRate: 0.19,
    },
    frog: {
      hitPoints: 2,
      points: 120,
      // The air kill's worth: a frog hit mid-leap dies at once, for this on top.
      killPoints: 300,
      // How near the ball has to come, in pixels from the frog's centre, to
      // make it jump — and the leap: how long, how high, and how long it sits
      // before it will jump again.
      range: 70,
      leapTicks: 30,
      leapHeight: 26,
      restTicks: 40,
    },
    snail: {
      hitPoints: 3,
      points: 80,
      killPoints: 400,
      // Pixels a tick along the skyline, and pixels a tick up or down it: the
      // crawl is slow, the step down onto a lower brick is not, or it would
      // trail the wall's edge by four columns on its first descent.
      speed: 0.25,
      climb: 1,
    },
    spider: {
      hitPoints: 1,
      points: 150,
      killPoints: 350,
      // The drop and the climb, in pixels a tick; how far either side of its
      // column a ball has to pass to set it off; and how long it hangs before
      // it will drop again.
      dropSpeed: 2.2,
      climbSpeed: 1.1,
      triggerHalfWidth: 24,
      restTicks: 60,
      // How far above the deck a drop stops, whatever the ball's height was:
      // the spider blocks the ball, it never lands on the paddle.
      deckClearance: 30,
    },
    bat: {
      // Three, and the first only opens its eyes: the two that kill have to
      // catch it in the air.
      hitPoints: 3,
      points: 90,
      killPoints: 350,
      // Ticks of flight a hit buys — five seconds at 60Hz — and every further
      // hit buys them again, so landing one is never what puts it back to bed.
      flitTicks: 300,
      // How fast it travels, and the lift a woken bat climbs out of its roost
      // with. The wander on top of both is the species' own sines.
      flitSpeed: 1.1,
      riseSpeed: 0.35,
      // Ticks a wing holds each half of the beat. Faster than the moth's
      // frames: a bat beats, a moth flutters.
      flapTicks: 5,
    },
    beetle: {
      // What it can take on its back, and nothing else: the two hits that roll
      // it and upend it hand their hit point back, because they change it
      // rather than hurt it.
      hitPoints: 2,
      points: 110,
      killPoints: 450,
      // The patrol, and the charge a first hit sets off. The charge is fast
      // enough to be a thing that happened rather than a thing that is
      // happening — six times the walk.
      walkSpeed: 0.4,
      chargeSpeed: 2.6,
      // Three seconds on its back, which is the whole of the window.
      flipTicks: 180,
    },
    woodpecker: {
      hitPoints: 1,
      // Nothing, either way, and deliberately: the cleared path is what it
      // pays, and a bird worth score would be a clock the player waits on.
      points: 0,
      killPoints: 0,
      // The hammer: a blow every sixteen ticks, and one hit point off the
      // brick every sixth blow. An ordinary brick has one hit point, so
      // `pecksPerHit` is the pacing and not the brick — six blows is about a
      // second and a half of visible work for one brick.
      peckTicks: 16,
      pecksPerHit: 6,
      bobTicks: 5,
      // Sitting on the gap it just made. This is most of the bird's cycle on
      // purpose: it is what keeps two of them from clearing a level faster
      // than the player does and taking the score with it.
      restTicks: 180,
      // The flight to the next brick, how high its bounds go, and the
      // wingbeat. It picks among the `spread` nearest bricks, so two birds
      // work their own ends of the wall instead of crowding one cell.
      flyTicks: 56,
      spread: 3,
      undulation: 7,
      flapTicks: 4,
    },
    /**
     * VINE (SHA-241): it roots in the band and climbs, and if it reaches the
     * wall it turns into wall.
     *
     * **`hitPoints` here is what it sprouts as, not what it takes to kill.**
     * The count *is* the length — one more every `growTicks` — and a hit sets
     * it to however many segments were below the cut, so a vine is killed by
     * where you hit it rather than by how often.
     */
    vine: {
      hitPoints: 1,
      points: 60,
      killPoints: 500,
      // Two and a half seconds a segment, three quarters of a second a brick.
      // Growing is the clock the player is racing; laying is the consequence.
      // `layTicks` is also the rate a vine that has arrived at an unbroken
      // column *answers* at, so it is slow enough that a brick taken out and
      // put straight back reads as two events rather than as one that failed.
      growTicks: 150,
      layTicks: 45,
      // What it becomes: the green brick, so the wall it leaves is visibly the
      // vine and not the wall the level was built with.
      layKind: "4",
      // The breeze, as a period. Offset by the segment, so it travels up the
      // stalk rather than every leaf lifting on the same tick.
      swayTicks: 26,
    },
    /**
     * WISP (SHA-242): the one creature the ball cannot touch, and therefore
     * the one worth a thousand points.
     *
     * The price is the reach. A level with a wisp on it and no LASER in the
     * wall is a level where the wisp is scenery, which is why it is the
     * biggest number in the bestiary and not a balance mistake.
     */
    wisp: {
      hitPoints: 1,
      points: 250,
      killPoints: 800,
      // The drift: one speed, and a heading that is always turning. Half a
      // pixel a tick crosses the field in twelve seconds, which is slow
      // enough to be a thing you decide to deal with rather than chase.
      speed: 0.5,
      turn: 0.02,
      // The two rates the turn is made of. No common period, so the path does
      // not close into a lap the player can learn.
      wobbleTicks: 47,
      driftTicks: 17,
      // What a ball passing through leaves behind: a shove in the direction it
      // was going, gone again in about half a second. It moves nothing and
      // takes nothing — it is there so that a ball going clean through does
      // not read as a collision that failed.
      shove: 1.2,
      shoveDecay: 0.88,
    },
    /**
     * FIREFLY (SHA-243): the lamps on a dark level, and the score that asks
     * the player to put them out.
     *
     * Every number here is small on purpose. A firefly is not a fight and not
     * a race — it is a light with a price on it, and the only decision it
     * offers is whether the four bricks it is worth are worth the dark that
     * follows.
     */
    firefly: {
      hitPoints: 1,
      points: 60,
      killPoints: 200,
      // What a hit buys: a second and a half of the dark held off, which the
      // blackout's own forty-five-tick iris spends opening and closing round
      // about three quarters of a second of full light.
      glowTicks: 90,
      // The blink, as a full period, and how much of it the lantern is lit
      // for. Just under half: a firefly is dark slightly more than it is lit,
      // which is what makes a blink a blink rather than a flicker.
      blinkTicks: 96,
      litShare: 0.45,
      // The two steps the lantern's three tones change on, and the second of
      // them is also where the rays come out. Read off `fireflyLantern`, which
      // is a sine over the lit share — so `haloAt` at 0.65 is about a quarter
      // of the whole cycle with the light actually firing.
      emberAt: 0.15,
      haloAt: 0.65,
      // The wander: how far off its pin, and how long a round trip takes. Two
      // periods with no common multiple, so the path never closes into a lap —
      // and both short enough that the lamp stays where the level put it.
      driftX: 22,
      driftY: 13,
      driftTicks: 460,
      bobTicks: 190,
    },
    /**
     * CRAB (SHA-244): the deposit account.
     *
     * The numbers are tuned round one question — how often is a crab standing
     * where a capsule lands? Too seldom and the pips never appear and the
     * species is a slow beetle; too often and no capsule reaches the deck
     * unbrokered. `reach` is what settles it, and it is deliberately about a
     * quarter of the field rather than the whole of it.
     */
    crab: {
      hitPoints: 2,
      points: 100,
      killPoints: 250,
      // The patrol and the scuttle. Idling it crosses the field in about
      // fourteen seconds; with something in reach it moves at better than
      // twice that, which is the difference the player reads as "it has seen
      // it".
      walk: 0.45,
      chase: 1.1,
      // How far out of its way it will go, and how far above itself it
      // reaches. `grab` is the claws: a capsule falls 1.3 px a tick so nothing
      // could pass through the body anyway, and this exists so the take
      // happens visibly above the shell rather than inside it.
      reach: 96,
      grab: 6,
      // How many it can hold, which is also how many slots are cut in its
      // shell. Four is the most a player can count at a glance on a 15 px
      // back, and the pool only holds six.
      carry: 4,
      // How far apart the spill throws them. Wider than a capsule, so four
      // coming out of one crab are four capsules and not one stack.
      spill: 24,
    },
    /**
     * JELLYFISH (SHA-245): it goes for the deck.
     *
     * Tuned round the descent, which is the window: from a pin in the wall to
     * the rail in about twelve seconds, slow enough to read and to line up a
     * shot, and back up in about seven.
     */
    jellyfish: {
      hitPoints: 1,
      points: 130,
      killPoints: 300,
      // One beat a second, and the push is the first quarter of it.
      pulseTicks: 60,
      thrustShare: 0.28,
      // Going down: a push up of about ten pixels a beat against a sink of
      // about twenty-five, so it comes down some fifteen pixels a second.
      sinkUp: 0.9,
      sinkDown: 0.7,
      // Going back up, spent: the push does the travelling.
      riseUp: 3,
      riseSink: 0.15,
      // How fast it slides sideways after the deck, at most. A deck crosses
      // the field in a flick, so this is a hunt the player can always step
      // out of — and has to step out of while the ball wants them there.
      drift: 0.35,
      // How far from its pin toward the deck it hunts: all the way would bring
      // two of them down on the same spot, one on top of the other.
      pull: 0.6,
      // How long it hangs over the rail when it arrives and misses, and how
      // far its pulse lifts it while it does.
      hoverTicks: 75,
      hoverBob: 0.5,
      // The sting: about a second of the deck at half speed, inside the
      // six-in, twelve-out ramp every effect on the deck gets.
      stingTicks: 66,
      numbSlow: 0.5,
      // The tips flicker on the last stretch above the deck, at this rate.
      armedFlickerAt: 40,
      flickerTicks: 5,
    },
    /**
     * SLUG (SHA-246): it takes the rail.
     *
     * Tuned round how much rail it costs: crossing the field takes it about
     * fifty seconds, and its slime lasts fifteen, so a live slug keeps about a
     * third of the rail wet behind it — enough to play around, never the lot.
     */
    slug: {
      hitPoints: 3,
      points: 70,
      killPoints: 400,
      speed: 0.12,
      slimeTicks: 900,
      // How fast the deck's grip follows the share of it standing on slime,
      // per tick: the skid ramps in at a patch's edge and out at the far one
      // instead of switching.
      slipRamp: 0.12,
      // On slime, fully: how much of its speed the deck keeps from one tick to
      // the next, and how hard the hand pulls it. A deck that keeps nine
      // tenths and is pulled by three hundredths overshoots where it is
      // pointed by about a third and swings back — it carries past.
      slimeCarry: 0.9,
      slimePull: 0.03,
    },
    /**
     * THE SPIDER QUEEN (SHA-209), the boss at the end of level 5. Ten hits;
     * every one pays a brick's worth twice over, and the kill pays the level.
     */
    spiderQueen: {
      hitPoints: 10,
      points: 200,
      killPoints: 2000,
      // Where she hangs, and how she comes down to it from above the ceiling.
      hangY: 22,
      enterSpeed: 1,
      // The stalk along the top toward the deck, in pixels a tick, and how
      // close to over it she has to be before she drops.
      stalkSpeed: 0.6,
      aimWidth: 10,
      dropSpeed: 3,
      climbSpeed: 1.4,
      // Ticks she hangs between drops: the whole of the player's window.
      restTicks: 90,
    },
    /**
     * THE MOTH MOTHER (SHA-213), the boss at the end of level 15. Twelve hits,
     * a capsule out of her on every one; the dust on a clock.
     */
    mothMother: {
      hitPoints: 12,
      points: 200,
      killPoints: 2000,
      enterSpeed: 1.2,
      // The figure of eight: its middle height, how far it reaches either
      // side and up and down, and how fast she goes round it.
      centreY: 120,
      reachX: 130,
      reachY: 44,
      turn: 0.014,
      wobble: 4,
      wobbleRate: 0.17,
      // The dust: how long she flies between shakes, how long a shake is, and
      // how long the dark it brings lasts.
      dustEvery: 540,
      shakeTicks: 36,
      dustTicks: 240,
    },
    /**
     * THE FROG KING (SHA-213), the boss at the end of level 25. Eight hits,
     * every one of them in the air.
     */
    frogKing: {
      hitPoints: 8,
      points: 250,
      killPoints: 2500,
      enterSpeed: 3,
      // Ticks sitting between hops, the hop's length and height, and the
      // landing's rattle.
      restTicks: 75,
      leapTicks: 48,
      leapHeight: 70,
      thudTicks: 8,
      // The tongue: how far it reaches from the mouth, how fast the ball it
      // catches is sent down, how much of that sideways, how long the tongue
      // is out, and how long before it can flick again.
      tongueRange: 56,
      spitSpeed: 5,
      spitSideways: 0.4,
      tongueTicks: 12,
      tongueRest: 60,
    },
    /**
     * THE SNAIL ELDER (SHA-213), the boss at the end of level 35. Twelve hits
     * on the head; the wall grows back under him while he lives.
     */
    snailElder: {
      hitPoints: 12,
      points: 200,
      killPoints: 2000,
      enterSpeed: 1,
      speed: 0.45,
      // The rows he lays in, from the top, one per pass; what he lays; and
      // how much of his front is head rather than shell.
      layRows: 2,
      layKind: "2",
      headWidth: 12,
    },
  },
  /**
   * THE BOSSES (SHA-209): the fight at the end of every fifth level. What a
   * boss is worth on the clear card, on top of the ordinary bonus.
   */
  bosses: {
    clearBonus: 5000,
  },
  /**
   * THE CHAMBER (SHA-179): particles let into the field through two gates in
   * the side bars, on a clock, out of a bag that widens with the loop.
   *
   * **A clock the player can read.** Eight seconds of quiet after the first
   * launch, then one every twelve, never more than three loose at once — and a
   * lost ball empties the room and starts the eight seconds over, so a serve is
   * always a clean field. At the cap the clock holds, and the next one comes
   * twelve seconds after the room has space again.
   */
  particles: {
    firstTicks: 480,
    intervalTicks: 720,
    cap: 3,
    // Arrival and departure for the things that do not come through a gate: a
    // level's pins materialising on the serve, and the room emptying after a
    // lost ball. The gate is the arrival for everything else.
    arriveTicks: 20,
    leaveTicks: 20,
    gate: {
      // Band height: under the deepest wall the game ships (y 134), over the
      // deck, clear of BUMPERS' discs.
      y: 200,
      height: 12,
      // Six ticks for the bar to part, and six to close after the particle is
      // twelve pixels in.
      travelTicks: 6,
      holdTicks: 6,
      clearPx: 12,
      // The heading a particle comes out on, off the horizontal, up or down at
      // random: never flat along the band, never straight at the ceiling.
      minHeading: Math.PI / 9,
      maxHeading: Math.PI / 3,
    },
    photon: {
      // The loop position it joins the bag at, 1-based.
      joins: 1,
      radius: 2,
      speed: 2.5,
      // How far a ball is bent toward the photon's heading when it takes one.
      scatter: Math.PI / 6,
      points: 50,
      lifeTicks: 1200,
      fadeTicks: 60,
      // The trail behind it, in pixels, and the bloom it goes out in.
      trail: 6,
      bloomTicks: 4,
    },
    electron: {
      joins: 6,
      radius: 2,
      // How fast it flies from the gate to its brick.
      speed: 1.6,
      // The orbit: half its width and height, and one turn every a second and a
      // half. The width clears a brick's ends by three pixels and the height its
      // faces by three, so the ring hugs the brick it is guarding.
      orbitX: 18,
      orbitY: 9,
      periodTicks: 90,
      // How long the ring takes to draw itself once it is in orbit.
      ringTicks: 15,
      // Ticks the brick it was guarding refuses a ball after the knock: the
      // ball the electron turned may still be touching the brick on the same
      // sub-step, and that is the hit the electron took for it.
      wardTicks: 4,
      // How often an electron with nothing to guard looks again.
      searchTicks: 30,
      points: 150,
    },
    nucleus: {
      joins: 13,
      radius: 5,
      speed: 0.6,
      // How much of the ball's velocity it takes when struck: a fifth, so a
      // hard hit sends it off noticeably and a nucleus is never a wall.
      recoil: 0.2,
      // The stretch before it parts, in ticks: long enough to be seen as a
      // split rather than as two things appearing.
      splitTicks: 3,
      points: 100,
      daughter: {
        radius: 3,
        speed: 1.2,
        points: 200,
      },
    },
    antiball: {
      joins: 25,
      radius: 4,
      speed: 0.8,
      points: 500,
      lifeTicks: 1200,
      fadeTicks: 60,
      // How close a ball has to come before the thread ties it to one.
      threadReach: 24,
      // The halo's breath: once every two seconds, and how far out it sits.
      haloTicks: 120,
      haloGap: 2,
      // The whiteout where it met something: its radius and how long it lasts.
      flashRadius: 12,
      flashTicks: 6,
      // Under BLACKOUT: its own dim pool of light, so a threat is never unseen.
      poolRadius: 16,
      poolPeak: 0.45,
    },
  },
  /**
   * THE TITLE (SHA-211): the mockup's home. Where the Observer sits behind the
   * wordmark, in stage pixels, and how big — it looks at the mouse.
   */
  title: {
    eye: { x: 240, y: 92, hw: 80, hh: 28 },
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
    /**
     * TIDE's sea coming in, and going out — and the one pair on this list where
     * the two ends are different *shapes* rather than two readings of one
     * counter.
     *
     * The flood climbs from the frame's bottom line to the waterline in 40
     * ticks: 3 px a tick, which is a row of pixels every frame and reads as
     * water rather than as a rectangle growing. The deck is on the rail for the
     * first six of them — the sea has 17 px of empty field to cross before it
     * is even touching the wood — and is carried the remaining 96 px over the
     * other thirty-four.
     *
     * The drain is longer and is **spent out of the capsule's own 480 ticks**,
     * PORTAL's rule for PORTAL's reason and then some: this blend says where
     * the deck is and which balls are in the water, so it is a hitbox twice
     * over, and a hitbox that outlived its timer would leave the deck floating
     * over a field with nothing holding it up. 50 ticks is slower than the
     * flood on purpose — water arrives all at once and leaves through a hole.
     */
    tideFloodTicks: 40,
    tideDrainTicks: 50,
    // The deck shedding what it was standing in, once it is back on the rail.
    // Twelve ticks of three streaks running off the caps — the last thing the
    // capsule does, and the only part of it the player sees after the water has
    // gone.
    tideDripTicks: 12,
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
     * 12 ticks is 200 ms and 1 % of MIRROR's twenty seconds, and it is deliberately
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
    // the fire takes and sweeps back the way it came when the twenty seconds are
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
    // that twelve strikes in twenty seconds do not compound into a wall that
    // dissolves on the clock. A ring is spent on its own clock rather than the
    // capsule's, so this half of the pair is the one the longer window did not
    // move. This is the number the whole capsule is most sensitive to: at 0.995
    // the wall comes apart whatever the player does.
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
    // some point* to reach failure, so ten seconds of any ringing at all took
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
    // jellied wall takes 30 to 130 contacts in ten seconds where a plain one
    // takes 4 to 11. Over eighteen measured rallies these land the average tear
    // at about a third of the wall; the spread is wide — nothing on one rally,
    // nearly all of it on another — and that is the feedback loop rather than
    // the numbers, since a rally that keeps the ball in the wall keeps feeding
    // the sheet.
    //
    // **Every figure above was measured against a 600-tick capsule, and
    // SHA-163 doubled the window to 1200 without re-measuring them.** These two
    // are rates per tick and do not scale, but the tear they add up to does:
    // the contact count and the third-of-a-wall average are both over ten
    // seconds, and twenty seconds of the same feedback loop is the case the
    // relaxation was introduced to rule out. This is the one row in that
    // ticket where a longer capsule is a stronger capsule rather than a more
    // generous one, and it is the row to watch on a wall the player is losing.
    jellyStrainGain: 0.4,
    jellyStrainRelax: 0.045,
    // Strain to a hit. Three, so a cell shows two notches of load before it
    // pays one out — and it is a *hit*, not a kill: granite still takes four of
    // them, through the same damage path a ball uses.
    jellyStrainPerHit: 3,
    /**
     * SLUMP's gravity. The wall stops being held up and every brick falls until
     * it lands on the brick below it or on the floor, and stays there.
     *
     * The floor is **three rows below the deepest wall in the game** — walls run
     * five to eight rows and this is row eleven — which is what buys the
     * guaranteed first collapse the capsule is named for. On a fresh level with
     * no holes in it at all the whole wall still comes down four to seven rows,
     * so the catch always has something to show; on a wall the player has been
     * eating, the columns compact into their own holes on the way.
     */
    // Where the lowest brick's top edge comes to rest, as a row index. Eleven
    // puts it at y 170, which leaves 94 px of clear air over the deck and sits
    // under BUMPERS' band rather than in it.
    slumpFloorRow: 11,
    // Acceleration and terminal speed, in pixels a tick. A brick reaches the
    // ceiling in about nine ticks and the longest fall — 132 px, a full wall
    // dropping to the floor — takes about three quarters of a second, which is
    // the "guaranteed first second" the capsule opens with.
    slumpGravity: 0.35,
    slumpMaxSpeed: 3,
    // How close to its landing a brick has to be to count as resting. Pixels,
    // and it only exists because the fall is in floats and the rest test is an
    // equality that would otherwise never quite hold.
    slumpRestEpsilon: 0.01,
    // The hesitation before anything moves: four ticks of a wall that has
    // stopped being held up and has not yet noticed. The whole of the arrival
    // the player is given to read it — see the bottom bevel in `drawBrick`.
    slumpHesitateTicks: 4,
    // FENCE: how long before the timer runs out the posts start coming up.
    // SLUMP's and JELLY's pattern — an extraction armed on the tick the capsule
    // ends is an extraction nobody sees — and unlike theirs it is not a taste
    // number: it is exactly the span the pull takes, so the last post bursts on
    // the tick the fence stops existing. `(posts / 2 - 1) * pullStaggerTicks +
    // pullTicks` with the numbers in `powerUps.fence`, and it moves with them.
    fenceReleaseTicks: 17,
    // The mortar being poured back in, as the ticks the line takes to run from
    // the floor up to the top row. Thirty-six is a little over half a second
    // for eight rows, and it is deliberately slower than the fall: going down
    // was gravity and coming back is somebody fixing it.
    slumpSetTicks: 36,
    // The dust a landing throws out of both sides of the impacted cell. Scaled
    // by how hard the brick hit, so a column closing a one-row gap puffs and a
    // wall arriving from six rows up does not.
    slumpLandingBurst: {
      chunkCount: 4,
      minChunkSize: 1,
      maxChunkSize: 2,
      minSpeed: 0.3,
      maxSpeed: 1.2,
      minLifeTicks: 8,
      maxLifeTicks: 20,
    } satisfies BurstSpec,
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
    // stripped row is crossed rather than paraded across. 30 s of life is about
    // eight full rows of chewing, and it nearly always walks off the bottom
    // first — the life timer is the ceiling, the wall is what actually ends it.
    critter: {
      lifeTicks: 1800,
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
