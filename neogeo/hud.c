// The HUD's lettering (SHA-270): the web game's two faces, redrawn as fix
// tiles by tools/neo_font.py — Silkscreen's small caps for labels and prompts,
// tall figures for the score, and Press Start 2P doubled, with its hard
// shadow, for the cards. One set of tiles; the palette picks the role.

#include "game.h"

#define SCREEN_COLS 40
#define FIELD_COLS 36  // between the rails

static u16 glyph(char c) {
  if (c >= 'A' && c <= 'Z') {
    return c - 'A';
  }
  return 26 + c - '0';
}

static u8 printable(char c) {
  return (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}

static u8 length(const char *text) {
  u8 n = 0;
  while (text[n]) {
    n++;
  }
  return n;
}

void hud_text(cell_t at, u8 palette, const char *text) {
  for (; *text; text++, at.col++) {
    u16 tile = printable(*text) ? FIX_SMALL + glyph(*text) : SROM_EMPTY_TILE;
    fix_put(at.col, at.row, ((u16)palette << 12) | tile);
  }
}

void hud_center(u8 row, u8 palette, const char *text) {
  hud_text((cell_t){(SCREEN_COLS - length(text)) / 2, row}, palette, text);
}

// The score, under its label: six tall figures.
void hud_score(u32 value) {
  for (s8 i = HUD_SCORE_DIGITS - 1; i >= 0; i--) {
    fix_put(HUD_SCORE_COL + i, HUD_VALUE_ROW, (PAL_HUD_SCORE << 12) | (FIX_TALL + value % 10));
    value /= 10;
  }
}

// Two rows tall, two columns a glyph. A name too long for the field between
// the rails is set in the small face on the lower row instead.
void hud_big_center(u8 row, u8 palette, const char *text) {
  u8 n = length(text);
  if (n * 2 > FIELD_COLS) {
    hud_center(row + 1, palette, text);
    return;
  }
  u8 col = (SCREEN_COLS - n * 2) / 2;
  for (; *text; text++, col += 2) {
    for (u8 i = 0; i < 4; i++) {
      u16 tile = printable(*text) ? FIX_BIG + glyph(*text) * 4 + i : SROM_EMPTY_TILE;
      fix_put(col + (i & 1), row + (i >> 1), ((u16)palette << 12) | tile);
    }
  }
}

// The reserve, as on the web panel: one 14 px bar a spare life, not counting
// the ball in play, right-aligned under LIVES.
void hud_lives(u8 reserve) {
  for (u8 i = 0; i < HUD_RESERVE_ROOM; i++) {
    u8 col = HUD_LIVES_RIGHT - 2 * (i + 1);
    u8 lit = i < reserve;
    fix_put(col, HUD_VALUE_ROW, lit ? (PAL_HUD_LIFE << 12) | FIX_LIFE : SROM_EMPTY_TILE);
    fix_put(col + 1, HUD_VALUE_ROW, lit ? (PAL_HUD_LIFE << 12) | (FIX_LIFE + 1) : SROM_EMPTY_TILE);
  }
}

void hud_rule(u8 row, u8 palette, u8 cols) {
  u8 from = (SCREEN_COLS - cols) / 2;
  for (u8 col = from; col < from + cols; col++) {
    fix_put(col, row, ((u16)palette << 12) | FIX_RULE);
  }
}

void hud_clear(u8 row, u8 rows) {
  for (; rows; rows--, row++) {
    for (u8 col = 2; col < 38; col++) {
      fix_put(col, row, SROM_EMPTY_TILE);
    }
  }
}
