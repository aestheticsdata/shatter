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

  beep(frequency: number, durationS: number, type: OscillatorType = "square", volume = 0.05): void {
    if (this.isMuted) {
      return;
    }

    try {
      this.context ??= new AudioContext();
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationS);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + durationS);
    } catch {
      // Audio is unavailable (no user gesture yet, or unsupported); stay silent.
    }
  }

  arp(frequencies: readonly number[], stepMs = 60): void {
    frequencies.forEach((frequency, index) => {
      window.setTimeout(() => this.beep(frequency, 0.09, "square", 0.05), index * stepMs);
    });
  }
}
