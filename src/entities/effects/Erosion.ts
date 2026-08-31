import { gameConfig } from "@core/config/GameConfig";

// What the hold test needs off a ball, which is where it is and whether it is
// on the field. Structural rather than an import of `Ball`, for the reason the
// grid never imports `Quake`: the wall wearing away has nothing to learn from
// the class that owns spin, portals and tempo debt.
export interface BallBox {
  x: number;
  y: number;
  active: boolean;
}

/**
 * ERODE: how far the mortar has gone, cell by cell.
 *
 * One number per cell rather than one for the wall, and the reason is the whole
 * of the capsule's ending. The bricks come back when the timer runs out, and a
 * brick that grew back through a ball standing in its lane would swallow it —
 * the corner test would fire from inside the stone, and the ball would either
 * be spat out on a heading nobody threw or rattle in place taking the wall
 * apart from within. So a cell with a ball in it simply does not grow yet, and
 * the wall closes around the ball's own path a moment behind it.
 *
 * The wear itself is not this class's: `ShatterGame` steps one `erodeBlend`
 * with the same `stepBlend` every other capsule's fade uses, and hands it here
 * as a target. What lives here is only the lag — which cells cannot have it yet
 * and how they catch up once they can.
 */
export class Erosion {
  // Indexed `row * columns + column`, 0 whole to 1 fully worn. Sized to the wall
  // at load, and never resized after: `shiftDown` moves values inside it exactly
  // as QUAKE moves the cells they belong to.
  private cells: number[] = [];
  // The deepest cell on the wall, kept as the step finds it. Read by the paint
  // and by the grid's fast path, so a level with no ERODE in it pays one
  // comparison a tick and nothing per cell.
  private deepest = 0;

  get worn(): boolean {
    return this.deepest > 0;
  }

  load(rowCount: number): void {
    this.cells = Array.from<number>({ length: rowCount * gameConfig.grid.columns }).fill(0);
    this.deepest = 0;
  }

  /**
   * Chase `target`, cell by cell, holding back any cell a ball is standing in.
   *
   * Shrinking is never held: a brick pulling away from a ball cannot trap it,
   * and holding one back would leave a single fat brick in an open lane for the
   * player to hit and not understand. Growing is held cell by cell, and a cell
   * released after its hold walks back down at the fade's own rate rather than
   * snapping to wherever the target has got to — a brick that waited for the
   * ball to leave and then popped out to full size in one frame is a brick that
   * looks like it was fired at the player.
   */
  follow(target: number, balls: readonly BallBox[], topOffset: number): void {
    if (target === 0 && this.deepest === 0) {
      return;
    }
    const step = 1 / gameConfig.effects.erodeTicks;
    const { columns } = gameConfig.grid;
    let deepest = 0;
    for (let index = 0; index < this.cells.length; index++) {
      const current = this.cells[index];
      if (target >= current) {
        this.cells[index] = target;
      } else if (!this.holdsBall(Math.floor(index / columns), index % columns, balls, topOffset)) {
        // `Math.max` and not the guarded arithmetic `stepBlend` uses: the target
        // is the thing that has to land exactly on 0, and it already has.
        this.cells[index] = Math.max(target, current - step);
      }
      deepest = Math.max(deepest, this.cells[index]);
    }
    this.deepest = deepest;
  }

  // The wear in whole pixels off each vertical edge of the cell, which is both
  // what the brick is drawn at and what it is collided at. Whole, because those
  // two have to be the same rectangle — see the `erode` block in the config.
  insetXAt(row: number, column: number): number {
    return Math.round(this.at(row, column) * gameConfig.powerUps.erode.insetX);
  }

  insetYAt(row: number, column: number): number {
    return Math.round(this.at(row, column) * gameConfig.powerUps.erode.insetY);
  }

  // QUAKE gives the wall a row and slides every cell down into it. The wear is
  // a property of the brick and not of the position, so it travels with them —
  // a brick worn halfway back does not heal by moving house.
  shiftDown(): void {
    const { columns } = gameConfig.grid;
    for (let index = this.cells.length - 1; index >= columns; index--) {
      this.cells[index] = this.cells[index - columns];
    }
    this.cells.fill(0, 0, columns);
  }

  reset(): void {
    this.cells.fill(0);
    this.deepest = 0;
  }

  private at(row: number, column: number): number {
    return this.cells[row * gameConfig.grid.columns + column] ?? 0;
  }

  /**
   * Whether any live ball overlaps this cell — the whole cell, not the worn
   * rectangle inside it.
   *
   * The stricter of the two tests on purpose. What has to be impossible is a
   * brick arriving where a ball already is, and the brick's next size up is a
   * moving target: testing against it would free a cell on the tick before the
   * growth that swallows the ball. The cell is where the brick is going to end
   * up, so the cell is what has to be clear.
   */
  private holdsBall(row: number, column: number, balls: readonly BallBox[], topOffset: number): boolean {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const size = gameConfig.ball.size;
    const cellLeft = left + column * brickWidth;
    // Where the cell is being *painted* this frame, which is where the ball is
    // standing: QUAKE's wall is up to a row above its own index while it falls,
    // and the grid's own hitbox reads the same offset for the same reason.
    const cellTop = top + row * brickHeight - topOffset;
    for (const ball of balls) {
      if (
        ball.active &&
        ball.x + size > cellLeft &&
        ball.x < cellLeft + brickWidth &&
        ball.y + size > cellTop &&
        ball.y < cellTop + brickHeight
      ) {
        return true;
      }
    }
    return false;
  }
}
