import { gameConfig } from "@core/config/GameConfig";
import { doubled } from "@entities/creatures/bitmap";
import {
  FROG,
  FROG_BODY,
  FROG_LEGS_LEAP,
  FROG_LEGS_SIT,
  FROG_STATE,
  paintRows,
} from "@entities/creatures/species/frog";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, CreatureSight, Species } from "@entities/creatures/Creature";

/**
 * THE FROG KING (SHA-213): the boss at the end of level 25, CASCADE.
 *
 * His subjects sit on a brick and leap when the ball comes near, and die of
 * one hit in the air. He is the same animal twice the size, on the floor of
 * the room now that the wall is gone, and the same rule turned into the whole
 * fight: **sitting, he is armour** — the ball bounces off his back and the hit
 * is refused with a HIDE — **and in the air he is soft.** He hops the floor in
 * high arcs on his own clock and lands with a thud that rattles the field, so
 * the shot that counts is the one that meets him mid-leap, and everything
 * else is a bounce off a green boulder.
 *
 * What he does back is the tongue. Sitting, he turns to face the ball, and a
 * ball that passes his mouth is flicked — sent straight down at speed, the
 * one thing in the room that can put a ball past the deck faster than the
 * deck can move. The tongue is drawn for the flick's span, so a ball that
 * suddenly dives was seen to be hit.
 */
const WIDTH = FROG.width * 2;
const BODY_HEIGHT = FROG_BODY.length * 2;
const LEGS_HEIGHT = FROG_LEGS_SIT.length * 2;
const HEIGHT = BODY_HEIGHT + LEGS_HEIGHT;

const KING_STATE = { ENTER: "enter", SIT: FROG_STATE.SIT, LEAP: FROG_STATE.LEAP } as const;
const HIDE = "HIDE";
const LICK = "LICK";

// Where the mouth is on the body: the row of the grin, doubled.
const MOUTH_Y = 12;
const TONGUE_THICKNESS = 2;

const LEGS_SIT_BIG = doubled(FROG_LEGS_SIT);
const LEGS_LEAP_BIG = doubled(FROG_LEGS_LEAP);

function centreX(creature: Creature): number {
  return creature.x + WIDTH / 2;
}

function floorY(): number {
  return gameConfig.observer.tears.floorY - HEIGHT;
}

/** The tongue's reach this tick as a box, from the mouth out on the facing side. */
function tongueBox(creature: Creature): { x: number; y: number; width: number; height: number } {
  const { tongueRange } = gameConfig.creatures.frogKing;
  const mouthY = creature.y + MOUTH_Y;
  return {
    x: creature.facing === 1 ? creature.x + WIDTH : creature.x - tongueRange,
    y: mouthY - 4,
    width: tongueRange,
    height: 8 + TONGUE_THICKNESS,
  };
}

function faceTheBall(creature: Creature, sight: CreatureSight): void {
  if (sight.ball) {
    creature.facing = sight.ball.x < centreX(creature) ? -1 : 1;
  }
}

export const FROG_KING: Species = {
  kind: CREATURE.FROG_KING,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.frogKing.hitPoints;
  },
  get points() {
    return gameConfig.creatures.frogKing.points;
  },
  get killPoints() {
    return gameConfig.creatures.frogKing.killPoints;
  },
  tip: "STRIKE HIM IN THE AIR, NEVER NEAR HIS MOUTH",
  lore: "HIS SUBJECTS LEAP; HE MAKES THE FLOOR SHAKE. SITTING, THE KING IS A GREEN BOULDER THE BALL BOUNCES OFF WITH A SCORNFUL HIDE. ONLY IN THE AIR, BETWEEN TWO THUDS, IS HE SOFT. AND NEVER PASS HIS MOUTH: HIS TONGUE FLICKS THE BALL STRAIGHT DOWN, FASTER THAN ANY DECK CAN FOLLOW.",
  solid: true,
  frames: [doubled(FROG_BODY)],
  frameTicks: 12,
  palette: FROG.palette,
  demade: FROG.demade,
  outline: FROG.outline,

  spawn(creature) {
    creature.state = KING_STATE.ENTER;
    // `vx` holds the tongue's ticks left, `vy` its rest: the king never
    // moves by velocity, so the two are his to keep the flick's clock in.
    creature.vx = 0;
    creature.vy = 0;
  },

  step(creature, sight, effects) {
    const knobs = gameConfig.creatures.frogKing;
    const { left, right } = gameConfig.field;
    if (creature.vx > 0) {
      creature.vx -= 1;
    }
    if (creature.vy > 0) {
      creature.vy -= 1;
    }
    switch (creature.state) {
      case KING_STATE.ENTER: {
        creature.y = Math.min(floorY(), creature.y + knobs.enterSpeed);
        if (creature.y >= floorY()) {
          effects.rattle(knobs.thudTicks);
          creature.state = KING_STATE.SIT;
          creature.clock = 0;
        }
        return;
      }
      case KING_STATE.LEAP: {
        // The frog's parabola: `home` is where he lands, `phase` how far along.
        const t = Math.min(1, creature.clock / knobs.leapTicks);
        creature.phase = t;
        creature.x = creature.home.y + (creature.home.x - creature.home.y) * t;
        creature.y = floorY() - knobs.leapHeight * 4 * t * (1 - t);
        if (t >= 1) {
          creature.x = creature.home.x;
          effects.rattle(knobs.thudTicks);
          creature.state = KING_STATE.SIT;
          creature.clock = 0;
        }
        return;
      }
      default: {
        faceTheBall(creature, sight);
        // The tongue: a ball passing the mouth is flicked straight down.
        if (creature.vy === 0 && sight.ball) {
          const box = tongueBox(creature);
          const spitX = creature.facing * knobs.spitSpeed * knobs.spitSideways;
          if (effects.kick(box.x, box.y, box.width, box.height, spitX, knobs.spitSpeed)) {
            creature.vx = knobs.tongueTicks;
            creature.vy = knobs.tongueRest;
            effects.pop(centreX(creature), creature.y - 6, LICK, true);
          }
        }
        if (creature.clock < knobs.restTicks) {
          return;
        }
        // A hop to a new spot on the floor, never under the side bars. `home`
        // carries the landing x in `x` and the take-off x in `y`: two numbers
        // the leap needs and the king has no other use for.
        const span = right - 1 - WIDTH - (left + 1);
        const landX = left + 1 + Math.random() * span;
        creature.home = { x: landX, y: creature.x };
        creature.facing = landX < creature.x ? -1 : 1;
        creature.state = KING_STATE.LEAP;
        creature.clock = 0;
      }
    }
  },

  struck() {
    return false;
  },

  // Armour everywhere but in the air.
  armour(creature) {
    return creature.state === KING_STATE.LEAP ? null : HIDE;
  },

  // The legs by state under the body, in the frog's own way; and the tongue,
  // red and two pixels thick, from the mouth to the reach while the flick runs.
  decorate(pixel, creature, _frame, demade, unit) {
    const legs = creature.state === KING_STATE.LEAP ? LEGS_LEAP_BIG : LEGS_SIT_BIG;
    const tone = creature.flashTicks > 0 ? canvasPalette.deathFlash : BRICK_COLORS["4"].dark;
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    // The tongue below keeps its whole game pixels on either grid: it is a
    // hazard with a hitbox (`tongueBox`), and the width is the thing being read.
    paintRows(pixel, legs, x, y + HEIGHT - legs.length, demade ? canvasPalette.demakeInk : tone, unit);
    if (creature.vx > 0) {
      const box = tongueBox(creature);
      const red = demade ? canvasPalette.demakeInk : BRICK_COLORS["1"].flat;
      pixel(Math.round(box.x), y + MOUTH_Y, Math.round(box.width), TONGUE_THICKNESS, red);
      const tipX = creature.facing === 1 ? Math.round(box.x + box.width) - 3 : Math.round(box.x);
      pixel(tipX, y + MOUTH_Y - 1, 3, TONGUE_THICKNESS + 2, red);
    }
  },
};
