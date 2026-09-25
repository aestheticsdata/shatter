import { gameConfig } from "@core/config/GameConfig";
import { paintRows } from "@entities/creatures/species/frog";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * CRAB (SHA-244): it takes your capsules, and it wears them.
 *
 * It walks the band sideways and scuttles for anything falling near it, and
 * what it catches goes on its back as a gold pip. **What killing it is worth
 * is written on it**: a hit spills the lot at once, so a crab with four pips is
 * four capsules waiting for whoever can be bothered to shoot a thing that is
 * not, in itself, hurting them.
 *
 * That makes it the one creature in the bestiary you may want to leave alive.
 * Everything else is a target or a clock; this one is a *deposit account*, and
 * the decision it offers — take the two it has now or wait for the fourth and
 * risk the level ending first — is the only one of its kind here.
 *
 * **It never makes a capsule, it only delays one.** Everything a crab hands
 * back is something the player would have had anyway, which is what keeps a
 * creature that pays in capsules from being a faucet: leaving it alive earns
 * nothing, it only moves when and where the payout lands. What it can do is
 * lose you the lot, by holding four when the ball goes out.
 */
export const CRAB_STATE = { WALK: "walk", STALK: "stalk" } as const;

const WIDTH = 15;
const HEIGHT = 9;

const SNATCHED = "SNATCHED";

/**
 * Claws held, legs walking, and four slots cut in the shell.
 *
 * The slots are `.` rather than shell, and that is the whole reason this
 * species has a `decorate` at all: the hook runs *before* the body, so a pip
 * painted on the back would be painted over by the back. `decorate` fills all
 * four every frame instead — shell tone for an empty one, gold for a full one —
 * and the crab is solid at rest without the marks ever being baked into a
 * frame they cannot be, since how many there are is state.
 *
 * **Three rows of shell rather than two, and the claws have insides**, which
 * is a tube decision rather than a drawing one. The house sends a body to
 * ground and an outline to ink, so a creature drawn as a thin skeleton is a
 * creature made almost entirely of ink — and over a *lit* demade background
 * that is a creature made almost entirely of nothing. Rendered beside a moth,
 * a beetle and a bat on one line of the tube, the first crab here lost its
 * claws, its arms and its legs and came out as a bar; it needed the ground to
 * carry it, which meant the shell had to be the big thing on it.
 */
const SCUTTLE_OUT: readonly string[] = [
  ".kk.........kk.",
  "kwwk.......kwwk",
  ".kw...k.k...wk.",
  "..kkkkkkkkkkk..",
  "..kwwwwwwwwwk..",
  "..kwwwwwwwwwk..",
  "..kw.w.w.w.wk..",
  "...kkkkkkkkk...",
  "..k.k.k.k.k.k..",
];

// The same crab a step on, and the whole of the difference is that the legs
// have moved one across. Two reasons: the claws are what it is holding up at
// you, and a creature waving them about while it walked would be two
// animations arguing over one read — and a set of legs sliding sideways is
// what a crab's walk *is*.
const SCUTTLE_IN: readonly string[] = [
  ".kk.........kk.",
  "kwwk.......kwwk",
  ".kw...k.k...wk.",
  "..kkkkkkkkkkk..",
  "..kwwwwwwwwwk..",
  "..kwwwwwwwwwk..",
  "..kw.w.w.w.wk..",
  "...kkkkkkkkk...",
  "...k.k.k.k.k.k.",
];

// One slot on the shell, the four columns they sit in, and the row they sit on.
const SLOT: readonly string[] = ["x"];
const SLOTS: readonly number[] = [4, 6, 8, 10];
const SLOT_ROW = 6;

/**
 * How many capsules it is carrying.
 *
 * `phase` is the field `Creature` sets aside for whatever number a species
 * needs — a moth's angle, a frog's leap — and a crab's is its load. Named,
 * because `creature.phase` read as a count three times over would be three
 * places to wonder what it meant.
 */
function held(creature: Creature): number {
  return creature.phase;
}

export const CRAB: Species = {
  kind: CREATURE.CRAB,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.crab.hitPoints;
  },
  get points() {
    return gameConfig.creatures.crab.points;
  },
  get killPoints() {
    return gameConfig.creatures.crab.killPoints;
  },
  tip: "COUNT THE PIPS BEFORE YOU SHOOT",
  lore: "A THIEF IN A RED SHELL. IT SCUTTLES SIDEWAYS ALONG THE BAND, SNATCHES YOUR FALLING CAPSULES OUT OF THE AIR AND WEARS THEM AS GOLD PIPS ON ITS BACK. HIT IT AND IT SPILLS THE LOT AT ONCE. SO: TAKE TWO NOW, OR WAIT FOR FOUR AND HOPE THE LEVEL LASTS?",
  // **Not solid, and this one is a balance call rather than an anatomical
  // one.** A crab is plainly a hard thing and the ball ought to come off it —
  // but it is fifteen pixels wide, it loiters in the middle of the band, and it
  // walks. A shelf with all three of those properties re-routes the rally far
  // more than a hundred points is worth, and two of them would wreck it.
  solid: false,
  frames: [SCUTTLE_OUT, SCUTTLE_IN],
  frameTicks: 9,
  // The red brick's own three, which is what a boiled crab is anyway, and the
  // one palette in the bestiary that is not some shade of dark: a creature
  // holding your capsules should be findable.
  palette: { k: BRICK_COLORS["1"].dark, w: BRICK_COLORS["1"].flat },
  // Shell to ground, outline to ink — and the pips to ink too, which is where
  // the load survives the tube: four lit dots on a dark back.
  demade: { k: canvasPalette.demakeInk, w: canvasPalette.demakeGround },
  outline: "k",

  spawn(creature) {
    creature.state = CRAB_STATE.WALK;
    // Off its pin, so two crabs on one level set off in opposite directions and
    // the band is covered rather than patrolled twice over.
    creature.facing = creature.home.x < gameConfig.field.width / 2 ? 1 : -1;
    creature.phase = 0;
  },

  /**
   * Take whatever is passing, then walk — toward the nearest capsule it thinks
   * it can reach, or on along the band.
   *
   * The snatch box is the crab's own grown *upward*, which is both the picture
   * ("out of the air") and the margin: a capsule falls 1.3 px a tick, so
   * nothing can pass through a nine-pixel box, but a claw that reaches is a
   * claw the player can see coming.
   *
   * It never leaves its line. A crab walks; the level decides what height its
   * band is at, and a creature that drifted up and down would be one the author
   * could not place between the wall and the deck on purpose.
   */
  step(creature, sight, effects) {
    const knobs = gameConfig.creatures.crab;
    const { left, right } = gameConfig.field;

    // **A full crab lets the rest through**, which is a fact the player can use:
    // once the fourth pip is on, capsules fall past it untouched. The marks are
    // therefore a count *and* a warning that this one has stopped being a
    // threat, which is more than one thing for the price of four pixels.
    if (held(creature) < knobs.carry) {
      const taken = effects.snatch(creature.x, creature.y - knobs.grab, WIDTH, HEIGHT + knobs.grab);
      if (taken > 0) {
        creature.phase = Math.min(knobs.carry, held(creature) + taken);
        // A capsule that simply vanished would read as a bug rather than as a
        // theft, and the pop is the house's way of saying which.
        effects.pop(creature.x + WIDTH / 2, creature.y - 6, SNATCHED, true);
      }
    }

    const centre = creature.x + WIDTH / 2;
    let target: number | null = null;
    // Typed, because `gameConfig` is `as const` and the knob's literal type
    // would otherwise make this a variable that can only ever hold 96.
    let best: number = knobs.reach;
    for (const drop of sight.drops) {
      // Only what is still above it. A capsule already past the crab belongs to
      // whoever catches it, and one turning round to chase it down would be a
      // crab walking into the deck.
      if (drop.y > creature.y + HEIGHT) {
        continue;
      }
      const gap = Math.abs(drop.x - centre);
      if (gap < best) {
        best = gap;
        target = drop.x;
      }
    }

    if (target !== null && held(creature) < knobs.carry) {
      creature.state = CRAB_STATE.STALK;
      creature.facing = target < centre ? -1 : 1;
      // Clamped to the gap so it settles under a capsule rather than jittering
      // either side of one.
      creature.x += creature.facing * Math.min(knobs.chase, Math.abs(target - centre));
    } else {
      creature.state = CRAB_STATE.WALK;
      creature.x += creature.facing * knobs.walk;
    }

    if (creature.x < left + 1) {
      creature.x = left + 1;
      creature.facing = 1;
    } else if (creature.x > right - 1 - WIDTH) {
      creature.x = right - 1 - WIDTH;
      creature.facing = -1;
    }
  },

  /**
   * The spill: everything it was holding, at once, in a fan across its own
   * width.
   *
   * On *any* hit and not only the kill, which is what makes two hit points
   * worth having — the first is the payday and the crab goes back to work with
   * a bare shell, the second is two hundred and fifty points and the end of it.
   *
   * **They come back as capsules and not as score**, and as capsules from the
   * run's own bag rather than the exact ones it took: the pips are a tally, not
   * a label, and every indirect capsule in this game is rolled the same way a
   * moth's is. A crab gives you back *four capsules*, which is the payout the
   * spec asked for; it does not give you back your LASER.
   */
  struck(creature, _by, effects) {
    const { spill } = gameConfig.creatures.crab;
    const load = held(creature);
    for (let index = 0; index < load; index++) {
      const from = creature.x + WIDTH / 2 + (index - (load - 1) / 2) * spill;
      effects.dropCapsule(
        Math.max(gameConfig.field.left + spill, Math.min(gameConfig.field.right - spill, from)),
        creature.y,
      );
    }
    creature.phase = 0;
    return false;
  },

  /**
   * The four slots in the shell, filled every frame.
   *
   * An empty one takes the shell's own tone and disappears into it; a full one
   * is gold, which is this machine's colour for "this is worth something" and
   * is exactly what a pip on a crab's back means.
   *
   * Both flash thresholds by hand, as every drawn mark has to: `drawCreature`
   * whites the whole bitmap above half a flash and only the outline below it,
   * and a pip is shell rather than outline — so it goes white with the body and
   * not before, or a struck crab is a white shell with four red holes in it.
   */
  decorate(pixel, creature, _frame, demade, unit) {
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const hot = creature.flashTicks > gameConfig.creatures.flashTicks / 2;
    const white = canvasPalette.deathFlash;
    const empty = hot ? white : demade ? canvasPalette.demakeGround : BRICK_COLORS["1"].flat;
    const full = hot ? white : demade ? canvasPalette.demakeInk : canvasPalette.chainSheen;
    const load = held(creature);
    for (const [index, column] of SLOTS.entries()) {
      paintRows(pixel, SLOT, x + column, y + SLOT_ROW, index < load ? full : empty, unit);
    }
  },
};
