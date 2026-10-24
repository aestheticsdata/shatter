// SHATTER for the Neo-Geo: what the modules share.
//
// Screen space is 320x224. Positions are 8.8 fixed point; the 68000 has no FPU.
// Every tile number, palette and size the art decides comes from build/gfx.h,
// which tools/gen_assets.py writes out of the web game's TypeScript sources.

#pragma once

#include <ngdevkit/neogeo.h>
#include <ngdevkit/bios-ram.h>
#include <ngdevkit/ng-fix.h>

#include "gfx.h"

#define FP(px) ((s32)(px) << 8)
#define PX(fp) ((s16)((fp) >> 8))

// Field, in screen pixels: walls at fix columns 1 and 38, ceiling at row 4.
#define FIELD_L 16
#define FIELD_R 304
#define FIELD_T 24
#define SCREEN_H 224
#define GRID_X 16
#define GRID_Y 48
#define FIX_ROW_OF(y) (2 + (y) / 8)

#define PADDLE_Y 204
#define PADDLE_SPEED 4

// Sprite slots, drawn in index order: the sky and its dial first, shards last. The bricks sit
// in front of the eye — it is behind the wall — and behind the deck and ball.
#define SPR_BG 1
#define SPR_DIAL 21
#define SPR_EYE (SPR_DIAL + DIAL_COLS)
#define SPR_IRIS (SPR_EYE + EYE_COLS)
#define SPR_FG (SPR_IRIS + IRIS_TILES)
#define SPR_BRICKS (SPR_FG + 20)
#define SPR_PADDLE_GHOST (SPR_BRICKS + LEVEL_ROWS * LEVEL_COLS * 2)
#define PADDLE_GHOSTS 2
#define SPR_PADDLE (SPR_PADDLE_GHOST + PADDLE_GHOSTS * 4)
#define SPR_CAPSULE (SPR_PADDLE + 4)
#define SPR_BALL (SPR_CAPSULE + 6)
#define BALLS 9
// Debris last: past 96 sprites on a line the hardware drops the last ones in
// this order, and a chip missing for a frame is the one thing nobody misses.
#define SPR_SHARD (SPR_BALL + BALLS)
#define SHARDS 20

enum { STATE_SERVE, STATE_PLAY, STATE_CLEAR, STATE_OVER };

// The commands sound.s answers; 0-3 are nullsound's own.
enum {
  SND_RESET = 3,
  SND_THEME = 4,
  SND_OVER = 5,
  SND_WALL = 7,
  SND_PADDLE = 8,
  SND_LAUNCH = 9,
  SND_LOST = 10,
  SND_CLEAR = 11,
  SND_GAMEOVER = 12,
  SND_BRICK0 = 13,
  SND_BRICK_ROWS = 5,
  SND_SPAWN = 18,
  SND_PICKUP = 19,
};

// --- the run (main.c) -------------------------------------------------------------
extern u8 state;
extern u8 level;  // index into LEVELS
extern u32 score;
extern u8 score_dirty;  // redrawn once a frame, however many kills
extern u16 frame;
extern u8 pad_now;
extern s8 shake_x, shake_y;
void draw_hud(void);
void rattle(u8 ticks, u8 amplitude);

// --- the wall (wall.c) ------------------------------------------------------------
extern u16 remaining;
extern u16 wall_size;
void setup_wall(void);
void build_wall(void);
u8 strike_bricks(s16 x, s16 y);
void step_wall(void);

// --- the deck and the balls (deck.c) ----------------------------------------------
typedef struct {
  s32 x, y, vx, vy;
  u8 birth;  // frames still growing to full size
} ball_t;
extern s16 paddle_x, paddle_w;
extern ball_t balls[BALLS];
extern u8 ball_count;
void setup_deck(void);
void serve(void);
void reset_deck(void);
void widen_deck(u8 wide);
void move_paddle(void);
void step_balls(void);
void hold_ball(void);
void add_balls(u8 count);
void render_deck(void);

// --- the capsules (capsule.c) -----------------------------------------------------
void setup_capsules(void);
void reset_capsules(void);
void drop_capsule(s16 cx, s16 cy);
void step_capsules(void);

// --- the Observer (eye.c) ---------------------------------------------------------
void setup_eye(void);
void reset_eye(void);
void step_eye(void);
void render_eye(void);

// --- sound (sound.c) --------------------------------------------------------------
void sound(u8 command);
void flush_sound(void);

// --- the sky (sky.c) ----------------------------------------------------------------
void setup_sky(void);
void reset_sky(void);
void step_sky(void);

// --- the HUD's lettering (hud.c) ---------------------------------------------------
// Labels on row 2, their values under them on row 3, above the top rail.
#define HUD_LABEL_ROW 2
#define HUD_VALUE_ROW 3
#define HUD_SCORE_COL 2
#define HUD_SCORE_DIGITS 6
#define HUD_LIVES_RIGHT 38
#define HUD_RESERVE_ROOM 4
typedef struct {
  u8 col;
  u8 row;
} cell_t;
void hud_text(cell_t at, u8 palette, const char *text);
void hud_center(u8 row, u8 palette, const char *text);
void hud_score(u32 value);
void hud_big_center(u8 row, u8 palette, const char *text);
void hud_lives(u8 reserve);
void hud_rule(u8 row, u8 palette, u8 cols);
void hud_clear(u8 row, u8 rows);

// --- video (video.c) --------------------------------------------------------------
#define TILE_BLANK (TILE_MISC + SHEET_STRIDE - 1)
u16 rnd(void);
void load_palettes(void);
void load_palette(u8 slot, const u16 *colors);
void fix_put(u8 col, u8 row, u16 value);
void sprite_tiles(u16 sprite, u16 first_tile, u16 stride, u8 height, u8 palette);
void sprite_tile(u16 sprite, u8 row, u16 tile, u8 palette);
void sprite_palette(u16 sprite, u8 palette);
void sprite_place(u16 sprite, s16 x, s16 y, u8 height);
void sprite_stick(u16 sprite, u8 height);
void sprite_hide(u16 sprite);
void setup_band(u16 first, u16 tile, u8 rows, u8 palette, s16 y);
void setup_block(u16 first, u16 tile, u8 cols, u8 rows, u8 palette);
void place_block(u16 first, u8 cols, s16 x, s16 y, u8 rows, u16 shrink);
