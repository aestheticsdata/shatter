import { byId, TIMED_KINDS } from "@core/config/powerUps";

import type { PowerUpKind } from "@interfaces/types";

// Which capsules count down is the `timed` flag on each roster entry — see the
// note there for why WALL, NUKE and the instantaneous capsules are left out.
export class PowerUpTimers {
  // A slot per capsule, timed or not: `activate`/`isActive` are called with any
  // kind, and only the countdown below is scoped to the timed ones.
  private readonly ticksLeft: Record<PowerUpKind, number> = byId(() => 0);

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

  // Roster order, which is what the POWER inset lists live effects in. Names
  // and glyphs are the caller's business: MULTI's label carries a tier the
  // timers know nothing about.
  activeKinds(): PowerUpKind[] {
    return TIMED_KINDS.filter((kind) => this.isActive(kind));
  }
}
