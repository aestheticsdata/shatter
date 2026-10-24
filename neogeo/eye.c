// THE OBSERVER (SHA-267): SUNRISE's eye, THE RISE as the web game plays it.
//
// Sunk to its waist behind the dunes and a fifth lit, it climbs as the wall
// comes down, easing a little of the way each frame, and brightens as it goes;
// at nine tenths it blinks and wakes, and from then on its iris follows the
// ball. A blink is the hardware's vertical shrink on the almond and the iris
// together; the fade is palette steps, the Neo-Geo having no transparency.
//
// The iris travels the web game's whole box and is clipped to the almond as
// it is there: the clipping is drawn, one picture per offset (gen_assets.py's
// iris_variants), and the iris's tiles are swapped for the one it is at.

#include "game.h"

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
#define TRACK_X_NUM 2           // eyePupilPoint's trackX, 0.4
#define TRACK_X_DEN 5
#define TRACK_Y_NUM 11          // and trackY, 0.22
#define TRACK_Y_DEN 50

static s32 eye_frac;
static u8 eye_awake;
static u8 blink_left;
static u16 next_blink = BLINK_MIN;
static s32 look_x = FP(EYE_REST_X), look_y = FP(EYE_REST_Y);
static s8 eye_fade = -1;
static s16 eye_x, eye_y;
static u16 eye_open = 256;     // 256 wide open, 15 at the bottom of a blink
static u16 iris_picture = 0xffff;

static s16 clamp(s16 v, s16 reach) {
  return v < -reach ? -reach : (v > reach ? reach : v);
}

void step_eye(void) {
  s32 wall = wall_size ? ((s32)(wall_size - remaining) * EYE_ONE) / wall_size : EYE_ONE;
  eye_frac += ((wall - eye_frac) * EYE_EASE) >> 8;
  eye_x = EYE_REST_X;
  eye_y = EYE_REST_Y - (s16)((EYE_RISE * eye_frac) / EYE_ONE);

  // 0.2 to 1, as the web game's opacity rides the same fraction.
  s8 fade = (EYE_FADE_STEPS - 1) * (EYE_ONE / 5 + eye_frac * 4 / 5) / EYE_ONE;
  if (fade != eye_fade) {
    eye_fade = fade;
    load_palette(PAL_EYE, EYE_FADE[fade]);
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

  // Asleep it stares dead out; awake it looks at the ball.
  s16 tx = eye_x, ty = eye_y;
  if (eye_awake && state != STATE_OVER) {
    tx = PX(ball_x) + BALL / 2;
    ty = PX(ball_y) + BALL / 2;
  }
  s16 lid = EYE_HH * eye_open / 256;
  if (lid < 2) {
    lid = 2;
  }
  // eyePupilPoint: the target scaled in, bounded by the box the almond
  // leaves the iris — and the lid, as it closes.
  s16 dx = clamp((tx - eye_x) * TRACK_X_NUM / TRACK_X_DEN, IRIS_REACH_X);
  s16 reach_y = lid - IRIS_RADIUS - 1;
  s16 px = eye_x + dx;
  s16 py = eye_y + clamp((ty - eye_y) * TRACK_Y_NUM / TRACK_Y_DEN, reach_y > 0 ? reach_y : 0);
  look_x += ((FP(px) - look_x) * LOOK_EASE) >> 8;
  look_y += ((FP(py) - look_y) * LOOK_EASE) >> 8;
}

void render_eye(void) {
  u16 lines = eye_open;  // the shrink keeps (v + 1) of every 256 lines
  u16 shrink = 0x0f00 | (lines - 1);
  s16 x = eye_x + shake_x;
  s16 y = eye_y + shake_y;
  place_block(SPR_EYE, EYE_COLS, x - EYE_CX, y - EYE_CY * lines / 256, EYE_ROWS, shrink);

  // Where the iris is from the socket's centre — eased, so it can lag the
  // socket while the eye rises; bounded, so the picture drawn for that offset
  // is always the one it wears.
  s16 ox = clamp(PX(look_x) - eye_x, IRIS_REACH_X);
  s16 oy = clamp(PX(look_y) - eye_y, IRIS_REACH_Y);
  u16 picture = IRIS_AT[oy + IRIS_REACH_Y][ox + IRIS_REACH_X];
  if (picture != iris_picture) {
    iris_picture = picture;
    const u16 *tiles = IRIS_PICTURE[picture];
    for (u8 row = 0; row < IRIS_TILES; row++) {
      for (u8 col = 0; col < IRIS_TILES; col++) {
        sprite_tile(SPR_IRIS + col, row, tiles[row * IRIS_TILES + col], PAL_EYE);
      }
    }
  }
  s16 iy = y + oy * (s16)lines / 256;
  place_block(SPR_IRIS, IRIS_TILES, x + ox - IRIS_HALF, iy - IRIS_HALF * lines / 256, IRIS_TILES, shrink);
}

void setup_eye(void) {
  setup_block(SPR_EYE, TILE_EYE, EYE_COLS, EYE_ROWS, PAL_EYE);
  setup_block(SPR_IRIS, TILE_IRIS, IRIS_TILES, IRIS_TILES, PAL_EYE);
}
