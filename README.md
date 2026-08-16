# SHATTER

Amiga-style brick breaker for one player. Originally written in 2007, rebuilt in 2026 from the playable Claude Design mockup ([SHATTER.dc.html](https://claude.ai/design/p/ef3c88b2-5b26-4718-81f4-0d354e0592bc?file=SHATTER.dc.html)) — REV 2.0.

The game runs on a fixed **480×300 stage** scaled to fit the viewport: a **372×300 canvas playfield** (pixel-art rendering) next to a **108px Workbench-style side panel** (DOM). Vite + strict TypeScript + native CSS with Lightning CSS.

## Gameplay

- **Screens**: title (animated copper bars) → serve → play, with pause, level-clear, game-over, and a hall of fame with 3-letter initials entry.
- **5 levels**: SUNRISE, PYRAMID, GATEWAY, VORTEX, FINALE — looping with increasing ball speed. Silver bricks take 2 hits, gold bricks 3.
- **Power-ups** dropped by destroyed bricks (13% chance): **WIDE** paddle, **MULTI** ball (up to 3 balls), **LASER** (paddle cannons), **PIERCE** (ball goes through bricks).
- **Scoring**: 60–200 points per brick by kind, level-clear bonus `(level+1) × 500`. Top-5 hi-scores persist in `localStorage` (`shatter.hiscores.v1`).
- **Audio**: WebAudio oscillator chiptune SFX (square/sawtooth beeps and arpeggios), no assets.

### Controls

- **Mouse** moves the paddle; **click** launches / advances screens.
- Clicking also engages **Pointer Lock** (relative `movementX` control); without lock, absolute pointer position is used. Press `Esc` once to exit lock.
- **P** pause · **M** sound on/off · **ESC** quit run (from lock, press `Esc` twice: first exits lock, second quits).

## Tutorial

```bash
pnpm install
pnpm dev
```

Open the URL shown by Vite.

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
    levels/          # ASCII level definitions (5 layouts)
    physics/         # Paddle bounce math
  entities/
    ball/            # Ball position/velocity, launch, multi-ball cloning
    paddle/          # Paddle position/width with field clamping
    bricks/          # BrickGrid: cell parsing, HP, grid collision queries
    powerups/        # PowerUpTimers (E/M/L/P) + DropPool (falling capsules)
    laser/           # ShotPool (paddle cannon shots)
  render/            # CanvasRenderer (pixel sprites) + palette (canvas hex colors)
  ui/                # Panel (side panel), Screens (overlays), StageScaler (fit transform)
  input/             # InputController: mouse + keyboard + hybrid pointer lock
  audio/             # Sound: WebAudio beeps/arpeggios, mute
  state/             # HiScores: localStorage persistence
  interfaces/        # Shared TS types
  shared/            # DOM + formatting utilities
  main.ts            # Bootstrap / dependency wiring

css/
  main.css           # Entrypoint (@import)
  base.css           # Reset, cursor hiding, [hidden] handling
  layout.css         # Stage, playfield canvas, panel placement
  components.css     # Panel widgets, overlay screens, blink/copper keyframes
  tokens/            # colors (SHATTER palette), sizes, typography, motion

scripts/
  deploy.sh          # Deploy + rollback (auto/manual)
```

### Engine details

- **Fixed timestep**: 60 Hz accumulator (frame delta clamped to 50 ms, max 4 catch-up steps per frame); rendering every animation frame.
- **Sub-stepped ball movement**: each tick is split into `ceil(max(|vx|,|vy|)/2)` micro-steps, X then Y, with a brick-grid collision query per axis — fast balls can't tunnel through bricks.
- **Brick collision**: O(1) grid lookup (`cellAt`) + 4-corner overlap test for the 8px ball, instead of scanning all bricks.
- **Paddle bounce**: `relativeHit ∈ [-1, 1]` → angle `relativeHit × 1.05 rad`; speed is preserved, so center hits go up and edge hits go wide.
- **Ball speed**: `min(4.6, 3.1 + level × 0.25)` px/tick, times the `ballSpeedMultiplier` config.
- **Canvas palette** lives in `src/render/palette.ts` (canvas cannot read CSS custom properties); the same colors are exposed to the DOM as CSS tokens in `css/tokens/colors.css`.
- **Panel updates are diffed**: DOM text is only written when a value changes, never per frame.
- **Stage scaling**: `transform: scale(min(0.99·vw/480, 0.99·vh/300))`, with the stage rect cached and invalidated on resize/scroll; pointer coordinates are mapped through the scale.

### Deployment

- Target host default: `debian@ks-b`, path `/var/www/1991computer/shatter` (URL `https://shatter.1991computer.com/`).
- Nginx vhost: `/etc/nginx/conf.d/shatter.conf` on ks-b, with its own Let's Encrypt certificate (webroot renewal, like the other subdomains). The legacy `https://1991computer.com/arkanoid-2007/` path is dropped and returns 404.
- Each deploy creates a versioned `releases/release-<timestamp>-<branch>-<hash>` with `release.json` metadata; previous live version is kept as `.bak` and restored automatically if the healthcheck fails.
- Healthcheck marker in the deployed HTML: `SHATTER`.
- Overridable via env vars (`REMOTE_USER_HOST`, `WEB_ROOT_BASE`, `HEALTHCHECK_URL`, `EXPECTED_HTML_MARKER`, `MAX_RELEASES_TO_KEEP`, `BUILD_BASE_PATH`).

### Tooling policy

- Formatter: `oxfmt` (`printWidth: 120`) is the single formatting source of truth.
- Linter: `oxlint` enforces `correctness` and `suspicious`; `style` is disabled to avoid formatter conflicts.
- CSS: Lightning CSS transformer with native nesting (`Features.Nesting`); design tokens in `css/tokens/*`.
- Strict TypeScript (`ES2023` lib for `Array#toSorted`), path aliases in both `tsconfig.json` and `vite.config.ts`: `@`, `@audio`, `@core`, `@entities`, `@input`, `@interfaces`, `@render`, `@shared`, `@state`, `@ui`.

## Explanation

The 2007 original (and its first modernization) rendered the ball, paddle, and bricks as DOM elements. REV 2.0 moves gameplay rendering to a single pixel-art canvas — DOM stays where it is better (crisp text in the side panel and overlay screens) and the canvas handles everything that moves at 60 Hz. The Claude Design mockup is the spec of record: its embedded script defines the exact geometry, physics constants, palette, and screen flow that this codebase re-implements as typed, testable modules.
