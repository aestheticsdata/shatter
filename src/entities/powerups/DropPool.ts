import { gameConfig } from "@core/config/GameConfig";

import type { PowerUpKind, RectangleBounds } from "@interfaces/types";

const DROP_WIDTH = 20;
const DROP_HEIGHT = 8;
const DROP_KINDS = Object.keys(gameConfig.powerUps.dropWeights) as PowerUpKind[];

function rollDropKind(exclude?: PowerUpKind): PowerUpKind {
  const kinds = DROP_KINDS.filter((kind) => kind !== exclude);
  const weights = gameConfig.powerUps.dropWeights;
  const total = kinds.reduce((sum, kind) => sum + weights[kind], 0);
  let roll = Math.random() * total;
  for (const kind of kinds) {
    roll -= weights[kind];
    if (roll <= 0) {
      return kind;
    }
  }
  return kinds[kinds.length - 1];
}

export interface Drop {
  x: number;
  y: number;
  kind: PowerUpKind;
  active: boolean;
}

export class DropPool {
  readonly drops: Drop[] = Array.from({ length: gameConfig.powerUps.maxDrops }, () => ({
    x: 0,
    y: 0,
    kind: "E",
    active: false,
  }));

  trySpawn(brickLeft: number, brickTop: number): boolean {
    const drop = this.drops.find((candidate) => !candidate.active);
    if (!drop) {
      return false;
    }

    drop.kind = rollDropKind();
    drop.x = brickLeft + 5;
    drop.y = brickTop;
    drop.active = true;
    return true;
  }

  // RAIN: scatter capsules across the top of the field. Kinds are re-rolled
  // without R itself, so one rain can never chain into the next.
  rainSpawn(count: number): number {
    const { left, right, top } = gameConfig.field;
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const drop = this.drops.find((candidate) => !candidate.active);
      if (!drop) {
        break;
      }
      drop.kind = rollDropKind("R");
      drop.x = left + ((i + 0.5) * (right - left)) / count - DROP_WIDTH / 2 + (Math.random() - 0.5) * 16;
      drop.y = top + 8;
      drop.active = true;
      spawned++;
    }
    return spawned;
  }

  // onCatch returns whether the capsule was consumed; a refused drop stays live
  // (e.g. a NUKE earlier in this same tick froze the game) so it visibly freezes
  // with the rest of the field instead of silently vanishing into the paddle.
  step(paddleBounds: RectangleBounds, onCatch: (kind: PowerUpKind) => boolean): void {
    for (const drop of this.drops) {
      if (!drop.active) {
        continue;
      }

      drop.y += gameConfig.powerUps.dropFallSpeed;
      if (drop.y > gameConfig.field.height) {
        drop.active = false;
        continue;
      }

      const reachesPaddleLine = drop.y + DROP_HEIGHT >= paddleBounds.top && drop.y <= paddleBounds.bottom;
      const overlapsPaddle = drop.x + DROP_WIDTH > paddleBounds.left && drop.x < paddleBounds.right;
      if (reachesPaddleLine && overlapsPaddle && onCatch(drop.kind)) {
        drop.active = false;
      }
    }
  }

  reset(): void {
    for (const drop of this.drops) {
      drop.active = false;
    }
  }
}
