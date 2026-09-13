import { gameConfig } from "@core/config/GameConfig";

import type { BallBox } from "@entities/effects/Erosion";

/**
 * JELLY: the wall as a damped elastic sheet, pinned at its frame.
 *
 * One vertical displacement per cell, two buffers, stepped once a tick as a
 * damped wave equation. Horizontal displacement was never on the table — a
 * brick that slides sideways stops lining up with the column it is indexed on,
 * and every lookup in the game is written in cells. Vertical is the whole of
 * the effect anyway: what a sheet does when you hit it is sag and spring.
 *
 * **Pinned on all four sides, and the two that matter are the side frames.** A
 * front leaves the strike, crosses the twelve columns in twenty-four ticks,
 * comes back off the frame and re-crosses its own reflection about half a
 * second after the ball landed. That crossing is the capsule: where two fronts
 * meet the displacements add, the strain spikes, and bricks burst at the nodes
 * — in places the ball never touched, at positions that are a function of where
 * it struck. A free top or bottom edge was tried first and is wrong: the free
 * edge is an antinode wherever you hit, so every rally tore the same row open
 * first and the pattern stopped meaning anything.
 *
 * **What is simulated and what is painted are two different fields**, which is
 * the one piece of structure here worth knowing before reading the rest. The
 * wave runs on its own; `offsets` is what the renderer draws and the hitbox
 * collides, and it chases the wave while holding any cell a ball is standing
 * in. That hold is ERODE's guard for the same failure: a brick that moves into
 * a ball cannot be pushed out of by a bounce — the resolution walks the ball
 * back by its own sub-step, which is under two pixels, and a brick that came
 * six leaves it still inside. It would flip velocity every sub-step and rattle
 * in place. So a cell with a ball in it simply does not move yet, and the sheet
 * closes around the ball's own path a moment behind it.
 */
// The wall `jellyStrainThreshold` and `jellyStrainGain` were tuned against: six
// rows of twelve, which is the median level and the commonest. See `bendScale`.
const REFERENCE_CELLS = 6 * 12;

export class JellySheet {
  // The wave, indexed `row * columns + column`, in pixels below the cell's own
  // index row. Two buffers because a wave equation is second order in time:
  // where the sheet is going needs where it was as well as where it is.
  private displacement = new Float32Array(0);
  private previous = new Float32Array(0);
  // What is painted and collided — the wave, rounded to whole pixels and held
  // wherever a ball is standing. Whole pixels for QUAKE's reason: the art is
  // drawn at 3x and a fractional translate would soften every brick on screen
  // for the whole ten seconds.
  private offsets = new Int8Array(0);
  // Which cells are walking back to the wave rather than sitting on it: set
  // when a ball's hold ends, cleared when the cell catches up. Only these pay
  // the rate limit — see `step`.
  private held = new Uint8Array(0);
  // How much of a hit each cell has taken from being bent, 0 to `perHit`.
  private strain = new Float32Array(0);
  private rowCount = 0;
  /**
   * What this wall's bending is worth against the reference wall, so a strike
   * means the same thing on a five-row level as on a seven-row one.
   *
   * **A capsule that cleared 70 % of one wall and 0 % of the next is what this
   * is for, and the cause is not obvious.** A dimple puts the same energy into
   * every sheet and reaches the same 2.95 px peak on all of them; what changes
   * is how much sheet it disperses into afterwards, and the mean bend a cell
   * then sees goes as 1/sqrt(cells) — 0.443 px over sixty cells, 0.405 over
   * seventy-two, 0.372 over eighty-four. Nineteen per cent, which sounds like
   * nothing. But strain is earned on the *excess* over a threshold, and a
   * threshold turns nineteen per cent of amplitude into 2.9x the damage: those
   * three walls loaded to 0.77, 0.48 and 0.27 of a hit off one identical
   * strike. Measured, not reasoned about — see `qa/amp.mjs`.
   *
   * So the bend is read against the reference wall rather than in raw pixels.
   * The sheet still moves exactly as far as it moves; only what that is worth
   * is normalised, and it is the only place in this class where the wall's size
   * is allowed to matter.
   */
  private bendScale = 1;
  // The deepest offset on the wall this frame, in whole pixels. Read by the
  // grid to widen the band of rows a point could be in, and by the fast path:
  // a level with no JELLY in it pays one comparison a tick and nothing per cell.
  private deepest = 0;
  // The arrival and the expiry, in ticks elapsed and ticks left. Both are
  // pictures laid over the wave rather than energy put into it — an arrival
  // that strained the wall would tear it open before the player had touched
  // anything, and the slack is a demonstration, not damage.
  private arrivalTick = -1;
  private settleLeft = 0;
  private running = false;

  get rippling(): boolean {
    return this.running || this.deepest > 0;
  }

  get reach(): number {
    return this.deepest;
  }

  load(rowCount: number): void {
    const cells = rowCount * gameConfig.grid.columns;
    this.rowCount = rowCount;
    this.bendScale = cells > 0 ? Math.sqrt(cells / REFERENCE_CELLS) : 1;
    this.displacement = new Float32Array(cells);
    this.previous = new Float32Array(cells);
    this.offsets = new Int8Array(cells);
    this.held = new Uint8Array(cells);
    this.strain = new Float32Array(cells);
    this.deepest = 0;
    this.arrivalTick = -1;
    this.settleLeft = 0;
    this.running = false;
  }

  // The catch. The arrival clock starts here rather than on the first step, so
  // the slack runs in from the frames from the very tick the capsule lands.
  start(): void {
    this.running = true;
    this.arrivalTick = 0;
    this.settleLeft = 0;
  }

  // The expiry, begun `settleTicks` before the timer actually runs out: the
  // sheet has to be still by the time it stops being a sheet, or the last
  // frame would snap a wall full of hanging bricks back into line.
  settle(): void {
    if (this.running && this.settleLeft === 0) {
      this.settleLeft = gameConfig.effects.jellySettleTicks;
    }
  }

  /**
   * The ball's contact: a dimple pressed into the sheet, not a spike driven
   * into one cell.
   *
   * **It has to be a patch, and that is the one thing the prototype settled
   * that no amount of tuning could have.** A single cell displaced against
   * four neighbours at rest is the discrete wave equation's worst case: at the
   * propagation speed this capsule wants, the cell collapses back through zero
   * on the next tick and the energy disperses into a flat mush that never
   * interferes with anything. A dimple — full depth at the strike, half at its
   * edges, a quarter at its corners — is a low enough shape to travel as a
   * front, which is what reflects, and what crosses.
   */
  press(row: number, column: number, depth: number): void {
    const { columns } = gameConfig.grid;
    for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
      for (let deltaColumn = -1; deltaColumn <= 1; deltaColumn++) {
        const near = row + deltaRow;
        const across = column + deltaColumn;
        if (near < 0 || near >= this.rowCount || across < 0 || across >= columns) {
          continue;
        }
        const weight = deltaRow === 0 && deltaColumn === 0 ? 1 : deltaRow === 0 || deltaColumn === 0 ? 0.5 : 0.25;
        const index = near * columns + across;
        /**
         * Pressed **to** a depth, never past one, and both buffers to the same
         * value so the cell is pressed rather than thrown.
         *
         * **This is the other half of what bounds the capsule, and it is the
         * half that is actually about gameplay.** A ball that no longer breaks
         * bricks stays in the wall, and a ball in the wall lands a contact
         * every few ticks rather than every hundred. Adding a dimple per
         * contact pumps energy in far faster than any damping takes it out, and
         * the sheet saturates at whatever the clamp is with every cell tearing
         * at once — measured, and it cleared every wall it was tried on.
         *
         * Taking the deeper of the two instead makes the press mean what it
         * says: you cannot push a sheet further in than you are pushing it. A
         * second contact on a cell still travelling down adds nothing; one on a
         * cell that has sprung back adds exactly the difference. The sheet
         * reaches a steady state set by the depth rather than by the hit rate,
         * which is the only bound here that does not need a number chosen for
         * it.
         */
        const pressed = depth * weight;
        if (pressed > this.displacement[index]) {
          this.displacement[index] = pressed;
          this.previous[index] = pressed;
        }
      }
    }
  }

  /**
   * One tick of the sheet: the wave, then the strain it earns, then the paint.
   *
   * `balls` and `topOffset` are only for the hold — see the class note. The
   * offsets chase in whole pixels at a bounded rate rather than snapping,
   * which is what stops a cell released by a departing ball popping a brick
   * six pixels in one frame.
   */
  step(balls: readonly BallBox[], topOffset: number): void {
    if (!this.rippling) {
      return;
    }
    const { columns } = gameConfig.grid;
    const {
      jellySpeed,
      jellyDamping,
      jellyMaxBend,
      jellyStrainThreshold,
      jellyStrainGain,
      jellyStrainRelax,
      jellyCatchUp,
    } = gameConfig.effects;

    if (this.arrivalTick >= 0) {
      this.arrivalTick++;
    }
    const settling = this.settleLeft > 0 ? 1 - this.settleLeft / gameConfig.effects.jellySettleTicks : 0;
    if (this.settleLeft > 0) {
      this.settleLeft--;
    }
    // The expiry's two halves. The speed walks to zero so the fronts still in
    // flight stop travelling, and the cap collapses from the outer columns
    // inward so the edges stiffen first — one small fast tremor to leave,
    // against the long slow slack that arrived.
    const speed = jellySpeed * (1 - settling);

    let deepest = 0;
    for (let row = 0; row < this.rowCount; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const here = this.displacement[index];
        // Pinned: everything outside the wall is the frame, and the frame does
        // not move. The four neighbours and not eight — a five-point Laplacian
        // is the sheet, and the diagonals would only make it stiffer along the
        // two directions nothing is pinned in.
        const left = column > 0 ? this.displacement[index - 1] : 0;
        const right = column < columns - 1 ? this.displacement[index + 1] : 0;
        const above = row > 0 ? this.displacement[index - columns] : 0;
        const below = row < this.rowCount - 1 ? this.displacement[index + columns] : 0;
        const bend = left + right + above + below - 4 * here;
        const cap = this.columnCap(column, settling);
        const next = (2 * here - this.previous[index] + speed * bend) * jellyDamping * cap;
        // **The sheet can only stretch so far, and this is the whole of what
        // bounds the capsule.** Damping alone does not: a ball that is no
        // longer breaking bricks *stays in the wall*, ricocheting between faces
        // and pressing a fresh dimple every few ticks, so ten seconds of a real
        // rally pumps in far more energy than it can shed. Unclamped, that took
        // the sheet to 25 px — two brick heights — and cleared every wall it
        // was measured on, which is the one thing a capsule may not do.
        //
        // Half a brick, so a displaced brick always overlaps the row it is
        // indexed on. That is not only taste: it is what keeps the grid's row
        // band one row wide, and it is the reason the hitbox search is cheap.
        this.previous[index] = Math.min(jellyMaxBend, Math.max(-jellyMaxBend, next));
      }
    }
    // The buffers swap by name rather than by copy: `previous` was written with
    // the next step above, so after the swap it is the current one and what was
    // current is the history the next step needs.
    const next = this.previous;
    this.previous = this.displacement;
    this.displacement = next;

    for (let row = 0; row < this.rowCount; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const bent = Math.abs(this.displacement[index]) * this.bendScale;
        // Strain is earned above a threshold and given back below it, and the
        // relaxation is what keeps the capsule honest over ten seconds: without
        // it every cell on a wall that is ringing at all creeps to failure on
        // the clock, and a rally would take the whole level apart whatever the
        // player aimed at. With it, only a cell the crossings keep coming back
        // to gets there.
        const earned = bent > jellyStrainThreshold ? (bent - jellyStrainThreshold) * jellyStrainGain : 0;
        this.strain[index] = Math.max(0, this.strain[index] + earned - jellyStrainRelax);

        // The paint, chasing the wave. The arrival's slack rides on top of the
        // wave rather than inside it, so the sheet can be seen going slack
        // without a single brick being strained by the sight of it.
        // Clamped again after the slack is laid over it: the wave is already
        // inside the cap, and the arrival must not push the sum past it — the
        // grid's one-row band is measured off this number.
        const drawn = this.displacement[index] + this.slackAt(column);
        const target = Math.round(Math.min(jellyMaxBend, Math.max(-jellyMaxBend, drawn)));
        const at = this.offsets[index];
        if (holdsBall(row, column, at, balls, topOffset)) {
          // A ball is standing here, so the brick stays where it is and owes
          // the wave the difference.
          this.held[index] = 1;
        } else if (this.held[index] === 1) {
          // Released, and walking back rather than snapping: the wave has moved
          // on while the cell was pinned, and a brick that made up six pixels in
          // one frame is a brick fired out of the wall at the ball that just
          // left. Cleared the moment it is level with the wave again, so the
          // limit costs the other ninety-five cells nothing.
          const step = Math.min(jellyCatchUp, Math.abs(target - at));
          this.offsets[index] = at + Math.sign(target - at) * step;
          this.held[index] = this.offsets[index] === target ? 0 : 1;
        } else {
          // The ordinary case, and the one the whole wall is in almost all of
          // the time: the paint *is* the wave. Rate-limiting here was the first
          // cut and it was wrong — two pixels a tick is slower than the sheet
          // moves, so the wall never reached the amplitude it was simulating
          // and the capsule read as a two-pixel shiver.
          this.offsets[index] = target;
        }
        const depth = Math.abs(this.offsets[index]);
        if (depth > deepest) {
          deepest = depth;
        }
      }
    }
    this.deepest = deepest;
  }

  /**
   * The cells that have taken a whole hit's worth of bending since they last
   * paid one out, as flat indices, and their strain charged back down by it.
   *
   * Drained rather than pushed, so the wall's damage still goes through
   * `damageBrick` and nothing else: a tear pays points, drops its capsule,
   * splashes a live BLAST and links a live CHAIN exactly as a ball's own kill
   * does. The sheet does not know what a brick is and must not learn.
   */
  drainTears(into: number[]): void {
    const { jellyStrainPerHit } = gameConfig.effects;
    for (let index = 0; index < this.strain.length; index++) {
      if (this.strain[index] >= jellyStrainPerHit) {
        this.strain[index] -= jellyStrainPerHit;
        into.push(index);
      }
    }
  }

  // How far this cell is painted below its own index row, in whole pixels.
  offsetAt(row: number, column: number): number {
    return this.offsets[row * gameConfig.grid.columns + column] ?? 0;
  }

  // How loaded this cell is, 0 whole to 1 about to burst. The renderer walks
  // the brick's own damage ramp on it — a charging cell steps down its tones
  // exactly as a hit one does, because that is what it is.
  strainAt(row: number, column: number): number {
    const index = row * gameConfig.grid.columns + column;
    return Math.min(1, (this.strain[index] ?? 0) / gameConfig.effects.jellyStrainPerHit);
  }

  // A brick that burst is not loaded any more, whatever its cell is still
  // doing. Without this the ramp would go on painting a charge onto the brick
  // that slid down into the hole behind QUAKE.
  clearCell(row: number, column: number): void {
    this.strain[row * gameConfig.grid.columns + column] = 0;
  }

  // QUAKE gives the wall a row and slides every cell down into it. The load a
  // brick is carrying travels with it, exactly as ERODE's wear does: a brick
  // two thirds of the way to bursting does not heal by moving house. The wave
  // is the *sheet's* and stays where it is — it is the medium, not the cargo.
  shiftDown(): void {
    const { columns } = gameConfig.grid;
    for (let index = this.strain.length - 1; index >= columns; index--) {
      this.strain[index] = this.strain[index - columns];
    }
    this.strain.fill(0, 0, columns);
  }

  reset(): void {
    this.displacement.fill(0);
    this.previous.fill(0);
    this.offsets.fill(0);
    this.held.fill(0);
    this.strain.fill(0);
    this.deepest = 0;
    this.arrivalTick = -1;
    this.settleLeft = 0;
    this.running = false;
  }

  // The timer has actually run out: the sheet stops being one. The settle
  // above has already walked it still, so there is nothing here to unwind —
  // this only takes the flag down and lets the fast path back in.
  stop(): void {
    this.running = false;
  }

  /**
   * The arrival, column by column: a rope going slack, not a wall dropping.
   *
   * The slack starts at the two pinned ends and runs inward to meet in the
   * middle, and each column rings twice on its way down before it settles. The
   * player is shown what the wall is made of before being asked to use it —
   * which matters more here than for most capsules, because the thing they
   * have to understand is that hitting a brick will no longer kill it.
   */
  private slackAt(column: number): number {
    const { jellyArrivalTicks, jellyArrivalDepth, jellyArrivalPeriod } = gameConfig.effects;
    if (this.arrivalTick < 0) {
      return 0;
    }
    const elapsed = this.arrivalTick - this.releaseTick(column, jellyArrivalTicks);
    if (elapsed < 0) {
      return 0;
    }
    // Two decaying overshoots and out: the cosine puts the column at full slack
    // the moment it is released and the exponential spends it over three
    // half-periods, which is the second overshoot landing on nothing.
    const decay = Math.exp((-elapsed / jellyArrivalPeriod) * 1.2);
    if (decay < 0.02) {
      return 0;
    }
    return jellyArrivalDepth * decay * Math.cos((2 * Math.PI * elapsed) / jellyArrivalPeriod);
  }

  // When the slack reaches this column: the frames first, the middle last.
  private releaseTick(column: number, travel: number): number {
    return this.fromFrame(column) * travel;
  }

  /**
   * The expiry's ceiling for this column, 1 free to 0 set.
   *
   * A front of setting runs in from the frames, the mirror of the slack that
   * arrived — so the edges stiffen first and the centre is the last thing still
   * moving. The front is walked past both ends of its range by the softness, so
   * that at the first tick of the settle nothing is capped and at the last tick
   * everything is.
   */
  private columnCap(column: number, settling: number): number {
    if (settling <= 0) {
      return 1;
    }
    const softness = gameConfig.effects.jellySetSoftness;
    const front = settling * (1 + softness) - softness;
    return Math.min(1, Math.max(0, (this.fromFrame(column) - front) / softness));
  }

  // How far into the sheet this column sits, 0 against a side frame and 1 in
  // the middle. Both the slack and the set are measured off it, which is what
  // makes the departure read as the arrival run backwards.
  private fromFrame(column: number): number {
    const { columns } = gameConfig.grid;
    const half = (columns - 1) / 2;
    return 1 - Math.abs(column - half) / half;
  }
}

/**
 * Whether any live ball overlaps this cell where it is currently painted.
 *
 * The whole cell and not the brick inside it, which is ERODE's stricter test
 * and is here for its reason exactly: what has to be impossible is a brick
 * arriving where a ball already is, and testing against the brick's next
 * position would free the cell on the tick before the move that swallows it.
 */
function holdsBall(row: number, column: number, offset: number, balls: readonly BallBox[], topOffset: number): boolean {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  const cellLeft = left + column * brickWidth;
  const cellTop = top + row * brickHeight - topOffset + offset;
  for (const ball of balls) {
    if (
      ball.active &&
      ball.x + ball.size > cellLeft &&
      ball.x < cellLeft + brickWidth &&
      ball.y + ball.size > cellTop &&
      ball.y < cellTop + brickHeight
    ) {
      return true;
    }
  }
  return false;
}
