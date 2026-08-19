# SHATTER

Amiga-style brick breaker for one player. Originally written in 2007, rebuilt in 2026 from the playable Claude Design mockup ([SHATTER.dc.html](https://claude.ai/design/p/ef3c88b2-5b26-4718-81f4-0d354e0592bc?file=SHATTER.dc.html)) — REV 2.0.

The game runs on a fixed **480×300 stage** scaled to fit the viewport: a **372×300 canvas playfield** (pixel-art rendering) next to a **108px Workbench-style side panel** (DOM). Vite + strict TypeScript + native CSS with Lightning CSS.

## Gameplay

- **Screens**: title (animated copper bars) → serve → play, with pause, level-clear, game-over, and a hall of fame with 3-letter initials entry.
- **28 levels**: SUNRISE, SMILEY, PYRAMID, CHOMP, GATEWAY, HEART, VORTEX, BOLT, CHECKER, INVADER, RAMPART, ROCKET, HELIX, TETRA, ORBIT, COOL, HIVE, DNA, SERPENT, SKULL, MIRROR, BUNKER, CASCADE, PLAY, MAZE, OMEGA, 1991, FINALE — looping with increasing ball speed. Silver bricks take 2 hits, gold bricks 3.
- **Per-level backgrounds**: eight playfield themes (starfield, nebula haze, blueprint grid, sunrise horizon, gas giant, circuit board, CRT cathode, stone vault), assigned so no two consecutive levels look alike, each seeded per level so the levels sharing a theme still differ. Every theme is static and stays darker than the sprite palette — a `check:backgrounds` script enforces it.
- **Power-ups** dropped by destroyed bricks, each catch acknowledged by a floating label at the paddle. How often a brick drops anything at all is `bonusSpreadAmount`; _which_ capsule it drops is the rarity tier below, and the two are independent.

  |      | Capsule     | Effect                                                      | Duration | Rarity   |
  | ---- | ----------- | ----------------------------------------------------------- | -------- | -------- |
  | `E`  | WIDE        | wider paddle                                                | 12 s     | common   |
  | `M`  | MULTI       | more balls, stacking 3 → 6 → 9                              | instant  | common   |
  | `L`  | LASER       | paddle cannons                                              | 12 s     | common   |
  | `B`  | BLAST       | ball kills damage the 8 neighbours                          | 12 s     | common   |
  | `T`  | TEMPO       | bullet-time, balls at ×0.6                                  | 8 s      | common   |
  | `G`  | GLUE        | balls stick to the paddle; click or Space releases          | 12 s     | common   |
  | `I`  | STASIS      | every ball stops in mid-air; the paddle keeps going         | 1.5 s    | common   |
  | `H`  | HOMING      | balls curve toward the nearest live brick                   | 8 s      | common   |
  | `Y`  | MIRROR      | a ghost paddle rides the top of the field                   | 10 s     | common   |
  | `C`  | CHAIN       | ball kills arc lightning to bricks they don't touch         | 10 s     | uncommon |
  | `K`  | MAGNET      | the paddle vacuums falling capsules in, traps too           | 12 s     | common   |
  | `V`  | SINGULARITY | a black hole bends every ball and eats capsules             | 6 s      | uncommon |
  | `PO` | PORTAL      | a ball leaving one side wall arrives out of the other       | 30 s     | uncommon |
  | `O`  | BUMPERS     | five pinball discs under the grid, 100 points a kick        | 12 s     | uncommon |
  | `P`  | PIERCE      | ball goes through bricks                                    | 8 s      | uncommon |
  | `W`  | WALL        | safety barrier along the bottom                             | one save | uncommon |
  | `X`  | PAYDAY      | points ×2                                                   | 10 s     | uncommon |
  | `Z`  | ZAP         | vaporizes the bottom-most brick row                         | instant  | uncommon |
  | `Q`  | QUAKE       | the bottom row dies, the rest slide down, field shakes      | instant  | uncommon |
  | `R`  | RAIN        | a shower of 4 fresh capsules from the top                   | instant  | uncommon |
  | `N`  | NUKE        | a shockwave destroys every brick, full points               | instant  | rare     |
  | `S`  | SWARM       | 12 balls at once                                            | instant  | rare     |
  | `U`  | 1UP         | extra life, max 6                                           | instant  | rare     |
  | `GH` | GHOST       | **trap** — the wall goes intangible; the ball flies through | 5 s      | trap     |
  | `BM` | BOMB        | catching it blows the paddle up: you lose a life            | instant  | trap     |
  | `J`  | JAMMER      | **trap** — shrinks the paddle                               | 6 s      | trap     |

  **A trap says so before you catch it**: its letter blinks as it falls, and the catch pop is pink with a detuning womp instead of the usual chime. That tell is the `trap` tier itself, so it costs a new trap capsule nothing to get all three.

  The side panel's **POWER** inset names the live effects while they fit its 13 characters (`WIDE MULTI x3`) and packs them into a still glyph row when they do not (`E M3 L P B +5`) — a row that holds still can be read mid-rally, which a label cycling one name per second could not.

- **Scoring**: 60–200 points per brick by kind, level-clear bonus `(level+1) × 500`. The top-5 hall of fame is **shared across all players**: scores live in a server-side SQLite table behind the `shatter-api` service, with `localStorage` (`shatter.hiscores.v1`) as instant-boot cache and offline fallback — the game never waits on the network.
- **Audio**: WebAudio chiptune SFX, 100% synthesized (no assets): a per-event sound bank (square pitch-bends, detuned pairs, filtered noise bursts) on a master gain → compressor chain, with a 30 ms retrigger guard against same-tick pile-ups. An SFX volume fader lives in the side panel (persisted in `localStorage` `shatter.volume.v1`, scaling the master gain ahead of the compressor). An inaudible 30 Hz keep-warm tone stops browser/HDMI/Bluetooth silence detection from swallowing short impact blips.

### Controls

- **Mouse** moves the paddle; **click** or **Space** starts the game, launches the ball, and advances screens.
- Clicking also engages **Pointer Lock** (relative `movementX` control); without lock, absolute pointer position is used. Press `Esc` once to exit lock.
- **P** pause · **M** sound on/off · **VOL** fader in the side panel (mouse-only, reachable whenever the cursor is free — title, pause, before launch) · **ESC** quit run (from lock, press `Esc` twice: first exits lock, second quits).
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

Test gameplay quickly with the **dev test console** — `Ctrl`+`Option`+`Command`+`K` (⌃⌥⌘K) during serve, play or pause, the same screens WARP allows. It opens a modal over the field, in the pause screen's own style, and freezes the run behind it. The modal lists its own commands and every capsule, and `Enter` applies the line and closes. **Every command is a word followed by its arguments** — `POWER M`, not `M`. A line it cannot use keeps what you typed and says why, so a mistake is one `Backspace` from fixed: a bare capsule or number answers `TYPE: POWER M` / `TYPE: LEVEL 3` / `TYPE: BONUS 0.5`, a known command with a bad argument answers for itself (`LEVELS START AT 1`, `BONUS IS 0 TO 1`, `NO SUCH CAPSULE: ZZ`, `POWER NEEDS A CAPSULE`), and only an unrecognised word falls back to `UNKNOWN COMMAND`:

- `power nuke` · `power N` · `power E M L` — apply capsules on the spot, exactly as if they had been caught. **Name or letter, whichever you remember** — and the modal prints the whole roster (`E WIDE`, `M MULTI`, …) underneath, generated from the capsule registry, so a new capsule appears there by itself. Repeat one to stack (`power M M M`); one unrecognised capsule refuses the whole line rather than granting half of it.
- `level 12` — jump to a level (1-based, unbounded: runs loop past level 28, so `level 30` is level 2 at its wrapped ball speed)
- `bonus 1` — set `bonusSpreadAmount` for this run: the chance a destroyed brick drops a capsule at all, not how fast one falls (0..1; kept until changed or reloaded)

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
  render/            # CanvasRenderer (pixel sprites) + palette (sprite hex colors) + backgrounds (per-level field art)
  ui/                # Panel (side panel), Screens (overlays), StageScaler (fit transform)
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
- **Capsules are a registry**: `src/core/config/powerUps.ts` holds one row per power-up — id, glyph, name, body color, letter tone, duration, rarity tier, timed-ness — and everything else derives from it: the `PowerUpKind` union, the name/glyph/duration/weight lookups, `MALUS_KINDS`, `DROP_COLORS` and `DARK_LETTER_DROP_KINDS` in the palette, the timers' countdown list, and the console's roster. **Rarity is a tier, not a number per row**: four weights (`common` 1, `uncommon` 0.6, `trap` 0.7, `rare` 0.35) shared by the whole roster, because weights authored one capsule at a time flatten out — 9 of the first 15 sat at exactly 1. The `trap` tier doubles as the malus flag, driving the blinking letter, the pink catch pop and the womp. **Adding a capsule is adding one row**, and forgetting to is a type error rather than a silent gap. The **glyph is separate from the id** because the roster outgrew the alphabet: a two-character id like `MT` draws its glyph one font size down so it still fits the pill. In dev, a pass after `document.fonts.ready` measures every glyph against the pill and checks every letter clears 3:1 on its body.
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
- Each deploy creates a versioned `front-releases/release-<timestamp>-<branch>-<hash>` with `release.json` metadata; previous live version is kept as `front.bak` and restored automatically if the healthcheck fails.
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
