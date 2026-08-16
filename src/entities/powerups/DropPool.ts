import { gameConfig } from "@core/config/GameConfig";

import type { PowerUpKind, RectangleBounds } from "@interfaces/types";

const DROP_WIDTH = 20;
const DROP_HEIGHT = 8;
const DROP_KINDS: readonly PowerUpKind[] = ["E", "M", "L", "P"];

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

  trySpawn(brickLeft: number, brickTop: number): void {
    const drop = this.drops.find((candidate) => !candidate.active);
    if (!drop) {
      return;
    }

    drop.kind = DROP_KINDS[Math.floor(Math.random() * DROP_KINDS.length)];
    drop.x = brickLeft + 5;
    drop.y = brickTop;
    drop.active = true;
  }

  step(paddleBounds: RectangleBounds, onCatch: (kind: PowerUpKind) => void): void {
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
      if (reachesPaddleLine && overlapsPaddle) {
        drop.active = false;
        onCatch(drop.kind);
      }
    }
  }

  reset(): void {
    for (const drop of this.drops) {
      drop.active = false;
    }
  }
}
