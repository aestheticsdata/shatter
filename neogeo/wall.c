// The wall (SHA-270): every brick a pair of sprites, so it wears the web
// game's HD brick in fifteen tones instead of a three-tone fix tile.
//
// A brick is 24x10 — a 16 px sprite and an 8 px half of a second, stuck to it.
// Damage swaps its palette and, where the face itself changes (cracks, pits,
// the mark wearing off), its tiles. A hit flashes it white and lets go; a kill
// flashes it brighter, then it bursts into tumbling chips of its own tones.
// Every few seconds a shine sweeps the wall on the diagonal, brick by brick,
// in each brick's own lit palette.
//
// A kill plays a burst on the brick's own two sprites — so it costs no sprite
// on any scanline — and throws the web game's debris: six chips, ten off a
// tough brick. Tough bricks and the last brick of the wall shake the field;
// the web keeps its shakes for the hits that matter, and so does this.

#include "game.h"

#define BRICK_FLASH_TICKS 6
#define BURST_TICKS (BURST_FRAMES * BURST_HOLD)
#define CHIPS 6
#define TOUGH_CHIPS 10
#define TOUGH_SHAKE_TICKS 12
#define TOUGH_SHAKE 2
#define LAST_SHAKE_TICKS 24  // QUAKE's own: the wall is gone
#define LAST_SHAKE 4
#define SHINE_EVERY 420
#define SHINE_STEP 3  // frames per diagonal

u16 remaining;
u16 wall_size;

static u8 bricks[LEVEL_ROWS][LEVEL_COLS];    // the kind, 0 for none
static u8 hits_left[LEVEL_ROWS][LEVEL_COLS];
static u8 stage_of[LEVEL_ROWS][LEVEL_COLS];  // hits taken
static u8 flash[LEVEL_ROWS][LEVEL_COLS];     // ticks of white left
static u8 dying[LEVEL_ROWS][LEVEL_COLS];     // ticks of burst left
static u8 dead_kind[LEVEL_ROWS][LEVEL_COLS]; // whose colours the burst is in
static s8 placed_x, placed_y;                // the shake the wall stands at
static s16 shine = -1;                       // the diagonal lit, -1 for none
static u16 shine_clock = SHINE_EVERY;

typedef struct {
  s32 x, y, vx, vy;
  u8 life;
  u8 kind;
  u8 spin;
} shard_t;

static shard_t shards[SHARDS];

static u16 brick_sprite(u8 r, u8 c) {
  return SPR_BRICKS + (r * LEVEL_COLS + c) * 2;
}

static u8 brick_palette(u8 kind, u8 stage) {
  return PAL_BRICKS + (kind - 1) * BRICK_PAL_STRIDE + stage;
}

static void paint_brick(u8 r, u8 c, u8 palette) {
  u16 sprite = brick_sprite(r, c);
  sprite_palette(sprite, palette);
  sprite_palette(sprite + 1, palette);
}

// Where a brick stands, shaken; a burst is centred on its cell.
static void place_brick(u8 r, u8 c) {
  s16 x = GRID_X + c * CELL_W + shake_x;
  s16 y = GRID_Y + r * CELL_H + shake_y;
  if (dying[r][c]) {
    x += CELL_W / 2 - 16;
    y += CELL_H / 2 - 8;
  }
  sprite_place(brick_sprite(r, c), x, y, 1);
}

static void dress_burst(u8 r, u8 c, u8 frame) {
  u16 sprite = brick_sprite(r, c);
  u16 tile = TILE_BURST + frame * 2;
  u8 palette = brick_palette(dead_kind[r][c], 0) + (frame < BURST_FLASH_FRAMES ? BRICK_FLASH : 0);
  sprite_tile(sprite, 0, tile, palette);
  sprite_tile(sprite + 1, 0, tile + 1, palette);
}

static void dress_brick(u8 r, u8 c) {
  u8 kind = bricks[r][c];
  u16 sprite = brick_sprite(r, c);
  u16 tile = BRICK_TILE[kind - 1][stage_of[r][c]];
  u8 palette = brick_palette(kind, stage_of[r][c]);
  sprite_tile(sprite, 0, tile, palette);
  sprite_tile(sprite + 1, 0, tile + 1, palette);
}

void setup_wall(void) {
  for (u8 r = 0; r < LEVEL_ROWS; r++) {
    for (u8 c = 0; c < LEVEL_COLS; c++) {
      u16 sprite = brick_sprite(r, c);
      sprite_hide(sprite);
      sprite_stick(sprite + 1, 1);
    }
  }
  for (u8 i = 0; i < SHARDS; i++) {
    sprite_hide(SPR_SHARD + i);
  }
}

void build_wall(void) {
  remaining = 0;
  shine = -1;
  for (u8 r = 0; r < LEVEL_ROWS; r++) {
    for (u8 c = 0; c < LEVEL_COLS; c++) {
      u8 kind = LEVEL_GRID[r][c];
      bricks[r][c] = kind;
      flash[r][c] = 0;
      dying[r][c] = 0;
      stage_of[r][c] = 0;
      u16 sprite = brick_sprite(r, c);
      if (!kind) {
        sprite_hide(sprite);
        continue;
      }
      hits_left[r][c] = KIND_HITS[kind - 1];
      remaining++;
      dress_brick(r, c);
      place_brick(r, c);
    }
  }
  wall_size = remaining;
}

// The web's brickDeathBurst: chips flung every way at 0.6 to 1.6 px a frame
// from across the cell, falling at 0.12. A little longer-lived than its 15
// ticks, because a Neo-Geo chip is three pixels and the web's is two.
static void spawn_shards(u8 r, u8 c, u8 kind, u8 count) {
  s16 cx = GRID_X + c * CELL_W + CELL_W / 2;
  s16 cy = GRID_Y + r * CELL_H + CELL_H / 2;
  u8 spawned = 0;
  for (u8 i = 0; i < SHARDS && spawned < count; i++) {
    shard_t *s = &shards[i];
    if (s->life) {
      continue;
    }
    u8 heading = rnd() % CHIP_HEADINGS;
    s16 speed = 154 + rnd() % 256;  // 0.6..1.6 px, 8.8
    s->x = FP(cx - 10 + (rnd() % 20));
    s->y = FP(cy - 3 + (rnd() % 6));
    s->vx = (s32)CHIP_HEADING[heading][0] * speed / 128;
    s->vy = (s32)CHIP_HEADING[heading][1] * speed / 128;
    s->life = 18 + rnd() % 10;
    s->kind = kind;
    s->spin = rnd() & 3;
    sprite_tile(SPR_SHARD + i, 0, TILE_SHARD + s->spin, brick_palette(kind, 0));
    spawned++;
  }
}

// The first live brick under any corner of the ball, damaged; 1 if it was hit.
u8 strike_bricks(s16 x, s16 y) {
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
        // Gone from the field at once — the ball never bounces off a brick
        // that is only still on screen — and bursts a few frames later.
        bricks[r][c] = 0;
        dead_kind[r][c] = kind;
        dying[r][c] = BURST_TICKS;
        flash[r][c] = 0;
        dress_burst(r, c, 0);
        place_brick(r, c);
        u8 tough = KIND_HITS[kind - 1] > 1;
        spawn_shards(r, c, kind, tough ? TOUGH_CHIPS : CHIPS);
        // Higher rows ring higher, as on the web; rows past the fifth share its note.
        sound(SND_BRICK0 + (r < SND_BRICK_ROWS ? r : SND_BRICK_ROWS - 1));
        score += KIND_POINTS[kind - 1];
        remaining--;
        if (remaining == 0) {
          rattle(LAST_SHAKE_TICKS, LAST_SHAKE);
        } else if (tough) {
          rattle(TOUGH_SHAKE_TICKS, TOUGH_SHAKE);
        }
        hud_score(score);
      } else {
        stage_of[r][c]++;
        dress_brick(r, c);
        flash[r][c] = BRICK_FLASH_TICKS;
        paint_brick(r, c, brick_palette(kind, 0) + BRICK_FLASH);
        sound(SND_WALL);
      }
      return 1;
    }
  }
  return 0;
}

static void step_shards(void) {
  for (u8 i = 0; i < SHARDS; i++) {
    shard_t *s = &shards[i];
    if (!s->life) {
      continue;
    }
    s->x += s->vx;
    s->y += s->vy;
    s->vy += 31;  // 0.12 px a frame, 8.8
    if (--s->life == 0 || PX(s->y) > SCREEN_H) {
      s->life = 0;
      sprite_hide(SPR_SHARD + i);
      continue;
    }
    // Tumbling: a quarter turn every four frames.
    if ((s->life & 3) == 0) {
      s->spin = (s->spin + 1) & 3;
      sprite_tile(SPR_SHARD + i, 0, TILE_SHARD + s->spin, brick_palette(s->kind, 0));
    }
    sprite_place(SPR_SHARD + i, PX(s->x) + shake_x, PX(s->y) + shake_y, 1);
  }
}

// A brick at rest, in the palette it wears between effects: its own stage,
// or the shine's while the diagonal is on it.
static void settle(u8 r, u8 c) {
  u8 kind = bricks[r][c];
  u8 stage = stage_of[r][c];
  u8 lit = shine >= 0 && r + c == shine && stage < 3;
  paint_brick(r, c, brick_palette(kind, stage) + (lit ? BRICK_SHINE : 0));
}

void step_wall(void) {
  // The shine: one diagonal at a time, top left to bottom right.
  if (shine < 0) {
    if (--shine_clock == 0) {
      shine = 0;
      shine_clock = SHINE_EVERY;
    }
  } else if (frame % SHINE_STEP == 0) {
    shine++;
    if (shine > LEVEL_ROWS + LEVEL_COLS) {
      shine = -1;
    }
  }
  // A shake moves every brick standing and every burst playing, and once
  // more when it settles.
  u8 moved = shake_x != placed_x || shake_y != placed_y;
  placed_x = shake_x;
  placed_y = shake_y;
  for (u8 r = 0; r < LEVEL_ROWS; r++) {
    for (u8 c = 0; c < LEVEL_COLS; c++) {
      if (dying[r][c]) {
        if (--dying[r][c] == 0) {
          sprite_hide(brick_sprite(r, c));
          continue;
        }
        if (dying[r][c] % BURST_HOLD == 0) {
          dress_burst(r, c, (BURST_TICKS - dying[r][c]) / BURST_HOLD);
        }
        if (moved) {
          place_brick(r, c);
        }
        continue;
      }
      if (!bricks[r][c]) {
        continue;
      }
      if (moved) {
        place_brick(r, c);
      }
      if (flash[r][c]) {
        if (--flash[r][c] == 0) {
          settle(r, c);
        }
        continue;
      }
      // Only the two diagonals the shine just left and just reached repaint.
      if (shine >= 0 && frame % SHINE_STEP == 0 && (r + c == shine || r + c == shine - 1)) {
        settle(r, c);
      }
    }
  }
  step_shards();
}
