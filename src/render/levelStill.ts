import { gameConfig } from "@core/config/GameConfig";
import { BrickGrid } from "@entities/bricks/BrickGrid";
import { paintBackground } from "@render/backgrounds";
import { drawBrick } from "@render/CanvasRenderer";

import type { LevelDefinition } from "@interfaces/types";

/**
 * One level as a still: its theme, with its wall at full health on top.
 *
 * The field at 1×, painted by the two functions the arena itself uses — a
 * retouched brick colour or a repainted theme reaches the level gallery with no
 * second edit, and there is no exported image anywhere to go stale.
 *
 * Nothing else of the game is in it. No paddle, no ball, no capsules: a level
 * before anyone has played it is a layout and its field art.
 *
 * `variant` is the level's index — the same seed `levelIndexOf` hands the run,
 * so this is the art that level will actually show rather than another roll of
 * the same theme.
 */
export function paintLevelStill(ctx: CanvasRenderingContext2D, level: LevelDefinition, variant: number): void {
  const { width, height } = gameConfig.field;
  paintBackground(ctx, level.background, variant, width, height);

  // A wall built for this one paint. The grid is the only place that knows how
  // an ASCII row becomes bricks, and nothing can fall out of a still, so every
  // brick is seeded with no capsule at all.
  const grid = new BrickGrid();
  grid.load(level, () => null);

  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  grid.rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell) {
        drawBrick(ctx, left + columnIndex * brickWidth, top + rowIndex * brickHeight, cell, 1);
      }
    });
  });
}
