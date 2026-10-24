// The deck and the balls (SHA-270, SHA-268).
//
// The deck is the web game's HD pill across four sprites, drawn at every
// width from 40 to WIDE's 62. It lives: its caps breathe (a slow palette
// pulse), a hit blows it toward white and lets go, and the impact squashes it
// two pixels on the hardware's vertical shrink, bottom held, so the top dips.
// Moving, it leaves two fading ghosts. Under WIDE it telescopes, a pixel an
// edge a frame each way, as the web's does — never a snap.
//
// The balls are the web game's own eight rows — never redrawn, never trailed.
// MULTI's new ones are born small and grow to full size over six frames on the
// hardware shrink, so they come out of the first ball rather than appearing.

#include "game.h"

#define TRAIL 8               // positions remembered, one a frame
#define FLASH_TICKS 12        // a hit's flash, in frames: four steps of three
#define SQUASH_TICKS 8
#define BIRTH_TICKS 6         // gameConfig.multiBirthTicks
#define DECK_SPRITES 4

s16 paddle_x;
s16 paddle_w = PADDLE_W;
ball_t balls[BALLS];
u8 ball_count;

static s16 paddle_trail[TRAIL];
static u8 trail_head;
static u8 paddle_flash;
static u8 paddle_squash;
static s16 paddle_target = PADDLE_W;
static s16 dressed_w;         // the width the deck's tiles show
static s8 deck_look = -1;     // the palette last loaded: flash step * 8 + glow

// JELLYFISH's sting: the deck numb, easing in over six frames and out over
// the last twelve, at worst half as quick to the stick.
static u16 numb_ticks, numb_elapsed;
// SLUG's slime: how long each pixel of the rail stays wet, and how much of the
// deck stands on it, eased. On slime the stick moves a point and the deck
// slides after it, carrying its speed.
static u16 wet[SCREEN_W];
static u16 wet_left;          // pixels of rail still wet, so a dry rail costs nothing
static s32 slip;              // 0..4096
static s32 slime_vx;          // 8.8
static s32 slide_to;          // the point the deck slides after, 8.8
static s32 sub_x;             // the deck's fraction of a pixel, 8.8, so a slow slide adds up
static const u8 SQUASH[SQUASH_TICKS] = {0, 16, 40, 64, 64, 48, 24, 8};

// The deck's four tiles at `width`, out of the rows of widths in the sheet.
static u16 deck_tile(s16 width) {
  u8 i = width - PADDLE_W;
  return TILE_PADDLE + (i / PADDLE_WIDTHS_PER_ROW) * SHEET_STRIDE + (i % PADDLE_WIDTHS_PER_ROW) * DECK_SPRITES;
}

static void dress_deck(u16 first, s16 width, u8 palette) {
  u16 tile = deck_tile(width);
  for (u8 i = 0; i < DECK_SPRITES; i++) {
    sprite_tile(first + i, 0, tile + i, palette);
  }
}

void setup_deck(void) {
  for (u8 g = 0; g < PADDLE_GHOSTS; g++) {
    u16 first = SPR_PADDLE_GHOST + g * DECK_SPRITES;
    setup_block(first, deck_tile(PADDLE_W), DECK_SPRITES, 1, PAL_PADDLE_GHOST + g);
    sprite_hide(first);
  }
  setup_block(SPR_PADDLE, deck_tile(PADDLE_W), DECK_SPRITES, 1, PAL_PADDLE);
  dressed_w = PADDLE_W;
  for (u8 i = 0; i < BALLS; i++) {
    setup_block(SPR_BALL + i, TILE_BALL, 1, 1, PAL_BALL);
    sprite_hide(SPR_BALL + i);
  }
}

// One aim of the fan, at the level's speed, heading up and to `dir`. The web
// game speeds up 0.25 a level from 3.1 to 4.6; whole-pixel steps give two
// rungs of that, and the faster one starts at its middle, the fourth level.
#define FAST_FROM_LEVEL 3
static void aim(ball_t *ball, u8 index, s8 dir) {
  u8 speed = level >= FAST_FROM_LEVEL ? SPEEDS - 1 : 0;
  ball->vx = dir * VELOCITY[speed][index][0];
  ball->vy = -VELOCITY[speed][index][1];
}

void serve(void) {
  state = STATE_SERVE;
  ball_count = 1;
  balls[0].birth = 0;
  aim(&balls[0], 1, 1);
}

void reset_deck(void) {
  numb_ticks = 0;
  slip = 0;
  slime_vx = 0;
  wet_left = 0;
  for (u16 i = 0; i < SCREEN_W; i++) {
    wet[i] = 0;
  }
  paddle_w = paddle_target = PADDLE_W;
  paddle_x = (FIELD_L + FIELD_R - PADDLE_W) / 2;
  for (u8 i = 0; i < TRAIL; i++) {
    paddle_trail[i] = paddle_x;
  }
}

void sting_deck(u16 ticks) {
  if (state == STATE_SERVE) {
    return;
  }
  if (!numb_ticks) {
    numb_elapsed = 0;
  }
  if (ticks > numb_ticks) {
    numb_ticks = ticks;
  }
}

void slime_rail(s16 x, s16 w, u16 ticks) {
  for (s16 i = x < 0 ? 0 : x; i < x + w && i < SCREEN_W; i++) {
    if (!wet[i]) {
      wet_left++;
    }
    if (ticks > wet[i]) {
      wet[i] = ticks;
    }
  }
}

// Moves the deck by a fraction of a pixel too, carried to the next frame.
static void shift_deck(s32 by) {
  sub_x += by;
  s16 whole = PX(sub_x);
  paddle_x += whole;
  sub_x -= FP(whole);
}

// What share of the stick reaches the deck, out of 4096: all of it free,
// numbSlow less at the height of a sting.
static s32 numb_factor(void) {
  if (!numb_ticks) {
    return 4096;
  }
  s32 blend = 4096;
  s32 in = (s32)(numb_elapsed + 1) * 4096 / 6;
  s32 out = (s32)numb_ticks * 4096 / 12;
  blend = in < blend ? in : blend;
  blend = out < blend ? out : blend;
  return 4096 - (CFG_JELLYFISH_NUMB_SLOW * blend >> 12);
}

static void dry_rail(void) {
  if (!wet_left) {
    return;
  }
  for (u16 i = 0; i < SCREEN_W; i++) {
    if (wet[i] && --wet[i] == 0) {
      wet_left--;
    }
  }
}

void widen_deck(u8 wide) {
  paddle_target = wide ? PADDLE_WIDE_W : PADDLE_W;
}

void move_paddle(void) {
  if (numb_ticks) {
    numb_ticks--;
    numb_elapsed++;
  }
  dry_rail();
  // The telescope: a pixel off each edge a frame, the centre held.
  if (paddle_w < paddle_target) {
    paddle_w += 2;
    paddle_x -= 1;
  } else if (paddle_w > paddle_target) {
    paddle_w -= 2;
    paddle_x += 1;
  }
  s32 delta = 0;
  if (pad_now & CNT_LEFT) {
    delta -= FP(PADDLE_SPEED);
  }
  if (pad_now & CNT_RIGHT) {
    delta += FP(PADDLE_SPEED);
  }
  delta = delta * numb_factor() >> 12;

  // How much of the deck is on wet rail, eased by slipRamp.
  s32 under = 0;
  if (wet_left) {
    for (s16 i = paddle_x; i < paddle_x + paddle_w; i++) {
      under += wet[i] ? 1 : 0;
    }
    under = under * 4096 / paddle_w;
  }
  slip += (under - slip) * CFG_SLUG_SLIP_RAMP >> 12;
  s32 centre = FP(paddle_x + paddle_w / 2);
  if (slip > 4096 / 100) {
    slide_to += delta;
    if (slide_to < FP(FIELD_L)) {
      slide_to = FP(FIELD_L);
    } else if (slide_to > FP(FIELD_R)) {
      slide_to = FP(FIELD_R);
    }
    s32 carry = CFG_SLUG_SLIME_CARRY * slip >> 12;
    s32 pull = 4096 + ((CFG_SLUG_SLIME_PULL - 4096) * slip >> 12);
    slime_vx = (slime_vx * carry >> 12) + (((slide_to - centre) * pull >> 12) * numb_factor() >> 12);
    shift_deck(slime_vx);
  } else {
    slide_to = centre + delta;
    slime_vx = 0;
    shift_deck(delta);
  }
  if (paddle_x < FIELD_L) {
    paddle_x = FIELD_L;
  }
  if (paddle_x > FIELD_R - paddle_w) {
    paddle_x = FIELD_R - paddle_w;
  }
}

void hold_ball(void) {
  balls[0].x = FP(paddle_x + paddle_w / 2 - BALL / 2);
  balls[0].y = FP(PADDLE_Y - BALL);
}

// MULTI: the field topped up to `count`, the new balls fanned out of the
// first, up and either side of it, alternating.
void add_balls(u8 count) {
  ball_t *first = &balls[0];
  for (u8 i = ball_count; i < count && i < BALLS; i++) {
    ball_t *ball = &balls[i];
    ball->x = first->x;
    ball->y = first->y;
    ball->birth = BIRTH_TICKS;
    aim(ball, (i - 1) % FAN, (i & 1) ? -1 : 1);
    ball_count = i + 1;
  }
}

// The further from the deck's centre, the flatter the bounce; dead centre keeps
// the ball's own side.
static void bounce_off_paddle(ball_t *ball) {
  s16 offset = (PX(ball->x) + BALL / 2) - (paddle_x + paddle_w / 2);
  s8 dir = offset > 0 ? 1 : (offset < 0 ? -1 : (ball->vx < 0 ? -1 : 1));
  s16 reach = offset < 0 ? -offset : offset;
  s16 index = reach * FAN / (paddle_w / 2 + BALL / 2 + 1);
  aim(ball, index < FAN ? index : FAN - 1, dir);
  paddle_flash = FLASH_TICKS;
  paddle_squash = SQUASH_TICKS;
}

static void step_ball(ball_t *ball) {
  s32 old_x = ball->x;
  ball->x += ball->vx;
  if (PX(ball->x) < FIELD_L) {
    ball->x = FP(FIELD_L);
    ball->vx = -ball->vx;
    sound(SND_WALL);
  } else if (PX(ball->x) + BALL > FIELD_R) {
    ball->x = FP(FIELD_R - BALL);
    ball->vx = -ball->vx;
    sound(SND_WALL);
  } else if (strike_bricks(PX(ball->x), PX(ball->y))) {
    ball->x = old_x;
    ball->vx = -ball->vx;
  }

  s32 old_y = ball->y;
  s16 old_bottom = PX(ball->y) + BALL;
  ball->y += ball->vy;
  s16 bottom = PX(ball->y) + BALL;
  if (PX(ball->y) < FIELD_T) {
    ball->y = FP(FIELD_T);
    ball->vy = -ball->vy;
    sound(SND_WALL);
  } else if (strike_bricks(PX(ball->x), PX(ball->y))) {
    ball->y = old_y;
    ball->vy = -ball->vy;
  } else if (ball->vy > 0 && old_bottom <= PADDLE_Y && bottom >= PADDLE_Y && PX(ball->x) + BALL > paddle_x &&
             PX(ball->x) < paddle_x + paddle_w) {
    ball->y = FP(PADDLE_Y - BALL);
    bounce_off_paddle(ball);
    sound(SND_PADDLE);
  }
  strike_creatures(ball);
}

// Every ball a half-step; one that has fallen past the screen is gone, and
// the rest close up behind it so balls[0] is always one in play.
void step_balls(void) {
  for (u8 i = 0; i < ball_count;) {
    step_ball(&balls[i]);
    if (PX(balls[i].y) > SCREEN_H) {
      balls[i] = balls[--ball_count];
      continue;
    }
    i++;
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

  if (paddle_w != dressed_w) {
    dressed_w = paddle_w;
    dress_deck(SPR_PADDLE, paddle_w, PAL_PADDLE);
    for (u8 g = 0; g < PADDLE_GHOSTS; g++) {
      dress_deck(SPR_PADDLE_GHOST + g * DECK_SPRITES, paddle_w, PAL_PADDLE_GHOST + g);
    }
  }

  // The squash: the shrink keeps (v + 1) of every 256 lines, the bottom held.
  u16 lines = 256 - (paddle_squash ? SQUASH[SQUASH_TICKS - paddle_squash] : 0);
  if (paddle_squash) {
    paddle_squash--;
  }
  s16 top = PADDLE_Y + PADDLE_H - PADDLE_H * lines / 256;
  place_block(SPR_PADDLE, DECK_SPRITES, paddle_x + shake_x, top + shake_y, 1, 0x0f00 | (lines - 1));

  // The trail reads the history from before this frame was recorded.
  trail_head = (trail_head + 1) % TRAIL;
  paddle_trail[trail_head] = paddle_x;

  for (u8 g = 0; g < PADDLE_GHOSTS; g++) {
    u8 back = (trail_head + TRAIL - 2 * (g + 1)) % TRAIL;
    s16 dx = paddle_trail[back] - paddle_x;
    u16 first = SPR_PADDLE_GHOST + g * DECK_SPRITES;
    // Only a deck that is going somewhere leaves anything behind it.
    if (dx > -3 && dx < 3) {
      sprite_hide(first);
    } else {
      sprite_place(first, paddle_trail[back] + shake_x, PADDLE_Y + shake_y, 1);
    }
  }

  for (u8 i = 0; i < BALLS; i++) {
    ball_t *ball = &balls[i];
    if (i >= ball_count || state == STATE_OVER || state == STATE_CLEAR) {
      sprite_hide(SPR_BALL + i);
      continue;
    }
    // A newborn ball, BALL px across at full size and less while it grows:
    // the shrink keeps 2 * size of the tile's 16 columns and 32 * size of its
    // 256 lines, so the ball stays round, centred on where it is.
    u8 size = ball->birth ? BALL - (BALL / 2) * ball->birth / BIRTH_TICKS : BALL;
    if (ball->birth) {
      ball->birth--;
    }
    s16 inset = (BALL - size) / 2;
    u16 shrink = ((2 * size - 1) << 8) | (32 * size - 1);
    place_block(SPR_BALL + i, 1, PX(ball->x) + inset + shake_x, PX(ball->y) + inset + shake_y, 1, shrink);
  }
}
