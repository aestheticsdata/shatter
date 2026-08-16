const SCHEDULE_AHEAD_S = 0.005;
const ATTACK_S = 0.004;
const STOP_TAIL_S = 0.01;

export class Sound {
  private context: AudioContext | null = null;
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
          // resume() is rejected until the browser has seen a user gesture; the next beep retries.
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

  beep(frequency: number, durationS: number, type: OscillatorType = "square", volume = 0.05): void {
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
      // decay leaves only ~15 ms of perceivable sound out of a 50 ms beep.
      const start = context.currentTime + SCHEDULE_AHEAD_S;
      const holdEnd = start + Math.max(ATTACK_S, durationS * 0.5);
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + ATTACK_S);
      gain.gain.setValueAtTime(volume, holdEnd);
      gain.gain.exponentialRampToValueAtTime(0.001, start + durationS);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + durationS + STOP_TAIL_S);
    } catch {
      // Audio is unavailable; stay silent.
    }
  }

  arp(frequencies: readonly number[], stepMs = 60): void {
    frequencies.forEach((frequency, index) => {
      // The first note plays synchronously so that when an arp is the first sound ever
      // (title-screen click), the AudioContext is created inside the gesture call stack.
      if (index === 0) {
        this.beep(frequency, 0.09, "square", 0.05);
      } else {
        window.setTimeout(() => this.beep(frequency, 0.09, "square", 0.05), index * stepMs);
      }
    });
  }
}
