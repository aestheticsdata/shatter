# SHATTER

Amiga-style brick breaker for one player. Originally written in 2007, rebuilt in 2026 from the playable Claude Design mockup ([SHATTER.dc.html](https://claude.ai/design/p/ef3c88b2-5b26-4718-81f4-0d354e0592bc?file=SHATTER.dc.html)) — REV 2.0.

The game runs on a fixed **480×300 stage** scaled to fit the viewport: a **372×300 canvas playfield** (pixel-art rendering) next to a **108px Workbench-style side panel** (DOM). Vite + strict TypeScript + native CSS with Lightning CSS.

## Gameplay

- **Screens**: title (animated copper bars) → serve → play, with pause, level-clear, game-over, and a hall of fame with 3-letter initials entry. `L` from the title opens the **LEVELS gallery**: every layout in the roster as a live-rendered miniature of the real field — six a page, `←`/`→` to page, and nothing exported, so a new level appears there with no second edit. `B` opens the **CAPSULES catalogue** on the same scaffolding: the whole roster sorted by rarity, each entry a staged miniature of the effect on the field, drawn by the game's own sprites, with the pill at real size and the registry's one-line `blurb` under it.
- **28 levels**: SUNRISE, SMILEY, PYRAMID, CHOMP, GATEWAY, HEART, VORTEX, BOLT, CHECKER, INVADER, RAMPART, ROCKET, HELIX, TETRA, ORBIT, COOL, HIVE, DNA, SERPENT, SKULL, MIRROR, BUNKER, CASCADE, PLAY, MAZE, OMEGA, 1991, FINALE — looping with increasing ball speed. Silver bricks take 2 hits, gold bricks 3.
- **Per-level backgrounds**: eight playfield themes (starfield, nebula haze, blueprint grid, sunrise horizon, gas giant, circuit board, CRT cathode, stone vault), assigned so no two consecutive levels look alike, each seeded per level so the levels sharing a theme still differ. Every theme is static and stays darker than the sprite palette — a `check:backgrounds` script enforces it.
- **Power-ups** dropped by destroyed bricks, each catch acknowledged by a floating label at the paddle. How often a brick drops anything at all is `bonusSpreadAmount`; _which_ capsule it drops is the rarity tier below, and the two are independent.

  |        | Capsule     | Effect                                                                                      | Duration  | Rarity   |
  | ------ | ----------- | ------------------------------------------------------------------------------------------- | --------- | -------- |
  | `WI`   | WIDE        | wider paddle                                                                                | 12 s      | common   |
  | `MU`   | MULTI       | more balls, stacking 3 → 6 → 9                                                              | instant   | common   |
  | `LA`   | LASER       | paddle cannons                                                                              | 12 s      | common   |
  | `BLAS` | BLAST       | ball kills damage the 8 neighbours                                                          | 12 s      | common   |
  | `TE`   | TEMPO       | bullet-time, balls at ×0.6                                                                  | 8 s       | common   |
  | `GL`   | GLUE        | balls stick to the paddle; click or Space releases                                          | 12 s      | common   |
  | `ST`   | STASIS      | every ball stops in mid-air; the paddle keeps going                                         | 1.5 s     | common   |
  | `HO`   | HOMING      | balls curve toward the nearest live brick                                                   | 8 s       | common   |
  | `MI`   | MIRROR      | a ghost paddle rides the top of the field                                                   | 10 s      | common   |
  | `CH`   | CHAIN       | ball kills arc lightning to bricks they don't touch                                         | 10 s      | uncommon |
  | `MA`   | MAGNET      | the paddle vacuums falling capsules in, traps too                                           | 12 s      | common   |
  | `SI`   | SINGULARITY | a black hole bends every ball and eats capsules                                             | 6 s       | uncommon |
  | `PO`   | PORTAL      | a ball leaving one side wall arrives out of the other                                       | 30 s      | uncommon |
  | `BU`   | BUMPERS     | five pinball discs under the grid, 100 points a kick                                        | 12 s      | uncommon |
  | `PI`   | PIERCE      | ball goes through bricks                                                                    | 8 s       | uncommon |
  | `WA`   | WALL        | safety barrier along the bottom                                                             | one save  | uncommon |
  | `PA`   | PAYDAY      | points ×2                                                                                   | 10 s      | uncommon |
  | `ZA`   | ZAP         | vaporizes the bottom-most brick row                                                         | instant   | uncommon |
  | `QU`   | QUAKE       | the bottom row dies, the rest slide down, field shakes                                      | instant   | uncommon |
  | `RA`   | RAIN        | a shower of 4 fresh capsules from the top                                                   | instant   | uncommon |
  | `CR`   | CRITTER     | a grub walks the grid eating a brick every 0.3 s                                            | 15 s      | uncommon |
  | `GA`   | GAMBLE      | a one-second reel lands on a random bonus (or DEMAKE)                                       | one spin  | uncommon |
  | `NU`   | NUKE        | a shockwave destroys every brick, full points                                               | instant   | rare     |
  | `SW`   | SWARM       | 12 balls at once                                                                            | instant   | rare     |
  | `1U`   | 1UP         | extra life, max 6                                                                           | instant   | rare     |
  | `XW`   | XWIDE       | twice the WIDE deck, 144 px of paddle                                                       | 12 s      | rare     |
  | `XR`   | XRAY        | every brick shows the capsule it is holding                                                 | 5 s       | rare     |
  | `ME`   | METEOR      | three meteors drill three lanes through the wall                                            | instant   | rare     |
  | `TU`   | TURBO       | every ball at ×1.5 and every point tripled                                                  | 10 s      | rare     |
  | `AN`   | ANGEL       | catches the ball you were about to lose, once                                               | one save  | rare     |
  | `GH`   | GHOST       | **trap** — the wall goes intangible; the ball flies through                                 | 5 s       | trap     |
  | `SP`   | SPLIT       | **trap** — the deck breaks in two, hole down the middle                                     | 6 s       | trap     |
  | `RU`   | RUSH        | **trap** — every ball at ×1.8                                                               | 5 s       | trap     |
  | `BO`   | BOMB        | catching it blows the paddle up: you lose a life                                            | instant   | trap     |
  | `JA`   | JAMMER      | **trap** — shrinks the paddle                                                               | 6 s       | trap     |
  | `BA`   | BANANA      | **trap** — throws a peel on the rail; sweeping it hands the deck to momentum for a second   | 10 s peel | trap     |
  | `DE`   | DEMAKE      | **trap** — the machine downgrades itself to a 1-bit green phosphor tube                     | 8 s       | trap     |
  | `BLAC` | BLACKOUT    | **trap** — the lights go out; a pool of light travels with each ball, a dim one on the deck | 20 s      | trap     |
  | `FL`   | FLIP        | **trap** — the whole playfield turns over, mouse and all                                    | 8 s       | trap     |

  **GAMBLE hands the decision to a machine.** Catching it opens a framed reel over your deck that turns ten faces in a second, lands on one, holds it for a fifth of a second, and then fires it — a NUKE, a SWARM, an extra life, anything on the roster **except itself and except the traps**. A lottery you cannot stop may not punish you for playing it: catching a capsule that shrinks your deck is a decision you made, and the same thing arriving out of a drum you had no hand in is only the game taking a turn against you. The exclusion is the `trap` tier itself, so it keeps itself current as traps are invented — with **one named exception, DEMAKE**, which stays on the drum because it is the trap that costs nothing but nerve: the machine drops to a 1-bit tube and the game underneath is untouched. BLACKOUT and FLIP are presentation-only in the same way and are not on it; both genuinely take the ball away from you while they last. The faces are **uniform over what is left**, not weighted by how often each capsule drops: the drop weights say how often a capsule _falls_, and the point of the reel is that the rare things are on the table, which means a rare capsule turns up here several times more often than it ever falls. The reel is drawn on the field rather than in the POWER inset, because the reel _is_ the effect and a player watching the panel would miss the one second it exists — and it is the one capsule with no catch pop, since the label and the drum would print over each other. A spin still turning when the level clears or the ball drains dies with the rest of the run state.

  **ANGEL is the one thing in a run that outlives the ball that bought it.** Caught, it arms a single save and **your deck grows wings** — two silver tufts that stir on the ends of the paddle for as long as you are holding one, because a capsule you cannot see yourself holding is a capsule that appears to do nothing until the minute it fires. The next ball that crosses the death line is thrown back above it in a burst of the same feathers with a `SAVED` pop, the wings go, and the life you were about to spend is never spent — it will void a game over on your last life. It only ever fires on the **last ball on the field**, because a charge burned while eleven others are still in flight is a charge nobody saw being spent, and WALL never has to be arbitrated against it: the barrier sits at 294 and turns the ball around six pixels above where ANGEL is even asked. Every other piece of run state is wiped by the serve after a lost ball; the charge deliberately is not, which is what carries it from one level to the next. A new run and a game over clear it.

  **RUSH and TURBO are the same knob pulled by opposite hands** — a trap at ×1.8 for five seconds against a rare bonus at ×1.5 for ten that also triples every brick — so the game never leaves it to the pill you caught to say which is in hand: the smear behind the ball runs **hot for the trap and cold for the bonus**, and the SCORE readout blinks while points are worth more than they say (PAYDAY's own tell, shared). TURBO winds up to speed over half a second rather than arriving, and its comet grows out of the ball as it does. Caught together they multiply — 4.6 × 1.8 × 1.5 is 12.4 px a tick, seven sub-steps, and the wall still stops the ball — because a bonus that quietly did nothing under a trap would read as a broken capsule. The ×3 is brick kills only: the level-clear bonus and a bumper kick take PAYDAY alone, or FINALE would pay 42 000 and a ball parked between two discs would farm 300 a kick.

  **A trap says so before you catch it**: its glyph blinks as it falls, and the catch pop is pink with a detuning womp instead of the usual chime. That tell is the `trap` tier itself, so it costs a new trap capsule nothing to get all three.

  **DEMAKE is the one trap that costs nothing but nerve.** For 8 seconds the whole machine downgrades itself — playfield, side panel and sound chip drop to a 1-bit green phosphor tube with scanlines, flat squares and no noise channel — while the simulation underneath is untouched: same ball, same paddle, same score. It sags into the tube and back out over half a second at each end rather than flipping, so it reads as hardware giving up and not as a dropped frame: the canvas paints both machines and crossfades them, the panel rides a CSS transition over the same tokens, and the chip — which cannot dissolve — gives out as the picture passes halfway. It is one of the three capsules that touch presentation and nothing else — BLACKOUT and FLIP are the others — and the only one barred from a run's first level: the gag only reads as the machine breaking down once you have seen the machine working. The reduction runs off two tones and one rule — the sprite palette's _shadow_ role becomes the tube's ground and everything else its ink, so the 1px bevels the art is banded with survive and the wall stays a wall; the field theme is thresholded by luma into the same two tones and cached beside its colour twin.

  **BLACKOUT is the second, and it is the cheaper trick.** For 20 seconds the lights go out: the field is black but for a pool of light travelling with each ball and a dimmer one on the deck. Nothing in the simulation is told — same ball, same paddle, same score — and the capsules stay lit as they fall, deliberately, since a trap caught because it could not be read would be the trap punishing you twice. More balls light more of the field: each extra live ball takes 6 px off every pool, from 58 solo down to a floor of 26, so MULTI and SWARM buy visibility without ever lifting the trap. A NUKE's sweep and the last brick's shatter light the field by definition, and since neither freeze runs the timers, the dark gets its seconds back afterwards. The veil is one canvas built at field size and blitted up with smoothing off, with a radial gradient per ball punched out of it — so the falloff steps in whole game pixels, which is the art everything else on the field is drawn in. It does not switch on: the pools open wider than the field and **close onto the ball over three quarters of a second**, then run the same way back out when the capsule expires — a light dropping fast and then dying slowly, which is what the power-down on the catch sounds like. Nothing cross-fades; the dark is never painted at half strength, it simply has not reached you yet.

  **FLIP is the third, and the only one that touches your hands.** For 8 seconds the arena turns over — the wall at the bottom, the deck riding the ceiling, the frame's closed edge drawn where the bricks now are so you can see which side still kills you — and the mouse turns with it, so the deck on screen keeps following the hand. Nothing under it moves: the same ball falls the same way in simulation space, and losing it is still the bottom of the field, which is now the top of the screen. It does not snap over: it **rotates about the field centre over half a second** at each end, shrinking just enough on the way round for a 372×300 field standing on its side to still fit a 300 px canvas, and settling on an exact point reflection where every sprite lands back on whole device pixels. The field art stays put underneath, for the same reason it does not ride QUAKE's shake — it is the room, not something standing on the field. The mouse changes over at the halfway point rather than continuously, because at a quarter turn the field is on its side and there is no left or right to lend a hand. Two things stay the right way up: the letter on a falling capsule and the catch pop, both counter-rotated about their own centre off the canvas matrix itself, so a trap caught upside down can still be read as one.

  The side panel's **POWER** inset names the live effects while they fit its 13 characters (`WIDE MULTI x3`) and packs them into a still glyph row when they do not (`E M3 L P B +5`) — a row that holds still can be read mid-rally, which a label cycling one name per second could not.

- **Scoring**: 60–200 points per brick by kind, level-clear bonus `(level+1) × 500`. The top-5 hall of fame is **shared across all players**: scores live in a server-side SQLite table behind the `shatter-api` service, with `localStorage` (`shatter.hiscores.v1`) as instant-boot cache and offline fallback — the game never waits on the network.
- **Audio**: WebAudio chiptune SFX, 100% synthesized (no assets): a per-event sound bank (square pitch-bends, detuned pairs, filtered noise bursts) on a master gain → compressor chain, with a 30 ms retrigger guard against same-tick pile-ups. An SFX volume fader lives in the side panel (persisted in `localStorage` `shatter.volume.v1`, scaling the master gain ahead of the compressor). An inaudible 30 Hz keep-warm tone stops browser/HDMI/Bluetooth silence detection from swallowing short impact blips. Every voice in the bank goes out through three private wrappers, which is what lets DEMAKE downgrade the chip along with the screen in one flag rather than one branch per sound: glides, detuning and the noise channel all go, leaving flat squares.

### Controls

- **Mouse** moves the paddle; **click** or **Space** starts the game, launches the ball, and advances screens.
- Clicking also engages **Pointer Lock** (relative `movementX` control); without lock, absolute pointer position is used. Press `Esc` once to exit lock.
- **P** pause · **M** sound on/off · **L** levels gallery · **B** capsules catalogue (both from the title) · **VOL** fader in the side panel (mouse-only, reachable whenever the cursor is free — title, pause, before launch) · **ESC** quit run (from lock, press `Esc` twice: first exits lock, second quits), or leave the levels gallery and the capsules catalogue.
- The mouse is the only paddle control, so a run **auto-pauses** whenever it would go on unsteered: cursor leaving the window, window losing focus, or pointer lock dropping. Click to resume — that click also re-engages the lock.

## Tutorial

```bash
pnpm install
pnpm dev
```

Open the URL shown by Vite.

Optionally run the score API next to it (otherwise the hall of fame falls back to `localStorage`):

```bash
cd server && pnpm install && cd .. && pnpm run api
```

Vite proxies `/api` to `127.0.0.1:7000` in dev, mirroring the nginx setup in production (port 7000 is shatter's Zeus registry allocation).

## How-to

Build and preview production assets:

```bash
pnpm build
pnpm preview
```

Run quality checks:

```bash
pnpm run fmt:check
pnpm run lint
pnpm run typecheck
pnpm run check:backgrounds
```

Auto-fix formatting and lint issues:

```bash
pnpm run fmt
pnpm run lint:fix
```

Test gameplay quickly with the **dev test console** — `Ctrl`+`Option`+`Command`+`K` (⌃⌥⌘K) during serve, play or pause, the same screens WARP allows. It opens a modal over the field, in the pause screen's own style, and freezes the run behind it. The modal lists its own commands and every capsule, and `Enter` applies the line and closes. **Every command is a word followed by its arguments** — `POWER MU`, not `MU`. A line it cannot use keeps what you typed and says why, so a mistake is one `Backspace` from fixed: a bare capsule or number answers `TYPE: POWER MU` / `TYPE: LEVEL 3` / `TYPE: BONUS 0.5`, a known command with a bad argument answers for itself (`LEVELS START AT 1`, `BONUS IS 0 TO 1`, `NO SUCH CAPSULE: ZZ`, `POWER NEEDS A CAPSULE`), and only an unrecognised word falls back to `UNKNOWN COMMAND`:

- `power nuke` · `power NU` · `power WI MU LA` — **make capsules fall**, spread across the top of the field, to be caught with the paddle like any other. It does not grant the effect: the console freezes the run, so anything applied outright had already happened by the time you were looking at the game again, and the effect _arriving_ — which is usually the thing you opened the console to watch — was the one thing you could never see. Nothing happens while the modal is up; they drop on the first live tick after it closes. Miss one and it is gone, which is two words and a chord to fix. **Name or glyph, whichever you remember** (and the internal id still answers too) — and the modal prints the whole roster (`WI WIDE`, `MU MULTI`, …) underneath, generated from the capsule registry, so a new capsule appears there by itself. Repeat one for several (`power MU MU MU`); one unrecognised capsule refuses the whole line, and so does a line the drop pool has no room for (`NO ROOM · CAPSULES ALREADY FALLING`) rather than spawning half of it.
- `level 12` — jump to a level (1-based, unbounded: runs loop past level 28, so `level 30` is level 2 at its wrapped ball speed)
- `bonus 1` — set `bonusSpreadAmount` for this run: the chance a destroyed brick drops a capsule at all, not how fast one falls (0..1; kept until changed or reloaded)
- `gamble nuke` — pin what GAMBLE's reel lands on, so a one-in-thirty-nine result can be tested without catching capsules until it comes up; `gamble` on its own hands it back to chance. It resolves a name, a glyph or an id like `power` does, and refuses anything the reel cannot land on (`NOT ON THE REEL: JAMMER`), asked of the very list the reel rolls from, so a pin can never produce a result the game cannot reach. Unlike the other three this is a setting, not an action, so it survives a lost ball and a new run — a testing tool you would otherwise retype after every mistake.

**It gives the cursor back, and it never traps you.** Opening the console releases pointer lock first: the cursor reappears where you can see it, and `Escape` reaches the page — the browser only swallows that key when it needs it to exit a lock, which is why a modal must not hold one. Losing the lock also pauses a live run, which is exactly the freeze wanted behind a modal. `Escape`, ⌃⌥⌘K again, or a click anywhere all close it; the click that resumes from the pause screen re-captures the cursor as usual.

The console is **dev-only** — it is built behind `import.meta.env.DEV`, so `src/core/DevConsole.ts` and the chord that opens it are absent from production bundles, exactly like the `?level=` / `?droprate=` / `?power=` URL params it replaces. It builds its own markup and carries its own inline styles for the same reason: nothing about it reaches `index.html` or `css/`.

Two debug affordances work in **production builds too**, where the console does not exist:

- **WARP easter egg** — `Ctrl`+`Option`+`Command`+`N` (⌃⌥⌘N) during serve, play or pause instantly wins the current level, straight to the CLEARED screen. Nothing claims all three modifiers at once: Chrome binds only ⌘N and ⇧⌘N, and macOS has no ⌃⌥⌘ default. Matched on the physical key (`event.code === "KeyN"`), because Option rewrites `event.key` into the alternate glyph while the N keycap sits in the same place on AZERTY, QWERTY and QWERTZ. **A warp scores nothing** — no brick points, and the clear bonus shows `00000`: the hall of fame is shared across all players, so skipping a level must never be worth points.
- **The bonus knob** — `gameConfig.rules.bonusSpreadAmount` (`src/core/config/GameConfig.ts`) is the chance a destroyed brick drops a capsule: crank it to `1` while debugging (every brick drops one), set it back to what players should get before deploying. It ships as-is; `deploy.sh` prints the value in the deploy log so a knob left cranked is caught by eye. In dev, the console's `bonus` command overrides it for one run without touching the file.

Deploy to production (versioned release + auto rollback on failure):

```bash
./scripts/deploy.sh deploy
```

Manual rollback:

```bash
./scripts/deploy.sh rollback
./scripts/deploy.sh list-releases
./scripts/deploy.sh rollback-to release-YYYYMMDD-HHMMSS-branch-hash
```

## Reference

### Project structure

```text
src/
  core/
    ShatterGame.ts   # Orchestrator: state machine, fixed-timestep loop, game rules
    config/          # GameConfig: geometry, speeds, timers, points · powerUps: the capsule roster
    levels/          # ASCII level definitions (28 layouts) + 3×5 pixel font for word levels
    physics/         # Paddle bounce math
  entities/
    ball/            # Ball position/velocity, launch, multi-ball cloning
    paddle/          # Paddle position/width with field clamping
    bricks/          # BrickGrid: cell parsing, HP, grid collision queries
    powerups/        # PowerUpTimers (timed effects) + DropPool (weighted falling capsules)
    effects/         # ParticleField (debris ring buffer) + Detonation (NUKE shockwave)
    laser/           # ShotPool (paddle cannon shots)
  render/            # CanvasRenderer (pixel sprites) + palette (sprite hex colors) + backgrounds (per-level field art) + levelStill/capsuleScenes (field-sized stills for the menu screens)
  ui/                # Panel (side panel), Screens (overlays), LevelGallery + CapsuleCatalogue (menu screens), StageScaler (fit transform)
  input/             # InputController: mouse + keyboard + hybrid pointer lock
  audio/             # Sound: WebAudio engine (tone/noise/arp + compressor) · SoundBank: per-event SFX recipes
  state/             # HiScores (server table + localStorage fallback) + ScoreApi client
  interfaces/        # Shared TS types
  shared/            # DOM + formatting utilities
  main.ts            # Bootstrap / dependency wiring

css/
  main.css           # Entrypoint (@import)
  base.css           # Reset, cursor hiding, [hidden] handling
  layout.css         # Stage, playfield canvas, panel placement
  components.css     # Panel widgets, overlay screens, blink/copper keyframes
  tokens/            # colors (SHATTER palette), sizes, typography, motion

server/
  src/
    index.js         # shatter-api: Fastify routes, per-IP rate limit (6 POST/min)
    db.js            # better-sqlite3 (WAL), schema + classic-board seeding
    validate.js      # ^[A-Z0-9]{3}$ names, blocklist → "???", score cap
  ecosystem.config.cjs  # pm2 app definition (port must match nginx + Zeus registry)

scripts/
  deploy.sh          # Deploy the game + rollback (auto/manual)
  deploy-api.sh      # Deploy shatter-api (rsync + pnpm install + pm2 reload)
  check-backgrounds.mjs # Background readability + level-assignment guard (pnpm run check:backgrounds)
```

### Engine details

- **Fixed timestep**: 60 Hz accumulator (frame delta clamped to 50 ms, max 4 catch-up steps per frame); rendering every animation frame.
- **Sub-stepped ball movement**: each tick is split into `ceil(max(|vx|,|vy|)/2)` micro-steps, X then Y, with a brick-grid collision query per axis — fast balls can't tunnel through bricks.
- **Brick death effects**: destroyed bricks flash white and burst into debris from a 1024-slot particle ring buffer; the NUKE sweep and the level-clear delay freeze the simulation (only effects tick), so the clear screen never cuts an animation short and no ball can be lost behind an explosion.
- **Brick collision**: O(1) grid lookup (`cellAt`) + 4-corner overlap test for the 8px ball, instead of scanning all bricks.
- **Paddle bounce**: `relativeHit ∈ [-1, 1]` → angle `relativeHit × 1.05 rad`; speed is preserved, so center hits go up and edge hits go wide.
- **Ball speed**: `min(4.6, 3.1 + level × 0.25)` px/tick, times the `ballSpeedMultiplier` config.
- **Canvas palette** lives in `src/render/palette.ts` (canvas cannot read CSS custom properties); the same colors are exposed to the DOM as CSS tokens in `css/tokens/colors.css`.
- **Capsules are a registry**: `src/core/config/powerUps.ts` holds one row per power-up — id, glyph, name, body color, letter tone, duration, rarity tier, timed-ness — and everything else derives from it: the `PowerUpKind` union, the name/glyph/duration/weight lookups, `MALUS_KINDS`, `DROP_COLORS` and `DARK_LETTER_DROP_KINDS` in the palette, the timers' countdown list, and the console's roster. **Rarity is a tier, not a number per row**: four weights (`common` 1, `uncommon` 0.6, `trap` 0.7, `rare` 0.35) shared by the whole roster, because weights authored one capsule at a time flatten out — 9 of the first 15 sat at exactly 1. The `trap` tier doubles as the malus flag, driving the blinking letter, the pink catch pop and the womp. **Adding a capsule is adding one row**, and forgetting to is a type error rather than a silent gap. The **glyph is separate from the id** because one letter stopped meaning anything around the fifteenth capsule — three names open on B and three on P, and a lone `B` said nothing about which. A pill shows **the first two letters of the name**, and more only where two names collide (MIRROR and MIMIC would both be `MI`, so they become `MIR`/`MIM`; BLAST and BLACKOUT still tie at three, so they become `BLAS`/`BLAC`). That is derived from the names, not authored per row, because it is a property of the whole roster: adding a capsule can lengthen an old one's glyph in the same breath. Ids stay as they are — they are internal, and thirty-odd `kind === "..."` branches are written in them. The pill's font is picked by measuring the glyph against the sheen span rather than by counting characters (7 → 5 → 4px), so a longer name costs a font rung and never overflows — Silkscreen is proportional, and two letters turn out to keep the 7px the roster drew single letters at. In dev, a pass after `document.fonts.ready` measures every glyph against the pill, checks no two capsules ended up with the same one, and checks every letter clears 3:1 on its body.
- **Backgrounds are pre-rendered**: each level names a theme (`background` in its definition) painted once into an offscreen 1× layer and blitted per frame with smoothing off (an exact 3× upscale), so theme detail is free in the loop — measured slightly cheaper than the old flat fill + 58 star rects. Layouts come from a seeded generator keyed by theme and level, so a level's field art never changes between visits. Theme tones are split into `area` (large regions, kept as dark as the classic field) and `speck` (1–3px sparkle); `pnpm run check:backgrounds` fails the build on a tone that is too bright, too close to a brick/capsule color, or on two adjacent levels sharing a theme.
- **Panel updates are diffed**: DOM text is only written when a value changes, never per frame.
- **Stage scaling**: `transform: scale(min(0.99·vw/480, 0.99·vh/300))`, with the stage rect cached and invalidated on resize/scroll; pointer coordinates are mapped through the scale.

### Score API

- `GET /api/scores` → `{ scores: [{ name, score }] }` (top 5, ties rank by insertion order).
- `POST /api/scores` `{ name, score }` → `201` with the fresh top 5, or `422` on invalid input.
- Server-side validation (the client is not trusted): names must match `^[A-Z0-9]{3}$` after uppercasing, a small blocklist of crude combos lands as `???`, scores are integers `0..10 000 000`.
- Per-IP in-memory rate limit (6 POST/min, `429`) behind the nginx `limit_req` zone; submitter IPs are stored for abuse cleanup.
- SQLite file: `server/data/shatter.db` locally (gitignored), `/home/debian/apps/shatter-api/data/shatter.db` on ks-b — a brand-new table is seeded with the classic board (AMI, CBM, PAL, FDD, KIK).
- The front (`ScoreApi`) treats every failure as `null` and keeps the `localStorage` table; a remote sync landing refreshes whichever screen currently shows scores.

### Deployment

- Target host default: `debian@ks-b`, app folder `/var/www/shatter` (URL `https://shatter.1991computer.com/`). Everything lives inside it, bkmk-style: live root `front/` (the nginx root), versioned history `front-releases/`, previous version `front.bak/`.
- Nginx vhost: `/etc/nginx/conf.d/shatter.conf` on ks-b, with its own Let's Encrypt certificate (webroot renewal, like the other subdomains). The legacy `https://1991computer.com/arkanoid-2007/` path is dropped and returns 404.
- Each deploy creates a versioned `front-releases/release-<timestamp>-<branch>-<hash>` — the folder name carries the metadata; previous live version is kept as `front.bak` and restored automatically if the healthcheck fails. What a deploy shipped is recorded in Zeus, not in the build: the report carries release, commit, branch, status and the commit range.
- Healthcheck marker in the deployed HTML: `SHATTER`.
- Overridable via env vars (`REMOTE_USER_HOST`, `WEB_ROOT_BASE`, `HEALTHCHECK_URL`, `EXPECTED_HTML_MARKER`, `MAX_RELEASES_TO_KEEP`, `BUILD_BASE_PATH`).
- The score API deploys separately with `./scripts/deploy-api.sh`: rsync of `server/` to `/home/debian/apps/shatter-api` (the `data/` directory is never touched), `pnpm install --prod --frozen-lockfile`, `pm2 startOrReload`, then a healthcheck through the nginx `/api/` proxy.
- The nginx `/api/` location must set `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, not append) — the API trusts exactly that one hop (`trustProxy: "127.0.0.1"`) so clients cannot forge `request.ip` to dodge the rate limit.

### Tooling policy

- Formatter: `oxfmt` (`printWidth: 120`) is the single formatting source of truth.
- Linter: `oxlint` enforces `correctness` and `suspicious`; `style` is disabled to avoid formatter conflicts.
- CSS: Lightning CSS transformer with native nesting (`Features.Nesting`); design tokens in `css/tokens/*`.
- Strict TypeScript (`ES2023` lib for `Array#toSorted`), path aliases in both `tsconfig.json` and `vite.config.ts`: `@`, `@audio`, `@core`, `@entities`, `@input`, `@interfaces`, `@render`, `@shared`, `@state`, `@ui`.

## Explanation

The 2007 original (and its first modernization) rendered the ball, paddle, and bricks as DOM elements. REV 2.0 moves gameplay rendering to a single pixel-art canvas — DOM stays where it is better (crisp text in the side panel and overlay screens) and the canvas handles everything that moves at 60 Hz. The Claude Design mockup is the spec of record: its embedded script defines the exact geometry, physics constants, palette, and screen flow that this codebase re-implements as typed, testable modules.
