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

/**
 * How wide the ghost is right now, for a deck of `width` at `form` resolved.
 *
 * Lives beside `mirrorBounds` and for the same reason: the bounce test and the
 * renderer both call it, so the surface the ball meets is the surface drawn. A
 * span that only the renderer knew about would put a wide invisible surface
 * behind a narrow visible one, at the far end of the field from where the
 * player is looking.
 *
 * Even, because the ghost is centred: an odd span stands the reflection's own
 * middle on a half pixel. Floored at `mirrorSeedSpan` so the line the ghost
 * begins and ends as is something rather than nothing — and so the retreat has
 * a mark to leave behind it.
 */
export function mirrorSpan(width: number, form: number): number {
  return Math.max(gameConfig.effects.mirrorSeedSpan, 2 * Math.round((width * form) / 2));
}

/**
 * The ghost's hole: SPLIT's gap shown at the same fraction as the span.
 *
 * Beside `mirrorSpan` and shared the same way. `splitSegments` cuts whatever gap
 * it is handed out of whatever span it is handed, so a fifth-formed ghost over a
 * split deck asked to give up the full 26 px comes back with halves of −6 — and
 * the renderer would then draw something else again. One function, two callers,
 * no disagreement.
 *
 * Even, like the span, so both of the ghost's halves land on whole pixels.
 */
export function mirrorGap(deckGap: number, span: number, width: number): number {
  return 2 * Math.round((deckGap * span) / (width * 2));
}
