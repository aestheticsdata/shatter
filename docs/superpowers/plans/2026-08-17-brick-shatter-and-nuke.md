# Brick Shatter Effects + NUKE Capsule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every brick death a flash-and-shatter debris animation (SHA-24), then add the rare NUKE capsule that clears the field behind a staged shockwave explosion (SHA-23).

**Architecture:** Effects live in the simulation, ticked at 60 Hz by `stepSimulation()` and drawn from `RenderView`: a `ParticleField` ring buffer for debris and a `Detonation` state object for the NUKE sweep and its post-sweep hold. A `clearCountdown` freeze defers the level-clear screen on ordinary clears so the final shatter can play.

**Tech Stack:** Vite + strict TypeScript, 2D canvas, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-brick-shatter-and-nuke-design.md`

**Design notes already recorded in the spec:**
1. Nuke kills bypass `damageBrick()` through a dedicated `nukeBricksWithin()` path — same externally visible rules (full points, no capsules, no BLAST chain, no per-brick beep, silver/gold die outright), less branching.
2. Ordinary level clears gain a **20-tick freeze** (`clearDelayTicks`) before the CLEARED screen so the final brick's shatter can play. The freeze guards its own trigger tick (Task 3 Step 4).
3. The detonation stays `active` through its 30-tick hold: the panel keeps showing `NUKE` and the ring lingers at its final radius until the clear screen.

**Baseline:** code quotes and line anchors verified against commit `53d139c` (SHA-25, auto-pause on lost input — committed, pushed, deployed). The auto-pause needs no special handling: pausing stops `stepSimulation()` entirely, so a detonation or clear countdown simply resumes on unpause.

**Concurrent work warning:** the SHA-26 audio overhaul is **uncommitted in this same working tree** and in user QA. It replaces `ShatterGameDeps.sound: Sound` with `sfx: SoundBank` (`src/audio/SoundBank.ts`) and rewrites every sound call site in `ShatterGame.ts` (`deps.sound.beep(...)` → `deps.sfx.laserFire()` etc.); `DropPool.trySpawn` now returns a boolean. This plan assumes SHA-26 lands **before** these tickets execute — its `SoundBank` ships `nukeDetonation()` explicitly for SHA-23, and Task 7 calls it. If SHA-26 is instead rejected or still pending at execution time, use the legacy fallback noted in Task 7 Step 1 and do not block on it. Never touch `src/audio/*`; stage commits per ticket, never `git add -A` (the tree carries multiple tickets' work). Also pending in the tree: a one-line `.oxfmtrc.json` change (`ignorePatterns: ["docs/superpowers/**"]`, from the SHA-25 session) that keeps these docs out of `fmt:check` — leave it in place; the user decides which commit carries it.

## Global Constraints

- **No test runner exists in this repo and none is added.** Per the approved spec, verification is `pnpm typecheck`, `pnpm lint`, `pnpm run fmt:check`, plus live QA in the dev server (`pnpm dev`, open the URL Vite prints). Dev-only URL params: `?droprate=1`, `?power=N`, `?level=15`.
- **NEVER `git commit` or `git push`.** The user QA-gates every ticket and authorizes each commit personally. Each ticket ends with: leave the work in the tree, set the Spira ticket to In Review, present, STOP and wait.
- **Sequential tickets:** exactly one Spira ticket In Progress at a time. SHA-24 first (Tasks 1–4), SHA-23 (Tasks 5–8) only after the user accepts SHA-24 and its commit is made.
- **Every task must leave the tree compiling** (`pnpm typecheck` green) — tasks are ordered so renames and additions never straddle a broken state.
- Formatting: `oxfmt`, printWidth 120, two-space indent, double quotes, semicolons. Run `pnpm run fmt` after each task's edits.
- Exact values from the spec, verbatim: 6 chunks 2×2 px at 0.6–1.6 px/tick living 15 ticks for a brick death; 10 chunks 2–3 px at 1.4–3.0 px/tick living 30–45 ticks for a nuke kill; gravity 0.12; death flash 2 ticks; ring 14 px/tick capped at 48 ticks; field flash 3 ticks; hold 30 ticks; ordinary clear delay 20 ticks; capsule `N` `#b6ff00` dark letter, label `NUKE`, weight `0.3`.
- Path aliases (`@core`, `@entities`, `@interfaces`, `@render`) are configured in both `tsconfig.json` and `vite.config.ts`; `src/entities/effects/` needs no new alias — it lives under the existing `@entities`.
- Line numbers below are anchors into commit `53d139c`, given as a convenience; the **method-name anchors are authoritative** if the file has drifted.

---

### Task 1: SHA-24 kickoff — `BurstSpec` type, `effects` config block, `ParticleField`

Pure additions; nothing visible yet.

**Files:**
- Modify: `src/interfaces/types.ts` (append after `SplashFlash`, line 36)
- Modify: `src/core/config/GameConfig.ts` (imports, line 1; new block after `scoring`, line 74-77)
- Create: `src/entities/effects/ParticleField.ts`

**Interfaces:**
- Consumes: `BrickKind` from `@interfaces/types`, `gameConfig` from `@core/config/GameConfig`.
- Produces (later tasks rely on these exact names):
  - `interface BurstSpec { chunkCount: number; minChunkSize: number; maxChunkSize: number; minSpeed: number; maxSpeed: number; minLifeTicks: number; maxLifeTicks: number }` in `@interfaces/types`
  - `gameConfig.effects.{particlePoolSize, particleGravity, deathFlashTicks, clearDelayTicks, brickDeathBurst}`
  - `interface Particle { x; y; vx; vy; size; brickKind: BrickKind; ticksLeft }` and `class ParticleField { readonly particles: Particle[]; burst(centerX, centerY, brickKind, spec): void; step(): void; reset(): void }` in `@entities/effects/ParticleField`

- [ ] **Step 1: Set the Spira board**

Set SHA-24 to In Progress (state name `In Progress`). SHA-23 stays Todo.

- [ ] **Step 2: Add `BurstSpec` to `src/interfaces/types.ts`**

Append directly after the `SplashFlash` interface (do not touch `SplashFlash` yet — it is renamed in Task 2):

```ts
export interface BurstSpec {
  chunkCount: number;
  minChunkSize: number;
  maxChunkSize: number;
  minSpeed: number;
  maxSpeed: number;
  minLifeTicks: number;
  maxLifeTicks: number;
}
```

- [ ] **Step 3: Add the `effects` block to `src/core/config/GameConfig.ts`**

Change the import at line 1 to include `BurstSpec`:

```ts
import type { BrickKind, BurstSpec, PowerUpKind } from "@interfaces/types";
```

Insert after the `scoring` block, inside the `gameConfig` object:

```ts
  effects: {
    particlePoolSize: 512,
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
  },
```

- [ ] **Step 4: Create `src/entities/effects/ParticleField.ts`**

```ts
import { gameConfig } from "@core/config/GameConfig";

import type { BrickKind, BurstSpec } from "@interfaces/types";

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  brickKind: BrickKind;
  ticksLeft: number;
}

// Fixed-size ring buffer of debris chunks. A full pool recycles its oldest
// slots, so emission cost stays bounded and no allocation happens per frame.
export class ParticleField {
  readonly particles: Particle[] = Array.from({ length: gameConfig.effects.particlePoolSize }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 2,
    brickKind: "1" as BrickKind,
    ticksLeft: 0,
  }));
  private cursor = 0;

  burst(centerX: number, centerY: number, brickKind: BrickKind, spec: BurstSpec): void {
    for (let i = 0; i < spec.chunkCount; i++) {
      const particle = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;

      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(spec.minSpeed, spec.maxSpeed);
      particle.x = centerX;
      particle.y = centerY;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
      particle.size = Math.round(randomBetween(spec.minChunkSize, spec.maxChunkSize));
      particle.brickKind = brickKind;
      particle.ticksLeft = Math.round(randomBetween(spec.minLifeTicks, spec.maxLifeTicks));
    }
  }

  step(): void {
    for (const particle of this.particles) {
      if (particle.ticksLeft <= 0) {
        continue;
      }
      particle.ticksLeft--;
      particle.vy += gameConfig.effects.particleGravity;
      particle.x += particle.vx;
      particle.y += particle.vy;
    }
  }

  reset(): void {
    for (const particle of this.particles) {
      particle.ticksLeft = 0;
    }
  }
}
```

- [ ] **Step 5: Verify**

Run: `pnpm run fmt && pnpm typecheck && pnpm lint`
Expected: fmt rewrites at most the touched files; typecheck exits 0 silently; lint reports 0 errors.

### Task 2: Flash rename — `SplashFlash` → `BrickFlash` with a `kind`

One coherent rename across the three files that own flashes, so BLAST's orange flash and the new white death flash share one array and one render loop. Behavior is unchanged after this task: only "blast" flashes are ever emitted so far.

**Files:**
- Modify: `src/interfaces/types.ts` (the `SplashFlash` interface, line 32-36)
- Modify: `src/render/palette.ts` (canvasPalette)
- Modify: `src/render/CanvasRenderer.ts` (import line 7, `RenderView.flashes` line 34, flash loop line 84-86)
- Modify: `src/core/ShatterGame.ts` (import line 14, field line 78, tick filter line 173, renderer-view `flashes:` line 157, `blastNeighbors` push line 316-320, `resetServe` line 462)

**Interfaces:**
- Consumes: `canvasPalette.blastFlash` (exists).
- Produces: `type BrickFlashKind = "death" | "blast"`; `interface BrickFlash { x; y; ticksLeft; kind: BrickFlashKind }`; `canvasPalette.deathFlash`. Task 3 pushes `kind: "death"` flashes.

- [ ] **Step 1: Replace the interface in `src/interfaces/types.ts`**

Replace the whole `SplashFlash` interface with:

```ts
export type BrickFlashKind = "death" | "blast";

export interface BrickFlash {
  x: number;
  y: number;
  ticksLeft: number;
  kind: BrickFlashKind;
}
```

- [ ] **Step 2: Add the death-flash color to `src/render/palette.ts`**

In `canvasPalette`, after `blastFlash: "#ffc27a",` add:

```ts
  deathFlash: "#ffffff",
```

- [ ] **Step 3: Update `src/render/CanvasRenderer.ts`**

Import type `BrickCell, BrickFlash, BrickFlashKind` instead of `BrickCell, SplashFlash` (line 7). Change `RenderView`:

```ts
  flashes: readonly BrickFlash[];
```

Add near the top of the file (after `STAR_COUNT`):

```ts
const FLASH_COLORS: Record<BrickFlashKind, string> = {
  death: canvasPalette.deathFlash,
  blast: canvasPalette.blastFlash,
};
```

Change the flash loop to:

```ts
    for (const flash of view.flashes) {
      this.pixel(flash.x + 1, flash.y + 1, 28, 10, FLASH_COLORS[flash.kind]);
    }
```

- [ ] **Step 4: Update `src/core/ShatterGame.ts`**

- Import type `BrickFlash` instead of `SplashFlash` (line 14).
- Field (line 78): `private brickFlashes: BrickFlash[] = [];`
- Tick filter (line 173, in `stepSimulation`): `this.brickFlashes = this.brickFlashes.filter((flash) => --flash.ticksLeft > 0);`
- Renderer view (line 157, in `frame`): `flashes: this.brickFlashes,`
- `blastNeighbors` push (line 316-320) gains the kind:

```ts
        this.brickFlashes.push({
          x: left + neighbor.column * brickWidth,
          y: top + neighbor.row * brickHeight,
          ticksLeft: gameConfig.powerUps.splashFlashTicks,
          kind: "blast",
        });
```

- In `resetServe` (line 462): `this.splashFlashes = [];` becomes `this.brickFlashes = [];`

- [ ] **Step 5: Verify**

Run: `pnpm run fmt && pnpm typecheck && pnpm lint`
Expected: all green. `rg -in "splashflash" src` finds exactly one surviving name: the `splashFlashTicks` config key (in `GameConfig.ts` and its use in `blastNeighbors`) — it keeps its name, meaning "BLAST neighbour flash ticks". Nothing else matches.

### Task 3: Emit bursts, draw particles, clear-delay freeze

The visible SHA-24 feature: every destroyed brick flashes white and shatters into its own colors; the last brick of a level gets 20 frozen ticks to shatter before the CLEARED screen.

**Files:**
- Modify: `src/core/ShatterGame.ts` (fields near line 84-91; `stepSimulation` line 163-200; `damageBrick` line 279-301; new `emitBurst` method after `blastNeighbors`; `gameOver` line 483; `resetServe` line 450)
- Modify: `src/render/CanvasRenderer.ts` (imports; `RenderView`; draw loop after the flash loop)

**Interfaces:**
- Consumes: `ParticleField`, `Particle` (Task 1), `BrickFlash` (Task 2), `gameConfig.effects.*` (Task 1), `BRICK_COLORS` (exists in `@render/palette`).
- Produces: `private emitBurst(hit: BrickHit, spec: BurstSpec): void` and `private clearCountdown: number` on `ShatterGame` — Task 7 reuses both. `RenderView.particles: readonly Particle[]`.

- [ ] **Step 1: Wire `ParticleField` into `ShatterGame`**

Add imports:

```ts
import { ParticleField } from "@entities/effects/ParticleField";
```

and add `BurstSpec` to the type import from `@interfaces/types`.

Add fields next to the other entity fields:

```ts
  private readonly particles = new ParticleField();
  private clearCountdown = 0;
```

- [ ] **Step 2: Step particles and freeze during a pending clear**

In `stepSimulation`, directly after the `brickFlashes` filter line, insert:

```ts
    this.particles.step();

    // A pending level clear freezes the rest of the simulation so the final
    // brick's shatter can play out — no ball can be lost, no capsule caught,
    // no timer expiring behind the effect.
    if (this.clearCountdown > 0) {
      if (--this.clearCountdown === 0) {
        this.onLevelCleared();
      }
      return;
    }
```

- [ ] **Step 3: Emit the burst from `damageBrick` and defer the clear**

Add the shared emitter method (after `blastNeighbors`):

```ts
  private emitBurst(hit: BrickHit, spec: BurstSpec): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    this.brickFlashes.push({
      x: left + hit.column * brickWidth,
      y: top + hit.row * brickHeight,
      ticksLeft: gameConfig.effects.deathFlashTicks,
      kind: "death",
    });
    this.particles.burst(
      left + hit.column * brickWidth + brickWidth / 2,
      top + hit.row * brickHeight + brickHeight / 2,
      hit.cell.kind,
      spec,
    );
  }
```

In `damageBrick`, after the score line (`this.score += hit.cell.points * this.scoreMultiplier();` — with SHA-26 landed, a `brickDestroyed` sound block follows it; insert after that), add:

```ts
    this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
```

and replace the clear call (298-300):

```ts
    if (this.grid.remaining <= 0) {
      this.onLevelCleared();
    }
```

with:

```ts
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
```

- [ ] **Step 4: Guard the freeze's trigger tick**

`damageBrick` can set `clearCountdown` **mid-tick** (a laser shot or ball kill), and the rest of that same tick must already honor the freeze: `shotPool.step` runs before the ball loop and `dropPool.step`, so without a guard a ball draining in the trigger tick calls `die()` → `resetServe()` → `clearCountdown = 0`, and the cleared level can never clear — a softlock. (This race partially predates this feature: the old immediate `onLevelCleared()` could also be stomped by a same-tick drain.)

In `stepSimulation`, replace the tail (lines 195-199):

```ts
    if (!this.balls.some((ball) => ball.active)) {
      this.die();
    }

    this.dropPool.step(this.paddle.bounds, (kind) => this.applyPowerUp(kind));
```

with:

```ts
    // Trigger-tick guard: a kill earlier in this same tick may have set
    // clearCountdown; the freeze must already apply — a drained ball must not
    // cost a life on a cleared level, and no capsule may be caught behind a
    // pending clear.
    if (this.clearCountdown === 0 && !this.balls.some((ball) => ball.active)) {
      this.die();
    }

    if (this.clearCountdown === 0) {
      this.dropPool.step(this.paddle.bounds, (kind) => this.applyPowerUp(kind));
    }
```

- [ ] **Step 5: Flush effects on serve reset and game over**

In `resetServe`, next to `this.brickFlashes = [];` add:

```ts
    this.particles.reset();
    this.clearCountdown = 0;
```

In `gameOver`, as the first lines (stale effects must not stay frozen on the canvas behind the GAME OVER overlay — Esc can end a run mid-shatter):

```ts
    this.brickFlashes = [];
    this.particles.reset();
    this.dropPool.reset();
    this.clearCountdown = 0;
```

The `dropPool.reset()` matters: when the last ball drains with one life left, `die()` → `gameOver()` runs **mid-tick**, and the tick's tail still executes `dropPool.step` (the `clearCountdown` guard is 0 here). Without the reset, a capsule overlapping the paddle on that exact tick is caught *on the over screen* — and in Task 7's world an `N` capsule would re-arm the detonation right after the flush, painting the nuke flash behind the GAME OVER overlay forever. An emptied pool makes that tail call a no-op, exactly why the `resetServe` path is already safe.

- [ ] **Step 6: Draw particles in `CanvasRenderer`**

Import the particle type:

```ts
import type { Particle } from "@entities/effects/ParticleField";
```

Add to `RenderView`:

```ts
  particles: readonly Particle[];
```

After the flash loop, before the energy-wall draw, add (slot index cycles the brick's three palette colors — sequential ring-buffer slots give each burst a flat/light/dark mix without storing a color per particle):

```ts
    view.particles.forEach((particle, index) => {
      if (particle.ticksLeft <= 0) {
        return;
      }
      const colors = BRICK_COLORS[particle.brickKind];
      const color = [colors.flat, colors.light, colors.dark][index % 3];
      this.pixel(particle.x, particle.y, particle.size, particle.size, color);
    });
```

In `ShatterGame.frame`, add to the `draw` view object:

```ts
      particles: this.particles.particles,
```

- [ ] **Step 7: Verify**

Run: `pnpm run fmt && pnpm typecheck && pnpm lint && pnpm run fmt:check`
Expected: all green.

### Task 4: SHA-24 QA gate — verify, present, STOP

- [ ] **Step 1: Full check suite**

Run: `pnpm typecheck && pnpm lint && pnpm run fmt:check && pnpm build`
Expected: all exit 0.

- [ ] **Step 2: Live QA**

Run `pnpm dev`, open the printed URL with `?droprate=1` and check each:

1. Every destroyed brick: white footprint flash (~2 ticks), then 6 small chunks in that brick's colors flying outward and falling, gone in ~0.25 s.
2. Silver brick, first hit: hurt shading only — no flash, no debris.
3. Grab a BLAST capsule (`B`): neighbour bricks flash orange as before; the destroyed ones also shatter white + debris.
4. Destroy the last brick: the game freezes ~0.33 s while the shatter plays, then GRID CLEARED appears with the usual bonus.
5. Lose the ball while debris is airborne: serve screen comes up with a clean field — no leftover debris.
6. Esc mid-play with debris airborne: GAME OVER screen, no frozen debris behind it.
7. Lose the **last life** with a capsule about to touch the paddle: GAME OVER appears and no capsule effect applies on the over screen.

- [ ] **Step 3: Present and wait**

Set SHA-24 to In Review. Report QA results to the user, list the changed files, and **STOP — the user QAs and authorizes the commit (stage only this ticket's files; the audio overhaul may have its own edits in the tree). Do not start Task 5 until SHA-24 is accepted.**

---

### Task 5: SHA-23 kickoff — the `N` power-up kind exists everywhere

Adding `"N"` to `PowerUpKind` makes the compiler enforce every site. After this task the capsule drops, renders acid-green with a dark letter, and does nothing when caught (no `applyPowerUp` branch yet).

**Files:**
- Modify: `src/interfaces/types.ts` (PowerUpKind, line 30)
- Modify: `src/core/config/GameConfig.ts` (durations + weights; `effects` block; `POWER_UP_NAMES`)
- Modify: `src/entities/powerups/PowerUpTimers.ts` (record literal, line 9)
- Modify: `src/render/palette.ts` (DROP_COLORS; DARK_LETTER_DROP_KINDS; canvasPalette)

**Interfaces:**
- Produces: `PowerUpKind` includes `"N"`; `gameConfig.effects.nukeBurst` (a `BurstSpec`) and `gameConfig.effects.nuke.{ringSpeed, maxSweepTicks, fieldFlashTicks, holdTicks}`; `POWER_UP_NAMES.N === "NUKE"`; `canvasPalette.nukeFlash`, `canvasPalette.nukeRing`.

- [ ] **Step 1: Set the Spira board**

SHA-24 should be Done (user accepted). Set SHA-23 to In Progress.

- [ ] **Step 2: Extend the type**

`src/interfaces/types.ts` line 30:

```ts
export type PowerUpKind = "E" | "M" | "L" | "P" | "B" | "W" | "T" | "X" | "J" | "N";
```

- [ ] **Step 3: Follow the compiler through config, timers, and palette**

Run `pnpm typecheck` — expected: errors in **three** files, each missing property `N`: `GameConfig.ts` (the two `satisfies Record<PowerUpKind, …>` maps and `POWER_UP_NAMES`), `PowerUpTimers.ts` (the `ticksLeft` literal), and `palette.ts` (`DROP_COLORS` is `Record<PowerUpKind, string>`; `DARK_LETTER_DROP_KINDS` is a Set and does not error). Steps 3-4 are the compile fixes for all three.

`src/core/config/GameConfig.ts`:

```ts
    durationsTicks: { E: 720, M: 180, L: 720, P: 480, B: 720, W: 0, T: 480, X: 600, J: 360, N: 0 } satisfies Record<
      PowerUpKind,
      number
    >,
    dropWeights: { E: 1, M: 1, L: 1, P: 1, B: 1, W: 1, T: 1, X: 1, J: 0.5, N: 0.3 } satisfies Record<
      PowerUpKind,
      number
    >,
```

(`N: 0` duration — NUKE is instantaneous like WALL and never joins `TIMED_KINDS`.)

In `POWER_UP_NAMES`:

```ts
  N: "NUKE",
```

In the `effects` block, after `brickDeathBurst`:

```ts
    nukeBurst: {
      chunkCount: 10,
      minChunkSize: 2,
      maxChunkSize: 3,
      minSpeed: 1.4,
      maxSpeed: 3,
      minLifeTicks: 30,
      maxLifeTicks: 45,
    } satisfies BurstSpec,
    nuke: {
      ringSpeed: 14,
      maxSweepTicks: 48,
      fieldFlashTicks: 3,
      // Must be >= 1: Detonation.beginHold clamps, since a zero hold would never
      // enter the holding branch and the empty-grid sweep would spin forever.
      holdTicks: 30,
    },
```

`src/entities/powerups/PowerUpTimers.ts` line 9 — add `N: 0`:

```ts
  private readonly ticksLeft: Record<PowerUpKind, number> = { E: 0, M: 0, L: 0, P: 0, B: 0, W: 0, T: 0, X: 0, J: 0, N: 0 };
```

- [ ] **Step 4: Palette**

`src/render/palette.ts` — in `DROP_COLORS`:

```ts
  N: "#b6ff00",
```

The dark-letter set becomes:

```ts
export const DARK_LETTER_DROP_KINDS: ReadonlySet<PowerUpKind> = new Set(["P", "W", "T", "X", "N"]);
```

In `canvasPalette`, after `deathFlash`:

```ts
  nukeFlash: "#ffffff",
  nukeRing: "#eaf7ff",
```

- [ ] **Step 5: Verify**

Run: `pnpm run fmt && pnpm typecheck && pnpm lint`
Expected: all green. (`DropPool` needs no edit: `DROP_KINDS` derives from `Object.keys(dropWeights)` and the weighted roll already handles fractional weights.)

### Task 6: `Detonation` entity + `BrickGrid.destroy`

Standalone additions, unused until Task 7.

**Files:**
- Create: `src/entities/effects/Detonation.ts`
- Modify: `src/entities/bricks/BrickGrid.ts` (after `damage`, line 89)

**Interfaces:**
- Consumes: `gameConfig.effects.nuke` (Task 5).
- Produces: `class Detonation { active; x; y; radius; flashTicksLeft; get holding; get sweepExpired; start(x, y): void; step(): void; beginHold(): void; stepHold(): boolean; reset(): void }`; `BrickGrid.destroy(hit: BrickHit): void`.

- [ ] **Step 1: Create `src/entities/effects/Detonation.ts`**

```ts
import { gameConfig } from "@core/config/GameConfig";

// State of a NUKE shockwave: the initial full-field flash, an expanding ring
// that detonates bricks as it reaches them, then a hold that lets the debris
// fall before the clear screen. It stays active through the hold, so the panel
// label and the lingering ring survive until the clear. ShatterGame drives the
// sweep and destroys the bricks; this object only tracks geometry and timing.
export class Detonation {
  active = false;
  x = 0;
  y = 0;
  radius = 0;
  flashTicksLeft = 0;
  private sweepTicks = 0;
  private holdTicksLeft = 0;

  get holding(): boolean {
    return this.holdTicksLeft > 0;
  }

  // Safety bound: past this, the sweep destroys everything left regardless of radius.
  get sweepExpired(): boolean {
    return this.sweepTicks >= gameConfig.effects.nuke.maxSweepTicks;
  }

  start(x: number, y: number): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.flashTicksLeft = gameConfig.effects.nuke.fieldFlashTicks;
    this.sweepTicks = 0;
    this.holdTicksLeft = 0;
  }

  step(): void {
    this.radius += gameConfig.effects.nuke.ringSpeed;
    this.sweepTicks++;
    if (this.flashTicksLeft > 0) {
      this.flashTicksLeft--;
    }
  }

  beginHold(): void {
    // Clamp: with a zero hold, `holding` would stay false and the sweep would
    // re-run forever on an empty grid — the level could never clear.
    this.holdTicksLeft = Math.max(1, gameConfig.effects.nuke.holdTicks);
  }

  // Returns true on the tick the hold ends.
  stepHold(): boolean {
    if (this.flashTicksLeft > 0) {
      this.flashTicksLeft--;
    }
    return --this.holdTicksLeft === 0;
  }

  reset(): void {
    this.active = false;
    this.holdTicksLeft = 0;
  }
}
```

- [ ] **Step 2: Add `destroy` to `src/entities/bricks/BrickGrid.ts`**

After the `damage` method:

```ts
  // NUKE kills: remove the cell outright, regardless of remaining hit points.
  destroy(hit: BrickHit): void {
    if (this.grid[hit.row][hit.column] !== null) {
      this.grid[hit.row][hit.column] = null;
      this.remainingCount--;
    }
  }
```

- [ ] **Step 3: Verify**

Run: `pnpm run fmt && pnpm typecheck && pnpm lint`
Expected: all green.

### Task 7: NUKE integration — catch, sweep, freeze, draw, README

**Files:**
- Modify: `src/core/ShatterGame.ts` (field next to `particles`; `stepSimulation`; `applyPowerUp` line 338-387; two new methods after `emitBurst`; `powerLabel` — the last method of the class; `resetServe`; `gameOver`; `frame` view object; the guarded `dropPool.step` from Task 3)
- Modify: `src/render/CanvasRenderer.ts` (import, `RenderView`, `draw`, new method)
- Modify: `README.md` (power-up list line 11, `?power` line 67, project structure after the `powerups/` line 98, engine-details list)

**Interfaces:**
- Consumes: `Detonation`, `BrickGrid.destroy` (Task 6), `emitBurst` + `clearCountdown` (Task 3), `gameConfig.effects.nukeBurst` / `.nuke` and `POWER_UP_NAMES.N` (Task 5).
- Produces: the finished feature.

- [ ] **Step 1: Field and catch branch in `ShatterGame`**

Import:

```ts
import { Detonation } from "@entities/effects/Detonation";
```

Field, next to `particles`:

```ts
  private readonly detonation = new Detonation();
```

In `applyPowerUp`, after the `if (kind === "J") { … }` effect block (before the sound lines), add — the ring starts where the capsule was caught, the paddle's centre:

```ts
    if (kind === "N") {
      this.detonation.start(this.paddle.x + this.paddle.width / 2, gameConfig.paddle.y);
    }
```

Replace the sound tail of `applyPowerUp` (SHA-26 world — the expected case):

```ts
    if (kind === "J") {
      this.deps.sfx.jammerPickup();
    } else {
      this.deps.sfx.capsulePickup();
    }
```

with — one detonation instead of a pickup jingle, and instead of ~70 per-brick beeps (`SoundBank.nukeDetonation()` was shipped by SHA-26 for exactly this call):

```ts
    if (kind === "N") {
      this.deps.sfx.nukeDetonation();
    } else if (kind === "J") {
      this.deps.sfx.jammerPickup();
    } else {
      this.deps.sfx.capsulePickup();
    }
```

**Legacy fallback** (only if SHA-26 has not landed and the tree still has `deps.sound: Sound` with `beep`/`arp`): same shape, with `this.deps.sound.arp([784, 392, 196, 98], 45)` as the `N` branch and the existing `arp([392, 196], 50)` / `arp([659, 880], 50)` calls for the other two. Do not edit `src/audio/*` yourself in either world.

- [ ] **Step 2: Sweep methods**

After `emitBurst`, add:

```ts
  private stepDetonation(): void {
    if (this.detonation.holding) {
      if (this.detonation.stepHold()) {
        this.detonation.reset();
        this.onLevelCleared();
      }
      return;
    }
    this.detonation.step();
    this.nukeBricksWithin(this.detonation.sweepExpired ? Number.POSITIVE_INFINITY : this.detonation.radius);
    if (this.grid.remaining <= 0) {
      this.detonation.beginHold();
    }
  }

  // Detonates every live brick whose centre the shockwave has reached. Nuke
  // kills bypass damageBrick(): full points (PAYDAY applies), but no capsule
  // drops, no BLAST chaining, no per-brick beep, and silver/gold die outright.
  private nukeBricksWithin(radius: number): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const radiusSquared = radius * radius;

    this.grid.rows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (!cell) {
          return;
        }
        const deltaX = left + columnIndex * brickWidth + brickWidth / 2 - this.detonation.x;
        const deltaY = top + rowIndex * brickHeight + brickHeight / 2 - this.detonation.y;
        if (deltaX * deltaX + deltaY * deltaY > radiusSquared) {
          return;
        }
        const hit = { cell, row: rowIndex, column: columnIndex };
        this.grid.destroy(hit);
        this.score += cell.points * this.scoreMultiplier();
        this.emitBurst(hit, gameConfig.effects.nukeBurst);
      });
    });
  }
```

(Setting cells to `null` during `forEach` over the same arrays is safe — element assignment does not disturb iteration. `radius = Infinity` destroys everything: `d² > Infinity` is always false. The hold begins on the tick the last brick dies; the ring then freezes at its final radius until the clear.)

- [ ] **Step 3: Freeze during the sweep and hold**

In `stepSimulation`, directly **above** the `clearCountdown` block from Task 3, insert:

```ts
    // A NUKE detonation freezes the rest of the simulation the same way while
    // its shockwave sweeps the field and its debris falls.
    if (this.detonation.active) {
      this.stepDetonation();
      return;
    }
```

Then harden the Task 3 drop guard against a second capsule reaching the paddle **in the same tick** as the NUKE (capsule catching is the last thing in a tick, so this is the only window the freeze cannot cover). Replace:

```ts
    if (this.clearCountdown === 0) {
      this.dropPool.step(this.paddle.bounds, (kind) => this.applyPowerUp(kind));
    }
```

with:

```ts
    if (this.clearCountdown === 0) {
      this.dropPool.step(this.paddle.bounds, (kind) => {
        // Two capsules can reach the paddle on one tick; nothing applies once
        // a NUKE detonation has started.
        if (!this.detonation.active) {
          this.applyPowerUp(kind);
        }
      });
    }
```

- [ ] **Step 4: Label, resets, render view**

In `powerLabel` (the class's last method), after the `wallArmed` block:

```ts
    if (this.detonation.active) {
      names.push(POWER_UP_NAMES.N);
    }
```

In `onLevelCleared`, add as first lines — nuke chunks live 30–45 ticks but the hold is 30, so last-ring debris can outlive it and would otherwise freeze mid-air behind the CLEARED overlay (the ordinary path is clean by construction: 15-tick chunks vs a 20-tick delay, but the flush covers every caller):

```ts
    this.brickFlashes = [];
    this.particles.reset();
```

In `resetServe` and in `gameOver`, next to `this.particles.reset();`:

```ts
    this.detonation.reset();
```

In `frame`, add to the `draw` view object:

```ts
      detonation: this.detonation,
```

- [ ] **Step 5: Draw the detonation**

`src/render/CanvasRenderer.ts` — import:

```ts
import type { Detonation } from "@entities/effects/Detonation";
```

Add to `RenderView`:

```ts
  detonation: Detonation;
```

In `draw`, insert before `this.drawWalls();`:

```ts
    this.drawDetonation(view.detonation);
```

Add the method:

```ts
  // Full-field impact flash for the first ticks, then the expanding shockwave
  // ring (it lingers at its final radius through the debris hold). Drawn over
  // the sprites, under the wall frame.
  private drawDetonation(detonation: Detonation): void {
    if (!detonation.active) {
      return;
    }
    if (detonation.flashTicksLeft > 0) {
      this.pixel(0, 0, gameConfig.field.width, gameConfig.field.height, canvasPalette.nukeFlash);
    }
    if (detonation.radius > 0) {
      this.ctx.strokeStyle = canvasPalette.nukeRing;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(detonation.x, detonation.y, detonation.radius, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }
```

- [ ] **Step 6: README**

Four edits:

1. Power-up list (line 11): after `**PAYDAY** (points ×2)`, insert `, **NUKE** (rare: a shockwave destroys every brick on the field, full points)`.
2. `?power` line (line 67): `(capsule letters E/M/L/P/B/W/T/X/J)` → `(capsule letters E/M/L/P/B/W/T/X/J/N)`.
3. Project structure, after the `powerups/` line (line 98):

```text
    effects/         # ParticleField (debris ring buffer) + Detonation (NUKE shockwave)
```

4. Engine details list, one new bullet:

```markdown
- **Brick death effects**: destroyed bricks flash white and burst into debris from a 512-slot particle ring buffer; the NUKE sweep and the level-clear delay freeze the simulation (only effects tick), so the clear screen never cuts an animation short and no ball can be lost behind an explosion.
```

- [ ] **Step 7: Verify**

Run: `pnpm run fmt && pnpm typecheck && pnpm lint && pnpm run fmt:check`
Expected: all green.

### Task 8: SHA-23 QA gate — verify, present, STOP

- [ ] **Step 1: Full check suite**

Run: `pnpm typecheck && pnpm lint && pnpm run fmt:check && pnpm build`
Expected: all exit 0.

- [ ] **Step 2: Live QA**

Run `pnpm dev` and check each:

1. `?power=N&level=15` → launch: full-field white flash, ring expanding from the paddle, FINALE's 72 bricks detonating in rings with visibly bigger/faster/longer-lived debris than a ball hit, one explosion sound, then a ~0.5 s hold with the ring lingering while debris falls, then GRID CLEARED — with **no frozen debris visible behind the overlay**. Score = full value of all bricks + clear bonus.
2. `?droprate=1`: the `N` capsule appears occasionally (rare), acid green `#b6ff00` with a dark letter.
3. The panel POWER inset shows `NUKE` from the catch until the clear screen — through the sweep **and** the hold; balls and capsules visibly freeze.
4. `?power=XN` (PAYDAY then NUKE at launch): nuked bricks pay double.
5. Esc mid-sweep or mid-hold: GAME OVER, no ring or flash left on the canvas behind the overlay.
6. An ordinary brick hit still shows the small SHA-24 pop — the two effects read as clearly different.

- [ ] **Step 3: Present and wait**

Set SHA-23 to In Review. Report QA results, list changed files, and **STOP — the user QAs and authorizes the commit (stage only this ticket's files).**
