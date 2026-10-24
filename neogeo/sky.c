// SUNRISE's sky (SHA-270): the zodiac dial turning and the stars twinkling.
//
// Both are drawn by tools/neo_sky.py; nothing here moves a sprite. The dial
// swaps the sky band's own tiles where it crosses them, a step every
// DIAL_HOLD frames — one turn a minute, as on the web. The stars sit on four
// palette slots in every sky band, and each slot walks its group's twinkle.

#include "game.h"

static u8 dial_step;
static u8 dial_clock;  // frames into this step; its own, so it never skips
static u16 star_color[STAR_GROUPS];

static void draw_dial(u8 step) {
  for (u8 i = 0; i < DIAL_CELLS; i++) {
    u8 col = DIAL_AT[i][0];
    u8 row = DIAL_AT[i][1];
    sprite_tile(SPR_BG + col, row, DIAL_TILE[step][i], PAL_BG0 + row);
  }
}

void setup_sky(void) {
  draw_dial(0);
}

void step_sky(void) {
  if (++dial_clock == DIAL_HOLD) {
    dial_clock = 0;
    dial_step = (dial_step + 1) % DIAL_STEPS;
    draw_dial(dial_step);
  }
  for (u8 g = 0; g < STAR_GROUPS; g++) {
    u16 color = TWINKLE[(frame + TWINKLE_PHASE[g]) % TWINKLE_STEPS];
    if (color == star_color[g]) {
      continue;
    }
    star_color[g] = color;
    for (u8 band = 0; band < STAR_BANDS; band++) {
      MMAP_PALBANK1[(PAL_BG0 + band) * 16 + STAR_SLOT + g] = color;
    }
  }
}
