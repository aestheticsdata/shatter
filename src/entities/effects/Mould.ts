import { BRICK_BY_ID } from "@core/config/bricks";
import { gameConfig } from "@core/config/GameConfig";

import type { BallBox } from "@entities/effects/Erosion";
import type { BrickCell, BrickKind } from "@interfaces/types";

/**
 * One brick growing back: where, as what, and how far out of the cell floor.
 *
 * `rise` counts up to `riseTicks` while it grows and back down while it
 * shrivels. It is a picture until it lands — see `Mould`.
 */
export interface Bud {
  row: number;
  column: number;
  kind: BrickKind;
  rise: number;
  shrivelling: boolean;
}

// What the growth needs from the wall, and nothing else. Structural rather than
// the grid itself so the mould can be read without dragging `BrickGrid` in, the
// way `Erosion` reads balls through `BallBox`.
export interface MouldWall {
  holes(): Array<{ row: number; column: number; kind: BrickKind }>;
  rows: ReadonlyArray<ReadonlyArray<BrickCell | null>>;
  readonly topOffset: number;
}

/**
 * MOULD (SHA-142): the wall grows back, and what grows stays.
 *
 * **A bud lives here and nowhere else until it lands.** Half the engine reaches
 * the grid by index rather than by pixel — HOMING's retarget, BLAST's splash,
 * CHAIN's arcs, ZAP, the critter, METEOR's drill — and a half-grown brick put in
 * the grid as a not-yet-solid cell would have a ball locking its reticle onto a
 * ghost. So the grid learns about a brick on the tick it is finished and not a
 * tick before, through `BrickGrid.plant`.
 *
 * The cells it grows into are the wall's own holes — cells the level built and
 * the player has cleared, which `BrickGrid.holes` already keeps and QUAKE
 * already slides — and only those with a live brick beside them, so it feeds on
 * the edge of what has been opened and the last brick on the field can always
 * be killed without growing a friend.
 */
export class Mould {
  readonly buds: Bud[] = [];
  // Ticks since the catch, or -1 with no mould live. The fur and the rounds are
  // both read off it.
  private elapsed = -1;
  // 0 to 1: how far the fur has crept along the seams on arrival, and how far it
  // has dried on the way out. Pictures, stepped above the freeze gates.
  fur = 0;
  dry = 0;
  private drying = false;

  get live(): boolean {
    return this.elapsed >= 0 || this.buds.length > 0 || this.fur > 0;
  }

  /**
   * The catch. A second MOULD over a live one keeps its clock and its fur — the
   * timer is topped up by the caller, and the rounds simply go on.
   */
  start(): void {
    if (this.elapsed < 0) {
      this.elapsed = 0;
    }
    this.drying = false;
    this.dry = 0;
  }

  /** The timer is running out: the fur dries, course by course from the bottom. */
  release(): void {
    this.drying = true;
  }

  /**
   * The picture's half of a tick: the fur creeping in or drying out, and buds
   * shrivelling. Above the freeze gates, because none of it is a hitbox — and a
   * level clear with buds in flight owes the shrivel rather than a blink.
   */
  stepPicture(): void {
    const { furTicks, dryTicks } = gameConfig.powerUps.mould;
    if (this.drying) {
      this.dry = Math.min(1, this.dry + 1 / dryTicks);
    } else if (this.elapsed >= 0) {
      this.fur = Math.min(1, this.fur + 1 / furTicks);
    }
    for (let index = this.buds.length - 1; index >= 0; index--) {
      const bud = this.buds[index];
      if (bud.shrivelling && --bud.rise <= 0) {
        this.buds.splice(index, 1);
      }
    }
    if (this.dry >= 1 && this.elapsed < 0 && this.buds.length === 0) {
      this.fur = 0;
      this.dry = 0;
      this.drying = false;
    }
  }

  /**
   * The simulation's half: the rounds, the rising, and the landing. Below both
   * freeze gates — a landed bud is a hitbox and a brick in `remaining`, and one
   * landing on the tick a clear is armed would leave a brick standing behind the
   * CLEARED overlay. `plant` is the caller's, and it answers whether the brick
   * went in.
   *
   * `canGrow` is false once the wall is empty or a clear is pending: buds in
   * flight then shrivel, and nothing new starts.
   */
  step(
    wall: MouldWall,
    balls: readonly BallBox[],
    timeLeft: number,
    canGrow: boolean,
    plant: (row: number, column: number, cell: BrickCell) => void,
  ): void {
    if (this.elapsed < 0) {
      return;
    }
    const { furTicks, roundTicks, rounds, budsPerRound, quietTicks, riseTicks, pointsShare } =
      gameConfig.powerUps.mould;
    if (!canGrow) {
      this.shrivelAll();
    }
    const sinceFur = this.elapsed - furTicks;
    if (
      canGrow &&
      sinceFur >= 0 &&
      sinceFur % roundTicks === 0 &&
      sinceFur / roundTicks < rounds &&
      timeLeft > quietTicks
    ) {
      this.sow(wall, budsPerRound);
    }
    this.elapsed++;

    for (let index = this.buds.length - 1; index >= 0; index--) {
      const bud = this.buds[index];
      if (bud.shrivelling) {
        continue;
      }
      if (bud.rise < riseTicks) {
        bud.rise++;
        continue;
      }
      // Grown, and waiting for the lane to clear: a brick may not arrive where a
      // ball already is. It stands at full height as a picture until it can.
      if (wall.rows[bud.row]?.[bud.column] !== null || holdsBall(bud.row, bud.column, balls, wall.topOffset)) {
        if (wall.rows[bud.row]?.[bud.column] !== null) {
          this.buds.splice(index, 1);
        }
        continue;
      }
      const definition = BRICK_BY_ID[bud.kind];
      plant(bud.row, bud.column, {
        kind: bud.kind,
        hitPoints: 1,
        points: Math.round(definition.points * pointsShare),
        seed: bud.row * gameConfig.grid.columns + bud.column,
        capsule: null,
        seeded: false,
        scarTicks: 0,
        grown: true,
      });
      this.buds.splice(index, 1);
    }
  }

  /** The timer is over: the clock stops, and whatever is still rising shrivels. */
  stop(): void {
    this.elapsed = -1;
    this.drying = true;
    this.shrivelAll();
  }

  /**
   * QUAKE shakes the buds loose. Cheaper than sliding a half-grown brick down a
   * row, and a better picture: the tremor knocks the growth back into the floor.
   */
  shakeLoose(): void {
    this.shrivelAll();
  }

  reset(): void {
    this.buds.length = 0;
    this.elapsed = -1;
    this.fur = 0;
    this.dry = 0;
    this.drying = false;
  }

  private shrivelAll(): void {
    for (const bud of this.buds) {
      bud.shrivelling = true;
    }
  }

  private sow(wall: MouldWall, count: number): void {
    const candidates: Array<{ row: number; column: number; kind: BrickKind }> = [];
    for (const hole of wall.holes()) {
      if (this.buds.some((bud) => bud.row === hole.row && bud.column === hole.column)) {
        continue;
      }
      const kind = weakestNeighbour(wall.rows, hole.row, hole.column);
      if (kind !== null) {
        candidates.push({ row: hole.row, column: hole.column, kind });
      }
    }
    for (let sown = 0; sown < count && candidates.length > 0; sown++) {
      const [pick] = candidates.splice(Math.floor(Math.random() * candidates.length), 1);
      this.buds.push({ ...pick, rise: 0, shrivelling: false });
    }
  }
}

/**
 * The weakest kind among the live bricks either side of a cell, above and
 * below it, or null where there are none. Weakest by hit points and then by
 * points, so a bud beside granite and a plain brick takes the plain one — a
 * one-hit brick wearing granite's deepest damage tone would read as stone
 * somebody had already beaten on.
 */
function weakestNeighbour(
  rows: ReadonlyArray<ReadonlyArray<BrickCell | null>>,
  row: number,
  column: number,
): BrickKind | null {
  let weakest: BrickKind | null = null;
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const cell = rows[row + dr]?.[column + dc];
    if (!cell) {
      continue;
    }
    const definition = BRICK_BY_ID[cell.kind];
    if (definition.capsules === false) {
      continue;
    }
    if (weakest === null) {
      weakest = cell.kind;
      continue;
    }
    const best = BRICK_BY_ID[weakest];
    if (
      definition.hitPoints < best.hitPoints ||
      (definition.hitPoints === best.hitPoints && definition.points < best.points)
    ) {
      weakest = cell.kind;
    }
  }
  return weakest;
}

// `Erosion`'s hold test, for its reason: the whole cell has to be clear, since
// the cell is where the brick is going to end up.
function holdsBall(row: number, column: number, balls: readonly BallBox[], topOffset: number): boolean {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  const cellLeft = left + column * brickWidth;
  const cellTop = top + row * brickHeight - topOffset;
  return balls.some(
    (ball) =>
      ball.active &&
      ball.x + ball.size > cellLeft &&
      ball.x < cellLeft + brickWidth &&
      ball.y + ball.size > cellTop &&
      ball.y < cellTop + brickHeight,
  );
}
