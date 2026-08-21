import { gameConfig } from "@core/config/GameConfig";

import type { BrickGrid } from "@entities/bricks/BrickGrid";
import type { Paddle } from "@entities/paddle/Paddle";
import type { BrickHit } from "@interfaces/types";

export interface Shot {
  x: number;
  y: number;
  active: boolean;
}

export class ShotPool {
  readonly shots: Shot[] = Array.from({ length: gameConfig.powerUps.maxShots }, () => ({
    x: 0,
    y: 0,
    active: false,
  }));

  fireFromPaddle(paddle: Paddle): boolean {
    const freeShots = this.shots.filter((shot) => !shot.active).slice(0, 2);
    freeShots.forEach((shot, index) => {
      shot.active = true;
      shot.x = index === 0 ? paddle.x + 5 : paddle.x + paddle.width - 8;
      shot.y = gameConfig.paddle.y - 9;
    });
    return freeShots.length > 0;
  }

  // `wallGhosted` is GHOST: the bricks are intangible, so a shot flies through
  // the whole grid and dies at the ceiling like any shot that missed.
  //
  // `piercing` is LANCE (LASER+PIERCE): the hit is reported but the shot lives
  // on, so one shot rips a whole column. A 12 px cell at `shotSpeed` is two or
  // three ticks deep, so a granite brick can take more than one hit from the
  // same shot on the way through — which is the combo, not a fault.
  step(grid: BrickGrid, wallGhosted: boolean, onBrickHit: (hit: BrickHit) => void, piercing = false): void {
    for (const shot of this.shots) {
      if (!shot.active) {
        continue;
      }

      shot.y -= gameConfig.powerUps.shotSpeed;
      if (shot.y < gameConfig.field.top) {
        shot.active = false;
        continue;
      }

      const hit = wallGhosted ? null : grid.cellAt(shot.x + 1, shot.y);
      if (hit) {
        onBrickHit(hit);
        if (!piercing) {
          shot.active = false;
        }
      }
    }
  }

  reset(): void {
    for (const shot of this.shots) {
      shot.active = false;
    }
  }
}
