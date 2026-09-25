import { gameConfig } from "@core/config/GameConfig";
import { doubled } from "@entities/creatures/bitmap";
import { JELLYFISH, JELLYFISH_BELL } from "@entities/creatures/species/jellyfish";
import { CREATURE } from "@interfaces/creatures";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { Creature, Species } from "@entities/creatures/Creature";

/**
 * THE MAN O' WAR (SHA-130): the boss at the end of level 45, BRIDGE.
 *
 * The jellyfish go for the deck; he is the same hunter twice the size, and
 * everything that follows from the size follows. The bell is twice as wide, so
 * the tentacles under it are a curtain the width of half a deck rather than a
 * fringe; they are longer, so they reach the deck from higher up; and a sting
 * from that much of him numbs the deck for twice as long. He is slower on the
 * beat, because a bigger body pushes more water.
 *
 * The fight is keeping him off you. He hangs at the top, then comes down the
 * way his children do — pulsing up, sinking further, sliding after the deck —
 * and **a hit knocks the fight out of him**: every one sends him pulsing back
 * up to the top, spent, before he comes down again. Ten hits, and each one
 * earned against a thing drifting at the paddle.
 *
 * The held cue is his children's: the tentacle tips are lit while he is armed
 * and coming down, flicker on the last stretch over the rail, and go dull when
 * he is spent and on his way back up.
 */
const BELL = doubled(JELLYFISH_BELL.slice(0, 6));
const WIDTH = BELL[0].length;
/** How far the tentacles hang under the bell: twice his children's and then some. */
const TENTACLES = 20;
const HEIGHT = BELL.length + TENTACLES;

/** The rim row, where every strand starts, and the strands' columns under it. */
const RIM = BELL.length - 1;
const STRANDS = [2, 6, 10, 14] as const;

const MAN_STATE = { ENTER: "enter", REST: "rest", SINK: "sink", HOVER: "hover", RISE: "rise" } as const;
const STING = "STING";

function beat(creature: Creature): { cycle: number; thrust: boolean } {
  const { pulseTicks, thrustShare } = gameConfig.creatures.manOWar;
  const cycle = (((creature.clock / pulseTicks) % 1) + 1) % 1;
  return { cycle, thrust: cycle < thrustShare };
}

/** JELLYFISH's stroke at his beat: a push up shaped as half a sine, then a sink easing in. */
function pulse(creature: Creature, rise: number, sink: number): number {
  const { thrustShare } = gameConfig.creatures.manOWar;
  const { cycle, thrust } = beat(creature);
  if (thrust) {
    return -rise * Math.sin((cycle / thrustShare) * Math.PI);
  }
  const into = (cycle - thrustShare) / (1 - thrustShare);
  return sink * Math.min(1, into * 3);
}

function toward(from: number, to: number, speed: number): number {
  return from + Math.max(-speed, Math.min(speed, (to - from) * 0.05));
}

export const MAN_O_WAR: Species = {
  kind: CREATURE.MAN_O_WAR,
  width: WIDTH,
  height: HEIGHT,
  get hitPoints() {
    return gameConfig.creatures.manOWar.hitPoints;
  },
  get points() {
    return gameConfig.creatures.manOWar.points;
  },
  get killPoints() {
    return gameConfig.creatures.manOWar.killPoints;
  },
  tip: "EVERY HIT SENDS HIM BACK UP",
  lore: "THE FATHER OF EVERY JELLYFISH, TWICE AS WIDE, WITH A CURTAIN OF TENTACLES TWICE AS LONG. HE SINKS STRAIGHT FOR YOUR DECK, AND ONE TOUCH NUMBS IT FOR TWICE AS LONG AS HIS CHILDREN CAN. EVERY HIT KNOCKS HIM BACK TO THE TOP, SPENT, BUT HE ALWAYS COMES DOWN AGAIN.",
  solid: false,
  frames: [[...BELL, ...Array.from({ length: TENTACLES }, () => ".".repeat(WIDTH))]],
  frameTicks: 12,
  palette: JELLYFISH.palette,
  demade: JELLYFISH.demade,
  outline: JELLYFISH.outline,

  spawn(creature) {
    creature.state = MAN_STATE.ENTER;
  },

  step(creature, sight, effects) {
    const knobs = gameConfig.creatures.manOWar;
    const { left, right, width } = gameConfig.field;
    const { deck } = sight;
    const centre = creature.x + WIDTH / 2;
    const floor = deck.y + 1 - HEIGHT;
    const settle = (state: string): void => {
      creature.state = state;
      creature.clock = 0;
    };
    switch (creature.state) {
      case MAN_STATE.ENTER: {
        creature.y = Math.min(knobs.hangY, creature.y + knobs.enterSpeed);
        if (creature.y >= knobs.hangY) {
          settle(MAN_STATE.REST);
        }
        break;
      }
      case MAN_STATE.REST: {
        // Hung at the top on his own beat, drifting back to the middle.
        creature.y = knobs.hangY - Math.abs(pulse(creature, knobs.hoverBob, 0));
        creature.x = toward(centre, width / 2, knobs.drift) - WIDTH / 2;
        if (creature.clock >= knobs.restTicks) {
          settle(MAN_STATE.SINK);
        }
        break;
      }
      case MAN_STATE.RISE: {
        creature.y += pulse(creature, knobs.riseUp, knobs.riseSink);
        creature.x = toward(centre, width / 2, knobs.drift) - WIDTH / 2;
        if (creature.y <= knobs.hangY) {
          creature.y = knobs.hangY;
          settle(MAN_STATE.REST);
        }
        break;
      }
      default: {
        // Sinking and hovering both hunt the deck, harder on the thrust.
        const push = beat(creature).thrust ? 1.5 : 0.5;
        creature.x = toward(centre, (deck.left + deck.right) / 2, knobs.drift * push) - WIDTH / 2;
        if (creature.state === MAN_STATE.SINK) {
          creature.y += pulse(creature, knobs.sinkUp, knobs.sinkDown);
          if (creature.y >= floor) {
            creature.y = floor;
            settle(MAN_STATE.HOVER);
          }
        } else {
          creature.y = floor - Math.abs(pulse(creature, knobs.hoverBob, 0));
          if (creature.clock >= knobs.hoverTicks) {
            settle(MAN_STATE.RISE);
          }
        }
        const tips = creature.y + HEIGHT;
        if (tips >= deck.y && creature.x + 2 < deck.right && creature.x + WIDTH - 2 > deck.left) {
          effects.stingDeck(knobs.stingTicks);
          effects.pop(centre, deck.y - 10, STING, true);
          settle(MAN_STATE.RISE);
        }
      }
    }
    creature.x = Math.max(left + 1, Math.min(right - 1 - WIDTH, creature.x));
  },

  // A hit takes the fight out of him: back up to the top, spent. He dies of
  // his hit points, not of the hit.
  struck(creature) {
    if (creature.state !== MAN_STATE.ENTER) {
      creature.state = MAN_STATE.RISE;
      creature.clock = 0;
    }
    return false;
  },

  // His children's tentacles at his size: two pixels a strand, twenty long,
  // straight behind the thrust and swaying on the sink; the tips lit while he
  // is armed, flickering over the rail, dull when he is spent.
  decorate(pixel, creature, _frame, demade, unit) {
    const { armedFlickerAt, flickerTicks } = gameConfig.creatures.manOWar;
    const x = Math.round(creature.x);
    const y = Math.round(creature.y);
    const { cycle, thrust } = beat(creature);
    const armed = creature.state === MAN_STATE.SINK || creature.state === MAN_STATE.HOVER;
    const white = creature.flashTicks > 0;
    const strand = white ? canvasPalette.deathFlash : demade ? canvasPalette.demakeInk : BRICK_COLORS["1"].light;
    const near = creature.state === MAN_STATE.HOVER || HEIGHT + creature.y > gameConfig.paddle.y - armedFlickerAt;
    const flicker = armed && near && Math.floor(creature.clock / flickerTicks) % 2 === 1;
    const tip = white
      ? canvasPalette.deathFlash
      : demade
        ? canvasPalette.demakeInk
        : armed && !flicker
          ? canvasPalette.wallLight
          : BRICK_COLORS["1"].light;
    const length = thrust ? TENTACLES - 1 : TENTACLES - 5;
    const thickness = unit > 1 ? 4 / unit : 2;
    const steps = length * unit;
    for (const [index, column] of STRANDS.entries()) {
      for (let step = 0; step < steps; step += 1) {
        const depth = step / unit;
        const reach = thrust ? 0 : (depth / length) * 2.4;
        const sway = Math.sin(cycle * Math.PI * 2 + depth * 0.5 + index * 1.7) * reach;
        const offset = Math.round(sway * unit) / unit;
        if (demade && !armed && Math.floor(depth / 2) % 2 === 1) {
          continue;
        }
        const last = depth >= length - 3;
        pixel(x + column + offset, y + RIM + 1 + depth, thickness, 1 / unit, last ? tip : strand);
      }
    }
  },
};
