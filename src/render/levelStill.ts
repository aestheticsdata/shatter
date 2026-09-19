import { gameConfig } from "@core/config/GameConfig";
import { BrickGrid } from "@entities/bricks/BrickGrid";
import { cellSocket, cellWindow } from "@entities/effects/Observer";
import { EYE_LAYER, EYE_TINT } from "@interfaces/eye";
import { paintBackground, paintForeground } from "@render/backgrounds";
import { drawBrick, drawEye } from "@render/CanvasRenderer";

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
 * A veil's eye is the exception, and it is not one: the eye is not a game object
 * standing on the field, it is part of what the level *is* — a picture of THE
 * VEIL without it would be a picture of a wall on a starfield, which is a
 * different level. Drawn wide open and looking straight out, because a still has
 * no ball for it to follow.
 *
 * `variant` is the level's index — the same seed `levelIndexOf` hands the run,
 * so this is the art that level will actually show rather than another roll of
 * the same theme.
 */
export function paintLevelStill(ctx: CanvasRenderingContext2D, level: LevelDefinition, variant: number): void {
  const { width, height } = gameConfig.field;
  const socket = level.observer?.eye;
  paintBackground(ctx, level.background, variant, width, height, socket);
  if (socket && level.observer) {
    drawEye(ctx, socket, 1, { x: socket.x, y: socket.y }, level.observer.tint, 1);
  }
  // An ordinary level's eye, at rest (SHA-188): behind the wall it goes down
  // here, under the bricks; in front, after them. Same window and the same
  // alpha the arena gives it — a still of SUNRISE without its sun half under
  // the horizon would be a picture of another level.
  const eye = level.eye;
  // A brick-hosted eye rests in its first brick, seen through the brick's face.
  const host = eye?.cells?.[0];
  const placed = eye && {
    socket: host ? cellSocket(host, eye.hw, eye.hh) : { x: eye.x, y: eye.y, hw: eye.hw, hh: eye.hh },
    clip: host ? cellWindow(host) : eye.clip,
    layer: host ? EYE_LAYER.FRONT : (eye.layer ?? EYE_LAYER.BEHIND),
    opacity: eye.opacity ?? 1,
    tint: EYE_TINT.BLUE,
  };
  const drawPlaced = (): void => {
    if (!placed) {
      return;
    }
    ctx.save();
    if (placed.clip) {
      ctx.beginPath();
      ctx.rect(placed.clip.x, placed.clip.y, placed.clip.w, placed.clip.h);
      ctx.clip();
    }
    ctx.globalAlpha = placed.opacity;
    drawEye(ctx, placed.socket, 1, { x: placed.socket.x, y: placed.socket.y }, placed.tint, 1);
    ctx.restore();
  };
  if (placed?.layer === EYE_LAYER.BEHIND) {
    drawPlaced();
  }
  // What the theme stands in front of the eye — the horizon's ground and
  // dunes — over it and under the wall, exactly as the arena layers them.
  paintForeground(ctx, level.background, variant, width, height);

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
  if (placed?.layer === EYE_LAYER.FRONT) {
    drawPlaced();
  }
}
