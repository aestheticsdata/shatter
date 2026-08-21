import { gameConfig } from "@core/config/GameConfig";

// The grub's sprite box. The body is 10 wide so it never covers a whole 30 px
// brick, and it sits 2 px down inside the 12 px row it walks, which is what
// leaves the brick above it readable while it chews along underneath.
const SPRITE_WIDTH = 10;
const SPRITE_HEIGHT = 8;
const ROW_INSET_Y = 2;

// Where the grub stands when it is entirely behind a side bar: `drawWalls`
// paints those over 0..3 and 369..372, and the field is drawn before them, so a
// 10 px body at either of these is genuinely out of sight. Flush against the
// grid at 6 would not do it — `grid.left` is 6 but `field.left` is 3, and those
// 3 px are exactly where the red jaw is drawn on the leading end.
const OFFSCREEN_LEFT = gameConfig.field.left - SPRITE_WIDTH;
const OFFSCREEN_RIGHT = gameConfig.field.right;

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
  // Walking in from off the field, or walking back out of it past the last row.
  // Either way there is no row under the grub to turn onto, so `step` leaves its
  // wrap-and-turn branch alone — without this the first tick of the walk-in
  // clamps the grub back to the grid, flips it around and drops it a row.
  entering = false;
  leaving = false;
  // Ticks until this grub is off the screen, by whichever exit comes first: its
  // life timer, or the travel it has left before it walks off the bottom row.
  // One number, so the run-down the renderer draws is right both times — a tell
  // keyed to the life timer alone would sit out the exit the config's own
  // comment calls the usual one.
  deathTicks = 0;

  get centerX(): number {
    return this.x + SPRITE_WIDTH / 2;
  }

  get centerY(): number {
    return this.y + SPRITE_HEIGHT / 2;
  }

  // Fully out from under the far bar, having walked the whole row set.
  get gone(): boolean {
    return this.leaving && (this.direction > 0 ? this.x >= OFFSCREEN_RIGHT : this.x <= OFFSCREEN_LEFT);
  }

  /**
   * Dropped onto `row`, one sprite-width outside the field on the side it walks
   * in from — an animal arrives rather than appearing. The 13 px to the grid is
   * about 8 ticks of its ordinary chewing pace, out of 900.
   *
   * A second catch lands here again rather than adding a grub: the run keeps
   * one pet, restarted at the top with a full life.
   */
  spawn(row: number, fromLeft: boolean): void {
    const { top, brickHeight } = gameConfig.grid;
    this.alive = true;
    this.row = row;
    this.y = top + row * brickHeight + ROW_INSET_Y;
    this.direction = fromLeft ? 1 : -1;
    this.x = fromLeft ? OFFSCREEN_LEFT : OFFSCREEN_RIGHT;
    this.entering = true;
    this.leaving = false;
    this.ticksLeft = gameConfig.effects.critter.lifeTicks;
    this.deathTicks = this.ticksLeft;
  }

  /**
   * One tick of walking, at whatever speed the caller found it ground for.
   *
   * Coming off either end of a row drops it onto the next one and turns it
   * around, so it works the grid in boustrophedon rather than falling straight
   * down. `depth` is how many rows the level has: coming off the end of the last
   * one there is nothing to turn onto, so instead of vanishing on the boundary
   * frame the grub keeps walking the way it was going and leaves under the far
   * bar — the entrance run backwards.
   */
  step(speed: number, depth: number): void {
    const { left, brickWidth, brickHeight, columns } = gameConfig.grid;
    const rightmost = left + columns * brickWidth - SPRITE_WIDTH;
    this.ticksLeft--;
    this.x += speed * this.direction;

    if (this.entering) {
      this.entering = this.direction > 0 ? this.x < left : this.x > rightmost;
    } else if (!this.leaving && (this.x > rightmost || this.x < left)) {
      if (this.row + 1 >= depth) {
        this.leaving = true;
      } else {
        this.x = Math.min(rightmost, Math.max(left, this.x));
        this.y += brickHeight;
        this.row++;
        this.direction = -this.direction;
      }
    }

    this.deathTicks = Math.max(0, Math.min(this.ticksLeft, this.ticksToWalkOff(depth)));
  }

  reset(): void {
    this.alive = false;
    this.ticksLeft = 0;
    this.deathTicks = 0;
    this.entering = false;
    this.leaving = false;
  }

  /**
   * How many ticks of walking are left before this grub is off the screen.
   *
   * Only the bottom row has an end that is fatal; above it the grub turns onto
   * the next one, so the answer up there is that this is not the clock that will
   * fire. Measured all the way to the far bar rather than to the end of the row,
   * so it runs smoothly through the turn the grub does not take — otherwise it
   * would hit zero at the wall and the last of the run-down would play out on a
   * grub that still had eight ticks of walking to do.
   *
   * At the chewing pace rather than the current speed, which is what makes it
   * monotone: distance only ever falls, so the run-down cannot start, stop and
   * start again as the grub crosses ground it has stripped. Over cleared ground
   * it arrives at double that pace and the whole run-down plays in half the
   * ticks, which is right — it really is leaving twice as soon.
   */
  private ticksToWalkOff(depth: number): number {
    if (this.row + 1 < depth) {
      return Number.POSITIVE_INFINITY;
    }
    const travel = this.direction > 0 ? OFFSCREEN_RIGHT - this.x : this.x - OFFSCREEN_LEFT;
    return Math.ceil(travel / gameConfig.effects.critter.stepSpeed);
  }
}
