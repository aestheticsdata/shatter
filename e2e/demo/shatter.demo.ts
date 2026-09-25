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

/** How many catches the play chapter waits for, and how long a rally it wants regardless. */
const CATCHES_WANTED = 3;
/** Real time, not demo time: the game does not run faster at DEMO_SPEED=4. */
const PLAY_MS_MIN = 25_000;
const PLAY_MS_MAX = 60_000;
/** How long a launch is given to become a rally before the take says why it did not. */
const LAUNCH_MS_MAX = 4_000;
/** How long a ball GLUE has caught is held on the deck before the key that frees it. */
const STUCK_BEAT_MS = 700;

type Hook = { snapshot(): DemoSnapshot; autopilot(on: boolean): void };
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
async function walkPages(demo: Demo, counter: string): Promise<void> {
  const count = demo.page.getByTestId(counter);
  const pages = Number((await count.textContent())?.match(/\/(\d+)/)?.[1] ?? 1);
  await demo.dwell(2200);
  for (let pageNumber = 2; pageNumber <= pages; pageNumber++) {
    await demo.press("ArrowRight");
    await expect(count).toHaveText(`PAGE ${pageNumber}/${pages}`);
    await demo.dwell(1500);
  }
  await demo.press("ArrowRight");
  await expect(count).toHaveText(`PAGE 1/${pages}`);
  await demo.dwell(1000);
}

/**
 * The rally, on the autopilot: enough capsules caught and a rally worth
 * watching, a minute at most. A ball lost is filmed as one and served again by
 * key; a ball GLUE has stuck to the deck is freed by key after a beat, the way
 * a player clicks it off (the take once held one for the capsule's whole
 * twelve seconds, score frozen); a level cleared or a run over ends the chapter
 * where it is.
 */
async function play(demo: Demo): Promise<DemoSnapshot> {
  const startedAt = Date.now();
  let snapshot = await readSnapshot(demo.page);
  const elapsed = () => Date.now() - startedAt;
  while (elapsed() < PLAY_MS_MAX && (snapshot.capsulesCaught < CATCHES_WANTED || elapsed() < PLAY_MS_MIN)) {
    if (snapshot.screen === SCREEN.SERVE) {
      await demo.press(" ");
    } else if (snapshot.screen !== SCREEN.PLAY) {
      break;
    } else if (snapshot.ballsStuck > 0) {
      await demo.page.waitForTimeout(STUCK_BEAT_MS);
      await demo.press(" ");
    }
    await demo.page.waitForTimeout(250);
    snapshot = await readSnapshot(demo.page);
  }
  return snapshot;
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
  await walkPages(demo, "levels-count");
  await demo.click(page.getByTestId("levels-facts"));
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await demo.dwell(700);

  // ── Capsules ─────────────────────────────────────────────────────────────
  await demo.press("b");
  await expect(page.getByTestId("screen-capsules")).toBeVisible();
  await demo.chapter("Capsules");
  demo.shot("capsules", (still) => still.keyboard.press("b"));
  await walkPages(demo, "capsules-count");
  await demo.click(page.getByTestId("capsules-facts"));
  await expect(page.getByTestId("screen-title")).toBeVisible();
  await demo.dwell(700);

  // ── Bestiary ─────────────────────────────────────────────────────────────
  await demo.press("c");
  await expect(page.getByTestId("screen-bestiary")).toBeVisible();
  await demo.chapter("Bestiary");
  demo.shot("bestiary", (still) => still.keyboard.press("c"));
  await walkPages(demo, "bestiary-count");
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
  await demo.click(page.getByTestId("screen-serve"));
  await launch(page, (key) => demo.press(key));
  const outcome = await play(demo);
  expect(outcome.capsulesCaught, "the rally caught no capsule at all").toBeGreaterThan(0);
  console.log(
    `\n  play: ${outcome.capsulesCaught} caught (${outcome.trapsCaught} traps), score ${outcome.score}, ${outcome.lives} lives, ` +
      `${outcome.ballsInPlay} ball(s) in play, on "${outcome.screen}"`,
  );
  demo.shot("gameplay", prepareGameplay);
  await demo.dwell(1000);
});
