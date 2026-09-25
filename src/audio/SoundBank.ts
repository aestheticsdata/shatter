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
  /**
   * THE TEAR: a drop leaving the lid.
   *
   * A sine drip, falling a full octave — soft enough to sit under a rally and
   * distinct enough that a player who has learned it knows a tear has started
   * without looking at the corner. It is the only sound on a veil that is a
   * *warning without a threat*: nothing has happened yet.
   *
   * It was 900 → 620 and is 1320 → 660 (SHA-177). `superposeCollapse` is a sine
   * falling 880 → 590 at the same volume — 39 cents off it at the top and 86 at
   * the bottom, which is the same sound — and an echo is struck several times a
   * rally while SUPERPOSE is up. The octave is also what takes it off
   * `brickDestroyed`'s top row, which sweeps 903 → 431. Nothing else in the bank
   * falls a whole octave in a sine, and that is now the drip's signature.
   */
  tearFalls(): void {
    this.tone({ freq: 1320, freqEnd: 660, dur: 0.12, vol: 0.03, type: "sine" });
  }

  /** THE TEAR: one burst in the air. A high square pip, and it is over. */
  tearBursts(): void {
    this.tone({ freq: 1000, dur: 0.06, vol: 0.04 });
  }

  /**
   * THE TEAR: one reached the floor, and there is a new creature on the band.
   *
   * A low square knock, long for what it is — the opposite end of the register
   * from the burst, because these are the two answers to the same question and
   * the player should be able to tell which one they got with their eyes on the
   * ball.
   */
  tearHatches(): void {
    this.tone({ freq: 200, dur: 0.2, vol: 0.05 });
  }

  /**
   * THE WRATH: a hole in the wall closed up again.
   *
   * A dull square knock, lower and shorter than the hatch — the deadest sound
   * in the bank, and deliberately so. What has happened is that a brick came
   * back, which is a small, flat, unwelcome fact; a bright sound would make it
   * read as a reward. It is also the only cue a player who is watching the ball
   * gets, since the brick it announces is somewhere they are not looking.
   *
   * 110 and not the 160 it was written at (SHA-177): `mortarSet` is a flat
   * square knock at 150 for 0.12 s, a semitone and twenty milliseconds away,
   * and MORTAR can be in hand on THE WRATH like any other capsule. Going down
   * rather than up because the one cue for a mechanic the player cannot see has
   * to be unmistakable, and *deader* is the direction this sound already wanted.
   */
  wallScars(): void {
    this.tone({ freq: 110, dur: 0.09, vol: 0.045 });
  }

  /**
   * THE LID: the tenth seal cell dies and the Observer comes awake.
   *
   * **Five notes climbing out of the bottom of the bank**, slowly, and it is
   * the only sound in the game that starts below the bass of anything else. The
   * whole register of the Observer's cues has been upward and bright — the
   * plaques, the door, the visit — and this is that phrase inverted and dragged
   * down, so the one moment the eye acts on its own initiative sounds like
   * something much larger than the player turning over.
   */
  observerWakes(): void {
    this.arp([110, 147, 196, 262, 349], 90);
  }

  /**
   * THE LID: twenty-four hits, and the loop is over.
   *
   * Six notes up two octaves, the longest and highest climb in the bank —
   * longer than the pupil's four inside the eye, because that was a room the
   * player walked out of and this is the last brick of the last level of the
   * loop. It answers `observerWakes` note for note in the other direction.
   *
   * Its first four notes are `levelClear`, exactly, and then it keeps going.
   * That is deliberate and it is the reason the notes are these: this card is
   * played *instead* of the clear, so the phrase the player has heard at the end
   * of forty-two levels starts, and this time it does not stop where it always
   * has. Nothing else in the bank is allowed to quote it — see `eyeOpens`.
   */
  observerBlinded(): void {
    this.arp([523, 659, 784, 1046, 1318, 1568], 110, { detunePair: true });
  }

  /**
   * THE LID: one cell of the seal, with how far along the ten it is.
   *
   * A dull knock rising a little each time, so the player hammering a plate
   * with no way to see which cell is the tenth can hear that they are getting
   * somewhere. Nine rungs, 330 up to 570 — 165 cents apart at the bottom, which
   * is the smallest step in this bank an ear reliably hears as a step.
   *
   * **A triangle, and the only one on this level.** It was a square at
   * 180 + progress × 140 (SHA-177): the first rung landed at 194, and every
   * first hit on every bronze brick of THE LID's plate plays `brickArmored`, a
   * square sweeping 210 → 180. A milestone heard ten times in a level cannot
   * share a voice with the sound of an ordinary hit on the level's own brick.
   * Low rather than bright because the thing being cut is a bronze plate.
   */
  sealBroken(progress: number): void {
    this.tone({ freq: 300 + progress * 300, dur: 0.13, vol: 0.06, type: "triangle" });
  }

  /**
   * THE IRIS: the gaze winding up.
   *
   * A single high sine ping — a pure tone in a bank of squares and sawtooths,
   * which is what makes it carry through a rally without being loud. It is the
   * sound of being *looked at*, and the three quarters of a second after it are
   * the whole of the warning the player gets.
   *
   * 1568 and not 1200 (SHA-177). `heisenObserve` is also a bare sine, at 1046,
   * and HEISEN fires it every time the player looks at the ball — a whole tone
   * away and several times a second is a warning buried under a habit. At 1568
   * it is the highest sine in the bank by a fifth, which is where a sound that
   * means *something is about to happen to you* belongs anyway.
   */
  gazeCharges(): void {
    this.tone({ freq: 1568, dur: 0.11, vol: 0.035, type: "sine" });
  }

  /**
   * THE IRIS: the beam.
   *
   * A low sawtooth drone held for the length of the fire, so the danger is
   * audible for exactly as long as it is real. Nothing pitched over it: the beam
   * is a pressure, not an impact, and a note would make it an event that had
   * already finished.
   */
  gazeFires(): void {
    this.tone({ freq: 90, dur: 0.35, vol: 0.05, type: "sawtooth" });
  }

  /**
   * THE IRIS: caught, and the deck is stone.
   *
   * The lowest, longest sound in the bank — a sawtooth thud that falls away
   * under everything else still playing. It is the one sound here that is about
   * something being taken rather than given, and it wants to be felt rather than
   * heard.
   */
  petrified(): void {
    this.tone({ freq: 70, freqEnd: 48, dur: 0.4, vol: 0.06, type: "sawtooth" });
  }

  /**
   * THE STAIRS: the lightning reaches the bottom of the bolt (SHA-204).
   *
   * A crack and then the roll: a short bright noise burst for the strike and a
   * low one under it closing its filter, which is thunder rather than an
   * explosion because nothing is thrown — the field only lights up.
   */
  eyeStrike(): void {
    if (!this.allow("eyeStrike")) {
      return;
    }
    this.noise({ dur: 0.08, vol: 0.12, filter: { type: "highpass", freq: 2000 } });
    this.noise({ dur: 0.6, vol: 0.14, filter: { type: "lowpass", freq: 700, freqEnd: 60 }, delayS: 0.04 });
  }

  /**
   * JELLYFISH: stung, and the deck is numb (SHA-245).
   *
   * `petrified`'s little cousin: a zap that falls away fast, over a short
   * crackle — something sharp touched the deck, and it is lighter and higher
   * than the stone because it takes less and is over sooner.
   */
  deckStung(): void {
    if (!this.allow("deckStung")) {
      return;
    }
    this.tone({ freq: 1400, freqEnd: 260, dur: 0.16, vol: 0.05, type: "square" });
    this.noise({ dur: 0.12, vol: 0.06, filter: { type: "highpass", freq: 2400 } });
  }

  /**
   * INSIDE THE EYE: the door taken, and the room on the other side of it.
   *
   * A four-note arp climbing an octave and a half, and the only sound in the
   * bank that is answered by another — `eyeSpitsOut` is the same distance
   * travelled the other way. Going in and coming out have to be one gesture in
   * two halves, or the visit is a place the player arrives at rather than one
   * they go to and come back from.
   */
  eyeEnter(): void {
    this.arp([392, 523, 784, 1046], 80, { detunePair: true });
  }

  /**
   * INSIDE THE EYE: spat back out, whichever way it ended badly.
   *
   * A low sawtooth falling away — the same voice the oculi's rasp uses, because
   * it is the same sentence: something that was open is not any more. Not played
   * on the kill, which has its own arp and does not need to be told off for
   * winning.
   */
  eyeSpitsOut(): void {
    this.tone({ freq: 160, freqEnd: 90, dur: 0.25, vol: 0.05, type: "sawtooth" });
  }

  /**
   * INSIDE THE EYE: the pupil struck.
   *
   * `damage` is how far through it is, 0 to 1, and it *rises* with the damage —
   * so the fight climbs a scale as it goes, and a player who cannot look at the
   * bar under an orbiting disc can hear how close it is.
   */
  pupilStruck(damage: number): void {
    this.tone({ freq: 220 + damage * 480, dur: 0.06, vol: 0.055 });
  }

  /**
   * INSIDE THE EYE: the pupil dead, and two stars in the sky for it.
   *
   * Four notes that **start** where `eyeEnter` left off and climb an octave
   * past it — the visit resolving higher than it began, and the highest arp in
   * the bank, as the largest thing a player can do on a veil short of blinding
   * the eye should be.
   *
   * It was 784 / 988 / 1175 / 1568 (SHA-177), which is `angelSave` with one
   * note changed: same first two, same last, four notes, both bright climbs,
   * both meaning *that went well*. ANGEL is a capsule and can be in hand on any
   * veil, and the one sound in the game that means a life was not lost may not
   * have a near-twin. Nothing here is within a semitone of it now.
   */
  pupilKilled(): void {
    this.arp([1046, 1318, 1568, 2093], 90, { detunePair: true });
  }

  /**
   * THE OCULI: one plaque in, and the ladder it is a rung of.
   *
   * A note per plaque, rising — so the three of them in order are a phrase the
   * ear can finish, and a player who is one rung along can *hear* which rung.
   * That is the whole job: the combination's state is on the field in gold, and
   * this is the same fact for a player watching the ball instead.
   *
   * The ladder ran 700 / 860 / 1020 and now runs 1397 / 1687 / 1977 (SHA-177),
   * **above the chain ladder's ceiling and not through it**. `chainStep` is
   * `600 + multiplier * 70` in the same flat square, so at the cap of eight it
   * reaches 1160 and on the way it passes 1020 — which is what the middle
   * plaque used to be, to the hertz. A plaque is a brick hit, a brick hit can
   * be the third hit of a chain step, and those two were one note on one tick.
   * The chain is the layer that sits under everything else; the plaques are the
   * one that has to cut through, so the plaques are what moved. Raising
   * `chain.cap` raises that ceiling by 70 Hz a step: it has 322 cents of room.
   */
  oculusTaken(index: number): void {
    this.tone({ freq: 1397 + index * 290, dur: 0.07 });
  }

  /**
   * THE OCULI: the wrong one, or a window let go.
   *
   * A low sawtooth rasp, the only one in the bank — everything else here is a
   * square or a filtered noise, so this is the machine making a sound it does
   * not otherwise make. It says *undone* rather than *wrong*: long, falling, and
   * over before the ball has crossed the field.
   */
  oculiReset(): void {
    if (!this.allow("oculiReset")) {
      return;
    }
    this.tone({ freq: 120, freqEnd: 70, dur: 0.14, vol: 0.05, type: "sawtooth" });
  }

  /**
   * THE OCULI: the eye opens.
   *
   * Five notes of fifths and octaves and nothing else — G, D, G, D, G across two
   * octaves. The longest climb in the bank, because this is the only door in the
   * game a ball can go through, and the ten seconds it stays open start on the
   * last note.
   *
   * It was 523 / 659 / 784 / 988 / 1175 (SHA-177), whose first three notes are
   * `levelClear` exactly and whose fourth is a semitone off it. That phrase
   * means *the board is won* and this one fires mid-rally, which is the worst
   * possible moment to tell a player something they have finished. The hollow
   * version has no third in it at all, so it cannot be mistaken for a fanfare —
   * and it opens on `eyeEnter`'s own root, because the door and going through
   * the door should be in one key.
   */
  eyeOpens(): void {
    this.arp([392, 587, 784, 1175, 1568], 70, { detunePair: true });
  }

  /**
   * THE BROOD: a beast struck and turned into the next thing.
   *
   * A two-note rise, pitched off the form it is *becoming*, so the ear hears
   * the same event escalate: an egg hatching is the lowest of the three and a
   * hatchling taking wing the highest. Rising rather than falling because
   * nothing here has been destroyed — the thing the player just hit got worse.
   */
  beastStruck(form: number): void {
    this.arp([440 + form * 120, 660 + form * 120], 45);
  }

  /**
   * THE BROOD: a wyvern down, and a star lit.
   *
   * A three-note arp up, the only one in the bank that resolves an octave and a
   * half above where it started — this is the largest thing a player can do on
   * a veil short of blinding the eye, and it is the sound the diadem is lit to.
   */
  beastKilled(): void {
    this.arp([880, 1175, 1568], 70, { detunePair: true });
  }

  /**
   * THE CHAMBER (SHA-179): a gate in a side bar parting.
   *
   * A mechanical slide and two short clicks — the latch going and the bar
   * reaching the end of its travel — so the ear knows something is coming in
   * before the eye has found which side. Noise for the slide and two bare
   * squares for the clicks: a click with a pitch to it is a beep.
   */
  gateOpens(): void {
    if (!this.allow("gate")) {
      return;
    }
    this.noise({ dur: 0.09, vol: 0.05, filter: { type: "bandpass", freq: 900, freqEnd: 2200, q: 3 } });
    this.tone({ freq: 1900, dur: 0.012, vol: 0.05 });
    this.tone({ freq: 1500, dur: 0.012, vol: 0.05, delayS: 0.09 });
  }

  /**
   * PHOTON: taken by a ball. A high blip chirping down — light going into
   * something rather than off it — short enough to sit under a brick's break
   * landing on the same tick.
   */
  photonAbsorbed(): void {
    if (!this.allow("photon")) {
      return;
    }
    this.tone({ freq: 2600, freqEnd: 900, dur: 0.07, vol: 0.05 });
    this.tone({ freq: 3900, freqEnd: 1350, dur: 0.05, vol: 0.02 });
  }

  /**
   * ELECTRON: knocked out of its orbit. A knock — a detuned pair, very short,
   * lower than the photon and harder — so the ear tells a shield going from a
   * speck being taken.
   */
  electronKnocked(): void {
    if (!this.allow("electron")) {
      return;
    }
    this.tone({ freq: 1250, freqEnd: 1100, dur: 0.035, vol: 0.06 });
    this.tone({ freq: 1250, freqEnd: 1100, dur: 0.035, vol: 0.05, detuneCents: 35 });
  }

  /**
   * A photon set loose: an electron whose brick died under it. The absorption
   * run the other way — a low blip chirping up — because it is the same light
   * leaving something rather than going into it.
   */
  photonLaunch(): void {
    if (!this.allow("photonLaunch")) {
      return;
    }
    this.tone({ freq: 900, freqEnd: 2600, dur: 0.07, vol: 0.045 });
    this.tone({ freq: 1350, freqEnd: 3900, dur: 0.05, vol: 0.018 });
  }

  /**
   * NUCLEUS: split. A low thud and a rising pair over it — something heavy
   * breaking into two lighter things — the lowest sound a particle makes short
   * of the antiball's.
   */
  nucleusSplit(): void {
    if (!this.allow("nucleus")) {
      return;
    }
    this.tone({ freq: 140, freqEnd: 70, dur: 0.12, vol: 0.1 });
    this.noise({ dur: 0.06, vol: 0.08, filter: { type: "lowpass", freq: 600 } });
    this.tone({ freq: 440, freqEnd: 660, dur: 0.06, vol: 0.04, delayS: 0.03 });
    this.tone({ freq: 554, freqEnd: 831, dur: 0.06, vol: 0.04, delayS: 0.07 });
  }

  /**
   * ANTIBALL: annihilation. A womp with a noise burst — the trap catch's
   * detuned sawtooth family, pitched down and made big — and the loudest thing
   * a particle does, because it is the one that can cost a life.
   */
  annihilation(): void {
    if (!this.allow("annihilation")) {
      return;
    }
    this.tone({ freq: 330, freqEnd: 55, dur: 0.35, vol: 0.1, type: "sawtooth" });
    this.tone({ freq: 326, freqEnd: 54, dur: 0.35, vol: 0.08, type: "sawtooth", detuneCents: 20 });
    this.noise({ dur: 0.3, vol: 0.28, filter: { type: "lowpass", freq: 2400, freqEnd: 120 } });
  }

  /** A daughter gone: a pop, short and dry. */
  daughterPops(): void {
    if (!this.allow("daughter")) {
      return;
    }
    this.tone({ freq: 700, freqEnd: 260, dur: 0.05, vol: 0.06 });
    this.noise({ dur: 0.03, vol: 0.07, filter: { type: "bandpass", freq: 1400 } });
  }

  /**
   * CHAIN: one step up the ladder.
   *
   * A bare square note, 70 Hz a step, so the eighth sits a little over an octave
   * above the first and the ear learns the ramp without ever being told what it
   * is counting. Nothing under it: the hit that earned the step is already
   * playing its own brick sound on this tick, and this is the layer on top.
   *
   * No retrigger guard. A step is three hits apart by construction, and the
   * guard exists for events that can land twice in one frame.
   */
  chainStep(multiplier: number): void {
    this.tone({ freq: 600 + multiplier * 70, dur: 0.05, vol: 0.04 });
  }

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

  /**
   * UMBRA's sun coming up: a long low swell that opens rather than strikes.
   *
   * A rising sine under a noise wash whose filter opens, which is the one shape
   * in this bank that has no attack at all — there is no impact to report,
   * something is simply *there* that was not. Scored to the thirty ticks the
   * twelve wedges take to unfold, so it finishes as the last column lands.
   */
  umbraRise(): void {
    if (!this.allow("umbraRise")) {
      return;
    }
    this.noise({ dur: 0.5, vol: 0.06, filter: { type: "lowpass", freq: 200, freqEnd: 1400 } });
    this.tone({ freq: 62, freqEnd: 124, dur: 0.5, vol: 0.06, type: "sine" });
    this.tone({ freq: 186, freqEnd: 248, dur: 0.34, vol: 0.03, type: "sine", delayS: 0.14 });
  }

  /**
   * And the light going: the same two voices falling, half as long.
   *
   * Deliberately not the rise reversed. The arrival opens into the room and
   * this one leaves it — the sine falls through an octave while the filter
   * shuts, which is a light going out rather than a light coming on played
   * backwards. It is scored to the sunset the shadows spend running off the
   * bottom of the field, so the room is quiet before the wedges are gone.
   */
  umbraSet(): void {
    if (!this.allow("umbraSet")) {
      return;
    }
    this.noise({ dur: 0.4, vol: 0.05, filter: { type: "lowpass", freq: 1400, freqEnd: 160 } });
    this.tone({ freq: 124, freqEnd: 58, dur: 0.44, vol: 0.06, type: "sine" });
  }

  /**
   * A ball meeting a shadow: soft on the way in, bright on the way home.
   *
   * Two halves because the event is two things — the rebound, which comes off a
   * surface that is not there in any material sense and so has no clank in it,
   * and the band arriving at the brick a tenth of a second later, which does.
   * The delay is `surgeTicks` in seconds, so the report lands with the flash.
   *
   * Quiet at the mouth, because a wedge can be worked for several contacts a
   * second and the clank it stands in for was quieter still.
   */
  umbraStrike(): void {
    if (!this.allow("umbraStrike", 40)) {
      return;
    }
    this.tone({ freq: 210, freqEnd: 150, dur: 0.06, vol: 0.04, type: "sine" });
    this.tone({ freq: 620, freqEnd: 940, dur: 0.07, vol: 0.05, type: "triangle", delayS: 0.1 });
  }

  /**
   * SUPERPOSE arriving: one voice becoming two.
   *
   * A single sine that splits into a pair a few cents apart and beats against
   * itself — which is the capsule stated in sound, and is also the one thing
   * two oscillators do that one cannot. The detune is small enough that what is
   * heard is the beating rather than a chord: a chord is two notes, and the
   * claim here is that it is one note in two places.
   *
   * Scored to the ten ticks the split takes plus the stagger across the wall,
   * so it finishes about when the far corner does.
   */
  superposeSplit(): void {
    if (!this.allow("superposeSplit")) {
      return;
    }
    this.tone({ freq: 330, dur: 0.46, vol: 0.05, type: "sine" });
    this.tone({ freq: 334, dur: 0.46, vol: 0.05, type: "sine", delayS: 0.04 });
    this.noise({ dur: 0.2, vol: 0.03, filter: { type: "highpass", freq: 900, freqEnd: 2600 } });
  }

  /**
   * And the echoes coming home: the beat resolving.
   *
   * The same two voices, the detuned one sliding onto the other so the beating
   * slows and stops — a pair becoming a single note. Deliberately not the
   * arrival reversed, for the reason `umbraSet` is not: the arrival opens into
   * two and this closes into one, and both have to be heard as their own
   * event.
   */
  superposeMerge(): void {
    if (!this.allow("superposeMerge")) {
      return;
    }
    this.tone({ freq: 330, dur: 0.2, vol: 0.05, type: "sine" });
    this.tone({ freq: 336, freqEnd: 330, dur: 0.2, vol: 0.05, type: "sine" });
  }

  /**
   * A pair collapsing: the short, dry half of the event.
   *
   * The brick's own hit is already playing under this — the echo routes through
   * `damageBrick` like any other ball contact — so this is only what the *echo*
   * costs, and it has to sit under the clank rather than beside it. A single
   * high blip falling away, no body and no tail: something that was there
   * stopped being there, and the brick behind it makes all the noise.
   *
   * The window is tight because the wall can hand over several pairs a second
   * early in the capsule, and 96 of these at the roster's default retrigger
   * would be a rattle.
   */
  superposeCollapse(): void {
    if (!this.allow("superposeCollapse", 30)) {
      return;
    }
    this.tone({ freq: 880, freqEnd: 590, dur: 0.05, vol: 0.035, type: "sine" });
  }

  /**
   * COLLAPSE arriving: the wall losing definition.
   *
   * Noise with a lowpass **closing** over it and no attack at all — the opposite
   * shape to `umbraRise`, which opens one. What is being said is that something
   * is going out of focus, and a filter shutting on a wash is exactly that: the
   * detail leaves first and the body of the sound stays, which is what happens
   * to the wall.
   *
   * No tone under it, deliberately. Every other arrival on this board has a
   * pitched voice somewhere in it; a trap whose subject is *loss of definition*
   * is the one place a clean note would contradict the picture.
   */
  collapseFog(): void {
    if (!this.allow("collapseFog")) {
      return;
    }
    this.noise({ dur: 0.62, vol: 0.07, filter: { type: "lowpass", freq: 2600, freqEnd: 180 } });
  }

  /**
   * And the wall condensing: the same wash with the filter opening again,
   * shorter, with the note the arrival refused arriving at the end of it.
   *
   * The tone is the point — it is the only pitched thing in the capsule, and it
   * lands as the last course comes back. A trap ending should be audible as
   * something being handed over.
   */
  collapseCondense(): void {
    if (!this.allow("collapseCondense")) {
      return;
    }
    this.noise({ dur: 0.26, vol: 0.05, filter: { type: "lowpass", freq: 200, freqEnd: 3000 } });
    this.tone({ freq: 196, freqEnd: 294, dur: 0.2, vol: 0.05, type: "triangle", delayS: 0.08 });
  }

  /**
   * One brick snapping solid — a pass through it, or a laser bolt spent on it.
   *
   * The most-repeated sound in the capsule by a wide margin: a ball crossing a
   * fogged wall solves three or four cells on the way through and comes back
   * for more, so this is a *tick* and not an event. Short, dry, quiet and
   * high, with a retrigger window tight enough that a fast crossing reads as a
   * run of them rather than one smear.
   */
  collapseSolve(): void {
    if (!this.allow("collapseSolve", 25)) {
      return;
    }
    this.tone({ freq: 430, freqEnd: 660, dur: 0.04, vol: 0.03, type: "triangle" });
  }

  /**
   * TWIN arriving: the wall wiring itself up.
   *
   * Two voices a fifth apart sliding *toward* each other and landing on the
   * same note — the threads growing from both ends and meeting in the middle,
   * stated in sound. It is close enough to `superposeSplit` to be worth saying
   * why it is not the same: that one is one voice becoming two and beating
   * against itself, and this is two becoming one. They are opposite shapes, and
   * the capsules are opposite claims — one wall in two places against two
   * bricks in one fate.
   *
   * Scored to the fifteen ticks the threads take to close, so the note lands
   * about when the field finishes being drawn.
   */
  twinWeave(): void {
    if (!this.allow("twinWeave")) {
      return;
    }
    this.tone({ freq: 262, freqEnd: 349, dur: 0.26, vol: 0.05, type: "sine" });
    this.tone({ freq: 466, freqEnd: 349, dur: 0.26, vol: 0.045, type: "sine" });
    this.noise({ dur: 0.18, vol: 0.025, filter: { type: "highpass", freq: 1200, freqEnd: 3200 } });
  }

  /**
   * One link discharging: the damage crossing the field.
   *
   * **Two blips, the second a beat behind the first**, which is the only thing
   * in this bank that is a *distance* rather than an event. The brick's own hit
   * is already playing under the first of them — the struck half went through
   * `damageBrick` like any other contact — so what this adds is the answer
   * arriving somewhere else, and the gap is what says somewhere else.
   *
   * The window is tight because a NUKE under a live TWIN can spend four couples
   * on one tick, and four of these at the roster's default retrigger would be a
   * rattle rather than four links.
   */
  twinStrike(): void {
    if (!this.allow("twinStrike", 30)) {
      return;
    }
    this.tone({ freq: 740, freqEnd: 620, dur: 0.045, vol: 0.035, type: "triangle" });
    this.tone({ freq: 620, freqEnd: 740, dur: 0.045, vol: 0.035, type: "triangle", delayS: 0.07 });
  }

  /**
   * And the threads letting go: the tension coming off.
   *
   * One voice sliding *down* with nothing under it — deliberately not the
   * arrival reversed, for the reason `superposeMerge` is not: the arrival is
   * two ends finding each other and this is a rope going slack, and both have
   * to be heard as their own event. The slide is the whole of it, because the
   * picture is a fall and a fall has no attack.
   */
  twinSlack(): void {
    if (!this.allow("twinSlack")) {
      return;
    }
    this.tone({ freq: 349, freqEnd: 131, dur: 0.34, vol: 0.045, type: "sine" });
  }

  // The same body run the other way and half as long: the wall setting, from
  // the outer columns inward. Short and a little higher than the slack ended,
  // because what is being said is that the sheet has gone stiff — one small
  // fast tremor to leave, against the long slow one that arrived.
  /**
   * FENCE: one post seating, six of them left to right over about four tenths
   * of a second.
   *
   * A mallet on timber, which is what it is: a short pitched knock with the
   * body under it, and no tail at all. The retrigger window is deliberately
   * shorter than the roster's — the posts are three ticks apart, which is 50
   * ms, and the default window would swallow half of them and turn a fence
   * going up into three knocks and a gap. Six knocks in a row *is* the sound;
   * that is the whole reason the drive is staggered rather than simultaneous.
   */
  fenceDrive(): void {
    if (!this.allow("fenceDrive", 20)) {
      return;
    }
    this.tone({ freq: 210, freqEnd: 128, dur: 0.05, vol: 0.06, type: "sine" });
    this.noise({ dur: 0.04, vol: 0.05, filter: { type: "lowpass", freq: 1400, freqEnd: 500 } });
  }

  /**
   * One post being pulled back out of its seat, three pairs of them from the
   * ends in.
   *
   * The drive's knock run backwards: the pitch bends *up* rather than down,
   * because what is happening is a post coming out of the ground rather than
   * going into it, and the two ends of this capsule are the same motion in
   * opposite directions everywhere else as well. The scrape is a bandpass
   * opening rather than a lowpass closing, for the same reason.
   */
  fencePull(): void {
    if (!this.allow("fencePull", 20)) {
      return;
    }
    this.tone({ freq: 140, freqEnd: 300, dur: 0.07, vol: 0.05, type: "sine" });
    this.noise({ dur: 0.06, vol: 0.04, filter: { type: "bandpass", freq: 600, freqEnd: 2400, q: 1.2 } });
  }

  /**
   * A post the player actually broke.
   *
   * Its own sound rather than the wall's `brickDestroyed`, which tunes itself
   * off the row: the fence sits at row 16 and that ramp was written for rows 0
   * to 5, so a post would arrive as a 65 Hz thud nobody hears. Timber cracking
   * rather than masonry shattering — a hard snap with a splintered tail, and
   * brighter than the mallet above it so smashing a post is plainly a different
   * event from one arriving.
   */
  fenceSnap(): void {
    if (!this.allow("fenceSnap", 30)) {
      return;
    }
    this.tone({ freq: 620, freqEnd: 190, dur: 0.07, vol: 0.07 });
    this.noise({ dur: 0.09, vol: 0.09, filter: { type: "highpass", freq: 1800 } });
  }

  jellySet(): void {
    if (!this.allow("jellySet")) {
      return;
    }
    this.tone({ freq: 110, freqEnd: 430, dur: 0.3, vol: 0.07, type: "sine" });
    this.tone({ freq: 880, dur: 0.03, vol: 0.04, delayS: 0.3 });
  }

  // One bounce off a trampoline: a short pitched blip that bends up as it goes,
  // which is the ball leaving faster than it arrived. Quiet, because it plays
  // on every single wall contact for twenty seconds and the brick clank it
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

  /**
   * LEAP arriving: the machine losing its grip on where the ball is.
   *
   * A tone that *cannot hold its pitch* — one voice wobbling between two notes
   * while a thin band of noise opens under it, scored to the twelve ticks of
   * flicker the ball spends stuttering in place before the first jump. It is
   * the one sound in the bank that is deliberately unstable, because that is
   * the whole claim: the position is no longer certain.
   */
  leapCatch(): void {
    if (!this.allow("leapCatch")) {
      return;
    }
    this.tone({ freq: 392, freqEnd: 466, dur: 0.1, vol: 0.05, type: "triangle" });
    this.tone({ freq: 466, freqEnd: 392, dur: 0.1, vol: 0.045, type: "triangle", delayS: 0.09 });
    this.noise({ dur: 0.2, vol: 0.025, filter: { type: "bandpass", freq: 1800, freqEnd: 900, q: 6 } });
  }

  /**
   * One jump: the ball gone from here and back over there.
   *
   * **Two blips, and the gap between them is the whole sound** — the same trick
   * `twinStrike` uses to say *distance* rather than *event*, at a quarter of its
   * spacing because a leap is 20-32 px and a thread can be the width of the
   * field. The second is higher than the first: the ball did not travel, it
   * turned up further on.
   *
   * The window is tight because a SWARM can spend two jumps on one tick, and
   * two of these at the roster's default would be a rattle rather than a blink.
   */
  leapBlink(): void {
    if (!this.allow("leapBlink", 30)) {
      return;
    }
    this.tone({ freq: 880, freqEnd: 660, dur: 0.035, vol: 0.035, type: "sine" });
    this.tone({ freq: 990, freqEnd: 1180, dur: 0.035, vol: 0.035, type: "sine", delayS: 0.045 });
  }

  /**
   * HEISEN arriving: the ball going out of focus.
   *
   * Two voices a few cents apart drifting *further* apart, which is the beat
   * that `superposeSplit` opens with taken one step on — that one splits into a
   * pair and this one keeps spreading, because what the capsule does is not a
   * double, it is a loss of definition. Scored to the fifteen ticks the copies
   * take to separate out of the sprite.
   */
  heisenBlur(): void {
    if (!this.allow("heisenBlur")) {
      return;
    }
    this.tone({ freq: 494, freqEnd: 466, dur: 0.3, vol: 0.05, type: "sine" });
    this.tone({ freq: 494, freqEnd: 523, dur: 0.3, vol: 0.05, type: "sine" });
  }

  /**
   * A click observing: the scatter collapsing back onto one sprite.
   *
   * The shortest pitched thing in the bank after `collapseSolve`, and for its
   * reason — this is a *tick* and not an event. The player is free to click as
   * often as they like and some of them will, so it has to sit under the rally
   * rather than announce itself: one clean high blip, no glide, no tail. It
   * only plays when there was something to collapse, so an idle click is
   * silent.
   */
  heisenObserve(): void {
    if (!this.allow("heisenObserve", 60)) {
      return;
    }
    this.tone({ freq: 1046, dur: 0.035, vol: 0.03, type: "sine" });
  }

  /**
   * And the machine getting its grip back: the beat closing.
   *
   * The arrival's two voices sliding onto one note, which is the one place in
   * this pair where the departure *is* the arrival reversed — and it is allowed
   * to be, because what the picture does is literally that: the copies converge
   * on the sprite they came out of. `superposeMerge` refuses the same shape for
   * the opposite reason, its two ends being two different events.
   */
  heisenFocus(): void {
    if (!this.allow("heisenFocus")) {
      return;
    }
    this.tone({ freq: 466, freqEnd: 494, dur: 0.22, vol: 0.05, type: "sine" });
    this.tone({ freq: 523, freqEnd: 494, dur: 0.22, vol: 0.05, type: "sine" });
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
