import { Sound } from "@audio/Sound";

import type { ArpVoice, NoiseSpec, ToneSpec } from "@audio/Sound";

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
  private demade = false;

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
      this.tone({ freq: 520, dur: 0.05, vol: 0.06 });
    }
  }

  /**
   * DEMAKE: the machine downgrades its own sound chip along with its screen.
   *
   * Every voice in this bank goes out through the three wrappers below, so the
   * downgrade is one flag rather than 34 branches — and a sound written after
   * this is demade by construction. What it does is what a worse chip could
   * not do: pitch glides, detuning and noise all go, leaving flat squares.
   */
  setDemake(active: boolean): void {
    this.demade = active;
  }

  // A square with no glide and no detune — one channel, one pitch, which is the
  // whole of what the downgrade leaves.
  private tone(spec: ToneSpec): void {
    if (!this.demade) {
      this.sound.tone(spec);
      return;
    }
    const { freq, dur, vol, delayS } = spec;
    this.sound.tone({ freq, dur, vol, delayS, type: "square" });
  }

  // No noise channel at all. Silent rather than substituted: a square standing
  // in for an explosion is a beep where the player expects a bang, and the
  // pitched layer of every one of these sounds is still playing.
  private noise(spec: NoiseSpec): void {
    if (!this.demade) {
      this.sound.noise(spec);
    }
  }

  private arp(notes: readonly number[], stepMs: number, voice: ArpVoice = {}): void {
    this.sound.arp(notes, stepMs, this.demade ? { ...voice, type: "square", detunePair: false } : voice);
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
    this.tone({ freq: 300, freqEnd: 240, dur: 0.04, vol: 0.05 });
  }

  // Hit position still maps to pitch, as the old 420 + rel·90 beep did.
  paddleBounce(relativeHit: number): void {
    if (!this.allow("paddle")) {
      return;
    }
    const base = 330 + relativeHit * 80;
    this.tone({ freq: base, freqEnd: base * 1.58, dur: 0.07, vol: 0.07 });
    this.tone({ freq: base, freqEnd: base * 1.58, dur: 0.07, vol: 0.05, detuneCents: 15 });
  }

  // Dull metallic clank: the brick survived.
  brickArmored(): void {
    if (!this.allow("brickArmored")) {
      return;
    }
    this.tone({ freq: 210, freqEnd: 180, dur: 0.05, vol: 0.08 });
    this.noise({ dur: 0.03, vol: 0.08, filter: { type: "highpass", freq: 3000 } });
  }

  // Row still maps to pitch, as the old 560 + (5-row)·45 beep did.
  brickDestroyed(row: number): void {
    if (!this.allow("brickDestroyed")) {
      return;
    }
    const base = 560 + (5 - row) * 45;
    this.tone({ freq: base * 1.15, freqEnd: base * 0.55, dur: 0.09, vol: 0.08 });
    this.noise({ dur: 0.05, vol: 0.12, filter: { type: "highpass", freq: 2500 } });
  }

  laserFire(): void {
    if (!this.allow("laser")) {
      return;
    }
    this.tone({ freq: 1700, freqEnd: 320, dur: 0.09, vol: 0.06 });
    this.tone({ freq: 2500, freqEnd: 480, dur: 0.07, vol: 0.03 });
  }

  // Springy up-twang — clearly not an ordinary wall.
  energyWallBounce(): void {
    if (!this.allow("energyWall")) {
      return;
    }
    this.tone({ freq: 140, freqEnd: 320, dur: 0.12, vol: 0.06 });
    this.tone({ freq: 140, freqEnd: 320, dur: 0.12, vol: 0.03, type: "sawtooth" });
  }

  // Subtle by design: with ?droprate=1 every brick fires it.
  capsuleSpawn(): void {
    if (!this.allow("capsuleSpawn")) {
      return;
    }
    this.tone({ freq: 220, dur: 0.03, vol: 0.03 });
  }

  capsulePickup(): void {
    if (!this.allow("capsulePickup")) {
      return;
    }
    [523, 659, 784].forEach((freq, index) => {
      this.tone({ freq, dur: 0.07, vol: 0.06, delayS: index * 0.04 });
    });
  }

  // A whole swarm arrives: longer, louder and brighter than the capsule chime,
  // with a detuned shadow for width.
  swarmPickup(): void {
    if (!this.allow("swarmPickup")) {
      return;
    }
    [392, 523, 659, 784, 1046].forEach((freq, index) => {
      this.tone({ freq, dur: 0.08, vol: 0.09, delayS: index * 0.035 });
      this.tone({ freq, dur: 0.08, vol: 0.05, delayS: index * 0.035, detuneCents: 12 });
    });
  }

  // A whoop through the wall: down, then straight back up out of the other side.
  // Both halves glide the whole time, so neither settles into a pitch.
  portalWarp(): void {
    if (!this.allow("portal")) {
      return;
    }
    this.tone({ freq: 1200, freqEnd: 300, dur: 0.09, vol: 0.05, type: "sawtooth" });
    this.tone({ freq: 300, freqEnd: 1200, dur: 0.09, vol: 0.05, type: "sawtooth", delayS: 0.04 });
  }

  // WALL arming: the bar writing itself out of the deck. A short rising pair
  // under a filtered breath — the charge, where `energyWallBounce` below is the
  // spend. The catch had no voice of its own before, which left the game's one
  // free life arriving in silence.
  energyWallCharge(): void {
    if (!this.allow("energyWallCharge")) {
      return;
    }
    this.tone({ freq: 180, freqEnd: 520, dur: 0.26, vol: 0.05, type: "triangle" });
    this.noise({ dur: 0.22, vol: 0.06, filter: { type: "bandpass", freq: 700, freqEnd: 2400, q: 3 } });
  }

  // The two mouths cutting themselves open, and pinching shut. A door is a
  // mechanism, so this is a mechanism: a short filtered rush with a low body
  // under it, rising as the aperture grows and falling as it closes. Distinct
  // from `portalWarp` above by having no pitched voice at all — the transit is
  // an event and this is the thing the events happen through.
  portalOpen(): void {
    if (!this.allow("portalDoor")) {
      return;
    }
    this.noise({ dur: 0.34, vol: 0.1, filter: { type: "bandpass", freq: 420, freqEnd: 2600, q: 2.4 } });
    this.tone({ freq: 90, freqEnd: 150, dur: 0.2, vol: 0.05, type: "triangle" });
  }

  portalShut(): void {
    if (!this.allow("portalDoor")) {
      return;
    }
    this.noise({ dur: 0.34, vol: 0.1, filter: { type: "bandpass", freq: 2600, freqEnd: 420, q: 2.4 } });
    this.tone({ freq: 150, freqEnd: 80, dur: 0.22, vol: 0.06, type: "triangle" });
  }

  // The wall going out of phase, and coming back. Two halves of one gesture:
  // noise opening upward as the bricks thin out, closing downward as they set.
  // Noise only — a pitched voice would make an event out of what is a change of
  // state, and the player has to hear the second one to know it is over.
  ghostFade(): void {
    if (!this.allow("ghostFade")) {
      return;
    }
    this.noise({ dur: 0.45, vol: 0.13, filter: { type: "bandpass", freq: 300, freqEnd: 3600, q: 1.2 } });
    this.noise({ dur: 0.3, vol: 0.07, filter: { type: "highpass", freq: 2200 } });
  }

  ghostSolidify(): void {
    if (!this.allow("ghostSolidify")) {
      return;
    }
    this.noise({ dur: 0.35, vol: 0.15, filter: { type: "bandpass", freq: 3600, freqEnd: 260, q: 1.2 } });
    this.noise({ dur: 0.08, vol: 0.12, filter: { type: "lowpass", freq: 700 } });
  }

  // BOMB: the paddle going up. Heavier and longer than BLAST's crater — a low
  // sawtooth falling away under a wide body and a debris tail, so it reads as
  // the deck itself rather than as one more brick.
  paddleExplode(): void {
    if (!this.allow("paddleBlast")) {
      return;
    }
    this.tone({ freq: 150, freqEnd: 28, dur: 0.8, vol: 0.13, type: "sawtooth" });
    this.tone({ freq: 150, freqEnd: 28, dur: 0.8, vol: 0.09, type: "sawtooth", detuneCents: 15 });
    this.noise({ dur: 0.09, vol: 0.34, filter: { type: "highpass", freq: 900 } });
    this.noise({ dur: 0.7, vol: 0.26, filter: { type: "lowpass", freq: 900, freqEnd: 50 } });
  }

  // The ground moving: a sawtooth sagging an octave under lowpassed noise, both
  // long enough to outlast the shake they answer. The row dies silently, as
  // ZAP's does — one rumble covers the whole event.
  quakeRumble(): void {
    if (!this.allow("quake")) {
      return;
    }
    this.tone({ freq: 90, freqEnd: 40, dur: 0.6, vol: 0.11, type: "sawtooth" });
    this.tone({ freq: 90, freqEnd: 40, dur: 0.6, vol: 0.08, type: "sawtooth", detuneCents: 15 });
    this.noise({ dur: 0.5, vol: 0.09, filter: { type: "lowpass", freq: 300, freqEnd: 50 } });
  }

  // One bite of the grub: a short chirp falling away under a click of noise,
  // small on purpose — it lands every 18 ticks for as long as the pet lives, and
  // anything with body to it would turn a row into a drum solo.
  critterBite(): void {
    if (!this.allow("critterBite")) {
      return;
    }
    this.tone({ freq: 240, freqEnd: 90, dur: 0.05, vol: 0.07 });
    this.noise({ dur: 0.03, vol: 0.09, filter: { type: "bandpass", freq: 1200 } });
  }

  // SPLIT: the deck cracking in two. Two short square drops a beat apart over a
  // click of noise — the second is the far half letting go, which is what makes
  // it a break rather than a thud.
  splitPickup(): void {
    if (!this.allow("split")) {
      return;
    }
    this.tone({ freq: 300, freqEnd: 120, dur: 0.09, vol: 0.07 });
    this.tone({ freq: 240, freqEnd: 90, dur: 0.09, vol: 0.06, delayS: 0.06 });
    this.noise({ dur: 0.04, vol: 0.1, filter: { type: "bandpass", freq: 900 } });
  }

  // SPLIT letting go: `splitPickup` the other way up, the way `rushRelease` is
  // `stasisRelease` the other way up. Two rises instead of two drops, and the
  // second one lands lower and louder — the far half arriving last is what made
  // the catch a break, and it arriving last again is what makes this a weld.
  deckWeld(): void {
    if (!this.allow("deckWeld")) {
      return;
    }
    this.tone({ freq: 120, freqEnd: 300, dur: 0.09, vol: 0.06 });
    this.tone({ freq: 90, freqEnd: 240, dur: 0.09, vol: 0.07, delayS: 0.06 });
    this.noise({ dur: 0.04, vol: 0.09, filter: { type: "bandpass", freq: 1400 } });
  }

  // The volley coming in: noise sliding out of the top of the band down to a
  // rumble, over a sawtooth falling the same way. One sound for all three rocks
  // — they fall together, and three of these would be a landslide. The bricks
  // they drill keep their own beeps.
  meteorFall(): void {
    if (!this.allow("meteor")) {
      return;
    }
    this.noise({ dur: 0.9, vol: 0.12, filter: { type: "bandpass", freq: 3000, freqEnd: 300 } });
    this.tone({ freq: 300, freqEnd: 60, dur: 0.9, vol: 0.08, type: "sawtooth" });
  }

  // A pinball bumper kick: a short pop rising an octave over a click of noise,
  // so a rally of them reads as a rhythm rather than as one held tone.
  bumperKick(): void {
    if (!this.allow("bumper")) {
      return;
    }
    this.tone({ freq: 660, freqEnd: 1320, dur: 0.06, vol: 0.07 });
    this.noise({ dur: 0.03, vol: 0.06, filter: { type: "bandpass", freq: 1800 } });
  }

  // A hole opening: a slow sawtooth climb under noise widening out of nothing.
  // Only the opening is heard — `Sound` has no loop, so a 6-second hum would
  // have to be re-triggered every tick, and the closing is silent by design.
  //
  // `size` is the hole's scale and it divides every frequency, so VORTEX at 1.5
  // opens a fifth under SINGULARITY. That interval is the only thing telling the
  // two apart by ear, and it is the right one: a bigger hole sounds lower.
  //
  // The throttle key carries the size, or a VORTEX caught in the same breath as
  // a SINGULARITY would be swallowed by the retrigger window and open silently.
  singularityOpen(size = 1): void {
    if (!this.allow(`singularity${size}`)) {
      return;
    }
    const freq = 60 / size;
    const freqEnd = 220 / size;
    this.tone({ freq, freqEnd, dur: 0.6, vol: 0.09, type: "sawtooth" });
    this.tone({ freq, freqEnd, dur: 0.6, vol: 0.06, type: "sawtooth", detuneCents: 15 });
    this.noise({ dur: 0.5, vol: 0.07, filter: { type: "bandpass", freq: 200 / size, freqEnd: 1800 / size } });
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
    this.noise({ dur: 0.006, vol: 0.32, delayS: lead, filter: { type: "highpass", freq: 5500 } });
    this.noise({ dur: 0.03, vol: 0.34, delayS: lead, filter: { type: "highpass", freq: 300 } });
    this.noise({
      dur: 0.07,
      vol: 0.18,
      delayS: lead,
      filter: { type: "bandpass", freq: 1900, freqEnd: 380, q: 1.4 },
    });
    this.noise({
      dur: 0.19,
      vol: 0.14,
      delayS: lead,
      filter: { type: "bandpass", freq: 5600, freqEnd: 900, q: 3 },
    });
    for (const [delayS, freq, vol] of CHAIN_ARC_SPUTTER) {
      this.noise({ dur: 0.013, vol, delayS: lead + delayS, filter: { type: "bandpass", freq, q: 11 } });
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
    this.tone({ freq: base, freqEnd: base / 1.58, dur: 0.07, vol: 0.06 });
    this.tone({ freq: base, freqEnd: base / 1.58, dur: 0.07, vol: 0.04, detuneCents: 15 });
  }

  // Time stopping: a long sawtooth fall with a detuned shadow beating against
  // it, under noise closing from bright to muffled.
  stasisFreeze(): void {
    if (!this.allow("stasisFreeze")) {
      return;
    }
    this.tone({ freq: 900, freqEnd: 90, dur: 0.35, vol: 0.08, type: "sawtooth" });
    this.tone({ freq: 900, freqEnd: 90, dur: 0.35, vol: 0.05, type: "sawtooth", detuneCents: 12 });
    this.noise({ dur: 0.35, vol: 0.1, filter: { type: "lowpass", freq: 1200, freqEnd: 200 } });
  }

  // The freeze run backwards, then a blip on the beat the balls move again.
  stasisRelease(): void {
    if (!this.allow("stasisRelease")) {
      return;
    }
    this.tone({ freq: 90, freqEnd: 900, dur: 0.2, vol: 0.07, type: "sawtooth" });
    this.tone({ freq: 660, dur: 0.08, vol: 0.07, delayS: 0.18 });
  }

  // RUSH letting go: stasisRelease run the other way up, because the event is the
  // other way round — the ball is coming back down to its own speed, not being
  // handed back its motion. The blip lands on the beat it is true again.
  rushRelease(): void {
    if (!this.allow("rushRelease")) {
      return;
    }
    this.tone({ freq: 880, freqEnd: 220, dur: 0.22, vol: 0.07, type: "sawtooth" });
    this.tone({ freq: 330, dur: 0.08, vol: 0.06, delayS: 0.2 });
  }

  /**
   * HAYWIRE's kick: a contact fault, four times a second.
   *
   * Short, dry and electrical — a square blip snapped down over a band-passed
   * tick, which is a relay chattering rather than a note. It has to survive
   * being heard twenty times in five seconds without becoming a melody or a
   * nuisance, so there is no pitch bend to follow and nothing sustains.
   *
   * `strength` is the same blend the kick's angle is scaled by, spent on volume
   * and on pitch together: the first and last kicks of a fault are quieter and
   * higher — a tick — and the ones in the middle land with weight. One number
   * for both, because a loud kick that barely turned the ball would be the
   * sound lying about the simulation.
   */
  haywireKick(strength: number): void {
    // A tighter window than the default: the cadence is 15 ticks (250 ms) and
    // the shared one would let a second HA caught mid-fault swallow a kick.
    if (!this.allow("haywireKick", 120)) {
      return;
    }
    const base = 210 + (1 - strength) * 320;
    this.tone({ freq: base, freqEnd: base * 0.7, dur: 0.05, vol: 0.035 + strength * 0.045, type: "square" });
    this.noise({
      dur: 0.05,
      vol: 0.03 + strength * 0.04,
      filter: { type: "bandpass", freq: 2600, freqEnd: 1100 },
    });
  }

  // The fault clearing: the kick's own chatter resolved into one settling tone
  // instead of a fanfare. The trap took nothing but the player's aim, so what
  // is owed at the end is the machine getting a grip again — nothing to
  // celebrate and nothing to mourn.
  haywireClear(): void {
    if (!this.allow("haywireClear")) {
      return;
    }
    this.noise({ dur: 0.14, vol: 0.05, filter: { type: "bandpass", freq: 2200, freqEnd: 500 } });
    this.tone({ freq: 260, freqEnd: 440, dur: 0.16, vol: 0.06, type: "square", delayS: 0.06 });
  }

  // ENGLISH: the whip, on top of the bounce that always plays. A short filtered
  // noise sweep rising as it opens — cloth going across cloth — with the
  // faintest sine under it so a hard shot has a body and a soft one is only air.
  //
  // Deliberately not a tone the player could mistake for a pickup: this fires
  // on every return for twenty seconds, and anything with a pitch to it would
  // turn the capsule into a metronome. `strength` is the shot as a fraction of
  // the clamp, so the loudness of the brush *is* how much curve went on — the
  // one number the player cannot read off the deck at the moment they throw it.
  englishWhip(strength: number): void {
    if (!this.allow("englishWhip", 60)) {
      return;
    }
    this.noise({
      dur: 0.07,
      vol: 0.02 + strength * 0.05,
      filter: { type: "bandpass", freq: 900 + strength * 700, freqEnd: 2600 + strength * 1400, q: 1.4 },
    });
    this.tone({ freq: 300 + strength * 180, freqEnd: 200, dur: 0.06, vol: strength * 0.03 });
  }

  // The cloth coming off the deck: the whip run backwards and softer, closing
  // its filter instead of opening it. No settling tone under it — a ball may
  // still be curving when this plays, and a resolved chord would be claiming
  // the effect is over when it is not.
  englishClear(): void {
    if (!this.allow("englishClear")) {
      return;
    }
    this.noise({ dur: 0.2, vol: 0.05, filter: { type: "bandpass", freq: 2400, freqEnd: 600, q: 1.4 } });
  }

  // SNAP: the paper going down. One dry tick with a higher one a frame behind
  // it — the sound an operating system makes when a setting is switched on, not
  // the sound of something being won. It is deliberately the smallest arrival
  // in the bank: the capsule changes how the field behaves and shows it with a
  // grid, and a fanfare over that would be the machine congratulating itself
  // for turning a ruler on.
  snapGridOn(): void {
    if (!this.allow("snapGridOn")) {
      return;
    }
    this.tone({ freq: 1080, dur: 0.03, vol: 0.05 });
    this.tone({ freq: 1620, dur: 0.02, vol: 0.03, delayS: 0.03 });
  }

  // The same tick a fifth lower and on its own, which is the setting going off
  // again. No second note: the pair above is the switch closing, and one note
  // is what is left when it opens.
  snapGridOff(): void {
    if (!this.allow("snapGridOff")) {
      return;
    }
    this.tone({ freq: 720, dur: 0.045, vol: 0.05 });
  }

  // ERODE: a second of dry stone giving way. A wide band sinking from a hiss to
  // a rumble, with a lower body under it — the mortar going out of the seams as
  // grit rather than the wall cracking, which is the thing GHOST's fade already
  // does and this capsule is the opposite of.
  //
  // Deliberately as long as the wear itself: the lanes take a full second to
  // open, and a catch sound that finished first would have the player looking
  // for a hole the wall has not cut yet.
  mortarGive(): void {
    if (!this.allow("mortarGive")) {
      return;
    }
    this.noise({ dur: 1, vol: 0.11, filter: { type: "bandpass", freq: 5200, freqEnd: 420, q: 0.9 } });
    this.noise({ dur: 0.7, vol: 0.06, filter: { type: "lowpass", freq: 900 } });
  }

  // The same grit run the other way and shorter, which is the wall taking its
  // mortar back — and, unlike its opposite above, only an announcement: the
  // cells close on their own clock and a cell with a ball in it closes later
  // still, so this is the moment the lanes stopped being promised.
  mortarSet(): void {
    if (!this.allow("mortarSet")) {
      return;
    }
    this.noise({ dur: 0.55, vol: 0.09, filter: { type: "bandpass", freq: 380, freqEnd: 2600, q: 1 } });
    this.tone({ freq: 150, dur: 0.12, vol: 0.05, delayS: 0.45 });
  }

  /**
   * SLUMP: girders letting go — a low body sagging through a minor third, with
   * a groan of filtered noise under it.
   *
   * Sine again, and beside JELLY's for the same reason and a different one: this
   * is metal giving way rather than a square-wave machine event, and the two
   * capsules are the roster's only pair that both start by a wall stopping
   * being a wall. They are kept apart by *direction* rather than by tone —
   * JELLY's catch sags and springs back twice, and this one sags and keeps
   * going, because that is exactly the difference between the two effects.
   *
   * Scored to the hesitation plus the first of the fall, so it is still sounding
   * when the wall actually moves.
   */
  slumpGive(): void {
    if (!this.allow("slumpGive")) {
      return;
    }
    this.tone({ freq: 196, freqEnd: 62, dur: 0.75, vol: 0.09, type: "sine" });
    this.noise({ dur: 0.55, vol: 0.07, filter: { type: "lowpass", freq: 1800, freqEnd: 320 } });
  }

  /**
   * One brick arriving, at whatever weight it arrived with.
   *
   * `force` is 0 for a column closing a one-row gap and 1 for a whole wall
   * coming down from the floor's full height, and it moves the volume, the
   * pitch and the body together — a landing is heard as mass, and a loud thin
   * tick would read as the brick breaking rather than as the brick stopping.
   *
   * One call covers the whole tick however many bricks landed in it: ninety-six
   * of these on the frame a fresh wall hits the floor is not a wall landing, it
   * is white noise.
   */
  slumpLand(force: number): void {
    if (!this.allow("slumpLand", 50)) {
      return;
    }
    const weight = Math.max(0, Math.min(1, force));
    this.tone({ freq: 150 - 40 * weight, dur: 0.07 + 0.05 * weight, vol: 0.04 + 0.05 * weight, type: "sine" });
    this.noise({
      dur: 0.06 + 0.06 * weight,
      vol: 0.05 + 0.06 * weight,
      filter: { type: "lowpass", freq: 900 - 300 * weight },
    });
  }

  // The mortar poured back in, running up the pile from the floor. A short rise
  // rather than the catch's fall, which is the capsule's own shape said twice:
  // it went down, the setting goes up.
  slumpSet(): void {
    if (!this.allow("slumpSet")) {
      return;
    }
    this.tone({ freq: 90, freqEnd: 340, dur: 0.55, vol: 0.06, type: "sine" });
    this.noise({ dur: 0.4, vol: 0.05, filter: { type: "bandpass", freq: 420, freqEnd: 2200, q: 1.1 } });
  }

  /**
   * JELLY: the wall going slack — a soft body sagging through a fifth and
   * wobbling back, twice, which is the sheet's two decaying overshoots heard
   * rather than watched.
   *
   * Sine and not the roster's usual square, and it is the only catch sound in
   * the game that is. Every other capsule announces itself with an edge because
   * the machine has edges; this one is announcing that the wall has stopped
   * having any, and a square wave saying "soft" would be the sound arguing with
   * the picture. The two voices are a fifth apart and the upper one is delayed
   * by half the first overshoot, so they beat rather than chord.
   *
   * Scored to the arrival: the slack takes twenty ticks to run in from the
   * frames and rings down over about as long again, and this runs out with it.
   */
  jellySlacken(): void {
    if (!this.allow("jellySlacken")) {
      return;
    }
    this.tone({ freq: 320, freqEnd: 96, dur: 0.62, vol: 0.09, type: "sine" });
    this.tone({ freq: 214, freqEnd: 72, dur: 0.5, vol: 0.06, type: "sine", delayS: 0.1 });
    this.noise({ dur: 0.3, vol: 0.04, filter: { type: "lowpass", freq: 600 } });
  }

  /**
   * TIDE: the field filling up — a long band of noise opening from a rumble to
   * a wash as the water climbs, under a tone that *rises* while it does.
   *
   * Almost all of it is noise, which is the only honest voice for water: a
   * pitched oscillator in a rushing sound reads as a beep however it is dressed,
   * and the one tone here is doing a different job — it rises through two thirds
   * of an octave and gets out of the way, which is the sea being seen to arrive
   * rather than the sea itself.
   *
   * Scored to the flood: 0.66 s is the forty ticks the water takes, so the wash
   * tops out on the frame the deck lifts off the rail.
   */
  tideFlood(): void {
    if (!this.allow("tideFlood")) {
      return;
    }
    this.noise({ dur: 0.66, vol: 0.1, filter: { type: "lowpass", freq: 280, freqEnd: 3200 } });
    this.tone({ freq: 140, freqEnd: 232, dur: 0.6, vol: 0.05, type: "sine" });
  }

  /**
   * And the field emptying — the same wash run the other way, with a gurgle
   * under it.
   *
   * The drain is longer than the flood and it is meant to be heard as a
   * *different event* rather than the arrival reversed: the band closes from the
   * top down while a low sine falls through a fifth, which is the sound of a
   * volume of water leaving through a hole rather than a level being lowered.
   * Scored to the fifty ticks, so it ends as the deck touches down and starts
   * dripping.
   */
  tideDrain(): void {
    if (!this.allow("tideDrain")) {
      return;
    }
    this.noise({ dur: 0.82, vol: 0.08, filter: { type: "lowpass", freq: 3000, freqEnd: 180 } });
    this.tone({ freq: 210, freqEnd: 70, dur: 0.8, vol: 0.06, type: "sine" });
    this.tone({ freq: 96, freqEnd: 48, dur: 0.3, vol: 0.05, type: "sine", delayS: 0.55 });
  }

  // The same body run the other way and half as long: the wall setting, from
  // the outer columns inward. Short and a little higher than the slack ended,
  // because what is being said is that the sheet has gone stiff — one small
  // fast tremor to leave, against the long slow one that arrived.
  jellySet(): void {
    if (!this.allow("jellySet")) {
      return;
    }
    this.tone({ freq: 110, freqEnd: 430, dur: 0.3, vol: 0.07, type: "sine" });
    this.tone({ freq: 880, dur: 0.03, vol: 0.04, delayS: 0.3 });
  }

  // One bounce off a trampoline: a short pitched blip that bends up as it goes,
  // which is the ball leaving faster than it arrived. Quiet, because it plays
  // on every single wall contact for ten seconds and the brick clank it
  // replaces was quieter still.
  jellyBounce(): void {
    if (!this.allow("jellyBounce", 40)) {
      return;
    }
    this.tone({ freq: 180, freqEnd: 520, dur: 0.08, vol: 0.05, type: "sine" });
  }

  /**
   * A brick bursting out of the sheet rather than off the ball.
   *
   * Deliberately *not* `brickDestroyed`, which fires alongside it on the same
   * tick through the ordinary damage path: that one is a hit landing, and this
   * is the wall failing somewhere nobody was aiming. A wet snap under it — the
   * low sine is the sheet letting go, the noise is what it was holding.
   */
  jellyTear(): void {
    if (!this.allow("jellyTear")) {
      return;
    }
    this.tone({ freq: 640, freqEnd: 130, dur: 0.14, vol: 0.07, type: "sine" });
    this.noise({ dur: 0.09, vol: 0.09, filter: { type: "bandpass", freq: 1400, freqEnd: 520, q: 1.2 } });
  }

  /**
   * GRAVEL: the dry rasp of a wall going to pieces without falling down.
   *
   * **A rasp and not a rumble**, which is the whole distance between this and
   * ERODE's `mortarGive` — the two capsules are next to each other in the
   * catalogue and neighbours on the wall, and the one thing they may not be is
   * hard to tell apart with the eyes shut. That one sinks from a hiss to a
   * rumble over a full second, because the mortar is *going somewhere*. This is
   * high, short and gritty and it stays there: nothing leaves the wall, the
   * faces simply crack.
   *
   * Scored to `gravelCrackTicks` — half a second — so the noise runs out on the
   * frame the fault reaches the last column.
   */
  gravelRasp(): void {
    if (!this.allow("gravelRasp")) {
      return;
    }
    this.noise({ dur: 0.5, vol: 0.1, filter: { type: "bandpass", freq: 2400, freqEnd: 3600, q: 1.4 } });
    this.tone({ freq: 220, dur: 0.09, vol: 0.05 });
  }

  // The faces closing again: the same grit run short and downward, and only an
  // announcement — the cracks heal along the wall on their own clock, from the
  // far end back. Quieter than the arrival by half, the way every ending in the
  // roster is: the player is being told a thing stopped, not sold one.
  gravelSettle(): void {
    if (!this.allow("gravelSettle")) {
      return;
    }
    this.noise({ dur: 0.35, vol: 0.06, filter: { type: "bandpass", freq: 3200, freqEnd: 1500, q: 1.4 } });
  }

  /**
   * One chip on the deck: the coin tick.
   *
   * A single high square, and short enough that sixty of them in a shower read
   * as a rattle rather than as a chord. The guard is the plain one on purpose —
   * a NOVA's worth of gravel arriving over half a second should be *heard* as
   * that much money, and the 30 ms window is what stops the ones landing on the
   * same frame from stacking into a single loud blip.
   *
   * Deliberately not the capsule chime's three-note run: that says "you have a
   * thing", and this is change falling into a hand.
   */
  gravelPip(): void {
    if (!this.allow("gravelPip")) {
      return;
    }
    this.tone({ freq: 1568, dur: 0.035, vol: 0.05 });
    this.tone({ freq: 2093, dur: 0.025, vol: 0.035, delayS: 0.02 });
  }

  /**
   * PYRE: the fire taking. A short noise sweep opening upward under two notes a
   * fifth apart — a match struck, then the deck catching.
   *
   * Its own sound instead of the pickup chime, because the chime says "you have
   * a thing" and this capsule's catch is two balls arriving already alight. The
   * sweep is `pyreEmberTicks` long to the frame, so the wash finishes rolling
   * over the deck on the tick the noise runs out and the crowns come up into
   * silence.
   */
  pyreLight(): void {
    if (!this.allow("pyreLight")) {
      return;
    }
    this.noise({ dur: 0.4, vol: 0.14, filter: { type: "bandpass", freq: 500, freqEnd: 3400, q: 1.2 } });
    this.tone({ freq: 196, dur: 0.12, vol: 0.09, type: "sawtooth" });
    this.tone({ freq: 294, dur: 0.16, vol: 0.07, type: "sawtooth", delayS: 0.1 });
  }

  // The crowns going out. The strike above run backwards, softer and slower —
  // the band closing rather than opening — and no note under it, because nothing
  // arrives at the end of this: what the player has left is whatever balls they
  // did not spend, and they are simply balls again.
  //
  // Long enough to cover the stagger rather than the fade: four crowns take 54
  // ticks to go out one after another, and a hiss that finished at the first
  // would say the capsule ended while three balls were still visibly alight.
  pyreGutter(): void {
    if (!this.allow("pyreGutter")) {
      return;
    }
    this.noise({ dur: 0.7, vol: 0.11, filter: { type: "bandpass", freq: 2600, freqEnd: 300, q: 1.2 } });
  }

  /**
   * One ball spent. Bigger than BLAST's pop and well short of the nuke's, which
   * is exactly where the crater sits between them: thirteen bricks against
   * BLAST's eight and the nuke's whole wall.
   *
   * The default retrigger window is what it wants and not a longer one: two
   * clicks are two balls and two craters, and 30 ms is under two frames — the
   * player cannot click inside it, so nothing they actually spend goes unheard.
   */
  pyreDetonation(): void {
    if (!this.allow("pyreDetonation")) {
      return;
    }
    this.tone({ freq: 150, freqEnd: 42, dur: 0.4, vol: 0.11, type: "sawtooth" });
    this.noise({ dur: 0.35, vol: 0.28, filter: { type: "lowpass", freq: 1200, freqEnd: 90 } });
  }

  // BANANA: the slip itself, not the catch — the womp already covered the pill.
  // A sawtooth slide-whistle up under a noise sweep opening the same way, which
  // is the cartoon the trap is, and short enough to be over before the deck is.
  bananaSlip(): void {
    if (!this.allow("banana")) {
      return;
    }
    this.tone({ freq: 180, freqEnd: 900, dur: 0.22, vol: 0.08, type: "sawtooth" });
    this.noise({ dur: 0.22, vol: 0.09, filter: { type: "bandpass", freq: 400, freqEnd: 3200, q: 2 } });
  }

  // BLACKOUT: a power-down. The sawtooth falls most of the way off the bottom
  // of the range under a noise burst closing its filter as it goes, which is
  // the sound of something switching off rather than one more trap womp.
  blackoutPickup(): void {
    if (!this.allow("blackout")) {
      return;
    }
    this.tone({ freq: 480, freqEnd: 60, dur: 0.35, vol: 0.09, type: "sawtooth" });
    this.noise({ dur: 0.3, vol: 0.12, filter: { type: "lowpass", freq: 1200, freqEnd: 120 } });
  }

  // GAMBLE's reel, one click per face. The ladder climbs as the drum runs down,
  // so the ear knows it is about to stop a beat before the eye does. Its own
  // guard key and nothing else in the bank shares it: the clicks are 100 ms
  // apart, and the shared 30 ms window would let a stray sound eat one.
  gambleReel(step: number): void {
    if (!this.allow("gambleReel")) {
      return;
    }
    this.tone({ freq: 660 + (10 - step) * 45, dur: 0.025, vol: 0.045 });
  }

  // And the drum stopping: a flat two-tone clunk under the face that won, a
  // fifth of a second before whatever it does actually happens.
  gambleLand(): void {
    if (!this.allow("gambleLand")) {
      return;
    }
    this.tone({ freq: 1245, dur: 0.05, vol: 0.06 });
    this.tone({ freq: 415, dur: 0.09, vol: 0.06, delayS: 0.03 });
  }

  // ANGEL: the save. A bright rising arpeggio over a hiss of feathers — the
  // one sound in the bank that plays where `ballLost` would have, so it has to
  // be unmistakably the opposite of a drain and land before the player has
  // finished bracing for one.
  angelSave(): void {
    if (!this.allow("angelSave")) {
      return;
    }
    this.arp([784, 988, 1319, 1568], 55, { detunePair: true });
    this.noise({ dur: 0.25, vol: 0.08, filter: { type: "highpass", freq: 4000 } });
  }

  // TURBO: winding up. A sawtooth climbing two and a half octaves over exactly
  // the half second the spool takes, doubled a few cents apart so it thickens
  // as it rises, and a bright note landing on the tick the balls reach speed.
  // The catch chime would have been over before any of that had happened.
  turboSpool(): void {
    if (!this.allow("turbo")) {
      return;
    }
    this.tone({ freq: 220, freqEnd: 1046, dur: 0.5, vol: 0.07, type: "sawtooth" });
    this.tone({ freq: 220, freqEnd: 1046, dur: 0.5, vol: 0.04, type: "sawtooth", detuneCents: 14 });
    this.tone({ freq: 1319, dur: 0.09, vol: 0.06, delayS: 0.48 });
  }

  // FLIP: the machine going over. `capsulePickup`'s three notes walked back
  // down and one further, on a sawtooth so nothing about it reads as a bonus,
  // paced across the half second the field takes to come round — then a low
  // knock on the beat it lands. The arp is the turn; the knock is the stop.
  flipPickup(): void {
    if (!this.allow("flip")) {
      return;
    }
    this.arp([784, 659, 523, 392], 110, { type: "sawtooth", vol: 0.06, noteDurS: 0.1 });
    this.tone({ freq: 130, freqEnd: 80, dur: 0.12, vol: 0.08, type: "sawtooth", delayS: 0.44 });
  }

  // And back the other way up, because the event is the other way round: the
  // field is being handed back, and the knock is it settling upright again.
  flipRelease(): void {
    if (!this.allow("flip")) {
      return;
    }
    this.arp([392, 523, 659, 784], 110, { type: "sawtooth", vol: 0.06, noteDurS: 0.1 });
    this.tone({ freq: 130, freqEnd: 80, dur: 0.12, vol: 0.08, type: "sawtooth", delayS: 0.44 });
  }

  // Detune-beat "womp": the two layers drift apart as they fall. Every trap
  // catch gets it — one sound for the tier, not one per capsule.
  malusPickup(): void {
    if (!this.allow("malus")) {
      return;
    }
    this.tone({ freq: 392, freqEnd: 196, dur: 0.15, vol: 0.06, type: "sawtooth" });
    this.tone({ freq: 388, freqEnd: 194, dur: 0.15, vol: 0.05 });
  }

  // One boom for the whole chain; splash kills are individually silent.
  blastExplosion(): void {
    if (!this.allow("blast")) {
      return;
    }
    this.noise({ dur: 0.25, vol: 0.3, filter: { type: "lowpass", freq: 800, freqEnd: 150 } });
    this.tone({ freq: 120, freqEnd: 60, dur: 0.15, vol: 0.1 });
  }

  // Bigger and longer than BLAST; replaces both the pickup jingle and the
  // ~70 per-brick beeps a full-field sweep would otherwise fire.
  nukeDetonation(): void {
    if (!this.allow("nuke")) {
      return;
    }
    this.tone({ freq: 120, freqEnd: 30, dur: 0.7, vol: 0.12, type: "sawtooth" });
    this.tone({ freq: 120, freqEnd: 30, dur: 0.7, vol: 0.08, type: "sawtooth", detuneCents: 15 });
    this.noise({ dur: 0.6, vol: 0.25, filter: { type: "lowpass", freq: 400, freqEnd: 60 } });
  }

  // Rising 1UP fanfare — brighter than the capsule chime, shorter than a jingle.
  extraLife(): void {
    if (!this.allow("extraLife")) {
      return;
    }
    this.arp([659, 784, 988, 1319], 45, { detunePair: true });
  }

  ballLost(): void {
    if (!this.allow("ballLost")) {
      return;
    }
    this.tone({ freq: 290, freqEnd: 52, dur: 0.6, vol: 0.09, type: "sawtooth" });
    this.tone({ freq: 296, freqEnd: 55, dur: 0.6, vol: 0.06, type: "sawtooth" });
  }

  launch(): void {
    if (!this.allow("launch")) {
      return;
    }
    this.noise({ dur: 0.15, vol: 0.08, filter: { type: "bandpass", freq: 400, freqEnd: 2000 } });
    this.tone({ freq: 520, dur: 0.05, vol: 0.04 });
  }

  // Two effects becoming a third: a bright major arpeggio, quick enough to read
  // as one event rather than a jingle. Guarded, because two combos can form on
  // the same catch and one fusion chord is the announcement, not two.
  comboFuse(): void {
    if (!this.allow("comboFuse")) {
      return;
    }
    this.arp([523, 784, 1046], 40, { detunePair: true });
  }

  gameStart(): void {
    this.arp([392, 523, 659], 60, { detunePair: true });
  }

  levelClear(): void {
    this.arp([523, 659, 784, 1046], 60, { detunePair: true });
  }

  // Square melody with a quiet sawtooth shadow — more somber than the other jingles.
  gameOver(): void {
    this.arp([392, 330, 262, 196], 130, { detunePair: true });
    this.arp([392, 330, 262, 196], 130, { type: "sawtooth", vol: 0.03, noteDurS: 0.12 });
  }

  pauseToggle(): void {
    this.tone({ freq: 300, dur: 0.05, vol: 0.04 });
  }

  uiKeyClick(): void {
    this.tone({ freq: 700, dur: 0.035, vol: 0.03 });
  }
}
