// The capsules (SHA-268): WIDE and MULTI, the web game's first two.
//
// A killed brick drops one three times in ten (`bonusSpreadAmount`), drawn
// from a bag as the web draws its roster — every kind's copies shuffled in,
// taken without putting back, so neither runs dry for long. A capsule falls at
// the web's 1.3 a tick, scaled, and is caught by the deck it touches.
//
// Every effect arrives and leaves in its own idiom rather than switching:
// WIDE telescopes the deck out and, twenty-four seconds on, back in; MULTI's
// balls are born small out of the first one and grow.

#include "game.h"

#define DROPS 6                  // gameConfig.maxDrops
#define DROP_CHANCE 77           // 0.3, out of 256
#define DROP_FALL 256            // a pixel a frame, 8.8: the web's 1.3 x 0.77
#define BAG_COPIES 3             // a common capsule's copies in the bag
#define BAG (CAPSULE_KINDS * BAG_COPIES)

enum { CAPSULE_WIDE, CAPSULE_MULTI };

typedef struct {
  s16 x;
  s32 y;
  u8 kind;
  u8 live;
} drop_t;

static drop_t drops[DROPS];
static u8 bag[BAG];
static u8 bag_left;
static u16 wide_left;            // frames of WIDE to go
static const u8 MULTI_TIERS[3] = {3, 6, 9};  // gameConfig.multiTierBallCounts

static u8 draw_from_bag(void) {
  if (!bag_left) {
    for (u8 i = 0; i < BAG; i++) {
      bag[i] = i / BAG_COPIES;
    }
    bag_left = BAG;
  }
  u8 pick = rnd() % bag_left;
  u8 kind = bag[pick];
  bag[pick] = bag[--bag_left];
  return kind;
}

void setup_capsules(void) {
  for (u8 i = 0; i < DROPS; i++) {
    setup_block(SPR_CAPSULE + i, TILE_CAPSULE, 1, 1, PAL_CAPSULE0);
    sprite_hide(SPR_CAPSULE + i);
  }
}

// A life lost or a wall rebuilt: what is falling goes, and WIDE draws back in.
void reset_capsules(void) {
  for (u8 i = 0; i < DROPS; i++) {
    drops[i].live = 0;
    sprite_hide(SPR_CAPSULE + i);
  }
  wide_left = 0;
  widen_deck(0);
}

void drop_capsule(s16 cx, s16 cy) {
  if (rnd() % 256 >= DROP_CHANCE) {
    return;
  }
  for (u8 i = 0; i < DROPS; i++) {
    drop_t *d = &drops[i];
    if (d->live) {
      continue;
    }
    d->live = 1;
    d->kind = draw_from_bag();
    d->x = cx - CAPSULE_W / 2;
    d->y = FP(cy - CAPSULE_H / 2);
    sprite_tile(SPR_CAPSULE + i, 0, TILE_CAPSULE + d->kind, PAL_CAPSULE0 + d->kind);
    sound(SND_SPAWN);
    return;
  }
}

static void catch_capsule(u8 kind) {
  sound(SND_PICKUP);
  if (kind == CAPSULE_WIDE) {
    wide_left = CAPSULE_TICKS[CAPSULE_WIDE];
    widen_deck(1);
    return;
  }
  // MULTI climbs the ladder: to the first rung above the balls in play.
  for (u8 t = 0; t < sizeof(MULTI_TIERS); t++) {
    if (MULTI_TIERS[t] > ball_count) {
      add_balls(MULTI_TIERS[t]);
      return;
    }
  }
}

void step_capsules(void) {
  if (wide_left && --wide_left == 0) {
    widen_deck(0);
  }
  for (u8 i = 0; i < DROPS; i++) {
    drop_t *d = &drops[i];
    if (!d->live) {
      continue;
    }
    d->y += DROP_FALL;
    s16 y = PX(d->y);
    if (state == STATE_PLAY && y + CAPSULE_H >= PADDLE_Y && y <= PADDLE_Y + PADDLE_H && d->x + CAPSULE_W > paddle_x &&
        d->x < paddle_x + paddle_w) {
      d->live = 0;
      sprite_hide(SPR_CAPSULE + i);
      catch_capsule(d->kind);
      continue;
    }
    if (y > SCREEN_H) {
      d->live = 0;
      sprite_hide(SPR_CAPSULE + i);
      continue;
    }
    sprite_place(SPR_CAPSULE + i, d->x + shake_x, y + shake_y, 1);
  }
}
