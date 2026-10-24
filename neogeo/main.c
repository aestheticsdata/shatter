// SHATTER for the Neo-Geo: the run — the frame, the HUD, the states, the loop.
//
// The pieces live beside it: video.c (the hardware's drawing verbs), wall.c
// (the bricks), deck.c (paddle and ball), eye.c (the Observer), sound.c, and
// everything the art decides in build/gfx.h from tools/gen_assets.py.

#include "game.h"

// Serve and restart: up, or any of the four buttons.
#define LAUNCH (CNT_UP | CNT_A | CNT_B | CNT_C | CNT_D)

u8 state;
u8 level;
u32 score;
u8 score_dirty;
u16 frame;
u8 pad_now;

static u8 pad_prev;
static u8 lives;
static u16 timer;
volatile u8 vblank;

// --- the shake ---------------------------------------------------------------------
// The web game's Quake: a fresh whole-pixel offset each frame, its reach
// running down to nothing over the shake, and a weaker shake never cutting
// a stronger one short. The wall, the deck, the ball, the debris and the eye
// take it; the sky and the frame stay put, so it reads as the wall rattling
// and not the camera drifting.
s8 shake_x, shake_y;
static u8 shake_left, shake_len, shake_reach;

void rattle(u8 ticks, u8 amplitude) {
  u8 reach_left = shake_len ? shake_reach * shake_left / shake_len : 0;
  if (amplitude <= reach_left) {
    return;
  }
  shake_left = shake_len = ticks;
  shake_reach = amplitude;
}

static void step_shake(void) {
  if (!shake_left) {
    shake_x = shake_y = 0;
    return;
  }
  shake_left--;
  u8 reach = (shake_reach * shake_left + shake_len / 2) / shake_len;
  shake_x = (s8)(rnd() % (2 * reach + 1)) - reach;
  shake_y = (s8)(rnd() % (2 * reach + 1)) - reach;
}

void rom_callback_VBlank(void) {
  vblank = 1;
}

// --- the frame and the HUD -------------------------------------------------------

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
  // The web game's rivets: one near each end of a rail and one at its middle,
  // about ten pixels clear of the field's corners. The top one at the middle
  // straddles two tiles.
  const u8 side_rows[3] = {6, 17, 28};
  for (u8 i = 0; i < 3; i++) {
    fix_put(1, side_rows[i], (PAL_WALL << 12) | (i < 2 ? FIX_RIVET_L2 : FIX_RIVET_L4));
    fix_put(38, side_rows[i], (PAL_WALL << 12) | (i < 2 ? FIX_RIVET_R2 : FIX_RIVET_R4));
  }
  fix_put(3, top, (PAL_WALL << 12) | FIX_RIVET_T2);
  fix_put(19, top, (PAL_WALL << 12) | FIX_RIVET_T6);
  fix_put(20, top, (PAL_WALL << 12) | FIX_RIVET_TM2);
  fix_put(36, top, (PAL_WALL << 12) | FIX_RIVET_T3);
}

static void number(char *out, u32 value, u8 digits) {
  for (s8 i = digits - 1; i >= 0; i--) {
    out[i] = '0' + value % 10;
    value /= 10;
  }
  out[digits] = 0;
}

// The web panel's three readouts across the top: a label, its value under it.
void draw_hud(void) {
  hud_text((cell_t){HUD_SCORE_COL, HUD_LABEL_ROW}, PAL_HUD_LABEL, "SCORE");
  hud_center(HUD_LABEL_ROW, PAL_HUD_LABEL, "LEVEL");
  // The value row whole, since the last level's name may have been longer.
  hud_clear(HUD_VALUE_ROW, 1);
  hud_score(score);
  hud_center(HUD_VALUE_ROW, PAL_HUD_LEVEL, LEVEL_NAMES[level]);
  hud_text((cell_t){HUD_LIVES_RIGHT - 5, HUD_LABEL_ROW}, PAL_HUD_LABEL, "LIVES");
  hud_lives(lives ? lives - 1 : 0);
}

// --- the cards ---------------------------------------------------------------------
// Fix rows in the field, below the wall's rows: the card's heading, its rule, its
// line, and the prompt that blinks under it.
#define CARD_ROW 14
#define CARD_ROWS 9
#define SERVE_HINT_ROW 23
#define BLINK 32  // frames on, frames off

static void show_over(void) {
  char text[16] = "SCORE ";
  number(text + 6, score, HUD_SCORE_DIGITS);
  hud_big_center(CARD_ROW + 1, PAL_HUD_OVER, "GAME OVER");
  hud_rule(CARD_ROW + 4, PAL_HUD_OVER, 24);
  hud_center(CARD_ROW + 6, PAL_HUD_WHITE, text);
}

// The web's clear bonus: 500 for each level up to this one.
#define CLEAR_BONUS_PER_LEVEL 500

static void show_clear(u32 bonus) {
  char text[16] = "BONUS ";
  number(text + 6, bonus, 5);
  hud_center(CARD_ROW, PAL_HUD_HEAD, "GRID CLEARED");
  hud_big_center(CARD_ROW + 2, PAL_HUD_CLEAR, LEVEL_NAMES[level]);
  hud_rule(CARD_ROW + 5, PAL_HUD_RULE, 24);
  hud_center(CARD_ROW + 7, PAL_HUD_SCORE, text);
}

// A prompt on, then off, every BLINK frames, as the web game's `.blink`.
static void blink(u8 row, const char *text) {
  if (frame % BLINK == 0) {
    if (frame & BLINK) {
      hud_clear(row, 1);
    } else {
      hud_center(row, PAL_HUD_HINT, text);
    }
  }
}

// --- the run -----------------------------------------------------------------------

static void reset_game(void) {
  score = 0;
  lives = 3;
  level = START_LEVEL;
  reset_deck();
  reset_capsules();
  hud_clear(CARD_ROW, CARD_ROWS);
  build_wall();
  reset_eye();
  draw_hud();
  serve();
  sound(SND_THEME);
}

static void step(void) {
  u8 pressed = pad_now & ~pad_prev;
  switch (state) {
    case STATE_SERVE:
      move_paddle();
      hold_ball();
      blink(SERVE_HINT_ROW, "PRESS UP TO LAUNCH");
      if (pressed & LAUNCH) {
        state = STATE_PLAY;
        hud_clear(SERVE_HINT_ROW, 1);
        sound(SND_LAUNCH);
      }
      break;
    case STATE_PLAY:
      move_paddle();
      step_balls();
      step_balls();
      // A life goes with the last ball in play, and what it was holding with it.
      if (ball_count == 0) {
        lives--;
        reset_capsules();
        draw_hud();
        if (lives == 0) {
          state = STATE_OVER;
          sound(SND_GAMEOVER);
          sound(SND_OVER);
          show_over();
        } else {
          sound(SND_LOST);
          serve();
        }
      } else if (remaining == 0) {
        state = STATE_CLEAR;
        timer = 120;
        sound(SND_CLEAR);
        u32 bonus = (u32)(level + 1) * CLEAR_BONUS_PER_LEVEL;
        score += bonus;
        score_dirty = 1;
        show_clear(bonus);
      }
      break;
    case STATE_CLEAR:
      if (--timer == 0) {
        hud_clear(CARD_ROW, CARD_ROWS);
        level = (level + 1) % LEVELS;
        reset_capsules();
        build_wall();
        reset_eye();
        draw_hud();
        serve();
      }
      break;
    case STATE_OVER:
      blink(CARD_ROW + 8, "PRESS UP TO CONTINUE");
      if (pressed & LAUNCH) {
        reset_game();
      }
      break;
  }
  step_wall();
  step_capsules();
  step_eye();
}

#ifdef AUTOPLAY
// `-DAUTOPLAY`: the deck chases the ball, a few pixels off centre so the angles
// vary, and serves on its own — a rally to watch without a joystick.
static u8 autopilot(void) {
  if (state == STATE_SERVE || state == STATE_OVER) {
    return (frame & 32) ? CNT_A : 0;
  }
  // The ball most worth saving: the lowest one coming down.
  ball_t *mark = &balls[0];
  for (u8 i = 1; i < ball_count; i++) {
    if (balls[i].vy > 0 && (mark->vy < 0 || balls[i].y > mark->y)) {
      mark = &balls[i];
    }
  }
  s16 aim = PX(mark->x) + BALL / 2 - paddle_w / 2 + ((frame >> 7) % 5) * 6 - 12;
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
  setup_band(SPR_BG, TILE_BG, BG_ROWS, PAL_BG0, 0);
  setup_sky();
  setup_eye();
  setup_band(SPR_FG, TILE_FG, FG_ROWS, PAL_FG0, FG_TOP);
  setup_wall();
  setup_deck();
  setup_capsules();
  draw_frame();
  reset_game();
#ifdef PERF
  u16 late = 0;
#endif
  for (;;) {
    while (!vblank) {
    }
    vblank = 0;
    frame++;
    // First, while the beam is still in vblank: the sky's tiles and palettes.
    step_sky();
    pad_prev = pad_now;
    pad_now = bios_p1current;
#ifdef AUTOPLAY
    pad_now = autopilot();
#endif
    step_shake();
    step();
    if (score_dirty) {
      score_dirty = 0;
      hud_score(score);
    }
    render_eye();
    render_deck();
    flush_sound();
#ifdef PERF
    // `-DPERF`: a frame whose work ran past the next vblank is a frame the
    // player saw twice. The count sits on the HUD's top row, between SCORE
    // and LEVEL, where nothing flies over it.
    if (vblank) {
      char text[6];
      number(text, ++late, 5);
      ng_text(9, 2, PAL_TEXT, text);
    }
#endif
  }
  return 0;
}
