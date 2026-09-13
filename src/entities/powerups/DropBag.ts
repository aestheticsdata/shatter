import { POWER_UP_DROP_TICKETS, POWER_UP_IDS } from "@core/config/powerUps";

import type { PowerUpKind } from "@interfaces/types";

const NO_EXCLUSIONS: readonly PowerUpKind[] = [];

/**
 * Which capsule the wall hands over next — drawn from a shuffled bag rather than
 * rolled against weights.
 *
 * One pass is 62 tickets (see `TIER_TICKETS`): every capsule in the roster, twice
 * for a common — and for DEMAKE and GIANT, which keep a common's count for the
 * reason `POWER_UP_DROP_TICKETS` gives — once for everything else, in a random
 * order. Drawing
 * takes a ticket out. When the bag runs dry a fresh pass is shuffled in behind
 * whatever is left, so the guarantee the whole thing exists for holds by
 * construction — **no capsule can be absent for longer than two passes**, which
 * at about 12 capsules seeded per level is roughly ten levels in the worst case
 * and five on average.
 *
 * The weighted roll this replaced could not promise that at any weight. Its
 * rarest capsules averaged one appearance per 94 drops with nothing bounding the
 * tail: a 65 % chance that at least one of the twelve rares went unseen across 20
 * levels of play. `TIER_TICKETS` has the full arithmetic and the three per-row
 * exceptions that were tried against it first.
 *
 * The bag is the run's, not the level's. A pass is meant to span five levels, so
 * reshuffling at every wall would be the old problem wearing a bag's clothes —
 * each level would draw its first twelve tickets out of a full roster and the
 * back half of the pass would never be reached.
 */
export class DropBag {
  // Tickets still to come, shuffled. `draw` splices out of this; the pass is
  // spent when it empties. Never read for anything but a draw and the DEV check.
  private tickets: PowerUpKind[] = [];

  constructor() {
    this.refill();
  }

  /**
   * What is left of the pass, for `pnpm run check:drops` to assert against. The
   * game itself has no business reading it: a player-facing tell for what is
   * still in the bag would turn a capsule into a countdown.
   */
  get remaining(): readonly PowerUpKind[] {
    return this.tickets;
  }

  /**
   * A new run starts a new pass. Without this a run inheriting the tail of the
   * last one would open on a lopsided first level — the far end of a spent bag
   * is whatever the previous player happened not to draw — for a reason nobody
   * could see from the field.
   */
  reset(): void {
    this.tickets = [];
    this.refill();
  }

  /**
   * The next capsule, honouring `exclude`.
   *
   * **A barred ticket is skipped, never discarded.** It stays where it is and
   * comes out of the bag the moment it is allowed again, which is the difference
   * between an exclusion and a deletion: level 1 bars DEMAKE, and a draw that
   * threw its ticket away would quietly spend the one copy the pass had of the
   * very capsule this class was written because nobody ever saw.
   *
   * Scanning for the first eligible ticket is what makes that free. The list is
   * already shuffled, so the front of it is as random as any other position — the
   * scan is not a preference, it is just where the next ticket happens to be.
   */
  draw(exclude: readonly PowerUpKind[] = NO_EXCLUSIONS): PowerUpKind {
    const ticket = this.take(exclude);
    if (ticket !== null) {
      return ticket;
    }

    // Nothing left this draw may have: the pass is spent apart from tickets the
    // caller has barred. Queue a fresh pass *behind* them rather than replacing
    // them — they are owed a draw and will get one as soon as the bar lifts.
    this.refill();
    const afterRefill = this.take(exclude);
    if (afterRefill !== null) {
      return afterRefill;
    }

    // Only reachable if a caller bars the entire roster, which would be a bug in
    // the caller and not something to take the run down over. Answer with the
    // first kind it left open, and with `POWER_UP_IDS[0]` if it left none.
    return POWER_UP_IDS.find((kind) => !exclude.includes(kind)) ?? POWER_UP_IDS[0];
  }

  // The first ticket `exclude` allows, spliced out, or `null` if the bag holds
  // nothing eligible.
  private take(exclude: readonly PowerUpKind[]): PowerUpKind | null {
    const index =
      exclude.length === 0
        ? this.tickets.length > 0
          ? 0
          : -1
        : this.tickets.findIndex((kind) => !exclude.includes(kind));
    return index < 0 ? null : this.tickets.splice(index, 1)[0];
  }

  // One full pass, shuffled, appended. Fisher-Yates over the built list rather
  // than a sort with a random comparator: the latter is biased and this is the
  // one place in the game where an even spread is the entire point.
  private refill(): void {
    const pass: PowerUpKind[] = [];
    for (const kind of POWER_UP_IDS) {
      for (let ticket = 0; ticket < POWER_UP_DROP_TICKETS[kind]; ticket++) {
        pass.push(kind);
      }
    }
    for (let index = pass.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [pass[index], pass[swap]] = [pass[swap], pass[index]];
    }
    this.tickets.push(...pass);
  }
}
