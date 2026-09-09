import { defineConfig, devices } from "@playwright/test";

/**
 * The portfolio demo run — a filming job, not a test one. It is the only
 * Playwright config in the repo, and it never runs a spec: see e2e/demo/README.md.
 *
 * One worker, no retries (half a retried take is worse than no take), a long
 * timeout because the run deliberately spends most of its time waiting, and
 * video at the exact viewport size, so no scaling ever touches the picture.
 *
 * One project and no setup: the take starts from a cold browser on the title
 * screen, and there is no account to put back the way the last take left it.
 * No locale or timezone pinned either — the game has one language and no dates.
 */

/** 1080p by default: native, 16:9, and nothing upscales on the way to a landing page. */
const viewport = {
  width: Number(process.env.DEMO_WIDTH ?? 1920),
  height: Number(process.env.DEMO_HEIGHT ?? 1080),
};

/**
 * Renders at twice the resolution and lets the encoder downsample into the same
 * frame. Supersampling: visibly crisper text, for CPU. It is the default
 * because `pnpm video:generate` should produce the best picture it can without
 * being asked — `DEMO_SCALE=1` is the way out if a slow machine drops frames.
 *
 * Here it is also what the stills are cut at: the 480x300 stage fills 1080p at
 * 3.56x, and at 2x one stage pixel is a block of seven device pixels.
 */
const deviceScaleFactor = Number(process.env.DEMO_SCALE ?? 2);

const chrome = {
  ...devices["Desktop Chrome"],
  viewport,
  deviceScaleFactor,
  launchOptions: {
    headless: process.env.DEMO_HEADED !== "1",
    args: ["--force-color-profile=srgb", "--hide-scrollbars"],
  },
};

export default defineConfig({
  testDir: "./e2e/demo",
  // Checks the app is actually up before a browser is launched, so a shut-down
  // dev server is reported as a shut-down dev server rather than as a timeout
  // on the title screen.
  globalSetup: "./e2e/demo/preflight.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 8 * 60_000,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5174",
    trace: "off",
    // Off unless asked for: the CDP recorder in `e2e/demo/recorder.ts` captures
    // the same screencast without the 25fps ceiling, and running both at once
    // would have two clients acking the same frames.
    video: process.env.DEMO_RECORDER === "playwright" ? { mode: "on" as const, size: viewport } : ("off" as const),
  },
  projects: [{ name: "demo", testMatch: /.*\.demo\.ts/, use: chrome }],
});
