import type { BrickKind } from "@core/config/bricks";
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
  /**
   * Every capsule in the air, as its centre (SHA-244).
   *
   * The whole list rather than the nearest one, which is the shape `ball` takes:
   * "nearest" there means nearest to the deck, because that is the ball the
   * player is playing — while a crab wants the one nearest *itself*, and a
   * second species would want a third thing. Sight hands over the field's facts
   * and lets a species do its own choosing, exactly as `standing` does.
   */
  drops: readonly { x: number; y: number }[];
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
  /**
   * One hit point *off* that brick, `mortar` backwards (WOODPECKER). Nothing
   * on an empty cell. A brick opened this way pays no score — the bird is an
   * ally and not a source of income — but still gives up a seeded capsule and
   * still takes its TWIN partner, because both of those are promises the level
   * and a capsule made to the player rather than anything the bird earned.
   */
  peck(column: number, row: number): void;
  /** A catch-pop line: the house's idiom for "this just happened". */
  pop(x: number, y: number, label: string, malus: boolean): void;
  /** The deck turns to stone for THE IRIS's span — a boss's sting (SPIDER QUEEN). */
  petrifyDeck(): void;
  /**
   * The deck goes numb for this long — half speed, not frozen (JELLYFISH).
   * Deliberately not `petrifyDeck`: stone cannot move at all and is THE
   * IRIS's; numb is slow. Longer of the two if it is already numb.
   */
  stingDeck(ticks: number): void;
  burst(x: number, y: number, material: ChunkMaterial): void;
  /** The lights go out for this long — BLACKOUT's pools (MOTH MOTHER). Longer of the two if already dark. */
  dust(ticks: number): void;
  /**
   * And the lights come back for this long — FIREFLY (SHA-243). `dust`
   * backwards: it holds the dark off whatever is making it, the capsule or
   * the mother, and lets it back in through the same iris when it runs out.
   * Longer of the two if a light is already up.
   */
  glow(ticks: number): void;
  /** Every ball in this box is sent off at this velocity. True when one was (FROG KING's tongue). */
  kick(x: number, y: number, width: number, height: number, vx: number, vy: number): boolean;
  /**
   * Every capsule in this box is taken out of the air, and how many is
   * returned (CRAB). Shaped like `kick`, which is this framework's precedent
   * for a box query that acts rather than reports.
   *
   * A taken capsule is simply gone — no score, no debris, no catch. What
   * becomes of it is the thief's business, and CRAB's answer is that it pays
   * them back through `dropCapsule` when it is hit.
   */
  snatch(x: number, y: number, width: number, height: number): number;
  /** A brick of this kind in that empty cell, at its kind's full hit points (SNAIL ELDER). */
  lay(column: number, row: number, kind: BrickKind): void;
  /** The field rattles for this long — a landing (FROG KING). */
  rattle(ticks: number): void;
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
  /**
   * Only a bolt can touch it (SHA-242): the ball does not bounce off it, does
   * not strike it and does not know it is there.
   *
   * **This is not `solid: false`**, which five other species already use and
   * which means only that the ball goes *through* them on its way to striking
   * them. A creature the ball cannot hit at all is a different fact and gets a
   * different word, named for the one weapon that reaches it.
   *
   * Optional rather than a second flag beside `solid`, because `solid` is a
   * choice every species makes and this is one WISP makes: twelve `false`s
   * that said nothing about their creature would be the cost of asking.
   */
  shotOnly?: boolean;
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
  /**
   * A hit landed; the hit point and the flash are already taken. True when it
   * dies of this.
   *
   * `at` is the field point the hit came in on (SHA-241) — the ball's centre
   * or the bolt's tip. Eight species have no use for it and simply do not
   * declare it; VINE is the one that does, because *where* you cut a vine is
   * the whole of what a vine is.
   */
  struck(creature: Creature, by: "ball" | "laser", effects: CreatureEffects, at: { x: number; y: number }): boolean;
  /**
   * The hitbox, when it is not `width` x `height` (SHA-241). A vine is one
   * segment when it sprouts and a dozen when it reaches the wall, and a fixed
   * box would mean a seedling the width of the column it will become. Read
   * through `creatureBox`, never off `width`/`height` directly, anywhere a
   * live creature is in hand — the sprite is still the sprite, so the *draw*
   * has no business here and `drawCreature` never asks.
   */
  box?(creature: Creature): { width: number; height: number };
  /**
   * A touch at this field point, before it is a hit: the label the body
   * refuses it with — a shell, a hide — or null to take it (SHA-213). A
   * refused touch still bounces the ball; it takes no hit point and no flash.
   */
  armour?(creature: Creature, x: number, y: number): string | null;
  /**
   * Extra drawing under the bitmap — a spider's thread, a snail's stalks, a
   * frog's legs. Ink-only on the tube.
   *
   * **Drawn rather than baked** (SHA-233), and that is not an oversight: the
   * body is a function of the frame and bakes to a sprite, while these are
   * functions of where the ball was, which way the creature is facing and how
   * far through a leap it is. `unit` is how many pixels of the grid being drawn
   * on make one game pixel — 1 on the coarse grid and `FINE` on the fine one —
   * so a mark that wants to be one pixel of *this* grid asks for `1 / unit` and
   * gets a game pixel in classic and a fine one in HD. Everything that has a
   * width rather than being a line simply goes on writing its width.
   */
  decorate?(pixel: Pixel, creature: Creature, frame: number, demade: boolean, unit: number): void;
}
