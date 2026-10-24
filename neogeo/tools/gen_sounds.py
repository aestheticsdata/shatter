#!/usr/bin/env python3
"""Shatter's sound effects for the Neo-Geo, rendered from the web game's recipes.

The web game synthesises every effect at runtime (`src/audio/SoundBank.ts`
on `src/audio/Sound.ts`): oscillators with an exponential pitch glide, a short
attack, a hold for half the length and an exponential decay, plus filtered
noise. The YM2610 can only play samples back, so each recipe is rendered here,
once, to an 18.5 kHz mono WAV — the ADPCM-A rate — in assets/sfx/.

The effects keep their relative loudness: one gain for the whole set, chosen
so the loudest peaks just under full scale.
"""

import math
import random
import struct
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "assets/sfx"
RATE = 18500
ATTACK = 0.005
NOISE_ATTACK = 0.003
DETUNE_PAIR_CENTS = 7
DETUNE_PAIR_LEVEL = 0.5


def render_length(seconds):
    return int(seconds * RATE) + 1


def wave_at(kind, phase):
    p = phase % 1.0
    if kind == "square":
        return 1.0 if p < 0.5 else -1.0
    if kind == "sawtooth":
        return 2.0 * p - 1.0
    if kind == "triangle":
        return 4.0 * abs(p - 0.5) - 1.0
    return math.sin(2 * math.pi * p)


def envelope(t, dur, vol, attack):
    """Linear attack, hold to half the length, exponential decay to 0.001."""
    hold = max(attack, dur * 0.5)
    if t < attack:
        return vol * t / attack
    if t < hold:
        return vol
    if t >= dur:
        return 0.0
    k = (t - hold) / max(1e-6, dur - hold)
    return vol * (0.001 / vol) ** k if vol > 0.001 else 0.0


def tone(buf, freq, dur, vol=0.05, kind="square", freq_end=None, delay=0.0, cents=0):
    start = int(delay * RATE)
    phase = 0.0
    tune = 2 ** (cents / 1200)
    for i in range(render_length(dur)):
        t = i / RATE
        f = freq if freq_end is None else freq * (freq_end / freq) ** min(1.0, t / dur)
        phase += f * tune / RATE
        if start + i < len(buf):
            buf[start + i] += wave_at(kind, phase) * envelope(t, dur, vol, ATTACK)


def biquad(kind, freq, q):
    """RBJ cookbook coefficients."""
    w = 2 * math.pi * min(freq, RATE * 0.45) / RATE
    alpha = math.sin(w) / (2 * q)
    cos = math.cos(w)
    if kind == "lowpass":
        b = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
    elif kind == "highpass":
        b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
    else:  # bandpass, constant 0 dB peak
        b = [alpha, 0.0, -alpha]
    a = [1 + alpha, -2 * cos, 1 - alpha]
    return [x / a[0] for x in b], [a[1] / a[0], a[2] / a[0]]


def noise(buf, dur, kind, freq, vol=0.15, freq_end=None, q=1.0, delay=0.0, rng=random.Random(263)):
    start = int(delay * RATE)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(render_length(dur)):
        t = i / RATE
        f = freq if freq_end is None else freq * (freq_end / freq) ** min(1.0, t / dur)
        b, a = biquad(kind, f, q)
        x = rng.uniform(-1, 1)
        y = b[0] * x + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2
        x2, x1, y2, y1 = x1, x, y1, y
        if start + i < len(buf):
            k = min(1.0, t / NOISE_ATTACK)
            decay = (0.001 / vol) ** (t / dur) if t < dur else 0.0
            buf[start + i] += y * vol * k * decay


def arp(buf, notes, step_ms=60, vol=0.05, note_dur=0.09, kind="square", pair=False):
    for index, freq in enumerate(notes):
        delay = index * step_ms / 1000
        tone(buf, freq, note_dur, vol, kind, delay=delay)
        if pair:
            tone(buf, freq, note_dur, vol * DETUNE_PAIR_LEVEL, kind, delay=delay, cents=DETUNE_PAIR_CENTS)


def blank(seconds):
    return [0.0] * render_length(seconds)


# --- the bank: the same names and numbers as SoundBank.ts ----------------------

def wall():
    buf = blank(0.05)
    tone(buf, 300, 0.04, 0.05, freq_end=240)
    return buf


def paddle():
    # The web game bends the pitch with where the ball hit; one sample, centre.
    buf = blank(0.08)
    tone(buf, 330, 0.07, 0.07, freq_end=330 * 1.58)
    tone(buf, 330, 0.07, 0.05, freq_end=330 * 1.58, cents=15)
    return buf


def brick(row):
    base = 560 + (5 - row) * 45
    buf = blank(0.1)
    tone(buf, base * 1.15, 0.09, 0.08, freq_end=base * 0.55)
    noise(buf, 0.05, "highpass", 2500, 0.12)
    return buf


def launch():
    buf = blank(0.16)
    noise(buf, 0.15, "bandpass", 400, 0.08, freq_end=2000)
    tone(buf, 520, 0.05, 0.04)
    return buf


def lost():
    buf = blank(0.62)
    tone(buf, 290, 0.6, 0.09, "sawtooth", freq_end=52)
    tone(buf, 296, 0.6, 0.06, "sawtooth", freq_end=55)
    return buf


def clear():
    buf = blank(0.3)
    arp(buf, [523, 659, 784, 1046], 60, pair=True)
    return buf


def game_over():
    buf = blank(0.65)
    arp(buf, [392, 330, 262, 196], 130, pair=True)
    arp(buf, [392, 330, 262, 196], 130, vol=0.03, note_dur=0.12, kind="sawtooth")
    return buf


def spawn():
    # Subtle by design: the web fires it for every capsule that drops.
    buf = blank(0.04)
    tone(buf, 220, 0.03, 0.03)
    return buf


def pickup():
    buf = blank(0.16)
    for index, freq in enumerate((523, 659, 784)):
        tone(buf, freq, 0.07, 0.06, delay=index * 0.04)
    return buf


BANK = {
    "wall": wall,
    "paddle": paddle,
    "launch": launch,
    "lost": lost,
    "clear": clear,
    "gameover": game_over,
    "spawn": spawn,
    "pickup": pickup,
    **{f"brick{row}": (lambda r=row: brick(r)) for row in range(5)},
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rendered = {name: make() for name, make in BANK.items()}
    peak = max(max(abs(s) for s in buf) for buf in rendered.values())
    gain = 0.95 / peak
    for name, buf in rendered.items():
        with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * gain)) * 32767)) for s in buf))
    print(f"{len(rendered)} effects, gain {gain:.1f}")


if __name__ == "__main__":
    main()
