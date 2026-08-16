# SHATTER

Amiga-style brick breaker for one player. Originally written in 2007, rebuilt in 2026 from the playable Claude Design mockup ([SHATTER.dc.html](https://claude.ai/design/p/ef3c88b2-5b26-4718-81f4-0d354e0592bc?file=SHATTER.dc.html)) — REV 2.0.

The game runs on a fixed **480×300 stage** scaled to fit the viewport: a **372×300 canvas playfield** (pixel-art rendering) next to a **108px Workbench-style side panel** (DOM). Vite + strict TypeScript + native CSS with Lightning CSS.

## Gameplay

- **Screens**: title (animated copper bars) → serve → play, with pause, level-clear, game-over, and a hall of fame with 3-letter initials entry.
- **15 levels**: SUNRISE, PYRAMID, GATEWAY, VORTEX, CHECKER, RAMPART, HELIX, ORBIT, HIVE, SERPENT, MIRROR, BUNKER, CASCADE, OMEGA, FINALE — looping with increasing ball speed. Silver bricks take 2 hits, gold bricks 3.
- **Power-ups** dropped by destroyed bricks (13% chance): **WIDE** paddle, **MULTI** ball (stacks: 3 → 6 → 9 balls), **LASER** (paddle cannons), **PIERCE** (ball goes through bricks), **BLAST** (destroyed bricks damage their 8 neighbors), **WALL** (one-shot safety barrier at the bottom), **TEMPO** (bullet-time, balls at ×0.6), **PAYDAY** (points ×2), **NUKE** (rare: a shockwave destroys every brick on the field, full points), **SWARM** (rare: 12 balls at once) — plus **JAMMER**, the only trap capsule (blinking letter, rarer): it shrinks the paddle for 6 s, so dodge it.
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
```

Auto-fix formatting and lint issues:

```bash
pnpm run fmt
pnpm run lint:fix
```

Test gameplay quickly with the dev-only URL params (inert in production builds):

- `?level=N` — start at level N (1-based)
- `?droprate=0..1` — override the 13% capsule drop rate (`1` = every brick drops)
- `?power=BWX` — grant power-ups at every launch (capsule letters E/M/L/P/B/W/T/X/J/N/S; repeat a letter to stack, e.g. `MMM`)

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
    config/          # GameConfig: geometry, speeds, timers, points (single source of truth)
    levels/          # ASCII level definitions (15 layouts)
    physics/         # Paddle bounce math
  entities/
    ball/            # Ball position/velocity, launch, multi-ball cloning
    paddle/          # Paddle position/width with field clamping
    bricks/          # BrickGrid: cell parsing, HP, grid collision queries
    powerups/        # PowerUpTimers (timed effects) + DropPool (weighted falling capsules)
    effects/         # ParticleField (debris ring buffer) + Detonation (NUKE shockwave)
    laser/           # ShotPool (paddle cannon shots)
  render/            # CanvasRenderer (pixel sprites) + palette (canvas hex colors)
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
```

### Engine details

- **Fixed timestep**: 60 Hz accumulator (frame delta clamped to 50 ms, max 4 catch-up steps per frame); rendering every animation frame.
- **Sub-stepped ball movement**: each tick is split into `ceil(max(|vx|,|vy|)/2)` micro-steps, X then Y, with a brick-grid collision query per axis — fast balls can't tunnel through bricks.
- **Brick death effects**: destroyed bricks flash white and burst into debris from a 512-slot particle ring buffer; the NUKE sweep and the level-clear delay freeze the simulation (only effects tick), so the clear screen never cuts an animation short and no ball can be lost behind an explosion.
- **Brick collision**: O(1) grid lookup (`cellAt`) + 4-corner overlap test for the 8px ball, instead of scanning all bricks.
- **Paddle bounce**: `relativeHit ∈ [-1, 1]` → angle `relativeHit × 1.05 rad`; speed is preserved, so center hits go up and edge hits go wide.
- **Ball speed**: `min(4.6, 3.1 + level × 0.25)` px/tick, times the `ballSpeedMultiplier` config.
- **Canvas palette** lives in `src/render/palette.ts` (canvas cannot read CSS custom properties); the same colors are exposed to the DOM as CSS tokens in `css/tokens/colors.css`.
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

- Target host default: `debian@ks-b`, path `/var/www/1991computer/shatter` (URL `https://shatter.1991computer.com/`).
- Nginx vhost: `/etc/nginx/conf.d/shatter.conf` on ks-b, with its own Let's Encrypt certificate (webroot renewal, like the other subdomains). The legacy `https://1991computer.com/arkanoid-2007/` path is dropped and returns 404.
- Each deploy creates a versioned `releases/release-<timestamp>-<branch>-<hash>` with `release.json` metadata; previous live version is kept as `.bak` and restored automatically if the healthcheck fails.
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
