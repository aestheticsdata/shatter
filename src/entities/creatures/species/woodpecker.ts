import { gameConfig } from "@core/config/GameConfig";
import { flipped, mirrored } from "@entities/creatures/bitmap";
import { paintRows } from "@entities/creatures/species/frog";
import { cellUnder, pickNearest, underCell, undersideCells } from "@entities/creatures/wall";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * WOODPECKER (SHA-240): the one thing in the bestiary that is on your side.
 *
 * It picks a brick with open air under it, flies over, clings to the
 * underside and hammers upward. When the brick is gone it rests, then finds
 * another. Nothing it does is aimed at you.
 *
 * **A run of blows is what takes a hit point off, not each blow.** An
 * ordinary brick in this game has *one* hit point — 1 through 5 all do, and
 * only silver, gold and granite have more — so a bird that took one off per
 * peck would open a brick on its first tap and eat a level in half a minute.
 * `pecksPerHit` is the bird's own counter and it is the pacing knob: the
 * hammering is visible and fast, the progress is slow, and the rest between
 * bricks is most of it.
 *
 * **It pays nothing.** Not per peck and not per brick. The cleared path is
 * the whole gift, and a woodpecker that paid score would turn an ally into a
 * clock the player stands and waits on — the worst thing a creature can be on
 * a field whose subject is a ball in flight. Killing it is one hit and a
 * malus pop: no points either way, because what it cost you is the help.
 *
 * The one thing the peck *does* hand over is a seeded capsule, and that is the
 * house's rule rather than this species' — every indirect kill in the game
 * pays nothing it rolled and still releases what the level promised
 * (`strikeTwin`'s note). A bird that quietly binned a level's capsule would be
 * an ally with a hidden cost, which is the one thing worse than a useless one.
 */
export const WOODPECKER_STATE = { FLY: "fly", CLING: "cling", REST: "rest" } as const;

const WIDTH = 10;
const HEIGHT = 13;

/**
 * Clinging, beak up: horn beak, red crest, a pale barred back and a stiff
 * tail. Drawn the way it spends almost all its life, because a bird that flies
 * for a second in ten should not be drawn as a bird in flight.
 *
 * The dark is at the *edges* — three bars down each side and the tail — rather
 * than in the middle. A first pass put a block of it through the body and the
 * bird read as a face: a pale ring with a dark centre is an eye before it is
 * an animal, on a field that already has an enormous one watching.
 */
export const WOODPECKER_BODY: readonly string[] = [
  "....yy....",
  "...kyyk...",
  "..krrrrk..",
  "..krrrrk..",
  "..kkwwkk..",
  ".kkwwwwkk.",
  ".kwwwwwwk.",
  ".kkwwwwkk.",
  ".kwwwwwwk.",
  ".kkwwwwkk.",
  "..kwwwwk..",
  "...kwwk...",
  "...kkkk...",
];

// Out on the downbeat and up on the up, for the second it is in the air.
export const WOODPECKER_WING: readonly string[] = ["xxxxx.", ".xxxxx", "..xxx."];
const WING_UP: readonly string[] = flipped(WOODPECKER_WING);
const WING_LEFT_DOWN = mirrored(WOODPECKER_WING);
const WING_LEFT_UP = mirrored(WING_UP);
const WING_SPAN = WOODPECKER_WING[0].length;
const SHOULDER = 5;

/**
 * How far into the cell the beak goes. Bricks are drawn inset inside their
 * cells — that is where the mortar lines between them come from — so a sprite
 * parked exactly on the cell boundary stands two pixels clear of the brick it
 * is supposed to be hammering, and the bird reads as pecking the air.
 */
const REACH = 2;

export const WOODPECKER: Species = {
  kind: CREATURE.WOODPECKER,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.woodpecker.hitPoints;
  },
  // Nothing, on purpose. See the note above the species.
  get points() {
    return gameConfig.creatures.woodpecker.points;
  },
  get killPoints() {
    return gameConfig.creatures.woodpecker.killPoints;
  },
  tip: "LEAVE IT ALONE · IT WORKS FOR YOU",
  lore: "THE ONE FRIEND YOU HAVE IN HERE. IT PICKS A BRICK WITH OPEN AIR BENEATH, CLINGS TO ITS UNDERSIDE AND HAMMERS AWAY UNTIL THE BRICK GIVES, THEN RESTS AND FINDS ANOTHER. IT ASKS FOR NOTHING AND PAYS NOTHING. HIT IT AND IT IS GONE — AND SO IS THE HELP.",
  solid: false,
  frames: [WOODPECKER_BODY],
  frameTicks: 12,
  // A horn beak, the crest in the red brick's flat, and a black-and-white
  // body off the rock and silver bricks: the one bird in the game, and it
  // wants to be told from a bat at a glance.
  palette: {
    k: BRICK_COLORS.R.dark,
    w: BRICK_COLORS.S.light,
    r: BRICK_COLORS["1"].flat,
    y: BRICK_COLORS.R.light,
  },
  // White to ground; outline, wing, crest and beak to ink. The wing is a solid
  // block of `k` at this size, so unlike the bat this body has something to be
  // on the tube besides its own edge.
  demade: {
    k: canvasPalette.demakeInk,
    w: canvasPalette.demakeGround,
    r: canvasPalette.demakeInk,
    y: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    creature.state = WOODPECKER_STATE.FLY;
    // No target yet; the first step picks one off the wall as it stands.
    creature.vx = 0;
    creature.vy = 0;
  },

  step(creature, sight, effects) {
    const { flyTicks, peckTicks, pecksPerHit, bobTicks, restTicks, undulation, spread } =
      gameConfig.creatures.woodpecker;
    if (creature.phase > 0) {
      creature.phase -= 1;
    }
    if (creature.state === WOODPECKER_STATE.REST) {
      creature.x = creature.home.x;
      creature.y = creature.home.y - REACH;
      if (creature.clock >= restTicks) {
        creature.state = WOODPECKER_STATE.FLY;
        creature.clock = 0;
        creature.vx = 0;
        creature.vy = 0;
      }
      return;
    }
    if (creature.state === WOODPECKER_STATE.CLING) {
      const cell = cellUnder(creature.home, WIDTH);
      // The brick it was working is gone — by its own beak or by the ball —
      // so it sits back. Asked every tick rather than only after a blow: the
      // ball can take the brick out from under it between two of them.
      if (!sight.standing(cell.column, cell.row)) {
        creature.state = WOODPECKER_STATE.REST;
        creature.clock = 0;
        return;
      }
      if (creature.clock > 0 && creature.clock % peckTicks === 0) {
        creature.phase = bobTicks;
        // Which blow of the run this is, counted off the clock rather than
        // kept in a field: `clock` is zeroed on arrival, so the arithmetic is
        // the state and there is nothing to get out of step with it.
        const blow = creature.clock / peckTicks;
        if (blow % pecksPerHit === 0) {
          effects.peck(cell.column, cell.row);
        }
      }
      // The blow itself: it drives a pixel up into the brick and comes back.
      creature.x = creature.home.x;
      creature.y = creature.home.y - REACH - (creature.phase > 0 ? 1 : 0);
      return;
    }
    // In the air. A target is chosen once, on the tick the flight starts, so
    // the bird commits to a brick rather than re-aiming every frame at
    // whatever the wall happens to look like.
    if (creature.vx === 0 && creature.vy === 0) {
      const target = pickNearest(
        undersideCells(sight),
        { x: creature.x, y: creature.y },
        spread,
        cellUnder(creature.home, WIDTH),
      );
      if (target === null) {
        // No wall left to work. It holds where it is rather than flying at a
        // cell that is not there.
        return;
      }
      const to = underCell(target.column, target.row, WIDTH);
      creature.vx = to.x - creature.x;
      creature.vy = to.y - creature.y;
      // A cell directly under it would leave both deltas at zero and re-pick
      // for ever; a pixel of lift is enough to make the flight a flight.
      if (creature.vx === 0 && creature.vy === 0) {
        creature.vy = 1;
      }
      creature.home = to;
      creature.clock = 0;
    }
    const t = Math.min(1, creature.clock / flyTicks);
    creature.facing = creature.vx < 0 ? -1 : 1;
    creature.x = creature.home.x - creature.vx * (1 - t);
    // Birds do not fly in straight lines: three shallow bounds along the way,
    // taken off the arc rather than added to the clock, so the bird still
    // arrives exactly when it said it would.
    creature.y = creature.home.y - creature.vy * (1 - t) - Math.sin(t * Math.PI * 3) * undulation;
    if (t >= 1) {
      creature.state = WOODPECKER_STATE.CLING;
      creature.clock = 0;
      creature.vx = 0;
      creature.vy = 0;
    }
  },

  /** One hit and it is gone, and the pop says so rather than paying for it. */
  struck(creature, _by, effects) {
    effects.pop(creature.x + WIDTH / 2, creature.y - 6, "GONE", true);
    return true;
  },

  /** Wings, and only in the air: a clinging bird has them folded, and they are folded in the bitmap. */
  decorate(pixel, creature, _frame, demade, unit) {
    if (creature.state !== WOODPECKER_STATE.FLY) {
      return;
    }
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const tone =
      creature.flashTicks > 0 ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.R.dark;
    const up = Math.floor(creature.clock / gameConfig.creatures.woodpecker.flapTicks) % 2 === 0;
    paintRows(pixel, up ? WING_LEFT_UP : WING_LEFT_DOWN, x - WING_SPAN + 1, y + SHOULDER, tone, unit);
    paintRows(pixel, up ? WING_UP : WOODPECKER_WING, x + WIDTH - 1, y + SHOULDER, tone, unit);
  },
};
