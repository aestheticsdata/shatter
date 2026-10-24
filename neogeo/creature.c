// The bestiary (SHA-269): the thirteen creatures levels.ts pins on its
// levels, each doing what src/entities/creatures/species/ says it does.
//
// Their looks are the web game's own drawCreature captured pose by pose
// (tools/dump_creatures.ts); their numbers are gameConfig.creatures', x4096 in
// build/gfx.h. Distances are scaled by 0.8, as the bricks are, and times are
// the web's ticks, a frame each. An angle is 8.8 in turns of 256.
//
// A creature is a block of up to two sprites (a vine, one sprite as tall as
// it has grown), standing in front of the wall. A spider's thread is a sprite
// of its own, stretched on the hardware shrink. A struck creature flashes as
// the web's does: outline white, then all of it, by palette.

#include "game.h"

#define CREATURES PINS
#define BLOCK 2                      // sprites a creature's block may take
#define VINE_SEGMENT 7               // a vine's segment, in pixels
#define WOODPECKER_REACH 2
#define SLUG_BELLY 4
#define SPLAT_FROM_DECK 22           // where a falling snail lands: tears.floorY, over the deck

// gameConfig's numbers into this field's units.
#define DIST(v) ((s32)(v) * 205 >> 12)        // a distance, x4096 web px, to 8.8 here
#define TICKS(v) ((u16)((v) >> 12))
#define SHARE(v) ((s32)(v) >> 4)              // a fraction, x4096, to 8.8
#define RADS(v) ((s32)(v) * 10430 >> 12)      // radians, x4096, to 8.8 turns
#define RAD(x) ((s32)((x) * 10430.38))        // a radian constant to 8.8 turns
#define QUARTER (64 * 256)
#define HALF_TURN (128 * 256)

enum { MOTH_LOOP };
enum { FROG_SIT, FROG_LEAP };
enum { SNAIL_CRAWL, SNAIL_FALL };
enum { SPIDER_HANG, SPIDER_DROP, SPIDER_CLIMB, SPIDER_REST };
enum { BAT_HANG, BAT_FLIT };
enum { BEETLE_WALK, BEETLE_ROLL, BEETLE_FLIPPED };
enum { WOODPECKER_FLY, WOODPECKER_CLING, WOODPECKER_REST };
enum { VINE_GROW, VINE_COLUMN };
enum { JELLY_SINK, JELLY_HOVER, JELLY_RISE };
enum { CRAB_WALK, CRAB_STALK };

typedef struct {
  u8 kind;       // KIND_* + 1; 0 for an empty slot
  u8 alive;
  s32 x, y;      // the box's top left, 8.8
  s32 vx, vy;    // 8.8
  s8 hp;
  u8 flash;
  s8 facing;
  u8 state;
  u16 clock;
  s32 phase;     // the species' own: an angle, a load
  s16 home_x, home_y;
  u16 look;      // picture and palette last drawn, 0xffff for none yet
} creature_t;

static creature_t creatures[CREATURES];
static ball_t *seen_ball;            // the ball the creatures watch: the lowest in play

static s32 sine(s32 turns) {
  return SINE[(turns >> 8) & 255];
}

static s32 cosine(s32 turns) {
  return SINE[((turns + QUARTER) >> 8) & 255];
}

static s32 clamp32(s32 v, s32 lo, s32 hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

static const species_t *species_of(creature_t *c) {
  return &SPECIES_INFO[c->kind - 1];
}

static s16 width_of(creature_t *c) {
  return species_of(c)->width;
}

static s16 height_of(creature_t *c) {
  if (c->kind - 1 == KIND_VINE) {
    return c->hp * VINE_SEGMENT;
  }
  return species_of(c)->height;
}

// Into the field, a pixel off each side, and off the deck's line.
static void keep_in(creature_t *c, s16 floor_gap) {
  c->x = clamp32(c->x, FP(FIELD_L + 1), FP(FIELD_R - 1 - width_of(c)));
  c->y = clamp32(c->y, FP(FIELD_T + 1), FP(PADDLE_Y - height_of(c) - floor_gap));
}

// --- the wall, as a creature reads it ------------------------------------------------

static s16 cell_left(u8 col) {
  return GRID_X + col * CELL_W;
}

static s16 cell_top(u8 row) {
  return GRID_Y + row * CELL_H;
}

static s8 column_under(creature_t *c) {
  s16 x = PX(c->x) + width_of(c) / 2 - GRID_X;
  return x < 0 ? -1 : x / CELL_W;
}

// The topmost standing row in a column, or -1 where the wall is gone.
static s8 skyline(s8 col) {
  for (s8 r = 0; r < LEVEL_WALL_ROWS[level]; r++) {
    if (wall_standing(col, r)) {
      return r;
    }
  }
  return -1;
}

// A cell with the wall's open air under it: where a bat roosts, where a
// woodpecker clings.
static u8 underside(s8 col, s8 row) {
  return wall_standing(col, row) && !wall_standing(col, row + 1);
}

static void under_cell(creature_t *c, u8 col, u8 row, s16 *x, s16 *y) {
  *x = cell_left(col) + (CELL_W - width_of(c)) / 2;
  *y = cell_top(row + 1);
}

static void cell_of_home(creature_t *c, s8 *col, s8 *row) {
  s16 x = c->home_x - GRID_X - (CELL_W - width_of(c)) / 2;
  s16 y = c->home_y - GRID_Y;
  *col = (x + CELL_W / 2) / CELL_W;
  *row = (y + CELL_H / 2) / CELL_H - 1;
}

// One of the cells `fits` accepts, at random, not `avoid_col/row` if another
// will do — or, `spread` > 0, one of the `spread` nearest to (x, y).
static u8 pick_cell(u8 (*fits)(s8, s8), s8 avoid_col, s8 avoid_row, s8 *col, s8 *row) {
  u8 count = 0, others = 0;
  for (s8 r = 0; r < LEVEL_WALL_ROWS[level]; r++) {
    for (s8 c = 0; c < LEVEL_COLS; c++) {
      if (fits(c, r)) {
        count++;
        others += (c != avoid_col || r != avoid_row);
      }
    }
  }
  if (!count) {
    return 0;
  }
  u8 skip_avoided = others > 0;
  u8 pick = rnd() % (skip_avoided ? others : count);
  for (s8 r = 0; r < LEVEL_WALL_ROWS[level]; r++) {
    for (s8 c = 0; c < LEVEL_COLS; c++) {
      if (!fits(c, r) || (skip_avoided && c == avoid_col && r == avoid_row)) {
        continue;
      }
      if (pick-- == 0) {
        *col = c;
        *row = r;
        return 1;
      }
    }
  }
  return 0;
}

static u8 nearest_cell(u8 (*fits)(s8, s8), s16 x, s16 y, u8 spread, s8 *col, s8 *row) {
  s8 best_c[4], best_r[4];
  s32 best_d[4];
  u8 found = 0;
  for (s8 r = 0; r < LEVEL_WALL_ROWS[level]; r++) {
    for (s8 c = 0; c < LEVEL_COLS; c++) {
      if (!fits(c, r)) {
        continue;
      }
      s32 dx = cell_left(c) - x, dy = cell_top(r) - y;
      s32 d = dx * dx + dy * dy;
      u8 at = found < spread ? found++ : spread;
      while (at > 0 && best_d[at - 1] > d) {
        if (at < spread) {
          best_d[at] = best_d[at - 1];
          best_c[at] = best_c[at - 1];
          best_r[at] = best_r[at - 1];
        }
        at--;
      }
      if (at < spread) {
        best_d[at] = d;
        best_c[at] = c;
        best_r[at] = r;
      }
    }
  }
  if (!found) {
    return 0;
  }
  u8 pick = rnd() % found;
  *col = best_c[pick];
  *row = best_r[pick];
  return 1;
}

static u8 standing_cell(s8 c, s8 r) {
  return wall_standing(c, r);
}

// --- the species ---------------------------------------------------------------------

static void moth(creature_t *c) {
  s16 cx = c->home_x, cy = c->home_y;
  eye_socket(&cx, &cy);
  s32 angle = c->phase + c->clock * RADS(CFG_MOTH_TURN);
  s32 wobble = c->clock * RADS(CFG_MOTH_WOBBLE_RATE);
  s32 x = FP(cx) + (cosine(angle) * DIST(CFG_MOTH_ORBIT_X) >> 8) + (sine(wobble) * DIST(CFG_MOTH_WOBBLE) >> 8);
  s32 y = FP(cy) + (sine(angle) * DIST(CFG_MOTH_ORBIT_Y) >> 8) +
          (cosine(wobble * 13 / 10) * (DIST(CFG_MOTH_WOBBLE) * 6 / 10) >> 8);
  c->facing = sine(angle) < 0 ? -1 : 1;
  c->x = x - FP(width_of(c) / 2);
  c->y = y - FP(height_of(c) / 2);
  keep_in(c, 4);
}

static void frog(creature_t *c) {
  u16 leap_ticks = TICKS(CFG_FROG_LEAP_TICKS);
  if (c->state == FROG_LEAP) {
    s32 t = c->clock >= leap_ticks ? 256 : (s32)c->clock * 256 / leap_ticks;
    c->x = FP(c->home_x) - (c->vx * (256 - t) >> 8);
    c->y = FP(c->home_y) - (c->vy * (256 - t) >> 8) - (DIST(CFG_FROG_LEAP_HEIGHT) * 4 * t / 256 * (256 - t) >> 8);
    if (t >= 256) {
      c->state = FROG_SIT;
      c->clock = 0;
    }
    return;
  }
  s8 seat_c = (c->home_x + width_of(c) / 2 - GRID_X) / CELL_W;
  s8 seat_r = (c->home_y + height_of(c) - GRID_Y) / CELL_H;
  if (wall_standing(seat_c, seat_r)) {
    if (c->clock < TICKS(CFG_FROG_REST_TICKS) || !seen_ball) {
      return;
    }
    s32 dx = PX(seen_ball->x) + BALL / 2 - (PX(c->x) + width_of(c) / 2);
    s32 dy = PX(seen_ball->y) + BALL / 2 - (PX(c->y) + height_of(c) / 2);
    s32 range = PX(DIST(CFG_FROG_RANGE));
    if (dx * dx + dy * dy > range * range) {
      return;
    }
  }
  s8 col, row;
  if (!pick_cell(standing_cell, seat_c, seat_r, &col, &row)) {
    return;
  }
  s16 to_x = cell_left(col) + (CELL_W - width_of(c)) / 2;
  s16 to_y = cell_top(row) - height_of(c);
  c->vx = FP(to_x) - c->x;
  c->vy = FP(to_y) - c->y;
  c->home_x = to_x;
  c->home_y = to_y;
  c->facing = c->vx < 0 ? -1 : 1;
  c->state = FROG_LEAP;
  c->clock = 0;
}

static void snail(creature_t *c) {
  s16 h = height_of(c);
  s16 floor = PADDLE_Y - SPLAT_FROM_DECK - h;
  s8 under = column_under(c);
  s8 row = under >= 0 && under < LEVEL_COLS ? skyline(under) : -1;
  s32 support = row < 0 ? -1 : FP(cell_top(row) - h);
  if (c->state == SNAIL_FALL || support < 0 || support > c->y + 128) {
    c->state = SNAIL_FALL;
    s32 landing = support >= 0 && support >= c->y ? support : FP(floor);
    c->y += DIST(CFG_SNAIL_CLIMB);
    if (c->y < landing) {
      return;
    }
    c->y = landing;
    if (landing == FP(floor)) {
      burst_at(PX(c->x) + width_of(c) / 2, PX(c->y) + h / 2, 2, 6);
      c->alive = 0;
      return;
    }
    c->state = SNAIL_CRAWL;
    c->phase = under;
    return;
  }
  c->y = support;
  s32 speed = DIST(CFG_SNAIL_SPEED);
  s32 front = c->facing == 1 ? c->x + FP(width_of(c)) + speed : c->x - speed;
  s16 ahead_x = PX(front) - GRID_X;
  s8 ahead = ahead_x < 0 ? -1 : ahead_x / CELL_W;
  if (ahead < 0 || ahead >= LEVEL_COLS || skyline(ahead) != row) {
    c->facing = -c->facing;
    return;
  }
  c->x += c->facing * speed;
  s8 col = column_under(c);
  if (col != c->phase) {
    c->phase = col;
    wall_mortar(col, row);
  }
}

static void spider(creature_t *c) {
  switch (c->state) {
    case SPIDER_HANG: {
      if (!seen_ball) {
        break;
      }
      s16 ball_x = PX(seen_ball->x) + BALL / 2, ball_y = PX(seen_ball->y) + BALL / 2;
      s16 centre = PX(c->x) + width_of(c) / 2;
      s16 reach = PX(DIST(CFG_SPIDER_TRIGGER_HALF_WIDTH));
      if (ball_y <= PX(c->y) + height_of(c) || ball_x - centre > reach || centre - ball_x > reach) {
        break;
      }
      s16 floor = PADDLE_Y - PX(DIST(CFG_SPIDER_DECK_CLEARANCE)) - height_of(c);
      s16 target = ball_y - height_of(c) / 2;
      target = target < floor ? target : floor;
      if (FP(target) > c->y) {
        c->phase = FP(target);
        c->state = SPIDER_DROP;
        c->clock = 0;
      }
      break;
    }
    case SPIDER_DROP:
      c->y += DIST(CFG_SPIDER_DROP_SPEED);
      if (c->y >= c->phase) {
        c->y = c->phase;
        c->state = SPIDER_CLIMB;
        c->clock = 0;
      }
      break;
    case SPIDER_CLIMB:
      c->y -= DIST(CFG_SPIDER_CLIMB_SPEED);
      if (c->y <= FP(c->home_y)) {
        c->y = FP(c->home_y);
        c->state = SPIDER_REST;
        c->clock = 0;
      }
      break;
    case SPIDER_REST:
      if (c->clock >= TICKS(CFG_SPIDER_REST_TICKS)) {
        c->state = SPIDER_HANG;
        c->clock = 0;
      }
      break;
  }
}

static void bat(creature_t *c) {
  if (c->state == BAT_HANG) {
    c->x = FP(c->home_x);
    c->y = FP(c->home_y);
    return;
  }
  // The web's wander: two sines a side, off the bat's own clock.
  s32 t = c->clock;
  s32 drift_x = (sine(t * RAD(0.11)) * 9 / 10) + (sine(t * RAD(0.037) + RAD(1.7)) * 6 / 10);
  s32 drift_y = (cosine(t * RAD(0.083)) * 8 / 10) + (sine(t * RAD(0.029) + RAD(0.6)) * 5 / 10);
  s32 flit = DIST(CFG_BAT_FLIT_SPEED);
  c->x += (c->vx * flit >> 8) + drift_x * 205 / 256;
  c->y += (c->vy * flit >> 8) + drift_y * 205 / 256;
  s32 floor = FP(PADDLE_Y - height_of(c) - 4);
  if (c->x < FP(FIELD_L + 1) || c->x > FP(FIELD_R - 1 - width_of(c))) {
    c->vx = -c->vx;
  }
  if (c->y < FP(FIELD_T + 1) || c->y > floor) {
    c->vy = -c->vy;
  }
  keep_in(c, 4);
  c->facing = c->vx < 0 ? -1 : 1;
  if (c->clock < TICKS(CFG_BAT_FLIT_TICKS)) {
    return;
  }
  s8 home_c, home_r, col, row;
  cell_of_home(c, &home_c, &home_r);
  if (!pick_cell(underside, home_c, home_r, &col, &row)) {
    c->clock = 0;
    return;
  }
  under_cell(c, col, row, &c->home_x, &c->home_y);
  c->state = BAT_HANG;
  c->clock = 0;
}

static void beetle(creature_t *c) {
  u16 flip_ticks = TICKS(CFG_BEETLE_FLIP_TICKS);
  if (c->state == BEETLE_FLIPPED) {
    s32 left = c->clock < flip_ticks ? (s32)(flip_ticks - c->clock) * 256 / flip_ticks : 0;
    c->phase += RAD(0.05) + (RAD(0.4) * left >> 8);
    if (c->clock >= flip_ticks) {
      c->state = BEETLE_WALK;
      c->clock = 0;
    }
    return;
  }
  s32 speed = DIST(c->state == BEETLE_ROLL ? CFG_BEETLE_CHARGE_SPEED : CFG_BEETLE_WALK_SPEED);
  c->x += c->facing * speed;
  if (c->x < FP(FIELD_L + 1)) {
    c->x = FP(FIELD_L + 1);
    c->facing = 1;
  } else if (c->x > FP(FIELD_R - 1 - width_of(c))) {
    c->x = FP(FIELD_R - 1 - width_of(c));
    c->facing = -1;
  }
  c->y = FP(c->home_y);
}

static void woodpecker(creature_t *c) {
  if (c->phase > 0) {
    c->phase--;
  }
  if (c->state == WOODPECKER_REST) {
    c->x = FP(c->home_x);
    c->y = FP(c->home_y - WOODPECKER_REACH);
    if (c->clock >= TICKS(CFG_WOODPECKER_REST_TICKS)) {
      c->state = WOODPECKER_FLY;
      c->clock = 0;
      c->vx = c->vy = 0;
    }
    return;
  }
  if (c->state == WOODPECKER_CLING) {
    s8 col, row;
    cell_of_home(c, &col, &row);
    if (!wall_standing(col, row)) {
      c->state = WOODPECKER_REST;
      c->clock = 0;
      return;
    }
    u16 peck = TICKS(CFG_WOODPECKER_PECK_TICKS);
    if (c->clock > 0 && c->clock % peck == 0) {
      c->phase = TICKS(CFG_WOODPECKER_BOB_TICKS);
      if ((c->clock / peck) % TICKS(CFG_WOODPECKER_PECKS_PER_HIT) == 0) {
        wall_peck(col, row);
      }
    }
    c->x = FP(c->home_x);
    c->y = FP(c->home_y - WOODPECKER_REACH - (c->phase > 0 ? 1 : 0));
    return;
  }
  if (c->vx == 0 && c->vy == 0) {
    s8 home_c, home_r, col, row;
    cell_of_home(c, &home_c, &home_r);
    if (!nearest_cell(underside, PX(c->x), PX(c->y), TICKS(CFG_WOODPECKER_SPREAD), &col, &row)) {
      return;
    }
    s16 to_x, to_y;
    under_cell(c, col, row, &to_x, &to_y);
    c->vx = FP(to_x) - c->x;
    c->vy = FP(to_y) - c->y;
    if (c->vx == 0 && c->vy == 0) {
      c->vy = FP(1);
    }
    c->home_x = to_x;
    c->home_y = to_y;
    c->clock = 0;
  }
  u16 fly = TICKS(CFG_WOODPECKER_FLY_TICKS);
  s32 t = c->clock >= fly ? 256 : (s32)c->clock * 256 / fly;
  c->facing = c->vx < 0 ? -1 : 1;
  c->x = FP(c->home_x) - (c->vx * (256 - t) >> 8);
  c->y = FP(c->home_y) - (c->vy * (256 - t) >> 8) - (sine(t * 384) * DIST(CFG_WOODPECKER_UNDULATION) >> 8);
  if (t >= 256) {
    c->state = WOODPECKER_CLING;
    c->clock = 0;
    c->vx = c->vy = 0;
  }
}

static void vine_reach(creature_t *c) {
  c->y = FP(c->home_y + VINE_SEGMENT - c->hp * VINE_SEGMENT);
}

static void vine(creature_t *c) {
  if (c->state == VINE_GROW) {
    if (c->clock < TICKS(CFG_VINE_GROW_TICKS)) {
      return;
    }
    c->clock = 0;
    c->hp++;
    vine_reach(c);
    if (PX(c->y) > GRID_Y + LEVEL_WALL_ROWS[level] * CELL_H) {
      return;
    }
    c->state = VINE_COLUMN;
    return;
  }
  if (c->clock < TICKS(CFG_VINE_LAY_TICKS)) {
    return;
  }
  c->clock = 0;
  s8 col = column_under(c);
  if (col < 0 || col >= LEVEL_COLS) {
    c->alive = 0;
    return;
  }
  s8 row = LEVEL_WALL_ROWS[level] - 1;
  while (row >= 0 && wall_standing(col, row)) {
    row--;
  }
  if (row < 0) {
    return;
  }
  wall_lay(col, row, VINE_LAY_KIND);
  if (--c->hp <= 0) {
    c->alive = 0;
  }
}

static void wisp(creature_t *c) {
  s32 t = c->clock;
  s32 wobble = sine(t * (RAD(1) / TICKS(CFG_WISP_WOBBLE_TICKS)));
  s32 drift = sine(t * (RAD(1) / TICKS(CFG_WISP_DRIFT_TICKS)));
  c->phase += RADS(CFG_WISP_TURN) * (wobble + drift / 2) >> 8;
  s32 speed = DIST(CFG_WISP_SPEED);
  c->x += (cosine(c->phase) * speed >> 8) + c->vx;
  c->y += (sine(c->phase) * speed >> 8) + c->vy;
  c->vx = c->vx * SHARE(CFG_WISP_SHOVE_DECAY) >> 8;
  c->vy = c->vy * SHARE(CFG_WISP_SHOVE_DECAY) >> 8;
  if (c->x < FP(FIELD_L + 1) || c->x > FP(FIELD_R - 1 - width_of(c))) {
    c->phase = HALF_TURN - c->phase;
    c->vx = -c->vx;
  }
  if (c->y < FP(FIELD_T + 1) || c->y > FP(PADDLE_Y - height_of(c) - 6)) {
    c->phase = -c->phase;
    c->vy = -c->vy;
  }
  keep_in(c, 6);
  // A ball passing through it shoves it along the ball's way.
  if (seen_ball) {
    s16 bx = PX(seen_ball->x) + BALL / 2, by = PX(seen_ball->y) + BALL / 2;
    s16 x = PX(c->x), y = PX(c->y);
    if (bx >= x && bx < x + width_of(c) && by >= y && by < y + height_of(c)) {
      s32 vx = seen_ball->vx, vy = seen_ball->vy;
      s32 rate = (vx < 0 ? -vx : vx) + (vy < 0 ? -vy : vy);
      rate = rate ? rate : 1;
      c->vx = vx * DIST(CFG_WISP_SHOVE) / rate;
      c->vy = vy * DIST(CFG_WISP_SHOVE) / rate;
    }
  }
}

static void firefly(creature_t *c) {
  u16 drift_ticks = TICKS(CFG_FIREFLY_DRIFT_TICKS), bob_ticks = TICKS(CFG_FIREFLY_BOB_TICKS);
  s32 drift = (s32)(c->clock % drift_ticks) * 65536 / drift_ticks + c->phase;
  s32 bob = (s32)(c->clock % bob_ticks) * 65536 / bob_ticks + c->phase;
  c->x = FP(c->home_x) + (sine(drift) * DIST(CFG_FIREFLY_DRIFT_X) >> 8);
  c->y = FP(c->home_y) + (sine(bob) * DIST(CFG_FIREFLY_DRIFT_Y) >> 8);
  keep_in(c, 4);
}

static void crab(creature_t *c) {
  u8 carry = TICKS(CFG_CRAB_CARRY);
  s16 grab = PX(DIST(CFG_CRAB_GRAB));
  if (c->phase < carry) {
    u8 taken = snatch_capsules(PX(c->x), PX(c->y) - grab, width_of(c), height_of(c) + grab);
    c->phase = c->phase + taken > carry ? carry : c->phase + taken;
  }
  s16 centre = PX(c->x) + width_of(c) / 2;
  s16 best = PX(DIST(CFG_CRAB_REACH));
  s16 target = -1;
  for (u8 i = 0; i < DROPS; i++) {
    s16 dx, dy;
    if (!capsule_seen(i, &dx, &dy) || dy > PX(c->y) + height_of(c)) {
      continue;
    }
    s16 gap = dx > centre ? dx - centre : centre - dx;
    if (gap < best) {
      best = gap;
      target = dx;
    }
  }
  if (target >= 0 && c->phase < carry) {
    c->state = CRAB_STALK;
    c->facing = target < centre ? -1 : 1;
    s32 chase = DIST(CFG_CRAB_CHASE);
    s32 gap = FP(best);
    c->x += c->facing * (gap < chase ? gap : chase);
  } else {
    c->state = CRAB_WALK;
    c->x += c->facing * DIST(CFG_CRAB_WALK);
  }
  if (c->x < FP(FIELD_L + 1)) {
    c->x = FP(FIELD_L + 1);
    c->facing = 1;
  } else if (c->x > FP(FIELD_R - 1 - width_of(c))) {
    c->x = FP(FIELD_R - 1 - width_of(c));
    c->facing = -1;
  }
}

// The jellyfish's beat: where it is in its pulse, 0..255, and whether this is
// the thrust or the long sink after it.
static u8 jelly_cycle(creature_t *c) {
  u16 pulse = TICKS(CFG_JELLYFISH_PULSE_TICKS);
  return ((s32)(c->clock % pulse) * 256 / pulse + c->phase) & 255;
}

static s32 jelly_pulse(creature_t *c, s32 rise, s32 sink) {
  s32 cycle = jelly_cycle(c);
  s32 thrust = SHARE(CFG_JELLYFISH_THRUST_SHARE);
  if (cycle < thrust) {
    return -(rise * sine(cycle * HALF_TURN / thrust) >> 8);
  }
  s32 into = (cycle - thrust) * 256 / (256 - thrust) * 3;
  return sink * (into > 256 ? 256 : into) >> 8;
}

static s32 toward(s32 from, s32 to, s32 speed) {
  return from + clamp32((to - from) * 13 / 256, -speed, speed);
}

static void jellyfish(creature_t *c) {
  s16 w = width_of(c), h = height_of(c);
  s32 deck_centre = FP(paddle_x + paddle_w / 2);
  s32 centre = c->x + FP(w / 2);
  s32 floor = FP(PADDLE_Y + 1 - h);
  s32 drift = DIST(CFG_JELLYFISH_DRIFT);
  if (c->state == JELLY_RISE) {
    c->y += jelly_pulse(c, DIST(CFG_JELLYFISH_RISE_UP), DIST(CFG_JELLYFISH_RISE_SINK));
    c->x = toward(centre, FP(c->home_x + w / 2), drift) - FP(w / 2);
    if (c->y <= FP(c->home_y)) {
      c->y = FP(c->home_y);
      c->state = JELLY_SINK;
      c->clock = 0;
    }
  } else {
    s32 push = jelly_cycle(c) < SHARE(CFG_JELLYFISH_THRUST_SHARE) ? 384 : 128;
    s32 home = FP(c->home_x + w / 2);
    s32 lane = home + ((deck_centre - home) * SHARE(CFG_JELLYFISH_PULL) >> 8);
    c->x = toward(centre, lane, drift * push >> 8) - FP(w / 2);
    if (c->state == JELLY_SINK) {
      c->y += jelly_pulse(c, DIST(CFG_JELLYFISH_SINK_UP), DIST(CFG_JELLYFISH_SINK_DOWN));
      if (c->y >= floor) {
        c->y = floor;
        c->state = JELLY_HOVER;
        c->clock = 0;
      }
    } else {
      s32 bob = jelly_pulse(c, DIST(CFG_JELLYFISH_HOVER_BOB), 0);
      c->y = floor - (bob < 0 ? -bob : bob);
      if (c->clock >= TICKS(CFG_JELLYFISH_HOVER_TICKS)) {
        c->state = JELLY_RISE;
        c->clock = 0;
      }
    }
    s16 x = PX(c->x);
    if (PX(c->y) + h >= PADDLE_Y && x + 1 < paddle_x + paddle_w && x + w - 1 > paddle_x) {
      sting_deck(TICKS(CFG_JELLYFISH_STING_TICKS));
      c->state = JELLY_RISE;
      c->clock = 0;
    }
  }
  c->x = clamp32(c->x, FP(FIELD_L + 1), FP(FIELD_R - 1 - w));
  if (c->y < FP(FIELD_T + 1)) {
    c->y = FP(FIELD_T + 1);
  }
}

static void slug(creature_t *c) {
  c->x += c->facing * DIST(CFG_SLUG_SPEED);
  if (c->x <= FP(FIELD_L + 1) || c->x >= FP(FIELD_R - 1 - width_of(c))) {
    c->x = clamp32(c->x, FP(FIELD_L + 1), FP(FIELD_R - 1 - width_of(c)));
    c->facing = -c->facing;
  }
  slime_rail(PX(c->x) + 1, width_of(c) - 2, TICKS(CFG_SLUG_SLIME_TICKS));
}

// --- the bestiary on a level -----------------------------------------------------------

void setup_creatures(void) {
  // A thread is shrunk, and a shrunk sprite reads all its 32 slots: blank
  // them, then the line down the first dozen.
  for (u8 i = 0; i < CREATURES; i++) {
    setup_block(SPR_THREAD + i, TILE_BLANK, 1, 1, PAL_THREAD);
    sprite_tiles(SPR_THREAD + i, TILE_THREAD, 0, 12, PAL_THREAD);
    sprite_hide(SPR_THREAD + i);
  }
}

void reset_creatures(void) {
  for (u8 i = 0; i < CREATURES; i++) {
    creature_t *c = &creatures[i];
    const pin_t *pin = &LEVEL_PINS[level][i];
    u16 first = SPR_CREATURE + i * BLOCK;
    sprite_hide(first);
    sprite_hide(first + 1);
    sprite_hide(SPR_THREAD + i);
    c->kind = pin->kind;
    c->alive = pin->kind != 0;
    if (!c->alive) {
      continue;
    }
    const species_t *sp = species_of(c);
    setup_block(first, TILE_BLANK, sp->cols, sp->rows, PAL_CREATURE0 + (c->kind - 1) * CREATURE_PALETTES);
    c->x = FP(pin->x);
    c->y = FP(pin->y);
    c->vx = c->vy = 0;
    c->hp = sp->hit_points;
    c->flash = 0;
    c->facing = 1;
    c->state = 0;
    c->clock = 0;
    c->phase = 0;
    c->home_x = pin->x;
    c->home_y = pin->y;
    c->look = 0xffff;
    switch (c->kind - 1) {
      case KIND_MOTH:
        c->phase = (s32)(pin->x - FIELD_L) * 65536 / (FIELD_R - FIELD_L);
        break;
      case KIND_SNAIL:
        c->phase = column_under(c);
        break;
      case KIND_BEETLE:
      case KIND_CRAB:
        c->facing = pin->x < (FIELD_L + FIELD_R) / 2 ? 1 : -1;
        break;
      case KIND_WISP:
        c->phase = (s32)((pin->x + pin->y) % 360) * 65536 / 360;
        break;
      case KIND_FIREFLY:
      case KIND_JELLYFISH:
        c->phase = (s32)((pin->x * 7 + pin->y * 13) % 360) * 65536 / 360;
        if (c->kind - 1 == KIND_JELLYFISH) {
          c->phase = c->phase >> 8;  // a fraction of its beat, 0..255
        }
        break;
      case KIND_VINE:
        c->hp = 1;
        vine_reach(c);
        break;
      case KIND_SLUG:
        c->y = FP(PADDLE_Y + SLUG_BELLY - height_of(c));
        c->home_y = PX(c->y);
        c->facing = pin->x + width_of(c) / 2 < (FIELD_L + FIELD_R) / 2 ? 1 : -1;
        break;
    }
  }
}

// The ball the creatures watch: the lowest in play, none on a serve.
static ball_t *watched_ball(void) {
  if (state != STATE_PLAY || !ball_count) {
    return 0;
  }
  ball_t *low = &balls[0];
  for (u8 i = 1; i < ball_count; i++) {
    if (balls[i].y > low->y) {
      low = &balls[i];
    }
  }
  return low;
}

void step_creatures(void) {
  seen_ball = watched_ball();
  for (u8 i = 0; i < CREATURES; i++) {
    creature_t *c = &creatures[i];
    if (!c->alive) {
      continue;
    }
    c->clock++;
    if (c->flash) {
      c->flash--;
    }
    switch (c->kind - 1) {
      case KIND_MOTH: moth(c); break;
      case KIND_FROG: frog(c); break;
      case KIND_SNAIL: snail(c); break;
      case KIND_SPIDER: spider(c); break;
      case KIND_BAT: bat(c); break;
      case KIND_BEETLE: beetle(c); break;
      case KIND_WOODPECKER: woodpecker(c); break;
      case KIND_VINE: vine(c); break;
      case KIND_WISP: wisp(c); break;
      case KIND_FIREFLY: firefly(c); break;
      case KIND_CRAB: crab(c); break;
      case KIND_JELLYFISH: jellyfish(c); break;
      case KIND_SLUG: slug(c); break;
    }
  }
}

// --- a ball meeting one ----------------------------------------------------------------

// What the species does when struck; 1 if the strike kills it outright.
static u8 struck(creature_t *c, s16 at_y) {
  switch (c->kind - 1) {
    case KIND_MOTH:
      spawn_capsule(PX(c->x) + width_of(c) / 2, PX(c->y) + height_of(c) / 2);
      return 1;
    case KIND_FROG:
      return c->state == FROG_LEAP;
    case KIND_SPIDER:
    case KIND_WOODPECKER:
      return 1;
    case KIND_BAT:
      if (c->state == BAT_HANG) {
        c->state = BAT_FLIT;
        c->vx = (c->home_x & 1) ? FP(-1) : FP(1);
        c->vy = CFG_BAT_RISE_SPEED * 256 / CFG_BAT_FLIT_SPEED;
      }
      c->clock = 0;
      return 0;
    case KIND_BEETLE:
      if (c->state != BEETLE_FLIPPED) {
        c->state = c->state == BEETLE_WALK ? BEETLE_ROLL : BEETLE_FLIPPED;
        c->hp++;
        c->clock = 0;
      }
      return 0;
    case KIND_CRAB:
      for (s32 n = 0; n < c->phase; n++) {
        s16 spill = PX(DIST(CFG_CRAB_SPILL));
        s16 from = PX(c->x) + width_of(c) / 2 + (s16)(n * 2 - (c->phase - 1)) * spill / 2;
        spawn_capsule(clamp32(from, FIELD_L + spill, FIELD_R - spill), PX(c->y));
      }
      c->phase = 0;
      return 0;
    case KIND_VINE: {
      s8 standing = c->hp + 1;
      s8 above = (at_y - PX(c->y)) / VINE_SEGMENT;
      s8 hp = standing - 1 - above;
      c->hp = hp < 0 ? 0 : (hp > standing - 1 ? standing - 1 : hp);
      if (c->state == VINE_GROW) {
        vine_reach(c);
      }
      return 0;
    }
  }
  return 0;
}

void strike_creatures(ball_t *ball) {
  s16 bx = PX(ball->x), by = PX(ball->y);
  for (u8 i = 0; i < CREATURES; i++) {
    creature_t *c = &creatures[i];
    if (!c->alive || c->flash) {
      continue;
    }
    const species_t *sp = species_of(c);
    if (sp->shot_only) {
      continue;
    }
    s16 x = PX(c->x), y = PX(c->y), w = width_of(c), h = height_of(c);
    if (bx >= x + w || bx + BALL <= x || by >= y + h || by + BALL <= y) {
      continue;
    }
    if (sp->solid) {
      u8 from_above = by + BALL / 2 < y + h / 2;
      ball->y = FP(from_above ? y - BALL : y + h);
      ball->vy = from_above ? -(ball->vy < 0 ? -ball->vy : ball->vy) : (ball->vy < 0 ? -ball->vy : ball->vy);
    }
    s16 at_y = PX(ball->y) + BALL / 2;
    // The beetle's shell turns a hit on whichever side is armoured.
    if (c->kind - 1 == KIND_BEETLE) {
      u8 high = at_y < y + h / 2;
      if (high == (c->state != BEETLE_FLIPPED)) {
        sound(SND_ARMOUR);
        return;
      }
    }
    c->hp--;
    c->flash = CREATURE_FLASH_TICKS;
    u8 killed = struck(c, at_y) || c->hp <= 0;
    score += sp->points + (killed ? sp->kill_points : 0);
    score_dirty = 1;
    if (!killed) {
      sound(SND_STRUCK);
      return;
    }
    c->alive = 0;
    sprite_hide(SPR_CREATURE + i * BLOCK);
    sprite_hide(SPR_CREATURE + i * BLOCK + 1);
    sprite_hide(SPR_THREAD + i);
    burst_at(x + w / 2, y + h / 2, 1, 6);
    sound(SND_KILLED);
    return;
  }
}

// --- drawing them ------------------------------------------------------------------

// Which captured pose a creature is in: tools/dump_creatures.ts's order, a
// state's two facings, then load, then height, then the step of its clock.
static u8 pose_state(creature_t *c) {
  switch (c->kind - 1) {
    case KIND_SPIDER: return c->state == SPIDER_DROP || c->state == SPIDER_CLIMB;
    case KIND_VINE: return 0;
    case KIND_CRAB: return 0;
    default: return c->state;
  }
}

static u16 pose_of(creature_t *c) {
  const species_t *sp = species_of(c);
  u8 face = c->facing < 0 && sp->facings > 1;
  u8 load = c->kind - 1 == KIND_CRAB ? (u8)c->phase : 0;
  u8 height = 0;
  if (c->kind - 1 == KIND_VINE) {
    height = c->hp < 1 ? 0 : (c->hp > sp->heights ? sp->heights - 1 : c->hp - 1);
  }
  u8 step = (c->clock / POSE_STEP) % sp->steps;
  u16 index = (((pose_state(c) * sp->facings + face) * sp->loads + load) * sp->heights + height) * sp->steps + step;
  return POSE_PICTURE[sp->first_pose + index];
}

void render_creatures(void) {
  for (u8 i = 0; i < CREATURES; i++) {
    creature_t *c = &creatures[i];
    if (!c->alive) {
      continue;
    }
    const species_t *sp = species_of(c);
    u16 first = SPR_CREATURE + i * BLOCK;
    u8 white = c->flash > CREATURE_FLASH_TICKS / 2 ? 2 : (c->flash ? 1 : 0);
    u8 palette = PAL_CREATURE0 + (c->kind - 1) * CREATURE_PALETTES + white;
    u16 picture = pose_of(c);
    u16 look = picture * 4 + white;
    if (look != c->look) {
      c->look = look;
      const u16 *tiles = &PICTURE_TILES[PICTURE_START[picture]];
      for (u8 row = 0; row < sp->rows; row++) {
        for (u8 col = 0; col < sp->cols; col++) {
          sprite_tile(first + col, row, tiles[row * sp->cols + col], palette);
        }
      }
    }
    s16 x = PX(c->x) + sp->draw_x + shake_x;
    s16 y = PX(c->y) + sp->draw_y + shake_y;
    place_block(first, sp->cols, x, y, sp->rows, 0x0fff);

    // A spider off its spot hangs on a thread from the ceiling.
    if (c->kind - 1 == KIND_SPIDER && PX(c->y) > c->home_y) {
      s16 length = PX(c->y) - FIELD_T;
      u8 rows = (length + 15) / 16;
      u16 lines = (u32)length * 256 / (rows * 16);
      place_block(SPR_THREAD + i, 1, PX(c->x) + width_of(c) / 2 - 7 + shake_x, FIELD_T + shake_y, rows,
                  0x0f00 | (lines - 1));
    } else {
      sprite_hide(SPR_THREAD + i);
    }
  }
}
