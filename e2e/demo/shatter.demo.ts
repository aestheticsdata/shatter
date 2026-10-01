import { expect, test } from "@e2e/demo/fixture";
import { SCREEN } from "@interfaces/screens";

import type { DemoSnapshot } from "@core/DemoHook";
import type { Demo } from "@e2e/demo/fixture";
import type { Page } from "@playwright/test";

/**
 * Shatter, end to end — one continuous take, five chapters, five screens.
 *
 * This file is the storyboard and nothing else: no pointer paths, no video, no
 * timing arithmetic. Those live in `cursor.ts`, `fixture.ts` and `pacing.ts`,
 * so what is left here reads as a shot list and can be reordered by moving
 * blocks around.
 *
 * Three things it never breaks.
 *
 * KEYS WHERE THE GAME TAKES KEYS. There is no button for the LEVELS gallery,
 * the CAPSULES catalogue or the BESTIARY: the take presses `L`, `B`, `C` and
 * `→`, and the screen change is what the camera sees. Where the game takes a click — start, launch,
 * `CLICK TO RETURN` — the drawn cursor clicks.
 *
 * THE REAL MOUSE NEVER MOVES DURING PLAY. The click that launches the ball also
 * asks Chromium for pointer lock; whether headless grants it (the game then
 * reads deltas) or refuses it (absolute tracking), a real mouse move would
 * steer the deck a second time under the autopilot. The drawn cursor is put on
 * the deck from inside the page instead — `followPaddle` below, a synthetic
 * `mousemove` at the deck's own position every frame, which the game reads as
 * "stay" — and a ball lost is served again by key.
 *
 * IT WRITES NOTHING. The take ends mid-rally, before any GAME OVER, so no score
 * is ever committed; nothing is seeded; the score service is not even required
 * (`preflight.ts` says what the title's TOP SCORE line shows either way).
 *
 * IT ADDRESSES MARKS, NOT WORDS. Every element it touches carries a
 * `data-testid` in `index.html` — the same contract as the other four
 * harnesses — so the storyboard survives a change of label or of id. What is
 * drawn on the canvas is asserted through `window.__shatter.demo` — the dev
 * handle `src/main.ts` exposes on `pnpm dev`, see `src/core/DemoHook.ts` —
 * because the field is a canvas and a screenshot cannot be asked what it shows.
 */

/** How long a launch is given to become a rally before the take says why it did not. */
const LAUNCH_MS_MAX = 4_000;
/** How long a ball GLUE has caught is held on the deck before the key that frees it. */
const STUCK_BEAT_MS = 700;

type Hook = {
  snapshot(): DemoSnapshot;
  autopilot(on: boolean): void;
  level(levelNumber: number): void;
  drop(kinds: readonly string[]): boolean;
};
type Hooked = Window & { __shatter?: { demo: Hook | null } };

const NO_HOOK = "demo: no window.__shatter.demo on this page — is it the dev server's? (pnpm dev, never a build)";

function readSnapshot(page: Page): Promise<DemoSnapshot> {
  return page.evaluate((message) => {
    const demo = (window as Hooked).__shatter?.demo;
    if (!demo) throw new Error(message);
    return demo.snapshot();
  }, NO_HOOK);
}

function setAutopilot(page: Page, on: boolean): Promise<void> {
  return page.evaluate(
    ([enabled, message]) => {
      const demo = (window as Hooked).__shatter?.demo;
      if (!demo) throw new Error(message as string);
      demo.autopilot(enabled as boolean);
    },
    [on, NO_HOOK] as const,
  );
}

/** The run moved to this level, through the hook — the test console's `level`, off camera. */
function jumpToLevel(page: Page, levelNumber: number): Promise<void> {
  return page.evaluate(
    ([level, message]) => {
      const demo = (window as Hooked).__shatter?.demo;
      if (!demo) throw new Error(message as string);
      demo.level(level as number);
    },
    [levelNumber, NO_HOOK] as const,
  );
}

/** One capsule dropped down the middle of the field, through the hook — the console's `power`. */
function dropCapsule(page: Page, kind: string): Promise<boolean> {
  return page.evaluate(
    ([capsule, message]) => {
      const demo = (window as Hooked).__shatter?.demo;
      if (!demo) throw new Error(message as string);
      return demo.drop([capsule as string]);
    },
    [kind, NO_HOOK] as const,
  );
}

/**
 * For the landing page's film: a box on the field, noted in `events.json` as a
 * mark. The field is a canvas and has no element to mark, so a transparent one
 * is laid over the box for the length of the `mark` and taken off again. The
 * box is in stage pixels — the game's own, the snapshot's — and lands in CSS
 * pixels through the stage's scale, the way `followPaddle` places the cursor.
 */
async function markOnField(
  demo: Demo,
  testid: string,
  box: { x: number; y: number; width: number; height: number },
): Promise<void> {
  await demo.page.evaluate(
    ([id, x, y, width, height]) => {
      const stage = document.querySelector<HTMLElement>('[data-testid="stage"]');
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const scale = rect.width / stage.offsetWidth;
      const marker = document.createElement("div");
      marker.dataset.testid = id as string;
      marker.style.cssText =
        `position:fixed;pointer-events:none;left:${rect.left + (x as number) * scale}px;` +
        `top:${rect.top + (y as number) * scale}px;width:${(width as number) * scale}px;height:${(height as number) * scale}px`;
      document.body.appendChild(marker);
    },
    [testid, box.x, box.y, box.width, box.height] as const,
  );
  const marker = demo.page.getByTestId(testid);
  await demo.mark(marker);
  await marker.evaluate((node) => node.remove());
}

/** The deck and the air just above it, where a capsule is caught. */
function deckBox(snapshot: DemoSnapshot) {
  const { centerX, y } = snapshot.paddle;
  return { x: centerX - 40, y: y - 50, width: 80, height: 60 };
}

/** The lower half of the field's middle, where a capsule dropped through the hook falls to the deck. */
function laneBox(snapshot: DemoSnapshot) {
  const { left, right } = snapshot.field;
  const middle = (left + right) / 2;
  const bottom = snapshot.paddle.y + 20;
  return { x: middle - 50, y: bottom - 110, width: 100, height: 110 };
}

/**
 * Runs inside the page. Every frame, the drawn cursor is sent to where a hand
 * holding the deck where it is would be: a synthetic `mousemove` at the deck's
 * `pointerX`, which the cursor overlay follows and the game reads as no move at
 * all (absolute mode: the deck is already there; under pointer lock: a
 * synthetic event carries no `movementX`). Idle while the autopilot is off, so
 * installing it early costs nothing.
 */
function followPaddle(): void {
  const scope = window as Hooked & { __shatterFollow?: number };
  if (scope.__shatterFollow !== undefined) return;
  const stage = document.querySelector<HTMLElement>('[data-testid="stage"]');
  if (!stage) return;
  const frame = () => {
    scope.__shatterFollow = requestAnimationFrame(frame);
    const snapshot = scope.__shatter?.demo?.snapshot();
    if (!snapshot?.autopilot) return;
    const rect = stage.getBoundingClientRect();
    const scale = rect.width / stage.offsetWidth;
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: rect.left + snapshot.paddle.pointerX * scale,
        clientY: rect.top + (snapshot.paddle.y + 3) * scale,
      }),
    );
  };
  frame();
}

/** Polls the game's screen; names the likely cause when it never arrives. */
async function waitForScreen(page: Page, screen: DemoSnapshot["screen"], timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while ((await readSnapshot(page)).screen !== screen) {
    if (Date.now() > deadline) {
      throw new Error(
        `demo: the game never reached the "${screen}" screen — ` +
          "a launch that goes nowhere is pointer lock left pending, see README.md",
      );
    }
    await page.waitForTimeout(100);
  }
}

/**
 * The click that launches also asks for pointer lock, and the game holds the
 * launch until Chromium has answered. Headless answers one way or the other
 * within a moment; a launch still missing after that gets one more advance, by
 * key, before the take gives up and says so.
 */
async function launch(page: Page, press: (key: string) => Promise<void>): Promise<void> {
  try {
    await waitForScreen(page, SCREEN.PLAY, LAUNCH_MS_MAX);
  } catch {
    await press(" ");
    await waitForScreen(page, SCREEN.PLAY, LAUNCH_MS_MAX);
  }
}

/**
 * Every page of a menu screen at a reading pace, then one more turn: the roster
 * is a loop, and landing back on the first page says so before the take leaves.
 */
async function walkPages(demo: Demo, counter: string, card: string): Promise<void> {
  const count = demo.page.getByTestId(counter);
  const pages = Number((await count.textContent())?.match(/\/(\d+)/)?.[1] ?? 1);
  // For the landing page's film: the first card of every page, which it frames.
  const cards = demo.page.getByTestId(card);
  await demo.mark(cards.first());
  await demo.dwell(2200);
  for (let pageNumber = 2; pageNumber <= pages; pageNumber++) {
    await demo.press("ArrowRight");
    await expect(count).toHaveText(`PAGE ${pageNumber}/${pages}`);
    await demo.mark(cards.first());
    await demo.dwell(1500);
  }
  await demo.press("ArrowRight");
  await expect(count).toHaveText(`PAGE 1/${pages}`);
  await demo.dwell(1000);
}

/**
 * The levels the take plays, in order, and the capsule each one is handed. The
 * first is the one a run starts on; the others are reached through the hook.
 * DEMAKE is a trap the autopilot would step around, and is caught because the
 * film asked for it.
 */
const STAGES = [
  { level: 1, capsule: "M" },
  { level: 11, capsule: "D" },
  { level: 35, capsule: "GI" },
  { level: 22, capsule: "L" },
] as const;
/** Real time, not demo time: the game does not run faster at DEMO_SPEED=4. */
const RALLY_BEFORE_MS = 3_500;
const CATCH_MS_MAX = 6_000;
const DROP_ATTEMPTS = 3;
const RALLY_AFTER_MS = 6_000;

/**
 * The rally, on the autopilot, for this long: a ball lost is served again by
 * key; a ball GLUE has stuck to the deck is freed by key after a beat, the way a
 * player clicks it off; a level cleared is advanced past by key. `until`, when
 * given, ends it early. Returns the last snapshot, and stops dead on GAME OVER.
 */
async function rally(demo: Demo, ms: number, until?: (snapshot: DemoSnapshot) => boolean): Promise<DemoSnapshot> {
  const startedAt = Date.now();
  let snapshot = await readSnapshot(demo.page);
  while (Date.now() - startedAt < ms && !until?.(snapshot)) {
    if (snapshot.screen === SCREEN.SERVE || snapshot.screen === SCREEN.CLEAR) {
      await demo.press(" ");
    } else if (snapshot.screen === SCREEN.OVER) {
      break;
    } else if (snapshot.ballsStuck > 0) {
      await demo.page.waitForTimeout(STUCK_BEAT_MS);
      await demo.press(" ");
    }
    await demo.page.waitForTimeout(150);
    snapshot = await readSnapshot(demo.page);
  }
  return snapshot;
}

/**
 * One level: a rally, its capsule dropped down the middle and caught, the
 * effect played out. The two field marks are what the film frames — the lane
 * as the capsule falls, the deck as it is caught.
 */
async function playStage(demo: Demo, stage: (typeof STAGES)[number]): Promise<DemoSnapshot> {
  let snapshot = await rally(demo, RALLY_BEFORE_MS);
  // Dropped again when the deck had to let it go for the ball, a few times at most.
  for (let attempt = 1; attempt <= DROP_ATTEMPTS; attempt++) {
    const caught = snapshot.capsulesCaught;
    expect(await dropCapsule(demo.page, stage.capsule), `no room in the pool for ${stage.capsule}`).toBe(true);
    await markOnField(demo, "capsule-lane", laneBox(snapshot));
    // Its own catch, not any capsule's: the bricks drop theirs all through the rally.
    const ours = (now: DemoSnapshot) => now.capsulesCaught > caught && now.lastCaught === stage.capsule;
    snapshot = await rally(demo, CATCH_MS_MAX, ours);
    if (ours(snapshot)) {
      await markOnField(demo, "capsule-catch", deckBox(snapshot));
      break;
    }
    if (snapshot.screen === SCREEN.OVER) return snapshot;
    console.log(`\n  play: ${stage.capsule} on level ${stage.level} was not caught (try ${attempt})`);
  }
  return rally(demo, RALLY_AFTER_MS);
}

/**
 * The gameplay still: a rally with a capsule in the frame. The stills pass
 * revisits a fresh page, so the run is started again with plain Playwright,
 * and once a capsule is on its way the loop is stopped dead — the shutter then
 * finds the field exactly as it was, ball and pill mid-flight, with no PAUSE
 * overlay over it.
 */
async function prepareGameplay(page: Page): Promise<void> {
  await page.getByTestId("title-play-hint").click();
  await waitForScreen(page, SCREEN.SERVE, LAUNCH_MS_MAX);
  await setAutopilot(page, true);
  await page.getByTestId("screen-serve").click();
  await launch(page, (key) => page.keyboard.press(key));
  await page
    .waitForFunction(() => Boolean((window as Hooked).__shatter?.demo?.snapshot().capsulesFalling), undefined, {
      timeout: 25_000,
    })
    .catch(() => {
      // No drop in that time is a rally all the same; the still shows it.
    });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
}

test("shatter, one take", async ({ demo }) => {
  const { page } = demo;

  // ── Title ────────────────────────────────────────────────────────────────
  await demo.open("/");
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await demo.chapter("Title");
  demo.shot("title");
  await demo.dwell(2800);

  // ── Levels ───────────────────────────────────────────────────────────────
  await demo.press("l");
  await expect(page.getByTestId("screen-levels")).toBeVisible();
  await demo.chapter("Levels");
  demo.shot("level-select", (still) => still.keyboard.press("l"));
  await walkPages(demo, "levels-count", "level-card");
  await demo.click(page.getByTestId("levels-facts"));
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await demo.dwell(700);

  // ── Capsules ─────────────────────────────────────────────────────────────
  await demo.press("b");
  await expect(page.getByTestId("screen-capsules")).toBeVisible();
  await demo.chapter("Capsules");
  demo.shot("capsules", (still) => still.keyboard.press("b"));
  await walkPages(demo, "capsules-count", "capsule-card");
  await demo.click(page.getByTestId("capsules-facts"));
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await demo.dwell(700);

  // ── Bestiary ─────────────────────────────────────────────────────────────
  await demo.press("c");
  await expect(page.getByTestId("screen-bestiary")).toBeVisible();
  await demo.chapter("Bestiary");
  demo.shot("bestiary", (still) => still.keyboard.press("c"));
  await walkPages(demo, "bestiary-count", "creature-portrait");
  await demo.click(page.getByTestId("bestiary-facts"));
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await demo.dwell(700);

  // ── Play ─────────────────────────────────────────────────────────────────
  await demo.click(page.getByTestId("title-play-hint"));
  await expect(page.getByTestId("screen-serve")).toBeVisible();
  await demo.chapter("Play");
  await demo.dwell(900);
  await setAutopilot(page, true);
  await page.evaluate(followPaddle);
  // For the landing page's film: the field and the panel, framed in turn.
  await demo.mark(page.getByTestId("panel"));
  await demo.click(page.getByTestId("screen-serve"));
  await launch(page, (key) => demo.press(key));

  let outcome = await readSnapshot(page);
  for (const stage of STAGES) {
    if (stage.level !== outcome.levelNumber) {
      await jumpToLevel(page, stage.level);
      await waitForScreen(page, SCREEN.SERVE, LAUNCH_MS_MAX);
    }
    const reached = await readSnapshot(page);
    await demo.chapter(reached.levelName);
    outcome = await playStage(demo, stage);
    if (outcome.screen === SCREEN.OVER) break;
  }
  expect(outcome.capsulesCaught, "the rally caught no capsule at all").toBeGreaterThan(0);
  console.log(
    `\n  play: ${outcome.capsulesCaught} caught (${outcome.trapsCaught} traps), score ${outcome.score}, ${outcome.lives} lives, ` +
      `on level ${outcome.levelNumber} "${outcome.screen}"`,
  );
  demo.shot("gameplay", prepareGameplay);
  await demo.dwell(1000);
});
