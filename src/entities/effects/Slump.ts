import { gameConfig } from "@core/config/GameConfig";

import type { BrickCell } from "@interfaces/types";

// What the fall needs off the wall, which is only where the bricks are. An
// interface and not `BrickGrid`, for the reason `Erosion` takes a `BallBox`:
// gravity has nothing to learn from the class that owns capsule rolls and
// hit points.
export interface WallCells {
  rows: ReadonlyArray<ReadonlyArray<BrickCell | null>>;
}

// One brick that has just stopped falling, for the dust it throws.
export interface Landing {
  row: number;
  column: number;
  // How hard it hit, in pixels a tick — a brick that fell six rows lands
  // heavier than one that closed a single gap, and the dust says so.
  speed: number;
}

/**
 * SLUMP: the wall stops being held up.
 *
 * Each brick falls under its own gravity until it lands on the brick below it
 * or on the slump floor, and it stays where it lands for the rest of the level.
 * Nothing dies from falling — a slumped wall is the same bricks, closer.
 *
 * **The grid is never touched, only the pixels.** The obvious build moves cells
 * down the array as they fall, which is QUAKE's `shiftDown` generalised — and
 * it drags everything indexed by cell along with it: ERODE's wear, JELLY's
 * strain, the capsule each brick is holding, granite's seed. Every one of those
 * would need its own per-cell move, and the level's row count would have to
 * grow from the five to eight rows a wall actually has to the twelve the floor
 * sits at, which moves BUMPERS' band, METEOR's floor and HOMING's "below the
 * wall" line on every level in the game.
 *
 * So a brick keeps its cell and gains an offset, and the whole of the capsule
 * is that one number per cell. Stacking is worked out in pixels rather than in
 * rows — a faller stops where the brick beneath it actually *is*, which is the
 * same test whether that brick has fallen or not.
 *
 * The cost is paid in `BrickGrid.cellAt`, which already searches a band of rows
 * for JELLY and now searches a wider one. That band is bounded by `reach`, and
 * the search is a handful of array lookups: the wall is at most ninety-six
 * cells and a lookup is two comparisons.
 */
export class Slump {
  // How far each cell's brick has fallen, in pixels. Indexed
  // `row * columns + column`, and it outlives the capsule: a brick that fell is
  // where the wall is now, not where the wall was for sixteen seconds.
  private offsets = new Float32Array(0);
  private speeds = new Float32Array(0);
  private rowCount = 0;
  private deepest = 0;
  // Gravity is on. Separate from "anything has fallen", which is `deepest`: the
  // wall keeps its shape after the capsule ends, so the offsets stay while the
  // gravity goes.
  private running = false;
  // The arrival's beat, before anything moves. Four ticks of a wall that has
  // stopped being held up and has not yet noticed.
  private hesitateLeft = 0;
  // The expiry's line of mortar, as a row index running up the pile, or -1 when
  // nothing is setting. Every cell at or below it is locked.
  private settingRow = -1;
  private settleLeft = 0;

  // Whether any brick is out of line, which is what the grid's hitbox asks. Not
  // `running`: a wall that has finished falling is still a wall whose bricks are
  // not where their rows say.
  get slumped(): boolean {
    return this.deepest > 0;
  }

  get reach(): number {
    return this.deepest;
  }

  // The row the mortar has just reached, or -1 when nothing is setting. Every
  // cell at or below it is locked and will not fall again. Read by the renderer
  // to draw the line, and by the fall itself to stop the cells under it.
  get settingAt(): number {
    return this.settingRow;
  }

  // The arrival's one frame: every brick's bottom bevel goes to its own shade,
  // which is the picture of something no longer resting on anything.
  get hesitating(): boolean {
    return this.hesitateLeft > 0;
  }

  load(rowCount: number): void {
    const cells = rowCount * gameConfig.grid.columns;
    this.rowCount = rowCount;
    this.offsets = new Float32Array(cells);
    this.speeds = new Float32Array(cells);
    this.deepest = 0;
    this.running = false;
    this.hesitateLeft = 0;
    this.settingRow = -1;
    this.settleLeft = 0;
  }

  start(): void {
    this.running = true;
    this.settingRow = -1;
    this.settleLeft = 0;
    this.hesitateLeft = gameConfig.effects.slumpHesitateTicks;
  }

  /**
   * The capsule is ending: finish the columns still in flight, then run the
   * mortar up the pile.
   *
   * Begun before the timer actually expires, for JELLY's reason — a wall told to
   * stop falling on the tick it stops being a slump would leave bricks in
   * mid-air. The difference is that this one is allowed to *keep falling* while
   * it sets: what the line locks is the cell it passes, and a cell still in the
   * air above the line goes on falling until the line reaches it.
   */
  settle(): void {
    if (this.running && this.settleLeft === 0) {
      this.settleLeft = gameConfig.effects.slumpSetTicks;
      this.settingRow = this.rowCount - 1;
    }
  }

  /**
   * One tick of gravity, and the bricks that landed in it.
   *
   * **Walked bottom-up per column, and it has to be.** A faller is stopped by
   * the brick beneath it, so that brick has to have moved first — top-down, a
   * stack would settle one row per tick however fast it was falling, and a
   * column of six would take six seconds to close a single gap.
   */
  step(wall: WallCells, landings: Landing[]): void {
    if (!this.running) {
      return;
    }
    if (this.hesitateLeft > 0) {
      this.hesitateLeft--;
      return;
    }
    const { columns, top, brickHeight } = gameConfig.grid;
    const { slumpGravity, slumpMaxSpeed, slumpFloorRow } = gameConfig.effects;
    const floorY = top + slumpFloorRow * brickHeight;

    if (this.settleLeft > 0) {
      this.settleLeft--;
      // The line runs from the floor to the top row over the whole of the set,
      // so the last cell locks on the last tick of it.
      const travelled = 1 - this.settleLeft / gameConfig.effects.slumpSetTicks;
      this.settingRow = Math.round((this.rowCount - 1) * (1 - travelled));
    }

    let deepest = 0;
    for (let column = 0; column < columns; column++) {
      // Where the next thing down is, in pixels: the floor until a brick is
      // found below, then that brick's top edge. Carried up the column so each
      // faller is measured against whatever actually stopped the last one.
      let ceilingBelow = floorY + brickHeight;
      for (let row = this.rowCount - 1; row >= 0; row--) {
        const index = row * columns + column;
        if (wall.rows[row]?.[column] == null) {
          continue;
        }
        const restingTop = top + row * brickHeight + this.offsets[index];
        // Locked: the mortar has been poured back in under this cell.
        const locked = this.settingRow >= 0 && row >= this.settingRow;
        const room = ceilingBelow - brickHeight - restingTop;
        if (locked || room <= gameConfig.effects.slumpRestEpsilon) {
          if (this.speeds[index] > 0) {
            landings.push({ row, column, speed: this.speeds[index] });
            this.speeds[index] = 0;
          }
        } else {
          this.speeds[index] = Math.min(slumpMaxSpeed, this.speeds[index] + slumpGravity);
          const step = Math.min(this.speeds[index], room);
          this.offsets[index] += step;
          if (step >= room) {
            landings.push({ row, column, speed: this.speeds[index] });
            this.speeds[index] = 0;
          }
        }
        ceilingBelow = top + row * brickHeight + this.offsets[index];
        if (this.offsets[index] > deepest) {
          deepest = this.offsets[index];
        }
      }
    }
    this.deepest = deepest;
  }

  // The capsule's clock has run out. The offsets stay — the wall is where it
  // fell — and only gravity goes.
  stop(): void {
    this.running = false;
    this.settingRow = -1;
    this.settleLeft = 0;
    this.speeds.fill(0);
  }

  // Whole pixels, for QUAKE's reason: the art is drawn at 3x and a fractional
  // translate would soften every brick on screen.
  offsetAt(row: number, column: number): number {
    return Math.round(this.offsets[row * gameConfig.grid.columns + column] ?? 0);
  }

  // QUAKE gives the wall a row and slides every cell down into it. A brick's
  // own fall travels with it, exactly as ERODE's wear does — otherwise a
  // slumped brick would jump back into line the moment a QUAKE landed.
  shiftDown(): void {
    const { columns } = gameConfig.grid;
    for (let index = this.offsets.length - 1; index >= columns; index--) {
      this.offsets[index] = this.offsets[index - columns];
      this.speeds[index] = this.speeds[index - columns];
    }
    this.offsets.fill(0, 0, columns);
    this.speeds.fill(0, 0, columns);
  }

  // A cell that lost its brick owes the wall nothing. Without this the fall
  // would be inherited by whatever QUAKE slides into the hole.
  clearCell(row: number, column: number): void {
    const index = row * gameConfig.grid.columns + column;
    this.offsets[index] = 0;
    this.speeds[index] = 0;
  }

  reset(): void {
    this.offsets.fill(0);
    this.speeds.fill(0);
    this.deepest = 0;
    this.running = false;
    this.hesitateLeft = 0;
    this.settingRow = -1;
    this.settleLeft = 0;
  }
}
