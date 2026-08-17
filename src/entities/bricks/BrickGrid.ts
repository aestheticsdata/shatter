import { BRICK_HIT_POINTS, BRICK_POINTS, gameConfig } from "@core/config/GameConfig";

import type { BrickCell, BrickHit, BrickKind, LevelDefinition } from "@interfaces/types";

function isBrickKind(char: string): char is BrickKind {
  return char in BRICK_POINTS;
}

export class BrickGrid {
  private grid: Array<Array<BrickCell | null>> = [];
  private remainingCount = 0;

  get remaining(): number {
    return this.remainingCount;
  }

  get rows(): ReadonlyArray<ReadonlyArray<BrickCell | null>> {
    return this.grid;
  }

  load(level: LevelDefinition): void {
    this.grid = [];
    this.remainingCount = 0;

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
        });
        this.remainingCount++;
      }
      this.grid.push(line);
    }
  }

  cellAt(x: number, y: number): BrickHit | null {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    return this.hitAtCell(Math.floor((y - top) / brickHeight), Math.floor((x - left) / brickWidth));
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

  // NUKE kills: remove the cell outright, regardless of remaining hit points.
  destroy(hit: BrickHit): void {
    if (this.grid[hit.row][hit.column] !== null) {
      this.grid[hit.row][hit.column] = null;
      this.remainingCount--;
    }
  }
}
