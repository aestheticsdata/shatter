"""The look pass (SHA-270): Shatter's HD sprites, redrawn at Neo-Geo density.

Each painter follows one recipe of the web game's HD renderer, step for step,
at the size the Neo-Geo field gives it, and returns an indexed image plus the
tones its indices stand for:

  brick   `paintHdBrick` + `drawFaceMark` / `engraveFaceMark` + `drawRivets`
          (src/render/CanvasRenderer.ts) — 24x10 cell, the web's 30x12
  paddle  `hdPillPix` (src/render/hdPaddle.ts) — 40x8, the web's 46x7
  ball    `ballRows(8)` + `ballGlints(8)` (src/render/ballSprite.ts) — the
          web's own eight rows, unscaled: the ball's silhouette is not redrawn

A fine pixel of the HD grid is a third of a web pixel and a Neo-Geo pixel is
1.27 of one, so where the HD recipe spends three fine rows the Neo-Geo spends
one; bands and insets are rounded to whole Neo-Geo pixels, never dithered into
mush.
"""

import math

from PIL import Image


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


WHITE, BLACK = (255, 255, 255), (0, 0, 0)
JOINT = hex_rgb("#05050f")  # canvasPalette.brickJoint
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


class Canvas:
    """An indexed sprite and the tones its indices name."""

    def __init__(self, width, height):
        self.img = Image.new("P", (width, height), 0)
        self.tones = []

    def slot(self, rgb):
        if rgb not in self.tones:
            self.tones.append(rgb)
        return self.tones.index(rgb) + 1

    def fill(self, x, y, w, h, rgb):
        v = self.slot(rgb)
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= xx < self.img.width and 0 <= yy < self.img.height:
                    self.img.putpixel((xx, yy), v)


# --- bricks ------------------------------------------------------------------------

CELL_W, CELL_H = 24, 10
BODY_W, BODY_H = 23, 9  # outline box; the last column and row are the joint's

# Which tones a brick stage is painted in, always in this order, so every
# (kind, stage) palette lines up with every brick tile: a hit swaps the palette
# and, only where the face itself changes, the tile.
BRICK_SLOTS = ["l2", "l1", "m1", "m0", "d1", "d2", "d3", "joint", "pale", "shade", "pit"]


def brick_ramp(kind):
    if kind["hits"] == 1:
        return [kind["light"], kind["flat"]]
    return [kind["light"], kind["flat"], *kind["wear"], kind["dark"]]


def brick_tones(kind, stage):
    ramp = [hex_rgb(t) for t in brick_ramp(kind)]
    strain = [hex_rgb(t) for t in (kind["light"], kind["flat"], *kind["wear"], kind["dark"])]
    l1, m0, d2 = ramp[stage], ramp[stage + 1], hex_rgb(kind["dark"])
    pit = hex_rgb(kind["grain"]["pit"]) if kind.get("grain") else d2
    return {
        "l2": mix(l1, WHITE, 0.5),
        "l1": l1,
        "m1": mix(m0, l1, 0.3),
        "m0": m0,
        "d1": mix(m0, d2, 0.45),
        "d2": d2,
        "d3": mix(d2, BLACK, 0.4),
        "joint": JOINT,
        "pale": ramp[stage],
        "shade": strain[min(stage + 2, len(strain) - 1)],
        "pit": pit,
    }


def grain_hash(seed, index):
    h = (seed * 2654435761 + index * 40503) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5BD1E995) & 0xFFFFFFFF
    return h ^ (h >> 15)


def paint_brick(kind, stage):
    """`paintHdBrick` at 24x10: knocked-off outline, lit and shaded bands, the
    one-pixel bevel, the speculars, the kind's engraved mark, cracks per hit,
    granite's flecks and pits, the plate's rivets, and the shadow into the
    mortar. Indices follow BRICK_SLOTS."""
    t = brick_tones(kind, stage)
    img = Image.new("P", (CELL_W, CELL_H), 0)
    slot = {name: i + 1 for i, name in enumerate(BRICK_SLOTS)}

    def fill(x, y, w, h, name):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= xx < CELL_W and 0 <= yy < CELL_H:
                    img.putpixel((xx, yy), slot[name])

    W, H = BODY_W, BODY_H
    hurt = stage
    # The shadow dropped into the seam, below and right.
    fill(1, H, W, 1, "joint")
    fill(W, 1, 1, H, "joint")
    # Outline with the corners knocked off, and the body inside it.
    fill(1, 0, W - 2, H, "d3")
    fill(0, 1, W, H - 2, "d3")
    fill(1, 1, W - 2, H - 2, "m0")
    # Lit from above and shaded at the foot: at this height the HD recipe's
    # unbanded branch, a quarter of the body each.
    edge = max(1, H // 4)
    fill(1, 1, W - 2, edge, "m1")
    fill(1, H - 1 - edge, W - 2, edge, "d1")
    # The bevel.
    fill(2, 1, W - 4, 1, "l1")
    fill(1, 2, 1, H - 4, "l1")
    fill(2, H - 2, W - 4, 1, "d2")
    fill(W - 2, 2, 1, H - 4, "d2")
    # The speculars, a third of the HD ones.
    fill(3, 2, 5, 1, "l2")
    fill(3, 3, 2, 1, "l2")
    fill(W - 6, 2, 2, 1, "l2")

    grain = kind.get("grain")
    if grain:
        # The same coverage the roster authored on a 28x10 face, on this one.
        flecks = round(grain["count"] * (W - 2) * (H - 2) / (28 * 10))
        pits = grain["pitsPerHit"] * stage
        for index in range(flecks + pits):
            h = grain_hash(7 + ord(kind["id"]), index)
            pit = index >= flecks
            name = "pit" if pit else ("pale" if index % 2 == 0 else "shade")
            fill(2 + h % (W - 5), 2 + (h >> 8) % (H - 5), 1, 1, name)
    if kind.get("rivets"):
        middle = 1 + (H - 2) // 2 - 1
        for rivet in range(4):
            x = 1 + round((rivet + 0.5) * (W - 2) / 4) - 1
            fill(x, middle, 2, 2, "d2")
            fill(x, middle, 1, 1, "l1")

    # The mark, only while the face still shows one (the last stage's body is
    # its own dark, and a mark dark on dark is gone): the plain bricks' tick
    # over a bar, silver's cross over a bar, gold's lozenge with a lit heart.
    # Each block gets its engraving — one row of sheen under it.
    if t["d2"] != t["m0"]:
        marks = {
            "plain": [(10, 2, 2, 2), (4, 5, 15, 1)],
            "S": [(9, 3, 4, 1), (10, 2, 2, 2), (6, 5, 11, 1)],
            "G": [(10, 2, 2, 4), (8, 3, 6, 2)],
        }
        key = "plain" if kind["id"] in "12345" else kind["id"]
        for x, y, w, h in marks.get(key, []):
            fill(x, y, w, h, "d2")
            fill(x, y + h, w, 1, "l1")
        if key == "G":
            fill(10, 3, 2, 2, "l1")
    # The cracks, one zig-zag per hit taken. Granite is exempt: its pits are its
    # damage.
    if hurt > 0 and not grain:
        for index, (start, lean) in enumerate([(7, 1), (15, -1), (11, 1)][:hurt]):
            x = start
            for y in range(1, H - 1):
                fill(x, y, 1, 1, "d3")
                x += lean if y % 2 else -lean
    return img, [t[name] for name in BRICK_SLOTS]


# --- the paddle ----------------------------------------------------------------------

PADDLE_W, PADDLE_H = 40, 8
PADDLE_CAP = 6  # the web's 8 px cap
PADDLE_COLORS = {"body": "#2d7fe0", "cap": "#e8384f", "sheen": "#a8d8ff", "shade": "#0b3a78"}
PADDLE_SLOTS = ["outline", "sheen", "bodyLight", "body", "bodyBar", "bodyDark", "shade", "capLight", "cap", "capDark"]


def pill_rows(height):
    r = height / 2
    return [round(r - math.sqrt(max(0, r * r - (y + 0.5 - r) ** 2))) for y in range(height)]


def paddle_tones(colors=PADDLE_COLORS):
    c = {k: hex_rgb(v) for k, v in colors.items()}
    return {
        "outline": mix(c["shade"], BLACK, 0.5),
        "sheen": c["sheen"],
        "bodyLight": mix(c["body"], c["sheen"], 0.4),
        "body": c["body"],
        "bodyBar": mix(c["body"], c["sheen"], 0.5),
        "bodyDark": mix(c["body"], c["shade"], 0.55),
        "shade": c["shade"],
        "capLight": mix(c["cap"], WHITE, 0.4),
        "cap": c["cap"],
        "capDark": mix(c["cap"], BLACK, 0.45),
    }


def paint_paddle():
    """`hdPillPix` at 40x8: an outlined pill, the caps welded on with a column
    of outline, the body's sheen and lit band over it, the dashed light bar
    across the middle and the waterline dithering into the shade."""
    img = Image.new("P", (48, 16), 0)
    slot = {name: i + 1 for i, name in enumerate(PADDLE_SLOTS)}
    W, H, CAP = PADDLE_W, PADDLE_H, PADDLE_CAP
    outer, inner = pill_rows(H), pill_rows(H - 2)
    for y in range(H):
        for x in range(outer[y], W - outer[y]):
            img.putpixel((x, y), slot["outline"])
    # The body rows: 0 outline, 1 sheen, 2 lit, 3 light bar, 4 body,
    # 5 waterline dither, 6 shade, 7 outline — the HD's 21 rows, a third each.
    body_rows = {1: "sheen", 2: "bodyLight", 3: "body", 4: "body", 5: "dither", 6: "shade"}
    cap_rows = {1: "capLight", 2: "cap", 3: "cap", 4: "cap", 5: "capDither", 6: "capDark"}
    for y in range(1, H - 1):
        inset = inner[y - 1] + 1
        for x in range(inset, W - inset):
            dither = BAYER[y & 3][x & 3] < 8
            if x in (CAP - 1, W - CAP):
                name = "outline"
            elif x < CAP or x >= W - CAP:
                name = cap_rows[y]
                if name == "capDither":
                    name = "cap" if dither else "capDark"
            else:
                name = body_rows[y]
                if name == "dither":
                    name = "body" if dither else "bodyDark"
                elif y == 3 and (x - CAP - 2) % 5 < 4 and CAP + 2 <= x < W - CAP - 2:
                    name = "bodyBar"
            img.putpixel((x, y), slot[name])
    tones = paddle_tones()
    return img, [tones[name] for name in PADDLE_SLOTS]


# --- the ball and the shards ------------------------------------------------------------

BALL_SIZE = 8
BALL_TONES = {"body": "#ffe14a", "highlight": "#fff9d0", "shade": "#c98f0a"}


def paint_ball():
    """The web game's ball, as ballRows(8) and ballGlints(8) give it."""
    img = Image.new("P", (16, 16), 0)
    r = BALL_SIZE / 2
    for row in range(BALL_SIZE):
        dy = abs(row + 0.5 - r)
        half = round(math.sqrt(max(0, r * r - dy * dy)))
        for x in range(int(r - half), int(r + half)):
            img.putpixel((x, row), 1)
    for x, y, w, h, v in [(2, 1, 2, 1, 2), (1, 2, 1, 2, 2), (3, 6, 3, 1, 3), (6, 4, 1, 2, 3)]:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                img.putpixel((xx, yy), v)
    return img, [hex_rgb(BALL_TONES[k]) for k in ("body", "highlight", "shade")]


def paint_shards():
    """Four frames of a tumbling chip, in the brick palette's sheen, body and
    shade (BRICK_SLOTS l1, m0, d2): a 3x2 slab turning end over end."""
    l1, m0, d2 = (BRICK_SLOTS.index(n) + 1 for n in ("l1", "m0", "d2"))
    frames = [
        ["aab", "bbc"],
        ["ab.", "bbc", ".c."],
        ["ab", "bb", "bc"],
        [".a.", "abb", ".bc"],
    ]
    tone = {"a": l1, "b": m0, "c": d2}
    img = Image.new("P", (64, 16), 0)
    for f, rows in enumerate(frames):
        for y, line in enumerate(rows):
            for x, ch in enumerate(line):
                if ch != ".":
                    img.putpixel((f * 16 + x, y), tone[ch])
    return img


# The burst a brick dies in: six frames of 32x16 — the two sprites it was drawn
# with — each held BURST_HOLD frames, in the brick's own palette. The first two
# take its flash palette (the web's two ticks of white), then the ring blows
# out past the cell and thins to a few specks of its darkest tones.
BURST_FRAMES = 6
BURST_HOLD = 2
BURST_FLASH_FRAMES = 2
BURST_W, BURST_H = 32, 16


def paint_burst():
    s = {n: BRICK_SLOTS.index(n) + 1 for n in BRICK_SLOTS}
    cx, cy = BURST_W / 2 - 0.5, BURST_H / 2 - 0.5
    img = Image.new("P", (BURST_W * BURST_FRAMES, BURST_H), 0)

    def put(f, x, y, v):
        if 0 <= x < BURST_W and 0 <= y < BURST_H:
            img.putpixel((f * BURST_W + x, y), v)

    def at(rx, ry):
        """Where (x, y) sits on an ellipse of the brick's aspect: 1 on its rim."""
        return lambda x, y: math.hypot((x - cx) / rx, (y - cy) / ry)

    def ring(f, rx, ry, width, tone, keep=16):
        e = at(rx, ry)
        for y in range(BURST_H):
            for x in range(BURST_W):
                if 1 - width / rx <= e(x, y) <= 1 and BAYER[y % 4][x % 4] < keep:
                    put(f, x, y, tone)

    def spokes(f, r0, r1, tone, turn=0.0):
        for k in range(8):
            a = k / 8 * 2 * math.pi + turn
            for r in range(r0, r1 + 1):
                put(f, round(cx + math.cos(a) * r), round(cy + math.sin(a) * r * 0.5), tone)

    # 0: the brick blown white, a pixel past its cell all round.
    for y in range(2, 14):
        for x in range(3, 29):
            corner = (x in (3, 28)) and (y in (2, 13))
            if not corner:
                put(0, x, y, s["pale"] if 5 <= x <= 26 and 4 <= y <= 11 else s["l2"])
    # 1: a hot core, its rim, and eight rays out of it.
    e = at(9, 4.5)
    for y in range(BURST_H):
        for x in range(BURST_W):
            if e(x, y) <= 1:
                put(1, x, y, s["pale"])
    ring(1, 12, 6, 2, s["l1"])
    spokes(1, 10, 15, s["l2"])
    # 2..5: the ring running out, thinner and sparser, into the dark tones.
    ring(2, 13.5, 6.5, 2, s["l1"])
    ring(2, 12, 5.5, 1, s["m1"])
    spokes(2, 14, 15, s["m0"], 0.2)
    ring(3, 14.5, 7, 1.5, s["m0"], keep=10)
    spokes(3, 15, 16, s["d1"], 0.4)
    ring(4, 15.5, 7.5, 1, s["d1"], keep=6)
    ring(5, 15.5, 7.5, 1, s["d2"], keep=2)
    return img
