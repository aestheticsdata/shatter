import { BRICK_HIT_POINTS, BRICK_POINTS, gameConfig } from "@core/config/GameConfig";

import type { BrickCell, BrickHit, BrickKind, LevelDefinition, PowerUpKind } from "@interfaces/types";

function isBrickKind(char: string): char is BrickKind {
  return char in BRICK_POINTS;
}

export class BrickGrid {
  // How far above its own index row the wall is being painted this frame, fed
  // from `Quake.dropOffset` every tick. Zero except while QUAKE's wall is still
  // falling; see `cellAt`, the only thing that reads it.
  topOffset = 0;
  private grid: Array<Array<BrickCell | null>> = [];
  private remainingCount = 0;

  get remaining(): number {
    return this.remainingCount;
  }

  get rows(): ReadonlyArray<ReadonlyArray<BrickCell | null>> {
    return this.grid;
  }

  /**
   * Build the wall, and seed each brick with the capsule it is holding.
   *
   * `rollCapsule` is asked once per brick and owns the odds — the grid only
   * stores what it says. Rolling at build time rather than at the kill is what
   * lets XRAY show the wall's real contents; the drop rate is untouched, since
   * a brick that is never killed directly never drops either way.
   */
  load(level: LevelDefinition, rollCapsule: () => PowerUpKind | null): void {
    this.grid = [];
    this.remainingCount = 0;
    this.topOffset = 0;

    for (const row of level.rows) {
      const line: Array<BrickCell | null> = [];
      for (let column = 0; column < gameConfig.grid.columns; column++) {
        const char = row[column] ?? ".";
        if (!isBrickKind(char)) {
          line.push(null);
          continue;
        }
        line.push({
          kind: char,
          hitPoints: BRICK_HIT_POINTS[char],
          points: BRICK_POINTS[char],
          hurt: false,
          capsule: rollCapsule(),
        });
        this.remainingCount++;
      }
      this.grid.push(line);
    }
  }

  // Re-roll every brick still standing. The dev console's `bonus` command changes
  // the drop rate mid-level, and the wall was seeded at load: without this,
  // `bonus 1` would only take effect on the next level.
  reseedCapsules(rollCapsule: () => PowerUpKind | null): void {
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell) {
          cell.capsule = rollCapsule();
        }
      }
    }
  }

  /**
   * The pixel-to-cell lookup, and the whole of the wall's pixel-space
   * collision: balls come through `findBallOverlap`, laser bolts through
   * `ShotPool`, meteors straight in. Every other caller — homing, BLAST and
   * CHAIN's neighbours, the critter — is already index-space and does not care
   * where the wall is being painted.
   *
   * Which is why `topOffset` belongs here and nowhere else. It is how far above
   * its index the wall is drawn this frame, so the hitbox follows the paint
   * instead of sitting a row below it while QUAKE's wall is still falling.
   */
  cellAt(x: number, y: number): BrickHit | null {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    return this.hitAtCell(Math.floor((y - top + this.topOffset) / brickHeight), Math.floor((x - left) / brickWidth));
  }

  hitAtCell(row: number, column: number): BrickHit | null {
    if (row < 0 || column < 0 || column >= gameConfig.grid.columns || row >= this.grid.length) {
      return null;
    }

    const cell = this.grid[row][column];
    return cell ? { cell, row, column } : null;
  }

  findBallOverlap(ballX: number, ballY: number): BrickHit | null {
    const size = gameConfig.ball.size;
    const inset = gameConfig.ball.collisionInset;
    const corners: Array<[number, number]> = [
      [ballX + inset, ballY + inset],
      [ballX + size - inset, ballY + inset],
      [ballX + inset, ballY + size - inset],
      [ballX + size - inset, ballY + size - inset],
    ];

    for (const [x, y] of corners) {
      const hit = this.cellAt(x, y);
      if (hit) {
        return hit;
      }
    }

    return null;
  }

  damage(hit: BrickHit): boolean {
    hit.cell.hitPoints--;
    if (hit.cell.hitPoints > 0) {
      hit.cell.hurt = true;
      return false;
    }

    this.grid[hit.row][hit.column] = null;
    this.remainingCount--;
    return true;
  }

  // WARP easter egg: empty the field outright — no points, no debris, no sound.
  // Not a gameplay kill, so it deliberately shares nothing with damage/destroy.
  wipe(): void {
    for (const row of this.grid) {
      row.fill(null);
    }
    this.remainingCount = 0;
  }

  /**
   * QUAKE: every row slides down one and a fresh empty row takes the top.
   *
   * Cells move by reference, so hit points, damage and the remaining count all
   * travel down with them. The bottom row of the array is discarded — QUAKE
   * always vaporises the bottom-most live row first, so in play it is empty by
   * the time this runs, but anything found there is counted out rather than
   * silently dropped: a stale `remaining` would leave a level that can never
   * clear.
   */
  shiftDown(): void {
    const last = this.grid.length - 1;
    if (last < 0) {
      return;
    }
    for (const cell of this.grid[last]) {
      if (cell) {
        this.remainingCount--;
      }
    }
    for (let row = last; row > 0; row--) {
      this.grid[row] = this.grid[row - 1];
    }
    this.grid[0] = Array.from({ length: gameConfig.grid.columns }, () => null);
  }

  // NUKE kills: remove the cell outright, regardless of remaining hit points.
  destroy(hit: BrickHit): void {
    if (this.grid[hit.row][hit.column] !== null) {
      this.grid[hit.row][hit.column] = null;
      this.remainingCount--;
    }
  }
}
