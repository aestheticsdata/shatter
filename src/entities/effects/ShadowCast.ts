import { gameConfig } from "@core/config/GameConfig";

import type { BrickGrid } from "@entities/bricks/BrickGrid";

/**
 * UMBRA's shadow field: one wedge per column, rasterized once a tick into the
 * rows the renderer paints and the physics collides.
 *
 * **The spans are the capsule.** This is the first thing in the engine to put a
 * slanted surface in front of the ball, and the failure mode of a slanted
 * surface is two approximations of it — a quad the renderer fills and a quad
 * the physics integrates, agreeing everywhere except at the one pixel a player
 * is watching. So the quad is rasterized once, here, into an array of horizontal
 * spans, and both sides read that array. What is drawn is what is hit, by
 * construction rather than by care.
 *
 * The quad itself survives the rasterization and is used for one thing only:
 * the normal a rebound leaves on. A span can say *that* a ball is inside a
 * shadow and never which face of it the ball should come off, and a stack of
 * rows resolved axis-aligned would turn every wedge into a staircase — which is
 * the one thing a raking shadow must not feel like.
 *
 * The set is twelve wedges however deep the wall is, because the caster is the
 * lowest live brick in each column and nothing above it throws anything. That
 * is the ticket's load-bearing decision and it is two decisions at once: shadows
 * from every brick overlap into a solid black slab that is not a forest and
 * cannot be read, and twelve casters is most of the collision cost gone.
 */

// One column's wedge: where it hangs, how far, and how it leans. Rebuilt from
// the wall every tick — a shadow is never state, it is a fact about where a
// brick is standing this frame, which is what makes a killed brick's shadow
// retract on the frame it dies with nothing here to notice.
export interface ShadowWedge {
  // The cell throwing it, or -1 for a column with nothing left in it.
  row: number;
  // Run per px of drop, clamped. Positive leans right, away from a sun on the
  // left of it.
  shear: number;
  // The mouth, which is the caster's collider bottom edge — its rect and not
  // its cell, so ERODE's worn bricks throw narrower shadows for free.
  mouthY: number;
  mouthCx: number;
  mouthHalf: number;
  // And the far end, after the drop, the taper and whatever the arrival or the
  // departure is scaling the whole quad by.
  tipY: number;
  tipCx: number;
  tipHalf: number;
  // The first rasterized row and how many there are. `count` is 0 for a column
  // that has no caster, and for one whose wedge has not started unfolding yet.
  top: number;
  count: number;
}

/**
 * The bright band a struck wedge sends back up to its caster.
 *
 * It rides the live wedge rather than a copy of it: the sun is still moving
 * while the band travels, and a band running up the shape the wedge had six
 * ticks ago would be the one part of this capsule drawn somewhere a shadow is
 * not. Cancelled if the column's caster changes under it — the brick it was
 * reporting to is gone, and its death burst has already said so louder.
 */
export interface ShadowSurge {
  column: number;
  row: number;
  fromY: number;
  ticksLeft: number;
}

/** What a ball touching a wedge comes off, and which brick pays for it. */
export interface ShadowContact {
  column: number;
  row: number;
  // Unit outward normal of the nearest face, and how far inside it the ball is.
  normalX: number;
  normalY: number;
  depth: number;
}

const { columns: COLUMN_COUNT } = gameConfig.grid;
// The deepest a wedge is ever rasterized: its drop, plus everything the sunset
// stretches it by. Allocated once — the arrays below are the only memory this
// capsule has, and it may not allocate on any of its six hundred frames.
const MAX_ROWS = gameConfig.powerUps.umbra.reach + gameConfig.powerUps.umbra.setTipRun + 1;

export class ShadowCast {
  // Every wedge's rows, flat: column `c`'s row `i` is at `c * MAX_ROWS + i`.
  // Two arrays rather than one of pairs, because this is read once per ball per
  // sub-step and once per row per frame.
  private readonly spanLeft = new Int16Array(COLUMN_COUNT * MAX_ROWS);
  private readonly spanRight = new Int16Array(COLUMN_COUNT * MAX_ROWS);
  private readonly wedges: ShadowWedge[] = Array.from({ length: COLUMN_COUNT }, () => ({
    row: -1,
    shear: 0,
    mouthY: 0,
    mouthCx: 0,
    mouthHalf: 0,
    tipY: 0,
    tipCx: 0,
    tipHalf: 0,
    top: 0,
    count: 0,
  }));
  readonly surges: ShadowSurge[] = [];
  // The surges that reached their caster this tick, drained by the game into
  // brick flashes. A field rather than a return value so the ten seconds cost
  // no allocations; it is cleared at the top of every step.
  readonly arrivals: ShadowSurge[] = [];

  // Ticks since the catch, and the capsule's whole length — the phases are read
  // off these rather than off a blend, because three of them are not a fade:
  // the wedges unfold column by column, stand, and then run away.
  private elapsed = 0;
  private duration = 0;
  private live = false;
  // Where the sun is this tick, in field x. Meaningless while `live` is false.
  private sun = 0;
  // Where it was when the light started to go, so the sunset is a fall from
  // wherever the sun had got to rather than a jump. It matters most when the
  // sunset is *forced* — a BLACKOUT caught over a live UMBRA cuts the ten
  // seconds short, and the sun diving for the right frame in half a second is
  // what that looks like from the field.
  private sunHeld = 0;

  get casting(): boolean {
    return this.live;
  }

  get sunX(): number {
    return this.sun;
  }

  /**
   * Whether the wedges are surfaces this tick.
   *
   * False through the whole sunset, which is the capsule's own statement about
   * its expiry: a shadow the player can see running off the bottom of the field
   * is not one they can still be turned by, and thirty ticks of a collider
   * sliding out from under a rally would be the worst half-second in the game.
   * The arrival is the other way round — a wedge is solid at whatever length it
   * has unfolded to, because it is *there*.
   */
  get solid(): boolean {
    return this.live && this.elapsed < this.duration - gameConfig.powerUps.umbra.setTicks;
  }

  /**
   * The frame the sun is behind, and how hard it is lighting it.
   *
   * **Derived from where the sun is, not from a tick count**, and that is what
   * makes the light continuous: the mark spends the first seventy-odd ticks off
   * the left of the frame and the last seventy off the right, and a rim scored
   * to the thirty-tick arrival would leave forty ticks in the middle of each
   * end with shadows on the field and nothing throwing them. Here the rim is
   * simply the sun seen through the cabinet — full when it is at the far end of
   * its travel, gone the moment it climbs onto the top frame, and coming back
   * on the other side as it goes down behind it.
   */
  get leftRim(): number {
    return this.live && this.sun < 0 ? Math.min(1, this.sun / gameConfig.powerUps.umbra.sunFrom) : 0;
  }

  get rightRim(): number {
    const { sunTo } = gameConfig.powerUps.umbra;
    const { width } = gameConfig.field;
    return this.live && this.sun > width ? Math.min(1, (this.sun - width) / (sunTo - width)) : 0;
  }

  start(durationTicks: number): void {
    // A second UMBRA over a live one restarts the sun rather than topping the
    // ten seconds up, and it is the one capsule on the roster where that is the
    // honest answer: the effect *is* a sun crossing the sky once, and a top-up
    // would be the sun jumping back to the horizon with its shadows already
    // raking the other way. Starting over puts it back on the left frame and
    // unfolds the field again, which is the picture the player caught.
    this.elapsed = 0;
    this.duration = durationTicks;
    this.live = true;
    this.surges.length = 0;
    this.arrivals.length = 0;
    this.sun = gameConfig.powerUps.umbra.sunFrom;
  }

  /**
   * Cut the capsule short through its own sunset rather than switching it off.
   *
   * BLACKOUT is the only caller and the veil is why: the two capsules retire
   * each other, and a shadow field that vanished between two frames would be
   * the one hard on/off in a roster where every arrival and every departure is
   * a picture. Thirty ticks of shadows running off the bottom of the field
   * against forty-five of the iris closing is a crossfade — the light is gone
   * before the dark has arrived, which is the only order in which both can be
   * seen.
   */
  retire(): void {
    if (!this.live) {
      return;
    }
    this.duration = Math.min(this.duration, this.elapsed + gameConfig.powerUps.umbra.setTicks);
  }

  reset(): void {
    this.live = false;
    this.elapsed = 0;
    this.duration = 0;
    this.surges.length = 0;
    this.arrivals.length = 0;
    for (const wedge of this.wedges) {
      wedge.count = 0;
      wedge.row = -1;
    }
  }

  wedgeAt(column: number): ShadowWedge {
    return this.wedges[column];
  }

  // One rasterized row, as two reads rather than a pair. The renderer walks
  // every row of every wedge on every frame — up to twelve hundred of them —
  // and a `{ left, right }` per row is twelve hundred objects a frame for the
  // convenience of one destructure.
  leftAt(column: number, index: number): number {
    return this.spanLeft[column * MAX_ROWS + index];
  }

  rightAt(column: number, index: number): number {
    return this.spanRight[column * MAX_ROWS + index];
  }

  /**
   * Rebuild the whole field from the wall as it stands this tick.
   *
   * `deckTop` is where the paddle actually is, which is not `gameConfig.paddle.y`
   * any more: a wedge is cut short against it so the ticket's one hard invariant
   * — shadows never reach the deck — survives TIDE floating the deck 96 px up
   * into the band the shadows hang in.
   */
  step(grid: BrickGrid, deckTop: number): void {
    if (!this.live) {
      return;
    }
    this.elapsed++;
    if (this.elapsed > this.duration) {
      this.reset();
      return;
    }

    const umbra = gameConfig.powerUps.umbra;
    const setStart = this.duration - umbra.setTicks;
    if (this.elapsed <= setStart) {
      this.sun = umbra.sunFrom + (umbra.sunTo - umbra.sunFrom) * (this.elapsed / this.duration);
      this.sunHeld = this.sun;
    } else {
      // The last thirty ticks are a fall and not a crossing: wherever the sun
      // had got to, it goes down behind the right frame, and the shadows run
      // out from under it.
      this.sun = this.sunHeld + (umbra.sunTo - this.sunHeld) * ((this.elapsed - setStart) / umbra.setTicks);
    }
    this.arrivals.length = 0;

    for (let column = 0; column < COLUMN_COUNT; column++) {
      if (this.buildWedge(grid, column, deckTop)) {
        this.rasterize(column);
      } else {
        this.wedges[column].count = 0;
      }
    }
    this.stepSurges();
  }

  /**
   * The lowest live brick in a column, and the quad hanging off it.
   *
   * Searched from the bottom of the array up rather than cached, because every
   * one of the three things that could invalidate a cache happens while this
   * capsule is live: bricks die, QUAKE slides the whole wall down a row, and
   * SLUMP drops each column into its own holes. Twelve upward scans of a wall
   * at most eight rows deep is a hundred lookups a tick, which is less than one
   * ball's brick test costs.
   */
  private buildWedge(grid: BrickGrid, column: number, deckTop: number): boolean {
    const wedge = this.wedges[column];
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const umbra = gameConfig.powerUps.umbra;
    const rows = grid.rows;

    let row = -1;
    for (let index = rows.length - 1; index >= 0; index--) {
      if (rows[index][column] !== null) {
        row = index;
        break;
      }
    }
    if (row === -1) {
      wedge.row = -1;
      return false;
    }

    // Where the brick is being painted, and how much of its cell it still
    // fills. Both displacements and the wear, exactly as the hitbox reads them:
    // a wedge hanging off a row index while its brick is six pixels lower would
    // be a shadow detached from the thing casting it.
    const insetX = grid.erosion?.worn === true ? grid.erosion.insetXAt(row, column) : 0;
    const insetY = grid.erosion?.worn === true ? grid.erosion.insetYAt(row, column) : 0;
    const sag = grid.sheet?.offsetAt(row, column) ?? 0;
    const mouthY = top + row * brickHeight - grid.topOffset + sag + brickHeight - insetY;
    const mouthCx = left + column * brickWidth + brickWidth / 2;
    const mouthHalf = brickWidth / 2 - insetX;

    // The light: a point source `sunHeight` above the field's top edge, so the
    // ray through this brick is the vector from there to here, continued. The
    // outer columns rake harder than the inner ones because they genuinely are
    // further round the sun, which is the fan that says *sun* — and the clamp
    // is what stops the furthest one lying flat enough to skate a ball along.
    const raw = (mouthCx - this.sun) / (mouthY + umbra.sunHeight);
    const shear = Math.max(-umbra.maxShear, Math.min(umbra.maxShear, raw));

    // How far it may fall: its own reach, and never into the deck.
    const room = Math.max(0, deckTop - umbra.deckGap - mouthY);
    const full = Math.min(umbra.reach, room);

    const setStart = this.duration - umbra.setTicks;
    let drop = full;
    let slide = 0;
    let scale = 1;
    if (this.elapsed > setStart) {
      // The sun setting. The mouth leaves the brick and runs down the wedge's
      // own vector while the tip runs further still, so the shape stretches and
      // slides at once — and the whole quad thins to the single pixel the
      // arrival was born as. It is not the arrival backwards and it is not
      // meant to be: growing out of the foot and running off the edge are the
      // same sun and the opposite picture.
      const away = (this.elapsed - setStart) / umbra.setTicks;
      slide = umbra.setMouthRun * away;
      drop = full + umbra.setTipRun * away;
      scale = 1 + (umbra.setThinTo - 1) * away;
    } else {
      // The sun rising, column by column from the left frame the light comes up
      // on. A column that has not started yet is not drawn short, it is not
      // drawn: nothing in this capsule is ever at partial strength.
      const started = this.elapsed - column * umbra.riseStaggerTicks;
      if (started <= 0) {
        wedge.row = row;
        return false;
      }
      const grow = Math.min(1, started / umbra.riseUnfoldTicks);
      drop = full * grow;
      scale = grow;
    }

    wedge.row = row;
    wedge.shear = shear;
    wedge.mouthY = mouthY + slide;
    wedge.mouthCx = mouthCx + shear * slide;
    wedge.mouthHalf = mouthHalf * scale;
    wedge.tipY = wedge.mouthY + drop;
    wedge.tipCx = wedge.mouthCx + shear * drop;
    wedge.tipHalf = (umbra.tipWidth / 2) * scale;
    return drop > 0;
  }

  /**
   * One wedge into whole-pixel rows.
   *
   * The taper is linear from the mouth's half-width to the tip's, which is the
   * whole of why the field is a forest: twelve untapered shadows on a 30 px
   * pitch tile a fresh wall's band into one black slab, and twelve tapered ones
   * leave a V of open field between every pair that widens the further it falls.
   *
   * Rows are clipped to the field, never to the frame — a shadow does not fall
   * on the wall it is cast inside — and a row clipped away entirely is kept as
   * an empty span rather than ending the wedge, because a raking shadow can
   * leave the field and come back as the sun moves.
   */
  private rasterize(column: number): void {
    const wedge = this.wedges[column];
    if (wedge.tipY <= wedge.mouthY) {
      wedge.count = 0;
      return;
    }
    const { left: fieldLeft, right: fieldRight, height } = gameConfig.field;
    const span = wedge.tipY - wedge.mouthY;
    const first = Math.round(wedge.mouthY);
    const count = Math.min(MAX_ROWS, Math.max(1, Math.round(span)));
    const base = column * MAX_ROWS;

    let kept = 0;
    for (let index = 0; index < count; index++) {
      const y = first + index;
      // Everything past the bottom of the field is off the picture and out of
      // play; the sunset walks every wedge through it.
      if (y >= height) {
        break;
      }
      const down = y + 0.5 - wedge.mouthY;
      const at = Math.min(1, Math.max(0, down / span));
      const centre = wedge.mouthCx + wedge.shear * down;
      const half = wedge.mouthHalf + (wedge.tipHalf - wedge.mouthHalf) * at;
      // A shadow that has thinned below a pixel is still a pixel: the sunset
      // takes every wedge down to one, and a row rounded out of existence would
      // be a hole in a shape that is supposed to be leaving whole.
      const rawLeft = Math.round(centre - half);
      const rawRight = Math.max(Math.round(centre + half), rawLeft + 1);
      const left = Math.max(fieldLeft, rawLeft);
      const right = Math.min(fieldRight, rawRight);
      this.spanLeft[base + index] = left;
      this.spanRight[base + index] = Math.max(left, right);
      kept = index + 1;
    }
    wedge.top = first;
    wedge.count = kept;
  }

  private stepSurges(): void {
    for (let index = this.surges.length - 1; index >= 0; index--) {
      const surge = this.surges[index];
      const wedge = this.wedges[surge.column];
      // The caster it was reporting to is gone, or the column has handed over
      // to the brick above. Either way there is nothing left for it to arrive
      // at, and the kill burst has already said so louder than a band could.
      const home = --surge.ticksLeft <= 0;
      const lost = wedge.row !== surge.row || wedge.count === 0;
      if (home && !lost) {
        this.arrivals.push(surge);
      }
      if (home || lost) {
        this.surges.splice(index, 1);
      }
    }
  }

  /**
   * Where a ball inside the shadow field should come off, or null.
   *
   * Two passes over the same twelve wedges, and the division between them is
   * the ticket's "nearest face, not the first found". The spans decide *whether*
   * a ball is touching — exactly, in the pixels that are painted — and the quad
   * decides which of its four faces the ball is least far inside. Wedges overlap
   * across columns as the sun slants, so the winner is the smallest penetration
   * anywhere in the field rather than the first column to answer yes.
   */
  contact(ballX: number, ballY: number, size: number): ShadowContact | null {
    if (!this.solid) {
      return null;
    }
    const inset = gameConfig.ball.collisionInset;
    const nearX = ballX + inset;
    const farX = ballX + size - inset;
    const nearY = ballY + inset;
    const farY = ballY + size - inset;
    const centreX = ballX + size / 2;
    const centreY = ballY + size / 2;
    const radius = size / 2 - inset;

    let best: ShadowContact | null = null;
    for (let column = 0; column < COLUMN_COUNT; column++) {
      const wedge = this.wedges[column];
      if (wedge.count === 0 || wedge.row === -1) {
        continue;
      }
      if (farY < wedge.top || nearY > wedge.top + wedge.count) {
        continue;
      }
      if (!this.overlapsSpans(column, nearX, farX, nearY, farY)) {
        continue;
      }
      const face = this.nearestFace(wedge, centreX, centreY, radius);
      if (face !== null && (best === null || face.depth < best.depth)) {
        best = { column, row: wedge.row, normalX: face.nx, normalY: face.ny, depth: face.depth };
      }
    }
    return best;
  }

  // Whether the ball's box lands on any painted row of this wedge. Per row and
  // not per corner: a 24 px GIANT ball can contain a 12 px tip outright, and
  // four corners sampling round the outside of it would miss.
  private overlapsSpans(column: number, nearX: number, farX: number, nearY: number, farY: number): boolean {
    const wedge = this.wedges[column];
    const base = column * MAX_ROWS;
    const from = Math.max(0, Math.floor(nearY) - wedge.top);
    const to = Math.min(wedge.count - 1, Math.ceil(farY) - wedge.top);
    for (let index = from; index <= to; index++) {
      const left = this.spanLeft[base + index];
      const right = this.spanRight[base + index];
      if (right > left && farX > left && nearX < right) {
        return true;
      }
    }
    return false;
  }

  /**
   * The face of this quad the ball's circle is least far inside, and by how much.
   *
   * Plain separating-axis over four edges, which is all a convex quad needs.
   * The mouth is one of the four candidates rather than being skipped as "the
   * brick's edge": a ball arriving at the very top of a shadow is against the
   * underside of the caster, and (0, -1) is exactly what the brick itself would
   * have given it.
   */
  private nearestFace(
    wedge: ShadowWedge,
    x: number,
    y: number,
    radius: number,
  ): { nx: number; ny: number; depth: number } | null {
    const corners = [
      [wedge.mouthCx - wedge.mouthHalf, wedge.mouthY],
      [wedge.mouthCx + wedge.mouthHalf, wedge.mouthY],
      [wedge.tipCx + wedge.tipHalf, wedge.tipY],
      [wedge.tipCx - wedge.tipHalf, wedge.tipY],
    ];
    const midX = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4;
    const midY = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4;

    let bestDepth = Infinity;
    let bestX = 0;
    let bestY = 0;
    for (let index = 0; index < 4; index++) {
      const [ax, ay] = corners[index];
      const [bx, by] = corners[(index + 1) % 4];
      const edgeX = bx - ax;
      const edgeY = by - ay;
      const length = Math.hypot(edgeX, edgeY);
      if (length === 0) {
        continue;
      }
      // Outward by construction: flipped until it points away from the centre,
      // so a quad wound either way gives the same answer.
      let nx = edgeY / length;
      let ny = -edgeX / length;
      if ((midX - ax) * nx + (midY - ay) * ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const depth = radius - ((x - ax) * nx + (y - ay) * ny);
      // Outside this face's plane by more than the ball's radius: the axis
      // separates, and the ball is not in this quad at all.
      if (depth <= 0) {
        return null;
      }
      if (depth < bestDepth) {
        bestDepth = depth;
        bestX = nx;
        bestY = ny;
      }
    }
    return bestDepth === Infinity ? null : { nx: bestX, ny: bestY, depth: bestDepth };
  }

  // A hit landing: the band that runs home. `fromY` is where the ball met the
  // wedge, so a contact near the tip has further to travel than one taken under
  // the brick — the report is as long as the shadow was.
  strike(column: number, row: number, fromY: number): void {
    this.surges.push({ column, row, fromY, ticksLeft: gameConfig.powerUps.umbra.surgeTicks });
  }
}
