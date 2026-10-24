#!/usr/bin/env python3
"""Shatter's art for the Neo-Geo, generated from the web game's own data.

Reads one level's rows from src/core/levels/levels.ts and the brick roster's
three tones from src/core/config/bricks.ts, then writes:

  assets/sprites.png  16x16 sprite tiles (background, paddle, ball, shards),
                      20 tiles a row, packed into the C-ROMs after the BIOS's
                      256 reserved tiles
  assets/fix.png      8x8 fix tiles (brick thirds, walls), appended to the
                      S-ROM after ngdevkit's 1280 text tiles
  build/gfx.h         palettes, tile numbers and the level grid for main.c

Every image is indexed: the pixel values are palette slots, and the palettes
themselves are uploaded by the game at boot. Index 0 is transparent.
"""

import math
from dataclasses import dataclass
import re
import sys
from pathlib import Path

from PIL import Image

import neo_art
import neo_font
import neo_sky

HERE = Path(__file__).resolve().parent.parent
SHATTER = HERE.parent
LEVEL = sys.argv[1] if len(sys.argv) > 1 else "SUNRISE"

SCREEN_W, SCREEN_H = 320, 224
SPRITE_TILE_BASE = 256
FIX_TILE_BASE = 1280
TILES_PER_ROW = 20

# Fix palettes 0..15 (the fix layer can only reach the first sixteen).
PAL_TEXT = 0
PAL_WALL = 1
# The HUD's lettering: one font, a face and a shadow, coloured per role after
# the web game's tokens (css/tokens/colors.css).
HUD_INK = "#0d0d24"  # --color-inset
HUD_PALETTES = {
    "LABEL": ("#7a7c90", HUD_INK),    # --color-panel-divider: the panel's labels
    "SCORE": ("#ffcf1c", HUD_INK),    # --color-yellow
    "LEVEL": ("#f07d10", HUD_INK),    # --color-orange: the level's name
    "LIFE": ("#2d7fe0", HUD_INK),     # --color-blue: the reserve bars
    "OVER": ("#e8384f", "#55000f"),   # --color-red on --color-red-shadow
    "CLEAR": ("#ffffff", "#155c1f"),  # the level's name on --color-green-shadow
    "HEAD": ("#3fbf4f", HUD_INK),     # --color-green: GRID CLEARED
    "HINT": ("#8fd0ff", HUD_INK),     # --color-sky: the blinking prompts
    "WHITE": ("#ffffff", HUD_INK),    # --color-white: the final score
    "RULE": ("#2d7fe0", HUD_INK),     # --color-blue: the clear card's divider
}
PAL_HUD0 = 2
# Sprite palettes.
PAL_BG0 = 16
PAL_FG0 = 30
PAL_PADDLE = 40
PAL_BALL = 41
PAL_EYE = 42
PAL_PADDLE_GHOST = 43  # and 44: the deck's trail
# Bricks are sprites since the look pass: per kind, its damage stages, then a
# white flash, then the wall's sweeping shine for the first three stages.
PAL_BRICKS = 64
BRICK_PAL_STRIDE = 8
BRICK_FLASH = 4
BRICK_SHINE = 5


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def ng_color(rgb):
    """24-bit RGB to the Neo-Geo's 16-bit word: dark bit, three LSBs, 4:4:4."""
    r, g, b = (c >> 3 for c in rgb)
    word = ((r & 1) << 14) | ((g & 1) << 13) | ((b & 1) << 12)
    word |= ((r >> 1) << 8) | ((g >> 1) << 4) | (b >> 1)
    return word


# --- the web game's data -----------------------------------------------------

def read_bricks():
    """The roster, one row per brick: tones, wear ramp, granite's grain, rivets."""
    text = (SHATTER / "src/core/config/bricks.ts").read_text()
    kinds = []
    for line in text.splitlines():
        head = re.search(r'\{ id: "(.)", points: (\d+), hitPoints: (\d+)', line)
        if not head:
            continue
        tone = lambda name: re.search(name + r': "(#\w+)"', line).group(1)
        wear = re.search(r"wear: \[(.*?)\]", line).group(1)
        grain = re.search(r'grain: \{ count: (\d+), pitsPerHit: (\d+), pit: "(#\w+)" \}', line)
        kinds.append({
            "id": head.group(1),
            "points": int(head.group(2)),
            "hits": int(head.group(3)),
            "light": tone("light"),
            "flat": tone("flat"),
            "dark": tone("dark"),
            "tones": (tone("light"), tone("flat"), tone("dark")),
            "wear": re.findall(r'"(#\w+)"', wear),
            "grain": grain and {"count": int(grain.group(1)), "pitsPerHit": int(grain.group(2)), "pit": grain.group(3)},
            "rivets": "rivets: true" in line,
        })
    return kinds


def read_level(name):
    text = (SHATTER / "src/core/levels/levels.ts").read_text()
    match = re.search(r'name: "%s",.*?rows: \[(.*?)\]' % re.escape(name), text, re.S)
    if not match:
        sys.exit(f"level {name} not found")
    return re.findall(r'"([^"]*)"', match.group(1))


# --- sprite sheet --------------------------------------------------------------

HORIZON, FG_TOP, CLEAR = neo_sky.HORIZON, neo_sky.FG_TOP, neo_sky.CLEAR


def quantize_rows(img, palette_base):
    """Each 16-pixel band of the background gets its own fifteen colours.
    CLEAR pixels become index 0, transparent."""
    out = Image.new("P", img.size, 0)
    palettes = []
    for row in range(img.height // 16):
        band = img.crop((0, row * 16, img.width, row * 16 + 16))
        colors = sorted({band.getpixel((x, y)) for x in range(band.width) for y in range(band.height)} - {CLEAR})
        if len(colors) > 15:
            q = band.quantize(colors=15)
            pal = q.getpalette()[: 15 * 3]
            colors = [tuple(pal[i : i + 3]) for i in range(0, 45, 3)]
            index = {}
            for y in range(16):
                for x in range(img.width):
                    out.putpixel((x, row * 16 + y), q.getpixel((x, y)) + 1)
        else:
            index = {color: i + 1 for i, color in enumerate(colors)}
            index[CLEAR] = 0
            for y in range(16):
                for x in range(img.width):
                    out.putpixel((x, row * 16 + y), index[band.getpixel((x, y))])
        palettes.append((palette_base + row, [None] + colors))
    return out, palettes


# THE OBSERVER (SHA-267): SUNRISE's eye, the web game's socket scaled by 0.73
# on both axes so the almond keeps its shape — hw 150, hh 60 there.
EYE_HW, EYE_HH = 110, 44
EYE_W, EYE_H = 240, 112  # the almond's sprite block: 15 x 7 tiles
EYE_CX, EYE_CY = 120, 52  # the socket's centre inside it
IRIS_SIZE = 80  # the iris's block: 5 x 5 tiles, centred
EYE_TONES = {
    "sclera": "#dbe4ff", "scleraShade": "#c7d2f5", "rim": "#7a5a08", "lash": "#dfae2c",
    "iris": "#2d7fe0", "irisEdge": "#1d47a8", "irisInner": "#63b0ff", "pupil": "#05050f", "glint": "#ffffff",
}
EYE_SLOTS = {name: i + 1 for i, name in enumerate(EYE_TONES)}
# What a faint eye fades toward: the sky behind it, at the glow band.
EYE_FADE_TO = "#0b1b26"
EYE_FADE_STEPS = 16


def paint_almond():
    """The shipped almond, wide open, as `drawEye` scans it: a parabola, the
    white shaded under the brow, the edge laid as steps — gold above, bronze
    below — four lashes off the brow and two ticks of rim past the corners."""
    img = Image.new("P", (EYE_W, EYE_H), 0)
    s = EYE_SLOTS

    def fill(x, y, w, h, v):
        for yy in range(y, y + h):
            for xx in range(round(x), round(x) + w):
                if 0 <= xx < EYE_W and 0 <= yy < EYE_H:
                    img.putpixel((xx, yy), v)

    cx, cy, hw, lid = EYE_CX, EYE_CY, EYE_HW, EYE_HH
    previous, previous_y = 0, cy - lid
    for dy in range(-lid, lid + 1):
        t = dy / lid
        half = round(hw * (1 - t * t))
        if half <= 0:
            continue
        y = cy + dy
        fill(cx - half, y, 2 * half, 1, s["scleraShade"] if dy < -lid * 0.55 else s["sclera"])
        edge = s["lash"] if dy <= 0 else s["rim"]
        step = max(1, abs(half - previous))
        wide = max(half, previous)
        step_y = y if half >= previous else previous_y
        fill(cx - wide, step_y, step, 1, edge)
        fill(cx + wide - step, step_y, step, 1, edge)
        if half <= 2:
            fill(cx - half, y, 2 * half, 1, edge)
        previous, previous_y = half, y
    if previous > 0:
        fill(cx - previous, previous_y, previous * 2, 1, s["rim"])
    for fraction, rise in ((-0.86, 3), (-0.58, 4), (0.84, 3), (0.56, 4)):
        brow = cy - round(lid * math.sqrt(max(0, 1 - abs(fraction))))
        fill(cx + fraction * hw, brow - rise, 1, rise, s["lash"])
    fill(cx - hw - 3, cy, 3, 1, s["rim"])
    fill(cx + hw, cy, 3, 1, s["rim"])
    return img


def paint_iris():
    """The iris and pupil, centred in their own block so the look can move
    them: limbal ring, fibres, a pupil a third of the socket and the glint."""
    img = Image.new("P", (IRIS_SIZE, IRIS_SIZE), 0)
    s = EYE_SLOTS
    c = IRIS_SIZE // 2
    radius, pupil = round(EYE_HH * 0.8), round(EYE_HH * 0.34)
    for dy in range(-radius, radius + 1):
        y = c + dy
        half = round(math.sqrt(radius * radius - dy * dy))
        a, b = c - half, c + half
        rim = abs(dy) > radius - 3
        for x in range(a, b):
            img.putpixel((x, y), s["irisEdge"] if rim else s["iris"])
        if not rim:
            for x in (a, a + 1, b - 2, b - 1):
                img.putpixel((x, y), s["irisEdge"])
            if abs(dy) < radius * 0.55 and (y + c) % 5 == 0:
                for x in range(a + 3, b - 3):
                    img.putpixel((x, y), s["irisInner"])
        if abs(dy) <= pupil:
            ph = round(math.sqrt(pupil * pupil - dy * dy))
            for x in range(c - ph, c + ph):
                img.putpixel((x, y), s["pupil"])
    for y in range(c - pupil + 1, c - pupil + 3):
        for x in range(c - pupil + 1, c - pupil + 3):
            img.putpixel((x, y), s["glint"])
    return img


# The iris's reach, as eyePupilPoint bounds it: the almond's half-width less
# the iris and four, and the lid less the iris and one.
IRIS_REACH_X = EYE_HW - round(EYE_HH * 0.8) - 4
IRIS_REACH_Y = EYE_HH - round(EYE_HH * 0.8) - 1


def iris_variants():
    """The iris clipped to the almond at every offset it can look to.

    The web game lets the iris travel the whole box above and clips it to the
    lid. A Neo-Geo sprite cannot be clipped and its tiles are in ROM, so every
    offset is drawn here already clipped — the iris kept only over the white,
    under the lid's edge — and the game swaps the iris's 25 tiles as it moves.
    Returns {offset: picture number} and the pictures, each 25 tiles."""
    almond, iris = paint_almond(), paint_iris()
    inside = {EYE_SLOTS["sclera"], EYE_SLOTS["scleraShade"]}
    mask = almond.point(lambda v: 255 if v in inside else 0, "L")
    half, size = IRIS_SIZE // 2, IRIS_SIZE
    blank = Image.new("P", iris.size, 0)
    offsets, pictures, seen = {}, [], {}
    for dy in range(-IRIS_REACH_Y, IRIS_REACH_Y + 1):
        for dx in range(-IRIS_REACH_X, IRIS_REACH_X + 1):
            ox, oy = EYE_CX + dx - half, EYE_CY + dy - half
            clipped = Image.composite(iris, blank, mask.crop((ox, oy, ox + size, oy + size)))
            tiles = tuple(clipped.crop((x * 16, y * 16, x * 16 + 16, y * 16 + 16)) for y in range(size // 16) for x in range(size // 16))
            key = b"".join(t.tobytes() for t in tiles)
            if key not in seen:
                seen[key] = len(pictures)
                pictures.append(tiles)
            offsets[(dx, dy)] = seen[key]
    return offsets, pictures


def eye_fades():
    """The eye's palette at EYE_FADE_STEPS opacities, mixed toward the sky."""
    back = hex_rgb(EYE_FADE_TO)
    steps = []
    for step in range(EYE_FADE_STEPS):
        a = step / (EYE_FADE_STEPS - 1)
        row = [None]
        for tone in EYE_TONES.values():
            rgb = hex_rgb(tone)
            row.append(tuple(round(back[i] + (rgb[i] - back[i]) * a) for i in range(3)))
        steps.append(row)
    return steps


def paint_sheet(kinds):
    bg_rows, fg_rows = SCREEN_H // 16, (SCREEN_H - FG_TOP) // 16
    misc_row = bg_rows + fg_rows
    eye_row = misc_row + 1
    sky, front = neo_sky.paint_background()
    indexed, palettes = neo_sky.index_sky([sky] + neo_sky.dial_frames(sky, front), PAL_BG0)
    cells, pictures = neo_sky.dial_cells(indexed)
    # The dial's cells at every step, each distinct picture once, in rows of
    # their own under the bricks.
    unique = {}
    for step in pictures:
        for picture in step:
            unique.setdefault(picture.tobytes(), picture)
    # A row for the bursts, then the bricks' two, then the dial's steps.
    burst_row = eye_row + EYE_H // 16
    dial_row = burst_row + 3
    iris_offsets, iris_pictures = iris_variants()
    iris_unique = {}
    for picture in iris_pictures:
        for tile in picture:
            iris_unique.setdefault(tile.tobytes(), tile)
    iris_row = dial_row + -(-len(unique) // TILES_PER_ROW)
    rows = iris_row + -(-len(iris_unique) // TILES_PER_ROW)
    sheet = Image.new("P", (TILES_PER_ROW * 16, rows * 16), 0)
    sheet.paste(indexed[0], (0, 0))
    dial_tile = {}
    for i, (key, picture) in enumerate(unique.items()):
        x, y = (i % TILES_PER_ROW) * 16, (dial_row + i // TILES_PER_ROW) * 16
        sheet.paste(picture, (x, y))
        dial_tile[key] = SPRITE_TILE_BASE + (y // 16) * TILES_PER_ROW + x // 16
    dial = (cells, [[dial_tile[p.tobytes()] for p in step] for step in pictures])
    iris_tile = {}
    for i, (key, tile) in enumerate(iris_unique.items()):
        x, y = (i % TILES_PER_ROW) * 16, (iris_row + i // TILES_PER_ROW) * 16
        sheet.paste(tile, (x, y))
        iris_tile[key] = SPRITE_TILE_BASE + (y // 16) * TILES_PER_ROW + x // 16
    iris = (iris_offsets, [[iris_tile[t.tobytes()] for t in picture] for picture in iris_pictures])
    assert SPRITE_TILE_BASE + rows * TILES_PER_ROW < 65536, "the sheet outgrew 16-bit tile numbers"
    fg, fg_palettes = quantize_rows(front, PAL_FG0)
    sheet.paste(fg, (0, bg_rows * 16))
    palettes += fg_palettes
    sheet.paste(paint_almond(), (0, eye_row * 16))
    sheet.paste(paint_iris(), (EYE_W, eye_row * 16))
    y0 = misc_row * 16
    paddle, paddle_tones = neo_art.paint_paddle()
    sheet.paste(paddle, (0, y0))
    palettes.append((PAL_PADDLE, [None] + paddle_tones))
    ball, ball_tones = neo_art.paint_ball()
    sheet.paste(ball, (48, y0))
    palettes.append((PAL_BALL, [None] + ball_tones))
    sheet.paste(neo_art.paint_shards(), (64, y0))
    sheet.paste(neo_art.paint_burst(), (0, burst_row * 16))
    # The deck's trail: itself again, sinking into the dark behind it.
    dusk = hex_rgb("#061019")
    for i, t in enumerate((0.55, 0.78)):
        palettes.append((PAL_PADDLE_GHOST + i, [None] + [neo_art.mix(c, dusk, t) for c in paddle_tones]))
    # Every brick kind at every damage stage: a tile pair each, and a palette.
    brick_tiles = []
    variant = 0
    brick_row = dial_row - 2
    for k, kind in enumerate(kinds):
        stages = []
        for stage in range(kind["hits"]):
            img, tones = neo_art.paint_brick(kind, stage)
            x, y = (variant % 10) * 32, (brick_row + variant // 10) * 16
            sheet.paste(img, (x, y))
            stages.append(SPRITE_TILE_BASE + (y // 16) * TILES_PER_ROW + x // 16)
            variant += 1
            base = PAL_BRICKS + k * BRICK_PAL_STRIDE
            palettes.append((base + stage, [None] + tones))
            if stage < 3:
                palettes.append((base + BRICK_SHINE + stage, [None] + [neo_art.mix(c, neo_art.WHITE, 0.4) for c in tones]))
            if stage == 0:
                palettes.append((base + BRICK_FLASH, [None] + [neo_art.mix(c, neo_art.WHITE, 0.75) for c in tones]))
        brick_tiles.append(stages)
    assert variant <= 20, "brick variants overflow their two sheet rows"
    tiles = {
        "BG": SPRITE_TILE_BASE,
        "FG": SPRITE_TILE_BASE + bg_rows * TILES_PER_ROW,
        "EYE": SPRITE_TILE_BASE + eye_row * TILES_PER_ROW,
        "IRIS": SPRITE_TILE_BASE + eye_row * TILES_PER_ROW + EYE_W // 16,
        "PADDLE": SPRITE_TILE_BASE + (y0 // 16) * TILES_PER_ROW,
        "BALL": SPRITE_TILE_BASE + (y0 // 16) * TILES_PER_ROW + 3,
        "SHARD": SPRITE_TILE_BASE + (y0 // 16) * TILES_PER_ROW + 4,
        "BURST": SPRITE_TILE_BASE + burst_row * TILES_PER_ROW,
    }
    return sheet, palettes, tiles, brick_tiles, paddle_tones, (dial, iris)


# --- fix tiles -------------------------------------------------------------------

# The web game's HD rail (FRAME_RAILS in src/render/palette.ts), outer edge
# inward, one tone a pixel across the fix tile's eight: its two held
# wallLight pixels are one here. Then the rivet's catch of light.
RAIL_TONES = ["#6f7aa8", "#eef2ff", "#dbe4ff", "#c9d2f2", "#b4bee6", "#a0aad6", "#8f9ac8", "#5c6690"]
RIVET_LIGHT = len(RAIL_TONES) + 1
RIVET_BODY = len(RAIL_TONES)       # the rail's innermost tone, as on the web
RIVET_DARK = len(RAIL_TONES) - 1   # the wall's shade

# Rivets, as (tile, orientation, along): a 3 px head across the rail's middle
# tones, `along` pixels into the tile down (or across) the run. It may start
# outside the tile — the top rail's middle rivet straddles two.
RAIL_TILES = {
    "WALL_L": ("L", None), "WALL_R": ("R", None), "WALL_T": ("T", None),
    "CORNER_L": ("CL", None), "CORNER_R": ("CR", None),
    "RIVET_L2": ("L", 2), "RIVET_L4": ("L", 4), "RIVET_R2": ("R", 2), "RIVET_R4": ("R", 4),
    "RIVET_T2": ("T", 2), "RIVET_T3": ("T", 3), "RIVET_T6": ("T", 6), "RIVET_TM2": ("T", -2),
}


def rail_index(orientation, x, y):
    """How far in from the rail's outer edge (x, y) is; the corners mitre."""
    return {"L": x, "R": 7 - x, "T": y, "CL": min(x, y), "CR": min(7 - x, y)}[orientation]


def paint_fix(kinds):
    """The fix sheet: the rail, the HUD's lettering, a reserve bar and a rule.

    Returns the sheet, its palettes and {name: first tile} for the header."""
    fix = Image.new("P", (2048, 8), 0)
    names = {}
    tile = 3

    def put(cells):
        nonlocal tile
        for (x, y), color in cells.items():
            fix.putpixel((tile * 8 + x, y), color)
        tile += 1

    for name, (orientation, along) in RAIL_TILES.items():
        cells = {(x, y): rail_index(orientation, x, y) + 1 for x in range(8) for y in range(8)}
        if along is not None:
            across = [3, 4, 5] if orientation != "R" else [4, 3, 2]
            run = range(along, along + 3)
            head = [(u, a) if orientation == "T" else (a, u) for u in run for a in across]
            # Lit from the upper left of the whole head, wherever the tile cuts it.
            light = (min(x for x, _ in head), min(y for _, y in head))
            dark = (max(x for x, _ in head), max(y for _, y in head))
            for x, y in head:
                if 0 <= x < 8 and 0 <= y < 8:
                    cells[(x, y)] = RIVET_LIGHT if (x, y) == light else RIVET_DARK if (x, y) == dark else RIVET_BODY
        names[name] = tile
        put(cells)

    for name, glyphs in neo_font.glyph_tiles():
        names[name] = tile
        for cells in glyphs:
            put(cells)

    # A reserve life: the web panel's 16x5 bar, here 14x5 across two tiles with
    # a pixel of shadow under and right, so two bars stand 2 px apart.
    bar = {(x, y): neo_font.FACE for x in range(1, 15) for y in range(2, 7)}
    bar = {**{(x + 1, y + 1): neo_font.SHADOW for x, y in bar}, **bar}
    names["LIFE"] = tile
    for ox in (0, 8):
        put({(x - ox, y): v for (x, y), v in bar.items() if 0 <= x - ox < 8 and y < 8})

    # The cards' divider: a 1 px rule through the middle of the tile.
    names["RULE"] = tile
    put({(x, 3): neo_font.FACE for x in range(8)})

    palettes = [(PAL_WALL, [None] + [hex_rgb(t) for t in RAIL_TONES] + [hex_rgb("#f4f7ff")])]
    for slot, (face, shadow) in enumerate(HUD_PALETTES.values()):
        palettes.append((PAL_HUD0 + slot, [None, hex_rgb(face), hex_rgb(shadow)]))
    return fix, palettes, names


# --- header ----------------------------------------------------------------------

@dataclass
class Art:
    """Everything the header publishes: the drawn sheets' tiles and palettes,
    the brick roster and the level."""

    palettes: list
    sprite_tiles: dict
    fix_tiles: dict
    kinds: list
    rows: list
    brick_tiles: list
    paddle_tones: list
    dial: tuple  # the cells the dial crosses, and each step's tile for each
    iris: tuple  # {offset: picture}, and each picture's 25 tiles


def write_header(path, art):
    palettes, sprite_tiles, fix_tiles = art.palettes, art.sprite_tiles, art.fix_tiles
    kinds, rows, brick_tiles, paddle_tones = art.kinds, art.rows, art.brick_tiles, art.paddle_tones
    ids = {k["id"]: i for i, k in enumerate(kinds)}
    lines = ["// Generated by tools/gen_assets.py — do not edit.", "#pragma once", ""]
    lines.append(f'#define LEVEL_NAME "{LEVEL}"')
    for name, value in sprite_tiles.items():
        lines.append(f"#define TILE_{name} {value}")
    for name, tile in fix_tiles.items():
        lines.append(f"#define FIX_{name} {FIX_TILE_BASE + tile}")
    for slot, name in enumerate(HUD_PALETTES):
        lines.append(f"#define PAL_HUD_{name} {PAL_HUD0 + slot}")
    lines.append(f"#define BG_ROWS {SCREEN_H // 16}")
    lines.append(f"#define FG_ROWS {(SCREEN_H - FG_TOP) // 16}")
    lines.append(f"#define FG_TOP {FG_TOP}")
    lines.append(f"#define SHEET_STRIDE {TILES_PER_ROW}")
    lines.append(f"#define HORIZON {HORIZON}")
    lines.append(f"#define EYE_COLS {EYE_W // 16}")
    lines.append(f"#define EYE_ROWS {EYE_H // 16}")
    lines.append(f"#define EYE_CX {EYE_CX}")
    lines.append(f"#define EYE_CY {EYE_CY}")
    lines.append(f"#define EYE_HW {EYE_HW}")
    lines.append(f"#define EYE_HH {EYE_HH}")
    lines.append(f"#define IRIS_TILES {IRIS_SIZE // 16}")
    lines.append(f"#define IRIS_HALF {IRIS_SIZE // 2}")
    lines.append(f"#define IRIS_RADIUS {round(EYE_HH * 0.8)}")
    lines.append(f"#define IRIS_REACH_X {IRIS_REACH_X}")
    lines.append(f"#define IRIS_REACH_Y {IRIS_REACH_Y}")
    lines.append(f"#define PAL_EYE {PAL_EYE}")
    lines.append(f"#define PAL_FG0 {PAL_FG0}")
    lines.append(f"#define EYE_FADE_STEPS {EYE_FADE_STEPS}")
    lines.append(f"#define PAL_TEXT {PAL_TEXT}")
    lines.append(f"#define PAL_WALL {PAL_WALL}")
    lines.append(f"#define PAL_BG0 {PAL_BG0}")
    lines.append(f"#define PAL_PADDLE {PAL_PADDLE}")
    lines.append(f"#define PAL_BALL {PAL_BALL}")
    lines.append(f"#define BRICK_KINDS {len(kinds)}")
    lines.append(f"#define LEVEL_ROWS {len(rows)}")
    lines.append(f"#define LEVEL_COLS {len(rows[0])}")
    lines.append("")
    lines.append("typedef struct { u16 slot; u16 colors[16]; } palette_t;")
    lines.append(f"static const palette_t PALETTES[{len(palettes)}] = {{")
    for slot, colors in palettes:
        words = [0x8000 if c is None else ng_color(c) for c in colors]
        words += [0] * (16 - len(words))
        lines.append("  {%d, {%s}}," % (slot, ", ".join(f"0x{w:04x}" for w in words)))
    lines.append("};")
    lines.append("")
    lines.append("// The eye's palette from faint (0) to fully lit, mixed toward the sky.")
    lines.append(f"static const u16 EYE_FADE[EYE_FADE_STEPS][16] = {{")
    for row in eye_fades():
        words = [0x8000 if c is None else ng_color(c) for c in row] + [0] * (16 - len(row))
        lines.append("  {%s}," % ", ".join(f"0x{w:04x}" for w in words))
    lines.append("};")
    lines.append("")
    cells, steps = art.dial
    lines.append("// The zodiac dial: the sky's cells it crosses, and their tiles at each")
    lines.append("// step of its turn; a step every DIAL_HOLD frames, one turn a minute.")
    lines.append(f"#define DIAL_CELLS {len(cells)}")
    lines.append(f"#define DIAL_STEPS {neo_sky.DIAL_STEPS}")
    lines.append(f"#define DIAL_HOLD {neo_sky.DIAL_HOLD}")
    lines.append("static const u8 DIAL_AT[DIAL_CELLS][2] = {%s};" % ", ".join("{%d, %d}" % cell for cell in cells))
    lines.append("static const u16 DIAL_TILE[DIAL_STEPS][DIAL_CELLS] = {")
    for step in steps:
        lines.append("  {%s}," % ", ".join(str(t) for t in step))
    lines.append("};")
    lines.append("")
    offsets, pictures = art.iris
    lines.append("// The iris clipped to the almond: which picture each offset from the")
    lines.append("// socket's centre wears, and each picture's tiles, row by row.")
    lines.append(f"#define IRIS_PICTURES {len(pictures)}")
    lines.append("static const u16 IRIS_AT[2 * IRIS_REACH_Y + 1][2 * IRIS_REACH_X + 1] = {")
    for dy in range(-IRIS_REACH_Y, IRIS_REACH_Y + 1):
        lines.append("  {%s}," % ", ".join(str(offsets[(dx, dy)]) for dx in range(-IRIS_REACH_X, IRIS_REACH_X + 1)))
    lines.append("};")
    lines.append("static const u16 IRIS_PICTURE[IRIS_PICTURES][IRIS_TILES * IRIS_TILES] = {")
    for picture in pictures:
        lines.append("  {%s}," % ", ".join(str(t) for t in picture))
    lines.append("};")
    lines.append("")
    lines.append("// The twinkle: each star group's palette slot through its cycle.")
    lines.append(f"#define STAR_SLOT {neo_sky.STAR_SLOT}")
    lines.append(f"#define STAR_GROUPS {neo_sky.STAR_GROUPS}")
    lines.append(f"#define STAR_BANDS {HORIZON // 16 + 1}")
    lines.append(f"#define TWINKLE_STEPS {neo_sky.TWINKLE_STEPS}")
    lines.append("static const u16 TWINKLE_PHASE[STAR_GROUPS] = {%s};" % ", ".join(str(p) for p in neo_sky.TWINKLE_PHASES))
    lines.append("static const u16 TWINKLE[TWINKLE_STEPS] = {%s};" % ", ".join(f"0x{ng_color(c):04x}" for c in neo_sky.twinkle()))
    lines.append("")
    lines.append(f"#define PAL_BRICKS {PAL_BRICKS}")
    lines.append(f"#define BRICK_PAL_STRIDE {BRICK_PAL_STRIDE}")
    lines.append(f"#define BRICK_FLASH {BRICK_FLASH}")
    lines.append(f"#define BRICK_SHINE {BRICK_SHINE}")
    lines.append(f"#define PAL_PADDLE_GHOST {PAL_PADDLE_GHOST}")
    lines.append(f"#define PADDLE_W {neo_art.PADDLE_W}")
    lines.append(f"#define PADDLE_H {neo_art.PADDLE_H}")
    lines.append(f"#define BALL {neo_art.BALL_SIZE}")
    lines.append(f"#define CELL_W {neo_art.CELL_W}")
    lines.append(f"#define CELL_H {neo_art.CELL_H}")
    lines.append("// Directions a chip is flung in: sixteen round the circle, x and y x128.")
    lines.append("#define CHIP_HEADINGS 16")
    headings = [(round(math.cos(a) * 128), round(math.sin(a) * 128)) for a in (i / 16 * 2 * math.pi for i in range(16))]
    lines.append("static const s16 CHIP_HEADING[CHIP_HEADINGS][2] = {%s};" % ", ".join("{%d, %d}" % h for h in headings))
    lines.append(f"#define BURST_FRAMES {neo_art.BURST_FRAMES}")
    lines.append(f"#define BURST_HOLD {neo_art.BURST_HOLD}")
    lines.append(f"#define BURST_FLASH_FRAMES {neo_art.BURST_FLASH_FRAMES}")
    lines.append("// Each kind's tile pair per damage stage.")
    lines.append(f"static const u16 BRICK_TILE[{len(kinds)}][4] = {{")
    for stages in brick_tiles:
        lines.append("  {%s}," % ", ".join(str(t) for t in (stages + [stages[-1]] * 4)[:4]))
    lines.append("};")
    # The deck's palette per hit flash (4) and cap glow (8): a hit blows the
    # whole deck toward white and lets go over a few frames; the caps breathe.
    cap_names = ("capLight", "cap", "capDark")
    lines.append("static const u16 PADDLE_PAL[4][8][16] = {")
    for flash in range(4):
        lines.append("  {")
        for glow in range(8):
            g = (1 - math.cos(glow / 8 * 2 * math.pi)) / 2 * 0.28
            tones = []
            for name, c in zip(neo_art.PADDLE_SLOTS, paddle_tones):
                if name in cap_names:
                    c = neo_art.mix(c, neo_art.WHITE, g)
                tones.append(neo_art.mix(c, neo_art.WHITE, flash * 0.22))
            words = [0x8000] + [ng_color(c) for c in tones]
            words += [0] * (16 - len(words))
            lines.append("    {%s}," % ", ".join(f"0x{w:04x}" for w in words))
        lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append("// Per kind: points, hit points.")
    lines.append(f"static const u16 KIND_POINTS[{len(kinds)}] = {{{', '.join(str(k['points']) for k in kinds)}}};")
    lines.append(f"static const u8 KIND_HITS[{len(kinds)}] = {{{', '.join(str(k['hits']) for k in kinds)}}};")
    lines.append("")
    # The ball's velocities, in whole pixels a frame on each axis (SHA-265).
    # Positions are drawn in whole pixels, so any fractional speed steps
    # unevenly (2.44 px came out 2,3,2,2,3; half pixels 2,3,2,3) and reads as
    # judder. Whole-pixel pairs move the same distance every frame, the way
    # the arcade breakouts did it: fewer angles, and the speed differs a little
    # from one to the next. Steep to flat; the second fan is from loop 2 on.
    # The game steps the ball twice a frame, so the table holds half of each.
    fans = [
        [(1, 3), (1, 2), (2, 2), (2, 1)],
        [(1, 4), (2, 3), (3, 3), (3, 2)],
    ]
    lines.append("// The bounce fan per speed: {dx, dy} a half-frame step in 8.8, steep to flat.")
    lines.append(f"#define FAN {len(fans[0])}")
    lines.append(f"#define SPEEDS {len(fans)}")
    lines.append("static const s16 VELOCITY[SPEEDS][FAN][2] = {")
    for fan in fans:
        lines.append("  {%s}," % ", ".join("{%d, %d}" % (vx * 128, vy * 128) for vx, vy in fan))
    lines.append("};")
    lines.append("")
    lines.append("// The level, one byte a cell: 0 for empty, else kind index + 1.")
    lines.append(f"static const u8 LEVEL_GRID[{len(rows)}][{len(rows[0])}] = {{")
    for row in rows:
        lines.append("  {%s}," % ", ".join("0" if ch == "." else str(ids[ch] + 1) for ch in row))
    lines.append("};")
    path.write_text("\n".join(lines) + "\n")


def main():
    kinds = read_bricks()
    rows = read_level(LEVEL)
    sheet, sprite_palettes, sprite_tiles, brick_tiles, paddle_tones, (dial, iris) = paint_sheet(kinds)
    fix, fix_palettes, fix_tiles = paint_fix(kinds)
    (HERE / "assets").mkdir(exist_ok=True)
    (HERE / "build").mkdir(exist_ok=True)
    sheet.putpalette([0, 0, 0] + [255, 255, 255] * 255)
    fix.putpalette([0, 0, 0] + [255, 255, 255] * 255)
    sheet.save(HERE / "assets/sprites.png")
    fix.save(HERE / "assets/fix.png")
    art = Art(fix_palettes + sprite_palettes, sprite_tiles, fix_tiles, kinds, rows, brick_tiles, paddle_tones, dial, iris)
    write_header(HERE / "build/gfx.h", art)
    print(f"{LEVEL}: {len(rows)}x{len(rows[0])} bricks, {len(kinds)} kinds")


if __name__ == "__main__":
    main()
