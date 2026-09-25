# Demo films

One Playwright run that drives the game the way a hand would — and, once the ball is served, plays
it — records it as a single continuous video, and writes the chapter list beside it. No editing: the
take _is_ the video, and the chapter file is what goes in the description.

```bash
pnpm video:generate
```

Output lands in `e2e/demo/out/` (gitignored):

- `shatter-demo.mp4` — the take, h264, at the exact viewport size, no scaling, with the chapters
  written into the file itself
- `chapters.txt` — `0:00 Title` per line, for a human to read
- `chapters.vtt` — WebVTT, for `<track kind="chapters">` on the portfolio's own `<video>`
- `chapters.ffmeta` — ffmpeg metadata; already applied to the mp4, kept so a re-encode can reapply it
- `chapters.json` — the same marks with millisecond precision
- `shots/01-title.png` … `04-gameplay.png` — stills at 3840×2160, named for the landing page's inbox

This is a port of PFA's harness, which is a port of Trekker's, of Zeus's, of Spira's. `pacing.ts`, `recorder.ts`, `chapters.ts` and `cursor.ts` are byte-identical to PFA's; `fixture.ts` is PFA's with exactly two strings changed, the output file names (`shatter-demo.mp4`, `shatter-demo.webm`) — the one place the shared fixture knows which project it is in. It also carries PFA's `Demo.glide`, unused here, and PFA's `hideDevChrome()`, whose Next selectors match nothing on Vite — which floats nothing over the page, so the no-op is the right behaviour;
`preflight.ts` and `playwright.demo.config.ts` are the same files with the Shatter-specific parts
changed; `demo.setup.ts` is not ported, there being no account to put back. The full write-up of how
it works and why — the CDP screencast, the drawn pointer, the encode, and every trap found building
it — is `front/e2e/demo/HOW-TO-FILM-A-DEMO.md` in the Spira repo. Only `shatter.demo.ts` knows what
Shatter is.

Two things keep the five shared files byte-identical in a repo that formats with oxfmt and lints
with oxlint: both tools ignore them by name (`.oxfmtrc.json`, `.oxlintrc.json`), and
`e2e/demo/package.json` marks this folder CommonJS — `fixture.ts` uses `__dirname`, which the ES
module the rest of the repo is does not have, and Playwright decides how to load a `.ts` file from
the nearest `package.json`. pnpm does not see that file as a workspace package (`pnpm-workspace.yaml`
lists none).

## What it needs before it will record

`preflight.ts` refuses to launch a browser until the first is true, and says so. The rest it cannot
check.

1. **Shatter's dev server on `localhost:5174`, and it must be Shatter.** `pnpm dev`, in a shell of
   your own — the harness films the app, it never starts it. The port is pinned in `vite.config.ts`
   (`strictPort`), because 5173 is Vite's default for every project on this machine and the first
   dry run of this harness found another project's login form there. Preflight fetches the page and
   wants `<title>SHATTER</title>` in it; `E2E_BASE_URL` points it elsewhere. The dev server and not a
   build, on purpose: the take drives the game through `window.__shatter.demo`, the dev-only handle
   (`src/main.ts`, `src/core/DemoHook.ts`) that `import.meta.env.DEV` keeps out of production
   bundles — `pnpm build` then `grep DemoHook dist/assets/*.js` finds nothing.
2. **ffmpeg on `PATH`** with libx264, the mp4 muxer and the `concat` demuxer — `brew install ffmpeg`,
   or `DEMO_FFMPEG` pointing at one.
3. **The machine online.** Both faces, Press Start 2P and Silkscreen, come from Google Fonts, and
   `settle()` in `fixture.ts` waits for every stylesheet the document asked for and for
   `document.fonts.ready` before a frame is kept — offline it refuses, rather than filming the
   fallback font at 4K.

**Not needed: the score service.** Nothing on camera reads it but the title's `TOP SCORE` line, and
that line has an answer either way — the classic board (`012500 · AMI`) from a cold browser while
the service is down, the top row of `server/data/shatter.db` while `pnpm api` is up. Preflight
prints which of the two the take will show, so a database full of test initials is not a surprise
on the film. Nothing is seeded, and nothing is written: the take ends mid-rally, before any GAME
OVER, so no score is ever committed.

## The take

Five chapters, one per screen, at the default `DEMO_SPEED=1`.

|          |                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title    | the copper bars, the wordmark, a beat                                                                                                                                                                                                                                                                                                                  |
| Levels   | `L`; every page of the gallery at a reading pace — `→` seven times for 37 layouts on seven pages, the seventh turn landing back on page 1 because the roster is a loop; `CLICK TO RETURN` clicked                                                                                                                                                      |
| Capsules | `B`; the same walk through the eight pages of 47 capsules, commons first and the ten traps last; clicked back to the title                                                                                                                                                                                                                             |
| Bestiary | `C`; the eighteen cards, one creature a page, alive at three times its size — the species in the order a player meets them and the four bosses last; clicked back to the title                                                                                                                                                                         |
| Play     | the title clicked, the serve screen, the click that launches; then SUNRISE on the autopilot with the drawn cursor riding the deck: at least twenty-five seconds of rally and three capsules caught — each label rising off the deck, each effect arriving — sixty seconds at most. A ball lost is served again by key. The film stops there, mid-rally |

Every element the storyboard touches carries a `data-testid` in `index.html` — the screens, the
title's play hint, the two menu footers' counters and `CLICK TO RETURN` lines, the stage, the panel,
the initials entry line for a beat not yet filmed — the same contract as the other four harnesses,
so the storyboard survives a change of label or of id. The ids stay the game's own (`main.ts`
resolves them and throws when one is missing).

Every beat is asserted through `window.__shatter.demo.snapshot()` — the screen after each key and
click, the page counter after each turn, the catch count before the take ends — because the field
is a canvas and a screenshot cannot be asked what it shows. A take that caught nothing fails rather
than shipping a rally with nothing in it.

## The autopilot

`src/core/DemoHook.ts`, constructed behind `import.meta.env.DEV` in `ShatterGame` and reachable as
`window.__shatter.demo`: `autopilot(true)` switches it on, `snapshot()` reads the run. There was no
autoplay in the tree before this ticket — the "autoplayed runs" the KEYHOLE and EYE comments in
`levels.ts` quote came from a tool that was never committed — so this is the one there is, and it is
the one to reuse for tuning a level.

It writes one thing, the deck's position, through the same path a mouse move takes
(`ShatterGame.steerTo`), so it can never do anything a mouse could not: score, lives, drops, timers
and the RNG stay the game's. It keeps the deck under the ball that will reach it first, walls folded
in; when no ball is on its way down it drifts under the nearest capsule it can reach in time and
still be back for the ball — never a trap, which it steps around instead when the ball leaves it the time (a trap landing while the ball is due inside twenty ticks is taken: a life costs more); it moves at 6 px a tick rather than teleporting; and it takes the ball at a slowly sweeping spot on the deck, because a fixed spot locks a rally into the same three bounces forever. The snapshot counts the catches and, of those, the traps, so a take says what it caught.

## The stills

`demo.shot("name", prepare?)` marks four screens. It takes no picture at the time — the pictures are
taken at the very end, once the recorder has stopped and the mp4 is closed, by sending the same page
back to `/` and walking the state machine from the title with plain Playwright: nothing for the
title, `L` for the gallery, `B` for the catalogue, and for the gameplay still two clicks, the
autopilot, a wait for a capsule to be on its way, then the animation loop stopped dead
(`requestAnimationFrame` replaced) so the shutter finds the field exactly as it was — ball and pill
mid-flight, and no PAUSE overlay, which is what pausing the game would have put over it. They come
out at 3840×2160, lossless PNG, the harness's overlays painted out.

They are upscaled pixel art and must read as such: the 480×300 stage fills 1080p at 3.56×, twice
that at the capture scale, so one stage pixel is a block of seven device pixels (eight, every
seventh column). Nearest-neighbour is what the canvas asks for (`image-rendering: pixelated` in
`css/layout.css`) and what the stills show — a smoothed edge on a brick would be a regression in the
scaler, not in the harness.

The landing page's importer (`pnpm import-shots` in `landing-page/`) files them by name, so the five
are named for it: `gameplay`, `level-select` and `capsules` replace the shots the Shatter block
already declares, in place; `title` and `bestiary` are new and append. `gameplay` stays first — it is the card's
thumbnail.

## Shatter-specific traps

**The wrong app on the port.** Vite takes the next port up when its default is busy, silently: a
take pointed at `localhost:5173` filmed a login form once. Shatter's dev server is pinned to 5174 and
refuses to start anywhere else, and preflight reads the page it is about to film.

**Pointer lock is refused, and that is fine.** Headless Chromium answers `requestPointerLock()` with
a rejected promise (`WrongDocumentError`) and a `pointerlockerror`, both variants, every time. The
game's `InputController` counts two refusals before a lock has ever been held and degrades to
absolute tracking; the title click is the first request and the launch click the second, so the
launch goes through on the click that asked for it, and the tick gate that pauses an unlocked run
(`lockExpected`) is off from then on. `launch()` in the storyboard still gives a launch four seconds
and one more advance by key, and names this file when neither works — a Chromium that leaves the
promise pending would leave the game holding the launch.

**The real mouse never moves during play.** Whether the lock is held (the game reads `movementX`)
or refused (it reads `clientX`), a real move would steer the deck a second time under the
autopilot. `followPaddle` in the storyboard runs inside the page and sends a synthetic `mousemove`
to the deck's own position every frame: the drawn cursor follows it — the overlay listens to any
`mousemove` — and the game reads it as no move at all, an absolute position it is already at, or a
delta of zero. A ball lost is served again with Space, not a click.

**GLUE holds the ball until a click.** A glued ball is freed by an advance — a click, or Space —
and nothing else; the autopilot steers, it never clicks. The play loop reads `ballsStuck` off the
snapshot and sends Space after a beat, the way a player clicks the ball off the deck. Before that
the second take sat twelve seconds on a stuck ball, score frozen, for the whole of the capsule.

**Demo time is not game time.** `DEMO_SPEED` scales the dwells and the pointer, never the
simulation, so the play chapter takes as long at `DEMO_SPEED=4` as at 1 — a dry run is shorter only
in the menus. The chapter's own clock (`PLAY_MS_MAX`) is real time for the same reason.

**`animations: "disabled"` freezes CSS, not canvas.** The still pass fast-forwards the copper bars
and holds the blinking hints, which is what the option is for; the field is repainted by
`requestAnimationFrame` and pays it no attention, which is why the gameplay still stops the loop
itself.

**The catalogue paints on first sight.** 47 miniatures of the real field, once, when `B` is first
pressed — a beat, not a stall, and `demo.press` settles before the chapter mark lands.

## What this run actually measured

On an 8-core M1, at 1920×1080 with the default 2× supersampling, `pnpm dev` and `pnpm api` up.

|               |                                                                                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The take      | 68.6 s, 4 chapters (Title 0:00, Levels 0:03, Capsules 0:21, Play 0:40), **2046 frames at 29.8 fps** over the whole — the menus sit still between page turns and drop the average; a take that is mostly rally (the `DEMO_SPEED=4` dry run) came in at 46 fps, which is what the play chapter runs at |
| The file      | **4.60 MB**, h264, 1920×1080, chapters inside it                                                                                                                                                                                                                                                     |
| Stills        | 4 × 3840×2160 PNG, 49–75 KB each — flat pixel art compresses to nothing                                                                                                                                                                                                                              |
| The rally     | 28 s, 10 capsules caught (one trap, taken while the ball was due), score 8560, 3 lives kept, one ball in play when the film stopped. The two takes before it, same storyboard, caught 4 and 5: the drops are the game's RNG                                                                          |
| Repeatability | the three menu stills came out byte-identical across three runs; the rally never repeats (the drops are the game's RNG), and the play chapter's length varies with it inside its 25–60 s window                                                                                                      |
| 1× against 2× | `DEMO_SCALE=1` delivered 50.5 fps against 46 at 2× on the same storyboard — four frames a second is not worth losing the supersampling, so 2× stays the default                                                                                                                                      |
| The wrong app | the first dry run found another project's login form on 5173 and filmed nothing: Vite had put Shatter on the next port up. Hence the pinned port, and a preflight that reads the page                                                                                                                |

## Knobs

The same as PFA's, all environment variables: `DEMO_SPEED`, `DEMO_HEADED=1`, `DEMO_WIDTH` /
`DEMO_HEIGHT`, `DEMO_SCALE=1`, `DEMO_TITLES=on`, `DEMO_CURSOR=off`, `DEMO_FPS`, `DEMO_CRF`,
`DEMO_FFMPEG`, `DEMO_RECORDER=playwright`, `E2E_BASE_URL` (default `http://localhost:5174`), plus
`DEMO_API_URL` (default `http://127.0.0.1:7000` — reported by preflight, never required).

## What this ticket changed outside the harness

- `src/core/DemoHook.ts`, new: the autopilot and the snapshot. `src/core/ShatterGame.ts`: the `demo`
  field behind `import.meta.env.DEV`, a `capsulesCaught` count on the catch path, the autopilot's
  step at the top of the tick, and `steerTo()` factored out of `pointToStage()` so both hands use
  one path. `src/entities/powerups/DropPool.ts`: `DROP_WIDTH` exported beside `DROP_HEIGHT`.
- `vite.config.ts`: the dev server pinned to 5174, `strictPort`.
- `package.json`: `video:generate`, `@playwright/test`. `tsconfig.json`: the `@e2e/*` alias, and
  `e2e/` plus the config in `include`. `.oxfmtrc.json` / `.oxlintrc.json`: the five shared files
  ignored by name. `.gitignore`: `e2e/demo/out/`, `test-results/`.
