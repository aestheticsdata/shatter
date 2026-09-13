import type { WallSheet } from "@entities/bricks/BrickGrid";
import type { JellySheet } from "@entities/effects/JellySheet";
import type { Slump } from "@entities/effects/Slump";

/**
 * The two capsules that move a brick out of its own row, added together.
 *
 * The wall holds one displacement and asks it one question, which is the whole
 * point of `WallSheet`: the grid knows where its bricks are and never which
 * capsule put them there. This is what keeps that true once there are two of
 * them — JELLY's ripple and SLUMP's fall are independent numbers about the same
 * cell, and a wall that is both jellied and slumped is a sagging pile that
 * wobbles, which is the right answer and falls out of a plus sign.
 *
 * `reach` is the sum rather than the larger, because it is a bound and not a
 * measurement: the grid searches the rows within it, and a band that could miss
 * a brick is a ball through a wall.
 */
export class WallOffsets implements WallSheet {
  constructor(
    private readonly jelly: JellySheet,
    private readonly slump: Slump,
  ) {}

  get rippling(): boolean {
    return this.jelly.rippling || this.slump.slumped;
  }

  get reach(): number {
    return this.jelly.reach + this.slump.reach;
  }

  offsetAt(row: number, column: number): number {
    return this.jelly.offsetAt(row, column) + this.slump.offsetAt(row, column);
  }
}
