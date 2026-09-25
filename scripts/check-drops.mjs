// SHA-148 guard for the capsule drop bag.
//
// Capsules are drawn without replacement, not rolled against weights, and the
// whole point of that is a promise weights could not make: no capsule is ever
// absent for long. This checks the invariants that promise rests on, and exits
// non-zero with a report when one breaks:
//
//   1. A pass is the whole roster. Drawing exactly one bag's worth yields every
//      capsule, each exactly as many times as `TIER_TICKETS` says — no capsule
//      missing, none doubled, nothing left over.
//   2. The drought is bounded. Across a long run, the gap between two
//      appearances of any capsule never exceeds two passes: the worst case is
//      the first ticket of one pass and the last of the next.
//   3. An exclusion skips, it does not delete. A barred capsule never comes out
//      while the bar holds, its ticket is still in the bag afterwards, and it
//      comes out once the bar lifts. This is what keeps level 1's DEMAKE ban
//      from quietly spending the one ticket the pass had of it.
//   4. The first level's DEMAKE is a promise, not a roll (SHA-154). Every wall
//      it builds holds exactly one, always in the third, fourth or fifth row
//      from the bottom, never in the two the opening rally eats — and the
//      levels after it are handed back untouched.
//   5. The tier shares are what the config claims — in particular traps near
//      the 17 % the roster has always been aimed at.
//   6. A pinned electron orbits a real brick (SHA-184). A level's inhabitants
//      are placed by cell the way its seeded drops are, and an electron pinned
//      on air would be a shield round nothing, freed as a photon on its first
//      tick.
//
// Run with: pnpm run check:drops
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

const { POWER_UPS, POWER_UP_DROP_TICKETS, POWER_UP_IDS, TIER_TICKETS } = await import("../src/core/config/powerUps.ts");
const { DropBag } = await import("../src/entities/powerups/DropBag.ts");
const { isBrickKind } = await import("../src/core/config/bricks.ts");
const { LEVELS, levelAt, wallFor } = await import("../src/core/levels/levels.ts");
const { BrickGrid } = await import("../src/entities/bricks/BrickGrid.ts");

// Bricks per level averaged over the roster, times the chance one holds anything.
// Only used to phrase a pass in levels; nothing is asserted against it.
const DROPS_PER_LEVEL = 11.6;
const TRAP_SHARE_MIN = 0.15;
const TRAP_SHARE_MAX = 0.19;
const LONG_RUN_PASSES = 200;

const BAG_SIZE = POWER_UP_IDS.reduce((sum, kind) => sum + POWER_UP_DROP_TICKETS[kind], 0);
const failures = [];

// ---- 1. One pass is the whole roster, at its exact ticket counts. ------------
{
  const bag = new DropBag();
  const drawn = new Map();
  for (let draw = 0; draw < BAG_SIZE; draw++) {
    const kind = bag.draw();
    drawn.set(kind, (drawn.get(kind) ?? 0) + 1);
  }
  for (const kind of POWER_UP_IDS) {
    const expected = POWER_UP_DROP_TICKETS[kind];
    const actual = drawn.get(kind) ?? 0;
    if (actual !== expected) {
      failures.push(`one pass gave ${kind} ${actual} time(s), expected exactly ${expected}`);
    }
  }
  if (bag.remaining.length !== 0) {
    failures.push(`a spent pass left ${bag.remaining.length} ticket(s) in the bag, expected 0`);
  }
}

// ---- 2. No capsule can go missing for longer than two passes. ---------------
const observed = new Map(POWER_UP_IDS.map((kind) => [kind, 0]));
let worstGap = { kind: null, gap: 0 };
{
  const bag = new DropBag();
  const lastSeen = new Map();
  const total = BAG_SIZE * LONG_RUN_PASSES;
  for (let draw = 0; draw < total; draw++) {
    const kind = bag.draw();
    observed.set(kind, observed.get(kind) + 1);
    const previous = lastSeen.get(kind);
    if (previous !== undefined && draw - previous > worstGap.gap) {
      worstGap = { kind, gap: draw - previous };
    }
    lastSeen.set(kind, draw);
  }
  // First ticket of one pass to last ticket of the next, and no further.
  const ceiling = BAG_SIZE * 2 - 1;
  if (worstGap.gap > ceiling) {
    failures.push(`${worstGap.kind} went ${worstGap.gap} draws unseen, past the ${ceiling}-draw ceiling`);
  }
  for (const kind of POWER_UP_IDS) {
    if (observed.get(kind) === 0) {
      failures.push(`${kind} never appeared in ${total} draws`);
    }
  }
}

// ---- 3. A barred capsule is skipped, kept, and drawn once the bar lifts. ----
{
  const bag = new DropBag();
  const barred = ["D"];
  for (let draw = 0; draw < BAG_SIZE; draw++) {
    const kind = bag.draw(barred);
    if (barred.includes(kind)) {
      failures.push(`${kind} came out of a draw that barred it`);
      break;
    }
  }
  if (!bag.remaining.includes("D")) {
    failures.push("D's ticket was discarded rather than skipped: it is gone from the bag");
  }
  // And it is owed the very next draw that allows it, not merely eventually.
  const next = bag.draw();
  if (next !== "D") {
    failures.push(`the draw after the bar lifted gave ${next}, not the skipped D`);
  }
}

// A shower's own exclusions behave the same way: RAIN and METEOR are barred from
// RAIN's four capsules, and must survive to fall out of a brick afterwards.
{
  const bag = new DropBag();
  const barred = ["R", "MT"];
  for (let draw = 0; draw < BAG_SIZE; draw++) {
    const kind = bag.draw(barred);
    if (barred.includes(kind)) {
      failures.push(`${kind} came out of a shower that barred it`);
      break;
    }
  }
  for (const kind of barred) {
    if (!bag.remaining.includes(kind)) {
      failures.push(`${kind} was discarded by a shower's exclusion rather than skipped`);
    }
  }
}

// ---- 3b. The two capsules that must not lose visibility. -------------------
// DEMAKE and GIANT draw at a common's count on purpose: both already did so
// under the weighted roll, and a rare's single ticket would be 1.61 % against
// the 3.05 % they ship with today — worse over the first four levels, which is
// the horizon a session actually reaches. This came within one commit of
// shipping as a regression on the two capsules the user had named, so it is a
// guard and not a comment.
for (const kind of ["D", "GI"]) {
  if (POWER_UP_DROP_TICKETS[kind] !== TIER_TICKETS.common) {
    failures.push(
      `${kind} draws ${POWER_UP_DROP_TICKETS[kind]} ticket(s), not a common's ${TIER_TICKETS.common}: ` +
        `it had a weight exception and must keep its visibility`,
    );
  }
}

// ---- 4. The first level hands a DEMAKE over, and never out of the front. ----
// The seed is the whole of SHA-154: DEMAKE draws at a common's rate and is still
// the capsule the user says they never meet, so level 1 stops rolling for it and
// pins one. What is asserted is the promise *and* its two edges — that it lands
// deep enough not to fire in the opening rally, and that the rest of the run is
// handed back exactly as it was.
const SEED_BUILDS = 2000;
{
  const first = levelAt(0);
  const rowsFromBottom = new Set();
  const ownDemakes = (first.drops ?? []).filter((drop) => drop.kind === "D").length;
  for (let build = 0; build < SEED_BUILDS; build++) {
    const seeded = (wallFor(0).drops ?? []).filter((drop) => drop.kind === "D");
    if (seeded.length !== ownDemakes + 1) {
      failures.push(`a first-level wall held ${seeded.length} DEMAKE(s), not the one it is promised`);
      break;
    }
    const [drop] = seeded;
    const fromBottom = first.rows.length - drop.row;
    rowsFromBottom.add(fromBottom);
    if (fromBottom < 3 || fromBottom > 5) {
      failures.push(`the first level's DEMAKE was seeded ${fromBottom} row(s) from the bottom, outside 3-5`);
      break;
    }
    if (!isBrickKind(first.rows[drop.row]?.[drop.column] ?? ".")) {
      failures.push(`the first level's DEMAKE was seeded on air at row ${drop.row}, column ${drop.column}`);
      break;
    }
  }
  // All three rows over that many builds, or the pick is not the uniform draw it
  // is written as — a rule that only ever fires on one row is a hardcoded cell
  // wearing a random one's clothes.
  for (const fromBottom of [3, 4, 5]) {
    if (!rowsFromBottom.has(fromBottom)) {
      failures.push(`row ${fromBottom} from the bottom never took the seed over ${SEED_BUILDS} walls`);
    }
  }
}

// And the wall built from it really holds one, seeded. A drop in the definition
// that no cell ends up carrying would be a promise kept on paper only — this is
// the seam between `wallFor` and the grid, and the reason the assertion builds a
// `BrickGrid` rather than trusting the list it was handed.
{
  const grid = new BrickGrid();
  // Rolls nothing, so the only capsule the wall can hold is the seeded one.
  grid.load(wallFor(0), () => null);
  const held = grid.rows.flatMap((row, rowIndex) =>
    row.map((cell, column) => ({ cell, row: rowIndex, column })).filter((entry) => entry.cell?.capsule === "D"),
  );
  if (held.length !== 1) {
    failures.push(`the first level's wall holds ${held.length} DEMAKE cells, not the one it is promised`);
  } else if (!held[0].cell.seeded) {
    failures.push("the first level's DEMAKE is on the wall but not marked seeded: an indirect kill would drop nothing");
  } else if (levelAt(0).rows.length - held[0].row < 3) {
    failures.push(`the built wall put its DEMAKE ${levelAt(0).rows.length - held[0].row} row(s) from the bottom`);
  }
}

// Every level after the first is handed back as authored: the guarantee is added
// to level 1, never taken out of the run behind it.
// `LEVELS.length` is the wrap: a long run comes back round to SUNRISE's layout,
// and that visit is not the run's first level and gets no seed.
for (const level of [1, 2, 7, LEVELS.length]) {
  if (wallFor(level) !== levelAt(level)) {
    failures.push(`level ${level + 1}'s wall was rewritten by the first level's seed`);
  }
}

// ---- 6. A pinned electron orbits a real brick. -------------------------------
let pinnedElectrons = 0;
for (const level of LEVELS) {
  for (const pin of level.inhabitants ?? []) {
    if (pin.kind !== "electron" || (pin.row === undefined && pin.column === undefined)) {
      continue;
    }
    pinnedElectrons++;
    if (pin.row === undefined || pin.column === undefined) {
      failures.push(`${level.name} pins an electron with half a cell: row ${pin.row}, column ${pin.column}`);
      continue;
    }
    if (!isBrickKind(level.rows[pin.row]?.[pin.column] ?? ".")) {
      failures.push(`${level.name} pins an electron on air at row ${pin.row}, column ${pin.column}`);
    }
  }
}

// ---- 5. Tier shares, and traps in particular. ------------------------------
const tierRows = [];
for (const [tier, tickets] of Object.entries(TIER_TICKETS)) {
  const rows = POWER_UPS.filter((definition) => definition.tier === tier);
  // Summed per row rather than `rows.length * tickets`: DEMAKE and GIANT carry a
  // common's count inside the trap and rare tiers, so the tier's own number is
  // not its share of the bag.
  const tierTickets = rows.reduce((sum, definition) => sum + POWER_UP_DROP_TICKETS[definition.id], 0);
  const share = tierTickets / BAG_SIZE;
  const drawnShare =
    rows.reduce((sum, definition) => sum + observed.get(definition.id), 0) / (BAG_SIZE * LONG_RUN_PASSES);
  tierRows.push([
    tier,
    `${rows.length} rows`,
    tierTickets === rows.length * tickets ? `x${tickets}` : `x${tickets}+2`,
    `${((tickets / BAG_SIZE) * 100).toFixed(2)}% each`,
    `${(share * 100).toFixed(1)}% of the bag`,
    `${(drawnShare * 100).toFixed(1)}% drawn`,
  ]);
  if (tier === "trap" && (share < TRAP_SHARE_MIN || share > TRAP_SHARE_MAX)) {
    failures.push(
      `traps are ${(share * 100).toFixed(1)}% of the bag, outside the intended ` +
        `${TRAP_SHARE_MIN * 100}-${TRAP_SHARE_MAX * 100}%`,
    );
  }
}

const widths = tierRows[0].map((_, column) => Math.max(...tierRows.map((row) => row[column].length)));
for (const row of tierRows) {
  console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
}

console.log(
  `\n${POWER_UP_IDS.length} capsules, ${BAG_SIZE} tickets a pass ` +
    `(~${(BAG_SIZE / DROPS_PER_LEVEL).toFixed(1)} levels at ${DROPS_PER_LEVEL} drops a level)`,
);
console.log(
  `worst drought over ${LONG_RUN_PASSES} passes: ${worstGap.kind} at ${worstGap.gap} draws ` +
    `(~${(worstGap.gap / DROPS_PER_LEVEL).toFixed(1)} levels), ceiling ${BAG_SIZE * 2 - 1}`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} drop distribution failure(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  "Every capsule comes out of each pass, no drought outlasts two, level 1 always holds a DEMAKE, " +
    `and all ${pinnedElectrons} pinned electrons orbit a brick.`,
);
