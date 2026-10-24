// Every level's sky (SHA-270, SHA-269): the web game's field art, the zodiac
// dial turning over it, and the stars twinkling.
//
// tools/neo_sky.py draws it all; nothing here moves anything but the dial. A
// level's sky is fourteen bands of tiles, each on its own palette, loaded when
// the level starts; a horizon level also stands its dunes on the foreground
// band, in front of the eye. The dial is a 9x9 block of sprites over the sky,
// its tiles swapped a step every DIAL_HOLD frames — one turn a minute, as on
// the web — in its theme's three tones. The stars sit on four palette slots in
// every band, and each slot walks its twinkle.

#include "game.h"

static u8 dial_step;
static u8 dial_clock;  // frames into this step; its own, so it never skips
static u16 star_color[STAR_GROUPS];

static void draw_dial(u8 step) {
  const u16 *tiles = DIAL_TILE[step];
  for (u8 col = 0; col < DIAL_COLS; col++) {
    for (u8 row = 0; row < DIAL_COLS; row++) {
      sprite_tile(SPR_DIAL + col, row, tiles[row * DIAL_COLS + col], PAL_DIAL);
    }
  }
}

void setup_sky(void) {
  setup_block(SPR_DIAL, TILE_BLANK, DIAL_COLS, DIAL_COLS, PAL_DIAL);
}

// A new level: its sky, its foreground or none, and the dial in its ink.
void reset_sky(void) {
  setup_band(SPR_BG, SKY_TILE[level], BG_ROWS, PAL_BG0, 0);
  for (u8 band = 0; band < BG_ROWS; band++) {
    load_palette(PAL_BG0 + band, SKY_PALETTES[level][band]);
  }
  s8 front = LEVEL_FRONT[level];
  if (front < 0) {
    sprite_hide(SPR_FG);
  } else {
    setup_band(SPR_FG, FRONT_TILE[front], FG_ROWS, PAL_FG0, FG_TOP);
    for (u8 band = 0; band < FG_ROWS; band++) {
      load_palette(PAL_FG0 + band, FRONT_PALETTES[front][band]);
    }
  }
  load_palette(PAL_DIAL, DIAL_TONES[LEVEL_THEME[level]]);
  place_block(SPR_DIAL, DIAL_COLS, DIAL_CENTRE[level][0] - DIAL_HALF, DIAL_CENTRE[level][1] - DIAL_HALF, DIAL_COLS,
              0x0fff);
  draw_dial(dial_step);
  for (u8 g = 0; g < STAR_GROUPS; g++) {
    star_color[g] = 0;
  }
}

void step_sky(void) {
  if (++dial_clock == DIAL_HOLD) {
    dial_clock = 0;
    dial_step = (dial_step + 1) % DIAL_STEPS;
    draw_dial(dial_step);
  }
  for (u8 g = 0; g < STAR_GROUPS; g++) {
    u16 color = STAR_RAMP[level][g][TWINKLE[(frame + TWINKLE_PHASE[g]) % TWINKLE_STEPS]];
    if (color == star_color[g]) {
      continue;
    }
    star_color[g] = color;
    for (u8 band = 0; band < BG_ROWS; band++) {
      MMAP_PALBANK1[(PAL_BG0 + band) * 16 + STAR_SLOT + g] = color;
    }
  }
}
