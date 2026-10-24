// The deck and the ball (SHA-270).
//
// The deck is the web game's HD pill at 40x8 across three sprites. It lives:
// its caps breathe (a slow palette pulse), a hit blows it toward white and lets
// go, and the impact squashes it two pixels on the hardware's vertical shrink,
// bottom held, so the top dips. Moving, it leaves two fading ghosts.
//
// The ball is the web game's own eight rows — never redrawn, never trailed.

#include "game.h"

#define TRAIL 8               // positions remembered, one a frame
#define FLASH_TICKS 12        // a hit's flash, in frames: four steps of three
#define SQUASH_TICKS 8

s16 paddle_x;
s32 ball_x, ball_y, ball_vx, ball_vy;

static s16 paddle_trail[TRAIL];
static u8 trail_head;
static u8 paddle_flash;
static u8 paddle_squash;
static s8 deck_look = -1;  // the palette last loaded: flash step * 8 + glow
static const u8 SQUASH[SQUASH_TICKS] = {0, 16, 40, 64, 64, 48, 24, 8};

void setup_deck(void) {
  for (u8 g = 0; g < PADDLE_GHOSTS; g++) {
    u16 first = SPR_PADDLE_GHOST + g * 3;
    setup_block(first, TILE_PADDLE, 3, 1, PAL_PADDLE_GHOST + g);
    sprite_hide(first);
  }
  setup_block(SPR_PADDLE, TILE_PADDLE, 3, 1, PAL_PADDLE);
  sprite_tiles(SPR_BALL, TILE_BALL, 0, 1, PAL_BALL);
}

// One aim of the fan, at the current loop's speed, heading up and to `dir`.
static void aim(u8 index, s8 dir) {
  u8 speed = loop < SPEEDS ? loop : SPEEDS - 1;
  ball_vx = dir * VELOCITY[speed][index][0];
  ball_vy = -VELOCITY[speed][index][1];
}

void serve(void) {
  state = STATE_SERVE;
  aim(1, 1);
}

void reset_deck(void) {
  paddle_x = (FIELD_L + FIELD_R - PADDLE_W) / 2;
  for (u8 i = 0; i < TRAIL; i++) {
    paddle_trail[i] = paddle_x;
  }
}

void move_paddle(void) {
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

void hold_ball(void) {
  ball_x = FP(paddle_x + PADDLE_W / 2 - BALL / 2);
  ball_y = FP(PADDLE_Y - BALL);
}

// The further from the deck's centre, the flatter the bounce; dead centre keeps
// the ball's own side.
static void bounce_off_paddle(void) {
  s16 offset = (PX(ball_x) + BALL / 2) - (paddle_x + PADDLE_W / 2);
  s8 dir = offset > 0 ? 1 : (offset < 0 ? -1 : (ball_vx < 0 ? -1 : 1));
  s16 reach = offset < 0 ? -offset : offset;
  s16 index = reach * FAN / (PADDLE_W / 2 + BALL / 2 + 1);
  aim(index < FAN ? index : FAN - 1, dir);
  paddle_flash = FLASH_TICKS;
  paddle_squash = SQUASH_TICKS;
}

void step_ball(void) {
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

void render_deck(void) {
  // The palette: the hit's flash step and the caps' breath, loaded only when
  // either moves on.
  u8 step = (paddle_flash + 2) / 3;
  s8 look = (step > 3 ? 3 : step) * 8 + ((frame >> 3) & 7);
  if (look != deck_look) {
    deck_look = look;
    load_palette(PAL_PADDLE, PADDLE_PAL[look >> 3][look & 7]);
  }
  if (paddle_flash) {
    paddle_flash--;
  }

  // The squash: the shrink keeps (v + 1) of every 256 lines, the bottom held.
  u16 lines = 256 - (paddle_squash ? SQUASH[SQUASH_TICKS - paddle_squash] : 0);
  if (paddle_squash) {
    paddle_squash--;
  }
  s16 top = PADDLE_Y + PADDLE_H - PADDLE_H * lines / 256;
  place_block(SPR_PADDLE, 3, paddle_x + shake_x, top + shake_y, 1, 0x0f00 | (lines - 1));

  // The trail reads the history from before this frame was recorded.
  trail_head = (trail_head + 1) % TRAIL;
  paddle_trail[trail_head] = paddle_x;

  for (u8 g = 0; g < PADDLE_GHOSTS; g++) {
    u8 back = (trail_head + TRAIL - 2 * (g + 1)) % TRAIL;
    s16 dx = paddle_trail[back] - paddle_x;
    u16 first = SPR_PADDLE_GHOST + g * 3;
    // Only a deck that is going somewhere leaves anything behind it.
    if (dx > -3 && dx < 3) {
      sprite_hide(first);
    } else {
      sprite_place(first, paddle_trail[back] + shake_x, PADDLE_Y + shake_y, 1);
    }
  }

  if (state == STATE_OVER || state == STATE_CLEAR) {
    sprite_hide(SPR_BALL);
  } else {
    sprite_place(SPR_BALL, PX(ball_x) + shake_x, PX(ball_y) + shake_y, 1);
  }
}
