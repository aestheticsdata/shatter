// THE OBSERVER (SHA-267, SHA-269): each level's eye, where levels.ts puts it.
//
// SUNRISE's eye is THE RISE as the web game plays it: sunk to its waist
// behind the dunes and a fifth lit, it climbs as the wall comes down, easing a
// little of the way each frame, and brightens as it goes; at its wake mark it
// blinks and wakes, and from then on its iris follows the ball. A static eye
// is awake from the start. Acts this port does not play yet stand and watch.
//
// One almond is drawn, SUNRISE's, the biggest; every other eye is that one on
// the hardware shrink, sideways in sixteenths and down in 256ths. A blink is
// the same vertical shrink taken further; the fade is palette steps, the
// Neo-Geo having no transparency.
//
// The iris travels the web game's whole box and is clipped to the almond as
// it is there: the clipping is drawn, one picture per offset (gen_assets.py's
// iris_variants), and the iris's tiles are swapped for the one it is at. The
// look is worked out in SUNRISE's units, so the pictures fit, and scaled.

#include "game.h"

#define EYE_ONE 4096           // the rise's fixed point
#define EYE_EASE 20            // 0.08 of the way a frame, out of 256
#define LOOK_EASE 90           // 0.35
#define BLINK_TICKS 14
#define BLINK_MIN 180
#define BLINK_RAND 260
#define TRACK_X_NUM 2           // eyePupilPoint's trackX, 0.4
#define TRACK_X_DEN 5
#define TRACK_Y_NUM 11          // and trackY, 0.22
#define TRACK_Y_DEN 50

static const eye_spec_t *spec;
static s32 eye_frac;
static u8 eye_awake;
static u8 blink_left;
static u16 next_blink = BLINK_MIN;
static s32 look_x, look_y;     // the iris's offset from the socket, SUNRISE units, 8.8
static s8 eye_fade = -1;
static s16 eye_x, eye_y;
static u16 eye_open = 256;     // 256 wide open, 15 at the bottom of a blink
static u16 iris_picture = 0xffff;

static s16 clamp(s16 v, s16 reach) {
  return v < -reach ? -reach : (v > reach ? reach : v);
}

void setup_eye(void) {
  setup_block(SPR_EYE, TILE_EYE, EYE_COLS, EYE_ROWS, PAL_EYE);
  setup_block(SPR_IRIS, TILE_IRIS, IRIS_TILES, IRIS_TILES, PAL_EYE);
}

// A new wall: the level's eye, back at its start.
void reset_eye(void) {
  spec = &LEVEL_EYE[level];
  eye_frac = 0;
  eye_awake = 0;
  blink_left = 0;
  eye_open = 256;
  look_x = look_y = 0;
  eye_fade = -1;
  iris_picture = 0xffff;
  eye_x = spec->x;
  eye_y = spec->y;
  if (spec->kind == EYE_NONE) {
    sprite_hide(SPR_EYE);
    sprite_hide(SPR_IRIS);
  }
}

void step_eye(void) {
  if (spec->kind == EYE_NONE) {
    return;
  }
  s32 wall = wall_size ? ((s32)(wall_size - remaining) * EYE_ONE) / wall_size : EYE_ONE;
  eye_frac += ((wall - eye_frac) * EYE_EASE) >> 8;
  eye_x = spec->x;
  eye_y = spec->y + (s16)(((s32)(spec->rise_y - spec->y) * eye_frac) / EYE_ONE);

  // The light rides the same fraction, from where the level lights it.
  s8 fade = spec->fade + (s8)(((s32)(spec->fade_to - spec->fade) * eye_frac) / EYE_ONE);
  if (fade != eye_fade) {
    eye_fade = fade;
    load_palette(PAL_EYE, EYE_FADE[fade]);
  }

  u8 awake = spec->kind == EYE_STATIC || eye_frac >= (s32)spec->wake * EYE_ONE / 255;
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

  // Asleep it stares dead out; awake it looks at the ball. The target is
  // taken into SUNRISE's units, where the reach and the pictures are.
  s16 dx = 0, dy = 0;
  if (eye_awake && state != STATE_OVER) {
    dx = (PX(balls[0].x) + BALL / 2 - eye_x) * 16 / (spec->shrink_h + 1);
    dy = (PX(balls[0].y) + BALL / 2 - eye_y) * 256 / spec->lines;
  }
  s16 lid = EYE_HH * eye_open / 256;
  if (lid < 2) {
    lid = 2;
  }
  // eyePupilPoint: the target scaled in, bounded by the box the almond
  // leaves the iris — and the lid, as it closes.
  s16 px = clamp(dx * TRACK_X_NUM / TRACK_X_DEN, IRIS_REACH_X);
  s16 reach_y = lid - IRIS_RADIUS - 1;
  s16 py = clamp(dy * TRACK_Y_NUM / TRACK_Y_DEN, reach_y > 0 ? reach_y : 0);
  look_x += ((FP(px) - look_x) * LOOK_EASE) >> 8;
  look_y += ((FP(py) - look_y) * LOOK_EASE) >> 8;
}

void render_eye(void) {
  if (spec->kind == EYE_NONE) {
    return;
  }
  u8 wide = spec->shrink_h + 1;                 // sixteenths across
  u16 lines = spec->lines * eye_open / 256;     // 256ths down, the blink in it
  if (lines < 1) {
    lines = 1;
  }
  u16 shrink = ((wide - 1) << 8) | (lines - 1);
  s16 x = eye_x + shake_x;
  s16 y = eye_y + shake_y;
  place_block(SPR_EYE, EYE_COLS, x - EYE_CX * wide / 16, y - EYE_CY * (s16)lines / 256, EYE_ROWS, shrink);

  // Where the iris is from the socket's centre, bounded, so the picture drawn
  // for that offset is always the one it wears.
  s16 ox = clamp(PX(look_x), IRIS_REACH_X);
  s16 oy = clamp(PX(look_y), IRIS_REACH_Y);
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
  s16 ix = x + (ox - IRIS_HALF) * wide / 16;
  s16 iy = y + (oy - IRIS_HALF) * (s16)lines / 256;
  place_block(SPR_IRIS, IRIS_TILES, ix, iy, IRIS_TILES, shrink);
}
