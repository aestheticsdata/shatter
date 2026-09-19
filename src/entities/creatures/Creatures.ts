import { gameConfig } from "@core/config/GameConfig";
import { SPECIES } from "@entities/creatures/species";

import type { Creature, CreatureEffects, CreatureSight } from "@entities/creatures/Creature";
import type { CreatureKind, CreaturePin } from "@interfaces/creatures";

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
   * `solidOnly` is the ball's question; the laser asks about all of them.
   */
  at(x: number, y: number, width: number, height: number, solidOnly = false): Creature | null {
    for (const creature of this.creatures) {
      if (!creature.alive || creature.flashTicks > 0) {
        continue;
      }
      const species = SPECIES[creature.kind];
      if (solidOnly && !species.solid) {
        continue;
      }
      if (
        x < creature.x + species.width &&
        x + width > creature.x &&
        y < creature.y + species.height &&
        y + height > creature.y
      ) {
        return creature;
      }
    }
    return null;
  }

  /** One strike: a hit point off, the flash on, and the species' own answer. */
  strike(creature: Creature, by: "ball" | "laser", effects: CreatureEffects): { points: number; killed: boolean } {
    const species = SPECIES[creature.kind];
    creature.hitPoints -= 1;
    creature.flashTicks = gameConfig.creatures.flashTicks;
    const killed = species.struck(creature, by, effects) || creature.hitPoints <= 0;
    if (killed) {
      creature.alive = false;
    }
    return { points: species.points + (killed ? species.killPoints : 0), killed };
  }
}
