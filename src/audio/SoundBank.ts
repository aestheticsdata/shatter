import { Sound } from "@audio/Sound";

// One event may fire several times in a single 16.7 ms tick (three balls, one wall):
// identical voices stack into doubled volume and phasing. ~2 ticks of guard is
// inaudible as a gap but kills the pile-up. Screen jingles can't retrigger anyway.
const RETRIGGER_WINDOW_MS = 30;

// Feedback blips while dragging the panel fader come slower than gameplay guards,
// so a full sweep reads as a few level samples instead of a machine gun.
const VOLUME_TICK_WINDOW_MS = 90;

const VOLUME_STORAGE_KEY = "shatter.volume.v1";

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) {
      return 1;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
  } catch {
    // Storage unavailable (private mode); start at full volume.
    return 1;
  }
}

// The game's sound vocabulary, one method per event — "CHIP DELUXE": squares with
// pitch bends, detuned pairs and filtered noise. All values are starting points from
// the SHA-26 spec's event table; final tuning is by ear in-game.
export class SoundBank {
  private readonly sound: Sound;
  private readonly lastPlayedMs = new Map<string, number>();

  constructor(sound: Sound = new Sound()) {
    this.sound = sound;
    this.sound.setVolume(readStoredVolume());
  }

  get muted(): boolean {
    return this.sound.muted;
  }

  toggleMuted(): boolean {
    return this.sound.toggleMuted();
  }

  get volume(): number {
    return this.sound.volume;
  }

  setVolume(volume: number): void {
    this.sound.setVolume(volume);
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(this.sound.volume));
    } catch {
      // Storage unavailable (private mode); the volume just won't persist.
    }
    // A blip at the new level is the only honest volume preview.
    if (this.allow("volumeTick", VOLUME_TICK_WINDOW_MS)) {
      this.sound.tone({ freq: 520, dur: 0.05, vol: 0.06 });
    }
  }

  private allow(event: string, windowMs = RETRIGGER_WINDOW_MS): boolean {
    const now = performance.now();
    if (now - (this.lastPlayedMs.get(event) ?? Number.NEGATIVE_INFINITY) < windowMs) {
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

  // A whole swarm arrives: longer, louder and brighter than the capsule chime,
  // with a detuned shadow for width.
  swarmPickup(): void {
    if (!this.allow("swarmPickup")) {
      return;
    }
    [392, 523, 659, 784, 1046].forEach((freq, index) => {
      this.sound.tone({ freq, dur: 0.08, vol: 0.09, delayS: index * 0.035 });
      this.sound.tone({ freq, dur: 0.08, vol: 0.05, delayS: index * 0.035, detuneCents: 12 });
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
