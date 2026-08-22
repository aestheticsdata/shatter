# SHATTER — architecture

How the game is built, for someone who has never opened it. Read top to bottom it
answers, in order: **what runs**, **in what order**, **who owns what state**, and
**where a new capsule or level goes**. Every name, number and file path here is
copied from the code rather than remembered — see [Keeping this honest](#keeping-this-honest).

The player-facing manual is [README.md](../README.md); this file is the machine
under it.

## What you are looking at

|           |                                                             |
| --------- | ----------------------------------------------------------- |
| Language  | TypeScript, `strict`, ES2023 lib                            |
| Framework | none — no React, no game engine, no ECS                     |
| Build     | Vite 7 + Lightning CSS                                      |
| Assets    | none — every sprite, letter and background is drawn in code |
| Source    | 44 files, ~14 000 lines                                     |
| Bundle    | 137 kB, 43 kB gzipped                                       |
| Runtime   | one `<canvas>`, one `<aside>`, ten overlay `<div>`s         |
| Server    | Fastify + better-sqlite3, one table, two routes             |

No asset pipeline is the load-bearing fact. There is no spritesheet to keep in
sync with the code, no atlas, no texture packer, no art directory. A brick is a
few `fillRect` calls, a capsule is a rounded pill with two letters on it, and the
3×5 font that spells `PLAY` in a level layout is an array of bitmasks in
[`wordFont.ts`](../src/core/levels/wordFont.ts). That is why the whole game is
137 kB, and why a level is six strings.

---

## 1. The stage: three surfaces

Everything the player sees lives inside one fixed 480 × 300 box, scaled once to
fit whatever viewport it lands in.

```text
  browser viewport (any size)
  +---------------------------------------------------------------------+
  |                                                                     |
  |    #stage  480 x 300   <- ONE transform: scale(s), applied here     |
  |    +--------------------------------------------+--------------+    |
  |    |                                            |              |    |
  |    |  <canvas id="playfield">                   |   <aside>    |    |
  |    |  372 x 300 logical                         |   #panel     |    |
  |    |  1116 x 900 backing store (SCALE = 3)      |   108 px     |    |
  |    |  imageSmoothingEnabled = false             |              |    |
  |    |                                            |   SCORE      |    |
  |    |  everything that moves at 60 Hz:           |   HI         |    |
  |    |  background, wall, paddle, balls,          |   LEVEL      |    |
  |    |  capsules, shots, particles, effects       |   LIVES      |    |
  |    |                                            |   POWER      |    |
  |    |   +------------------------------------+   |   VOL        |    |
  |    |   |  overlay screens (DOM, absolute)   |   |              |    |
  |    |   |  TITLE SERVE PAUSE CLEAR OVER      |   |   DOM text,  |    |
  |    |   |  SCORES ENTRY LEVELS CAPSULES      |   |   diffed     |    |
  |    |   |  crisp text, [hidden] when idle    |   |              |    |
  |    |   +------------------------------------+   |              |    |
  |    +--------------------------------------------+--------------+    |
  |                                                                     |
  +---------------------------------------------------------------------+

        s = min(0.99 * innerWidth / 480, 0.99 * innerHeight / 300)
```

**One transform, on one element.** [`StageScaler`](../src/ui/StageScaler.ts) is
32 lines and does exactly two things: set `transform: scale(s)` on `#stage`, and
map a `clientX` back through `s` so the paddle follows the real cursor. Nothing
else in the codebase knows the viewport exists. There is no responsive layout, no
media query for the playfield, no resize handler that recomputes geometry —
because at 480 × 300 fixed, there is no geometry to recompute. The stage rect is
cached and invalidated on resize and scroll; that cache is the entire cost of
being scalable.

**Why the split is canvas + DOM and not one or the other.** The 2007 original
rendered the ball, paddle and bricks as absolutely-positioned DOM elements. REV
2.0 moved everything that moves to the canvas, and deliberately left everything
that reads on the DOM. Crisp Silkscreen text in the side panel and the overlay
screens is something the browser is better at than a 3× nearest-neighbour canvas;
twelve balls and a thousand debris particles at 60 Hz is something it is much
worse at. The seam is drawn exactly where the two are each strongest.

**The panel is diffed, not re-rendered.** [`Panel`](../src/ui/Panel.ts) receives a
`PanelView` every animation frame and writes `textContent` only where the value
actually changed. A score that has not moved costs zero DOM work.

---

## 2. The module graph

Path aliases (`@core`, `@entities`, `@render`, `@ui`, `@input`, `@audio`,
`@state`, `@shared`, `@interfaces`) are declared in both `tsconfig.json` and
`vite.config.ts`. They also describe a layering, and the layering is real:

```text
  +------------------------------------------------------------------------+
  |  main.ts                                                                |
  |  Resolves every DOM id, constructs every object, hands them to          |
  |  ShatterGame as one deps bag. The only wiring in the codebase.          |
  +------------------------------------------------------------------------+
                                     |
                                     v
  +------------------------------------------------------------------------+
  |  @core/ShatterGame            3 985 lines, the orchestrator             |
  |  Owns: the loop, the screen, score, lives, level, and one field         |
  |  cluster per capsule effect. The only module that knows all the others. |
  +------------------------------------------------------------------------+
       |            |            |            |            |
       v            v            v            v            v
  +----------+ +----------+ +----------+ +----------+ +-------------+
  | @input   | | @ui      | | @render  | | @entities| | @audio      |
  |          | |          | |          | |          | |             |
  | Input    | | Panel    | | Canvas   | | Ball     | | SoundBank   |
  | Control- | | Screens  | | Renderer | | Paddle   | |   |         |
  | ler      | | Level    | | palette  | | BrickGrid| |   v         |
  |   |      | | Gallery  | | back-    | | DropPool | | Sound       |
  |   |      | | Capsule  | | grounds  | | PowerUp  | | (WebAudio)  |
  |   |      | | Catalogue| | level    | | Timers   | |             |
  |   +--------> Stage    | | Still    | | ShotPool | | self-       |
  |          | | Scaler   | | capsule  | | effects/*| | contained   |
  |          | |          | | Scenes   | |          | |             |
  +----------+ +----------+ +----------+ +----------+ +-------------+
                     |            |            |
                     |     @ui and @render both read @entities and @core/config
                     |            |            |
                     v            v            v
  +------------------------------------------------------------------------+
  |  @core/config   GameConfig  ·  powerUps  ·  combos                      |
  |  @core/levels   levels  ·  wordFont                                     |
  |  @interfaces    types            @shared   dom  ·  format               |
  |                                                                         |
  |  Leaves. powerUps.ts and @shared/* import NOTHING at all.               |
  +------------------------------------------------------------------------+

  @state/HiScores -> @state/ScoreApi -> fetch("/api/scores")
  (hangs off ShatterGame, imports only @interfaces — see section 8)
```

**The rule is: arrows point down.** `@entities` may read `@core/config`; nothing
in `@core/config` may read an entity. `@render` may read an entity's shape in
order to draw it; no entity knows a renderer exists. The one back-edge in the
whole tree is [`checkCapsules.ts`](../src/render/checkCapsules.ts) importing
metrics from `@ui/CapsuleCatalogue` — a dev-only legibility assertion that runs
behind `import.meta.env.DEV` and ships in no bundle.

**`powerUps.ts` importing nothing is deliberate**, and the file says so at the
top: `@interfaces/types` re-exports `PowerUpKind` _from_ `powerUps`, so a cycle
there would put half the game's types behind a partially initialised module.

---

## 3. One frame

```text
  requestAnimationFrame(frame)
        |
        v
  delta = min(50 ms, now - lastTime)      <- a backgrounded tab cannot bank
  accumulator += delta                       thirty seconds of catch-up
        |
        v
  while (accumulator >= 16.667 && steps++ < 4)
        |
        |     stepSimulation()      one integer tick, the whole rule set
        |     accumulator -= 16.667
        |
        v
  renderer.draw(view)     exactly once, whatever the frame rate
  panel.update(view)      DOM text, written only where it changed
```

Three numbers, all in [`GameConfig.ts`](../src/core/config/GameConfig.ts):

```ts
loop: { tickMs: 1000 / 60, maxCatchUpSteps: 4, maxFrameDeltaMs: 50 }
```

The simulation advances in fixed 16.667 ms ticks; rendering happens once per
animation frame. On a 144 Hz display most frames run zero or one tick and draw
anyway. On a 30 Hz frame two ticks run before one draw. Physics is identical in
both cases, which is the entire point — see
[The fixed-timestep contract](#the-fixed-timestep-contract).

The two clamps are the safety rails. `maxFrameDeltaMs` stops a tab that was
hidden for a minute from arriving with 60 000 ms of debt; `maxCatchUpSteps` stops
a machine too slow to run one tick in one tick from spiralling — it drops
simulation time instead of freezing, which for a brick breaker is the right
trade.

---

## 4. Inside a tick

`stepSimulation()` opens with a run of guards, and their **order is the design**.
Everything above the freeze gates keeps animating while the game is stopped;
everything below it does not.

```text
  stepSimulation()
    |
    +-- screen is not "play" or "serve" ......................... return
    +-- screen is "serve"  -> ball rides the paddle ............. return
    +-- dev console is open (freezes exactly like pause) ........ return
    +-- pointer lock expected but lost -> setScreen("pause") .... return
    |
    |   === above the freezes ================================================
    |   brick flashes, catch pops, peel flight, deck-width ease, particles,
    |   QUAKE shake, bumper arrival, and every capsule arrival/expiry blend
    |
    |   These run even mid-explosion. A deck caught halfway between two widths
    |   by a NUKE would otherwise hold there for the whole shockwave -- and the
    |   drawn deck is the catch surface.
    |   ======================================================================
    |
    +-- detonation.active   -> stepDetonation() ................. return  (NUKE)
    +-- clearCountdown > 0  -> --, onLevelCleared() at zero ..... return  (clear)
    +-- deathCountdown > 0  -> --, die() at zero ................ return  (BOMB)
    |
    |   Three freezes, in that order. A pending clear already refuses catches,
    |   so a bomb can never be taken after the last brick is gone.
    |
    v
  timers.tick(frozen)  ->  the kinds that expired this tick
  refreshCombos()      ->  which pairs of live timers are fused right now
    |
    v
  drops fall and are caught, shots fly, effects step,
  balls move (section 5), bricks take damage, score accrues
```

**Why anything animates above a freeze.** A shockwave sweeping the field, or the
last brick shattering, stops the _rules_ — no ball can be lost, no capsule
caught, no timer expiring behind the effect. But it must not stop the _pictures_
that were already mid-transition, or the player sees a frame frozen halfway
through a fade and reads it as a bug. This single ordering decision is the reason
the effect code in `ShatterGame` is grouped the way it is, and nearly every
comment in that region is arguing about which side of the gate a line belongs on.

---

## 5. The ball, sub-stepped

At 4.6 px/tick against 8 px bricks, integrating once per tick would let a fast
ball skip a brick entirely. So each tick is cut into micro-steps small enough
that it cannot.

```text
  per ball, per tick:

    stepVx = vx * timeScale         timeScale from RUSH / TEMPO / STASIS
    stepVy = vy * timeScale
    subSteps = max(1, ceil(max(|stepVx|, |stepVy|) / 2))     <- <= 2 px a step
    dx = stepVx / subSteps
    dy = stepVy / subSteps

    repeat subSteps times:

        x += dx  --> grid.findBallOverlap(x, y)
                     hit? undo x, flip vx, damageBrick()
        y += dy  --> grid.findBallOverlap(x, y)
                     hit? undo y, flip vy, damageBrick()

        then, in this order, every sub-step:
          bumpers -> mirror ceiling -> portal transit -> wall clamp -> paddle

  X and Y resolve separately, so a corner hit reverses one axis and not both.
  Top speed 4.6 px/tick -> 3 sub-steps -> 1.53 px a step. Nothing tunnels.
```

The order inside the loop is stated in a comment in the source and the rest of
the effect code is written to it: _anything that moves a ball without bouncing it
goes above the clamps; anything that bounces it goes below whatever it bounces
off_.

**The brick lookup is O(1).** [`BrickGrid`](../src/entities/bricks/BrickGrid.ts)
is a 12-column array of rows; `findBallOverlap` converts the ball's corners to
cell indices and reads them directly. There is never a scan over live bricks —
not per ball, not per sub-step, not per frame.

**Paddle bounce is angle, not reflection.**
[`PaddleBounce`](../src/core/physics/PaddleBounce.ts) takes `relativeHit ∈ [-1,1]`
across the deck and returns a heading of `relativeHit × 1.05 rad`, preserving
speed. Centre hits go up, edge hits go wide, and the player aims with the paddle
rather than waiting for geometry.

**Ball speed** is `min(4.6, 3.1 + level × 0.25)` px/tick, from `gameConfig.speed`.
It climbs for eighteen levels and then holds.

---

## 6. Screens: the state machine

Ten states, one field (`this.screen`), one setter that also shows the matching
overlay. `advance()` is the single "the player pressed go" verb — mouse click or
key, both routed through the same pointer-lock gate.

```text
   +---------+
   |         |---- L ---->+----------+
   |         |            |  LEVELS  |
   |         |<--advance--|  gallery |
   |  TITLE  |            +----------+
   |         |
   |         |---- B ---->+----------+
   |         |            | CAPSULES |
   |         |<--advance--| catalogue|
   +---------+            +----------+
        |  ^
 advance|  | advance
        v  |
   +---------+  advance   +---------+   P / input lost   +---------+
   |  SERVE  |----------->|  PLAY   |------------------->|  PAUSE  |
   | ball on |  (launch)  | the     |                    | re-arms |
   | the deck|            | rule set|<-------------------| the lock|
   +---------+            +---------+      advance       +---------+
        ^                   |     |
        |      last brick   |     |   last life lost
        |            gone   |     |
        |                   |     |
        |       +-----------+     +-----------+
        |       |                             |
        |       v                             v
        |  +---------+                   +---------+
        +--|  CLEAR  |                   |  OVER   |
 advance,  |  bonus  |                   |  final  |
 level++   |  tally  |                   |  score  |
           +---------+                   +---------+
                                              |  advance
                                              v
                                         score > 0 ?
                                          /        \
                                       yes          no
                                        |            |
                                        v            |
                                  +---------+        |
                                  |  ENTRY  |        |
                                  |   AAA   |        |
                                  +---------+        |
                                        |            |
                                 Return |            |
                                        v            v
                                   +--------------------+
                                   |       SCORES       |
                                   |  hall of fame, 15  |
                                   +--------------------+
                                              |  advance
                                              v
                                        back to TITLE
```

A ball lost with lives still in the rack does not appear above: it calls
`resetServe()` and drops straight back to SERVE. Only the last one reaches OVER.

Every transition, exhaustively:

| From                  | On                                         | To                               |
| --------------------- | ------------------------------------------ | -------------------------------- |
| `title`               | advance                                    | `serve` (`startRun`)             |
| `title`               | `L`                                        | `levels`                         |
| `title`               | `B`                                        | `capsules`                       |
| `levels` / `capsules` | advance or `Esc`                           | `title`                          |
| `serve`               | advance                                    | `play` (`launch`)                |
| `play`                | `P`, cursor left, focus lost, lock dropped | `pause`                          |
| `pause`               | advance or `P`                             | `play` (re-arming the lock)      |
| `play`                | last brick destroyed                       | `clear` (after `clearCountdown`) |
| `clear`               | advance                                    | `serve`, `level++`               |
| `play`                | ball lost, lives remain                    | `serve` (`resetServe`)           |
| `play`                | ball lost, no lives left                   | `over`                           |
| `over`                | advance, score > 0                         | `entry`                          |
| `over`                | advance, score = 0                         | `scores`                         |
| `entry`               | `Return` with 3 letters                    | `scores` (commits the score)     |
| `scores`              | advance                                    | `title`                          |

Two of these states are menus reachable only from the title (`L` for the level
gallery, `B` for the capsule catalogue) because a still of a level is pointless
while one is being played. Both render live miniatures of the _real_ field
through [`levelStill.ts`](../src/render/levelStill.ts) and
[`capsuleScenes.ts`](../src/render/capsuleScenes.ts) — the same sprites, the same
renderer — so adding a level or a capsule makes it appear in its gallery with no
second edit anywhere.

**PAUSE is also a safety state.** The paddle is mouse-only, and the mouse can go
quiet without warning — cursor leaves the window, another window takes focus,
pointer lock drops. Any of those routes to PAUSE rather than leaving a frozen
deck in a live run. `stepSimulation` re-checks the lock every tick as a belt over
that gate.

---

## 7. A capsule, end to end

42 capsules, and not one of them is a special case in the drop machinery. The
whole roster is a table.

```text
  src/core/config/powerUps.ts
  +---------------------------------------------------------------+
  | { id, name, color, letter, ticks, tier, timed, blurb }  x 42   |
  +---------------------------------------------------------------+
        |
        |  everything below DERIVES from that table:
        |    PowerUpKind (the union, inferred from the ids)
        |    POWER_UP_NAMES / _GLYPHS / _DURATIONS / _DROP_WEIGHTS
        |    TIMED_KINDS · MALUS_KINDS · GAMBLE_FACES
        |    DROP_COLORS + DARK_LETTER_DROP_KINDS in @render/palette
        |    the dev console's roster, the catalogue's entries
        v
  BrickGrid.load()  seeds cells with rollBrickCapsule()
        |
        v  brick destroyed
  DropPool.trySpawn(kind, x, y)          max 6 falling at once
        |                                weight = TIER_WEIGHTS[tier]
        |                                common 1 · trap .7 · uncommon .6 · rare .35
        v
  the pill falls                          [ MAGNET bends it toward the deck ]
        |
        v  DropPool.step(paddleSegments, field, onCatch)
        |
        +--- missed ---> off the bottom, slot freed
        |
        v  caught
  ShatterGame.onCatch(kind)
        |
        +--- instantaneous (NUKE, RAIN, 1UP, GAMBLE, ...) --> fires now
        |
        v  timed
  PowerUpTimers.activate(kind, POWER_UP_DURATIONS[kind])
        |
        v  every tick, above the freeze gates:
  blend = stepBlend(blend, timers.isActive(kind), fadeTicks)
             ^ ramps 0->1 on arrival        ^ ramps 1->0 on expiry
        |
        v
  ShatterGame applies the rule at that strength
  RenderView carries the BLEND, never a boolean
        |
        v
  CanvasRenderer draws the tell -- growing in, dying out, never switching
        |
        v
  combos.ts: two live timers overlap -> fusion named in the POWER inset
             (six authored pairs: LANCE NOVA CHARGE STROBE JACKPOT OVERTIME)
```

**The blend, not the flag, is the architectural point.** A capsule that switches
on is a bug in this codebase, not a shortcut — arrival and expiry each get a ramp
in the effect's own idiom, and the renderer is handed the ramp value rather than
"active: true". That is why `ShatterGame` carries `magnetBlend`, `xrayBlend`,
`demakeBlend`, `blackoutBlend`, `portalBlend`, `haywireBlend` and a dozen more as
plain numbers: each is a transition, and each is stepped above the freeze gates so
a shockwave cannot strand one halfway.

**Combos are authored, and stay authored.** `combos.ts` is six deliberate pairs,
not a rule over the registry. Nothing in that file grows with `POWER_UPS.length`,
so adding a capsule cannot silently light a fusion nobody designed.

---

## 8. Scores: the only network call

The game makes exactly one kind of request, to one service, and treats every
failure as "the server is not there".

```text
  game over, score > 0
        |
        v
  ENTRY screen, three letters
        |
        v
  HiScores.commit(name, score)
        |
        +---------------------------------> localStorage   (always, first)
        |                                         ^
        v                                         |
  ScoreApi.submit()   POST /api/scores            |  network error, timeout,
        |             4 s AbortSignal.timeout     |  non-2xx or malformed
        |                                         |  payload  ->  null
        |             any failure -> null --------+  and the local table stands
        v
  nginx  /api/     limit_req zone
                   proxy_set_header X-Forwarded-For $remote_addr   (overwrite)
        |
        v
  Fastify :7000    trustProxy: "127.0.0.1"  -- exactly one hop is trusted, so a
        |                                      client cannot forge request.ip
        +--- per-IP in-memory throttle, 6 POST/min -> 429
        |
        +--- validate.js   ^[A-Z0-9]{3}$ after uppercasing
        |                  crude-combo blocklist -> "???"
        |                  score is an integer 0 .. 10 000 000
        v
  better-sqlite3 (WAL)   shatter.db   TOP_LIMIT = 15
        |                a brand-new table seeds the classic board:
        |                AMI CBM PAL FDD KIK AGA ECS OCS DMA CIA SID C64 MOD WB1 RAM
        v
  { scores: [ { name, score } x 15 ] }
        |
        v
  HiScores replaces its table  ->  onChange()  ->  whichever screen is currently
                                                   showing scores refreshes in place
```

**The client is not trusted, and the server is not required.** Validation lives
entirely on the server; the front-end's job is to degrade gracefully, which it
does by treating `null` as "keep the local table". Run the game with no API at all
and it is fully playable with a `localStorage` hall of fame — the sync just never
lands.

---

## 9. Deployment

```text
  DEV                                  PRODUCTION  (ks-b)
  ---                                  ------------------
  vite dev server                      nginx : shatter.1991computer.com
    |                                    |    own Let's Encrypt cert
    +-- /api proxied to :7000            +-- /      -> /var/www/shatter/front/
                |                        +-- /api/  -> 127.0.0.1:7000
                v                                        |
        node server/src/index.js                         v
                |                                  pm2: shatter-api
                v                                        |
        server/data/shatter.db                           v
        (gitignored)                    /home/debian/apps/shatter-api/data/shatter.db

  Without `pnpm run api` the game falls back to localStorage. Same-origin /api in
  dev is what nginx provides in production, so the front-end code is identical.


  ./scripts/deploy.sh                       ./scripts/deploy-api.sh
  -------------------                       -----------------------
  vite build -> dist/                       rsync server/  (never data/)
  rsync -> front-releases/                  pnpm install --prod --frozen-lockfile
     release-<ts>-<branch>-<hash>           pm2 startOrReload
  front/ -> front.bak/                      healthcheck through the nginx /api/ proxy
  release -> front/
  healthcheck GET / must contain "SHATTER"
     fail -> front.bak/ restored automatically
  prune to MAX_RELEASES_TO_KEEP (20)
  report to Zeus

  Everything shatter owns on ks-b lives inside /var/www/shatter, so the folder is
  the unit of the deploy. What a deploy shipped is recorded in Zeus, not in the
  build -- the bundle carries no release.json.
```

---

## Design notes

### The data-driven spine

Three tables, and the rest of the game is machinery that reads them.

**A level is six strings.** [`levels.ts`](../src/core/levels/levels.ts):

```ts
{ name: "PYRAMID", background: "vault",
  rows: [".....55.....", "....5445....", "...433334...", "..32222223..", ".3111111113."] }
```

Twelve columns, one character a brick, `.` for empty, `1`–`5` for the coloured
tiers, `S` for silver (2 hits) and `G` for gold (3). Word levels like `PLAY` and
`1991` are generated from a 3×5 bitmap font rather than typed out. Add an entry
and the level exists, is playable, and appears in the LEVELS gallery — the
gallery renders the roster, it does not have a list of its own.

**A capsule is a row**, as section 7 lays out. Nine fields in, and the union
type, the glyph, the duration, the drop weight, the palette entry, the timer slot
and the catalogue page all come out.

**A background is a name plus a seed.** Eight themes, each painted once at 1× into
an offscreen layer and blitted per frame with smoothing off — an exact 3×
nearest-neighbour upscale, so theme detail costs nothing in the loop and keeps the
same chunky pixels as the sprites. Layouts come from a seeded generator keyed by
theme _and_ level, so two levels sharing a theme differ and neither ever changes
between visits.

That last one is enforced rather than trusted. `pnpm run check:backgrounds` fails
the build if a theme tone is not darker than the sprite palette, or if two
adjacent levels share a theme — including across the wrap, since the run loops.
The guard is why a new capsule colour "re-opens all eight themes": every capsule
body is checked against every background.

### The fixed-timestep contract

The simulation is integer ticks. The renderer is not. That separation buys three
things:

1. **Identical physics at any frame rate.** A ball launched at the same angle
   lands on the same brick at 30, 60 and 144 Hz. Nothing is multiplied by a frame
   delta, so nothing drifts.
2. **Durations are counts, not milliseconds.** A capsule lasts 480 ticks. A blend
   ramps over 20 ticks. Comparing, freezing and pausing timers is integer
   arithmetic, which is why `OVERTIME` can hold PAYDAY's clock still for the
   length of TEMPO's without a single floating-point concern.
3. **Freezing is trivial.** Pause, the dev console, a NUKE sweep and a level clear
   all work by not calling the tick. No time source needs to be paused, because
   the simulation never asks what time it is.

The price is the catch-up loop and its two clamps — the entire cost of the
contract is those four lines in `frame()`.

### The size of ShatterGame.ts

**It is 3 985 lines, and that is the first thing a reviewer will notice.** So:

It is one class holding a small field cluster per capsule effect — `magnetBlend`,
`xrayBlend`, `xraySweepSpan`, `portalBlend`, `flipTurn`, `haywireBlend`,
`haywireKickIn`, `haywireKicking`, and so on for forty-two capsules and six
combos.

The reason is that **every effect touches the same three or four objects**: the
balls, the paddle, the brick grid, the timers. MAGNET bends falling capsules
toward the deck. PORTAL cuts a hole in the wall that a ball may pass through.
HAYWIRE rotates every ball's heading. GLUE holds balls on the paddle until a
click. SPLIT tears the deck in two. Each one is a rule about the interaction of
existing state, not a self-contained object with state of its own. Factored into
forty small effect classes, each would need mutable access to the balls, the
paddle, the grid, the timers and often to each other's blend — and the coupling
would not have gone anywhere, it would just have been spread across forty files
plus an event bus to reassemble it.

What it costs is real: the file does not fit in a reviewer's head, the ordering
constraints between effects are enforced by comments rather than by types, and
`stepSimulation` has to be read in order to be understood.

**Where the seam is, if it is ever worth cutting.** The effects that own genuinely
independent state have already been extracted —
[`BumperField`](../src/entities/effects/BumperField.ts),
[`MeteorField`](../src/entities/effects/MeteorField.ts),
[`Singularity`](../src/entities/effects/Singularity.ts),
[`Quake`](../src/entities/effects/Quake.ts),
[`Critter`](../src/entities/effects/Critter.ts),
[`Detonation`](../src/entities/effects/Detonation.ts),
[`ParticleField`](../src/entities/effects/ParticleField.ts). Those seven left the
class cleanly because each is a simulation of its own that `ShatterGame` merely
steps and reads. The remaining bulk is the effects that are _modifiers on shared
state_, and the honest next cut is not "one class per capsule" but a `BlendBank`
that owns the ~20 named blends and their step-above-the-gates rule as data,
shrinking the field list without pretending the rules are separable.

### Constraints that shaped the code

- **480 × 300, fixed.** Every coordinate in `GameConfig` is a literal in that
  space. There is no layout engine because there is no layout.
- **Canvas cannot read CSS custom properties.** So the palette exists twice:
  [`src/render/palette.ts`](../src/render/palette.ts) for the canvas, `css/tokens/colors.css`
  for the DOM. They are kept in sync by hand and by the background check.
- **No assets.** Every sprite is `fillRect` calls; every letter in a word level is
  a bitmask; every background is generated. Nothing to load, nothing to cache,
  nothing to version.
- **Mouse-only paddle.** Which makes losing the mouse a first-class state rather
  than an edge case — hence the pointer-lock gate and the PAUSE safety route.
- **Audio is synthesised.** [`Sound`](../src/audio/Sound.ts) is a WebAudio engine
  (tone / noise / arpeggio through a compressor);
  [`SoundBank`](../src/audio/SoundBank.ts) is one recipe per game event. No audio
  files either.

---

## Where to add things

| You want to add    | Edit                                                                                                                  | And that is it                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A level            | one entry in [`levels.ts`](../src/core/levels/levels.ts)                                                              | plays, and appears in the LEVELS gallery                                      |
| A capsule          | one row in [`powerUps.ts`](../src/core/config/powerUps.ts) + its rule in `ShatterGame` + its tell in `CanvasRenderer` | union type, glyph, weight, timer, palette entry and catalogue page all derive |
| A combo            | one pair in [`combos.ts`](../src/core/config/combos.ts)                                                               | both halves must be timed capsules                                            |
| A background theme | a generator in [`backgrounds.ts`](../src/render/backgrounds.ts)                                                       | must pass `pnpm run check:backgrounds`                                        |
| A sound            | one recipe in [`SoundBank.ts`](../src/audio/SoundBank.ts)                                                             | no file, no import                                                            |
| A tunable          | one field in [`GameConfig.ts`](../src/core/config/GameConfig.ts)                                                      | one plain knob, no debug/shipped split                                        |

## Keeping this honest

Documentation drifts. These commands re-derive the numbers in this file:

```bash
find src -name '*.ts' | wc -l                       # file count
find src -name '*.ts' -exec wc -l {} + | tail -1    # total lines
grep -c 'name:' src/core/levels/levels.ts           # level count
grep -c '^  {' src/core/config/powerUps.ts          # capsule count
pnpm run check:backgrounds                          # prints "N levels, N themes"
```

And these are the gates a change has to pass:

```bash
pnpm run typecheck && pnpm run lint && pnpm run fmt:check && pnpm run check:backgrounds && pnpm run build
```
