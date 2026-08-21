import { gameConfig } from "@core/config/GameConfig";

// Twice a volley, so a second catch under a volley still in the air launches
// three more rather than being swallowed. A third catch inside the same fall
// finds no free slot and lands as the sound alone.
const POOL_SIZE = gameConfig.effects.meteor.count * 2;

export interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Ticks since launch, which is what paces the trail: one puff every other tick.
  age: number;
  // What is left of the burnout once the rock is past the bottom of the wall,
  // counting down from `burnoutTicks`; 0 while it is still a rock. It is what
  // shrinks the core, doubles the trail, and finally clears `active`.
  burnTicks: number;
  active: boolean;
}

/**
 * METEOR's volley: where the rocks are and where they are going.
 *
 * It drills nothing itself — `ShatterGame` owns the grid and does the killing,
 * the same division `Critter`, `Singularity` and `Detonation` use. This is the
 * geometry and the clock.
 */
export class MeteorField {
  readonly meteors: Meteor[] = Array.from({ length: POOL_SIZE }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    burnTicks: 0,
    active: false,
  }));

  get active(): boolean {
    return this.meteors.some((meteor) => meteor.active);
  }

  /**
   * Three rocks off the top of the field, one per third of the grid, and how
   * many actually left. A random column inside each band rather than a fixed
   * one: three lanes every time, never the same three.
   *
   * The drift is always toward the middle. Outward, the outer bands walk into
   * a side wall a dozen ticks in having drilled nothing at all — and at 1.2 px
   * a tick against a 30 px column, 44 ticks of fall move a rock under two
   * columns, so the three lanes converge without ever crossing.
   */
  launch(): number {
    const { columns, brickWidth, left } = gameConfig.grid;
    const { count, fallSpeed, driftSpeed } = gameConfig.effects.meteor;
    const band = columns / count;
    const middle = gameConfig.field.width / 2;
    let launched = 0;

    for (let index = 0; index < count; index++) {
      const meteor = this.meteors.find((candidate) => !candidate.active);
      if (!meteor) {
        break;
      }
      const column = Math.floor((index + Math.random()) * band);
      meteor.x = left + column * brickWidth + brickWidth / 2;
      meteor.y = gameConfig.field.top;
      meteor.vy = fallSpeed;
      meteor.vx = Math.sign(middle - meteor.x) * driftSpeed;
      meteor.age = 0;
      meteor.burnTicks = 0;
      meteor.active = true;
      launched++;
    }

    return launched;
  }

  /**
   * One tick of falling. `bottomY` is the bottom of the grid the level loaded:
   * past it there is nothing left to drill, so the rock spends itself rather
   * than flying on to the paddle — nothing on the field below the wall is
   * METEOR's business.
   *
   * It is a rock, so being used up is not a switch: it goes on falling along the
   * line it was launched on and sheds the last of itself into its own trail,
   * shrinking as fast as the smoke behind it thickens. Armed as a one-shot,
   * because `y > bottomY` is true on every tick after the first — set it and
   * decrement it in the same breath and it re-arms forever and the rock never
   * dies.
   *
   * There is no side-wall exit to fold in here: the drift is always toward the
   * middle and the widest launch is 21 px from a 3 px gutter, so a rock has
   * never once left through a side wall and cannot start now.
   *
   * 3 px of fall against 12 px rows skips no row, so there is no sub-stepping
   * here: the caller samples the grid once per tick under each rock.
   */
  step(bottomY: number): void {
    const { burnoutTicks } = gameConfig.effects.meteor;

    for (const meteor of this.meteors) {
      if (!meteor.active) {
        continue;
      }
      meteor.age++;
      meteor.x += meteor.vx;
      meteor.y += meteor.vy;
      if (meteor.y > bottomY) {
        if (meteor.burnTicks === 0) {
          meteor.burnTicks = burnoutTicks;
        } else if (--meteor.burnTicks === 0) {
          meteor.active = false;
        }
      }
    }
  }

  reset(): void {
    for (const meteor of this.meteors) {
      meteor.burnTicks = 0;
      meteor.active = false;
    }
  }
}
