import { gameConfig } from "@core/config/GameConfig";
import { POWER_UP_DROP_WEIGHTS, POWER_UP_IDS } from "@core/config/powerUps";
import { nearestCore } from "@entities/effects/Singularity";

import type { Core } from "@entities/effects/Singularity";
import type { PowerUpKind, RectangleBounds } from "@interfaces/types";

const DROP_WIDTH = 20;
const DROP_HEIGHT = 8;
const NO_EXCLUSIONS: readonly PowerUpKind[] = [];
// RAIN bars itself so one shower cannot chain into the next, and METEOR because
// four rained capsules would be twelve rocks — twice what the volley pool holds,
// and a shower that dropped nothing else.
const RAIN_EXCLUDES: readonly PowerUpKind[] = ["R", "MT"];

// `exclude` is a list because capsules that spawn other capsules keep growing:
// RAIN already bars itself, and this is the shape the ones after it use rather
// than each widening the signature again.
//
// Exported for the wall: bricks are seeded with their capsule when the level is
// built, so this same weighted roll is what fills them — see `rollBrickCapsule`
// in `ShatterGame`.
export function rollDropKind(exclude: readonly PowerUpKind[] = NO_EXCLUSIONS): PowerUpKind {
  const kinds = exclude.length === 0 ? POWER_UP_IDS : POWER_UP_IDS.filter((kind) => !exclude.includes(kind));
  const weights = POWER_UP_DROP_WEIGHTS;
  const total = kinds.reduce((sum, kind) => sum + weights[kind], 0);
  let roll = Math.random() * total;
  for (const kind of kinds) {
    roll -= weights[kind];
    if (roll <= 0) {
      return kind;
    }
  }
  return kinds[kinds.length - 1];
}

// Everything acting on a falling capsule this tick, and what to do with one the
// core swallows. A capsule-bending effect adds a field here rather than another
// parameter to `step`, which is why this is a bag and not three arguments.
export interface DropField {
  magnetActive: boolean;
  // Both holes, open or not — SINGULARITY's and VORTEX's. Where each one is and
  // how far it reaches is all that matters here, and a capsule between two open
  // holes answers to the nearer one alone.
  cores: readonly Core[];
  // A swallowed capsule grants nothing; the game turns this into its debris.
  onSwallowed: (x: number, y: number) => void;
}

export interface Drop {
  x: number;
  y: number;
  kind: PowerUpKind;
  active: boolean;
}

// MAGNET: slide one capsule toward the deck's centre. The pull is strongest at
// the paddle and weakest at the edge of range, and the final `gap` term forbids
// overshoot — a capsule may land on the centre line but never cross it, which is
// what keeps a swarm of them from oscillating over the paddle.
//
// Aim is the centre and not the nearest edge, so a JAMMER-narrowed paddle
// collects exactly as well as a WIDE one.
function pullTowardDeck(drop: Drop, deckCenterX: number): void {
  const { rangeX, pullMax, pullMin } = gameConfig.powerUps.magnet;
  const offset = deckCenterX - (drop.x + DROP_WIDTH / 2);
  const gap = Math.abs(offset);
  if (gap > rangeX) {
    return;
  }
  drop.x += Math.sign(offset) * Math.min(Math.max(pullMax * (1 - gap / rangeX), pullMin), gap);
}

// SINGULARITY and VORTEX: drag one capsule toward a core, and report whether it
// reached it. The drag is deliberately weaker than the fall, so a core is a
// funnel and not a trap: capsules falling near it are pulled in and eaten, while
// ones passing wide are bent aside and sink past it anyway.
//
// The mouth comes off `core.reach`, so the bigger hole is a wider funnel. The
// drag deliberately does *not*: it is a speed and not a length, and it is only a
// funnel because it loses to `dropFallSpeed`. Scaled to VORTEX's 1.5 it would be
// 1.35 against a 1.3 fall — a capsule anywhere below the hole would climb into
// it, which is a vacuum reaching down the field rather than a wider funnel. Two
// holes dragging at once add up the same way, which is why only the nearer one
// ever gets to.
function pullIntoCore(drop: Drop, core: Core): boolean {
  const { dropPull, dropEatRadius } = gameConfig.powerUps.singularity;
  const toCoreX = core.x - (drop.x + DROP_WIDTH / 2);
  const toCoreY = core.y - (drop.y + DROP_HEIGHT / 2);
  const distance = Math.hypot(toCoreX, toCoreY);
  if (distance <= core.reach(dropEatRadius)) {
    return true;
  }
  drop.x += (toCoreX / distance) * dropPull;
  drop.y += (toCoreY / distance) * dropPull;
  return false;
}

export class DropPool {
  readonly drops: Drop[] = Array.from({ length: gameConfig.powerUps.maxDrops }, () => ({
    x: 0,
    y: 0,
    kind: "E",
    active: false,
  }));

  // The kind comes in rather than being rolled here: it was decided when the
  // wall was built, and XRAY has been showing it to the player since.
  trySpawn(kind: PowerUpKind, brickLeft: number, brickTop: number): boolean {
    const drop = this.drops.find((candidate) => !candidate.active);
    if (!drop) {
      return false;
    }

    drop.kind = kind;
    drop.x = brickLeft + 5;
    drop.y = brickTop;
    drop.active = true;
    return true;
  }

  // RAIN: scatter capsules across the top of the field. Kinds are re-rolled
  // against `RAIN_EXCLUDES` plus whatever the level bars, so a shower can never
  // chain into another one and never smuggles in a capsule the wall could not
  // have dropped here itself.
  rainSpawn(count: number, exclude: readonly PowerUpKind[] = NO_EXCLUSIONS): number {
    // Rolled once for the whole shower: the caller's exclusions are a property
    // of the level, not of the individual capsule.
    const barred = exclude.length === 0 ? RAIN_EXCLUDES : [...RAIN_EXCLUDES, ...exclude];
    return this.spawnAcrossTop(Array.from({ length: count }, () => rollDropKind(barred)));
  }

  /**
   * These capsules, in this order, spread across the top of the field.
   *
   * RAIN's shower is this with rolled kinds, and the dev console's `power` is
   * this with named ones — one implementation, so a capsule asked for by hand
   * falls exactly the way a rained one does. Evenly spaced by index with a
   * little jitter, because the point of a spread is that every one of them can
   * be reached, and two capsules on the same pixel are one capsule.
   *
   * Returns how many the pool had room for — see `freeSlots` for asking first.
   */
  spawnAcrossTop(kinds: readonly PowerUpKind[]): number {
    const { left, right, top } = gameConfig.field;
    let spawned = 0;
    for (const kind of kinds) {
      const drop = this.drops.find((candidate) => !candidate.active);
      if (!drop) {
        break;
      }
      drop.kind = kind;
      drop.x = left + ((spawned + 0.5) * (right - left)) / kinds.length - DROP_WIDTH / 2 + (Math.random() - 0.5) * 16;
      drop.y = top + 8;
      drop.active = true;
      spawned++;
    }
    return spawned;
  }

  // How many more capsules can be in the air at once. The console asks before
  // it spawns: a `power` line that only half landed would be worse than one
  // that says so, since the half that did land is already falling past you.
  freeSlots(): number {
    return this.drops.reduce((free, drop) => (drop.active ? free : free + 1), 0);
  }

  /**
   * One tick of capsule motion, and the catch test against the paddle.
   *
   * `paddleSegments` is a list rather than one box because the deck stops being
   * a single slab once SPLIT breaks it in two: a capsule falling through the gap
   * between segments is missed, and the deck's span is still the first
   * segment's left edge to the last one's right.
   *
   * `onCatch` returns whether the capsule was consumed; a refused drop stays
   * live (a NUKE earlier in this same tick froze the game) so it visibly freezes
   * with the rest of the field instead of vanishing into the paddle.
   *
   * Motion is a pipeline, and this is the order it runs in: magnet pull, core
   * pull, then the fall. Later capsules that push a drop around insert their
   * stage here rather than widening these parameters again.
   *
   * The core runs after the magnet on purpose: when both have hold of the same
   * capsule, the one that eats it wins.
   */
  step(paddleSegments: readonly RectangleBounds[], field: DropField, onCatch: (kind: PowerUpKind) => boolean): void {
    const deckCenterX = (paddleSegments[0].left + paddleSegments[paddleSegments.length - 1].right) / 2;

    for (const drop of this.drops) {
      if (!drop.active) {
        continue;
      }

      if (field.magnetActive) {
        pullTowardDeck(drop, deckCenterX);
      }
      const core = nearestCore(field.cores, drop.x + DROP_WIDTH / 2, drop.y + DROP_HEIGHT / 2);
      if (core && pullIntoCore(drop, core)) {
        drop.active = false;
        field.onSwallowed(drop.x + DROP_WIDTH / 2, drop.y + DROP_HEIGHT / 2);
        continue;
      }

      drop.y += gameConfig.powerUps.dropFallSpeed;
      if (drop.y > gameConfig.field.height) {
        drop.active = false;
        continue;
      }

      const caught = paddleSegments.some(
        (segment) =>
          drop.y + DROP_HEIGHT >= segment.top &&
          drop.y <= segment.bottom &&
          drop.x + DROP_WIDTH > segment.left &&
          drop.x < segment.right,
      );
      if (caught && onCatch(drop.kind)) {
        drop.active = false;
      }
    }
  }

  reset(): void {
    for (const drop of this.drops) {
      drop.active = false;
    }
  }
}
