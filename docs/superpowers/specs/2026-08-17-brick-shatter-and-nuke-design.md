# Brick shatter effects + NUKE capsule — design

**Date**: 2026-08-17
**Tickets**: SHA-24 (brick death animation, built first — delivers the shared particle system), then SHA-23 (NUKE capsule), in the Spira `Shatter` project.

## Goal

Two visual features sharing one particle system:

1. **SHA-24** — a brick currently vanishes on the frame it dies, which reads as a glitch. Give every ordinary kill (ball, laser, BLAST neighbour) a short flash-and-shatter.
2. **SHA-23** — a new falling capsule that destroys every brick on the field at once, behind a shockwave explosion that is deliberately _not_ the same effect as an ordinary hit: bigger chunks, faster throw, longer life, staged by an expanding ring.

The two effects must stay visually distinct. An ordinary hit is a quiet pop; the NUKE is a set piece.

## Architecture

Effects live in the **simulation**, ticked at 60 Hz by `stepSimulation()`, and are drawn by `CanvasRenderer` from the existing `RenderView`. Two new modules under `src/entities/effects/`:

- **`ParticleField`** — a fixed 512-slot ring buffer of debris particles. `emit()` fills the next slot, recycling the oldest when the pool is full; `step()` advances every live particle; `reset()` clears the field. No per-frame allocation, no unbounded growth.
- **`Detonation`** — the NUKE state: origin point, current radius, tick counter, and the post-sweep hold before the level-clear screen. Inert (`active === false`) outside a NUKE.

`ShatterGame` owns both, emits into them from `damageBrick()`, and exposes them through `RenderView`. `BrickGrid` is untouched by effects concerns — it stays a pure grid of live cells and knows nothing about how a death is drawn (SHA-23 adds one grid primitive, `destroy()`, which removes a cell outright).

**Rejected — renderer-owned particles**: the renderer would have to diff the grid between frames to notice a brick disappeared. Fragile, and effects would drift with framerate instead of running on the fixed timestep.

**Rejected — extending the existing `SplashFlash` array**: least new code, but it conflates BLAST's neighbour flash with debris and leaves no place for the NUKE's staged sweep.

## SHA-24 — ordinary brick death

Emitted from `damageBrick()` on the branch where a brick is actually removed. Bricks that are damaged but still alive (silver on its first hit, gold on its first two) are untouched — they keep the existing `hurt` shading.

| Property     | Value                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Flash        | brick footprint (28×10), white, 2 ticks — a _death_ flash, separate from BLAST's existing orange neighbour flash |
| Chunks       | 6                                                                                                                |
| Chunk size   | 2×2 px                                                                                                           |
| Chunk colors | sampled from that brick's own `{flat, light, dark}` palette entry                                                |
| Speed        | 0.6–1.6 px/tick, thrown outward from the brick centre                                                            |
| Gravity      | 0.12 px/tick²                                                                                                    |
| Life         | 15 ticks (~0.25 s), no fade ramp — particles simply expire                                                       |

Sound is unchanged: the existing per-brick `beep(560 + (5 - hit.row) × 45, …)` still fires.

**Last brick of a level**: setting the countdown is idempotent, which fixes a pre-existing double-score: a BLAST splash kill emptying the grid made the recursive `damageBrick` call `onLevelCleared()` twice (double clear bonus, double jingle). The clear transition is deferred by a **20-tick freeze** (balls, capsules, shots and power-up timers suspended; effects still ticking) so the final shatter plays before the CLEARED screen — otherwise the last brick of every level would be the only one that never shatters. The freeze also covers its own trigger tick: a ball draining in the same tick as the final kill costs no life, and no capsule is caught behind a pending clear. (This closes a pre-existing race where a same-tick ball drain could stomp the clear screen with the serve screen.)

## SHA-23 — NUKE capsule

### Capsule

| Property     | Value                                                                               |
| ------------ | ----------------------------------------------------------------------------------- |
| Letter       | `N`                                                                                 |
| Body color   | `#b6ff00` (acid green — distinct from MULTI's `#3fbf4f`)                            |
| Letter color | dark (added to `DARK_LETTER_DROP_KINDS`)                                            |
| Panel label  | `NUKE`                                                                              |
| Drop weight  | `0.3` against `1` for the others → ~3.5 % of capsules, roughly one every 3–4 levels |
| Duration     | none — instantaneous, like WALL. Not a member of `TIMED_KINDS`                      |

### Detonation

On catch, a shockwave ring expands from the capsule's catch point (paddle centre, capsule Y) at **14 px/tick**, with a **3-tick full-field white flash** at t=0. Every live brick whose centre falls inside the current radius is destroyed that tick, so bricks die in rings rather than all at once. From the paddle line, the ring reaches the farthest brick in ~30 ticks (~0.5 s); the sweep is capped at 48 ticks as a safety bound (on reaching the cap, everything left is destroyed regardless of radius). On the tick the last brick dies, a **30-tick hold** starts, letting the debris fall before the level-clear screen appears. The detonation stays `active` through the hold: the ring lingers at its final radius and the panel keeps reporting the NUKE until the clear screen.

Per-brick explosion, deliberately heavier than SHA-24:

| Property   | Value           |
| ---------- | --------------- |
| Chunks     | 10              |
| Chunk size | 2–3 px          |
| Speed      | 1.4–3.0 px/tick |
| Life       | 30–45 ticks     |

### Rules

- **Scoring**: full brick points, doubled by PAYDAY. Not inflationary — those points would be earned anyway by clearing the level by hand.
- **No capsules** from nuke kills, and **no BLAST chaining**, matching the existing rule for splash kills. Nuke kills bypass `damageBrick()` entirely: a dedicated sweep path removes each cell outright (`BrickGrid.destroy()`), scores it, and emits the heavy burst — both suppressions and the die-outright rule fall out of the bypass.
- **No per-brick beep** — 70 beeps inside one tick is noise. One explosion sound plays at detonation instead: `SoundBank.nukeDetonation()`, shipped by the SHA-26 audio overhaul for exactly this call (legacy `arp` fallback only if SHA-26 has not landed).
- Silver and gold bricks die outright regardless of remaining hit points.

### Freeze

While a detonation is sweeping or holding, `stepSimulation()` advances **only** the effects. Balls, capsules, laser shots and power-up timers are all suspended. This is what resolves the three failure modes:

- `grid.remaining` reaches 0 partway through the sweep, and the normal `onLevelCleared()` call would cut to the clear screen mid-animation. The clear transition is deferred to the end of the hold instead.
- A ball falling out of play during the sweep would call `die()` and cost a life on a level the player just cleared. Frozen balls cannot.
- Capsules still falling during the sweep would be caught behind the explosion, applying a power-up to a level that is already over.

`powerLabel()` reports `NUKE` for the duration of the detonation, hold included.

## Edge cases

- `resetServe()` (ball loss, level change, new run) and `gameOver()` (Esc can end a run mid-effect) flush the particle field, the flashes, any pending detonation, and any pending clear countdown — no debris or ring left frozen on the canvas behind an overlay, no half-finished sweep left armed. `gameOver()` also empties the capsule pool: it can fire mid-tick from a last-life ball drain, and the tick's tail must not catch a capsule on the over screen. `onLevelCleared()` flushes debris and flashes too — nuke chunks (30–45 ticks) can outlive the 30-tick hold, and must not freeze mid-air behind the CLEARED overlay.
- Catching a second capsule during a detonation is impossible across ticks (capsule movement and catching are frozen) and ignored within the catch tick itself (two capsules can reach the paddle on the same tick; nothing applies once the detonation has started).
- The auto-pause on lost mouse input (SHA-25) pauses the whole simulation, detonation included; the sweep resumes where it stopped on unpause.
- The worst case is FINALE (72 bricks × 10 chunks = 720 emissions) staged across ~30 ticks against a 512-slot pool. Early debris is recycled while late debris is still flying, which is the intended behaviour — the pool caps cost rather than dropping the effect.

## Configuration

All timings, counts, speeds and lifetimes land in a new `gameConfig.effects` block so they can be tuned during QA without touching logic.

## Files touched

```text
src/interfaces/types.ts              # "N" in PowerUpKind; BrickFlash (kinded) + BurstSpec
src/entities/effects/ParticleField.ts  # new — ring-buffer pool
src/entities/effects/Detonation.ts     # new — ring sweep + hold state
src/entities/bricks/BrickGrid.ts     # destroy(): remove a cell outright (NUKE kills)
src/core/config/GameConfig.ts        # effects block; N weight, name, no duration
src/entities/powerups/PowerUpTimers.ts # N in the ticksLeft record (never timed)
src/render/palette.ts                # N drop color, death-flash + nuke flash/ring colors
src/render/CanvasRenderer.ts         # draw particles, shockwave ring, field flash
src/core/ShatterGame.ts              # emit on death, apply NUKE, freeze, deferred clear
README.md                            # power-up list, ?power letters, project structure
```

## Verification

The repo has no test runner, so verification follows existing project practice:

- `pnpm typecheck`, `pnpm lint`, `pnpm run fmt:check` green.
- Live QA with the dev-only URL params: `?droprate=1` (constant brick deaths), `?power=N` (NUKE at every launch), `?level=15` (FINALE's full 72-brick grid as the worst case).
- Checked by eye: an ordinary hit and a NUKE brick must not look like the same effect.
