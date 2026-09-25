// The brick roster: one row per brick, and the single source of truth for
// everything the game knows about one. Adding a brick is adding a row here —
// the `BrickKind` union, the wall's points and hit points, `BRICK_COLORS`,
// `CHUNK_COLORS` and `DEMAKE_GROUND_TONES` in `@render/palette`, and the damage
// ramp `drawBrick` steps down all derive from it. Nothing else needs an edit.
//
// This module imports nothing on purpose, exactly as the capsule roster does:
// `@interfaces/types` re-exports `BrickKind` from here, and a cycle would put
// half the game's types behind a partially initialised module.

/**
 * Granite's speckle, and the one brick that has it.
 *
 * Every other body is a flat fill, which is what 30x12 of one colour has read
 * as since 1987. Stone cannot: a flat charcoal slab beside silver is a silver
 * brick somebody turned the lights off on, and the whole point of the maze
 * brick is that it is a different *material*.
 */
export interface BrickGrain {
  // 1 px flecks over the body — half in the sheen tone above it, half a notch
  // below the body's own, so the grain brackets whatever the body currently is
  // and stays visible down the whole ramp. Positions are hashed from the cell's
  // own seed: the same stone every frame, and no two neighbours tile.
  count: number;
  // Pits opened per hit taken, and cumulative — the pits a stage shows are the
  // previous stage's plus this one's, so the four states read as one brick being
  // chipped away rather than four different bricks.
  pitsPerHit: number;
  // The pit tone. Darker than every tone on the ramp, so a fracture is still
  // legible on a brick that has already gone dark.
  pit: string;
}

export interface BrickDefinition {
  // `string`, not the union — the union is inferred *from* these ids, and typing
  // it as itself would be circular. One character, because it is the character a
  // level row is typed in: this column is what `levels.ts` looks like.
  id: string;
  points: number;
  // Ball hits to kill, and the length of the damage ramp with it: a brick has
  // one visible body tone per hit point (see `wear`).
  hitPoints: number;
  // What one laser bolt takes off. 1 everywhere but granite, which a bolt drills
  // at 2: SUPER MAZE's two seeded LASER capsules are the level's way through, and
  // the cannons have to be worth more than the ball for that to be true.
  laserDamage: number;
  // The sheen along the top and left edges, the body, and the shade along the
  // bottom and right — the three tones every brick has been drawn from since the
  // first one. Only `flat` is checked against the playfield themes by
  // `pnpm run check:backgrounds`; the other two are 1 px bevels on it.
  light: string;
  flat: string;
  dark: string;
  // The body tones between `flat` and `dark`, one per hit point past the second:
  // empty for the one- and two-hit bricks, one for gold, two for granite. The
  // ramp is `[light, flat, ...wear, dark]` and every entry of it is a damage
  // state the player can read, which is the whole reason this column exists —
  // gold spent its first two years dying in three hits while showing two.
  wear: readonly string[];
  grain?: BrickGrain;
  // THE LID's kind mark (SHA-176): a line of rivets across the brick's middle,
  // in its own `dark`. Absent on every other row, exactly like `grain` — and it
  // carries its DEMAKE tell for free, because every brick's `dark` is a
  // `DEMAKE_GROUND_TONES` member: on the tube the rivets are ground holes
  // punched in an ink slab, which is granite's pits doing the same job.
  rivets?: true;
  // **`false` on the one brick that never holds one**, and absent everywhere
  // else, which is the whole of the rule — the shape `ObserverDefinition.oculi`
  // already uses for "a veil either has the plaques or it is the one that does
  // not". `BrickGrid.load` skips the roll for these cells rather than rolling
  // and discarding: the odds are per brick, and a cell that cannot pay is not a
  // brick the bag was asked about.
  capsules?: false;
}

// One row per brick, and it must stay one row: the points/hit-points ladder and
// the tone ramps are what this table exists to be read down, and neither can be
// seen down a column of eight ten-line blocks. That is what the ignore is for —
// the block is data, and there is nothing here for oxfmt to get right.
// oxfmt-ignore
export const BRICKS = [
  { id: "1", points: 60, hitPoints: 1, laserDamage: 1, light: "#ff8a9c", flat: "#e8384f", dark: "#8e1220", wear: [] },
  { id: "2", points: 70, hitPoints: 1, laserDamage: 1, light: "#ffc27a", flat: "#f07d10", dark: "#8a3d00", wear: [] },
  { id: "3", points: 80, hitPoints: 1, laserDamage: 1, light: "#fff59a", flat: "#ffcf1c", dark: "#8a6a00", wear: [] },
  { id: "4", points: 90, hitPoints: 1, laserDamage: 1, light: "#a6f0a6", flat: "#3fbf4f", dark: "#155c1f", wear: [] },
  { id: "5", points: 100, hitPoints: 1, laserDamage: 1, light: "#a8d8ff", flat: "#2d7fe0", dark: "#0b3a78", wear: [] },
  { id: "S", points: 150, hitPoints: 2, laserDamage: 1, light: "#dbe4ff", flat: "#8f9ac8", dark: "#3c50a0", wear: [] },
  // Gold's missing middle. `#ab8118` sits between the body and the shade on
  // gold's own ramp, which is what PAYDAY's gild has always been painted in —
  // see `GILD_RAMP` in `@render/CanvasRenderer`.
  { id: "G", points: 200, hitPoints: 3, laserDamage: 1, light: "#ffe9a0", flat: "#dfae2c", dark: "#7a5a08", wear: ["#ab8118"] },
  // Granite. Warm charcoal, deliberately nowhere near silver's pale blue-gray
  // (118 RGB from `S.flat`) and dark enough to read as stone while still holding
  // 3.7:1 against the brightest playfield tone — the floor every brick body has
  // to clear, and the one thing that stops this going properly black.
  //
  // Four hits, two laser bolts, and a body that steps down a four-tone ramp
  // while the pits multiply: the level it was built for is 53 of these, and a
  // player has to be able to tell a brick two hits in from one at three.
  { id: "R", points: 250, hitPoints: 4, laserDamage: 2, light: "#b9ab98", flat: "#857a6e", dark: "#3f3931", wear: ["#6d6359", "#564e46"], grain: { count: 14, pitsPerHit: 5, pit: "#241f1b" } },
  // The fence post, and **the one row here no level ever types**. Every brick
  // above it is a character in a level's alphabet; this one is planted by
  // FENCE, six of them on alternating columns a short hop over the deck, and
  // `levels.ts` has no use for it — `isBrickKind` accepts "F" only because the
  // union is inferred from this column and there is nowhere else for the fence
  // to be. It is a `BrickKind` so that every hitbox, laser bolt, splash, arc
  // and chip in the game already knows what to do with it.
  //
  // One hit, and **0 points on purpose**: a trap may not be a points pinata,
  // and PAYDAY and TURBO have to have nothing here to multiply. It holds no
  // capsule either, which the wall's own roll never offers it — the fence is
  // not built by `BrickGrid.load`.
  //
  // Green-stained timber against eight bodies of masonry, which is the whole
  // job of these three tones: the posts have to read as *not your wall* at the
  // moment they arrive, while the ball is still in the air. The body is the
  // capsule's own green a notch up, so the pill and what it plants are one
  // colour, and it clears 4.26:1 against the brightest playfield tone — room
  // over the 3:1 floor every brick body has to hold.
  { id: "F", points: 0, hitPoints: 1, laserDamage: 1, light: "#8ad152", flat: "#4a9e22", dark: "#1d4a0c", wear: [] },
  // THE LID (SHA-176), and **the only armour in the game that is not the
  // chamber's** — it is the Observer's own, which is why it is the one brick
  // that never pays a capsule. A wall of these hands the player nothing; the
  // ten silver bricks of its rim are the level's whole supply, which is what
  // makes the rim worth breaking on a level whose middle is the objective.
  //
  // Bronze rather than gold: it shares gold's `light` and `dark` and takes a
  // duller, greener body between them, so the two read as the same metal at
  // different ages — the coins in the wall and the plate over the eye. Two hits
  // and 250 points is silver's toughness at granite's price, which is what a
  // brick you are made to break fifty of should be.
  { id: "L", points: 250, hitPoints: 2, laserDamage: 1, light: "#ffe9a0", flat: "#c9a24a", dark: "#7a5a08", wear: [], rivets: true, capsules: false },
] as const satisfies readonly BrickDefinition[];

export type BrickKind = (typeof BRICKS)[number]["id"];

/**
 * Builds a `Record` keyed by brick id from one field of each definition — the
 * same helper, and the same single assertion, as the capsule roster's `byId`:
 * `Object.fromEntries` is typed to widen to `Record<string, T>` however precise
 * its input keys are.
 */
export function byBrickId<T>(pick: (definition: BrickDefinition) => T): Record<BrickKind, T> {
  return Object.fromEntries(BRICKS.map((definition) => [definition.id, pick(definition)])) as Record<BrickKind, T>;
}

export const BRICK_BY_ID: Record<BrickKind, BrickDefinition> = byBrickId((definition) => definition);

// Whether a character in a level row is a brick at all. `.` and anything else
// typed by accident is empty space.
export function isBrickKind(char: string): char is BrickKind {
  return char in BRICK_BY_ID;
}

/**
 * The tones one brick steps down as it takes damage.
 *
 * At stage `n` — `n` hits taken — the sheen is `ramp[n]` and the body under it
 * is `ramp[n + 1]`, so every hit slides the pair one notch and the last one
 * always lands the body on `dark`. There is one entry per hit point plus the
 * intact sheen, which makes `ramp.length - 1 - hitPoints` the stage and is the
 * only arithmetic `drawBrick` needs to do.
 *
 * A one-hit brick stops at `[light, flat]`: its `dark` is the shade along its
 * bottom edge and never a body, because it has no second state to show.
 */
export function brickRamp(definition: BrickDefinition): readonly string[] {
  return definition.hitPoints === 1
    ? [definition.light, definition.flat]
    : [definition.light, definition.flat, ...definition.wear, definition.dark];
}

export const BRICK_RAMPS: Record<BrickKind, readonly string[]> = byBrickId(brickRamp);

/**
 * The same tones with the last one always reachable as a body — what a brick
 * steps down while JELLY is loading it rather than while it is being hit.
 *
 * Identical to `BRICK_RAMPS` for every brick that takes more than one hit, and
 * one entry longer for the five that do not. That extra entry is the whole of
 * the difference and it is deliberate: a one-hit brick has no second *damage*
 * state to show, because it has no second hit — but it can be under load, and
 * refusing it a tone would have left JELLY invisible on the commonest bricks
 * in the game. The tone it gets is its own authored `dark`, which is the shade
 * along its bottom edge; a red brick going maroon is a red brick about to go.
 *
 * `drawBrick` indexes this at the damage stage plus however many notches the
 * strain has earned, so the two ramps agree exactly at zero strain.
 */
export const BRICK_STRAIN_RAMPS: Record<BrickKind, readonly string[]> = byBrickId((definition) => [
  definition.light,
  definition.flat,
  ...definition.wear,
  definition.dark,
]);
