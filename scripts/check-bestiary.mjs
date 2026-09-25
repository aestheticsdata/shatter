// SHA-247 guard for THE BESTIARY's deal across the 49 levels.
//
// The four species the game shipped with ended up on 121 of 125 pins because
// nothing counted them: MOTH alone was on 39. This checks the rules the re-deal
// was made to, and exits non-zero with a report when one breaks:
//
//   1. Six to eight creatures on every ordinary level (SHA-259 doubled the deal). The veils keep their
//      brood and carry no pins.
//   2. No species on two consecutive levels — including across the wrap back to
//      level 1, which is the same rule `check:backgrounds` holds the themes to.
//   3. No species over the cap. The cap is the point of the exercise.
//   4. The three that take the deck away from the player — SLUG, JELLYFISH and
//      CRAB — not before the third series, which opens after the second veil.
//   5. The named slots: FIREFLY on HEART, WISP on VORTEX, BAT on BOLT.
//   6. Every ordinary species dealt at least once.
//   7. Every pin where its species can live: a frog or a snail standing on a
//      brick with air above it, a bat hanging under a brick with air below it,
//      the band's creatures under the wall, and all of them inside the field.
//      A pin in the wrong place is not an error anywhere else — the creature
//      simply sits in mid-air, or inside a brick where no ball can reach it.
//
// Run with: pnpm run check:bestiary
import { registerHooks } from "node:module";
import { URL } from "node:url";

// The source uses the project's TS path aliases; map them the way Vite does.
const ALIASES = ["@audio", "@core", "@entities", "@input", "@interfaces", "@render", "@shared", "@state", "@ui", "@"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const alias = ALIASES.find((name) => specifier === name || specifier.startsWith(`${name}/`));
    if (!alias) {
      return nextResolve(specifier, context);
    }
    const tail = specifier.slice(alias.length);
    const directory = alias === "@" ? "" : `${alias.slice(1)}`;
    const path = `../src/${directory}${tail}`;
    return { url: new URL(path.endsWith(".ts") ? path : `${path}.ts`, import.meta.url).href, shortCircuit: true };
  },
});

const { LEVELS, VEIL_LEVELS } = await import("../src/core/levels/levels.ts");
const { CREATURE } = await import("../src/interfaces/creatures.ts");
const { SPECIES } = await import("../src/entities/creatures/species/index.ts");
const { gameConfig } = await import("../src/core/config/GameConfig.ts");

const CAP = 40;
const PER_LEVEL = { min: 6, max: 8 };
const DECK_TAKERS = [CREATURE.SLUG, CREATURE.JELLYFISH, CREATURE.CRAB];
const NAMED = { HEART: CREATURE.FIREFLY, VORTEX: CREATURE.WISP, BOLT: CREATURE.BAT };
const BOSSES = [
  CREATURE.SPIDER_QUEEN,
  CREATURE.MOTH_MOTHER,
  CREATURE.FROG_KING,
  CREATURE.SNAIL_ELDER,
  CREATURE.MAN_O_WAR,
];
// On a brick, under a brick, or in the band under the wall. The rest go
// anywhere in the field: the moth orbits the eye, the spider drops from the
// ceiling, and the wisp, the firefly and the jellyfish are in the air.
const ON_TOP = [CREATURE.FROG, CREATURE.SNAIL];
const UNDER = [CREATURE.BAT];
const BAND = [CREATURE.BEETLE, CREATURE.CRAB, CREATURE.VINE, CREATURE.WOODPECKER];

const { left, top, brickWidth, brickHeight, columns } = gameConfig.grid;
const failures = [];
const fail = (message) => failures.push(message);
const label = (index) => `${index + 1} ${LEVELS[index].name}`;
const kindsOn = (level) => new Set((level.creatures ?? []).map((pin) => pin.kind));

const counts = {};
LEVELS.forEach((level, index) => {
  const pins = level.creatures ?? [];
  for (const pin of pins) {
    counts[pin.kind] = (counts[pin.kind] ?? 0) + 1;
  }

  // 1
  if (!level.observer && (pins.length < PER_LEVEL.min || pins.length > PER_LEVEL.max)) {
    fail(`${label(index)}: ${pins.length} creatures, wants ${PER_LEVEL.min}-${PER_LEVEL.max}`);
  }

  // 2
  const next = (index + 1) % LEVELS.length;
  for (const kind of kindsOn(level)) {
    if (kindsOn(LEVELS[next]).has(kind)) {
      fail(`${label(index)} and ${label(next)} both carry ${kind}`);
    }
  }

  // 4
  if (index < VEIL_LEVELS[1]) {
    for (const pin of pins) {
      if (DECK_TAKERS.includes(pin.kind)) {
        fail(`${label(index)}: ${pin.kind} before the third series`);
      }
    }
  }

  // 7
  const rows = level.rows;
  const standing = (column, row) =>
    row >= 0 && row < rows.length && rows[row][column] !== "." && rows[row][column] !== undefined;
  const floor = top + rows.length * brickHeight;
  for (const pin of pins) {
    const { width, height } = SPECIES[pin.kind];
    const at = `${label(index)}: ${pin.kind} at ${pin.x},${pin.y}`;
    const column = Math.floor((pin.x + width / 2 - left) / brickWidth);
    if (
      pin.x < gameConfig.field.left ||
      pin.x + width > gameConfig.field.right ||
      pin.y < 0 ||
      pin.y > gameConfig.paddle.y
    ) {
      fail(`${at} is outside the field`);
    }
    if (ON_TOP.includes(pin.kind)) {
      const row = (pin.y + height - top) / brickHeight;
      if (!Number.isInteger(row) || !standing(column, row) || standing(column, row - 1)) {
        fail(`${at} is not standing on a brick with air above it`);
      }
    }
    if (UNDER.includes(pin.kind)) {
      const row = (pin.y - top) / brickHeight - 1;
      if (
        !Number.isInteger(row) ||
        column < 0 ||
        column >= columns ||
        !standing(column, row) ||
        standing(column, row + 1)
      ) {
        fail(`${at} is not hanging under a brick with air below it`);
      }
    }
    if (BAND.includes(pin.kind) && pin.y < floor) {
      fail(`${at} is inside the wall, which ends at ${floor}`);
    }
  }
});

// 3
for (const [kind, count] of Object.entries(counts)) {
  if (count > CAP) {
    fail(`${kind} is on ${count} pins, over the cap of ${CAP}`);
  }
}

// 5
for (const [name, kind] of Object.entries(NAMED)) {
  const level = LEVELS.find((candidate) => candidate.name === name);
  if (!level || !kindsOn(level).has(kind)) {
    fail(`${name} is ${kind}'s named slot and does not carry it`);
  }
}

// 6
for (const kind of Object.values(CREATURE)) {
  if (!BOSSES.includes(kind) && !counts[kind]) {
    fail(`${kind} is dealt nowhere`);
  }
}

const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
const tally = Object.entries(counts)
  .toSorted((a, b) => b[1] - a[1])
  .map(([kind, count]) => `${kind} ${count}`)
  .join(" · ");

if (failures.length > 0) {
  console.error(`The bestiary's deal breaks ${failures.length} rule(s):\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
console.log(`${total} creatures across ${LEVELS.filter((level) => !level.observer).length} levels: ${tally}.`);
console.log("Six to eight a level, no species on two neighbours, none over the cap, every pin where it can live.");
