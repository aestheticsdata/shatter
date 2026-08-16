# Chip-deluxe SFX overhaul (SHA-26) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the game's twelve identical square-wave beeps with a typed per-event sound bank in the validated "CHIP DELUXE" style (pitch bends, detuned pairs, filtered noise) — pure WebAudio, no assets.

**Architecture:** `Sound.ts` stays the engine and grows from one primitive (`beep`) to three (`tone`, `noise`, re-voiced `arp`), all routed through a new master gain → compressor safety chain. A new `SoundBank.ts` holds one typed method per game event composing those primitives, plus a 30 ms per-event retrigger guard. `ShatterGame` swaps its `sound: Sound` dep for `sfx: SoundBank`; no raw frequencies remain in game code.

**Tech Stack:** Strict TypeScript, WebAudio API, Vite. No test runner exists in this repo — each task verifies with `pnpm run typecheck` + `pnpm run lint` + `pnpm run fmt:check`, and the final task is the spec's by-ear QA protocol (synthesized audio is validated by listening, per the spec).

**Spec:** `docs/superpowers/specs/2026-08-17-audio-overhaul-design.md`

## Global Constraints

- **NEVER run `git commit` or `git push`.** The user QAs every change and commits themselves. Leave all work in the working tree and report what is ready.
- The working tree already contains **uncommitted auto-pause work** in `src/core/ShatterGame.ts`, `src/input/InputController.ts`, `index.html`, `README.md`. Do not revert or reformat those hunks; only add the changes described here.
- No runtime dependencies, no audio assets. WebAudio synthesis only.
- Preserve every SHA-18 behavior in `Sound.ts`: AudioContext created inside the first gesture's call stack, `resume()` retry on each play, 30 Hz keep-warm oscillator wired **directly to `destination`** (not through the compressor), mute check before any node creation, schedule-ahead starts (5 ms), linear attack ramps, peak hold, exponential decay, try/catch-silent around all WebAudio calls.
- All recipe numbers are starting points from the spec's event table — transcribe them exactly; tuning happens by ear in Task 4, not by improvisation in Tasks 1–3.
- Formatter is `oxfmt` (printWidth 120); run `pnpm run fmt` if `fmt:check` fails. Linter is `oxlint`.
- Ticket SHA-26 state changes (In Progress at start, Verify at end) are handled by the orchestrating session, not by task executors.

---

### Task 1: Sound engine — master chain + `tone` / `noise` primitives, re-voiced `arp`

**Files:**

- Modify: `src/audio/Sound.ts` (full rewrite below; current file is 99 lines)

**Interfaces:**

- Consumes: nothing new.
- Produces (Task 2 and 3 rely on these exact signatures):
  - `interface ToneSpec { freq: number; dur: number; type?: OscillatorType; freqEnd?: number; vol?: number; delayS?: number; detuneCents?: number }`
  - `interface NoiseSpec { dur: number; filter: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number }; vol?: number; delayS?: number }`
  - `interface ArpVoice { type?: OscillatorType; detunePair?: boolean; vol?: number; noteDurS?: number }`
  - `Sound.tone(spec: ToneSpec): void`
  - `Sound.noise(spec: NoiseSpec): void`
  - `Sound.arp(frequencies: readonly number[], stepMs?: number, voice?: ArpVoice): void`
  - `Sound.beep(frequency, durationS, type?, volume?)` **kept temporarily** as a thin `tone` wrapper so `ShatterGame` still compiles; Task 3 deletes it.
  - `get muted(): boolean` / `toggleMuted(): boolean` unchanged.

- [ ] **Step 1: Replace the body of `src/audio/Sound.ts` with the engine below**

```ts
const SCHEDULE_AHEAD_S = 0.005;
const ATTACK_S = 0.004;
const NOISE_ATTACK_S = 0.003;
const STOP_TAIL_S = 0.01;
const MASTER_GAIN = 0.9;
// A +15-cent layer at ~70% level is the "detuned pair" voicing used across the bank.
const DETUNE_PAIR_CENTS = 15;
const DETUNE_PAIR_LEVEL = 0.7;

export interface ToneSpec {
  freq: number;
  /** Seconds. */
  dur: number;
  /** Default "square". */
  type?: OscillatorType;
  /** Exponential glide target, reached exactly at dur. */
  freqEnd?: number;
  /** Peak gain. Default 0.05. */
  vol?: number;
  /** Seconds added to the schedule-ahead start. Default 0. */
  delayS?: number;
  /** Default 0. */
  detuneCents?: number;
}

export interface NoiseSpec {
  /** Seconds. */
  dur: number;
  filter: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number };
  /** Peak gain. Default 0.15. */
  vol?: number;
  /** Seconds added to the schedule-ahead start. Default 0. */
  delayS?: number;
}

export interface ArpVoice {
  /** Default "square". */
  type?: OscillatorType;
  /** Adds a +15-cent layer per note at 70% level. Default false. */
  detunePair?: boolean;
  /** Peak gain per note. Default 0.05. */
  vol?: number;
  /** Seconds per note. Default 0.09. */
  noteDurS?: number;
}

export class Sound {
  private context: AudioContext | null = null;
  private masterInput: GainNode | null = null;
  private isMuted = false;

  get muted(): boolean {
    return this.isMuted;
  }

  toggleMuted(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  // Recovers from "suspended"/"interrupted" states; the browser only honors resume()
  // once a user gesture has happened, which is guaranteed here since every sound is
  // triggered by playing the game.
  private unlock(): void {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.keepOutputWarm(this.context);
      }
      if (this.context.state !== "running") {
        this.context.resume().catch(() => {
          // resume() is rejected until the browser has seen a user gesture; the next sound retries.
        });
      }
    } catch {
      // Audio is unavailable (no user gesture yet, or unsupported); stay silent.
    }
  }

  // A permanently running inaudible source keeps the whole output chain awake: browsers
  // and HDMI/Bluetooth sinks power down after a moment of *silence* (an all-zero signal
  // counts), and a short one-shot beep is then consumed while the chain spins back up.
  // 30 Hz is below what any speaker reproduces, and -60 dB is under any noise floor.
  // It bypasses the master chain: the compressor's detector must never see it.
  private keepOutputWarm(context: AudioContext): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 30;
    gain.gain.value = 0.001;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
  }

  // All voices meet at masterGain → compressor → destination. The compressor is a
  // safety limiter for voice pile-ups (BLAST, multi-ball); inaudible in normal play.
  private output(context: AudioContext): GainNode {
    if (!this.masterInput) {
      const gain = context.createGain();
      gain.gain.value = MASTER_GAIN;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 10;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      gain.connect(compressor);
      compressor.connect(context.destination);
      this.masterInput = gain;
    }
    return this.masterInput;
  }

  tone(spec: ToneSpec): void {
    if (this.isMuted) {
      return;
    }

    this.unlock();
    const context = this.context;
    if (!context) {
      return;
    }

    try {
      // Schedule slightly ahead: an onset already in the past when the render thread
      // picks it up gets clipped. The short linear attack also removes onset clicks.
      // Hold at peak for half the duration before decaying — a full-length exponential
      // decay leaves only ~15 ms of perceivable sound out of a 50 ms tone.
      const { freq, dur, type = "square", freqEnd, vol = 0.05, delayS = 0, detuneCents = 0 } = spec;
      const start = context.currentTime + SCHEDULE_AHEAD_S + delayS;
      const holdEnd = start + Math.max(ATTACK_S, dur * 0.5);
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = type;
      oscillator.detune.value = detuneCents;
      oscillator.frequency.setValueAtTime(freq, start);
      if (freqEnd !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + dur);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(vol, start + ATTACK_S);
      gain.gain.setValueAtTime(vol, holdEnd);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      oscillator.connect(gain);
      gain.connect(this.output(context));
      oscillator.start(start);
      oscillator.stop(start + dur + STOP_TAIL_S);
    } catch {
      // Audio is unavailable; stay silent.
    }
  }

  noise(spec: NoiseSpec): void {
    if (this.isMuted) {
      return;
    }

    this.unlock();
    const context = this.context;
    if (!context) {
      return;
    }

    try {
      const { dur, filter, vol = 0.15, delayS = 0 } = spec;
      const start = context.currentTime + SCHEDULE_AHEAD_S + delayS;
      const length = Math.ceil(context.sampleRate * dur) + 64;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      const biquad = context.createBiquadFilter();
      biquad.type = filter.type;
      biquad.frequency.setValueAtTime(filter.freq, start);
      if (filter.freqEnd !== undefined) {
        biquad.frequency.exponentialRampToValueAtTime(Math.max(1, filter.freqEnd), start + dur);
      }
      biquad.Q.value = filter.q ?? 1;

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(vol, start + NOISE_ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      source.connect(biquad);
      biquad.connect(gain);
      gain.connect(this.output(context));
      source.start(start);
      source.stop(start + dur + STOP_TAIL_S);
    } catch {
      // Audio is unavailable; stay silent.
    }
  }

  arp(frequencies: readonly number[], stepMs = 60, voice: ArpVoice = {}): void {
    const { type = "square", detunePair = false, vol = 0.05, noteDurS = 0.09 } = voice;
    frequencies.forEach((frequency, index) => {
      // Every call runs synchronously so that when an arp is the first sound ever
      // (title-screen click), the AudioContext is created inside the gesture call
      // stack; later notes ride the audio clock via delayS instead of setTimeout,
      // so arp timing is sample-accurate.
      const delayS = (index * stepMs) / 1000;
      this.tone({ freq: frequency, dur: noteDurS, type, vol, delayS });
      if (detunePair) {
        this.tone({
          freq: frequency,
          dur: noteDurS,
          type,
          vol: vol * DETUNE_PAIR_LEVEL,
          delayS,
          detuneCents: DETUNE_PAIR_CENTS,
        });
      }
    });
  }

  // Transitional shim: ShatterGame still calls beep() until the SoundBank migration
  // (SHA-26 Task 3) deletes both the call sites and this method.
  beep(frequency: number, durationS: number, type: OscillatorType = "square", volume = 0.05): void {
    this.tone({ freq: frequency, dur: durationS, type, vol: volume });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: exit 0, no output. (`ShatterGame` still compiles — `beep` and the 2-arg `arp` calls are still valid.)

- [ ] **Step 3: Lint + format**

Run: `pnpm run lint && pnpm run fmt:check`
Expected: 0 warnings, formatting clean. If `fmt:check` fails, run `pnpm run fmt` and re-check.

- [ ] **Step 4: Smoke check in the browser**

Run: `pnpm dev`, open the URL, click through title → serve → play. The old sounds must all still play (they now route through `tone` and the compressor): title-click arp, launch beep, paddle/wall/brick beeps, and M must mute everything. Report what you heard.

---

### Task 2: `SoundBank` — one typed method per game event

**Files:**

- Create: `src/audio/SoundBank.ts`

**Interfaces:**

- Consumes (from Task 1): `Sound`, `Sound.tone(ToneSpec)`, `Sound.noise(NoiseSpec)`, `Sound.arp(frequencies, stepMs?, ArpVoice?)`, `Sound.muted`, `Sound.toggleMuted()`.
- Produces (Task 3 relies on these exact signatures):
  - `class SoundBank` with `get muted(): boolean`, `toggleMuted(): boolean`, and methods
    `wallBounce()`, `paddleBounce(relativeHit: number)`, `brickArmored()`, `brickDestroyed(row: number)`,
    `laserFire()`, `energyWallBounce()`, `capsuleSpawn()`, `capsulePickup()`, `jammerPickup()`,
    `blastExplosion()`, `nukeDetonation()`, `ballLost()`, `launch()`, `gameStart()`, `levelClear()`,
    `gameOver()`, `pauseToggle()`, `uiKeyClick()` — all `(): void` unless noted.

- [ ] **Step 1: Create `src/audio/SoundBank.ts`**

Every number below is transcribed from the spec's event table — do not adjust while implementing.

```ts
import { Sound } from "@audio/Sound";

// One event may fire several times in a single 16.7 ms tick (three balls, one wall):
// identical voices stack into doubled volume and phasing. ~2 ticks of guard is
// inaudible as a gap but kills the pile-up. Screen jingles can't retrigger anyway.
const RETRIGGER_WINDOW_MS = 30;

// The game's sound vocabulary, one method per event — "CHIP DELUXE": squares with
// pitch bends, detuned pairs and filtered noise. All values are starting points from
// the SHA-26 spec's event table; final tuning is by ear in-game.
export class SoundBank {
  private readonly sound: Sound;
  private readonly lastPlayedMs = new Map<string, number>();

  constructor(sound: Sound = new Sound()) {
    this.sound = sound;
  }

  get muted(): boolean {
    return this.sound.muted;
  }

  toggleMuted(): boolean {
    return this.sound.toggleMuted();
  }

  private allow(event: string): boolean {
    const now = performance.now();
    if (now - (this.lastPlayedMs.get(event) ?? Number.NEGATIVE_INFINITY) < RETRIGGER_WINDOW_MS) {
      return false;
    }
    this.lastPlayedMs.set(event, now);
    return true;
  }

  // Slight down-bend: walls are dead surfaces, unlike the paddle's up-bend.
  wallBounce(): void {
    if (!this.allow("wall")) {
      return;
    }
    this.sound.tone({ freq: 300, freqEnd: 240, dur: 0.04, vol: 0.05 });
  }

  // Hit position still maps to pitch, as the old 420 + rel·90 beep did.
  paddleBounce(relativeHit: number): void {
    if (!this.allow("paddle")) {
      return;
    }
    const base = 330 + relativeHit * 80;
    this.sound.tone({ freq: base, freqEnd: base * 1.58, dur: 0.07, vol: 0.07 });
    this.sound.tone({ freq: base, freqEnd: base * 1.58, dur: 0.07, vol: 0.05, detuneCents: 15 });
  }

  // Dull metallic clank: the brick survived.
  brickArmored(): void {
    if (!this.allow("brickArmored")) {
      return;
    }
    this.sound.tone({ freq: 210, freqEnd: 180, dur: 0.05, vol: 0.08 });
    this.sound.noise({ dur: 0.03, vol: 0.08, filter: { type: "highpass", freq: 3000 } });
  }

  // Row still maps to pitch, as the old 560 + (5-row)·45 beep did.
  brickDestroyed(row: number): void {
    if (!this.allow("brickDestroyed")) {
      return;
    }
    const base = 560 + (5 - row) * 45;
    this.sound.tone({ freq: base * 1.15, freqEnd: base * 0.55, dur: 0.09, vol: 0.08 });
    this.sound.noise({ dur: 0.05, vol: 0.12, filter: { type: "highpass", freq: 2500 } });
  }

  laserFire(): void {
    if (!this.allow("laser")) {
      return;
    }
    this.sound.tone({ freq: 1700, freqEnd: 320, dur: 0.09, vol: 0.06 });
    this.sound.tone({ freq: 2500, freqEnd: 480, dur: 0.07, vol: 0.03 });
  }

  // Springy up-twang — clearly not an ordinary wall.
  energyWallBounce(): void {
    if (!this.allow("energyWall")) {
      return;
    }
    this.sound.tone({ freq: 140, freqEnd: 320, dur: 0.12, vol: 0.06 });
    this.sound.tone({ freq: 140, freqEnd: 320, dur: 0.12, vol: 0.03, type: "sawtooth" });
  }

  // Subtle by design: with ?droprate=1 every brick fires it.
  capsuleSpawn(): void {
    if (!this.allow("capsuleSpawn")) {
      return;
    }
    this.sound.tone({ freq: 220, dur: 0.03, vol: 0.03 });
  }

  capsulePickup(): void {
    if (!this.allow("capsulePickup")) {
      return;
    }
    [523, 659, 784].forEach((freq, index) => {
      this.sound.tone({ freq, dur: 0.07, vol: 0.06, delayS: index * 0.04 });
    });
  }

  // Detune-beat "womp": the two layers drift apart as they fall.
  jammerPickup(): void {
    if (!this.allow("jammer")) {
      return;
    }
    this.sound.tone({ freq: 392, freqEnd: 196, dur: 0.15, vol: 0.06, type: "sawtooth" });
    this.sound.tone({ freq: 388, freqEnd: 194, dur: 0.15, vol: 0.05 });
  }

  // One boom for the whole chain; splash kills are individually silent.
  blastExplosion(): void {
    if (!this.allow("blast")) {
      return;
    }
    this.sound.noise({ dur: 0.25, vol: 0.3, filter: { type: "lowpass", freq: 800, freqEnd: 150 } });
    this.sound.tone({ freq: 120, freqEnd: 60, dur: 0.15, vol: 0.1 });
  }

  // Shipped for SHA-23 (NUKE capsule); no caller yet. Bigger and longer than BLAST.
  nukeDetonation(): void {
    if (!this.allow("nuke")) {
      return;
    }
    this.sound.tone({ freq: 120, freqEnd: 30, dur: 0.7, vol: 0.12, type: "sawtooth" });
    this.sound.tone({ freq: 120, freqEnd: 30, dur: 0.7, vol: 0.08, type: "sawtooth", detuneCents: 15 });
    this.sound.noise({ dur: 0.6, vol: 0.25, filter: { type: "lowpass", freq: 400, freqEnd: 60 } });
  }

  ballLost(): void {
    if (!this.allow("ballLost")) {
      return;
    }
    this.sound.tone({ freq: 290, freqEnd: 52, dur: 0.6, vol: 0.09, type: "sawtooth" });
    this.sound.tone({ freq: 296, freqEnd: 55, dur: 0.6, vol: 0.06, type: "sawtooth" });
  }

  launch(): void {
    if (!this.allow("launch")) {
      return;
    }
    this.sound.noise({ dur: 0.15, vol: 0.08, filter: { type: "bandpass", freq: 400, freqEnd: 2000 } });
    this.sound.tone({ freq: 520, dur: 0.05, vol: 0.04 });
  }

  gameStart(): void {
    this.sound.arp([392, 523, 659], 60, { detunePair: true });
  }

  levelClear(): void {
    this.sound.arp([523, 659, 784, 1046], 60, { detunePair: true });
  }

  // Square melody with a quiet sawtooth shadow — more somber than the other jingles.
  gameOver(): void {
    this.sound.arp([392, 330, 262, 196], 130, { detunePair: true });
    this.sound.arp([392, 330, 262, 196], 130, { type: "sawtooth", vol: 0.03, noteDurS: 0.12 });
  }

  pauseToggle(): void {
    this.sound.tone({ freq: 300, dur: 0.05, vol: 0.04 });
  }

  uiKeyClick(): void {
    this.sound.tone({ freq: 700, dur: 0.035, vol: 0.03 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: exit 0. (`SoundBank` has no consumers yet — that's fine, it's a new module.)

- [ ] **Step 3: Lint + format**

Run: `pnpm run lint && pnpm run fmt:check`
Expected: 0 warnings, formatting clean.

---

### Task 3: Migrate the game — `ShatterGame`, `DropPool`, `main.ts`; delete `beep`

**Files:**

- Modify: `src/core/ShatterGame.ts` (dep swap + all 16 sound call sites + BLAST/spawn behavior)
- Modify: `src/entities/powerups/DropPool.ts:37-47` (`trySpawn` returns `boolean`)
- Modify: `src/main.ts:1,41` (wire `SoundBank`)
- Modify: `src/audio/Sound.ts` (delete the transitional `beep` method)

**Interfaces:**

- Consumes (from Task 2): every `SoundBank` method listed there.
- Produces: `ShatterGameDeps.sfx: SoundBank` (replaces `sound: Sound`); `DropPool.trySpawn(brickLeft: number, brickTop: number): boolean`.

- [ ] **Step 1: `DropPool.trySpawn` reports whether a capsule actually spawned**

In `src/entities/powerups/DropPool.ts` replace the `trySpawn` method:

```ts
  trySpawn(brickLeft: number, brickTop: number): boolean {
    const drop = this.drops.find((candidate) => !candidate.active);
    if (!drop) {
      return false;
    }

    drop.kind = rollDropKind();
    drop.x = brickLeft + 5;
    drop.y = brickTop;
    drop.active = true;
    return true;
  }
```

- [ ] **Step 2: Swap the dep in `ShatterGame` and migrate every call site**

In `src/core/ShatterGame.ts`:

a. Replace the import `import type { Sound } from "@audio/Sound";` with `import type { SoundBank } from "@audio/SoundBank";` and in `ShatterGameDeps` replace `sound: Sound;` with `sfx: SoundBank;`.

b. Replace each call site (old → new). Line numbers are pre-edit references; match on the code, not the number:

| Where                                  | Old                                                                   | New                                        |
| -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `stepSimulation`, laser cadence (~186) | `this.deps.sound.beep(880, 0.04, "square", 0.035);`                   | `this.deps.sfx.laserFire();`               |
| `moveBall`, left wall (~238)           | `this.deps.sound.beep(240, 0.05, "square", 0.05);`                    | `this.deps.sfx.wallBounce();`              |
| `moveBall`, right wall (~243)          | same beep                                                             | `this.deps.sfx.wallBounce();`              |
| `moveBall`, ceiling (~248)             | same beep                                                             | `this.deps.sfx.wallBounce();`              |
| `moveBall`, paddle catch (~262)        | `this.deps.sound.beep(420 + relativeHit * 90, 0.08, "square", 0.06);` | `this.deps.sfx.paddleBounce(relativeHit);` |
| `moveBall`, energy wall (~269)         | `this.deps.sound.beep(320, 0.08, "square", 0.05);`                    | `this.deps.sfx.energyWallBounce();`        |
| `onLevelCleared` (~335)                | `this.deps.sound.arp([523, 659, 784, 1046]);`                         | `this.deps.sfx.levelClear();`              |
| `applyPowerUp`, JAMMER branch (~383)   | `this.deps.sound.arp([392, 196], 50);`                                | `this.deps.sfx.jammerPickup();`            |
| `applyPowerUp`, other kinds (~385)     | `this.deps.sound.arp([659, 880], 50);`                                | `this.deps.sfx.capsulePickup();`           |
| `die` (~390)                           | `this.deps.sound.beep(140, 0.3, "sawtooth", 0.06);`                   | `this.deps.sfx.ballLost();`                |
| `startRun` (~442)                      | `this.deps.sound.arp([392, 523, 659]);`                               | `this.deps.sfx.gameStart();`               |
| `launch` (~477)                        | `this.deps.sound.beep(520, 0.07);`                                    | `this.deps.sfx.launch();`                  |
| `gameOver` (~486)                      | `this.deps.sound.arp([392, 330, 262, 196], 130);`                     | `this.deps.sfx.gameOver();`                |
| `onKeyDown`, P (~524)                  | `this.deps.sound.beep(300, 0.06);`                                    | `this.deps.sfx.pauseToggle();`             |
| `onKeyDown`, M (~527)                  | `this.deps.sound.toggleMuted();`                                      | `this.deps.sfx.toggleMuted();`             |
| `handleEntryKey` (~538)                | `this.deps.sound.beep(700, 0.04);`                                    | `this.deps.sfx.uiKeyClick();`              |
| `panelView` (~611)                     | `muted: this.deps.sound.muted,`                                       | `muted: this.deps.sfx.muted,`              |

c. Rewrite `damageBrick` — splash kills go silent, spawn gets its blip:

```ts
  private damageBrick(hit: BrickHit, source: "ball" | "laser" | "splash" = "ball"): void {
    const destroyed = this.grid.damage(hit);
    if (!destroyed) {
      // Splash damage is covered by the single BLAST boom; only direct hits clank.
      if (source !== "splash") {
        this.deps.sfx.brickArmored();
      }
      return;
    }

    this.score += hit.cell.points * this.scoreMultiplier();
    if (source !== "splash") {
      this.deps.sfx.brickDestroyed(hit.row);
    }

    if (source !== "splash" && Math.random() < (this.debugDropRate ?? gameConfig.rules.dropRate)) {
      const { left, top, brickWidth, brickHeight } = gameConfig.grid;
      if (this.dropPool.trySpawn(left + hit.column * brickWidth, top + hit.row * brickHeight)) {
        this.deps.sfx.capsuleSpawn();
      }
    }

    if (source === "ball" && this.timers.isActive("B")) {
      this.blastNeighbors(hit);
    }

    if (this.grid.remaining <= 0) {
      this.onLevelCleared();
    }
  }
```

d. Rewrite `blastNeighbors` — one boom for the whole chain:

```ts
  // Splash kills never chain and never drop capsules — one explosion per ball hit.
  private blastNeighbors(center: BrickHit): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    let blasted = false;

    for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
      for (let deltaColumn = -1; deltaColumn <= 1; deltaColumn++) {
        if (deltaRow === 0 && deltaColumn === 0) {
          continue;
        }
        const neighbor = this.grid.hitAtCell(center.row + deltaRow, center.column + deltaColumn);
        if (!neighbor) {
          continue;
        }
        blasted = true;
        this.splashFlashes.push({
          x: left + neighbor.column * brickWidth,
          y: top + neighbor.row * brickHeight,
          ticksLeft: gameConfig.powerUps.splashFlashTicks,
        });
        this.damageBrick(neighbor, "splash");
      }
    }

    // The neighbors themselves stay silent (source "splash"): the chain reads as
    // one explosion, not eight overlapping pops.
    if (blasted) {
      this.deps.sfx.blastExplosion();
    }
  }
```

- [ ] **Step 3: Wire `SoundBank` in `main.ts`**

Replace `import { Sound } from "@audio/Sound";` with `import { SoundBank } from "@audio/SoundBank";` and in the `ShatterGame` deps object replace `sound: new Sound(),` with `sfx: new SoundBank(),`.

- [ ] **Step 4: Delete the transitional `beep` method from `src/audio/Sound.ts`**

Remove the `beep(...)` method and its "Transitional shim" comment entirely. `tone`, `noise`, `arp` remain the whole public play surface.

- [ ] **Step 5: Typecheck — proves the migration is complete**

Run: `pnpm run typecheck`
Expected: exit 0. Any `Property 'sound' does not exist` / `Property 'beep' does not exist` error means a call site was missed — the table in Step 2b is the checklist.

- [ ] **Step 6: Lint + format**

Run: `pnpm run lint && pnpm run fmt:check`
Expected: 0 warnings, formatting clean.

- [ ] **Step 7: Build**

Run: `pnpm build`
Expected: exit 0, dist bundle produced.

---

### Task 4: By-ear QA, tuning pass, README

**Files:**

- Modify: `README.md:13` (Audio bullet) and `README.md:103` (project-structure line for `src/audio/`)
- Possibly touch: `src/audio/SoundBank.ts` recipe values (tuning only — structure is frozen)

**Interfaces:**

- Consumes: the complete wired game from Task 3.
- Produces: the shippable state handed to user QA.

- [ ] **Step 1: Run the spec's QA protocol**

Start `pnpm dev` (and note the dev URL). Walk all six points, listening on real speakers/headphones:

1. `?droprate=1` — capsule spawn blips (subtle, not spammy), pickup arps, JAMMER womp.
2. `?power=BML` — BLAST plays **one** boom per chain (no beep pile-up), three balls don't double-trigger paddle/wall sounds, laser pew at cadence.
3. Normal run — paddle (up-bend) vs wall (down-bend) vs brick pop vs armored clank vs energy-wall twang all distinguishable blind; paddle pitch still follows hit position; brick pitch still follows row.
4. M mutes everything mid-run and back; pause blip on P; full level clear jingle.
5. Pile-up stress (BLAST + 3 balls + laser): no clipping, no stuck voices — the compressor should hold transparently.
6. Cold reload, first click on the title screen must sound (first-gesture unlock survived the `arp` rework).

- [ ] **Step 2: Tune what fails the ear test**

Adjust only `vol` / `freq` / `dur` values inside `SoundBank.ts` recipes (and, if truly needed, the compressor constants in `Sound.ts`). Do not restructure. Re-run the affected QA point after each change. Record every deviation from the spec's table — the report to the user must list final values that differ.

- [ ] **Step 3: Update README**

Replace the Audio bullet (line 13) with:

```markdown
- **Audio**: WebAudio chiptune SFX, 100% synthesized (no assets): a per-event sound bank (square pitch-bends, detuned pairs, filtered noise bursts) on a master gain → compressor chain, with a 30 ms retrigger guard against same-tick pile-ups. An inaudible 30 Hz keep-warm tone stops browser/HDMI/Bluetooth silence detection from swallowing short impact blips.
```

Replace the `audio/` project-structure line (line 103) with:

```markdown
audio/ # Sound: WebAudio engine (tone/noise/arp + compressor) · SoundBank: per-event SFX recipes
```

- [ ] **Step 4: Final full check**

Run: `pnpm run typecheck && pnpm run lint && pnpm run fmt:check && pnpm build`
Expected: all exit 0.

- [ ] **Step 5: Hand to user QA — do NOT commit**

Leave everything in the working tree. Report: what changed per file, which recipe values were tuned away from the spec table, and the dev URL + param combos for the user's own listen (`?droprate=1`, `?power=BML`). The user QAs and commits.

---

## Self-review notes

- Spec coverage: engine primitives + master chain (Task 1), every event-map row and both behavioral changes — BLAST single boom, spawn blip (Tasks 2–3), NUKE hook shipped uncalled (Task 2), laser impacts still share brick sounds via `damageBrick` (unchanged by design), QA protocol + README (Task 4).
- The `sound` → `sfx` dep rename is breaking by design: typecheck failure is the migration checklist.
- No unit tests: the repo has no runner, and the deliverable is judged by ear per spec — the typecheck/lint/build gates plus the six-point listening protocol are the verification.
