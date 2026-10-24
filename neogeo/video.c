// The hardware's drawing verbs: palettes, the fix layer, and sprite control
// blocks. SCB1 holds each sprite's tiles (two words a tile: number, then
// palette and flips); SCB2 its shrink; SCB3 its y, sticky bit and height in
// tiles; SCB4 its x. A sticky sprite takes its y and height from the one before
// it and sits 16 px (or its shrunk width) to the right.

#include "game.h"

static u16 seed = 0x5a17;

u16 rnd(void) {
  seed = seed * 25173 + 13849;
  return seed;
}

void load_palette(u8 slot, const u16 *colors) {
  for (u8 i = 0; i < 16; i++) {
    MMAP_PALBANK1[slot * 16 + i] = colors[i];
  }
}

void load_palettes(void) {
  for (u16 p = 0; p < sizeof(PALETTES) / sizeof(PALETTES[0]); p++) {
    load_palette(PALETTES[p].slot, PALETTES[p].colors);
  }
  // Text: every slot lit, so the font reads whichever index it was built on.
  for (u16 i = 1; i < 16; i++) {
    MMAP_PALBANK1[PAL_TEXT * 16 + i] = 0x7eef;
  }
  // The backdrop, behind every sprite.
  MMAP_PALBANK1[255 * 16 + 15] = 0x8000;
}

void fix_put(u8 col, u8 row, u16 value) {
  *REG_VRAMADDR = ADDR_FIXMAP + col * 32 + row;
  *REG_VRAMRW = value;
}

// One vertical strip of `height` tiles, `stride` apart in the sheet.
void sprite_tiles(u16 sprite, u16 first_tile, u16 stride, u8 height, u8 palette) {
  *REG_VRAMMOD = 1;
  *REG_VRAMADDR = ADDR_SCB1 + sprite * 64;
  for (u8 i = 0; i < height; i++) {
    *REG_VRAMRW = first_tile + i * stride;
    *REG_VRAMRW = (u16)palette << 8;
  }
}

void sprite_tile(u16 sprite, u8 row, u16 tile, u8 palette) {
  *REG_VRAMMOD = 1;
  *REG_VRAMADDR = ADDR_SCB1 + sprite * 64 + row * 2;
  *REG_VRAMRW = tile;
  *REG_VRAMRW = (u16)palette << 8;
}

// A one-tile sprite's palette, leaving its tile alone.
void sprite_palette(u16 sprite, u8 palette) {
  *REG_VRAMADDR = ADDR_SCB1 + sprite * 64 + 1;
  *REG_VRAMRW = (u16)palette << 8;
}

void sprite_place(u16 sprite, s16 x, s16 y, u8 height) {
  *REG_VRAMMOD = 0x200;
  *REG_VRAMADDR = ADDR_SCB2 + sprite;
  *REG_VRAMRW = 0x0fff;
  *REG_VRAMRW = (((496 - y) & 0x1ff) << 7) | height;
  *REG_VRAMRW = (x & 0x1ff) << 7;
}

void sprite_stick(u16 sprite, u8 height) {
  *REG_VRAMMOD = 0x200;
  *REG_VRAMADDR = ADDR_SCB2 + sprite;
  *REG_VRAMRW = 0x0fff;
  *REG_VRAMRW = (1 << 6) | height;
}

void sprite_hide(u16 sprite) {
  *REG_VRAMMOD = 0x200;
  *REG_VRAMADDR = ADDR_SCB3 + sprite;
  *REG_VRAMRW = 0;
}

// A full-width band of the sheet, one sprite a column, each row of tiles on its
// own palette, chained so the first sprite places all twenty.
void setup_band(u16 first, u16 tile, u8 rows, u8 palette, s16 y) {
  for (u8 col = 0; col < 20; col++) {
    u16 sprite = first + col;
    for (u8 row = 0; row < rows; row++) {
      sprite_tile(sprite, row, tile + row * SHEET_STRIDE + col, palette + row);
    }
    if (col == 0) {
      sprite_place(sprite, 0, y, rows);
    } else {
      sprite_stick(sprite, rows);
    }
  }
}

// A block of `cols` sprites over consecutive sheet columns, on one palette,
// the first one leading and the rest stuck to it.
//
// A shrunk sprite reads all 32 of its tile slots, not just its rows: the slots
// past them are filled with a blank tile, or a squash drags stale tiles up
// under it.
void setup_block(u16 first, u16 tile, u8 cols, u8 rows, u8 palette) {
  for (u8 col = 0; col < cols; col++) {
    *REG_VRAMMOD = 1;
    *REG_VRAMADDR = ADDR_SCB1 + (first + col) * 64;
    for (u8 row = 0; row < 32; row++) {
      *REG_VRAMRW = TILE_BLANK;
      *REG_VRAMRW = 0;
    }
    sprite_tiles(first + col, tile + col, SHEET_STRIDE, rows, palette);
    if (col > 0) {
      sprite_stick(first + col, rows);
    }
  }
}

// A shrunk block: every sprite takes the shrink, the leader the position.
void place_block(u16 first, u8 cols, s16 x, s16 y, u8 rows, u16 shrink) {
  *REG_VRAMMOD = 1;
  *REG_VRAMADDR = ADDR_SCB2 + first;
  for (u8 i = 0; i < cols; i++) {
    *REG_VRAMRW = shrink;
  }
  *REG_VRAMMOD = 0x200;
  *REG_VRAMADDR = ADDR_SCB3 + first;
  *REG_VRAMRW = (((496 - y) & 0x1ff) << 7) | rows;
  *REG_VRAMRW = (x & 0x1ff) << 7;
}
