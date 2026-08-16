# SHATTER 2.0 rebuild — design

**Date**: 2026-08-16
**Spec of record**: Claude Design playable mockup [SHATTER.dc.html](https://claude.ai/design/p/ef3c88b2-5b26-4718-81f4-0d354e0592bc?file=SHATTER.dc.html) (its embedded script is the reference implementation; `support.js` is only the mockup runtime and is not ported).
**Tickets**: Spira epic [SHA-1](https://spira.1991computer.com/project/shatter-b5a30f69/overview), children SHA-2 … SHA-12.

## Goal

Rebuild the existing DOM-rendered breakout game as the Amiga-style SHATTER REV 2.0 defined by the mockup, keeping the repo's stack (Vite, strict TS, native CSS + Lightning CSS, oxlint/oxfmt) and OOP architecture.

## Architecture

Fixed 480×300 stage scaled to the viewport (`transform: scale`), split into:

- **Canvas playfield** (372×300, `image-rendering: pixelated`) — everything that moves: stars, bricks, paddle, balls, capsules, laser shots, wall bevels. Drawn every frame by `CanvasRenderer` from a `RenderView`.
- **DOM side panel** (108×300) — score/hi-score/level/lives/power/shortcuts, diff-updated by `Panel`.
- **DOM overlays** — title, serve hint, pause, grid-cleared, game-over, hall-of-fame; toggled by `Screens` via the `hidden` attribute.

`ShatterGame` owns the state machine (`title | serve | play | pause | clear | over | scores | entry`), the 60 Hz fixed-timestep loop (accumulator, 50 ms delta clamp, ≤4 catch-up steps), and all game rules, mirroring the mockup's logic 1:1. Entities (`Ball`, `Paddle`, `BrickGrid`, `PowerUpTimers`, `DropPool`, `ShotPool`) hold state and local behavior; cross-cutting systems (`Sound`, `HiScores`, `StageScaler`, `InputController`) are injected via `main.ts`.

## Key rules (from the mockup)

- Grid: origin (6,38), 12 columns of 30×12 cells; kinds `1-5` (60–100 pts, 1 HP), `S` (150 pts, 2 HP), `G` (200 pts, 3 HP); damaged bricks render "hurt" (inverted tint). 5 levels looping: SUNRISE, PYRAMID, GATEWAY, VORTEX, FINALE.
- Ball: 8px sprite; speed `min(4.6, 3.1 + 0.25·level) × multiplier`; sub-stepped movement (X then Y, brick query per axis); paddle bounce angle `rel × 1.05 rad`; field bounds x∈[3,369], top 3, death below y=300.
- Power-ups: 13% drop; WIDE (72px, 720 ticks), LASER (720 ticks, 2 shots/26 ticks, 5.5 px/tick), PIERCE (480 ticks), MULTI (+2 balls at ±0.6 rad). All reset on ball loss/level change.
- Scoring: brick points + clear bonus `(level+1)×500`; top-5 hi-scores in `localStorage['shatter.hiscores.v1']` (stored as `{n,s}` for mockup compatibility), initials entry (3 chars) when qualifying.
- Audio: lazy WebAudio oscillator beeps/arps per event; M mutes.
- Input: absolute mouse mapped through stage scale; hybrid Pointer Lock preserved from the previous version (relative `movementX / scale` when locked). P pause, M sound, ESC quit.

## Deviations from the mockup (intentional)

- Entry commit race fixed: the 260 ms auto-commit after the 3rd initial is cancelled by Backspace/Enter and guarded by screen state (mockup could double-commit).
- Pointer Lock hybrid control kept (previous repo feature; mockup uses absolute mouse only). ESC therefore needs two presses to quit while locked (browser reserves the first).
- Colors used by DOM live as CSS tokens; the canvas palette is a TS module (canvas can't read custom properties).

## Verification

Headless Chrome (CDP) run: title → serve → launch → play (score, paddle steering) → pause/resume → mute → ESC → game over → hall of fame, zero JS exceptions, no 404s; `pnpm typecheck` / `lint` / `fmt:check` / `build` all green.
