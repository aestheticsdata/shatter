import { POWER_UP_NAMES } from "@core/config/GameConfig";

import type { PowerUpKind } from "@interfaces/types";

// W (WALL) is a one-shot charge owned by the game, not a timed effect, and
// N (NUKE) is driven by the Detonation. S (SWARM) is instantaneous like M:
// its timer only keeps the POWER inset label lit.
const TIMED_KINDS: readonly PowerUpKind[] = ["E", "M", "L", "P", "B", "T", "X", "J", "S"];

export class PowerUpTimers {
  private readonly ticksLeft: Record<PowerUpKind, number> = {
    E: 0,
    M: 0,
    L: 0,
    P: 0,
    B: 0,
    W: 0,
    T: 0,
    X: 0,
    J: 0,
    N: 0,
    S: 0,
  };

  isActive(kind: PowerUpKind): boolean {
    return this.ticksLeft[kind] > 0;
  }

  activate(kind: PowerUpKind, durationTicks: number): void {
    this.ticksLeft[kind] = durationTicks;
  }

  deactivate(kind: PowerUpKind): void {
    this.ticksLeft[kind] = 0;
  }

  tick(): PowerUpKind[] {
    const expired: PowerUpKind[] = [];
    for (const kind of TIMED_KINDS) {
      if (this.ticksLeft[kind] > 0 && --this.ticksLeft[kind] === 0) {
        expired.push(kind);
      }
    }
    return expired;
  }

  reset(): void {
    for (const kind of TIMED_KINDS) {
      this.ticksLeft[kind] = 0;
    }
  }

  activeNames(): string[] {
    return TIMED_KINDS.filter((kind) => this.isActive(kind)).map((kind) => POWER_UP_NAMES[kind]);
  }
}
