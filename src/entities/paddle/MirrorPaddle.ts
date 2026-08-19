import { gameConfig } from "@core/config/GameConfig";

import type { RectangleBounds } from "@interfaces/types";

/**
 * Where the MIRROR ghost sits for a given paddle position — the one definition
 * of it, shared by the bounce test and the renderer so the surface a ball hits
 * is the surface the player sees.
 *
 * The x is mirrored, not copied: moving right slides the ghost left. A ghost
 * parked directly above the paddle would turn every rally into vertical
 * ping-pong between two identical surfaces, which is the opposite of a capsule
 * you aim with.
 *
 * The mapping covers the paddle's clamp range exactly — `x = 3` puts the ghost's
 * right edge on 369, `x = 369 - width` puts its left edge on 3 — so the ghost
 * reaches both walls and never leaves the field.
 */
export function mirrorBounds(paddleX: number, width: number): RectangleBounds {
  const left = gameConfig.field.width - paddleX - width;
  return {
    left,
    right: left + width,
    top: gameConfig.powerUps.mirrorY,
    bottom: gameConfig.powerUps.mirrorY + gameConfig.paddle.height,
  };
}
