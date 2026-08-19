import { Sound } from "@audio/Sound";

// One event may fire several times in a single 16.7 ms tick (three balls, one wall):
// identical voices stack into doubled volume and phasing. ~2 ticks of guard is
// inaudible as a gap but kills the pile-up. Screen jingles can't retrigger anyway.
const RETRIGGER_WINDOW_MS = 30;

// Feedback blips while dragging the panel fader come slower than gameplay guards,
// so a full sweep reads as a few level samples instead of a machine gun.
const VOLUME_TICK_WINDOW_MS = 90;

const VOLUME_STORAGE_KEY = "shatter.volume.v1";

// CHAIN's sputter, as [delay seconds, band centre Hz, gain]. The spacing is
// uneven on purpose: evenly spaced ticks read as a machine and a single burst
// reads as a laser, while an arc stutters and dies away unevenly. Front-loaded,
// because the crackle has to arrive with the strike — ticks that only start
// after 30 ms read as an echo of it instead of as part of it.
// The arc waits out the brick's own break before it strikes. Fired on the same
// tick they are one 50 ms noise burst in one band: the arc is the louder of the
// two and still went unheard, because the ear takes them for a single crack.
// Late, it reads as what it is — the kill, then the lightning jumping off it.
const CHAIN_ARC_LEAD_S = 0.05;

const CHAIN_ARC_SPUTTER: readonly (readonly [number, number, number])[] = [
  [0.005, 8600, 0.26],
  [0.013, 5600, 0.24],
  [0.022, 9800, 0.2],
  [0.033, 3200, 0.22],
  [0.046, 7400, 0.19],
  [0.059, 4800, 0.16],
  [0.076, 6600, 0.14],
  [0.101, 3600, 0.11],
  [0.131, 5200, 0.08],
];

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

  // A whoop through the wall: down, then straight back up out of the other side.
  // Both halves glide the whole time, so neither settles into a pitch.
  portalWarp(): void {
    if (!this.allow("portal")) {
      return;
    }
    this.sound.tone({ freq: 1200, freqEnd: 300, dur: 0.09, vol: 0.05, type: "sawtooth" });
    this.sound.tone({ freq: 300, freqEnd: 1200, dur: 0.09, vol: 0.05, type: "sawtooth", delayS: 0.04 });
  }

  // The wall going out of phase, and coming back. Two halves of one gesture:
  // noise opening upward as the bricks thin out, closing downward as they set.
  // Noise only — a pitched voice would make an event out of what is a change of
  // state, and the player has to hear the second one to know it is over.
  ghostFade(): void {
    if (!this.allow("ghostFade")) {
      return;
    }
    this.sound.noise({ dur: 0.45, vol: 0.13, filter: { type: "bandpass", freq: 300, freqEnd: 3600, q: 1.2 } });
    this.sound.noise({ dur: 0.3, vol: 0.07, filter: { type: "highpass", freq: 2200 } });
  }

  ghostSolidify(): void {
    if (!this.allow("ghostSolidify")) {
      return;
    }
    this.sound.noise({ dur: 0.35, vol: 0.15, filter: { type: "bandpass", freq: 3600, freqEnd: 260, q: 1.2 } });
    this.sound.noise({ dur: 0.08, vol: 0.12, filter: { type: "lowpass", freq: 700 } });
  }

  // BOMB: the paddle going up. Heavier and longer than BLAST's crater — a low
  // sawtooth falling away under a wide body and a debris tail, so it reads as
  // the deck itself rather than as one more brick.
  paddleExplode(): void {
    if (!this.allow("paddleBlast")) {
      return;
    }
    this.sound.tone({ freq: 150, freqEnd: 28, dur: 0.8, vol: 0.13, type: "sawtooth" });
    this.sound.tone({ freq: 150, freqEnd: 28, dur: 0.8, vol: 0.09, type: "sawtooth", detuneCents: 15 });
    this.sound.noise({ dur: 0.09, vol: 0.34, filter: { type: "highpass", freq: 900 } });
    this.sound.noise({ dur: 0.7, vol: 0.26, filter: { type: "lowpass", freq: 900, freqEnd: 50 } });
  }

  // The ground moving: a sawtooth sagging an octave under lowpassed noise, both
  // long enough to outlast the shake they answer. The row dies silently, as
  // ZAP's does — one rumble covers the whole event.
  quakeRumble(): void {
    if (!this.allow("quake")) {
      return;
    }
    this.sound.tone({ freq: 90, freqEnd: 40, dur: 0.6, vol: 0.11, type: "sawtooth" });
    this.sound.tone({ freq: 90, freqEnd: 40, dur: 0.6, vol: 0.08, type: "sawtooth", detuneCents: 15 });
    this.sound.noise({ dur: 0.5, vol: 0.09, filter: { type: "lowpass", freq: 300, freqEnd: 50 } });
  }

  // One bite of the grub: a short chirp falling away under a click of noise,
  // small on purpose — it lands every 18 ticks for as long as the pet lives, and
  // anything with body to it would turn a row into a drum solo.
  critterBite(): void {
    if (!this.allow("critterBite")) {
      return;
    }
    this.sound.tone({ freq: 240, freqEnd: 90, dur: 0.05, vol: 0.07 });
    this.sound.noise({ dur: 0.03, vol: 0.09, filter: { type: "bandpass", freq: 1200 } });
  }

  // A pinball bumper kick: a short pop rising an octave over a click of noise,
  // so a rally of them reads as a rhythm rather than as one held tone.
  bumperKick(): void {
    if (!this.allow("bumper")) {
      return;
    }
    this.sound.tone({ freq: 660, freqEnd: 1320, dur: 0.06, vol: 0.07 });
    this.sound.noise({ dur: 0.03, vol: 0.06, filter: { type: "bandpass", freq: 1800 } });
  }

  // A hole opening: a slow sawtooth climb under noise widening out of nothing.
  // Only the opening is heard — `Sound` has no loop, so a 6-second hum would
  // have to be re-triggered every tick, and the closing is silent by design.
  singularityOpen(): void {
    if (!this.allow("singularity")) {
      return;
    }
    this.sound.tone({ freq: 60, freqEnd: 220, dur: 0.6, vol: 0.09, type: "sawtooth" });
    this.sound.tone({ freq: 60, freqEnd: 220, dur: 0.6, vol: 0.06, type: "sawtooth", detuneCents: 15 });
    this.sound.noise({ dur: 0.5, vol: 0.07, filter: { type: "bandpass", freq: 200, freqEnd: 1800 } });
  }

  // One arc per kill that arced, however many bricks the web reached.
  //
  // Noise only, and that is the whole design rule: an arc has no note in it, so
  // any oscillator here reads as a beep however it is voiced. Everything is
  // shaped by filtering and by length instead.
  //
  // What makes it crack rather than hiss is that the loud layers are *short*:
  // a 6 ms top-end snap and a 30 ms transient reaching down to 300 Hz for thump,
  // over a body cut short enough not to smear into a whoosh. The sizzle and the
  // sputter carry the tail; the sputter is what says arc rather than zap.
  chainArc(): void {
    if (!this.allow("chain")) {
      return;
    }
    const lead = CHAIN_ARC_LEAD_S;
    this.sound.noise({ dur: 0.006, vol: 0.32, delayS: lead, filter: { type: "highpass", freq: 5500 } });
    this.sound.noise({ dur: 0.03, vol: 0.34, delayS: lead, filter: { type: "highpass", freq: 300 } });
    this.sound.noise({
      dur: 0.07,
      vol: 0.18,
      delayS: lead,
      filter: { type: "bandpass", freq: 1900, freqEnd: 380, q: 1.4 },
    });
    this.sound.noise({
      dur: 0.19,
      vol: 0.14,
      delayS: lead,
      filter: { type: "bandpass", freq: 5600, freqEnd: 900, q: 3 },
    });
    for (const [delayS, freq, vol] of CHAIN_ARC_SPUTTER) {
      this.sound.noise({ dur: 0.013, vol, delayS: lead + delayS, filter: { type: "bandpass", freq, q: 11 } });
    }
  }

  // The paddle's chirp upside down: MIRROR is above you, so where the paddle
  // bends up, the ghost bends down. Its own guard key, so a swarm hitting the
  // ceiling collapses into one voice instead of muting the real paddle.
  mirrorBounce(relativeHit: number): void {
    if (!this.allow("mirror")) {
      return;
    }
    const base = 620 + relativeHit * 80;
    this.sound.tone({ freq: base, freqEnd: base / 1.58, dur: 0.07, vol: 0.06 });
    this.sound.tone({ freq: base, freqEnd: base / 1.58, dur: 0.07, vol: 0.04, detuneCents: 15 });
  }

  // Time stopping: a long sawtooth fall with a detuned shadow beating against
  // it, under noise closing from bright to muffled.
  stasisFreeze(): void {
    if (!this.allow("stasisFreeze")) {
      return;
    }
    this.sound.tone({ freq: 900, freqEnd: 90, dur: 0.35, vol: 0.08, type: "sawtooth" });
    this.sound.tone({ freq: 900, freqEnd: 90, dur: 0.35, vol: 0.05, type: "sawtooth", detuneCents: 12 });
    this.sound.noise({ dur: 0.35, vol: 0.1, filter: { type: "lowpass", freq: 1200, freqEnd: 200 } });
  }

  // The freeze run backwards, then a blip on the beat the balls move again.
  stasisRelease(): void {
    if (!this.allow("stasisRelease")) {
      return;
    }
    this.sound.tone({ freq: 90, freqEnd: 900, dur: 0.2, vol: 0.07, type: "sawtooth" });
    this.sound.tone({ freq: 660, dur: 0.08, vol: 0.07, delayS: 0.18 });
  }

  // RUSH letting go: stasisRelease run the other way up, because the event is the
  // other way round — the ball is coming back down to its own speed, not being
  // handed back its motion. The blip lands on the beat it is true again.
  rushRelease(): void {
    if (!this.allow("rushRelease")) {
      return;
    }
    this.sound.tone({ freq: 880, freqEnd: 220, dur: 0.22, vol: 0.07, type: "sawtooth" });
    this.sound.tone({ freq: 330, dur: 0.08, vol: 0.06, delayS: 0.2 });
  }

  // Detune-beat "womp": the two layers drift apart as they fall. Every trap
  // catch gets it — one sound for the tier, not one per capsule.
  malusPickup(): void {
    if (!this.allow("malus")) {
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

  // Bigger and longer than BLAST; replaces both the pickup jingle and the
  // ~70 per-brick beeps a full-field sweep would otherwise fire.
  nukeDetonation(): void {
    if (!this.allow("nuke")) {
      return;
    }
    this.sound.tone({ freq: 120, freqEnd: 30, dur: 0.7, vol: 0.12, type: "sawtooth" });
    this.sound.tone({ freq: 120, freqEnd: 30, dur: 0.7, vol: 0.08, type: "sawtooth", detuneCents: 15 });
    this.sound.noise({ dur: 0.6, vol: 0.25, filter: { type: "lowpass", freq: 400, freqEnd: 60 } });
  }

  // Rising 1UP fanfare — brighter than the capsule chime, shorter than a jingle.
  extraLife(): void {
    if (!this.allow("extraLife")) {
      return;
    }
    this.sound.arp([659, 784, 988, 1319], 45, { detunePair: true });
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
