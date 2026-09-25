import { gameConfig } from "@core/config/GameConfig";
import { SPECIES } from "@entities/creatures/species";

import type { Creature, CreatureEffects, CreatureSight } from "@entities/creatures/Creature";
import type { CreatureKind, CreaturePin } from "@interfaces/creatures";

/**
 * How big this creature is *now* (SHA-241): its species' fixed pair, unless
 * the species overrides it. Every hitbox question in the game goes through
 * here, so a species whose size is a function of its state only has to say so
 * once.
 *
 * A `Species` already has `width` and `height` on it, which is why the
 * fallback is the species itself rather than an object built out of the two.
 */
export function creatureBox(creature: Creature): { width: number; height: number } {
  const species = SPECIES[creature.kind];
  return species.box?.(creature) ?? species;
}

/**
 * THE BESTIARY (SHA-207): the creatures an ordinary level puts on the field,
 * from level 1 — each level's own species, pinned in its data.
 *
 * Shaped like `Brood`, which stays the veils' own: the geometry and the clock
 * live here, and what a hit is *worth* is the game's. The species are the
 * difference — a beast has three forms and one walk, a creature has a species
 * with a walk, a hit rule and a sprite of its own, and this object never knows
 * which one it is stepping.
 */
export class Creatures {
  readonly creatures: Creature[] = [];

  get live(): boolean {
    return this.creatures.some((creature) => creature.alive);
  }

  load(pins: readonly CreaturePin[] | undefined): void {
    this.creatures.length = 0;
    for (const pin of pins ?? []) {
      this.add(pin.kind, pin.x, pin.y);
    }
  }

  /** One more, now — the console's, and the species that make others. */
  add(kind: CreatureKind, x: number, y: number): Creature {
    const species = SPECIES[kind];
    const creature: Creature = {
      kind,
      alive: true,
      x,
      y,
      vx: 0,
      vy: 0,
      hitPoints: species.hitPoints,
      flashTicks: 0,
      facing: 1,
      state: "",
      clock: 0,
      phase: 0,
      home: { x, y },
    };
    species.spawn(creature);
    this.creatures.push(creature);
    return creature;
  }

  reset(): void {
    this.creatures.length = 0;
  }

  step(sight: CreatureSight, effects: CreatureEffects): void {
    for (const creature of this.creatures) {
      if (!creature.alive) {
        continue;
      }
      creature.clock += 1;
      if (creature.flashTicks > 0) {
        creature.flashTicks -= 1;
      }
      SPECIES[creature.kind].step(creature, sight, effects);
    }
  }

  /**
   * The first live creature whose box overlaps this one, or null. A creature
   * still wearing its flash is skipped: the ball passes through the ones that
   * are not solid, and would otherwise strike the same moth every tick.
   *
   * `by` is which weapon is asking (SHA-242). It exists for the one species
   * the ball cannot touch at all — everything else answers both the same, and
   * `solid` has nothing to do with this question: it decides whether the ball
   * *bounces*, never whether it connects.
   */
  at(x: number, y: number, width: number, height: number, by: "ball" | "laser"): Creature | null {
    for (const creature of this.creatures) {
      if (!creature.alive || creature.flashTicks > 0) {
        continue;
      }
      const species = SPECIES[creature.kind];
      if (by === "ball" && species.shotOnly) {
        continue;
      }
      const box = creatureBox(creature);
      if (
        x < creature.x + box.width &&
        x + width > creature.x &&
        y < creature.y + box.height &&
        y + height > creature.y
      ) {
        return creature;
      }
    }
    return null;
  }

  /**
   * One strike: a hit point off, the flash on, and the species' own answer.
   *
   * `at` is where the hit landed (SHA-241), handed straight through to
   * `struck` — the hit point comes off first, so a species that answers by
   * *setting* its hit points, as a cut vine does, has the last word.
   */
  strike(
    creature: Creature,
    by: "ball" | "laser",
    effects: CreatureEffects,
    at: { x: number; y: number },
  ): { points: number; killed: boolean } {
    const species = SPECIES[creature.kind];
    creature.hitPoints -= 1;
    creature.flashTicks = gameConfig.creatures.flashTicks;
    const killed = species.struck(creature, by, effects, at) || creature.hitPoints <= 0;
    if (killed) {
      creature.alive = false;
    }
    return { points: species.points + (killed ? species.killPoints : 0), killed };
  }
}
