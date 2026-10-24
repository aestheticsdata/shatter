"""Every level's field art (SHA-270, SHA-269): the web game's own painters,
its zodiac dial, and the twinkle.

tools/render_backgrounds.ts runs `paintBackground` and `paintForeground` from
src/render/backgrounds.ts for each level and leaves them, at 320x224, in
build/bg/. Here each becomes sprite tiles: sixteen-pixel bands of the sky, each
on its own palette of up to fifteen colours, the specks kept exact.

The web's rule is that the field art never moves, so a static layer is never
mistaken for a game object; the dial is the one thing on it that does, turning
once a minute. Here it is a sprite layer of its own over the sky, drawn once at
every step of its turn and tinted with each theme's dial ink. The stars are the
only other thing that changes, and only in the palette: one pixel each, never
moving, brightening now and then.
"""

import math

from PIL import Image

SCREEN_W, SCREEN_H = 320, 224
BAND = 16
BANDS = SCREEN_H // BAND
HORIZON = int(SCREEN_H * 0.6)
# The foreground strip: the ground and the dunes, drawn in front of the eye so
# it sets behind the hills (SHA-267). From the tallest dune's top down.
FG_TOP = 112
FG_BANDS = (SCREEN_H - FG_TOP) // BAND
CLEAR = (255, 0, 255)

# The dial (gameConfig.observer.ring.field): radii 82 and 86, twelve ticks,
# one turn a minute; the inner circle dashed four on, two off. Sixty dashes,
# five to a tick, so the picture repeats every 30 degrees: DIAL_STEPS drawings
# of that, each shown DIAL_HOLD frames, is 3600 a turn. Scaled by the eye's
# 0.75 so it stays a circle.
DIAL_INNER, DIAL_OUTER = round(82 * 0.75), round(86 * 0.75)
DIAL_TICKS = 12
DIAL_DASHES = 60
DIAL_STEPS = 30
DIAL_HOLD = 3600 // (DIAL_TICKS * DIAL_STEPS)
DIAL_SIZE = 144  # nine sprites square, the ring centred in it
DIAL_RING, DIAL_BAND, DIAL_TICK = 1, 2, 3

# The twinkle: palette slots 12..15 of every sky band hold the stars. A theme
# with one star tone has four groups of it, out of step; with more tones, the
# slots are shared out among them.
STAR_GROUPS = 4
STAR_SLOT = 16 - STAR_GROUPS
TWINKLE_STEPS = 512
TWINKLE_SWELL = 56
TWINKLE_PHASES = [0, 141, 283, 397]
TWINKLE_LEVELS = 16      # steps from a star's tone to its peak
TWINKLE_TOWARD = "#dbe4ff"
TWINKLE_REACH = 0.45


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def load_level(index, here):
    """A level's sky (RGB), its twinkling pixels {(x, y): tone}, and its
    foreground (RGBA, holes transparent) or None."""
    raw = (here / f"build/bg/{index}.rgba").read_bytes()
    rgba = Image.frombytes("RGBA", (SCREEN_W, SCREEN_H), raw)
    twinkles = {}
    px = rgba.load()
    for y in range(SCREEN_H):
        for x in range(SCREEN_W):
            if px[x, y][3] == 254:
                twinkles[(x, y)] = px[x, y][:3]
    front_path = here / f"build/bg/{index}-front.rgba"
    front = Image.frombytes("RGBA", (SCREEN_W, SCREEN_H), front_path.read_bytes()) if front_path.exists() else None
    return rgba.convert("RGB"), twinkles, front


def star_slots(twinkles):
    """Each twinkling tone's slots, and each twinkling pixel's slot: the
    tones share the four out, and a tone's pixels take its slots in turn."""
    tones = sorted(set(twinkles.values()), key=sum)[:STAR_GROUPS]
    per = STAR_GROUPS // max(1, len(tones))
    slots = {tone: [STAR_SLOT + i * per + k for k in range(per)] for i, tone in enumerate(tones)}
    pixel_slot = {}
    for n, (pos, tone) in enumerate(sorted(twinkles.items())):
        if tone in slots:
            pixel_slot[pos] = slots[tone][n % len(slots[tone])]
    slot_tone = [None] * STAR_GROUPS
    for tone, owned in slots.items():
        for s in owned:
            slot_tone[s - STAR_SLOT] = tone
    return pixel_slot, slot_tone


def index_sky(sky, twinkles, specks):
    """The sky as palette indexes, band by band, and the band palettes.

    A band's own colours take slots 1..11: the theme's specks exactly, and the
    rest of the band — its gradients and texture — quantized into what is left.
    The twinkling pixels take their star slots."""
    pixel_slot, slot_tone = star_slots(twinkles)
    out = Image.new("P", sky.size, 0)
    palettes = []
    for band in range(BANDS):
        box = (0, band * BAND, SCREEN_W, band * BAND + BAND)
        img = sky.crop(box)
        colours = {}
        for c in img.getdata():
            colours[c] = colours.get(c, 0) + 1
        exact = [c for c in colours if c in specks]
        room = STAR_SLOT - 1 - len(exact)
        rest = [c for c in colours if c not in specks]
        if len(rest) <= room:
            table = exact + rest
            mapping = {c: table.index(c) + 1 for c in table}
            data = [mapping[c] for c in img.getdata()]
        else:
            # Quantize what is not a speck; the specks keep their own slots.
            q = img.quantize(colors=room, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
            pal = q.getpalette()[: room * 3]
            qtable = [tuple(pal[i : i + 3]) for i in range(0, room * 3, 3)]
            table = qtable + exact
            data = []
            for c, qi in zip(img.getdata(), q.getdata()):
                data.append(len(qtable) + exact.index(c) + 1 if c in specks else qi + 1)
        band_img = Image.new("P", img.size)
        band_img.putdata(data)
        bpx = band_img.load()
        for (x, y), slot in pixel_slot.items():
            if band * BAND <= y < band * BAND + BAND:
                bpx[x, y - band * BAND] = slot
        out.paste(band_img, box)
        slots = table + [table[0]] * (STAR_SLOT - 1 - len(table))
        stars = [tone or table[0] for tone in slot_tone]
        palettes.append([None] + slots + stars)
    return out, palettes, slot_tone


def index_front(front):
    """The foreground strip from FG_TOP down, holes transparent, banded."""
    strip = front.crop((0, FG_TOP, SCREEN_W, SCREEN_H))
    out = Image.new("P", strip.size, 0)
    palettes = []
    for band in range(FG_BANDS):
        box = (0, band * BAND, SCREEN_W, band * BAND + BAND)
        img = strip.crop(box)
        solid = [p[:3] for p in img.getdata() if p[3]]
        table = sorted(set(solid))
        if len(table) > 15:
            q = Image.new("RGB", (len(solid), 1))
            q.putdata(solid)
            q = q.quantize(colors=15, method=Image.Quantize.MEDIANCUT)
            pal = q.getpalette()[:45]
            table = [tuple(pal[i : i + 3]) for i in range(0, 45, 3)]
        nearest = {}
        data = []
        for p in img.getdata():
            if not p[3]:
                data.append(0)
                continue
            c = p[:3]
            if c not in nearest:
                nearest[c] = min(range(len(table)), key=lambda i: sum((c[k] - table[i][k]) ** 2 for k in range(3))) + 1
            data.append(nearest[c])
        band_img = Image.new("P", img.size)
        band_img.putdata(data)
        out.paste(band_img, box)
        palettes.append([None] + table)
    return out, palettes


def dial_frames():
    """The dial at each of DIAL_STEPS steps of its 30-degree period, on a
    transparent 144x144: the outer circle, the dashed inner one and the ticks
    across the band between them, in the three dial slots."""
    c = DIAL_SIZE / 2
    frames = []
    for step in range(DIAL_STEPS):
        spin = step / DIAL_STEPS * (2 * math.pi / DIAL_TICKS)
        img = Image.new("P", (DIAL_SIZE, DIAL_SIZE), 0)
        px = img.load()

        def dot(r, angle, tone):
            x, y = round(c + math.cos(angle) * r), round(c + math.sin(angle) * r)
            if 0 <= x < DIAL_SIZE and 0 <= y < DIAL_SIZE:
                px[x, y] = tone

        walk = 2  # two steps a pixel, so a hairline never skips one
        outer = round(2 * math.pi * DIAL_OUTER) * walk
        for i in range(outer):
            dot(DIAL_OUTER, i / outer * 2 * math.pi, DIAL_RING)
        inner = round(2 * math.pi * DIAL_INNER) * walk
        for i in range(inner):
            if (i * DIAL_DASHES * 6 // inner) % 6 < 4:
                dot(DIAL_INNER, i / inner * 2 * math.pi + spin, DIAL_BAND)
        for t in range(DIAL_TICKS):
            angle = t / DIAL_TICKS * 2 * math.pi + spin
            for r in range(DIAL_INNER, DIAL_OUTER + 1):
                dot(r, angle, DIAL_TICK)
        frames.append(img)
    return frames


def twinkle_shape():
    """One group's cycle, 0..TWINKLE_LEVELS-1 a step: resting, and once a
    cycle a swell to the peak and back, eased."""
    cycle = []
    for i in range(TWINKLE_STEPS):
        t = math.sin(math.pi * i / TWINKLE_SWELL) ** 2 if i < TWINKLE_SWELL else 0
        cycle.append(round(t * (TWINKLE_LEVELS - 1)))
    return cycle


def twinkle_ramp(tone):
    """A star tone's TWINKLE_LEVELS steps toward its peak."""
    peak = mix(tone, hex_rgb(TWINKLE_TOWARD), TWINKLE_REACH)
    return [mix(tone, peak, i / (TWINKLE_LEVELS - 1)) for i in range(TWINKLE_LEVELS)]
