const SCHEDULE_AHEAD_S = 0.005;
const ATTACK_S = 0.004;
const NOISE_ATTACK_S = 0.003;
const STOP_TAIL_S = 0.01;
const MASTER_GAIN = 0.9;
// A +15-cent layer at ~70% level is the "detuned pair" voicing used across the bank.
const DETUNE_PAIR_CENTS = 15;
const DETUNE_PAIR_LEVEL = 0.7;
// The music never cuts: it swells in and dies away over this long.
const MUSIC_FADE_S = 0.6;

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

interface MusicTrack {
  element: HTMLAudioElement;
  gain: GainNode;
  halt?: ReturnType<typeof setTimeout>;
}

export class Sound {
  private context: AudioContext | null = null;
  private masterInput: GainNode | null = null;
  private isMuted = false;
  private userVolume = 1;
  private readonly tracks = new Map<string, MusicTrack>();

  get muted(): boolean {
    return this.isMuted;
  }

  toggleMuted(): boolean {
    this.isMuted = !this.isMuted;
    // Zeroing the master gain silences already-scheduled voices too: an arp commits
    // all its notes to the audio clock up front, and the per-voice mute check alone
    // would let a jingle ring on for half a second after M.
    this.applyMasterGain();
    return this.isMuted;
  }

  get volume(): number {
    return this.userVolume;
  }

  // User volume scales the master gain ahead of the compressor, so relative recipe
  // levels (and the limiter's behavior at pile-ups) are preserved at any setting.
  setVolume(volume: number): void {
    this.userVolume = Math.min(1, Math.max(0, volume));
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (this.masterInput) {
      this.masterInput.gain.value = this.isMuted ? 0 : MASTER_GAIN * this.userVolume;
    }
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
      gain.gain.value = this.isMuted ? 0 : MASTER_GAIN * this.userVolume;
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

  // A track is an <audio> element routed into the master chain rather than
  // straight to the speakers, so M and the fader govern it with the effects. It is
  // not skipped while muted, unlike a voice: a loop has to keep its place for the
  // moment the sound comes back. The first call must come from a user gesture —
  // the click that serves — or the browser refuses to play it.
  //
  // One track plays at a time: starting one crossfades out whichever other is
  // on, and rewinds it for the next time it is called.
  startMusic(url: string, level: number): void {
    this.unlock();
    const context = this.context;
    if (!context) {
      return;
    }

    try {
      for (const [other, track] of this.tracks) {
        if (other !== url) {
          this.fadeOut(context, track, true);
        }
      }
      const track = this.tracks.get(url) ?? this.createTrack(context, url);
      clearTimeout(track.halt);
      this.rampMusic(context, track.gain, level);
      track.element.play().catch(() => {
        // Refused without a gesture; the next serve retries.
      });
    } catch {
      // Audio is unavailable; stay silent.
    }
  }

  // Fades every track out, then stops it: paused holds the place for a resume,
  // stopped rewinds it for the next run.
  stopMusic(rewind: boolean): void {
    const context = this.context;
    if (!context) {
      return;
    }
    for (const track of this.tracks.values()) {
      this.fadeOut(context, track, rewind);
    }
  }

  private createTrack(context: AudioContext, url: string): MusicTrack {
    const element = new Audio(url);
    element.loop = true;
    const gain = context.createGain();
    gain.gain.value = 0;
    context.createMediaElementSource(element).connect(gain);
    gain.connect(this.output(context));
    const track: MusicTrack = { element, gain };
    this.tracks.set(url, track);
    return track;
  }

  private fadeOut(context: AudioContext, track: MusicTrack, rewind: boolean): void {
    // Already silent — held by PAUSE, or never started. Nothing to fade, but a
    // held track still owes the rewind it is asked for.
    if (track.element.paused) {
      if (rewind) {
        track.element.currentTime = 0;
      }
      return;
    }
    clearTimeout(track.halt);
    this.rampMusic(context, track.gain, 0);
    track.halt = setTimeout(() => {
      track.element.pause();
      if (rewind) {
        track.element.currentTime = 0;
      }
    }, MUSIC_FADE_S * 1000);
  }

  // From wherever the level is now: a fade reversed mid-way turns around smoothly
  // instead of jumping back to its start.
  private rampMusic(context: AudioContext, gain: GainNode, level: number): void {
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(level, now + MUSIC_FADE_S);
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
}
