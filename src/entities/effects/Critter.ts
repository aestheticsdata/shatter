import { gameConfig } from "@core/config/GameConfig";

// The grub's sprite box. The body is 10 wide so it never covers a whole 30 px
// brick, and it sits 2 px down inside the 12 px row it walks, which is what
// leaves the brick above it readable while it chews along underneath.
const SPRITE_WIDTH = 10;
const SPRITE_HEIGHT = 8;
const ROW_INSET_Y = 2;

/**
 * CRITTER's pet: where the grub is, which brick row it is walking, and how much
 * life it has left.
 *
 * It eats nothing itself — `ShatterGame` owns the grid and does the biting, the
 * same division `Singularity` and `Detonation` use. This is the geometry and
 * the clock, and the speed it walks at is the caller's to decide: how much is
 * left to chew ahead of it is a question about the grid.
 */
export class Critter {
  alive = false;
  x = 0;
  y = 0;
  row = 0;
  // +1 walking right, -1 walking left. The jaw and the eye are drawn on this end.
  direction = 1;
  ticksLeft = 0;

  get centerX(): number {
    return this.x + SPRITE_WIDTH / 2;
  }

  get centerY(): number {
    return this.y + SPRITE_HEIGHT / 2;
  }

  /**
   * Dropped onto `row`, flush against the wall it walks in from.
   *
   * A second catch lands here again rather than adding a grub: the run keeps
   * one pet, restarted at the top with a full life.
   */
  spawn(row: number, fromLeft: boolean): void {
    const { left, top, brickWidth, brickHeight, columns } = gameConfig.grid;
    this.alive = true;
    this.row = row;
    this.y = top + row * brickHeight + ROW_INSET_Y;
    this.direction = fromLeft ? 1 : -1;
    this.x = fromLeft ? left : left + columns * brickWidth - SPRITE_WIDTH;
    this.ticksLeft = gameConfig.effects.critter.lifeTicks;
  }

  /**
   * One tick of walking, at whatever speed the caller found it ground for.
   *
   * Coming off either end of a row drops it onto the next one and turns it
   * around, so it works the grid in boustrophedon rather than falling straight
   * down. Nothing here knows the grid ends: walking off the bottom is
   * `row` running past the last one, which the caller checks.
   */
  step(speed: number): void {
    const { left, brickWidth, brickHeight, columns } = gameConfig.grid;
    const rightmost = left + columns * brickWidth - SPRITE_WIDTH;
    this.ticksLeft--;
    this.x += speed * this.direction;

    if (this.x > rightmost || this.x < left) {
      this.x = Math.min(rightmost, Math.max(left, this.x));
      this.y += brickHeight;
      this.row++;
      this.direction = -this.direction;
    }
  }

  reset(): void {
    this.alive = false;
    this.ticksLeft = 0;
  }
}
