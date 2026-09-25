import { BRICK_BY_ID, isBrickKind } from "@core/config/bricks";
import { gameConfig } from "@core/config/GameConfig";

import type { BrickCell, BrickHit, BrickKind, LevelDefinition, PowerUpKind } from "@interfaces/types";

/**
 * ERODE's wear, as much of it as the wall needs to know: how far the brick in a
 * cell has pulled inside it, in whole pixels off each edge.
 *
 * An interface and not the `Erosion` class, for the reason `topOffset` is a
 * number and not a `Quake`: the wall is a wall, and what it holds is where its
 * bricks are, never which capsule put them there.
 */
export interface WallErosion {
  worn: boolean;
  insetXAt(row: number, column: number): number;
  insetYAt(row: number, column: number): number;
}

/**
 * JELLY's sheet, as much of it as the wall needs to know: how far below its own
 * index row the brick in a cell is hanging, in whole pixels.
 *
 * An interface for the reason above it is one. `reach` is the deepest of those
 * numbers anywhere on the wall, and it is here rather than being derived per
 * call because it is what decides how many rows a point has to be tested
 * against — see `cellAt`.
 */
export interface WallSheet {
  rippling: boolean;
  reach: number;
  offsetAt(row: number, column: number): number;
}

/**
 * FENCE's posts, as much of them as the wall needs to know: which cell of one
 * fixed row holds one, how far it has been driven into the ground, and how far
 * it has come back out.
 *
 * An interface for the reason the two above it are ones, and the split it draws
 * is the capsule's whole design. The fence answers here, inside the *pixel*
 * lookup, so a ball, a laser bolt and a meteor all meet it with no new branch
 * — and it is nowhere in `rows`, so everything that walks the wall by index
 * goes on meaning the wall: the gild front, XRAY's span, HOMING's targets,
 * ZAP's bottom row, the critter's first row, and `remaining`.
 *
 * `row` is outside the grid array by construction — a level is five to eight
 * rows and this is sixteen — so no wall cell can ever collide with a post's
 * index, and QUAKE's shift cannot reach it.
 */
export interface WallFence {
  readonly row: number;
  cellAt(column: number): BrickCell | null;
  riseAt(column: number): number;
  depthAt(column: number): number;
  remove(column: number): void;
}

/**
 * COLLAPSE's fog, as much of it as the wall needs to know: whether the ball
 * goes through the brick in a cell, and a way to say that one just did.
 *
 * An interface for the reason the three above it are ones. **It is read in
 * exactly two places** — `findBallOverlap` and `findBallOverlaps`, the two ball
 * lookups — and deliberately nowhere else: a laser bolt, a meteor and TRACER's
 * probe all come through `cellAt`, and the capsule's own claim is that the fog
 * is about the ball and nothing else. A fogged cell is a live brick to `rows`,
 * to `remaining`, to `hitAtCell` and therefore to every capsule that reaches
 * the wall by index.
 */
export interface WallFog {
  fogged(row: number, column: number): boolean;
  touch(row: number, column: number): void;
}

export class BrickGrid {
  // How far above its own index row the wall is being painted this frame, fed
  // from `Quake.dropOffset` every tick. Zero except while QUAKE's wall is still
  // falling; see `cellAt`, the only thing that reads it.
  topOffset = 0;
  // How far the mortar has gone, or null on a wall nothing has eroded — which is
  // every wall until an ERODE is caught. Set once by the game and read only by
  // `cellAt`, beside the offset above and for the same reason: this is the other
  // way the hitbox stops being the plain grid it is indexed on.
  erosion: WallErosion | null = null;
  // How far each cell is hanging below its index row, or null on a wall nothing
  // has jellied. The third of the three things that stop the hitbox being the
  // plain grid it is indexed on, and the only one that can move a brick out of
  // its own row — which is why `cellAt` below stopped being a single lookup.
  sheet: WallSheet | null = null;
  // FENCE's posts, or null on a field nobody has fenced — which is every field
  // until one is caught. Set once by the game and read by the three lookups
  // below, and deliberately *not* by anything that iterates `rows`: a post is
  // a wall cell to the ball and is not the wall to anything else.
  fence: WallFence | null = null;
  // COLLAPSE's fog, or null on a wall nobody has decohered — which is every
  // wall until one is caught. The fourth thing that stops the hitbox being the
  // plain grid it is indexed on, and the only one of the four that is *not*
  // read by `cellAt`: the other three move a brick, and this one only decides
  // whether the ball is allowed to notice it. See `WallFog`.
  fog: WallFog | null = null;
  private grid: Array<Array<BrickCell | null>> = [];
  // What the level *built*, cell for cell, kept beside what is standing — which
  // is the only way to know a hole is a hole rather than sky (SHA-175). Only THE
  // WRATH reads it, and it is stored as kinds rather than as the level's rows
  // because a row is a string of twelve characters that may be short, and this
  // has to line up with `grid` index for index however QUAKE has moved it.
  private layout: Array<Array<BrickKind | null>> = [];
  private remainingCount = 0;

  get remaining(): number {
    return this.remainingCount;
  }

  get rows(): ReadonlyArray<ReadonlyArray<BrickCell | null>> {
    return this.grid;
  }

  /**
   * Build the wall, and seed each brick with the capsule it is holding.
   *
   * `rollCapsule` is asked once per brick and owns the odds — the grid only
   * stores what it says. Rolling at build time rather than at the kill is what
   * lets XRAY show the wall's real contents; the drop rate is untouched, since
   * a brick that is never killed directly never drops either way.
   */
  load(level: LevelDefinition, rollCapsule: () => PowerUpKind | null): void {
    this.grid = [];
    this.layout = [];
    this.remainingCount = 0;
    this.topOffset = 0;

    const { columns } = gameConfig.grid;
    // The level's own capsules, by cell, before anything rolls: a pinned cell is
    // not a roll at all, so it must not draw a ticket from the bag only to have
    // the pin stamped over it (SHA-156) — that ticket would be spent on a capsule
    // no brick ever holds, and the bag's two-pass promise would quietly break.
    const pinned = new Map((level.drops ?? []).map((drop) => [drop.row * columns + drop.column, drop.kind]));
    for (const [rowIndex, row] of level.rows.entries()) {
      const line: Array<BrickCell | null> = [];
      const plan: Array<BrickKind | null> = [];
      for (let column = 0; column < columns; column++) {
        const char = row[column] ?? ".";
        if (!isBrickKind(char)) {
          line.push(null);
          plan.push(null);
          continue;
        }
        const definition = BRICK_BY_ID[char];
        const pin = pinned.get(rowIndex * columns + column);
        plan.push(char);
        line.push({
          kind: char,
          hitPoints: definition.hitPoints,
          points: definition.points,
          // Its cell, once, and it travels with the brick from here: QUAKE moves
          // cells by reference, so a granite brick that slides down a row is
          // still cut from the same stone.
          seed: rowIndex * columns + column,
          // Skipped rather than rolled and thrown away on the one kind that
          // never holds one: the roll is one call per brick that *can* pay, and
          // a lid asked about sixty times would be sixty draws nobody could win.
          // A pin holds its capsule whatever the kind says, the way it always has.
          capsule: pin ?? (definition.capsules === false ? null : rollCapsule()),
          seeded: pin !== undefined,
          scarTicks: 0,
          grown: false,
        });
        this.remainingCount++;
      }
      this.grid.push(line);
      this.layout.push(plan);
    }
  }

  // Re-roll every brick still standing. The dev console's `bonus` command changes
  // the drop rate mid-level, and the wall was seeded at load: without this,
  // `bonus 1` would only take effect on the next level. Cells the level pinned
  // are left out of it — a drop rate typed into the console has nothing to say
  // about a promise.
  reseedCapsules(rollCapsule: () => PowerUpKind | null): void {
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell && !cell.seeded && BRICK_BY_ID[cell.kind].capsules !== false) {
          cell.capsule = rollCapsule();
        }
      }
    }
  }

  /**
   * The pixel-to-cell lookup, and the whole of the wall's pixel-space
   * collision: balls come through `findBallOverlap`, laser bolts through
   * `ShotPool`, meteors straight in. Every other caller — homing, BLAST and
   * CHAIN's neighbours, the critter — is already index-space and does not care
   * where the wall is being painted.
   *
   * Which is why `topOffset` belongs here and nowhere else. It is how far above
   * its index the wall is drawn this frame, so the hitbox follows the paint
   * instead of sitting a row below it while QUAKE's wall is still falling.
   *
   * **JELLY is why this is a search and no longer a lookup.** `topOffset` moves
   * the whole wall, so dividing by the brick height still names the one row a
   * point can be in. A sheet moves each cell by its own amount, and a brick
   * hanging six pixels into the row below it is in a row the division cannot
   * name — so the rows within the sheet's deepest reach are tested, each
   * against where it is actually being painted, and the plain division is only
   * where that search starts. Off a jellied wall the band is one row wide and
   * this is the lookup it always was.
   */
  cellAt(x: number, y: number): BrickHit | null {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const withinX = x - left;
    const withinY = y - top + this.topOffset;
    const column = Math.floor(withinX / brickWidth);
    // The fence, first and in coordinates of its own. It is not the wall, so
    // none of the three displacements below reaches it: QUAKE's drop does not
    // slide it, JELLY's sheet does not hang it and ERODE's wear does not thin
    // it. The clearance over the deck is the capsule's one hard number, and a
    // fence a capsule could move down a row would break it silently.
    const post = this.fenceHit(column, y - top);
    if (post !== null) {
      return post;
    }
    const middle = Math.floor(withinY / brickHeight);
    const band = this.sheet !== null && this.sheet.rippling ? Math.ceil(this.sheet.reach / brickHeight) : 0;
    // Outward from the row the point would be in on a flat wall, so a cell that
    // has not moved still answers first: the commonest case on a rippling wall
    // is still a brick sitting near enough its own row, and two neighbours that
    // have bent past each other must not take a bounce off it.
    for (let step = 0; step <= band; step++) {
      for (const row of step === 0 ? [middle] : [middle - step, middle + step]) {
        const hit = this.hitAtRow(row, column, withinX, withinY);
        if (hit !== null) {
          return hit;
        }
      }
    }
    return null;
  }

  /**
   * One candidate row, tested against the rectangle its brick is actually
   * being painted in.
   *
   * The sheet's offset is taken off the point rather than added to the cell,
   * which is the same arithmetic `topOffset` does a line above and keeps both
   * displacements in one coordinate space: after this, `offsetY` is where the
   * point lies inside the brick, whatever has moved it.
   */
  private hitAtRow(row: number, column: number, withinX: number, withinY: number): BrickHit | null {
    const { brickWidth, brickHeight } = gameConfig.grid;
    // The wall and only the wall: the fence was already tested in `cellAt`, in
    // its own coordinates, and a point that missed a post vertically must not
    // find it again here against a full-height cell it is not standing in.
    const hit = this.wallAtCell(row, column);
    if (hit === null) {
      return null;
    }
    const hang = this.sheet?.offsetAt(row, column) ?? 0;
    const offsetY = withinY - hang - row * brickHeight;
    if (offsetY < 0 || offsetY >= brickHeight) {
      return null;
    }
    if (this.erosion === null || !this.erosion.worn) {
      return hit;
    }

    // ERODE: the brick no longer fills its cell, so landing in the cell is no
    // longer landing on the brick. The margin the wear opened belongs to the
    // field — a ball in it is threading a lane, a laser bolt in it is going up
    // one, and neither has hit anything.
    //
    // Whole pixels either side, which is what makes this rectangle the exact one
    // being painted: the brick a ball bounces off is the brick the player can
    // see, at every step of the wear rather than only at its two ends.
    const insetX = this.erosion.insetXAt(row, column);
    const insetY = this.erosion.insetYAt(row, column);
    const offsetX = withinX - column * brickWidth;
    const inside =
      offsetX >= insetX && offsetX < brickWidth - insetX && offsetY >= insetY && offsetY < brickHeight - insetY;
    return inside ? hit : null;
  }

  /**
   * One post, tested against the rectangle it is actually being painted in.
   *
   * `withinY` is measured off the wall's top edge and carries no offset: see
   * `cellAt`. The rectangle is the post's own — where its top edge has risen to
   * while it is being pulled, and how far down from it the telescope has
   * reached while it is being driven — so the fence a ball bounces off is the
   * fence on screen at every step of both ends, which is `hitAtRow`'s rule for
   * a worn brick applied to a growing one.
   */
  private fenceHit(column: number, withinY: number): BrickHit | null {
    if (this.fence === null) {
      return null;
    }
    const cell = this.fence.cellAt(column);
    if (cell === null) {
      return null;
    }
    const offsetY = withinY - this.fence.row * gameConfig.grid.brickHeight - this.fence.riseAt(column);
    return offsetY >= 0 && offsetY < this.fence.depthAt(column) ? { cell, row: this.fence.row, column } : null;
  }

  hitAtCell(row: number, column: number): BrickHit | null {
    if (column < 0 || column >= gameConfig.grid.columns) {
      return null;
    }
    // The fence, for the index-space callers — BLAST's eight neighbours, a
    // CHAIN arc, HOMING's check that its lock still exists. Whole cells, with
    // none of the pixel test above: a splash does not need to know how far out
    // of the ground a post is, only that there is one.
    if (this.fence !== null && row === this.fence.row) {
      const cell = this.fence.cellAt(column);
      return cell ? { cell, row, column } : null;
    }
    return this.wallAtCell(row, column);
  }

  private wallAtCell(row: number, column: number): BrickHit | null {
    if (row < 0 || column < 0 || column >= gameConfig.grid.columns || row >= this.grid.length) {
      return null;
    }

    const cell = this.grid[row][column];
    return cell ? { cell, row, column } : null;
  }

  findBallOverlap(ballX: number, ballY: number, size: number): BrickHit | null {
    const inset = gameConfig.ball.collisionInset;
    const corners: Array<[number, number]> = [
      [ballX + inset, ballY + inset],
      [ballX + size - inset, ballY + inset],
      [ballX + inset, ballY + size - inset],
      [ballX + size - inset, ballY + size - inset],
    ];

    for (const [x, y] of corners) {
      const hit = this.cellAt(x, y);
      if (hit && !this.ballPassesThrough(hit)) {
        return hit;
      }
    }

    return null;
  }

  /**
   * Whether COLLAPSE lets the ball through this brick, recording the pass.
   *
   * Two things at once because they are one event: the ball asked about a cell
   * and is being told nothing is there, and that is precisely the moment the
   * cell has to be marked as passed through. Splitting them would mean a second
   * walk of the box somewhere else to find out what this one already knows.
   *
   * A fence post is never fogged — the fog is sized to the wall's own rows and
   * a post's row is sixteen — so no branch is needed for it here.
   */
  private ballPassesThrough(hit: BrickHit): boolean {
    if (this.fog === null || !this.fog.fogged(hit.row, hit.column)) {
      return false;
    }
    this.fog.touch(hit.row, hit.column);
    return true;
  }

  /**
   * Every live brick the ball's box is standing on, not just the first corner
   * to find one (SHA-135).
   *
   * The four corners are the right test for an 8 px ball, which can never span
   * more than the two cells they already reach. A GIANT ball is 24 px against a
   * 30x12 brick and covers up to two columns and three rows — six cells, of
   * which the corners can only ever see four, and never the one in the middle
   * of the patch. So this walks the cells the box actually covers instead of
   * sampling it.
   *
   * `cellAt` per cell rather than a bounds test, because ERODE's worn bricks no
   * longer fill their cells and the margin it opens is field: the same rectangle
   * the player can see is the one that gets crushed, at every step of the wear.
   *
   * The row band is widened by JELLY's reach for `cellAt`'s reason exactly — a
   * brick hanging out of its own row is still under the ball — and each cell is
   * sampled where it is being *painted*, so the point handed to `cellAt` is one
   * the displaced brick actually occupies.
   */
  findBallOverlaps(ballX: number, ballY: number, size: number): BrickHit[] {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const inset = gameConfig.ball.collisionInset;
    const nearX = ballX + inset;
    const farX = ballX + size - inset;
    const nearY = ballY + inset;
    const farY = ballY + size - inset;
    const band = this.sheet !== null && this.sheet.rippling ? Math.ceil(this.sheet.reach / brickHeight) : 0;
    const firstColumn = Math.floor((nearX - left) / brickWidth);
    const lastColumn = Math.floor((farX - left) / brickWidth);
    const firstRow = Math.floor((nearY - top + this.topOffset) / brickHeight) - band;
    const lastRow = Math.floor((farY - top + this.topOffset) / brickHeight) + band;

    const hits: BrickHit[] = [];
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        // The point tested inside each cell is the part of the ball's box that
        // is actually in it — the cell's own span clamped to the box — so a
        // cell the ball only clips at one edge is tested there rather than at
        // a centre the ball never reached.
        const hang = this.sheet?.offsetAt(row, column) ?? 0;
        const x = Math.min(Math.max(left + column * brickWidth + brickWidth / 2, nearX), farX);
        const y = Math.min(Math.max(top + row * brickHeight - this.topOffset + hang + brickHeight / 2, nearY), farY);
        const hit = this.cellAt(x, y);
        if (
          hit &&
          !this.ballPassesThrough(hit) &&
          !hits.some((found) => found.row === hit.row && found.column === hit.column)
        ) {
          hits.push(hit);
        }
      }
    }

    // The fence, after the wall and in its own coordinates, by `cellAt`'s rule
    // exactly — it is sixteen rows down and the loop above never reaches it.
    // The sample point is the post's own centre clamped into the ball's box, so
    // a box that does not span the fence row clamps to an edge outside it and
    // finds nothing.
    if (this.fence !== null) {
      const fenceY = Math.min(Math.max(top + this.fence.row * brickHeight + brickHeight / 2, nearY), farY);
      for (let column = firstColumn; column <= lastColumn; column++) {
        const x = Math.min(Math.max(left + column * brickWidth + brickWidth / 2, nearX), farX);
        const hit = this.fenceHit(Math.floor((x - left) / brickWidth), fenceY - top);
        if (hit && !hits.some((found) => found.row === hit.row && found.column === hit.column)) {
          hits.push(hit);
        }
      }
    }
    return hits;
  }

  // `amount` is what the source takes off, which is 1 for everything but a laser
  // bolt on granite — see `laserDamage` on the roster. It is the caller's number
  // and not the cell's on purpose: the wall knows what a brick can take, and the
  // game knows what hit it.
  damage(hit: BrickHit, amount = 1): boolean {
    hit.cell.hitPoints -= amount;
    if (hit.cell.hitPoints > 0) {
      return false;
    }

    // **A post is not counted out of the level, because it was never counted
    // in.** `remaining <= 0` is the clear condition and it is tested at six
    // sites: a fence standing when the wall empties would hold the level open,
    // and a fence expiring on its own would clear it for the player.
    if (this.fence !== null && hit.row === this.fence.row) {
      this.fence.remove(hit.column);
      return true;
    }

    this.grid[hit.row][hit.column] = null;
    this.remainingCount--;
    return true;
  }

  // WARP easter egg: empty the field outright — no points, no debris, no sound.
  // Not a gameplay kill, so it deliberately shares nothing with damage/destroy.
  wipe(): void {
    for (const row of this.grid) {
      row.fill(null);
    }
    this.remainingCount = 0;
  }

  /**
   * QUAKE: every row slides down one and a fresh empty row takes the top.
   *
   * Cells move by reference, so hit points, damage and the remaining count all
   * travel down with them. The bottom row of the array is discarded — QUAKE
   * always vaporises the bottom-most live row first, so in play it is empty by
   * the time this runs, but anything found there is counted out rather than
   * silently dropped: a stale `remaining` would leave a level that can never
   * clear.
   */
  shiftDown(): void {
    const last = this.grid.length - 1;
    if (last < 0) {
      return;
    }
    for (const cell of this.grid[last]) {
      if (cell) {
        this.remainingCount--;
      }
    }
    for (let row = last; row > 0; row--) {
      this.grid[row] = this.grid[row - 1];
      this.layout[row] = this.layout[row - 1];
    }
    this.grid[0] = Array.from({ length: gameConfig.grid.columns }, () => null);
    // The plan slides with the wall, or THE WRATH would spend the rest of the
    // level repairing holes a row above the ones the player is actually making.
    // The fresh top row plans nothing, which is right: QUAKE did not put a wall
    // up there, so there is no hole in it to repair.
    this.layout[0] = Array.from({ length: gameConfig.grid.columns }, () => null);
  }

  /**
   * THE WRATH (SHA-175): every cell the level built that is standing empty now,
   * with the kind it was built as.
   *
   * A list and not a count, because the caller picks one of them at random and
   * a hole is two numbers and a letter — and because "which holes" is the one
   * question about this that has an interesting answer: it shrinks as the eye
   * repairs and grows as the player digs, so the last hole left is the one the
   * next blink is certain to take.
   *
   * The fence is not in here. It is a row of posts the level never planned, and
   * a post the Observer rebuilt would be a brick nobody put a hole in.
   */
  holes(): Array<{ row: number; column: number; kind: BrickKind }> {
    const found: Array<{ row: number; column: number; kind: BrickKind }> = [];
    for (const [row, plan] of this.layout.entries()) {
      for (const [column, kind] of plan.entries()) {
        if (kind !== null && this.grid[row][column] === null) {
          found.push({ row, column, kind });
        }
      }
    }
    return found;
  }

  /**
   * One hole repaired: a brick of its own kind back in its own cell, at
   * whatever hit points the caller says and holding nothing.
   *
   * **`capsule` is null and this method offers no way to make it anything
   * else.** The eye repairs on its own clock rather than on the player's, so a
   * scar that could pay would be a capsule farm with no upper bound: stand off
   * the wall, let the blinks refill the same hole, break it, repeat. A brick
   * handed back to you is not a brick you earned. It is still worth its kind's
   * points — the rate there is one brick every few seconds, which is noise
   * beside a single chained rally, and a repair that paid nothing at all would
   * read as a bug rather than as a rule.
   */
  scar(row: number, column: number, kind: BrickKind, hitPoints: number, flickerTicks: number): void {
    if (this.grid[row]?.[column] !== null) {
      return;
    }
    const definition = BRICK_BY_ID[kind];
    this.grid[row][column] = {
      kind,
      hitPoints: Math.max(1, Math.min(definition.hitPoints, hitPoints)),
      points: definition.points,
      seed: row * gameConfig.grid.columns + column,
      capsule: null,
      seeded: false,
      scarTicks: flickerTicks,
      grown: false,
    };
    this.remainingCount++;
  }

  /**
   * MOULD (SHA-142): a grown brick into an empty cell, as the mould built it.
   *
   * The cell is the caller's whole — kind, one hit point, a quarter of the
   * points, no capsule, `grown` — because what a regrown brick is worth is the
   * capsule's rule and not the wall's. The wall only counts it: it is a brick
   * like any other from here, and the level does not clear until it is gone.
   */
  plant(row: number, column: number, cell: BrickCell): void {
    if (this.grid[row]?.[column] !== null) {
      return;
    }
    this.grid[row][column] = cell;
    this.remainingCount++;
  }

  /** One tick off every birth flicker on the wall. Costs nothing on the other levels: no cell carries one. */
  stepScars(): void {
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell !== null && cell.scarTicks > 0) {
          cell.scarTicks--;
        }
      }
    }
  }

  // NUKE kills: remove the cell outright, regardless of remaining hit points.
  destroy(hit: BrickHit): void {
    // Nothing reaches a post this way today — every caller walks `rows`, which
    // the fence is not in — but a hit is a hit, and a `destroy` that indexed
    // the grid at row 16 would throw rather than do nothing.
    if (this.fence !== null && hit.row === this.fence.row) {
      this.fence.remove(hit.column);
      return;
    }
    if (this.grid[hit.row][hit.column] !== null) {
      this.grid[hit.row][hit.column] = null;
      this.remainingCount--;
    }
  }
}
