import { gameConfig } from "@core/config/GameConfig";
import { nearestCore } from "@entities/effects/Singularity";

import type { Core } from "@entities/effects/Singularity";
import type { RectangleBounds } from "@interfaces/types";

/**
 * GRAVEL's pips: the chips a crumbling brick throws, and the only thing on this
 * field that is neither debris nor a capsule.
 *
 * It is a **drop** wearing debris' clothes, and every difference from
 * `ParticleField` comes out of that one fact. A chunk is a picture: it is
 * emitted from a ring buffer whose oldest slots are recycled under load, it
 * falls at whatever gravity gives it, and nothing ever asks where it went. A
 * pip is worth points, so a recycled one is a reward taken back and a pip that
 * arrives at the deck faster than the deck is tall is a reward the player was
 * never offered. Hence a pool that refuses rather than recycles, a capped fall,
 * and a catch test against the same segments the capsules are caught on.
 *
 * It is not `DropPool` either, and for the plainest reason: sixty of these can
 * be in the air at once, they are 3 px square, and they carry no kind. The two
 * pools have the catch test in common and nothing else.
 */
export interface Pip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Which corner is lit and which of the two stone tones the block is drawn in.
  // Fixed per pip and rolled at the burst, so a chip does not change colour
  // halfway down; the renderer turns it into a tone and a phase.
  seed: number;
  active: boolean;
}

// Everything acting on a falling pip this tick. One bag rather than three
// parameters, by `DropField`'s convention and for its reason.
export interface PipField {
  // Both holes, open or not. A pip answers to a black hole exactly as the
  // debris it looks like does — it is stone in the air, and the one thing every
  // other loose object on this field agrees about is that a core eats it.
  cores: readonly Core[];
  // The deck, in segments: SPLIT breaks it in two, and a pip falling through
  // the hole between them is missed the way a capsule is.
  paddleSegments: readonly RectangleBounds[];
}

export class GravelField {
  readonly pips: Pip[] = Array.from({ length: gameConfig.powerUps.gravel.poolSize }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    seed: 0,
    active: false,
  }));

  /**
   * One dead brick's worth of chips, and how many the pool had room for.
   *
   * **A full pool gives fewer rather than reusing a slot**, which is the whole
   * of the ticket's note about a NUKE or a BLAST fired during the window: the
   * cap is the pool, so the widest kill on the board spends what is left and
   * stops. Recycling would have been the cheaper answer and it is the wrong
   * one — the slot being reused is a pip already halfway to the deck that the
   * player has decided to go for.
   *
   * The scatter is a full circle like a debris burst rather than a fountain:
   * the chips that go up come back down through the ones that went sideways,
   * which is what makes a crumble read as a brick coming apart instead of as a
   * brick spraying.
   */
  burst(centerX: number, centerY: number, count: number): number {
    const { minSpeed, maxSpeed } = gameConfig.powerUps.gravel;
    let spawned = 0;
    for (let index = 0; index < count; index++) {
      const pip = this.pips.find((candidate) => !candidate.active);
      if (!pip) {
        break;
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      pip.x = centerX;
      pip.y = centerY;
      pip.vx = Math.cos(angle) * speed;
      pip.vy = Math.sin(angle) * speed;
      pip.seed = Math.floor(Math.random() * 0x10000);
      pip.active = true;
      spawned++;
    }
    return spawned;
  }

  /**
   * One tick of every pip in the air, and what the deck took.
   *
   * The count comes back and the position goes out through `onCaught`, because
   * the two things a catch owes are owed at different scales: the score and the
   * tick are one line for the whole shower — sixty coin ticks on the frame a
   * NOVA lands would stack into one flat tone — while the puff of stone belongs
   * to the chip that made it. Pips reaching the floor are simply gone; that is
   * the trade the capsule is made of, and it owes no announcement.
   *
   * A pip is never tested against a ball. That is the ticket's rule and it is
   * also the only version of this capsule that works: gravel that bounced would
   * be sixty extra colliders arriving on the frame a brick died, and a rally
   * would be decided by them.
   */
  step(field: PipField, onCaught: (x: number, y: number) => void): number {
    const { gravity, maxFall, drag, size } = gameConfig.powerUps.gravel;
    const { debrisEatRadius } = gameConfig.powerUps.singularity;
    let caught = 0;

    for (const pip of this.pips) {
      if (!pip.active) {
        continue;
      }

      // Eaten rather than bent, which is the one place a pip parts company with
      // the debris it is drawn like: a chunk spirals in over a dozen ticks
      // because it has nothing to lose, and a pip circling a hole it is going
      // to fall into anyway would be a reward held in front of the player. The
      // hole takes it or it does not.
      const core = nearestCore(field.cores, pip.x + size / 2, pip.y + size / 2);
      if (core && Math.hypot(core.x - (pip.x + size / 2), core.y - (pip.y + size / 2)) <= core.reach(debrisEatRadius)) {
        pip.active = false;
        continue;
      }

      pip.vx *= drag;
      pip.vy = Math.min(pip.vy + gravity, maxFall);
      pip.x += pip.vx;
      pip.y += pip.vy;

      if (pip.y > gameConfig.field.height) {
        pip.active = false;
        continue;
      }

      // The same overlap test the capsules are caught on, at a chip's size. It
      // is an overlap and not a crossing because `maxFall` guarantees one:
      // 3.2 px a tick against a 7 px deck cannot step over it.
      const landed = field.paddleSegments.some(
        (segment) =>
          pip.y + size >= segment.top &&
          pip.y <= segment.bottom &&
          pip.x + size > segment.left &&
          pip.x < segment.right,
      );
      if (landed) {
        pip.active = false;
        caught++;
        onCaught(pip.x + size / 2, pip.y + size / 2);
      }
    }

    return caught;
  }

  reset(): void {
    for (const pip of this.pips) {
      pip.active = false;
    }
  }
}
