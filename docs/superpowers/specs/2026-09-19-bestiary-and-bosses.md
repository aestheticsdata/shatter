# The bestiary and the bosses

Confirmed by the user on 2026-09-19 ("oui pour les deux, go"), after playing levels 1–9 of SHA-199: _"les bestioles n'apparaissent pas avant le niveau 9 !!! mais il en faut dès le niveau un ! avec des types de bestioles spécifiques à chaque niveau"_ and _"il faut un boss de fin de niveau tous les 5 levels"_.

Companion to `2026-09-19-observer-one-eye-43-placements.md` (the eye) — this one is the creatures and the fights. Devil's Crush is the founding reference: the ball hits monsters as well as bricks.

## Two rules

1. **Creatures from level 1, and each level's are its own.** Every level names its creatures — species and pins — in its data. Twenty species (the list in the placements spec); a level carries one to three, and no two consecutive levels share a species. The five veils keep their brood (egg → hatchling → wyvern) beside the new creatures.
2. **A boss at the end of every fifth level.** Levels 5, 10, 15, 20, 25, 30, 35, 40 end in a fight; THE LID at 43 already is one. The wall comes down as today; on the last brick the boss enters instead of the clear card, and the level clears when it dies. The five veils move to the boss slots — THE VEIL 9 → 10, THE IRIS 18 → 20, THE TEAR 27 → 30, THE WRATH 38 → 40 — and each gets a boss phase of its own later; 5, 15, 25, 35 get new bosses from the bestiary. This supersedes EVEN NINES.

## The bestiary framework

**Level data** (`src/interfaces/types.ts`):

```ts
export interface CreaturePin {
  kind: CreatureKind;
  x: number;
  y: number;
}
// On LevelDefinition:
creatures?: readonly CreaturePin[];
```

`CreatureKind` is a constant object, per the house rule on string names: `CREATURE = { MOTH: "moth", FROG: "frog", SNAIL: "snail", SPIDER: "spider", … } as const` in `src/interfaces/creatures.ts`, with `CreatureKind` derived from it.

**A creature** (`src/entities/creatures/Creature.ts`): one live thing on the field. Position is the sprite's top-left in field pixels, like a beast.

```ts
export interface Creature {
  kind: CreatureKind;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hitPoints: number;
  flashTicks: number;
  facing: 1 | -1;
  // The species' own machine: a state name from that species' constant object, and ticks in it.
  state: string;
  clock: number;
  // Where the level put it — a frog's home brick, a spider's ceiling spot.
  home: { x: number; y: number };
}
```

**What a species reads each tick** (`CreatureSight`): the nearest ball in flight (centre and velocity) or null; the deck's span and rail y; `standing(column, row)`; the Observer's socket centre or null; the frame count. Built by the game, exactly as `EyeSight` is. The species never touches the grid, the balls or the deck.

**What a species can ask the game to do** (`CreatureEffects`), the only way a creature acts on the field:

- `dropCapsule(x, y)` — a rolled capsule falls from here (MOTH).
- `mortar(column, row)` — one hit point back on that brick, up to its kind's own (SNAIL).
- `pop(x, y, label, malus)` — a catch-pop line (the house's idiom for "this just happened").
- `burst(x, y, kind)` — debris.

More verbs arrive with the species that need them (a rail patch for SLUG, a stung deck for JELLYFISH, a lit field for FIREFLY), each as one method here, never as the species reaching into the game.

**A species** (`src/entities/creatures/species/<kind>.ts`, registered in `src/entities/creatures/species/index.ts` under its `CreatureKind`):

```ts
export interface Species {
  kind: CreatureKind;
  width: number;
  height: number;
  hitPoints: number;
  points: number; // per hit
  killPoints: number;
  // Solid creatures are shelves the ball bounces off (vertically, like a beast); the rest the ball passes through and still strikes.
  solid: boolean;
  frames: readonly (readonly string[])[]; // ASCII bitmaps, one character per pixel, `.` for nothing
  frameTicks: number;
  palette: Readonly<Record<string, string>>;
  demade: Readonly<Record<string, string>>; // body to ground, outline and detail to ink
  outline: string; // the character the strike flash cools through
  spawn(creature: Creature): void;
  step(creature: Creature, sight: CreatureSight, effects: CreatureEffects): void;
  // A hit landed; hit points and the flash are already taken. Return true when it dies of this.
  struck(creature: Creature, by: "ball" | "laser", effects: CreatureEffects): boolean;
  // Extra drawing beside the bitmap — a spider's thread, a snail's trail. Optional.
  decorate?(pixel: Pixel, creature: Creature, frame: number): void;
}
```

**The object** (`src/entities/creatures/Creatures.ts`), beside `Brood` and shaped like it: `load(pins)`, `step(sight, effects)`, `at(x, y, w, h)` (live solid creatures only, for the ball; every live one for the laser), `strike(creature, by, effects) → { points, killed }`, `live`, `creatures`. Ball and laser collide with creatures right where they collide with beasts, with the same shelf bounce; `strikeCreature` in the game pays, pops, flashes, bursts and sounds exactly as `strikeBeast` does (the brood's sounds for now — species sounds are their own ticket, judged by ear).

**Drawing**: `drawCreature` in the renderer, with `drawBeast`'s bitmap runner and strike-flash idiom, then `species.decorate`. In front of the wall with the brood, under the ball. Every silhouette survives 1-bit: the demade palette is authored with the sprite.

**Config**: one `creatures` block in `GameConfig` — `flashTicks`, and per-species numbers under their kind (speeds, ranges, timers). Plain knobs.

**Console**: `creature <kind>` drops one at the deck's x for QA.

## Series I

| Level      | Creature | What it does                                                                                                                                                                   |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 SUNRISE  | MOTH ×2  | Flutters in a wobbly loop round the eye's socket. One hit: it drops the capsule it carries and dies.                                                                           |
| 2 SMILEY   | FROG ×2  | Sits on a brick. Ball inside its range: it leaps to another standing brick. Hit while sitting: 2 hits to kill; hit in the air: dies at once for double.                        |
| 3 PYRAMID  | SNAIL ×1 | Crawls the top edge of the wall, left and right. Every brick it passes over gets a hit point back (its own kind's ceiling). 3 hits to kill; kill it early.                     |
| 4 CHOMP    | SPIDER   | Hangs at the ceiling over the mouth. Ball passes under: drops on its thread to the ball's height and blocks it (solid), then climbs back. Hit on the way down: the thread snaps. |
| 5 GATEWAY  | boss     | See below. GATEWAY keeps its patrol eye; its creatures are the gentle ones again in a mix (MOTH ×1, FROG ×1), then the boss.                                                    |
| 6 HEART    | FIREFLY  | later                                                                                                                                                                          |
| 7 VORTEX   | WISP     | later                                                                                                                                                                          |
| 8 BOLT     | BAT      | later                                                                                                                                                                          |
| 9 (empty)  | —        | after the reorder, level 9 is CHECKER                                                                                                                                          |

## The boss framework

**A boss level** is any level whose index is a multiple of five (1-based: 5, 10, …, 40) plus 43. Nothing in the level data says so; the rule is one function, `isBossLevel(index)`.

**The fight**: on the last brick of a boss level the game does not start `clearCountdown`; it calls `boss.enter(kind)`. The boss is a big creature (40–70 px) with hit points (8–16), a movement pattern and **an attack on the deck** — the thing that makes it a boss rather than a target: THE IRIS's petrifying gaze is the model, and the attack is telegraphed (a wind-up the player can read) every time. The ball bounces off it and each hit pays; at 0 it dies in a burst, the level's clear card follows with a `BOSS DOWN` line and a bonus. Losing the ball during the fight costs a life as usual; the boss stays where it is.

**Object**: `src/entities/bosses/Boss.ts` (state: kind, x, y, hitPoints, phase, clock, attack state) and `src/entities/bosses/kinds/<kind>.ts` with the same shape a species has plus `attack(boss, sight, effects)`. `BossKind` is a constant object. The panel shows `BOSS ··· 8` (hits left) in the row the veils use for the diadem.

**The nine**:

| Level | Boss                     | Attack                                                                                                               |
| ----- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 5     | THE SPIDER QUEEN         | built (SHA-209): hangs from the top, stalks along it to over the deck, drops; caught under her the deck is stone for the gaze's span; ten hits |
| 10    | THE VEIL (+ boss phase)  | the wyvern mother comes out of the socket; she lays eggs on the band while you hit her                               |
| 15    | THE MOTH MOTHER          | built (SHA-213): flies a figure of eight, the ball passes through her, a capsule out of her on every hit; on a clock she shakes and her dust puts the lights out (BLACKOUT's pools) |
| 20    | THE IRIS (+ boss phase)  | the eye leaves the wall: a loose iris firing the gaze on the move                                                    |
| 25    | THE FROG KING            | built (SHA-213): hops the floor, lands with a thud; armour sitting (HIDE), soft in the air; his tongue flicks a ball at his mouth straight down |
| 30    | THE TEAR (+ boss phase)  | the weeping eye out in the room, raining                                                                             |
| 35    | THE SNAIL ELDER          | built (SHA-213): crawls the ceiling, lays a brick under every column he passes in the top rows; shell armour (SHELL), soft head |
| 40    | THE WRATH (+ boss phase) | the bloodshot eye rebuilding the wall around itself while it is hit                                                  |
| 43    | THE LID                  | as shipped: the pupil in the room                                                                                    |

**The rule that replaced the proposals (2026-09-20, the user's):** every boss is one of the bestiary's species grown huge — the same bitmap doubled (`bitmap.ts`), the same mechanic turned into the whole fight. 5, 15, 25 and 35 are built to it. The veils' boss phases at 10, 20, 30 and 40 remain proposals to confirm one at a time. Two framework additions came with SHA-213: `Species.armour?(creature, x, y)` — the label a body refuses a touch with, or null — and the effects `dust`, `kick`, `lay`, `rattle`.

## Tickets

- SHA-207 — BESTIARY FOUNDATION + MOTH on level 1
- SHA-208 — SERIES I: FROG on 2, SNAIL on 3, SPIDER on 4
- SHA-206 (retitled) — EVERY FIVE: the veils move to 10 / 20 / 30 / 40
- SHA-209 — BOSS FOUNDATION + THE SPIDER QUEEN at the end of level 5
- then: the rest of series I's creatures, the bosses of 15 / 25 / 35, the veils' boss phases, species sounds.
