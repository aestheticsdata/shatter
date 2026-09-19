# THE 43, series I — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the one Observer eye on the first eight levels — a different place, size, layer, visibility and behaviour on each — and move the two late bosses so every series ends on a nine.

**Architecture:** A level gains an optional `eye` block (`EyePlacement`): the almond's socket plus layer, opacity, clip and an `act`. The existing `Observer` object carries that placement beside the veils' `ObserverDefinition` and answers one posture per frame (`socket`, `opacity`, `clip`, `layer`); the renderer draws that posture on either side of the wall, through a clip and an alpha (a halftone in DEMAKE); the game feeds the eye what its acts need (the wall's fraction, which bricks stand, where the ball is). Nothing about the eye's face changes — `drawEye` is not touched.

**Tech Stack:** Vite + strict TypeScript, canvas 2D, Playwright (imported by absolute path) against the dev server on port 5174.

**Spec:** `docs/superpowers/specs/2026-09-19-observer-one-eye-43-placements.md` — series I, "The shared tricks", EVEN NINES.

## Global Constraints

- **One eye.** No new lid, pupil or anatomy; `drawEye` in `src/render/CanvasRenderer.ts` is read, never edited.
- **One ticket In Progress at a time**, set In Progress at the start of the task and In Review at its end (Spira project SHA, epic SHA-188, label `eye-refacto`). The user QAs, then commits. **The executor never runs `git commit`** — every "commit" step below is "leave it in the tree and report".
- **Reports are three or four lines.** What is on screen, where to look, what to type in the console.
- **Every number is one plain knob** in `src/core/config/GameConfig.ts` or in the level's own data; no debug/shipped split.
- **Every effect fades both ends** — a hop is a blink, a flash decays, a gaze finishes its shot before it is put away.
- **DEMAKE:** every new picture must survive 1-bit; opacity is a halftone there, never a grey.
- **No bare string names.** Layers, tints and act kinds are constants in `src/interfaces/eye.ts` (`EYE_LAYER.BEHIND / FRONT`, `EYE_TINT.BLUE / RED`, and `EYE_ACT.RISE / BRICK / PATROL / PULSE / STAIRS / GAZE` added in Task 2) with derived types `EyeLayer`, `EyeTint`, `EyeActKind`. Every snippet below that spells `"behind"`, `"front"`, `"blue"` or a `kind: "…"` is written with the constant; level data too. User's rule, 2026-09-19.
- **The six commands pass after every task:** `pnpm run typecheck && pnpm run lint && pnpm run fmt:check && pnpm run build && pnpm run check:backgrounds && pnpm run check:drops`. Run `pnpm run fmt` after touching markdown.
- Field: 372 × 300, playable 3..369 × 3..300. Grid: left 6, top 38, 12 columns of 30 × 12. Cell (column c, row r) centre = (21 + 30c, 44 + 12r).
- Level indices are 0-based in code: SUNRISE 0, SMILEY 1, PYRAMID 2, CHOMP 3, GATEWAY 4, HEART 5, VORTEX 6, BOLT 7, THE VEIL 8.

---

## File Structure

- `src/interfaces/types.ts` — `FieldRect`, `EyePlacement`, `EyeAct` (grown one branch per task), `LevelDefinition.eye?`.
- `src/entities/effects/Observer.ts` — the placement beside the veil; posture getters; `EyeSight`; act state and stepping. Stays under 400 lines; the act stepping is one private method per kind.
- `src/render/CanvasRenderer.ts` — `drawObserverEye(view, layer)`, the eye sheet and the halftone masks, the strike flash. `drawEye` untouched.
- `src/render/levelStill.ts` — the gallery still draws the resting posture.
- `src/render/backgrounds.ts` — the horizon's line is fixed so a level can sit something on it.
- `src/core/ShatterGame.ts` — `buildLevel` loads the placement; `eyeSight()`; `eyeTarget()` reads the socket; the throat arms the gaze; the strike flashes.
- `src/core/config/GameConfig.ts` — `observer.strike`, `observer.throat`.
- `src/core/levels/levels.ts` — the eight placements, and the boss move.
- `README.md`, `docs/ARCHITECTURE.md` — the paragraph that says thirty-eight levels have no eye.
- Harness (scratch, not in the repo): `/private/tmp/claude-502/-Users-cosmokaat-dev-shatter/d89201fd-563f-48c0-9e6b-7392a6d523e0/scratchpad/eye/harness.mjs` plus one `tN-*.mjs` per task.

---

### Task 1: FOUNDATION — an eye on every level (placement, layer, opacity, clip)

Ticket: create under SHA-188 — *"FOUNDATION: an eye on every level — where, how big, which side of the wall, how visible"*. SUNRISE, PYRAMID, CHOMP, HEART and VORTEX get their resting posture.

**Files:**
- Modify: `src/interfaces/types.ts:293-318`
- Modify: `src/entities/effects/Observer.ts` (fields, `live`, `pupil`, `load`, `reset`, `step`, `lookAt`; new getters)
- Modify: `src/render/CanvasRenderer.ts:2705-2760` (eye draw site), `:2905` (front site), class fields, two new private methods
- Modify: `src/render/levelStill.ts:28-48`
- Modify: `src/render/backgrounds.ts:406`
- Modify: `src/core/ShatterGame.ts:5714`, `:5808-5812`, `:7063`
- Modify: `src/core/levels/levels.ts` (SUNRISE, PYRAMID, CHOMP, HEART, VORTEX)
- Modify: `README.md:17`, `docs/ARCHITECTURE.md` (observer row)
- Create: scratch `eye/harness.mjs`, `eye/t1-foundation.mjs`

**Interfaces:**
- Consumes: `drawEye(ctx, socket, open, target, tint, scale, demade?, weeping?, veined?, hollow?)`; `eyePupilPoint(socket, open, target)`; `Observer.open/target/hollow/level`.
- Produces: `EyePlacement`, `FieldRect`, `LevelDefinition.eye?`; `Observer.load(definition, placement)`, `Observer.socket: EyeSocket | null`, `Observer.layer`, `Observer.opacity`, `Observer.clip`, `Observer.tint`; renderer `drawObserverEye(view, layer)`.

- [ ] **Step 1: Write the harness and the failing check**

Start the dev server if it is not up: `curl -s -o /dev/null localhost:5174 || (cd /Users/cosmokaat/dev/shatter && pnpm dev >/dev/null 2>&1 &)`.

`scratchpad/eye/harness.mjs`:

```js
import { chromium } from "/Users/cosmokaat/dev/shatter/node_modules/@playwright/test/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

export const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/** One headless page on the dev server with the game's loop stopped; the harness steps it. */
export async function withGame(run) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://localhost:5174/");
  await page.waitForFunction(() => Boolean(window.__shatter), null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(150);
  try {
    return await run(page);
  } finally {
    if (errors.length) console.error("PAGE ERRORS", errors);
    await browser.close();
  }
}

/**
 * Build level `index` (0-based) on the play screen, run `prepare` (JS source
 * with `game` in scope), step `ticks`, draw one frame. Returns the eye's
 * posture, a few probes ([r,g,b,a] at field pixels) and the field PNG.
 */
export async function onLevel(page, index, { ticks = 0, prepare = "", probes = [] } = {}) {
  return page.evaluate(
    ({ index, ticks, prepare, probes }) => {
      const game = window.__shatter;
      game.setScreen("play");
      game.level = index;
      game.buildLevel(index);
      new Function("game", prepare)(game);
      for (let i = 0; i < ticks; i += 1) game.stepSimulation();
      game.lastTime = 0;
      game.accumulator = 0;
      game.frame(0);
      const eye = game.observer;
      const canvas = document.getElementById("playfield");
      const ctx = canvas.getContext("2d");
      const SCALE = 3;
      return {
        socket: eye.socket,
        layer: eye.layer,
        opacity: eye.opacity,
        clip: eye.clip,
        open: eye.open,
        target: eye.target,
        remaining: game.grid.remaining,
        probes: probes.map(([x, y]) => Array.from(ctx.getImageData(x * SCALE + 1, y * SCALE + 1, 1, 1).data)),
        png: canvas.toDataURL("image/png"),
      };
    },
    { index, ticks, prepare, probes },
  );
}

/** JS source for `prepare`: kill the first `n` standing bricks, top-left first. */
export const kill = (n) =>
  `let n = ${n}; for (let r = 0; r < game.grid.grid.length && n > 0; r += 1) for (let c = 0; c < 12 && n > 0; c += 1) if (game.grid.grid[r][c]) { game.grid.grid[r][c] = null; game.grid.remainingCount -= 1; n -= 1; }`;

/** JS source for `prepare`: park the first ball at (x, y), in flight. */
export const ball = (x, y) => `const b = game.balls[0]; b.active = true; b.x = ${x}; b.y = ${y};`;

export function savePng(name, dataUrl) {
  writeFileSync(`${OUT}${name}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
}

export function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
}
```

`scratchpad/eye/t1-foundation.mjs`:

```js
import { withGame, onLevel, kill, savePng, check } from "./harness.mjs";

const same = (a, b) => a.join() === b.join();
const NO_EYE = "game.observer.placement = null;";

await withGame(async (page) => {
  // SUNRISE: huge, 20 %, only above the horizon (y < 180).
  const sun = await onLevel(page, 0, { probes: [[186, 150], [186, 200]] });
  const bare = await onLevel(page, 0, { prepare: NO_EYE, probes: [[186, 150], [186, 200]] });
  check("SUNRISE socket", JSON.stringify(sun.socket) === JSON.stringify({ x: 186, y: 182, hw: 150, hh: 60 }), sun.socket);
  check("SUNRISE opacity 0.2, behind", sun.opacity === 0.2 && sun.layer === "behind", [sun.opacity, sun.layer]);
  check("SUNRISE shows above the horizon", !same(sun.probes[0], bare.probes[0]), [sun.probes[0], bare.probes[0]]);
  check("SUNRISE clipped under the horizon", same(sun.probes[1], bare.probes[1]), [sun.probes[1], bare.probes[1]]);
  savePng("t1-sunrise", sun.png);

  // VORTEX: tiny, under the four granites — invisible until dug out.
  const buried = await onLevel(page, 6, { probes: [[186, 92]] });
  const bareVortex = await onLevel(page, 6, { prepare: NO_EYE, probes: [[186, 92]] });
  const dug = await onLevel(page, 6, {
    prepare: "for (const c of [4, 5, 6, 7]) { game.grid.grid[4][c] = null; game.grid.remainingCount -= 1; }",
    probes: [[186, 92]],
  });
  check("VORTEX hidden under granite", same(buried.probes[0], bareVortex.probes[0]), buried.probes[0]);
  check("VORTEX seen once dug out", !same(dug.probes[0], bareVortex.probes[0]), dug.probes[0]);
  savePng("t1-vortex-dug", dug.png);

  // PYRAMID: over the apex bricks — the brick stands and the eye is on it.
  const apex = await onLevel(page, 2, { probes: [[186, 44]] });
  const bareApex = await onLevel(page, 2, { prepare: NO_EYE, probes: [[186, 44]] });
  check("PYRAMID front, over a standing brick", apex.layer === "front" && !same(apex.probes[0], bareApex.probes[0]), apex.probes[0]);
  savePng("t1-pyramid", apex.png);

  // THE VEIL is untouched: its socket is the veil's.
  const veil = await onLevel(page, 8);
  check("THE VEIL socket unchanged", JSON.stringify(veil.socket) === JSON.stringify({ x: 186, y: 72, hw: 42, hh: 15 }), veil.socket);

  // Contact sheet for the eyes: the five resting postures.
  for (const [index, name] of [[0, "sunrise"], [2, "pyramid"], [3, "chomp"], [5, "heart"], [6, "vortex"]]) {
    savePng(`t1-still-${name}`, (await onLevel(page, index, { prepare: kill(0) })).png);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /private/tmp/claude-502/-Users-cosmokaat-dev-shatter/d89201fd-563f-48c0-9e6b-7392a6d523e0/scratchpad/eye && node t1-foundation.mjs`
Expected: `FAIL SUNRISE socket — null` (no `socket` getter yet) and the others FAIL.

- [ ] **Step 3: The types**

In `src/interfaces/types.ts`, after `ObserverDefinition` (line 310) add:

```ts
/** A window of the field, in field pixels. */
export interface FieldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * THE 43 (SHA-188): the Observer's posture on an ordinary level.
 *
 * One eye — the almond of SHA-169, unchanged — and what differs from level to
 * level is only where it is, how big, on which side of the wall, how visible,
 * and how much of it the field lets you see. A veil has its own block
 * (`ObserverDefinition`) and none of this; a level with neither has no eye.
 */
export interface EyePlacement {
  // The socket: centre, half-width, half-height, in field pixels.
  x: number;
  y: number;
  hw: number;
  hh: number;
  // Which side of the wall. `behind` is the veils' room: the wall is drawn over
  // it and it shows through the gaps. `front` is over the wall, out where the
  // ball is — and still not matter. Absent means behind.
  layer?: "behind" | "front";
  // 1 is solid, which is what absent means. Under it the eye is drawn through
  // the field — a translucent almond in colour, a halftone one in DEMAKE.
  opacity?: number;
  // Only this window of the field shows it: the sun under the horizon, the
  // pilot through the porthole. Absent means the whole field.
  clip?: FieldRect;
  // The veils' blue unless the level says red. Absent means blue.
  tint?: "blue" | "red";
}
```

In `LevelDefinition`, replace the `observer?` comment and add `eye?`:

```ts
  // The five veils' block, and absent on the other thirty-eight — which carry
  // the same eye in `eye` instead, at rest or acting. A level with neither has
  // no eye.
  observer?: ObserverDefinition;
  eye?: EyePlacement;
```

- [ ] **Step 4: The Observer carries a placement**

In `src/entities/effects/Observer.ts`:

Import: `import type { EyePlacement, FieldRect, ObserverDefinition } from "@interfaces/types";`

Fields, after `private definition`:

```ts
  /**
   * THE 43 (SHA-188): the posture on an ordinary level. Null on a veil, whose
   * block has its own socket, and on a level with no eye at all.
   */
  private placement: EyePlacement | null = null;
```

Replace `get live()` and add the posture getters after `get level()`:

```ts
  get live(): boolean {
    return this.definition !== null || this.placement !== null;
  }

  get level(): ObserverDefinition | null {
    return this.definition;
  }

  /**
   * The socket this frame — a veil's, or the placement's — and null when
   * there is no eye. Every reader of "where is the eye" comes through here:
   * the renderer, the still, the look, the gaze's source.
   */
  get socket(): EyeSocket | null {
    if (this.definition) {
      return this.definition.eye;
    }
    const placed = this.placement;
    return placed ? { x: placed.x, y: placed.y, hw: placed.hw, hh: placed.hh } : null;
  }

  get layer(): "behind" | "front" {
    return this.placement?.layer ?? "behind";
  }

  get opacity(): number {
    return this.placement?.opacity ?? 1;
  }

  get clip(): FieldRect | null {
    return this.placement?.clip ?? null;
  }

  get tint(): "blue" | "red" {
    return this.definition?.tint ?? this.placement?.tint ?? "blue";
  }
```

`get pupil()`: `const socket = this.socket;` (was `this.definition?.eye`).

`load`:

```ts
  load(definition: ObserverDefinition | undefined, placement: EyePlacement | undefined): void {
    this.definition = definition ?? null;
    // A veil's socket wins outright: the two blocks are never both written on
    // a level, and if one ever were the veil is the one with a mode to run.
    this.placement = definition ? null : (placement ?? null);
    this.empty = false;
    this.blinkLeft = 0;
    this.nextBlink = this.drawNextBlink();
    this.stars.length = 0;
    for (const _star of definition?.diadem ?? []) {
      this.stars.push(false);
    }
    const socket = this.socket;
    this.lookX = socket?.x ?? 0;
    this.lookY = socket?.y ?? 0;
  }

  reset(): void {
    this.load(undefined, undefined);
  }
```

`step`: first line `if (!this.live) {` (was `!this.definition`); the lid check stays `this.definition?.mode === "lid"` (needs `?.` now).

`lookAt`: `const to = at ?? this.socket ?? { x: this.lookX, y: this.lookY };`

- [ ] **Step 5: The game loads it and reads the socket**

`src/core/ShatterGame.ts`:
- line 7063: `this.observer.load(definition.observer, definition.eye);`
- line 5714: `const onVeil = this.observer.level !== null;`
- `eyeTarget()` line 5809: `const socket = this.observer.socket;`

- [ ] **Step 6: The renderer draws the posture on its layer**

In `src/render/CanvasRenderer.ts`, class fields (near `halftoneFill`):

```ts
  // THE 43's eye sheet: the almond is painted whole on it and cut to a halftone
  // before it goes down, when DEMAKE has no alpha to fade it through.
  private eyeSheetCanvas: HTMLCanvasElement | null = null;
  private readonly halftoneMasks = new Map<1 | 2, CanvasPattern>();
```

Replace the eye block at the behind site (the `const socket = view.observer.level?.eye; if (socket) { drawEye(...) }` inside `if (chamber && view.observer.live)`) with:

```ts
      const socket = view.observer.socket;
      this.drawObserverEye(view, "behind");
```

(`socket` is still read below it by the gaze's `inner`/`outer` radii — leave those lines.)

After the `for (const flash of view.flashes) { ... }` loop and before the `// THE OCULI` comment:

```ts
    // THE 43: an eye placed over the wall, drawn after it and before the brood.
    if (chamber) {
      this.drawObserverEye(view, "front");
    }
```

New methods, after `halftone()`:

```ts
  /**
   * THE OBSERVER's eye on this level, on the layer asked for (SHA-188).
   *
   * One call for both sides of the wall: a veil's eye is behind it and an
   * ordinary level's is wherever its placement says. Under 1 opacity the
   * almond goes through a veil of the field — the canvas's own alpha in colour,
   * and in DEMAKE a halftone cut out of it, because a 1-bit tube has no half
   * tones to fade through and a grey eye on it would be the one thing on
   * screen that is not the machine's. `clip` is a window: what is outside it
   * is simply not drawn, which is how a sun sits under a horizon.
   */
  private drawObserverEye(view: RenderView, layer: "behind" | "front"): void {
    const eye = view.observer;
    const socket = eye.socket;
    if (!socket || eye.layer !== layer) {
      return;
    }
    const paint = (ctx: CanvasRenderingContext2D): void => {
      drawEye(
        ctx,
        socket,
        eye.open,
        eye.target,
        view.oculi.gap ? "gold" : eye.tint,
        SCALE,
        this.demade,
        eye.level?.mode === "tear",
        eye.level?.mode === "wrath",
        eye.hollow,
      );
    };
    this.ctx.save();
    const clip = eye.clip;
    if (clip) {
      this.ctx.beginPath();
      this.ctx.rect(clip.x * SCALE, clip.y * SCALE, clip.w * SCALE, clip.h * SCALE);
      this.ctx.clip();
    }
    const { opacity } = eye;
    if (opacity >= 1) {
      paint(this.ctx);
    } else if (!this.demade) {
      this.ctx.globalAlpha = opacity;
      paint(this.ctx);
    } else {
      // One dot in four under a third, two in four above it: 20 % and 50 % are
      // two different textures on the tube rather than two greys it cannot show.
      const sheet = this.eyeSheet();
      const sheetCtx = sheet.getContext("2d");
      if (!sheetCtx) {
        throw new Error("2D eye sheet context unavailable");
      }
      sheetCtx.setTransform(1, 0, 0, 1, 0, 0);
      sheetCtx.globalCompositeOperation = "source-over";
      sheetCtx.clearRect(0, 0, sheet.width, sheet.height);
      paint(sheetCtx);
      sheetCtx.globalCompositeOperation = "destination-in";
      sheetCtx.fillStyle = this.halftoneMask(opacity < 0.34 ? 1 : 2);
      sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
      this.ctx.drawImage(sheet, 0, 0);
    }
    this.ctx.restore();
  }

  private eyeSheet(): HTMLCanvasElement {
    if (this.eyeSheetCanvas === null) {
      const canvas = document.createElement("canvas");
      canvas.width = gameConfig.field.width * SCALE;
      canvas.height = gameConfig.field.height * SCALE;
      this.eyeSheetCanvas = canvas;
    }
    return this.eyeSheetCanvas;
  }

  /**
   * A two-by-two game-pixel tile with `keep` of its four cells opaque. Filled
   * through `destination-in` it keeps that many of the sheet's pixels and
   * drops the rest — a halftone, in the tube's own grain.
   */
  private halftoneMask(keep: 1 | 2): CanvasPattern {
    const cached = this.halftoneMasks.get(keep);
    if (cached) {
      return cached;
    }
    const tile = document.createElement("canvas");
    tile.width = 2 * SCALE;
    tile.height = 2 * SCALE;
    const ctx = tile.getContext("2d");
    if (!ctx) {
      throw new Error("2D halftone mask context unavailable");
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SCALE, SCALE);
    if (keep === 2) {
      ctx.fillRect(SCALE, SCALE, SCALE, SCALE);
    }
    const pattern = this.mainCtx.createPattern(tile, "repeat");
    if (!pattern) {
      throw new Error("halftone mask unavailable");
    }
    this.halftoneMasks.set(keep, pattern);
    return pattern;
  }
```

- [ ] **Step 7: The still and the horizon**

`src/render/levelStill.ts`, replace the body from `const socket` to the end of the brick loop:

```ts
  const socket = level.observer?.eye;
  paintBackground(ctx, level.background, variant, width, height, socket);
  if (socket && level.observer) {
    drawEye(ctx, socket, 1, { x: socket.x, y: socket.y }, level.observer.tint, 1);
  }
  // An ordinary level's eye, at rest (SHA-188): behind the wall it goes down
  // here, under the bricks; in front, after them. Same window and the same
  // alpha the arena gives it — a still of SUNRISE without its sun half under
  // the horizon would be a picture of another level.
  const eye = level.eye;
  const drawPlaced = (): void => {
    if (!eye) {
      return;
    }
    ctx.save();
    if (eye.clip) {
      ctx.beginPath();
      ctx.rect(eye.clip.x, eye.clip.y, eye.clip.w, eye.clip.h);
      ctx.clip();
    }
    ctx.globalAlpha = eye.opacity ?? 1;
    drawEye(ctx, eye, 1, { x: eye.x, y: eye.y }, eye.tint ?? "blue", 1);
    ctx.restore();
  };
  if ((eye?.layer ?? "behind") === "behind") {
    drawPlaced();
  }

  const grid = new BrickGrid();
  grid.load(level, () => null);

  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  grid.rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell) {
        drawBrick(ctx, left + columnIndex * brickWidth, top + rowIndex * brickHeight, cell, 1);
      }
    });
  });
  if (eye?.layer === "front") {
    drawPlaced();
  }
```

`src/render/backgrounds.ts` line 406: replace the roll with a fixed line:

```ts
  // Fixed at 180 rather than rolled ±12 per variant (SHA-188): SUNRISE sits
  // the Observer on this line, half under it, and a clip in level data cannot
  // follow a roll. Still below the deepest brick row and above the paddle lane.
  const horizon = Math.round(brush.height * 0.6);
```

- [ ] **Step 8: The five resting postures**

`src/core/levels/levels.ts`, add to each level's object:

```ts
  {
    name: "SUNRISE",
    background: "horizon",
    rows: [...],
    // The sun: enormous, behind the wall at a fifth, half under the horizon
    // painter's line at y 180 — only the window above it is drawn.
    eye: { x: 186, y: 182, hw: 150, hh: 60, opacity: 0.2, clip: { x: 3, y: 3, w: 366, h: 177 } },
  },
  {
    name: "PYRAMID",
    // The eye on the dollar: tiny, in the capstone, over the two apex bricks.
    eye: { x: 186, y: 44, hw: 14, hh: 5, layer: "front" },
  },
  {
    name: "CHOMP",
    // Deep in the throat, behind the uvula: the 5 at column 6 covers the pupil
    // until it is broken.
    eye: { x: 186, y: 68, hw: 40, hh: 14 },
  },
  {
    name: "HEART",
    // Inside the heart, behind its bricks: revealed as it dies.
    eye: { x: 186, y: 74, hw: 44, hh: 16 },
  },
  {
    name: "VORTEX",
    // The eye of the storm: tiny, dead centre, under the four granites.
    eye: { x: 186, y: 92, hw: 14, hh: 5 },
  },
```

- [ ] **Step 9: Run the check and the six commands**

Run: `node t1-foundation.mjs` → every line PASS; open `out/t1-sunrise.png`, `out/t1-pyramid.png`, `out/t1-vortex-dug.png` and the five stills and look at them (the sun's top half at 20 % above the horizon; a tiny eye on the capstone; the eye in the dug core).
Run: `cd /Users/cosmokaat/dev/shatter && pnpm run typecheck && pnpm run lint && pnpm run fmt:check && pnpm run build && pnpm run check:backgrounds && pnpm run check:drops` → all green.
DEMAKE by eye: in the game, `level 1` then `power DEMAKE` in the console; the sun must be a one-in-four dot field, not a grey.

- [ ] **Step 10: Docs**

`README.md` line 17, replace the last sentence ("A level with no `observer` block is a level with no eye, and thirty-eight of the forty-three are exactly that.") with: "A level with no `observer` block is a level with no *veil*; the other thirty-eight carry the same eye in an `eye` block — where it sits, how big, on which side of the wall, how visible, and what it does (SHA-188) — so the Observer is on every level of the loop, and on none of them twice the same way."
`docs/ARCHITECTURE.md`, observer row: add "`LevelDefinition.eye` (`EyePlacement`): the other thirty-eight levels' posture; `grep -c '    eye: {' src/core/levels/levels.ts` counts them." Then `pnpm run fmt`.

- [ ] **Step 11: Hand over**

Set the ticket In Review. Report: what is on level 1, 3, 4, 6, 7; `level N` in the console to jump; DEMAKE via `power DEMAKE`. Wait for QA.

**Amended during execution (2026-09-19):** the user read SUNRISE's straight clip at the horizon as a graphics bug — a dune passed behind the sun while a line cut it. The clip stays a feature (KEYHOLE, BUNKER, FLOPPY will use it) but SUNRISE no longer uses it: `backgrounds.ts` gained a per-theme **foreground** (`FOREGROUNDS`, `paintForeground`, `BackgroundLayer.frontImageFor` / `monoFrontImageFor`) — the horizon's ground and dunes painted on a transparent sheet, drawn by the renderer and the still right after the behind-layer eye and before the wall. The sun sets behind the hills.

---

### Task 2: THE RISE — SUNRISE climbs as the wall falls, PYRAMID wakes at half

Ticket: *"THE RISE — SUNRISE rises a pixel a brick and wakes on the last; PYRAMID stares dead until half the pyramid is gone"*.

**Files:**
- Modify: `src/interfaces/types.ts` (`EyeAct`, `EyePlacement.act?`)
- Modify: `src/entities/effects/Observer.ts` (`EyeSight`, `fraction`, `posture`, `opacity`, `awake`, `step`)
- Modify: `src/core/ShatterGame.ts` (`wallSize`, `eyeSight()`, the `observer.step` call at line 1223, `buildLevel`)
- Modify: `src/core/levels/levels.ts` (SUNRISE, PYRAMID)
- Create: scratch `eye/t2-rise.mjs`

**Interfaces:**
- Consumes: Task 1's `EyePlacement`, `Observer.socket/opacity`.
- Produces: `EyeAct` union with `{ kind: "rise" }`; `EyeSight { wallFraction }`; `Observer.step(at, sight)`; `Observer.awake`.

- [ ] **Step 1: The failing check**

`scratchpad/eye/t2-rise.mjs`:

```js
import { withGame, onLevel, kill, ball, savePng, check } from "./harness.mjs";

await withGame(async (page) => {
  const fresh = await onLevel(page, 0, { ticks: 60, prepare: ball(60, 210) });
  check("SUNRISE starts low and dim", fresh.socket.y === 182 && fresh.opacity === 0.2, [fresh.socket.y, fresh.opacity]);
  check("SUNRISE dead stare: target on the socket, not the ball", fresh.target.x === 186 && fresh.target.y === 182, fresh.target);

  const half = await onLevel(page, 0, { ticks: 60, prepare: kill(30) + ball(60, 210) });
  check("SUNRISE halfway: y 149, opacity 0.6", half.socket.y === 149 && Math.abs(half.opacity - 0.6) < 1e-9, [half.socket.y, half.opacity]);
  check("SUNRISE still not awake at half", half.target.x === 186, half.target);
  savePng("t2-sunrise-half", half.png);

  const late = await onLevel(page, 0, { ticks: 60, prepare: kill(55) + ball(60, 210) });
  check("SUNRISE awake at 55/60: looking at the ball", late.target.x < 100, late.target);
  savePng("t2-sunrise-late", late.png);

  const apex = await onLevel(page, 2, { ticks: 60, prepare: kill(10) + ball(60, 210) });
  check("PYRAMID dead stare under half", apex.target.x === 186, apex.target);
  const woke = await onLevel(page, 2, { ticks: 60, prepare: kill(15) + ball(60, 210) });
  check("PYRAMID awake past half", woke.target.x < 100, woke.target);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node t2-rise.mjs` → "SUNRISE halfway" FAIL (y stays 182), the stare checks FAIL (it tracks from the start).

- [ ] **Step 3: The act type**

`src/interfaces/types.ts`, before `EyePlacement`:

```ts
/**
 * What a placed eye does. One branch per shared trick; a level names at most
 * one, and thirty-eight levels are built out of these few.
 */
export type EyeAct =
  // THE RISE: the eye rides the wall coming down. `to` is where the socket has
  // got to on the last brick, lerped by the fraction of the wall broken;
  // `wakeAt` is the fraction past which it tracks the ball — before it, a dead
  // stare straight out.
  { kind: "rise"; to?: { x?: number; y?: number; hw?: number; hh?: number; opacity?: number }; wakeAt?: number };
```

In `EyePlacement`, after `tint?`:

```ts
  // What it does, if anything. Absent means it sits there and watches.
  act?: EyeAct;
```

- [ ] **Step 4: The Observer reads the wall**

`src/entities/effects/Observer.ts`:

Import `EyeAct` too. After `EyeSocket`:

```ts
/** What the acts read off the level each tick. The game builds it; the eye never touches the grid. */
export interface EyeSight {
  /** How much of the wall is gone: 0 fresh, 1 on the last brick. */
  wallFraction: number;
}
```

Field: `private fraction = 0;` — reset to 0 in `load`.

Replace `get socket()`'s placement branch and `get opacity()`, add `awake` and `act`:

```ts
  get socket(): EyeSocket | null {
    if (this.definition) {
      return this.definition.eye;
    }
    const placed = this.placement;
    return placed ? this.posture(placed) : null;
  }

  get act(): EyeAct | null {
    return this.placement?.act ?? null;
  }

  get opacity(): number {
    const placed = this.placement;
    if (!placed) {
      return 1;
    }
    const base = placed.opacity ?? 1;
    const act = placed.act;
    if (act?.kind === "rise" && act.to?.opacity !== undefined) {
      return base + (act.to.opacity - base) * this.fraction;
    }
    return base;
  }

  /**
   * Whether the look follows the ball. Only THE RISE ever says no, and only
   * until its wall is far enough down: a dead stare is the tell that the eye
   * has not noticed you yet.
   */
  get awake(): boolean {
    const act = this.placement?.act;
    return act?.kind === "rise" && act.wakeAt !== undefined ? this.fraction >= act.wakeAt : true;
  }

  /** The placement's socket after its act has moved it this frame. */
  private posture(placed: EyePlacement): EyeSocket {
    const rest = { x: placed.x, y: placed.y, hw: placed.hw, hh: placed.hh };
    const act = placed.act;
    if (act?.kind === "rise" && act.to) {
      const f = this.fraction;
      return {
        x: Math.round(rest.x + ((act.to.x ?? rest.x) - rest.x) * f),
        y: Math.round(rest.y + ((act.to.y ?? rest.y) - rest.y) * f),
        hw: Math.round(rest.hw + ((act.to.hw ?? rest.hw) - rest.hw) * f),
        hh: Math.round(rest.hh + ((act.to.hh ?? rest.hh) - rest.hh) * f),
      };
    }
    return rest;
  }
```

`step(at, sight: EyeSight)`: after the `live` guard add `this.fraction = sight.wallFraction;` and change both `this.lookAt(at)` calls to `this.lookAt(this.awake ? at : null);` (null lands on the socket's centre).

- [ ] **Step 5: The game measures the wall**

`src/core/ShatterGame.ts`:
- field near `observer`: `private wallSize = 0;`
- `buildLevel`, right after `this.grid.load(...)`: `this.wallSize = this.grid.remaining;`
- line 1223: `if (this.observer.step(this.eyeTarget(), this.eyeSight()) && this.observer.level?.mode === "wrath") {`
- new method next to `eyeTarget`:

```ts
  /** What the eye's acts read off the level this tick (SHA-188). */
  private eyeSight(): EyeSight {
    return {
      wallFraction: this.wallSize > 0 ? 1 - this.grid.remaining / this.wallSize : 1,
    };
  }
```

Import `EyeSight` from `@entities/effects/Observer`.

- [ ] **Step 6: The data**

SUNRISE: `eye: { x: 186, y: 182, hw: 150, hh: 60, opacity: 0.2, act: { kind: "rise", to: { y: 116, opacity: 1 }, wakeAt: 0.9 } }` — sixty bricks, sixty-six pixels: a pixel a brick, and it notices you six bricks from the end.
PYRAMID (now in the sky over the apex at 0.35): `act: { kind: "rise", to: { opacity: 1 }, wakeAt: 0.5 }` — it brightens as the pyramid comes down and wakes at half.

**Rule of 43 (added 2026-09-19):** no two levels in the game share a disposition. Task 4's GATEWAY now rests half behind the left pillar (`x: 66, y: 42, hw: 30, hh: 9`) and patrols to half behind the right one (`to: { x: 306, y: 42 }`); Task 6's BOLT rests red at the bolt's tip in front and its `steps` run along the bolt's *edge*, not inside its bricks — re-cut both tasks' data and checks from the level data when starting them.

- [ ] **Step 7: Run the check and the six commands**

`node t2-rise.mjs` → all PASS; look at `t2-sunrise-half.png` and `t2-sunrise-late.png`. Six commands green.

- [ ] **Step 8: Hand over**

In Review. Report: level 1, break bricks, the sun rises and brightens and looks at you near the end; level 3 wakes at half.

---

### Task 3: THE BRICK EYE — SMILEY: it lives in the left eye and blinks over to the right

> **Landed in Task 1 on 2026-09-19**, at the user's request ("in a brick, the brick masks what overflows"): `EyePlacement.cells` is a *host*, not an act — the eye sits inside the first standing brick of the list, clipped to the brick's face (`cellSocket` / `cellWindow` in `Observer.ts`), and blinks into the next when its own dies (`stepHost`). SMILEY, PYRAMID and BOLT use it. Nothing below remains to build; Task 6's stairs advance `cellIndex` on the blink instead of a separate `steps` list.

Ticket: *"THE BRICK EYE — an eye that lives in bricks: SMILEY's left eye, and when those bricks are gone it blinks and opens in the right"*.

**Files:**
- Modify: `src/interfaces/types.ts` (`EyeAct` branch)
- Modify: `src/entities/effects/Observer.ts` (`EyeSight.standing`, `spotIndex`, `pendingSpot`, `posture`, `step`)
- Modify: `src/core/ShatterGame.ts` (`eyeSight`)
- Modify: `src/core/levels/levels.ts` (SMILEY)
- Create: scratch `eye/t3-brick.mjs`

**Interfaces:**
- Consumes: Task 2's `EyeSight`, `posture`.
- Produces: `{ kind: "brick"; spots }`; `EyeSight.standing(column, row)`.

- [ ] **Step 1: The failing check**

```js
import { withGame, onLevel, savePng, check } from "./harness.mjs";

const LEFT = "for (const [c, r] of [[2,0],[3,0],[2,1],[3,1]]) { game.grid.grid[r][c] = null; game.grid.remainingCount -= 1; }";

await withGame(async (page) => {
  const home = await onLevel(page, 1, { ticks: 5 });
  check("SMILEY eye on the left eye block", home.socket.x === 96 && home.socket.y === 50 && home.layer === "front", home.socket);

  const shutting = await onLevel(page, 1, { ticks: 3, prepare: LEFT });
  check("left eye gone: the lid is coming down where it was", shutting.socket.x === 96 && shutting.open < 1, [shutting.socket.x, shutting.open]);

  const moved = await onLevel(page, 1, { ticks: 20, prepare: LEFT });
  check("after the blink it is in the right eye, open", moved.socket.x === 276 && moved.open === 1, [moved.socket.x, moved.open]);
  savePng("t3-smiley-moved", moved.png);
});
```

- [ ] **Step 2: Run it to see it fail** — `node t3-brick.mjs` → the first check FAILs (no `eye` on SMILEY).

- [ ] **Step 3: The act type**

Add to `EyeAct`:

```ts
  // THE BRICK EYE: it lives in bricks. `spots` are groups of [column, row]
  // cells; it sits on the first group with a brick still standing, sized as
  // the placement says, and when its group is all gone it blinks and comes up
  // in the next one. With every group gone it stays in the last hole.
  | { kind: "brick"; spots: readonly (readonly (readonly [number, number])[])[] }
```

- [ ] **Step 4: The Observer hops on a blink**

`EyeSight` gains `standing(column: number, row: number): boolean;`.

Fields: `private spotIndex = 0;` and `private pendingSpot: number | null = null;` — both reset in `load` (0 / null).

In `posture`, before `return rest;`:

```ts
    if (act?.kind === "brick") {
      const spot = act.spots[this.spotIndex] ?? act.spots[0];
      const columns = spot.map(([column]) => column);
      const rows = spot.map(([, row]) => row);
      const { left, top, brickWidth, brickHeight } = gameConfig.grid;
      return {
        x: Math.round(left + ((Math.min(...columns) + Math.max(...columns) + 1) / 2) * brickWidth),
        y: Math.round(top + ((Math.min(...rows) + Math.max(...rows) + 1) / 2) * brickHeight),
        hw: rest.hw,
        hh: rest.hh,
      };
    }
```

In `step`, after `this.fraction = sight.wallFraction;`:

```ts
    this.stepBrick(sight);
```

and the hop lands at the blink's midpoint — inside the `if (this.blinkLeft > 0) { this.blinkLeft -= 1; ... }` branch add:

```ts
      if (this.pendingSpot !== null && this.blinkLeft === Math.floor(blinkTicks / 2)) {
        this.spotIndex = this.pendingSpot;
        this.pendingSpot = null;
      }
```

New private method:

```ts
  /**
   * THE BRICK EYE's move. Losing its bricks does not teleport it: the lid comes
   * down here and goes up there, so the hop is a blink and reads as one —
   * there is no frame in which the eye is nowhere, or in two places.
   */
  private stepBrick(sight: EyeSight): void {
    const act = this.placement?.act;
    if (act?.kind !== "brick" || this.pendingSpot !== null) {
      return;
    }
    const stands = (spot: readonly (readonly [number, number])[]): boolean =>
      spot.some(([column, row]) => sight.standing(column, row));
    if (stands(act.spots[this.spotIndex])) {
      return;
    }
    for (let ahead = 1; ahead < act.spots.length; ahead += 1) {
      const next = (this.spotIndex + ahead) % act.spots.length;
      if (stands(act.spots[next])) {
        this.pendingSpot = next;
        if (this.blinkLeft <= 0) {
          this.blinkLeft = gameConfig.observer.eye.blinkTicks;
          this.nextBlink = this.drawNextBlink();
        }
        return;
      }
    }
  }
```

- [ ] **Step 5: The game answers "standing"**

`eyeSight()` gains: `standing: (column, row) => (this.grid.rows[row]?.[column] ?? null) !== null,`.

- [ ] **Step 6: The data**

SMILEY (cells 2–3 × rows 0–1 are the left eye, 8–9 the right):

```ts
    // It lives in the smiley's left eye — over the four bricks, not behind
    // them — and when they are gone it blinks and opens in the right one.
    eye: {
      x: 96,
      y: 50,
      hw: 26,
      hh: 9,
      layer: "front",
      act: { kind: "brick", spots: [[[2, 0], [3, 0], [2, 1], [3, 1]], [[8, 0], [9, 0], [8, 1], [9, 1]]] },
    },
```

- [ ] **Step 7: Run the check and the six commands** → all PASS, look at `t3-smiley-moved.png`.

- [ ] **Step 8: Hand over** — In Review; report: level 2, clear the left eye, watch it blink across.

---

### Task 4: THE PATROL — GATEWAY: left–right in the sky, and it stops when the ball is through the gate

Ticket: *"THE PATROL — GATEWAY: the eye patrols between the pillars, and holds and stares while the ball is under the arch"*.

**Files:**
- Modify: `src/interfaces/types.ts` (`EyeAct` branch)
- Modify: `src/entities/effects/Observer.ts` (`EyeSight.ball`, `travel`, `travelDir`, `posture`, `stepPatrol`)
- Modify: `src/core/ShatterGame.ts` (`eyeSight`: nearest ball)
- Modify: `src/core/levels/levels.ts` (GATEWAY)
- Create: scratch `eye/t4-patrol.mjs`

**Interfaces:**
- Produces: `{ kind: "patrol"; to; speed; hold? }`; `EyeSight.ball: { x; y } | null`; `Observer.inside(rect, point)` helper (module function `insideRect`).

- [ ] **Step 1: The failing check**

```js
import { withGame, onLevel, ball, savePng, check } from "./harness.mjs";

await withGame(async (page) => {
  const start = await onLevel(page, 4, { ticks: 0 });
  const later = await onLevel(page, 4, { ticks: 100, prepare: ball(60, 210) });
  check("GATEWAY starts at the left pillar", start.socket.x === 96, start.socket);
  check("GATEWAY has walked right after 100 ticks", later.socket.x === 136, later.socket);
  const far = await onLevel(page, 4, { ticks: 700, prepare: ball(60, 210) });
  check("GATEWAY turned back before 700 ticks", far.socket.x < 276 && far.socket.x > 96, far.socket);

  const held = await onLevel(page, 4, { ticks: 100, prepare: ball(186, 120) });
  check("ball under the arch: it holds", held.socket.x === 96, held.socket);
  check("and stares at it", Math.abs(held.target.x - 186) < 30, held.target);
  savePng("t4-gateway-held", held.png);
});
```

- [ ] **Step 2: Run it to see it fail** — first check FAILs.

- [ ] **Step 3: The act type**

```ts
  // THE PATROL: back and forth between the socket and `to`, `speed` pixels a
  // tick, turning at each end; while a ball is inside `hold` it stops where it
  // is and watches.
  | { kind: "patrol"; to: { x: number; y: number }; speed: number; hold?: FieldRect }
```

- [ ] **Step 4: The Observer walks**

Module function after `eyePupilPoint`:

```ts
export function insideRect(rect: FieldRect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h;
}
```

`EyeSight` gains `/** The nearest ball in flight, or null on a serve. */ ball: { x: number; y: number } | null;`.

Fields `private travel = 0;` `private travelDir = 1;` reset in `load`.

`posture`:

```ts
    if (act?.kind === "patrol") {
      return {
        x: Math.round(rest.x + (act.to.x - rest.x) * this.travel),
        y: Math.round(rest.y + (act.to.y - rest.y) * this.travel),
        hw: rest.hw,
        hh: rest.hh,
      };
    }
```

`step`: `this.stepPatrol(sight);` after `stepBrick`.

```ts
  /** THE PATROL's walk: a fraction of the way from rest to `to`, back and forth. */
  private stepPatrol(sight: EyeSight): void {
    const placed = this.placement;
    const act = placed?.act;
    if (!placed || act?.kind !== "patrol") {
      return;
    }
    if (act.hold && sight.ball && insideRect(act.hold, sight.ball)) {
      return;
    }
    const length = Math.hypot(act.to.x - placed.x, act.to.y - placed.y) || 1;
    this.travel += (this.travelDir * act.speed) / length;
    if (this.travel >= 1) {
      this.travel = 1;
      this.travelDir = -1;
    } else if (this.travel <= 0) {
      this.travel = 0;
      this.travelDir = 1;
    }
  }
```

- [ ] **Step 5: The game hands over the ball**

`eyeSight()`:

```ts
    let nearest: { x: number; y: number } | null = null;
    let best = Number.POSITIVE_INFINITY;
    const socket = this.observer.socket;
    for (const ball of this.balls) {
      if (!ball.active) {
        continue;
      }
      const centre = { x: ball.centerX, y: ball.y + ball.size / 2 };
      const distance = socket ? (centre.x - socket.x) ** 2 + (centre.y - socket.y) ** 2 : 0;
      if (distance < best) {
        best = distance;
        nearest = centre;
      }
    }
    return { wallFraction: ..., standing: ..., ball: nearest };
```

- [ ] **Step 6: The data**

GATEWAY (pillars at columns 0–1 and 10–11; the arch's green shoulders at (2,1) and (9,1) leave x 96..276 clear at row 0–1, so the socket runs 126..246):

```ts
    // A sentry in the sky between the pillars, slow, left to right and back.
    // First level it moves on its own. Ball through the gate — under the arch
    // — and it stops and stares.
    eye: {
      x: 126,
      y: 46,
      hw: 30,
      hh: 10,
      act: { kind: "patrol", to: { x: 246, y: 46 }, speed: 0.4, hold: { x: 66, y: 62, w: 240, h: 100 } },
    },
```

(The Task 4 check's numbers follow: rest x 126, 100 ticks → 166, held → 126.)

- [ ] **Step 7: Run the check and the six commands.**
- [ ] **Step 8: Hand over** — In Review; report: level 5, watch it patrol, send the ball under the arch.

---

### Task 5: THE PULSE — HEART beats

Ticket: *"THE PULSE — HEART: the eye inside the heart swells and lets go on a beat"*.

**Files:**
- Modify: `src/interfaces/types.ts` (`EyeAct` branch)
- Modify: `src/entities/effects/Observer.ts` (`clock`, `beat`, `posture`)
- Modify: `src/core/levels/levels.ts` (HEART)
- Create: scratch `eye/t5-pulse.mjs`

- [ ] **Step 1: The failing check**

```js
import { withGame, onLevel, check } from "./harness.mjs";

await withGame(async (page) => {
  const widths = [];
  for (const ticks of [0, 6, 12, 30, 60]) {
    widths.push((await onLevel(page, 5, { ticks })).socket.hw);
  }
  check("HEART at rest 44, top of the beat 55 at tick 12, back to 44 at 60", widths.join() === "44,50,55,50,44", widths);
});
```

- [ ] **Step 2: Run it to see it fail** — `44,44,44,44,44`.

- [ ] **Step 3: The act type**

```ts
  // THE PULSE: the socket swells to `scale` of itself and lets go, every
  // `period` ticks. A thump — a fifth of the beat up, the rest down.
  | { kind: "pulse"; scale: number; period: number }
```

- [ ] **Step 4: The Observer beats**

Field `private clock = 0;` reset in `load`; in `step` after the `live` guard: `this.clock += 1;`.

```ts
  /** THE PULSE's phase, 0 at rest and 1 at the top of the thump. */
  private get beat(): number {
    const act = this.placement?.act;
    if (act?.kind !== "pulse") {
      return 0;
    }
    const phase = (this.clock % act.period) / act.period;
    return phase < 0.2 ? phase / 0.2 : 1 - (phase - 0.2) / 0.8;
  }
```

`posture`:

```ts
    if (act?.kind === "pulse") {
      const swell = 1 + (act.scale - 1) * this.beat;
      return { x: rest.x, y: rest.y, hw: Math.round(rest.hw * swell), hh: Math.round(rest.hh * swell) };
    }
```

- [ ] **Step 5: The data** — HEART: `eye: { x: 186, y: 74, hw: 44, hh: 16, act: { kind: "pulse", scale: 1.25, period: 60 } }`.

- [ ] **Step 6: Run the check and the six commands.**
- [ ] **Step 7: Hand over** — In Review; report: level 6, break into the heart and watch it beat.

---

### Task 6: THE STAIRS — BOLT: a step down per blink, and the strike at the bottom

Ticket: *"THE STAIRS — BOLT: the eye rides the lightning one stair a blink, and the screen flashes when it reaches the bottom"*.

**Files:**
- Modify: `src/interfaces/types.ts` (`EyeAct` branch)
- Modify: `src/entities/effects/Observer.ts` (`stepIndex`, `strikeEdge`, `struck`, `posture`, `step`)
- Modify: `src/core/config/GameConfig.ts` (`observer.strike`)
- Modify: `src/core/ShatterGame.ts` (`eyeFlash`, the strike, the view field)
- Modify: `src/render/CanvasRenderer.ts` (`RenderView.eyeFlash`, the flash draw)
- Modify: `src/core/levels/levels.ts` (BOLT)
- Create: scratch `eye/t6-stairs.mjs`

- [ ] **Step 1: The failing check**

```js
import { withGame, onLevel, savePng, check } from "./harness.mjs";

const BLINK = "game.observer.nextBlink = 1;";
const blinks = (n) => `for (let i = 0; i < ${n}; i += 1) { game.observer.nextBlink = 1; for (let t = 0; t < 20; t += 1) game.stepSimulation(); }`;

await withGame(async (page) => {
  const top = await onLevel(page, 7);
  check("BOLT starts at the top of the bolt", top.socket.x === 231 && top.socket.y === 44, top.socket);
  const one = await onLevel(page, 7, { prepare: blinks(1) });
  check("one blink, one stair down", one.socket.x === 201 && one.socket.y === 56, one.socket);
  const bottom = await onLevel(page, 7, { prepare: blinks(6) });
  check("six blinks: the bottom", bottom.socket.x === 81 && bottom.socket.y === 116, bottom.socket);
  const flash = await page.evaluate(() => window.__shatter.eyeFlash);
  check("the strike has flashed and is fading", flash > 0 && flash < 1, flash);
  savePng("t6-bolt-strike", bottom.png);
  const again = await onLevel(page, 7, { prepare: blinks(7) });
  check("seventh blink: back at the top", again.socket.x === 231, again.socket);
});
```

- [ ] **Step 2: Run it to see it fail** — first check FAILs.

- [ ] **Step 3: The act type and the knobs**

```ts
  // THE STAIRS: `steps` are spots, in order; every blink the eye moves to the
  // next, and when it lands on the last one, `strike` flashes the screen. Then
  // the next blink takes it back to the first.
  | { kind: "stairs"; steps: readonly (readonly [number, number])[]; strike?: boolean }
```

`GameConfig.observer`, after `eye`:

```ts
    /**
     * THE STAIRS' strike (SHA-188): the lightning reaching the ground. A white
     * frame that decays, and a rattle.
     */
    strike: {
      fadeTicks: 12,
      shakeTicks: 8,
    },
```

- [ ] **Step 4: The Observer climbs on the blink**

Fields `private stepIndex = 0;` `private strikeEdge = false;` reset in `load`.

```ts
  /** THE STAIRS reached the bottom this tick. An edge: true for one tick. */
  get struck(): boolean {
    return this.strikeEdge;
  }
```

`posture`:

```ts
    if (act?.kind === "stairs") {
      const [x, y] = act.steps[this.stepIndex] ?? act.steps[0];
      return { x, y, hw: rest.hw, hh: rest.hh };
    }
```

`step`: at the top `this.strikeEdge = false;`; where `blinked = true` is set, add:

```ts
      const act = this.placement?.act;
      if (act?.kind === "stairs") {
        this.stepIndex = (this.stepIndex + 1) % act.steps.length;
        this.strikeEdge = act.strike === true && this.stepIndex === act.steps.length - 1;
      }
```

- [ ] **Step 5: The game flashes**

`ShatterGame`: field `private eyeFlash = 0;` (0 in `buildLevel`). In `stepSimulation`, right after the `observer.step` line:

```ts
    if (this.observer.struck) {
      const { shakeTicks } = gameConfig.observer.strike;
      this.eyeFlash = 1;
      this.quake.rattle(shakeTicks, gameConfig.effects.quake.amplitude);
      this.deps.sfx.gazeFires();
    } else if (this.eyeFlash > 0) {
      this.eyeFlash = Math.max(0, this.eyeFlash - 1 / gameConfig.observer.strike.fadeTicks);
    }
```

View (in the `renderer.draw({...})` literal): `eyeFlash: this.eyeFlash,`.

`CanvasRenderer`: `RenderView` gains `// THE STAIRS' strike: a white frame over the field, 1 on the tick it lands, fading. eyeFlash: number;`. Draw it right before the blackout veil (`if (view.blackoutBlend > 0)` around line 3132):

```ts
    // THE STAIRS' strike: light over everything on the field. In DEMAKE a tube
    // has no white to fade — it is ink for the first half and gone.
    if (view.eyeFlash > 0 && (!this.demade || view.eyeFlash > 0.5)) {
      const { width, height } = gameConfig.field;
      this.ctx.save();
      this.ctx.globalAlpha = this.demade ? 1 : view.eyeFlash;
      this.ctx.fillStyle = this.demade ? canvasPalette.demakeInk : canvasPalette.deathFlash;
      this.ctx.fillRect(0, 0, width * SCALE, height * SCALE);
      this.ctx.restore();
    }
```

- [ ] **Step 6: The data**

BOLT (the diagonal, one cell centre per stair):

```ts
    // Rides the lightning: top of the bolt, one stair down the diagonal every
    // blink, and at the bottom the screen flashes. Over the bricks — it is the
    // charge running down them, not something behind the wall.
    eye: {
      x: 231,
      y: 44,
      hw: 13,
      hh: 4,
      layer: "front",
      act: {
        kind: "stairs",
        steps: [[231, 44], [201, 56], [171, 68], [171, 80], [171, 92], [126, 104], [81, 116]],
        strike: true,
      },
    },
```

- [ ] **Step 7: Run the check and the six commands.** Look at `t6-bolt-strike.png`.
- [ ] **Step 8: Hand over** — In Review; report: level 8; the flash and the rattle when it lands.

---

### Task 7: THE THROAT — CHOMP: ball in the mouth, the gaze fires down it

Ticket: *"THE THROAT — CHOMP: while the ball is in the mouth the eye charges and fires THE IRIS's gaze straight down the throat"*.

**Files:**
- Modify: `src/interfaces/types.ts` (`EyeAct` branch)
- Modify: `src/core/config/GameConfig.ts` (`observer.throat`)
- Modify: `src/core/ShatterGame.ts` (`stepThroat`, `stepGaze`'s column)
- Modify: `src/core/levels/levels.ts` (CHOMP)
- Create: scratch `eye/t7-throat.mjs`

**Interfaces:**
- Consumes: `Gaze.load(active, idleTicks)`, `Gaze.step(source, deckX)`, `Gaze.phase/active/x`, `Observer.act`, `insideRect`, `eyeSight().ball`.

- [ ] **Step 1: The failing check**

```js
import { withGame, onLevel, ball, savePng, check } from "./harness.mjs";

const gaze = (page) => page.evaluate(() => ({ active: window.__shatter.gaze.active, phase: window.__shatter.gaze.phase, x: window.__shatter.gaze.x }));

await withGame(async (page) => {
  await onLevel(page, 3, { ticks: 30, prepare: ball(60, 210) });
  check("ball outside the mouth: no gaze", (await gaze(page)).active === false, await gaze(page));

  await onLevel(page, 3, { ticks: 25, prepare: ball(186, 60) });
  const charging = await gaze(page);
  check("ball in the mouth: charging after the wind-up", charging.active && charging.phase === "charge", charging);
  const firing = await onLevel(page, 3, { ticks: 80, prepare: ball(186, 60) });
  const fire = await gaze(page);
  check("then firing, straight down the throat", fire.phase === "fire" && fire.x === 186, fire);
  savePng("t7-chomp-fire", firing.png);

  await page.evaluate(() => { const b = window.__shatter.balls[0]; b.x = 60; b.y = 210; for (let t = 0; t < 120; t += 1) window.__shatter.stepSimulation(); });
  check("ball gone: the shot finishes and the gaze is put away", (await gaze(page)).active === false, await gaze(page));
});
```

- [ ] **Step 2: Run it to see it fail** — "charging" FAILs (gaze never armed).

- [ ] **Step 3: The act type and the knob**

```ts
  // THE THROAT: while a ball is inside `zone`, THE IRIS's gaze is armed and
  // fires down the zone's middle — the deck under it turns to stone, as on the
  // veil. A shot that has started finishes; only a resting gaze is put away.
  | { kind: "gaze"; zone: FieldRect }
```

`GameConfig.observer`:

```ts
    /** THE THROAT (SHA-188): ticks between a ball entering the mouth and the charge starting. */
    throat: {
      idleTicks: 20,
    },
```

- [ ] **Step 4: The game arms and aims it**

`ShatterGame`, new method beside `stepGaze`, called just before it in the tick:

```ts
  /**
   * THE THROAT (SHA-188): the gaze is armed while a ball is in the mouth and
   * stood down once it is out — after the shot in flight, never during it.
   */
  private stepThroat(): void {
    const act = this.observer.act;
    if (act?.kind !== "gaze") {
      return;
    }
    const ball = this.eyeSight().ball;
    const inMouth = ball !== null && insideRect(act.zone, ball);
    if (inMouth && !this.gaze.active) {
      this.gaze.load(true, gameConfig.observer.throat.idleTicks);
    } else if (!inMouth && this.gaze.active && this.gaze.phase === "idle") {
      this.gaze.reset();
    }
  }
```

In `stepGaze`, the column the beam hunts:

```ts
    const act = this.observer.act;
    const column = act?.kind === "gaze" ? act.zone.x + act.zone.w / 2 : this.paddle.centerX;
    const started = this.gaze.step(from, column);
```

Import `insideRect` from `@entities/effects/Observer`.

- [ ] **Step 5: The data** — CHOMP: `eye: { x: 186, y: 68, hw: 40, hh: 14, act: { kind: "gaze", zone: { x: 126, y: 38, w: 120, h: 60 } } }` — the mouth is the four empty columns between the jaws.

- [ ] **Step 6: Run the check and the six commands.** Look at `t7-chomp-fire.png`: the beam down the throat.
- [ ] **Step 7: Hand over** — In Review; report: level 4, get the ball into the mouth and do not park the deck under it.

---

### Task 8: EVEN NINES — EYE and THE WRATH move to 35 and 36

> **Superseded on 2026-09-19 by EVERY FIVE (SHA-206, done):** the veils moved to 10 / 20 / 30 / 40, THE LID stays 43, `isBossLevel(index)` in `levels.ts`. The steps below are kept for the record only.

Ticket: *"EVEN NINES — every series ends on a nine: EYE and THE WRATH slide from 37/38 to 35/36"*.

**Files:**
- Modify: `src/core/levels/levels.ts` (move two entries with their comment blocks from after KEYHOLE to after PONG)
- Modify: `README.md:14`, `README.md:17` ("THE WRATH at 38" → 36), `docs/ARCHITECTURE.md` (veil row), the spec's status note
- Create: scratch `eye/t8-nines.mjs`

- [ ] **Step 1: The failing check**

```js
import { withGame, check } from "./harness.mjs";

await withGame(async (page) => {
  const names = await page.evaluate(async () => {
    const { LEVELS, VEIL_LEVELS } = await import("/src/core/levels/levels.ts");
    return { at: LEVELS.map((level) => level.name).slice(33, 39), veils: VEIL_LEVELS };
  });
  check("PONG, EYE, THE WRATH, PACHINKO, KEYHOLE, HOURGLASS", names.at.join() === "PONG,EYE,THE WRATH,PACHINKO,KEYHOLE,HOURGLASS", names.at);
  check("bosses on the nines: 8, 17, 26, 35, 42", names.veils.join() === "8,17,26,35,42", names.veils);
});
```

- [ ] **Step 2: Run it to see it fail** — `PONG,PACHINKO,KEYHOLE,EYE,THE WRATH,HOURGLASS`.
- [ ] **Step 3: Move the two entries** in `levels.ts`: cut the EYE block (its comment through its closing `},`) and THE WRATH's, paste both right after PONG's closing `},`. Backgrounds read cathode, nebula, observer, vault, grid, horizon — no two neighbours alike.
- [ ] **Step 4: Docs** — README line 14: "**THE WRATH** at 36"; the roster list order; ARCHITECTURE veil row; append to the spec's status: "EVEN NINES applied on <date>." Then `pnpm run fmt`.
- [ ] **Step 5: Run the check, `pnpm run check:backgrounds`, and the six commands.**
- [ ] **Step 6: Hand over** — In Review; report: `veil 4` now lands on level 36.

---

## Self-review

- **Spec coverage, series I:** SUNRISE (T1 posture + T2 rise/wake), SMILEY (T3), PYRAMID (T1 + T2 wake), CHOMP (T1 + T7), GATEWAY (T4), HEART (T1 + T5), VORTEX (T1), BOLT (T6), THE VEIL untouched. EVEN NINES (T8). Not in this plan: series II–V, the bestiary, the title eye that follows the mouse, the `duck`/`orbit`/`corridor`/`fall`/`exit` tricks — each series gets its own plan and the tricks land with the first level that needs them.
- **Placeholders:** none; every step carries its code or its exact command.
- **Type consistency:** `EyeSight` grows `wallFraction` (T2), `standing` (T3), `ball` (T4) — `eyeSight()` in the game is rewritten in T4 with all three. `posture(placed)` returns `EyeSocket` in every branch. `insideRect` is defined in T4 and used in T7. `Observer.act` is defined in T2 and read in T6/T7. `step(at, sight)` from T2 on; the WRATH call site is updated in T2.
