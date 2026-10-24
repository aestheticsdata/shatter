"""SUNRISE's sky (SHA-270): the web game's HD horizon theme at 320x224, its
zodiac dial, and the twinkle.

The web paints this field in `src/render/backgrounds.ts` (`paintHorizon`,
`paintHorizonGround`) and turns the dial in `drawZodiac`. Its rule is that the
field art never moves, so a static layer is never mistaken for a game object;
the dial is the one exception it makes, turning once a minute. Here the dial
turns the same way — by swapping the sky's own tiles, pre-drawn at every step,
so it costs no sprite — and the stars, the only other thing that changes, do it
in the palette: one pixel each, never moving, brightening now and then.
"""

import math
import random

from PIL import Image

SCREEN_W, SCREEN_H = 320, 224
HORIZON = int(SCREEN_H * 0.6)
# The foreground strip: the ground and the dunes, drawn in front of the eye so
# it sets behind the hills (SHA-267). From the tallest dune's top down.
FG_TOP = 112
CLEAR = (255, 0, 255)
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

# BACKGROUND_COLORS.horizon.
TONES = {
    "base": "#061019", "sky1": "#08161f", "sky2": "#0b1b26", "sky3": "#0e202c",
    "glow": "#112733", "ground": "#040c12", "dune": "#020809", "star": "#2a4a5c",
    "dialRing": "#0f2436", "dialBand": "#11283a", "dialTick": "#2a4a5c",
}

# The web field is 372x300 game pixels and this sky 320x224: everything round
# is scaled by 0.75 on both axes, as the eye is, so a circle stays a circle.
ROUND = 0.75

# The dial (gameConfig.observer.ring.field): radii 82 and 86, twelve ticks, at
# the field's middle, one turn a minute; the inner circle dashed four on, two
# off. Sixty dashes, five to a tick, so the picture repeats every 30 degrees:
# DIAL_STEPS drawings of that, each shown DIAL_HOLD frames, is 3600 a turn.
DIAL_CX, DIAL_CY = SCREEN_W // 2, 112
DIAL_INNER, DIAL_OUTER = round(82 * ROUND), round(86 * ROUND)
DIAL_TICKS = 12
DIAL_DASHES = 60
DIAL_STEPS = 30
DIAL_HOLD = 3600 // (DIAL_TICKS * DIAL_STEPS)

# The twinkle: four groups of stars, each on its own palette slot. A group
# rests at the star's tone and swells toward a paler one once a cycle, the
# groups out of step so the sky is never all lit at once.
STAR_GROUPS = 4
STAR_SLOT = 16 - STAR_GROUPS  # palette slots 12..15 in every sky band
STAR_SENTINELS = [(255, 0, 240 + g) for g in range(STAR_GROUPS)]
TWINKLE_STEPS = 512
TWINKLE_SWELL = 56
TWINKLE_PEAK = "#7f9cb4"
TWINKLE_PHASES = [0, 141, 283, 397]


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def paint_background():
    """The sky, and separately the ground and dunes from FG_TOP down (CLEAR
    elsewhere). Stars are painted in their group's sentinel colour."""
    c = {k: hex_rgb(v) for k, v in TONES.items()}
    img = Image.new("RGB", (SCREEN_W, SCREEN_H), c["base"])
    px = img.load()
    line = HORIZON
    # The four bands as one dithered gradient, from the bands' own edges.
    stops = [(line - 70, c["base"]), (line - 40, c["sky1"]), (line - 30, c["sky2"]),
             (line - 20, c["sky3"]), (line - 10, c["glow"]), (line, c["glow"])]
    for y in range(line):
        for i in range(len(stops) - 1):
            (y0, a), (y1, b) = stops[i], stops[i + 1]
            if y0 <= y < y1:
                t = (y - y0) / max(1, y1 - y0)
                for x in range(SCREEN_W):
                    px[x, y] = b if t * 16 > BAYER[y % 4][x % 4] + 0.5 else a
    # The dome: the light standing over where the sun will come up, dithered
    # radially from nothing at its edge through sky3 to the glow.
    cx, radius = round(SCREEN_W * 0.56), 87 * ROUND
    tones = [None, c["sky3"], c["glow"]]
    for y in range(max(0, round(line - radius)), line):
        for x in range(SCREEN_W):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - line)
            if d >= radius:
                continue
            position = (1 - d / radius) * 2
            band = min(1, int(position))
            tone = tones[band + 1] if BAYER[y & 3][x & 3] < (position - band) * 16 else tones[band]
            if tone is not None:
                px[x, y] = tone
    for x in range(SCREEN_W):
        px[x, line - 1] = mix(c["glow"], c["ground"], 0.45)
    rng = random.Random(7)
    for i in range(18):
        x, y = rng.randrange(4, SCREEN_W - 4), rng.randrange(4, line - 50)
        px[x, y] = STAR_SENTINELS[i % STAR_GROUPS]
    for y in range(line, SCREEN_H):
        for x in range(SCREEN_W):
            px[x, y] = c["ground"]
    dust = mix(c["ground"], (0, 0, 0), 0.45)
    for _ in range(90):
        px[rng.randrange(SCREEN_W), rng.randrange(line + 1, SCREEN_H)] = dust
    # Two shallow dunes, each with a rim of shadow a pixel outside it, so one
    # passing in front of the other reads as two hills.
    rim = mix(c["dune"], (0, 0, 0), 0.45)
    for fx, r, rise in ((0.3, 90, 14), (0.72, 120, 20)):
        dx, dy = fx * SCREEN_W, line + r - rise
        for color, reach in ((rim, r + 1), (c["dune"], r)):
            for y in range(line - rise - 1, line + 2):
                for x in range(SCREEN_W):
                    if math.hypot(x - dx, y - dy) <= reach and (color == c["dune"] or px[x, y] != c["dune"]):
                        px[x, y] = color
    front = Image.new("RGB", (SCREEN_W, SCREEN_H - FG_TOP), CLEAR)
    fpx = front.load()
    for y in range(FG_TOP, SCREEN_H):
        for x in range(SCREEN_W):
            if y >= line or px[x, y] in (c["dune"], rim):
                fpx[x, y - FG_TOP] = px[x, y]
    return img, front


def dial_frames(sky, front):
    """The sky with the dial on it, at each of DIAL_STEPS steps of its turn.

    Only where the dial shows: above the ground and dunes, which stand in front
    of it as they stand in front of the eye."""
    c = {k: hex_rgb(v) for k, v in TONES.items()}
    covered = lambda x, y: y >= FG_TOP and front.getpixel((x, y - FG_TOP)) != CLEAR
    frames = []
    for step in range(DIAL_STEPS):
        spin = step / DIAL_STEPS * (2 * math.pi / DIAL_TICKS)
        img = sky.copy()
        px = img.load()

        def dot(r, angle, tone):
            x = round(DIAL_CX + math.cos(angle) * r)
            y = round(DIAL_CY + math.sin(angle) * r)
            if 0 <= x < SCREEN_W and 0 <= y < SCREEN_H and not covered(x, y) and px[x, y] not in STAR_SENTINELS:
                px[x, y] = tone

        walk = 2  # two steps a pixel, so a hairline never skips one
        outer = round(2 * math.pi * DIAL_OUTER) * walk
        for i in range(outer):
            dot(DIAL_OUTER, i / outer * 2 * math.pi, c["dialRing"])
        inner = round(2 * math.pi * DIAL_INNER) * walk
        for i in range(inner):
            # Four on, two off: the dash measured round the circle, sixty to it.
            if (i * DIAL_DASHES * 6 // inner) % 6 < 4:
                dot(DIAL_INNER, i / inner * 2 * math.pi + spin, c["dialBand"])
        for t in range(DIAL_TICKS):
            angle = t / DIAL_TICKS * 2 * math.pi + spin
            for r in range(DIAL_INNER, DIAL_OUTER + 1):
                dot(r, angle, c["dialTick"])
        frames.append(img)
    return frames


def index_sky(images, palette_base):
    """Every image of the sky as palette indexes, each 16 px band on its own
    palette: the colours any of them uses in that band, slots 1..11, and the
    star groups always in 12..15 so the twinkle can rewrite them."""
    star = hex_rgb(TONES["star"])
    out = [Image.new("P", images[0].size, 0) for _ in images]
    palettes = []
    for row in range(SCREEN_H // 16):
        seen = set()
        for img in images:
            band = img.crop((0, row * 16, SCREEN_W, row * 16 + 16))
            seen |= {band.getpixel((x, y)) for x in range(SCREEN_W) for y in range(16)}
        colors = sorted(seen - set(STAR_SENTINELS))
        assert len(colors) < STAR_SLOT, f"sky band {row} needs {len(colors)} colours"
        index = {color: i + 1 for i, color in enumerate(colors)}
        index.update({s: STAR_SLOT + g for g, s in enumerate(STAR_SENTINELS)})
        for img, o in zip(images, out):
            for y in range(row * 16, row * 16 + 16):
                for x in range(SCREEN_W):
                    o.putpixel((x, y), index[img.getpixel((x, y))])
        slots = colors + [colors[0]] * (STAR_SLOT - 1 - len(colors)) + [star] * STAR_GROUPS
        palettes.append((palette_base + row, [None] + slots))
    return out, palettes


def dial_cells(indexed):
    """The 16x16 cells of the sky that any step of the dial changes, and each
    step's picture of them."""
    base, steps = indexed[0], indexed[1:]
    cells = []
    for row in range(SCREEN_H // 16):
        for col in range(SCREEN_W // 16):
            box = (col * 16, row * 16, col * 16 + 16, row * 16 + 16)
            if any(step.crop(box).tobytes() != base.crop(box).tobytes() for step in steps):
                cells.append((col, row))
    pictures = [[step.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16)) for c, r in cells] for step in steps]
    return cells, pictures


def twinkle():
    """One group's cycle, TWINKLE_STEPS colours: the star's tone, and once a
    cycle a swell to the peak and back, eased."""
    star, peak = hex_rgb(TONES["star"]), hex_rgb(TWINKLE_PEAK)
    cycle = []
    for i in range(TWINKLE_STEPS):
        t = math.sin(math.pi * i / TWINKLE_SWELL) ** 2 if i < TWINKLE_SWELL else 0
        cycle.append(mix(star, peak, t))
    return cycle
