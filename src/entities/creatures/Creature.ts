import type { CreatureKind } from "@interfaces/creatures";
import type { ChunkMaterial } from "@interfaces/types";

/** The renderer's brush: a run of pixels in field coordinates. */
export type Pixel = (x: number, y: number, width: number, height: number, color: string) => void;

/**
 * One live thing on the field (SHA-207). Position is the sprite's top-left in
 * field pixels, like a beast's; the rest is the species' to read and write.
 */
export interface Creature {
  kind: CreatureKind;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hitPoints: number;
  /** Ticks of white left from the last strike; no hit lands while it is on. */
  flashTicks: number;
  facing: 1 | -1;
  /** The species' own machine: one of its state names, and ticks in it. */
  state: string;
  clock: number;
  /** A number the species owns — a moth's angle on its loop, a frog's leap. */
  phase: number;
  /** Where the level put it: a frog's home brick, a spider's ceiling spot. */
  home: { x: number; y: number };
}

/**
 * What a species reads off the level each tick. The game builds it; a species
 * never touches the grid, the balls or the deck.
 */
export interface CreatureSight {
  /** The nearest ball in flight — centre and velocity — or null on a serve. */
  ball: { x: number; y: number; vx: number; vy: number } | null;
  deck: { left: number; right: number; y: number };
  /** How many rows the wall was built with; columns are always `gameConfig.grid.columns`. */
  wallRows: number;
  standing(column: number, row: number): boolean;
  /** The Observer's socket centre, or null on a level with no eye. */
  eye: { x: number; y: number } | null;
}

/**
 * What a species can ask the game to do — the only way a creature acts on the
 * field. One verb per thing, added with the species that needs it.
 */
export interface CreatureEffects {
  /** A rolled capsule falls from here (MOTH). */
  dropCapsule(x: number, y: number): void;
  /** One hit point back on that brick, up to its own kind's (SNAIL). Nothing on an empty cell. */
  mortar(column: number, row: number): void;
  /** A catch-pop line: the house's idiom for "this just happened". */
  pop(x: number, y: number, label: string, malus: boolean): void;
  /** The deck turns to stone for THE IRIS's span — a boss's sting (SPIDER QUEEN). */
  petrifyDeck(): void;
  burst(x: number, y: number, material: ChunkMaterial): void;
}

/**
 * A species: the registry entry a `Creature` is an instance of. Sprite,
 * palettes, numbers and the four verbs. Numbers come from `gameConfig.creatures`
 * so every one of them is a plain knob.
 */
export interface Species {
  kind: CreatureKind;
  width: number;
  height: number;
  hitPoints: number;
  /** Per hit. */
  points: number;
  /** On top, on the hit that kills. */
  killPoints: number;
  /**
   * Solid creatures are shelves the ball bounces off, vertically, like a
   * beast; the rest the ball passes through and still strikes.
   */
  solid: boolean;
  /** ASCII bitmaps, one character per pixel, `.` for nothing. */
  frames: readonly (readonly string[])[];
  frameTicks: number;
  palette: Readonly<Record<string, string>>;
  /** Body to ground, outline and detail to ink: what survives the tube. */
  demade: Readonly<Record<string, string>>;
  /** The character the strike flash cools through. */
  outline: string;
  spawn(creature: Creature): void;
  step(creature: Creature, sight: CreatureSight, effects: CreatureEffects): void;
  /** A hit landed; the hit point and the flash are already taken. True when it dies of this. */
  struck(creature: Creature, by: "ball" | "laser", effects: CreatureEffects): boolean;
  /** Extra drawing under the bitmap — a spider's thread, a snail's trail. Ink-only on the tube. */
  decorate?(pixel: Pixel, creature: Creature, frame: number, demade: boolean): void;
}
