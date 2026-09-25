import { gameConfig } from "@core/config/GameConfig";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * JELLYFISH (SHA-245): it goes for the deck.
 *
 * It pulses upward and sinks between the pulses, and the sink is the longer of
 * the two — so it travels **down** on balance, out of the wall and toward the
 * rail, which is how a jellyfish actually moves. Reaching the deck it stings:
 * the deck goes numb, half speed and not frozen, for about a second. Then it
 * pulses back up to where the level put it and comes down again.
 *
 * **The descent is the window.** A dozen seconds of a slow, readable thing
 * drifting at you, worth a lot to whoever pops it on the way — and if nobody
 * does, it hovers just over the rail for a moment, still hunting the deck,
 * where the ball coming home will often take it anyway.
 *
 * The state is on the object, not in a panel: the tentacle tips are lit while
 * it is armed, going down, and go dull when it has spent itself and is on its
 * way back up — so the player can tell a jellyfish that is coming for them
 * from one that is leaving without having watched which way it was going.
 */
export const JELLYFISH_STATE = { SINK: "sink", HOVER: "hover", RISE: "rise" } as const;

const WIDTH = 9;
/**
 * Thirteen, of which the bell is six: the rest is the tentacles, blank in the
 * bitmap and drawn by `decorate`, because they trail the creature's own pulse
 * and `drawCreature` picks frames off the field's clock. The box keeps them —
 * a sting is delivered by the tips, so the tips are what a ball can hit.
 */
const HEIGHT = 13;

/**
 * The bell: a dome with a light on its crown, a shaded flank, and a scalloped
 * rim along the bottom where the tentacles hang from.
 */
export const JELLYFISH_BELL: readonly string[] = [
  "..kkkkk..",
  ".kpllppk.",
  "kpllpppmk",
  "kplppppmk",
  "kppppppmk",
  "kkmkmkmkk",
  ".........",
  ".........",
  ".........",
  ".........",
  ".........",
  ".........",
  ".........",
];

/** The rim row, where every strand starts. */
const RIM = 5;
/** The four strands, as columns of the bell. Under the rim's four gaps. */
const STRANDS = [1, 3, 5, 7] as const;

/**
 * Where on its beat it is, 0 to 1, and whether that is the thrust.
 *
 * The beat restarts on every change of state (the clock does), so a jellyfish
 * turning round at the rail turns round on a pulse — the thing a jellyfish
 * pushes off with — rather than drifting into the new direction.
 */
function beat(creature: Creature): { cycle: number; thrust: boolean } {
  const { pulseTicks, thrustShare } = gameConfig.creatures.jellyfish;
  const cycle = (((creature.clock / pulseTicks + creature.phase) % 1) + 1) % 1;
  return { cycle, thrust: cycle < thrustShare };
}

/**
 * The vertical speed this tick: a push up on the thrust, shaped as half a sine
 * so it arrives and leaves; then a sink that eases in over the first third of
 * the rest. `rise` and `sink` are the state's pair, and their balance is what
 * decides which way it goes on balance.
 */
function pulse(creature: Creature, rise: number, sink: number): number {
  const { thrustShare } = gameConfig.creatures.jellyfish;
  const { cycle, thrust } = beat(creature);
  if (thrust) {
    return -rise * Math.sin((cycle / thrustShare) * Math.PI);
  }
  const into = (cycle - thrustShare) / (1 - thrustShare);
  return sink * Math.min(1, into * 3);
}

/** Toward a target, no faster than `speed`. */
function toward(from: number, to: number, speed: number): number {
  return from + Math.max(-speed, Math.min(speed, (to - from) * 0.05));
}

export const JELLYFISH: Species = {
  kind: CREATURE.JELLYFISH,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.jellyfish.hitPoints;
  },
  get points() {
    return gameConfig.creatures.jellyfish.points;
  },
  get killPoints() {
    return gameConfig.creatures.jellyfish.killPoints;
  },
  tip: "POP IT ON THE WAY DOWN",
  lore: "IT PULSES UP AND SINKS DOWN, AND THE SINKING WINS, SO IT DRIFTS OUT OF THE WALL AND STRAIGHT FOR YOUR DECK. ITS TENTACLE TIPS GLOW WHILE IT IS ARMED. ONE TOUCH AND THE DECK GOES NUMB AND SLOW. THEN IT PULSES HOME, DULL AND SPENT, TO START THE HUNT ALL OVER AGAIN.",
  // Water. The ball goes through it and pops it on the way, which is the whole
  // answer this species asks for.
  solid: false,
  frames: [JELLYFISH_BELL],
  frameTicks: 12,
  // THE TRAP's pink, the red brick's three with the wall's white for the
  // light on the crown. Pink is what the house paints the things that take
  // something from the player, and this one takes the deck.
  palette: {
    k: BRICK_COLORS["1"].dark,
    p: BRICK_COLORS["1"].light,
    m: BRICK_COLORS["1"].flat,
    l: canvasPalette.wallLight,
  },
  // Outline, rim and the crown's light to ink; the bell to ground. What comes
  // back on the tube is a hollow dome with a lit crown and a toothed rim.
  demade: {
    k: canvasPalette.demakeInk,
    p: canvasPalette.demakeGround,
    m: canvasPalette.demakeInk,
    l: canvasPalette.demakeInk,
  },
  outline: "k",

  spawn(creature) {
    creature.state = JELLYFISH_STATE.SINK;
    // Off the pin, so two on one level never beat in time.
    creature.phase = ((creature.home.x * 7 + creature.home.y * 13) % 100) / 100;
  },

  step(creature, sight, effects) {
    const config = gameConfig.creatures.jellyfish;
    const { left, right, top } = gameConfig.field;
    const { deck } = sight;
    const deckCenter = (deck.left + deck.right) / 2;
    const center = creature.x + WIDTH / 2;
    // Where the tips touch the deck's top: the floor it comes down to. The
    // deck's live line and not the rail's, so a deck TIDE has floated up
    // meets it higher.
    const floor = deck.y + 1 - HEIGHT;

    if (creature.state === JELLYFISH_STATE.RISE) {
      creature.y += pulse(creature, config.riseUp, config.riseSink);
      creature.x = toward(center, creature.home.x + WIDTH / 2, config.drift) - WIDTH / 2;
      if (creature.y <= creature.home.y) {
        creature.y = creature.home.y;
        creature.state = JELLYFISH_STATE.SINK;
        creature.clock = 0;
      }
    } else {
      // Sinking and hovering both hunt the deck, a little harder on the thrust
      // — a jellyfish steers with the push, not the drift.
      //
      // Toward a point between its own pin and the deck rather than the deck
      // itself: two on one level would otherwise meet over the deck and come
      // down as one stacked creature. Each keeps a lane, and the lanes close
      // in on the deck without ever merging.
      const push = beat(creature).thrust ? 1.5 : 0.5;
      const lane = creature.home.x + WIDTH / 2 + (deckCenter - creature.home.x - WIDTH / 2) * config.pull;
      creature.x = toward(center, lane, config.drift * push) - WIDTH / 2;
      if (creature.state === JELLYFISH_STATE.SINK) {
        creature.y += pulse(creature, config.sinkUp, config.sinkDown);
        if (creature.y >= floor) {
          creature.y = floor;
          creature.state = JELLYFISH_STATE.HOVER;
          creature.clock = 0;
        }
      } else {
        // Held over the rail on its own pulse: a bob of a pixel or two, and
        // the tips never quite lift off the deck's line.
        creature.y = floor - Math.abs(pulse(creature, config.hoverBob, 0));
        if (creature.clock >= config.hoverTicks) {
          creature.state = JELLYFISH_STATE.RISE;
          creature.clock = 0;
        }
      }
      const tips = creature.y + HEIGHT;
      if (tips >= deck.y && creature.x + 1 < deck.right && creature.x + WIDTH - 1 > deck.left) {
        effects.stingDeck(config.stingTicks);
        creature.state = JELLYFISH_STATE.RISE;
        creature.clock = 0;
      }
    }
    creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x));
    creature.y = Math.max(top + 1, creature.y);
  },

  // One hit point: the hit is the kill, and nothing about it is special.
  struck() {
    return false;
  },

  /**
   * The tentacles, trailing the pulse this creature owns.
   *
   * On the thrust they stream straight and long behind the bell — the body is
   * pushing, and what hangs off it is dragged into line. On the sink they
   * relax, shorten and sway, more at the tips than at the root. The tips are
   * the held cue: lit while it is armed, and on the last stretch above the
   * deck they flicker, which is the moment the player has to either move or
   * take the shot. Spent and rising, they are the strand's own colour.
   */
  decorate(pixel, creature, _frame, demade, unit) {
    const { armedFlickerAt, flickerTicks } = gameConfig.creatures.jellyfish;
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const { cycle, thrust } = beat(creature);
    const armed = creature.state !== JELLYFISH_STATE.RISE;
    const white = creature.flashTicks > 0;
    const strand = white ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS["1"].light;
    const near = creature.state === JELLYFISH_STATE.HOVER || HEIGHT + creature.y > gameConfig.paddle.y - armedFlickerAt;
    const flicker = near && Math.floor(creature.clock / flickerTicks) % 2 === 1;
    const tip = white
      ? canvasPalette.deathFlash
      : demade
        ? canvasPalette.demakeInk
        : armed && !flicker
          ? canvasPalette.wallLight
          : BRICK_COLORS["1"].light;
    const length = thrust ? HEIGHT - RIM - 1 : HEIGHT - RIM - 3;
    // A strand a third of a game pixel narrower in HD than a whole one: hair,
    // not a bar, beside a bell baked at the fine grid.
    const thickness = unit > 1 ? 2 / unit : 1;
    const steps = length * unit;
    for (const [index, column] of STRANDS.entries()) {
      for (let step = 0; step < steps; step += 1) {
        const depth = step / unit;
        // The sway grows with depth, and on the thrust there is none: the
        // strands are pulled straight behind the push.
        const reach = thrust ? 0 : (depth / length) * 1.2;
        const sway = Math.sin(cycle * Math.PI * 2 + depth * 0.9 + index * 1.7) * reach;
        const offset = Math.round(sway * unit) / unit;
        // On the tube a spent strand is dotted: a one-bit screen has no dull
        // pink, and a broken line is the truest thing it can say about a sting
        // that is not there.
        if (demade && !armed && Math.floor(depth) % 2 === 1) {
          continue;
        }
        const last = depth >= length - 2;
        pixel(x + column + offset, y + RIM + 1 + depth, thickness, 1 / unit, last ? tip : strand);
      }
    }
  },
};
