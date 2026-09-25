import { gameConfig } from "@core/config/GameConfig";
import { BrickGrid } from "@entities/bricks/BrickGrid";
import { cellSocket, cellWindow } from "@entities/effects/Observer";
import { FINE } from "@interfaces/art";
import { EYE_LAYER, EYE_TINT } from "@interfaces/eye";
import { dialTonesFor, paintBackground, paintForeground } from "@render/backgrounds";
import { chartCentre, drawBrick, drawEye, drawZodiac } from "@render/CanvasRenderer";

import type { LevelDefinition } from "@interfaces/types";

/**
 * One level as a still: its theme, with its wall at full health on top.
 *
 * The field at its own size, painted by the two functions the arena itself uses
 * — a retouched brick colour or a repainted theme reaches the level gallery
 * with no second edit, and there is no exported image anywhere to go stale.
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
 *
 * `hd` paints the same still on the fine grid (SHA-224), into a canvas `FINE`
 * times the field — the gallery's downscale to a tile is smoothed, so a finer
 * field photographs better rather than noisier. The eye goes with it (SHA-228),
 * which is what keeps the still a picture of the level: forty-three tiles on
 * one screen is the cheapest whole-inventory check the almond has, and it is
 * only worth looking at if the eye in the tile is the eye in the arena.
 */
export function paintLevelStill(
  ctx: CanvasRenderingContext2D,
  level: LevelDefinition,
  variant: number,
  hd = false,
): void {
  const { width, height } = gameConfig.field;
  const scale = hd ? FINE : 1;
  const socket = level.observer?.eye;
  paintBackground(ctx, level.background, variant, width, height, hd);
  // The dial at rest, as the arena's first frame has it: round a veil's socket,
  // at the field's middle on every other level (SHA-212). Empty — the chart on
  // it is the run's, and a still is a level nobody has played.
  const dial = chartCentre(socket);
  drawZodiac(ctx, dial.x, dial.y, gameConfig.observer.ring.field, 0, scale, false, dialTonesFor(level.background), hd);
  if (socket && level.observer) {
    drawEye(ctx, socket, 1, { x: socket.x, y: socket.y }, level.observer.tint, scale, { hd });
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
      const { x, y, w, h } = placed.clip;
      ctx.beginPath();
      ctx.rect(x * scale, y * scale, w * scale, h * scale);
      ctx.clip();
    }
    ctx.globalAlpha = placed.opacity;
    drawEye(ctx, placed.socket, 1, { x: placed.socket.x, y: placed.socket.y }, placed.tint, scale, { hd });
    ctx.restore();
    // MIRROR's reflection (SHA-189), outside the window: it is on the other
    // side of the level's line, where the window is not.
    const mirror = eye?.reflection;
    if (mirror) {
      const image = { ...placed.socket, x: 2 * mirror.axis - placed.socket.x };
      ctx.save();
      ctx.globalAlpha = mirror.opacity;
      drawEye(ctx, image, 1, { x: image.x, y: image.y }, placed.tint, scale, { hd });
      ctx.restore();
    }
  };
  if (placed?.layer === EYE_LAYER.BEHIND) {
    drawPlaced();
  }
  // What the theme stands in front of the eye — the horizon's ground and
  // dunes — over it and under the wall, exactly as the arena layers them.
  paintForeground(ctx, level.background, variant, width, height, hd);

  // A wall built for this one paint. The grid is the only place that knows how
  // an ASCII row becomes bricks, and nothing can fall out of a still, so every
  // brick is seeded with no capsule at all.
  const grid = new BrickGrid();
  grid.load(level, () => null);

  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  grid.rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell) {
        drawBrick(ctx, left + columnIndex * brickWidth, top + rowIndex * brickHeight, cell, scale, { hd });
      }
    });
  });
  if (placed?.layer === EYE_LAYER.FRONT) {
    drawPlaced();
  }
}
