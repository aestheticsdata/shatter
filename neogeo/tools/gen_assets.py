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
import random
import re
import sys
from pathlib import Path

from PIL import Image

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
PAL_BRICK0 = 2
# Sprite palettes.
PAL_BG0 = 16
PAL_PADDLE = 40
PAL_BALL = 41
PAL_SHARD0 = 48


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
    text = (SHATTER / "src/core/config/bricks.ts").read_text()
    kinds = []
    pattern = r'\{ id: "(.)", points: (\d+), hitPoints: (\d+).*?light: "(#\w+)", flat: "(#\w+)", dark: "(#\w+)"'
    for match in re.finditer(pattern, text):
        kid, points, hits, light, flat, dark = match.groups()
        kinds.append({"id": kid, "points": int(points), "hits": int(hits), "tones": (light, flat, dark)})
    return kinds


def read_level(name):
    text = (SHATTER / "src/core/levels/levels.ts").read_text()
    match = re.search(r'name: "%s",.*?rows: \[(.*?)\]' % re.escape(name), text, re.S)
    if not match:
        sys.exit(f"level {name} not found")
    return re.findall(r'"([^"]*)"', match.group(1))


# --- sprite sheet --------------------------------------------------------------

def paint_background():
    """SUNRISE's horizon theme, redrawn at 320x224: the dark sky stepping into
    the glow, the ground at sixty percent, two shallow dunes and the Observer
    half-sunk behind them as a faint almond."""
    colors = {
        "base": "#061019", "sky1": "#08161f", "sky2": "#0b1b26", "sky3": "#0e202c",
        "glow": "#112733", "ground": "#040c12", "dune": "#020809", "star": "#2a4a5c",
    }
    c = {k: hex_rgb(v) for k, v in colors.items()}
    img = Image.new("RGB", (SCREEN_W, SCREEN_H), c["base"])
    px = img.load()
    horizon = int(SCREEN_H * 0.6)
    stops = [(horizon - 110, c["base"]), (horizon - 70, c["sky1"]), (horizon - 50, c["sky2"]),
             (horizon - 30, c["sky3"]), (horizon - 12, c["glow"]), (horizon, c["glow"])]
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    for y in range(horizon):
        for i in range(len(stops) - 1):
            (y0, a), (y1, b) = stops[i], stops[i + 1]
            if y0 <= y < y1:
                t = (y - y0) / max(1, y1 - y0)
                for x in range(SCREEN_W):
                    px[x, y] = b if t * 16 > bayer[y % 4][x % 4] + 0.5 else a
    rng = random.Random(7)
    for _ in range(26):
        x, y = rng.randrange(SCREEN_W), rng.randrange(24, horizon - 40)
        px[x, y] = c["star"]
    # The Observer: the shipped almond, sunk to its waist, a fifth of the way lit.
    eye = (0x6a, 0x5a, 0x2a)
    cx, cy, hw, hh = 160, horizon + 2, 100, 40
    for x in range(cx - hw, cx + hw + 1):
        u = (x - cx) / hw
        half = hh * (1 - u * u) ** 1.25
        for y in (round(cy - half), round(cy + half)):
            if 0 <= y < horizon:
                px[x, y] = eye
    for y in range(cy - 16, cy + 17):
        for x in range(cx - 16, cx + 17):
            d = math.hypot(x - cx, y - cy)
            if 13 <= d <= 16 and y < horizon:
                px[x, y] = eye
            elif d < 6 and y < horizon:
                px[x, y] = (0x30, 0x28, 0x14)
    for y in range(horizon, SCREEN_H):
        for x in range(SCREEN_W):
            px[x, y] = c["ground"]
    for fx, radius, rise in ((0.3, 90, 14), (0.72, 120, 20)):
        dx = fx * SCREEN_W
        dy = horizon + radius - rise
        for y in range(horizon - rise, horizon + 2):
            for x in range(SCREEN_W):
                if math.hypot(x - dx, y - dy) <= radius:
                    px[x, y] = c["dune"]
    for x in range(SCREEN_W):
        px[x, horizon - 1] = c["glow"] if px[x, horizon - 1] != c["dune"] else c["dune"]
    return img


def quantize_rows(img, palette_base):
    """Each 16-pixel band of the background gets its own fifteen colours."""
    out = Image.new("P", img.size, 0)
    palettes = []
    for row in range(img.height // 16):
        band = img.crop((0, row * 16, img.width, row * 16 + 16))
        colors = sorted({band.getpixel((x, y)) for x in range(band.width) for y in range(band.height)})
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
            for y in range(16):
                for x in range(img.width):
                    out.putpixel((x, row * 16 + y), index[band.getpixel((x, y))])
        palettes.append((palette_base + row, [None] + colors))
    return out, palettes


def paint_sheet(kinds):
    rows = SCREEN_H // 16 + 1
    sheet = Image.new("P", (TILES_PER_ROW * 16, rows * 16), 0)
    bg, palettes = quantize_rows(paint_background(), PAL_BG0)
    sheet.paste(bg, (0, 0))
    y0 = (SCREEN_H // 16) * 16
    # The paddle: 46 px in the web game, 36 here — blue deck, red caps, sheen
    # along the top and shade along the bottom (palette slots 1..4).
    paddle_w, paddle_h = 36, 6
    for x in range(paddle_w):
        for y in range(paddle_h):
            cap = x < 4 or x >= paddle_w - 4
            if y == 0:
                v = 3
            elif y == paddle_h - 1:
                v = 4
            else:
                v = 2 if cap else 1
            if (x in (0, paddle_w - 1)) and y in (0, paddle_h - 1):
                v = 0
            sheet.putpixel((x, y0 + y), v)
    palettes.append((PAL_PADDLE, [None, hex_rgb("#2d7fe0"), hex_rgb("#e8384f"), hex_rgb("#a8d8ff"), hex_rgb("#0b3a78")]))
    # The ball: 8 px there, 6 here, the same yellow with its highlight and shade.
    ball = ["..11..", ".2111.", "121111", "111113", ".1113.", "..33.."]
    for y, line in enumerate(ball):
        for x, ch in enumerate(line):
            if ch != ".":
                sheet.putpixel((48 + x, y0 + y), int(ch))
    palettes.append((PAL_BALL, [None, hex_rgb("#ffe14a"), hex_rgb("#fff9d0"), hex_rgb("#c98f0a")]))
    # A shard: what a dead brick throws, three pixels of its own tones.
    for y, line in enumerate(["12", "23"]):
        for x, ch in enumerate(line):
            sheet.putpixel((64 + x, y0 + y), int(ch))
    for i, kind in enumerate(kinds):
        palettes.append((PAL_SHARD0 + i, [None] + [hex_rgb(t) for t in kind["tones"]]))
    tiles = {
        "BG": SPRITE_TILE_BASE,
        "PADDLE": SPRITE_TILE_BASE + (y0 // 16) * TILES_PER_ROW,
        "BALL": SPRITE_TILE_BASE + (y0 // 16) * TILES_PER_ROW + 3,
        "SHARD": SPRITE_TILE_BASE + (y0 // 16) * TILES_PER_ROW + 4,
    }
    return sheet, palettes, tiles


# --- fix tiles -------------------------------------------------------------------

def paint_fix(kinds):
    fix = Image.new("P", (2048, 8), 0)
    # A brick is three fix tiles, 24x8, with a pixel of mortar right and below:
    # sheen top and left (1), body (2), shade bottom and right (3).
    for x in range(23):
        for y in range(7):
            v = 2
            if y == 0 or x == 0:
                v = 1
            if y == 6 or x == 22:
                v = 3
            fix.putpixel((x, y), v)
    # Walls: steel, lit from the field side.
    def wall(tile, painter):
        for x in range(8):
            for y in range(8):
                fix.putpixel((tile * 8 + x, y), painter(x, y))
    wall(3, lambda x, y: 3 if x < 2 else (1 if x == 6 else (4 if x == 7 else 2)))
    wall(4, lambda x, y: 3 if x > 5 else (1 if x == 1 else (4 if x == 0 else 2)))
    wall(5, lambda x, y: 3 if y < 2 else (1 if y == 6 else (4 if y == 7 else 2)))
    wall(6, lambda x, y: 3 if (x < 2 or y < 2) else (4 if (x == 7 or y == 7) else 2))
    wall(7, lambda x, y: 3 if (x > 5 or y < 2) else (4 if (x == 0 or y == 7) else 2))
    palettes = [(PAL_WALL, [None, hex_rgb("#c8d2e6"), hex_rgb("#7d8aa6"), hex_rgb("#3c4660"), hex_rgb("#1a2030")])]
    for i, kind in enumerate(kinds):
        palettes.append((PAL_BRICK0 + i, [None] + [hex_rgb(t) for t in kind["tones"]]))
    return fix, palettes


# --- header ----------------------------------------------------------------------

def write_header(path, palettes, sprite_tiles, kinds, rows):
    ids = {k["id"]: i for i, k in enumerate(kinds)}
    lines = ["// Generated by tools/gen_assets.py — do not edit.", "#pragma once", ""]
    lines.append(f'#define LEVEL_NAME "{LEVEL}"')
    for name, value in sprite_tiles.items():
        lines.append(f"#define TILE_{name} {value}")
    lines.append(f"#define FIX_BRICK {FIX_TILE_BASE}")
    lines.append(f"#define FIX_WALL_L {FIX_TILE_BASE + 3}")
    lines.append(f"#define FIX_WALL_R {FIX_TILE_BASE + 4}")
    lines.append(f"#define FIX_WALL_T {FIX_TILE_BASE + 5}")
    lines.append(f"#define FIX_CORNER_L {FIX_TILE_BASE + 6}")
    lines.append(f"#define FIX_CORNER_R {FIX_TILE_BASE + 7}")
    lines.append(f"#define BG_ROWS {SCREEN_H // 16}")
    lines.append(f"#define PAL_TEXT {PAL_TEXT}")
    lines.append(f"#define PAL_WALL {PAL_WALL}")
    lines.append(f"#define PAL_BRICK0 {PAL_BRICK0}")
    lines.append(f"#define PAL_BG0 {PAL_BG0}")
    lines.append(f"#define PAL_PADDLE {PAL_PADDLE}")
    lines.append(f"#define PAL_BALL {PAL_BALL}")
    lines.append(f"#define PAL_SHARD0 {PAL_SHARD0}")
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
    sheet, sprite_palettes, sprite_tiles = paint_sheet(kinds)
    fix, fix_palettes = paint_fix(kinds)
    (HERE / "assets").mkdir(exist_ok=True)
    (HERE / "build").mkdir(exist_ok=True)
    sheet.putpalette([0, 0, 0] + [255, 255, 255] * 255)
    fix.putpalette([0, 0, 0] + [255, 255, 255] * 255)
    sheet.save(HERE / "assets/sprites.png")
    fix.save(HERE / "assets/fix.png")
    write_header(HERE / "build/gfx.h", fix_palettes + sprite_palettes, sprite_tiles, kinds, rows)
    print(f"{LEVEL}: {len(rows)}x{len(rows[0])} bricks, {len(kinds)} kinds")


if __name__ == "__main__":
    main()
