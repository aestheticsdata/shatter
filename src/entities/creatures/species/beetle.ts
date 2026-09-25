import { gameConfig } from "@core/config/GameConfig";
import { mirrored } from "@entities/creatures/bitmap";
import { paintRows } from "@entities/creatures/species/frog";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Species } from "@entities/creatures/Creature";

/**
 * BEETLE (SHA-239): armoured on top, soft underneath, and the whole fight is
 * about which way up it is.
 *
 * **The shell is on the side the shell is on.** A ball coming down off the
 * wall hits the carapace and is refused — it bounces, it pays nothing, it
 * takes no hit point, and the body says `SHELL` over itself. A ball coming up
 * off the deck hits the belly and lands. That is the mechanic in one line, and
 * it is readable without being told: the shot that works is the one from
 * below, which in this game is the commoner shot anyway.
 *
 * Two belly hits change it rather than hurt it — the first rolls it into a
 * charging shell that runs the band and bounces off the frame, the second
 * upends it. **On its back the armour is underneath**, so the easy descending
 * shot is suddenly the killing one, and for three seconds it is the softest
 * thing on the field. Then it rights itself and you start again.
 *
 * Symmetric body, head in `decorate` — SNAIL's idiom (`snail.ts:198`) and for
 * SNAIL's reason: a species that travels has to turn round, and `frames` is
 * picked off the field's clock rather than off `facing`, so the direction has
 * to be carried by something drawn rather than baked.
 */
export const BEETLE_STATE = { WALK: "walk", ROLL: "roll", FLIPPED: "flipped" } as const;

/** What the carapace refuses a touch with. */
const SHELL = "SHELL";

const WIDTH = 14;
const HEIGHT = 9;

/**
 * The carapace: an oval dome, left-right symmetric so it can travel either
 * way, and near enough top-bottom symmetric that turning it over does not
 * look like a different animal. What it is *not* is a picture of which way up
 * the beetle is — the legs are that, and they are drawn.
 *
 * **The seam across the middle is the armour line drawn.** `armour?` splits
 * this body at `HEIGHT / 2` and the player has no way to know that from a
 * dome, so the wing case's own edge is put exactly there. It is symmetric on
 * purpose and says only "there are two halves of me": *which* half is the
 * shell is told by the legs, and by the `SHELL` that pops off a refused touch.
 */
export const BEETLE_SHELL: readonly string[] = [
  "...kkkkkkkk...",
  ".kkccsssscckk.",
  "kkcccccccccckk",
  "kcccccccccccck",
  "kkkkkkkkkkkkkk",
  "kcccccccccccck",
  "kkcccccccccckk",
  ".kkcccccccckk.",
  "...kkkkkkkk...",
];

// The head, out at the leading end: jaw, crown and one antenna. Facing right;
// the other way is this mirrored.
export const HEAD_RIGHT: readonly string[] = ["...x", "..x.", ".xxx", ".xxx", "..xx"];
const HEAD_LEFT: readonly string[] = mirrored(HEAD_RIGHT);

// Three pairs, splayed, with feet on the end. Under it on its feet, over it
// on its back.
export const LEGS: readonly string[] = ["..x...x...x...", ".x....x....x..", "xx...xx....xx."];
const LEGS_UP: readonly string[] = LEGS.toReversed();

export const BEETLE: Species = {
  kind: CREATURE.BEETLE,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.beetle.hitPoints;
  },
  get points() {
    return gameConfig.creatures.beetle.points;
  },
  get killPoints() {
    return gameConfig.creatures.beetle.killPoints;
  },
  tip: "HIT IT FROM BELOW, FINISH IT UPSIDE DOWN",
  lore: "ARMOURED ON TOP, SOFT UNDERNEATH, AND IT KNOWS IT. COME DOWN ON ITS SHELL AND THE BALL BOUNCES OFF WITH NOTHING TO SHOW. HIT IT FROM BELOW AND IT ROLLS UP INTO A CHARGING BALL OF CHITIN; HIT IT AGAIN AND IT FLIPS ONTO ITS BACK, LEGS WAVING. FOR THREE SECONDS IT IS THE SOFTEST THING ON THE FIELD.",
  // Two belly hits to roll it and turn it over, then the two its hit points
  // are: `struck` hands the first two back.
  hits: 4,
  // A shelf, walking or rolling. It is the one creature whose whole premise is
  // that the ball comes off it rather than through it.
  solid: true,
  frames: [BEETLE_SHELL],
  frameTicks: 12,
  // The rock brick's dark for the chitin and the gold brick's flat for the
  // sheen across the dome: an armoured thing, read as armoured at a glance,
  // and the gold is a highlight on a body rather than a number — the colour
  // the house keeps for what pays is `chainSheen`, and this is not it.
  palette: {
    k: BRICK_COLORS.R.dark,
    c: BRICK_COLORS.R.flat,
    s: BRICK_COLORS.G.flat,
  },
  // Chitin to ground, outline and sheen to ink: an outlined dome with a band
  // across its back is still an armoured thing on the tube.
  demade: {
    k: canvasPalette.demakeInk,
    c: canvasPalette.demakeGround,
    s: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    creature.state = BEETLE_STATE.WALK;
    // It sets off toward the middle, so a beetle pinned near a wall does not
    // spend its first seconds walking into one.
    creature.facing = creature.home.x < gameConfig.field.width / 2 ? 1 : -1;
  },

  step(creature) {
    const { walkSpeed, chargeSpeed, flipTicks } = gameConfig.creatures.beetle;
    const { left, right } = gameConfig.field;
    if (creature.state === BEETLE_STATE.FLIPPED) {
      // On its back it goes nowhere. The legs wave, and **they slow as the
      // window shuts**: the phase is advanced by a rate that falls to almost
      // nothing, so how long is left is written on the creature rather than
      // nowhere.
      const leftOfIt = Math.max(0, flipTicks - creature.clock) / flipTicks;
      creature.phase += 0.05 + 0.4 * leftOfIt;
      if (creature.clock >= flipTicks) {
        creature.state = BEETLE_STATE.WALK;
        creature.clock = 0;
      }
      return;
    }
    const speed = creature.state === BEETLE_STATE.ROLL ? chargeSpeed : walkSpeed;
    creature.x += creature.facing * speed;
    creature.vx = creature.facing * speed;
    if (creature.x < left + 1) {
      creature.x = left + 1;
      creature.facing = 1;
    } else if (creature.x > right - 1 - WIDTH) {
      creature.x = right - 1 - WIDTH;
      creature.facing = -1;
    }
    // It keeps the line the level pinned it on; the band is a lane, not a room.
    creature.y = creature.home.y;
  },

  /**
   * The carapace refuses; the belly takes it. Split at the body's own middle
   * and asked of the point the touch landed on, so a ball coming down is
   * refused and one coming up off the deck is not — **and the other way round
   * while it is on its back**, which is what makes flipping it worth doing.
   */
  armour(creature, _x, y) {
    const high = y < creature.y + HEIGHT / 2;
    const shellUp = creature.state !== BEETLE_STATE.FLIPPED;
    return high === shellUp ? SHELL : null;
  },

  /**
   * Two of the three hits change it rather than hurt it, and say so by handing
   * the hit point back. `Creatures.strike()` takes one before it asks, and
   * gives the species the last word on whether that was a wound: here only the
   * hits that land on a beetle already upside down are, so `hitPoints` reads
   * as what it can take on its back and nothing else. Without this the second
   * flip of its life would kill it on the way over rather than after, and the
   * three seconds the player is being sold would never happen.
   */
  struck(creature) {
    if (creature.state === BEETLE_STATE.WALK) {
      creature.state = BEETLE_STATE.ROLL;
      creature.hitPoints += 1;
      creature.clock = 0;
      return false;
    }
    if (creature.state === BEETLE_STATE.ROLL) {
      creature.state = BEETLE_STATE.FLIPPED;
      creature.hitPoints += 1;
      creature.clock = 0;
      return false;
    }
    return false;
  },

  /** The head at the leading end, and the legs on whichever side is down. */
  decorate(pixel, creature, _frame, demade, unit) {
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const flipped = creature.state === BEETLE_STATE.FLIPPED;
    const tone =
      creature.flashTicks > 0 ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS.R.dark;
    const ahead = creature.facing === 1;
    paintRows(pixel, ahead ? HEAD_RIGHT : HEAD_LEFT, ahead ? x + WIDTH - 1 : x - 3, y + 2, tone, unit);
    // A beetle on its feet plants them; one on its back waves them, and the
    // sway is a whole pixel because half of one is not a leg.
    const sway = flipped ? (Math.sin(creature.phase) > 0 ? 1 : -1) : 0;
    paintRows(pixel, flipped ? LEGS_UP : LEGS, x + sway, flipped ? y - 3 : y + HEIGHT, tone, unit);
  },
};
