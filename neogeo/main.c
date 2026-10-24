// SHATTER for the Neo-Geo — proof of concept (SHA-263).
//
// One level of the web game, played on the real hardware's terms: the bricks
// and walls are fix-layer tiles (killing a brick is three VRAM writes), the
// background, paddle, ball and shards are sprites, and every palette comes
// from tools/gen_assets.py, which reads the level and the brick roster out of
// the TypeScript sources.
//
// Screen space is 320x224. Positions are 8.8 fixed point; the 68000 has no FPU.

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
#define CELL_W 24
#define CELL_H 8
#define FIX_ROW_OF(y) (2 + (y) / 8)
#define FIX_COL_OF(x) ((x) / 8)

#define PADDLE_W 36
#define PADDLE_Y 204
#define PADDLE_SPEED 4
#define BALL 6

// Sprite slots, drawn in index order: the sky first, shards last.
#define SPR_BG 1
#define SPR_EYE 21
#define SPR_IRIS (SPR_EYE + EYE_COLS)
#define SPR_FG (SPR_IRIS + IRIS_TILES)
#define SPR_PADDLE (SPR_FG + 20)
#define SPR_BALL (SPR_PADDLE + 3)
#define SPR_SHARD (SPR_BALL + 1)
#define SHARDS 16

#define EMPTY_TILE SROM_EMPTY_TILE

// Serve and restart: up, or any of the four buttons.
#define LAUNCH (CNT_UP | CNT_A | CNT_B | CNT_C | CNT_D)

enum { STATE_SERVE, STATE_PLAY, STATE_CLEAR, STATE_OVER };

typedef struct {
  s32 x, y, vx, vy;
  u8 life;
  u8 kind;
} shard_t;

static u8 bricks[LEVEL_ROWS][LEVEL_COLS];
static u16 remaining;
static u32 score;
static u8 lives;
static u8 loop;
static u8 state;
static u16 timer;

static s16 paddle_x;
static s32 ball_x, ball_y, ball_vx, ball_vy;
static shard_t shards[SHARDS];
static u16 seed = 0x5a17;

static u8 pad_now, pad_prev;
volatile u8 vblank;

void rom_callback_VBlank(void) {
  vblank = 1;
}

static void wait_vblank(void) {
  while (!vblank) {
  }
  vblank = 0;
}

static u16 rnd(void) {
  seed = seed * 25173 + 13849;
  return seed;
}

// --- video ---------------------------------------------------------------------

static void load_palettes(void) {
  for (u16 p = 0; p < sizeof(PALETTES) / sizeof(PALETTES[0]); p++) {
    for (u16 i = 0; i < 16; i++) {
      MMAP_PALBANK1[PALETTES[p].slot * 16 + i] = PALETTES[p].colors[i];
    }
  }
  // Text: every slot lit, so the font reads whichever index it was built on.
  for (u16 i = 1; i < 16; i++) {
    MMAP_PALBANK1[PAL_TEXT * 16 + i] = 0x7eef;
  }
  // The backdrop, behind every sprite: the sky's own base.
  MMAP_PALBANK1[255 * 16 + 15] = 0x8000;
}

static void fix_put(u8 col, u8 row, u16 value) {
  *REG_VRAMADDR = ADDR_FIXMAP + col * 32 + row;
  *REG_VRAMRW = value;
}

static void fix_text(u8 col, u8 row, const char *text) {
  ng_text(col, row, PAL_TEXT, text);
}

static void fix_clear_row(u8 row) {
  for (u8 col = 2; col < 38; col++) {
    fix_put(col, row, EMPTY_TILE);
  }
}

// One vertical strip of `height` tiles, consecutive in the sheet's column.
static void sprite_tiles(u16 sprite, u16 first_tile, u16 stride, u8 height, u8 palette) {
  *REG_VRAMMOD = 1;
  *REG_VRAMADDR = ADDR_SCB1 + sprite * 64;
  for (u8 i = 0; i < height; i++) {
    *REG_VRAMRW = first_tile + i * stride;
    *REG_VRAMRW = (u16)palette << 8;
  }
}

static void sprite_place(u16 sprite, s16 x, s16 y, u8 height) {
  *REG_VRAMMOD = 0x200;
  *REG_VRAMADDR = ADDR_SCB2 + sprite;
  *REG_VRAMRW = 0x0fff;
  *REG_VRAMRW = (((496 - y) & 0x1ff) << 7) | height;
  *REG_VRAMRW = (x & 0x1ff) << 7;
}

static void sprite_stick(u16 sprite, u8 height) {
  *REG_VRAMMOD = 0x200;
  *REG_VRAMADDR = ADDR_SCB2 + sprite;
  *REG_VRAMRW = 0x0fff;
  *REG_VRAMRW = (1 << 6) | height;
}

static void sprite_hide(u16 sprite) {
  *REG_VRAMMOD = 0x200;
  *REG_VRAMADDR = ADDR_SCB3 + sprite;
  *REG_VRAMRW = 0;
}

// A full-width band of the sheet, one sprite a column, each row of tiles on its
// own palette, chained so the first sprite places all twenty.
static void setup_band(u16 first, u16 tile, u8 rows, u8 palette, s16 y) {
  for (u8 col = 0; col < 20; col++) {
    u16 sprite = first + col;
    for (u8 row = 0; row < rows; row++) {
      *REG_VRAMMOD = 1;
      *REG_VRAMADDR = ADDR_SCB1 + sprite * 64 + row * 2;
      *REG_VRAMRW = tile + row * SHEET_STRIDE + col;
      *REG_VRAMRW = (u16)(palette + row) << 8;
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
// past them are filled with a blank tile, or a blink drags stale tiles up
// under the eye.
#define TILE_BLANK (TILE_PADDLE + SHEET_STRIDE - 1)

static void setup_block(u16 first, u16 tile, u8 cols, u8 rows, u8 palette) {
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

static void setup_sprites(void) {
  setup_band(SPR_BG, TILE_BG, BG_ROWS, PAL_BG0, 0);
  setup_block(SPR_EYE, TILE_EYE, EYE_COLS, EYE_ROWS, PAL_EYE);
  setup_block(SPR_IRIS, TILE_IRIS, IRIS_TILES, IRIS_TILES, PAL_EYE);
  setup_band(SPR_FG, TILE_FG, FG_ROWS, PAL_FG0, FG_TOP);
  for (u8 i = 0; i < 3; i++) {
    sprite_tiles(SPR_PADDLE + i, TILE_PADDLE + i, 0, 1, PAL_PADDLE);
  }
  sprite_stick(SPR_PADDLE + 1, 1);
  sprite_stick(SPR_PADDLE + 2, 1);
  sprite_tiles(SPR_BALL, TILE_BALL, 0, 1, PAL_BALL);
  for (u8 i = 0; i < SHARDS; i++) {
    sprite_hide(SPR_SHARD + i);
  }
}

// --- the wall ------------------------------------------------------------------

static void draw_frame(void) {
  u8 top = FIX_ROW_OF(FIELD_T) - 1;
  fix_put(1, top, (PAL_WALL << 12) | FIX_CORNER_L);
  fix_put(38, top, (PAL_WALL << 12) | FIX_CORNER_R);
  for (u8 col = 2; col < 38; col++) {
    fix_put(col, top, (PAL_WALL << 12) | FIX_WALL_T);
  }
  for (u8 row = top + 1; row < 30; row++) {
    fix_put(1, row, (PAL_WALL << 12) | FIX_WALL_L);
    fix_put(38, row, (PAL_WALL << 12) | FIX_WALL_R);
  }
}

static void draw_brick(u8 r, u8 c) {
  u8 row = FIX_ROW_OF(GRID_Y) + r;
  u8 col = FIX_COL_OF(GRID_X) + c * 3;
  u8 kind = bricks[r][c];
  for (u8 i = 0; i < 3; i++) {
    u16 value = kind ? (((PAL_BRICK0 + kind - 1) << 12) | (FIX_BRICK + i)) : EMPTY_TILE;
    fix_put(col + i, row, value);
  }
}

static u8 hits_left[LEVEL_ROWS][LEVEL_COLS];

static u16 wall_size;

static void build_wall(void) {
  remaining = 0;
  for (u8 r = 0; r < LEVEL_ROWS; r++) {
    for (u8 c = 0; c < LEVEL_COLS; c++) {
      bricks[r][c] = LEVEL_GRID[r][c];
      hits_left[r][c] = bricks[r][c] ? KIND_HITS[bricks[r][c] - 1] : 0;
      if (bricks[r][c] && KIND_HITS[bricks[r][c] - 1] < 99) {
        remaining++;
      }
      draw_brick(r, c);
    }
  }
  wall_size = remaining;
}

static void spawn_shards(u8 r, u8 c, u8 kind) {
  s16 cx = GRID_X + c * CELL_W + CELL_W / 2;
  s16 cy = GRID_Y + r * CELL_H + CELL_H / 2;
  u8 spawned = 0;
  for (u8 i = 0; i < SHARDS && spawned < 5; i++) {
    shard_t *s = &shards[i];
    if (s->life) {
      continue;
    }
    s->x = FP(cx - 8 + (rnd() % 16));
    s->y = FP(cy - 2 + (rnd() % 4));
    s->vx = (s32)(rnd() % 512) - 256;
    s->vy = -(s32)(rnd() % 320) - 64;
    s->life = 50 + rnd() % 20;
    s->kind = kind;
    sprite_tiles(SPR_SHARD + i, TILE_SHARD, 0, 1, PAL_SHARD0 + kind - 1);
    spawned++;
  }
}

static void draw_hud(void);

// --- sound -----------------------------------------------------------------------

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
};

// A command written to REG_SOUND before the Z80 has read the last one replaces
// it, so a brick and a bounce in the same frame would lose one: they queue,
// and one leaves per frame. A full queue drops the newest.
#define SOUND_QUEUE 8
static u8 sound_queue[SOUND_QUEUE];
static u8 sound_head, sound_tail;

static void sound(u8 command) {
  u8 next = (sound_tail + 1) % SOUND_QUEUE;
  if (next != sound_head) {
    sound_queue[sound_tail] = command;
    sound_tail = next;
  }
}

static void flush_sound(void) {
  if (sound_head != sound_tail) {
    *REG_SOUND = sound_queue[sound_head];
    sound_head = (sound_head + 1) % SOUND_QUEUE;
  }
}

// The first live brick under any corner of the ball, damaged; 1 if it was hit.
static u8 strike_bricks(s16 x, s16 y) {
  const s16 xs[2] = {x, x + BALL - 1};
  const s16 ys[2] = {y, y + BALL - 1};
  for (u8 j = 0; j < 2; j++) {
    for (u8 i = 0; i < 2; i++) {
      s16 gx = xs[i] - GRID_X;
      s16 gy = ys[j] - GRID_Y;
      if (gx < 0 || gy < 0) {
        continue;
      }
      u8 c = gx / CELL_W;
      u8 r = gy / CELL_H;
      if (r >= LEVEL_ROWS || c >= LEVEL_COLS || !bricks[r][c]) {
        continue;
      }
      u8 kind = bricks[r][c];
      if (--hits_left[r][c] == 0) {
        bricks[r][c] = 0;
        draw_brick(r, c);
        spawn_shards(r, c, kind);
        // Higher rows ring higher, as on the web; rows past the fifth share its note.
        sound(SND_BRICK0 + (r < SND_BRICK_ROWS ? r : SND_BRICK_ROWS - 1));
        score += KIND_POINTS[kind - 1];
        remaining--;
        draw_hud();
      } else {
        sound(SND_WALL);
      }
      return 1;
    }
  }
  return 0;
}

// --- HUD -----------------------------------------------------------------------

static void number(char *out, u32 value, u8 digits) {
  for (s8 i = digits - 1; i >= 0; i--) {
    out[i] = '0' + value % 10;
    value /= 10;
  }
  out[digits] = 0;
}

static void draw_hud(void) {
  char text[8];
  fix_text(2, 2, "SCORE");
  number(text, score, 6);
  fix_text(8, 2, text);
  fix_text(17, 2, LEVEL_NAME);
  fix_text(30, 2, "LIVES");
  number(text, lives, 1);
  fix_text(36, 2, text);
}

// --- the rally -------------------------------------------------------------------

// One aim of the fan, at the current loop's speed, heading up and to `dir`.
static void aim(u8 index, s8 dir) {
  u8 speed = loop < SPEEDS ? loop : SPEEDS - 1;
  ball_vx = dir * VELOCITY[speed][index][0];
  ball_vy = -VELOCITY[speed][index][1];
}

static void serve(void) {
  state = STATE_SERVE;
  aim(1, 1);
}

static void reset_game(void) {
  score = 0;
  lives = 3;
  loop = 0;
  paddle_x = (FIELD_L + FIELD_R - PADDLE_W) / 2;
  fix_clear_row(16);
  fix_clear_row(18);
  build_wall();
  draw_hud();
  serve();
  sound(SND_THEME);
}

static void move_paddle(void) {
  if (pad_now & CNT_LEFT) {
    paddle_x -= PADDLE_SPEED;
  }
  if (pad_now & CNT_RIGHT) {
    paddle_x += PADDLE_SPEED;
  }
  if (paddle_x < FIELD_L) {
    paddle_x = FIELD_L;
  }
  if (paddle_x > FIELD_R - PADDLE_W) {
    paddle_x = FIELD_R - PADDLE_W;
  }
}

// The further from the deck's centre, the flatter the bounce; dead centre keeps
// the ball's own side.
static void bounce_off_paddle(void) {
  s16 offset = (PX(ball_x) + BALL / 2) - (paddle_x + PADDLE_W / 2);
  s8 dir = offset > 0 ? 1 : (offset < 0 ? -1 : (ball_vx < 0 ? -1 : 1));
  s16 reach = offset < 0 ? -offset : offset;
  s16 index = reach * FAN / (PADDLE_W / 2 + BALL / 2 + 1);
  aim(index < FAN ? index : FAN - 1, dir);
}

static void step_ball(void) {
  s32 old_x = ball_x;
  ball_x += ball_vx;
  if (PX(ball_x) < FIELD_L) {
    ball_x = FP(FIELD_L);
    ball_vx = -ball_vx;
    sound(SND_WALL);
  } else if (PX(ball_x) + BALL > FIELD_R) {
    ball_x = FP(FIELD_R - BALL);
    ball_vx = -ball_vx;
    sound(SND_WALL);
  } else if (strike_bricks(PX(ball_x), PX(ball_y))) {
    ball_x = old_x;
    ball_vx = -ball_vx;
  }

  s32 old_y = ball_y;
  s16 old_bottom = PX(ball_y) + BALL;
  ball_y += ball_vy;
  s16 bottom = PX(ball_y) + BALL;
  if (PX(ball_y) < FIELD_T) {
    ball_y = FP(FIELD_T);
    ball_vy = -ball_vy;
    sound(SND_WALL);
  } else if (strike_bricks(PX(ball_x), PX(ball_y))) {
    ball_y = old_y;
    ball_vy = -ball_vy;
  } else if (ball_vy > 0 && old_bottom <= PADDLE_Y && bottom >= PADDLE_Y && PX(ball_x) + BALL > paddle_x &&
             PX(ball_x) < paddle_x + PADDLE_W) {
    ball_y = FP(PADDLE_Y - BALL);
    bounce_off_paddle();
    sound(SND_PADDLE);
  }
}

static void step_shards(void) {
  for (u8 i = 0; i < SHARDS; i++) {
    shard_t *s = &shards[i];
    if (!s->life) {
      continue;
    }
    s->x += s->vx;
    s->y += s->vy;
    s->vy += 40;
    if (--s->life == 0 || PX(s->y) > SCREEN_H) {
      s->life = 0;
      sprite_hide(SPR_SHARD + i);
      continue;
    }
    sprite_place(SPR_SHARD + i, PX(s->x), PX(s->y), 1);
  }
}

// --- THE OBSERVER ------------------------------------------------------------------
//
// SUNRISE's eye (SHA-267), THE RISE as the web game plays it: sunk to its waist
// behind the dunes and a fifth lit, it climbs as the wall comes down, easing a
// little of the way each frame, and brightens as it goes; at nine tenths it
// blinks and wakes, and from then on its iris follows the ball. A blink is the
// hardware's vertical shrink on the almond and the iris together; the fade is
// palette steps, the Neo-Geo having no transparency.

#define EYE_REST_X 160
#define EYE_REST_Y (HORIZON + 2)
#define EYE_RISE 48            // the web game's 66 px, scaled like the socket
#define EYE_ONE 4096           // the rise's fixed point
#define EYE_WAKE (EYE_ONE * 9 / 10)
#define EYE_EASE 20            // 0.08 of the way a frame, out of 256
#define LOOK_EASE 90           // 0.35
#define BLINK_TICKS 14
#define BLINK_MIN 180
#define BLINK_RAND 260
#define IRIS_REACH_X 32
#define IRIS_REACH_Y 8

static s32 eye_frac;
static u8 eye_awake;
static u8 blink_left;
static u16 next_blink = BLINK_MIN;
static s32 look_x = FP(EYE_REST_X), look_y = FP(EYE_REST_Y);
static s8 eye_fade = -1;
static s16 eye_x, eye_y;
static u16 eye_open = 256;     // 256 wide open, 15 at the bottom of a blink

static void eye_palette(u8 step) {
  for (u8 i = 0; i < 16; i++) {
    MMAP_PALBANK1[PAL_EYE * 16 + i] = EYE_FADE[step][i];
  }
}

static s16 clamp(s16 v, s16 reach) {
  return v < -reach ? -reach : (v > reach ? reach : v);
}

static void step_eye(void) {
  s32 wall = wall_size ? ((s32)(wall_size - remaining) * EYE_ONE) / wall_size : EYE_ONE;
  eye_frac += ((wall - eye_frac) * EYE_EASE) >> 8;
  eye_x = EYE_REST_X;
  eye_y = EYE_REST_Y - (s16)((EYE_RISE * eye_frac) / EYE_ONE);

  // 0.2 to 1, as the web game's opacity rides the same fraction.
  s8 fade = (EYE_FADE_STEPS - 1) * (EYE_ONE / 5 + eye_frac * 4 / 5) / EYE_ONE;
  if (fade != eye_fade) {
    eye_fade = fade;
    eye_palette(fade);
  }

  u8 awake = eye_frac >= EYE_WAKE;
  if (awake && !eye_awake && !blink_left) {
    blink_left = BLINK_TICKS;
    next_blink = BLINK_MIN + rnd() % BLINK_RAND;
  }
  eye_awake = awake;
  if (blink_left) {
    blink_left--;
  } else if (--next_blink == 0) {
    blink_left = BLINK_TICKS;
    next_blink = BLINK_MIN + rnd() % BLINK_RAND;
  }
  if (blink_left) {
    s16 from_middle = blink_left - BLINK_TICKS / 2;
    u16 open = (from_middle < 0 ? -from_middle : from_middle) * 256 / (BLINK_TICKS / 2);
    eye_open = open < 15 ? 15 : open;
  } else {
    eye_open = 256;
  }

  // Asleep it stares dead out; awake it looks at the ball, its iris kept
  // inside the almond the way eyePupilPoint keeps it.
  s16 tx = eye_x, ty = eye_y;
  if (eye_awake && state != STATE_OVER) {
    tx = PX(ball_x) + BALL / 2;
    ty = PX(ball_y) + BALL / 2;
  }
  s16 lid = EYE_HH * eye_open / 256;
  if (lid < 2) {
    lid = 2;
  }
  // The web game lets the iris travel 71 px and clips it to the lid; a sprite
  // cannot be clipped, so the reach is what keeps the whole disc inside the
  // almond: 32 px sideways at the centre line, and less height the further out
  // it looks (worked out against the parabola: 0 px off-centre → 8 px up or
  // down, 15 → 4, 32 → 0). The field maps onto it a quarter to one.
  s16 dx = clamp((tx - eye_x) / 4, IRIS_REACH_X);
  s16 reach_y = IRIS_REACH_Y - (dx < 0 ? -dx : dx) / 4;
  if (reach_y > lid - IRIS_RADIUS - 1) {
    reach_y = lid - IRIS_RADIUS - 1;
  }
  s16 px = eye_x + dx;
  s16 py = eye_y + clamp((ty - eye_y) * 11 / 50, reach_y > 0 ? reach_y : 0);
  look_x += ((FP(px) - look_x) * LOOK_EASE) >> 8;
  look_y += ((FP(py) - look_y) * LOOK_EASE) >> 8;
}

// A shrunk block: every sprite takes the shrink, the leader the position.
static void place_block(u16 first, u8 cols, s16 x, s16 y, u8 rows, u16 shrink) {
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

static void render_eye(void) {
  u16 lines = eye_open;  // the shrink keeps (v + 1) of every 256 lines
  u16 shrink = 0x0f00 | (lines - 1);
  place_block(SPR_EYE, EYE_COLS, eye_x - EYE_CX, eye_y - EYE_CY * lines / 256, EYE_ROWS, shrink);
  s16 iy = eye_y + (PX(look_y) - eye_y) * (s16)lines / 256;
  place_block(SPR_IRIS, IRIS_TILES, PX(look_x) - IRIS_HALF, iy - IRIS_HALF * lines / 256, IRIS_TILES, shrink);
}

static void step(void) {
  u8 pressed = pad_now & ~pad_prev;
  switch (state) {
    case STATE_SERVE:
      move_paddle();
      ball_x = FP(paddle_x + PADDLE_W / 2 - BALL / 2);
      ball_y = FP(PADDLE_Y - BALL);
      if (pressed & LAUNCH) {
        state = STATE_PLAY;
        sound(SND_LAUNCH);
      }
      break;
    case STATE_PLAY:
      move_paddle();
      step_ball();
      step_ball();
      if (PX(ball_y) > SCREEN_H) {
        lives--;
        draw_hud();
        if (lives == 0) {
          state = STATE_OVER;
          sound(SND_GAMEOVER);
          sound(SND_OVER);
          ng_center_text(16, PAL_TEXT, "GAME OVER");
          ng_center_text(18, PAL_TEXT, "PRESS UP");
        } else {
          sound(SND_LOST);
          serve();
        }
      } else if (remaining == 0) {
        state = STATE_CLEAR;
        timer = 120;
        sound(SND_CLEAR);
        ng_center_text(16, PAL_TEXT, "LEVEL CLEAR");
      }
      break;
    case STATE_CLEAR:
      if (--timer == 0) {
        fix_clear_row(16);
        loop++;
        build_wall();
        serve();
      }
      break;
    case STATE_OVER:
      if (pressed & LAUNCH) {
        reset_game();
      }
      break;
  }
  step_shards();
  step_eye();
}

static void render(void) {
  render_eye();
  sprite_place(SPR_PADDLE, paddle_x, PADDLE_Y, 1);
  if (state == STATE_OVER || state == STATE_CLEAR) {
    sprite_hide(SPR_BALL);
  } else {
    sprite_place(SPR_BALL, PX(ball_x), PX(ball_y), 1);
  }
}

#ifdef AUTOPLAY
// `gmake CFLAGS+=-DAUTOPLAY`: the deck chases the ball, a few pixels off
// centre so the angles vary, and serves on its own — a rally to watch without
// a joystick.
static u8 autopilot(void) {
  static u16 frame;
  frame++;
  if (state == STATE_SERVE || state == STATE_OVER) {
    return (frame & 32) ? CNT_A : 0;
  }
  s16 aim = PX(ball_x) + BALL / 2 - PADDLE_W / 2 + ((frame >> 7) % 5) * 6 - 12;
  if (aim < paddle_x - 2) {
    return CNT_LEFT;
  }
  if (aim > paddle_x + 2) {
    return CNT_RIGHT;
  }
  return 0;
}
#endif

int main(void) {
  *REG_SOUND = SND_RESET;
  ng_cls();
  load_palettes();
  setup_sprites();
  draw_frame();
  reset_game();
  for (;;) {
    wait_vblank();
    pad_prev = pad_now;
    pad_now = bios_p1current;
#ifdef AUTOPLAY
    pad_now = autopilot();
#endif
    step();
    render();
    flush_sound();
  }
  return 0;
}
