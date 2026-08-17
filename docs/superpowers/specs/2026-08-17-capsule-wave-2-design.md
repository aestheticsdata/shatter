# Capsule wave 2 — catch feedback, rarity retune, four new power-ups

Tickets: SHA-29 (feedback + bug fixes), SHA-30 (tuning), SHA-31 (new capsules).
Driven by QA feedback (2026-08-17): "some caught capsules do nothing" and "I have
never seen the all-bricks-explode bonus".

## Findings that shaped the design

A 7-agent audit plus live CDP testing of all 11 capsule pipelines found no dead
mechanics. The reports trace to:

- Zero catch acknowledgment: PAYDAY/BLAST/PIERCE are passive, and every re-catch
  of an active effect is an invisible timer refresh. The only feedback was a
  quiet chime and a 7px panel label.
- Silent-consumption windows: a capsule caught the same tick as a NUKE was
  eaten with no effect and no sound; capsules frozen by a level-clear or
  detonation freeze were wiped invisibly.
- Two real bugs found in passing: laser kills were classified as ball kills
  (LASER+BLAST chain-exploded neighbors, which the `source` parameter existed
  to prevent), and gameOver() leaked timers/wall charge onto the end screen.
- NUKE starvation, measured over the real 15-level census (548 bricks): at
  weight 0.3/9.1 and dropRate 0.13, ~2.35 NUKE capsules drop per full run — a
  3-level session has a 62% chance of showing none.

## SHA-29 — every catch acknowledges itself

- `CatchPop` floating labels rise from the paddle on every applied capsule
  (green; JAMMER pink). Pops keep animating through detonation/clear freezes
  and are flushed on serve reset, level clear and game over.
- `DropPool.step`'s `onCatch` now returns consumed/refused: a capsule refused
  because a NUKE already fired stays live and visibly freezes with the field.
- Laser kills pass `source: "laser"` — capsule drops still roll, BLAST no
  longer chains off laser kills.
- `gameOver()` resets timers, wall charge and pops.
- M and B capsule letters switch to the dark style (contrast was under 3:1).
- Dev-only `window.__shatter` handle in main.ts for QA tooling.

## SHA-30 — rare-but-real (GameConfig only)

dropRate 0.13→0.15; weights N 0.3→0.65, S 0.3→0.5 (NUKE ~1 per 2.7 levels,
still the rarest timed-power class); maxDrops 3→6 (3 airborne capsules used to
suppress all further spawns — constant at ?droprate=1); particlePoolSize
512→1024 (FINALE's full-field nuke needs ~720 concurrent debris chunks).

## SHA-31 — four new capsules

| Letter | Name | Effect | Weight |
|---|---|---|---|
| U | 1UP | +1 life, capped at 6 total (5 reserve bars fit the panel) | 0.25 |
| Z | ZAP | vaporizes the bottom-most occupied row: full points, silver/gold die outright, no capsule drops, no BLAST chaining | 0.6 |
| R | RAIN | 4 capsules spread across the top of the field; kinds re-rolled without R so rains never chain | 0.5 |
| G | GLUE | 12 s: balls stick to the paddle on contact; click/Space releases all with a normal paddle bounce; expiry auto-releases | 1 |

Implementation reuses the existing pipeline end to end: PowerUpKind letters,
weighted roll, DropPool, PowerUpTimers (G is the only timed one), catch pops,
POWER label, palette (U pink, Z cyan, R violet, G amber; U/Z dark letters).
GLUE stores `stuckOffsetX` on the ball; stuck balls ride the paddle (offset
re-clamped if width changes) and every release path goes through one
`releaseStuckBalls()`. ZAP mirrors nuke-kill semantics per brick. 1UP gets its
own rising arp in the SoundBank. Lives bars shrank 20→16px so the 1UP cap fits
the 108px panel.

Alternatives considered and dropped: twin paddle and magnet (input/renderer
complexity out of proportion for a QA-breadth request), permanent floor (WALL
already owns that fantasy as a one-shot), score-bomb (PAYDAY covers score play).

## Verification

All via real-Chrome CDP driving the live dev build, using the real falling-drop
catch path: 11/11 pre-existing kinds regression, 5/5 SHA-29 behavior checks,
7/7 SHA-31 checks (including 2000-roll distribution reaching all 15 kinds),
plus typecheck, oxlint, oxfmt.
