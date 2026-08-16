import type { RectangleBounds, Vector2D } from "@interfaces/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function relativePaddleHit(ballCenterX: number, paddleBounds: RectangleBounds): number {
  const paddleCenterX = (paddleBounds.left + paddleBounds.right) / 2;
  const paddleHalfWidth = (paddleBounds.right - paddleBounds.left) / 2;
  return clamp((ballCenterX - paddleCenterX) / paddleHalfWidth, -1, 1);
}

export function computePaddleBounceVelocity(relativeHit: number, speed: number, maxBounceAngleRad: number): Vector2D {
  const bounceAngleRad = relativeHit * maxBounceAngleRad;

  return {
    x: speed * Math.sin(bounceAngleRad),
    y: -Math.abs(speed * Math.cos(bounceAngleRad)),
  };
}
