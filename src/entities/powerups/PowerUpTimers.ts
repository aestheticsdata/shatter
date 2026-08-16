import { POWER_UP_NAMES } from "@core/config/GameConfig";

import type { PowerUpKind } from "@interfaces/types";

const ALL_KINDS: readonly PowerUpKind[] = ["E", "M", "L", "P"];

export class PowerUpTimers {
  private readonly ticksLeft: Record<PowerUpKind, number> = { E: 0, M: 0, L: 0, P: 0 };

  isActive(kind: PowerUpKind): boolean {
    return this.ticksLeft[kind] > 0;
  }

  activate(kind: PowerUpKind, durationTicks: number): void {
    this.ticksLeft[kind] = durationTicks;
  }

  tick(): PowerUpKind[] {
    const expired: PowerUpKind[] = [];
    for (const kind of ALL_KINDS) {
      if (this.ticksLeft[kind] > 0 && --this.ticksLeft[kind] === 0) {
        expired.push(kind);
      }
    }
    return expired;
  }

  reset(): void {
    for (const kind of ALL_KINDS) {
      this.ticksLeft[kind] = 0;
    }
  }

  activeLabel(): string {
    return ALL_KINDS.filter((kind) => this.isActive(kind))
      .map((kind) => POWER_UP_NAMES[kind])
      .join(" ");
  }
}
