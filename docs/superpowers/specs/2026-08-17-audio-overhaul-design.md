# Chip-deluxe SFX overhaul — design

**Date**: 2026-08-17
**Ticket**: SHA-26 in the Spira `Shatter` project.
**Direction**: "CHIP DELUXE" — chosen by ear on the audition page (`.superpowers/brainstorm/`), against "arcade punch" and "soft retro" candidates.

## Goal

Every interaction currently plays the same kind of sound: a single square-wave `beep()` at a different pitch. Paddle, walls, bricks, laser and capsules are indistinguishable in character. Replace the twelve raw `beep`/`arp` call sites with a per-event **sound bank** in an evolved Amiga-chiptune style: still square waves, but with pitch bends, detuned oscillator pairs and filtered noise bursts. 100 % WebAudio synthesis — no audio assets, no runtime dependencies, matching the project as it stands.

**Non-goals**: music (title or in-game — its own ticket if ever), sampled assets, AudioWorklets, keyboard volume control (mouse fader only — see below).

## Volume fader (QA addition)

Added during user QA (the original spec listed a volume control as a non-goal; the user reversed that, mouse-only):

- A `VOL` fader row in the side panel under the `M · SOUND ON` hint — a styled `<input type="range">` (0–100, step 10), Workbench look: inset track, raised gadget knob, cursor restored over it (the `body` hides the cursor).
- The **whole VOL row** (`#panelVolume` label — text, gap, and input) stops `mousedown` propagation: the document-level handler both advances screens and grabs pointer lock, and fader interaction must do neither. Guarding only the 62×8 px input left the label text as a trap that resumed the run with the cursor locked away (adversarial-review finding). The fader blurs itself on `change` so keys stay reserved for the game.
- Under pointer lock the cursor doesn't exist, so the fader is reachable whenever the cursor is free: title, pause, before launch. Inherent to a mouse control.
- Plumbing: `Sound.setVolume(0..1)` scales the master gain (`MASTER_GAIN × volume`) **ahead of the compressor**, preserving relative recipe levels and limiter behavior; `SoundBank.setVolume` persists to `localStorage` (`shatter.volume.v1`, clamped on read) and plays a 90 ms-throttled feedback blip at the new level. Mute stays independent.
- Wiring: `Panel.bindVolume(initial, onChange)` in `main.ts` — volume never routes through `ShatterGame` or `PanelView`; the fader's position is the whole UI state.

## Architecture

Engine and content split into two modules under `src/audio/`:

```text
ShatterGame ──(typed events)──▶ SoundBank ──(primitives)──▶ Sound ──▶ WebAudio graph
                                  content                    engine
```

### `Sound.ts` — the engine (existing file, extended)

Keeps everything SHA-18 established: AudioContext creation inside the first gesture's call stack, `resume()` retry, the 30 Hz keep-warm oscillator, mute, schedule-ahead starts, linear attack ramps, peak hold, exponential decay, try/catch-silent everywhere. Audio failure must never touch the game loop.

Grows from one primitive to three:

- `tone(spec)` — one oscillator. `ToneSpec`: `type` (default `"square"`), `freq`, optional `freqEnd` (exponential ramp over the duration), `dur`, `vol`, `delayS`, `detuneCents`. The current `beep()` envelope (attack → hold at peak for half the duration → exponential decay) is the `tone` envelope.
- `noise(spec)` — a white-noise buffer through a biquad filter. `NoiseSpec`: `dur`, `vol`, `delayS`, and `filter: { type, freq, freqEnd?, q? }`.
- `arp(notes, stepMs, voice?)` — unchanged timing contract (first note synchronous for gesture unlock); each note now renders through `tone`, and the optional `voice` (oscillator type, detune-pair on/off, vol) lets jingles use detuned square pairs or saw layers without new primitives.

**Master chain**: all voices connect to a shared `masterGain (0.9) → DynamicsCompressorNode → destination` instead of `destination` directly. Compressor settings (starting point): threshold −12 dB, knee 10, ratio 6, attack 3 ms, release 150 ms. It is a safety limiter for voice pile-ups (BLAST, multi-ball), inaudible in normal play. The keep-warm oscillator keeps its direct connection to `destination`, exactly as today.

**Mute is enforced twice**: new voices are skipped at schedule time (as before), and `toggleMuted()` also zeroes the master gain — an `arp` commits all its notes to the audio clock up front, so without the gain gate a game-over jingle would ring on for ~0.5 s after M (adversarial-review finding).

### `SoundBank.ts` — the content (new file)

One typed method per game event — no strings, no raw frequencies in game code. Each method composes 1–3 primitive calls. `SoundBank` wraps a private `Sound` and re-exposes `muted` / `toggleMuted()`.

`ShatterGame`'s dependency changes from `sound: Sound` to `sfx: SoundBank`; `main.ts` wires `new SoundBank()`. `Panel`'s mute hint reads through the same view field as today.

**Retrigger guard**: the bank keeps a per-event last-played timestamp and drops a repeat of the _same_ event within 30 ms (about two ticks). With three balls, one tick can fire the same event several times, which today doubles volume and phases. Gameplay events only; screen jingles cannot retrigger anyway.

### Rejected alternatives

- **ZzFX (vendored micro-library)**: fast variety, but the project's first runtime dependency, a different sound character than the validated sketches, and clumsy per-event pitch modulation.
- **Pre-rendered buffers (OfflineAudioContext)**: cheapest playback, but `playbackRate` couples pitch to duration, killing continuous pitch variation (paddle position, brick row). Live node creation is not a bottleneck at this scale.

## Event map and recipes

All numeric values are **starting points** transcribed from the audition sketches; final tuning happens by ear in-game during QA. `dur` in ms.

| Bank method                 | Call site (today)                | Recipe                                                                                                                                |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `wallBounce()`              | 3× `beep(240)`                   | square 300→240, 40 ms, vol 0.05 — slight _down_-bend, reads as a dead surface                                                         |
| `paddleBounce(relativeHit)` | `beep(420 + rel·90)`             | base = 330 + rel·80; square base→base·1.58, 70 ms, vol 0.07 + same tone +15 cents, vol 0.05 — _up_-bend, position still maps to pitch |
| `brickArmored()`            | `beep(180)`                      | square 210→180, 50 ms, vol 0.08 + high-pass 3000 noise tick, 30 ms, vol 0.08 — dull metallic clank                                    |
| `brickDestroyed(row)`       | `beep(560 + (5−row)·45)`         | base = today's row formula; square base·1.15→base·0.55, 90 ms, vol 0.08 + high-pass 2500 noise burst, 50 ms, vol 0.12                 |
| `laserFire()`               | `beep(880)`                      | square 1700→320, 90 ms, vol 0.06 + square 2500→480, 70 ms, vol 0.03 — pew                                                             |
| `energyWallBounce()`        | `beep(320)`                      | square 140→320 _up_, 120 ms, vol 0.06 + saw layer, vol 0.03 — springy twang, clearly not a wall                                       |
| `capsuleSpawn()`            | _silent_                         | square 220, 30 ms, vol 0.03 — subtle; may fire often                                                                                  |
| `capsulePickup()`           | `arp([659, 880])`                | 3 squares 523 / 659 / 784, 40 ms apart, 70 ms each, vol 0.06                                                                          |
| `jammerPickup()`            | `arp([392, 196])`                | saw 392→196, 150 ms, vol 0.06 + square 388→194, vol 0.05 — detune-beat "womp"                                                         |
| `blastExplosion()`          | _8 rapid beeps_                  | low-pass noise 800→150, 250 ms, vol 0.3 + square 120→60, 150 ms, vol 0.1 — one boom                                                   |
| `nukeDetonation()`          | _(future SHA-23)_                | saw 120→30, 700 ms, vol 0.12 + detuned saw layer + low-pass noise 400→60, 600 ms, vol 0.25 — bigger and longer than BLAST             |
| `ballLost()`                | `beep(140, saw)`                 | saws 290→52 vol 0.09 + 296→55 vol 0.06, 600 ms — detuned dive                                                                         |
| `launch()`                  | `beep(520)`                      | band-pass noise 400→2000, 150 ms, vol 0.08 + square 520 blip, 50 ms, vol 0.04 — whoosh                                                |
| `gameStart()`               | `arp([392, 523, 659])`           | same melody, notes voiced as detuned square pairs                                                                                     |
| `levelClear()`              | `arp([523, 659, 784, 1046])`     | same melody, detuned square pairs                                                                                                     |
| `gameOver()`                | `arp([392, 330, 262, 196], 130)` | same melody, square + saw layers — more somber                                                                                        |
| `pauseToggle()`             | `beep(300)`                      | square 300, 50 ms, vol 0.04 — kept a tiny click                                                                                       |
| `uiKeyClick()`              | `beep(700)`                      | square 700, 35 ms, vol 0.03 — hi-score initials keys                                                                                  |

### Behavioral changes in `ShatterGame`

- **BLAST becomes one boom**: `damageBrick` plays no per-brick sound when `source === "splash"` (neither destroyed-pop nor armored clank); `blastNeighbors` plays a single `blastExplosion()` when it damaged at least one neighbor. Scoring, drops and chaining rules untouched.
- **Capsule spawn blip**: played when `dropPool.trySpawn` actually spawns a capsule (not when the roll fails or the pool is full).
- **NUKE hook**: `nukeDetonation()` ships in the bank, called by nobody. SHA-23 wires it; its spec's per-brick sweep decides there whether sweep kills reuse `brickDestroyed` or stay silent under the boom.
- **Brick shatter (SHA-24)**: deliberately no extra sound — the debris animation rides the existing `brickDestroyed` pop.

Laser impacts keep sharing the brick sounds through `damageBrick` — the fire "pew" plus the hit pop is the differentiation.

## Testing

No test runner in the repo; QA is manual, scripted by the dev URL params:

1. `?droprate=1` — capsule spawn blips, pickups, JAMMER womp on every brick.
2. `?power=BML` — BLAST single boom (no beep pile-up), multi-ball retrigger guard, laser cadence.
3. Normal run — paddle / wall / brick / energy-wall differentiation by ear; pitch-by-position and pitch-by-row still audible; ball lost; all three jingles.
4. M mute kills everything mid-run and back; pause blip; a full level clear.
5. Pile-up stress: BLAST + 3 balls + laser — no clipping (compressor holds), no stuck voices.
6. First-gesture unlock: cold page load, first click on the title screen must sound (the arp's first synchronous note is the unlock — unchanged, verify it survived).

The audition page recipes are the ear-reference during tuning.

## Documentation

README "Audio" bullet and the project-structure note for `src/audio/` updated at implementation time.
