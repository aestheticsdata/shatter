import { gameConfig } from "@core/config/GameConfig";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";
import { scale3xRows } from "@render/pix";

import type { CreatureSight, Pixel, Species } from "@entities/creatures/Creature";

/**
 * FROG (SHA-208): it sits on a brick, and when the ball comes near it leaps to
 * another one.
 *
 * The second creature the player meets, on SMILEY, and the first that answers
 * the ball: a shelf while it sits, gone the moment the ball is close enough to
 * matter. Two hits kill a sitting frog; one kills it in the air, for the air
 * kill's bonus — the shot worth taking is the one at a frog that has just jumped.
 *
 * Its seat is `home`: the level's pin at first, then the top of whichever brick
 * it last landed on. A frog whose brick is gone jumps at once, wherever the
 * ball is; a frog with no brick left to jump to sits where it is.
 */
export const FROG_STATE = { SIT: "sit", LEAP: "leap" } as const;

const WIDTH = 14;
const HEIGHT = 12;

// The body: two eyes bulging over a wide head, the smile on the level that is
// one. The legs go under it, painted by state.
export const FROG_BODY: readonly string[] = [
  "..kkk....kkk..",
  ".kwwwk..kwwwk.",
  ".kwpwk..kwpwk.",
  ".kgggkkkkgggk.",
  ".kgllggggllgk.",
  ".kggggggggggk.",
  ".kgkkkkkkkkgk.",
  ".kgllllllllgk.",
  "..kkkkkkkkkk..",
];

// Legs folded under the body, feet on the brick.
export const FROG_LEGS_SIT: readonly string[] = ["..kkk....kkk..", "..kk......kk..", "...kk....kk..."];

// Legs kicked out and down, the way a frog hangs in the air.
export const FROG_LEGS_LEAP: readonly string[] = ["...kk....kk...", ".kk........kk.", "kk..........kk"];

type Cell = { column: number; row: number };

/** The cell under a seat: the brick the frog sits on, or would. */
function seatOf(home: { x: number; y: number }): Cell {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  const column = Math.floor((home.x + WIDTH / 2 - left) / brickWidth);
  return { column, row: Math.floor((home.y + HEIGHT - top) / brickHeight) };
}

/** The sprite's top-left on that cell: centred on the brick, feet on its top edge. */
function perchOn(column: number, row: number): { x: number; y: number } {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  return { x: left + column * brickWidth + (brickWidth - WIDTH) / 2, y: top + row * brickHeight - HEIGHT };
}

// Where to jump: a random standing brick other than the seat — the seat itself
// when it is the only one left (a hop in place still dodges); null when none stands.
function pickBrick(sight: CreatureSight, seat: Cell): Cell | null {
  const cells: Cell[] = [];
  for (let row = 0; row < sight.wallRows; row += 1) {
    for (let column = 0; column < gameConfig.grid.columns; column += 1) {
      if (sight.standing(column, row) && (column !== seat.column || row !== seat.row)) {
        cells.push({ column, row });
      }
    }
  }
  if (cells.length === 0) {
    return sight.standing(seat.column, seat.row) ? seat : null;
  }
  return cells[Math.floor(Math.random() * cells.length)];
}

/**
 * Every marked pixel of the rows in one tone: the legs, and the king's (SHA-213).
 *
 * **Rounded the same way the body is** (SHA-233). A frog's legs are a bitmap
 * like its body, but they are a decoration rather than a frame — they follow
 * the pose rather than the clock — so they are drawn live while the body is
 * baked. On the fine grid the body's staircases come off in `scale3x` and these
 * have to come off with them, or the creature is smooth above the hip and
 * blocky below it. Same algorithm, through the same characters: `scale3xRows`
 * is where it lives precisely so there is one of it.
 */
export function paintRows(pixel: Pixel, rows: readonly string[], x: number, y: number, tone: string, unit = 1): void {
  const grid = unit === 1 ? rows : scale3xRows(rows);
  const cell = 1 / unit;
  for (const [row, line] of grid.entries()) {
    let index = 0;
    while (index < line.length) {
      if (line[index] === ".") {
        index += 1;
        continue;
      }
      // Runs rather than cells: a grown king's legs are a thousand cells at
      // 3x and about forty spans, and a span is one `fillRect`.
      let span = 1;
      while (index + span < line.length && line[index + span] !== ".") {
        span += 1;
      }
      pixel(x + index * cell, y + row * cell, span * cell, cell, tone);
      index += span;
    }
  }
}

export const FROG: Species = {
  kind: CREATURE.FROG,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.frog.hitPoints;
  },
  get points() {
    return gameConfig.creatures.frog.points;
  },
  get killPoints() {
    return gameConfig.creatures.frog.killPoints;
  },
  tip: "SPOOK IT, THEN SHOOT IT MID-LEAP",
  lore: "A BRICK-SITTER WITH A GRIN. IT SQUATS ON TOP OF THE WALL LIKE IT OWNS THE PLACE, AND THE MOMENT THE BALL COMES CLOSE IT LEAPS TO ANOTHER BRICK. SITTING, IT IS A HARD LITTLE SHELF THAT TAKES TWO HITS. IN THE AIR IT IS ALL SOFT BELLY: ONE HIT MID-LEAP AND IT IS DONE, WITH A BONUS FOR STYLE.",
  solid: true,
  // One frame: the renderer's frame clock is the field's, not the frog's, so
  // the pose chosen by state goes through `decorate`, under the body.
  frames: [FROG_BODY],
  frameTicks: 12,
  // The green brick's three, white eyes with the eye's own pupil in them, and
  // nothing yellow: the house keeps that colour for what pays.
  palette: {
    k: BRICK_COLORS["4"].dark,
    g: BRICK_COLORS["4"].flat,
    l: BRICK_COLORS["4"].light,
    w: canvasPalette.deathFlash,
    p: canvasPalette.eyePupil,
  },
  // Body and eye whites to ground, outline, smile and pupils to ink: two ringed
  // eyes over a grin survive the tube.
  demade: {
    k: canvasPalette.demakeInk,
    g: canvasPalette.demakeGround,
    l: canvasPalette.demakeGround,
    w: canvasPalette.demakeGround,
    p: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    creature.state = FROG_STATE.SIT;
  },

  step(creature, sight) {
    const { range, leapTicks, leapHeight, restTicks } = gameConfig.creatures.frog;
    if (creature.state === FROG_STATE.LEAP) {
      // A parabola from where it left to its seat, `vx`/`vy` being the whole
      // leap: the straight line, and the arc over it peaking half way.
      const t = Math.min(1, creature.clock / leapTicks);
      creature.phase = t;
      creature.x = creature.home.x - creature.vx * (1 - t);
      creature.y = creature.home.y - creature.vy * (1 - t) - leapHeight * 4 * t * (1 - t);
      if (t >= 1) {
        creature.state = FROG_STATE.SIT;
        creature.clock = 0;
      }
      return;
    }
    const seat = seatOf(creature.home);
    if (sight.standing(seat.column, seat.row)) {
      if (creature.clock < restTicks || sight.ball === null) {
        return;
      }
      const dx = sight.ball.x - (creature.x + WIDTH / 2);
      const dy = sight.ball.y - (creature.y + HEIGHT / 2);
      if (dx * dx + dy * dy > range * range) {
        return;
      }
    }
    const target = pickBrick(sight, seat);
    if (target === null) {
      return;
    }
    const to = perchOn(target.column, target.row);
    creature.vx = to.x - creature.x;
    creature.vy = to.y - creature.y;
    creature.home = to;
    creature.facing = creature.vx < 0 ? -1 : 1;
    creature.state = FROG_STATE.LEAP;
    creature.clock = 0;
  },

  // In the air it dies of one hit; on its brick the second hit kills it.
  struck(creature) {
    return creature.state === FROG_STATE.LEAP;
  },

  // The legs by state, in the outline's tone — the flash's while it is on, so
  // the whole frog flinches as one.
  decorate(pixel, creature, _frame, demade, unit) {
    const legs = creature.state === FROG_STATE.LEAP ? FROG_LEGS_LEAP : FROG_LEGS_SIT;
    const tone = creature.flashTicks > 0 ? canvasPalette.deathFlash : BRICK_COLORS["4"].dark;
    const y = Math.round(creature.y) + HEIGHT - legs.length;
    paintRows(pixel, legs, Math.round(creature.x), y, demade ? canvasPalette.demakeInk : tone, unit);
  },
};
