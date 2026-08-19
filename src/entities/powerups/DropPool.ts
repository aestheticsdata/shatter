import { gameConfig } from "@core/config/GameConfig";
import { POWER_UP_DROP_WEIGHTS, POWER_UP_IDS } from "@core/config/powerUps";

import type { PowerUpKind, RectangleBounds } from "@interfaces/types";

const DROP_WIDTH = 20;
const DROP_HEIGHT = 8;
const NO_EXCLUSIONS: readonly PowerUpKind[] = [];
const RAIN_EXCLUDES: readonly PowerUpKind[] = ["R"];

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
  // The open singularity, or null. Only where it is matters here.
  core: { x: number; y: number } | null;
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

// SINGULARITY: drag one capsule toward the core, and report whether it reached
// it. The drag is deliberately weaker than the fall, so the core is a funnel and
// not a trap: capsules falling near it are pulled in and eaten, while ones
// passing wide are bent aside and sink past it anyway.
function pullIntoCore(drop: Drop, core: { x: number; y: number }): boolean {
  const { dropPull, dropEatRadius } = gameConfig.powerUps.singularity;
  const toCoreX = core.x - (drop.x + DROP_WIDTH / 2);
  const toCoreY = core.y - (drop.y + DROP_HEIGHT / 2);
  const distance = Math.hypot(toCoreX, toCoreY);
  if (distance <= dropEatRadius) {
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
  // without R itself, so one rain can never chain into the next.
  rainSpawn(count: number): number {
    const { left, right, top } = gameConfig.field;
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const drop = this.drops.find((candidate) => !candidate.active);
      if (!drop) {
        break;
      }
      drop.kind = rollDropKind(RAIN_EXCLUDES);
      drop.x = left + ((i + 0.5) * (right - left)) / count - DROP_WIDTH / 2 + (Math.random() - 0.5) * 16;
      drop.y = top + 8;
      drop.active = true;
      spawned++;
    }
    return spawned;
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
      if (field.core && pullIntoCore(drop, field.core)) {
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
