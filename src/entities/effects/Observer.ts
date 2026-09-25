import { gameConfig } from "@core/config/GameConfig";
import { EYE_ACT, EYE_LAYER, EYE_PATH, EYE_TINT, EYE_WATCH } from "@interfaces/eye";

import type { EyeLayer, EyeTint, EyeWatch } from "@interfaces/eye";
import type { EyeAct, EyePathPoint, EyePlacement, EyeSpot, FieldRect, ObserverDefinition } from "@interfaces/types";

/** A socket: where the almond is, and how big. */
export interface EyeSocket {
  x: number;
  y: number;
  hw: number;
  hh: number;
}

/**
 * Where the pupil actually is, for a socket looking at a point through a lid
 * this far open.
 *
 * **One function, three readers.** The renderer draws the eye from it, the
 * gallery's still draws a resting one from it, and THE IRIS's gaze fires out of
 * it (SHA-173) — and a beam that came out of a *slightly* different place from
 * the pupil it is supposed to be coming out of is the kind of thing nobody sees
 * until it is on screen. It is a pure function of the four things the drawing
 * already reads, so there is nothing to keep in step.
 *
 * The iris is bounded inside the lid rather than clipped by it; `drawEye` says
 * at length why.
 */
export function eyePupilPoint(
  socket: EyeSocket,
  open: number,
  target: { x: number; y: number },
): {
  x: number;
  y: number;
} {
  const { trackX, trackY, irisRadius } = gameConfig.observer.eye;
  const lid = Math.max(2, Math.round(socket.hh * open));
  const iris = Math.round(socket.hh * irisRadius);
  const reachX = Math.max(0, socket.hw - iris - 4);
  const reachY = Math.max(0, lid - iris - 1);
  return {
    x: Math.round(socket.x + Math.max(-reachX, Math.min(reachX, (target.x - socket.x) * trackX))),
    y: Math.round(socket.y + Math.max(-reachY, Math.min(reachY, (target.y - socket.y) * trackY))),
  };
}

/** Whether a point is inside a field rectangle. */
export function insideRect(rect: FieldRect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h;
}

/**
 * What a placed eye reads off the level each tick (SHA-188). The game builds
 * it; the eye never touches the grid.
 */
export interface EyeSight {
  standing(column: number, row: number): boolean;
  /** How much of the wall is gone: 0 fresh, 1 on the last brick (SHA-200). */
  wallFraction: number;
  /** The ball in flight nearest the eye, or null on a serve (SHA-202). */
  ball: { x: number; y: number } | null;
}

/** A brick-hosted eye's socket: centred on its cell, at the placement's size. */
export function cellSocket(cell: readonly [number, number], hw: number, hh: number): EyeSocket {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  return {
    x: left + cell[0] * brickWidth + brickWidth / 2,
    y: top + cell[1] * brickHeight + brickHeight / 2,
    hw,
    hh,
  };
}

/** The pane a brick-hosted eye is seen through: the brick's face inside its bevel. */
export function cellWindow(cell: readonly [number, number]): FieldRect {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  return {
    x: left + cell[0] * brickWidth + 1,
    y: top + cell[1] * brickHeight + 1,
    w: brickWidth - 2,
    h: brickHeight - 2,
  };
}

/**
 * THE OBSERVER (SHA-167): the eye behind the wall, on the five veils.
 *
 * **It is not matter.** Nothing collides with it, nothing bounces off it, and
 * the ball passes over it — what it is, on this first veil, is a thing that
 * looks back. Everything the Observer will later *do* (the gaze, the tears, the
 * rebuild, the seal) is a mode added to this same object, which is why the
 * clock and the look live here rather than as four numbers on the game: the eye
 * is one creature with a state, and the renderer reads it the way it reads the
 * wear off `Erosion` or the fog off `Decoherence`.
 *
 * On the other thirty-eight levels it is the same eye at rest or acting, from
 * the level's `eye` placement (SHA-188): a socket, a side of the wall, an
 * opacity, a clip window. `live` is false only on a level with neither block,
 * and every reader is expected to ask.
 */
export class Observer {
  private definition: ObserverDefinition | null = null;
  /**
   * THE 43 (SHA-188): the posture on an ordinary level. Null on a veil, whose
   * block has its own socket, and on a level with no eye at all.
   */
  private placement: EyePlacement | null = null;
  /**
   * THE BRICK EYE's host: which of the placement's bricks it is in, whether it
   * still holds one, and the one it is about to blink into — `-1` for none,
   * which leaves it in the last hole.
   */
  private cellIndex = 0;
  private cellHeld = false;
  private pendingCell: number | null = null;
  /** Ticks left of the current blink, 0 while the eye is open. */
  private blinkLeft = 0;
  /** Ticks until the next one starts. */
  private nextBlink = 0;
  private lookX = 0;
  private lookY = 0;
  /**
   * THE DIADEM (SHA-170): which of the veil's six stars are lit.
   *
   * On the eye rather than in its own object because three different things
   * light them — a beast killed (SHA-170), the oculi completed (SHA-171), the
   * pupil killed inside (SHA-172, two at once) — and none of the three owns an
   * index. Each takes the next dark one, so the constellation fills in the arc's
   * own order however the player earned it — and the threads between adjacent
   * lit stars make that order visible on the field.
   */
  private readonly stars: boolean[] = [];
  /**
   * THE LID (SHA-176): the seal is broken and the pupil has gone.
   *
   * A flag on the eye rather than on the game, because what it changes is how
   * the eye *is* — a slit that does not blink becomes a socket held wide with
   * nothing in it — and every reader of `open` and `hollow` already has the
   * Observer in hand. It is the eye's one irreversible state: nothing sets it
   * back but the next level.
   */
  private empty = false;
  /**
   * THE RISE (SHA-200): how far the eye has ridden the wall down, eased toward
   * the share of it broken — so a brick moves it on over a few ticks rather
   * than in a jump, and a brick put back (a snail's mortar, a vine's lay)
   * lets it sink the same way.
   */
  private fraction = 0;
  /** Whether it was tracking last tick: the tick it wakes is a blink. */
  private wasAwake = true;
  /**
   * THE PATROL (SHA-202): how far along its beat, 0 at rest to 1 at `to`,
   * which way it is headed, and its speed in pixels a tick — eased, so it
   * slows into a turn and into a hold rather than stopping dead.
   */
  private travel = 0;
  private travelDir: 1 | -1 = 1;
  private travelSpeed = 0;
  /** THE PULSE (SHA-203): ticks since the level loaded, which is the beat's clock. */
  private clock = 0;
  /**
   * THE STAIRS (SHA-204): the stair it is on, the one it will land on at the
   * bottom of the blink under way (null when none is), and the strike's edge —
   * true for the one tick it lands on the last stair.
   */
  private stair = 0;
  private pendingStair: number | null = null;
  private strikeEdge = false;
  /**
   * Whatever an act wants done with the lid down — a hop to another place, a
   * path starting again. Applied at the bottom of the blink, like the brick
   * eye's move, so no act ever moves the eye in plain sight in one frame.
   */
  private pendingHop: (() => void) | null = null;
  /** THE PATH: how far along it in pixels, and which way. */
  private pathAt = 0;
  private pathDir: 1 | -1 = 1;
  /** THE HAUNT: the place it holds, and where it is while gliding to it. */
  private haunt = 0;
  private glideX = 0;
  private glideY = 0;
  /** THE DUCK: the spot it is at. */
  private duck = 0;
  /** THE BOUNCE: out yet, how far out (for the opacity), where and which way. */
  private loose = false;
  private looseBlend = 0;
  private looseX = 0;
  private looseY = 0;
  private looseVx = 1;
  private looseVy = 1;
  /** THE FOLLOW: the height it has got to. */
  private followY = 0;

  get live(): boolean {
    return this.definition !== null || this.placement !== null;
  }

  get level(): ObserverDefinition | null {
    return this.definition;
  }

  /**
   * The socket this frame — a veil's, or the placement's — and null when
   * there is no eye. Every reader of "where is the eye" comes through here:
   * the renderer, the still, the look, the gaze's source.
   */
  get socket(): EyeSocket | null {
    if (this.definition) {
      return this.definition.eye;
    }
    const placed = this.placement;
    if (!placed) {
      return null;
    }
    const cell = this.hostCell;
    return cell ? cellSocket(cell, placed.hw, placed.hh) : this.posture(placed);
  }

  /** THE STAIRS reached the bottom this tick: an edge, true for one tick (SHA-204). */
  get struck(): boolean {
    return this.strikeEdge;
  }

  /** What this eye watches (SHA-196): the ball unless the level says otherwise. */
  get watch(): EyeWatch {
    return this.placement?.watch ?? EYE_WATCH.BALL;
  }

  /** The placement's act, or null when it only sits and watches. */
  get act(): EyeAct | null {
    return this.placement?.act ?? null;
  }

  /**
   * Whether the look follows the ball. Only THE RISE ever says no, and only
   * until its wall is far enough down: a dead stare straight out is the tell
   * that the eye has not noticed you yet.
   */
  get awake(): boolean {
    const act = this.placement?.act;
    return act?.kind === EYE_ACT.RISE && act.wakeAt !== undefined ? this.fraction >= act.wakeAt : true;
  }

  /**
   * THE PULSE's phase, 0 at rest and 1 at the top of the thump: a fast rise
   * over the first fifth of the beat and a slow let-go over the rest, both
   * eased, so the eye swells like a muscle rather than ticking like a gauge.
   */
  private beat(period: number): number {
    const phase = (this.clock % period) / period;
    const rise = gameConfig.observer.eye.pulseRise;
    return phase < rise
      ? Math.sin(((phase / rise) * Math.PI) / 2)
      : (1 + Math.cos(((phase - rise) / (1 - rise)) * Math.PI)) / 2;
  }

  /** The place THE HAUNT holds right now, or null on any other act. */
  private get spot(): EyeSpot | null {
    const act = this.placement?.act;
    return act?.kind === EYE_ACT.HAUNT ? (act.spots[this.haunt] ?? null) : null;
  }

  /** Where THE PATH has got to: centre, and the opacity and scale it carries there. */
  private pathPoint(points: readonly EyePathPoint[]): { x: number; y: number; opacity?: number; scale: number } {
    const at = walkPath(points, this.pathAt, this.pathLoops);
    return at;
  }

  private get pathLoops(): boolean {
    const act = this.placement?.act;
    return act?.kind === EYE_ACT.PATH && (act.mode ?? EYE_PATH.LOOP) === EYE_PATH.LOOP;
  }

  /** The placement's socket after its act has moved it this frame. */
  private posture(placed: EyePlacement): EyeSocket {
    const rest = { x: placed.x, y: placed.y, hw: placed.hw, hh: placed.hh };
    const act = placed.act;
    if (act?.kind === EYE_ACT.PATH) {
      const at = this.pathPoint(act.points);
      return {
        x: Math.round(at.x),
        y: Math.round(at.y),
        hw: Math.round(rest.hw * at.scale),
        hh: Math.round(rest.hh * at.scale),
      };
    }
    if (act?.kind === EYE_ACT.HAUNT) {
      const spot = this.spot;
      return {
        x: Math.round(this.glideX),
        y: Math.round(this.glideY),
        hw: spot?.hw ?? rest.hw,
        hh: spot?.hh ?? rest.hh,
      };
    }
    if (act?.kind === EYE_ACT.DUCK) {
      const [x, y] = act.spots[this.duck] ?? [rest.x, rest.y];
      return { x, y, hw: rest.hw, hh: rest.hh };
    }
    if (act?.kind === EYE_ACT.BOUNCE) {
      return { x: Math.round(this.looseX), y: Math.round(this.looseY), hw: rest.hw, hh: rest.hh };
    }
    if (act?.kind === EYE_ACT.FOLLOW) {
      return { x: rest.x, y: Math.round(this.followY), hw: rest.hw, hh: rest.hh };
    }
    if (act?.kind === EYE_ACT.STAIRS) {
      const [x, y] = act.steps[this.stair] ?? [rest.x, rest.y];
      return { x, y, hw: rest.hw, hh: rest.hh };
    }
    if (act?.kind === EYE_ACT.PULSE) {
      const swell = 1 + (act.scale - 1) * this.beat(act.period);
      return { x: rest.x, y: rest.y, hw: Math.round(rest.hw * swell), hh: Math.round(rest.hh * swell) };
    }
    if (act?.kind === EYE_ACT.PATROL) {
      return {
        x: Math.round(rest.x + (act.to.x - rest.x) * this.travel),
        y: Math.round(rest.y + (act.to.y - rest.y) * this.travel),
        hw: rest.hw,
        hh: rest.hh,
      };
    }
    if (act?.kind !== EYE_ACT.RISE || !act.to) {
      return rest;
    }
    // Whole pixels: the eye climbs a pixel at a time, never a smear of them.
    const ride = (from: number, to: number | undefined) => Math.round(from + ((to ?? from) - from) * this.fraction);
    return {
      x: ride(rest.x, act.to.x),
      y: ride(rest.y, act.to.y),
      hw: ride(rest.hw, act.to.hw),
      hh: ride(rest.hh, act.to.hh),
    };
  }

  /** In front of the wall while it is in a brick — it is drawn on the brick's face. */
  get layer(): EyeLayer {
    if (this.hostCell) {
      return EYE_LAYER.FRONT;
    }
    return this.spot?.layer ?? this.placement?.layer ?? EYE_LAYER.BEHIND;
  }

  get opacity(): number {
    const placed = this.placement;
    if (!placed) {
      return 1;
    }
    const base = placed.opacity ?? 1;
    const act = placed.act;
    if (act?.kind === EYE_ACT.RISE && act.to?.opacity !== undefined) {
      return base + (act.to.opacity - base) * this.fraction;
    }
    if (act?.kind === EYE_ACT.PULSE && act.opacity) {
      const [low, high] = act.opacity;
      return low + (high - low) * this.beat(act.period);
    }
    if (act?.kind === EYE_ACT.PATH) {
      return this.pathPoint(act.points).opacity ?? base;
    }
    if (act?.kind === EYE_ACT.BOUNCE && act.opacity !== undefined) {
      return base + (act.opacity - base) * this.looseBlend;
    }
    return base;
  }

  /** The brick's face while it is in one; otherwise whatever window the level gave it. */
  get clip(): FieldRect | null {
    const cell = this.hostCell;
    if (cell) {
      return cellWindow(cell);
    }
    const spot = this.spot;
    return spot ? (spot.clip ?? null) : (this.placement?.clip ?? null);
  }

  /**
   * The reflection (SHA-189): the same socket mirrored across the level's
   * line, looking the mirrored way, never blinking. One eye and its image —
   * not a second eye.
   */
  get reflection(): { socket: EyeSocket; target: { x: number; y: number }; opacity: number } | null {
    const mirror = this.placement?.reflection;
    const socket = this.socket;
    if (!mirror || !socket) {
      return null;
    }
    return {
      socket: { ...socket, x: 2 * mirror.axis - socket.x },
      target: { x: 2 * mirror.axis - this.lookX, y: this.lookY },
      opacity: mirror.opacity,
    };
  }

  /** The brick the eye is in right now, or null when it is not in one. */
  private get hostCell(): readonly [number, number] | null {
    const cells = this.placement?.cells;
    return cells && this.cellHeld ? (cells[this.cellIndex] ?? null) : null;
  }

  /** A veil's tint; a placed eye is always blue. */
  get tint(): EyeTint {
    return this.definition?.tint ?? EYE_TINT.BLUE;
  }

  /**
   * How far the lid is open, 1 wide to 0.06 at the bottom of a blink.
   *
   * Never quite 0: an eye that shut completely would vanish into the field for
   * a frame and read as a dropped sprite rather than as a blink. The curve is
   * the distance from the blink's midpoint, so it closes and opens at one rate
   * and needs no second clock.
   */
  get open(): number {
    // THE LID's two states, and neither of them blinks. Shut, it is a slit with
    // something behind it; woken, it is a socket held wide with nothing in it —
    // and the eye never goes back to either, so there is no clock in here.
    if (this.definition?.mode === "lid") {
      return this.empty ? 1 : gameConfig.observer.lid.slit;
    }
    if (this.blinkLeft <= 0) {
      return 1;
    }
    const { blinkTicks } = gameConfig.observer.eye;
    const middle = blinkTicks / 2;
    return Math.max(0.06, Math.abs(this.blinkLeft - middle) / middle);
  }

  /** Whether the socket has been emptied — THE LID's waking, and nothing else. */
  get hollow(): boolean {
    return this.empty;
  }

  /** The seal is broken. Irreversible for the rest of the level. */
  wake(): void {
    this.empty = true;
    this.blinkLeft = 0;
  }

  /** The six stars, in the order the level places them. */
  get diadem(): readonly boolean[] {
    return this.stars;
  }

  get starsLit(): number {
    return this.stars.filter(Boolean).length;
  }

  /**
   * Light the next dark star. `false` when they are all lit, which is not an
   * error: a veil can earn more than six and the sky simply has no more room.
   */
  lightStar(): boolean {
    const next = this.stars.indexOf(false);
    if (next < 0) {
      return false;
    }
    this.stars[next] = true;
    return true;
  }

  /** Where the iris is looking, in field pixels. */
  get target(): { x: number; y: number } {
    return { x: this.lookX, y: this.lookY };
  }

  /** Where the pupil is this frame — what THE IRIS's gaze fires out of. */
  get pupil(): { x: number; y: number } {
    const socket = this.socket;
    return socket ? eyePupilPoint(socket, this.open, this.target) : { x: 0, y: 0 };
  }

  /**
   * The veil's own block, or the level's placement, or nothing.
   *
   * The look starts on the socket rather than anywhere else, so the first frame
   * of a veil is an eye looking straight out — the glide below carries it to
   * the deck over the next few ticks, which is a level opening by noticing the
   * player rather than by snapping to them.
   */
  load(definition: ObserverDefinition | undefined, placement: EyePlacement | undefined): void {
    this.definition = definition ?? null;
    // A veil's socket wins outright: the two blocks are never both written on
    // a level, and if one ever were the veil is the one with a mode to run.
    this.placement = definition ? null : (placement ?? null);
    this.cellIndex = 0;
    this.cellHeld = (this.placement?.cells?.length ?? 0) > 0;
    this.pendingCell = null;
    this.empty = false;
    this.fraction = 0;
    this.wasAwake = this.awake;
    this.travel = 0;
    this.travelDir = 1;
    this.travelSpeed = 0;
    this.clock = 0;
    this.stair = 0;
    this.pendingStair = null;
    this.strikeEdge = false;
    this.pendingHop = null;
    this.pathAt = 0;
    this.pathDir = 1;
    this.haunt = 0;
    this.glideX = this.placement?.act?.kind === EYE_ACT.HAUNT ? (this.placement.act.spots[0]?.x ?? 0) : 0;
    this.glideY = this.placement?.act?.kind === EYE_ACT.HAUNT ? (this.placement.act.spots[0]?.y ?? 0) : 0;
    this.duck = 0;
    this.loose = false;
    this.looseBlend = 0;
    this.looseX = this.placement?.x ?? 0;
    this.looseY = this.placement?.y ?? 0;
    this.looseVx = 1;
    this.looseVy = -1;
    this.followY = this.placement?.y ?? 0;
    this.blinkLeft = 0;
    this.nextBlink = this.drawNextBlink();
    this.stars.length = 0;
    for (const _star of definition?.diadem ?? []) {
      this.stars.push(false);
    }
    const socket = this.socket;
    this.lookX = socket?.x ?? 0;
    this.lookY = socket?.y ?? 0;
  }

  reset(): void {
    this.load(undefined, undefined);
  }

  /**
   * One tick of the clock, and one step of the look toward `at`. **`true` on the
   * tick a blink begins**, which is the whole of THE WRATH's clock (SHA-175).
   *
   * Returned rather than published as a flag for `Inside.step` and `Oculi.step`'s
   * reason: the edge is what the caller wants and the edge lasts one tick, so
   * handing it back is the only shape that cannot be read twice or missed. The
   * eye does not know what a rebuilt brick is; it knows when it shut its lid.
   *
   * The glide is the whole reason the target is eased rather than assigned. A
   * ball is a fast, small thing and the eye keeps up with it inside a few ticks;
   * what the ease is really for is the *switch* — a MULTI puts a dozen balls on
   * the field and which one is nearest flips several times a second, and an iris
   * cutting between them would twitch. Eased, a switch is a glance.
   */
  step(at: { x: number; y: number } | null, sight: EyeSight): boolean {
    if (!this.live) {
      return false;
    }
    const { blinkTicks } = gameConfig.observer.eye;
    let blinked = false;
    this.clock += 1;
    this.strikeEdge = false;
    // THE LID does not blink, shut or woken: the clock is skipped rather than
    // having its result thrown away by `open`, so an eye that is later opened
    // by something else cannot come up mid-blink from a lid nobody watched.
    if (this.definition?.mode === "lid") {
      this.lookAt(at);
      return false;
    }
    this.stepHost(sight);
    this.stepRise(sight);
    this.stepPatrol(sight);
    this.stepPath();
    this.stepHaunt(sight);
    this.stepDuck(sight);
    this.stepBounce(sight);
    this.stepFollow(sight);
    if (this.blinkLeft > 0) {
      this.blinkLeft -= 1;
      // A hop lands at the bottom of the blink: shut here, open there.
      if (this.pendingCell !== null && this.blinkLeft === Math.floor(blinkTicks / 2)) {
        if (this.pendingCell >= 0) {
          this.cellIndex = this.pendingCell;
        } else {
          this.cellHeld = false;
        }
        this.pendingCell = null;
      }
      // THE STAIRS land the same way: the lid is down over the move.
      if (this.pendingStair !== null && this.blinkLeft === Math.floor(blinkTicks / 2)) {
        this.landStair(this.pendingStair);
        this.pendingStair = null;
      }
      // And every other act's hop.
      if (this.pendingHop !== null && this.blinkLeft === Math.floor(blinkTicks / 2)) {
        const hop = this.pendingHop;
        this.pendingHop = null;
        const before = this.socket;
        hop();
        const after = this.socket;
        // The look travels with the socket, so the pupil opens on the new
        // place looking the way it was looking.
        if (before && after) {
          this.lookX += after.x - before.x;
          this.lookY += after.y - before.y;
        }
      }
    } else if (--this.nextBlink <= 0) {
      this.blinkLeft = blinkTicks;
      this.nextBlink = this.drawNextBlink();
      blinked = true;
      const act = this.placement?.act;
      if (act?.kind === EYE_ACT.STAIRS && act.steps.length > 0) {
        this.pendingStair = (this.stair + 1) % act.steps.length;
      }
    }
    // Asleep, the look is on the socket's own centre — straight out.
    this.lookAt(this.awake ? at : null);
    return blinked;
  }

  /**
   * THE RISE (SHA-200): ride the wall, and wake on a blink. The blink is the
   * eye noticing you — without it the pupil would simply start drifting
   * toward the ball, and a look that changes without the face doing anything
   * reads as a glitch rather than as something waking up.
   */
  private stepRise(sight: EyeSight): void {
    if (this.placement?.act?.kind !== EYE_ACT.RISE) {
      return;
    }
    const target = Math.max(0, Math.min(1, sight.wallFraction));
    this.fraction += (target - this.fraction) * gameConfig.observer.eye.riseEase;
    const awake = this.awake;
    if (awake && !this.wasAwake && this.blinkLeft <= 0) {
      this.blinkLeft = gameConfig.observer.eye.blinkTicks;
      this.nextBlink = this.drawNextBlink();
    }
    this.wasAwake = awake;
  }

  /**
   * THE BRICK EYE's move. Losing its brick does not teleport it: the lid comes
   * down here and goes up there, so the hop is a blink and reads as one —
   * there is no frame in which the eye is nowhere, or in two places. The next
   * brick is the next one standing in the level's order, round again; with
   * none left it is released into the last hole on the same blink.
   */
  private stepHost(sight: EyeSight): void {
    const cells = this.placement?.cells;
    const cell = this.hostCell;
    if (!cells || !cell || this.pendingCell !== null || sight.standing(cell[0], cell[1])) {
      return;
    }
    let next = -1;
    for (let ahead = 1; ahead < cells.length; ahead += 1) {
      const index = (this.cellIndex + ahead) % cells.length;
      const candidate = cells[index];
      if (sight.standing(candidate[0], candidate[1])) {
        next = index;
        break;
      }
    }
    this.pendingCell = next;
    if (this.blinkLeft <= 0) {
      this.blinkLeft = gameConfig.observer.eye.blinkTicks;
      this.nextBlink = this.drawNextBlink();
    }
  }

  /**
   * THE PATROL (SHA-202): a sentry's beat. Full speed on the open stretch,
   * slowing over the last few pixels into each end so the turn is a turn and
   * not a bounce, and easing to a stop while a ball is inside `hold` — where
   * it stays, watching, until the ball has gone.
   */
  private stepPatrol(sight: EyeSight): void {
    const placed = this.placement;
    const act = placed?.act;
    if (!placed || act?.kind !== EYE_ACT.PATROL) {
      return;
    }
    const { patrolEase, patrolBrake } = gameConfig.observer.eye;
    const length = Math.hypot(act.to.x - placed.x, act.to.y - placed.y) || 1;
    const held = act.hold !== undefined && sight.ball !== null && insideRect(act.hold, sight.ball);
    const ahead = (this.travelDir === 1 ? 1 - this.travel : this.travel) * length;
    const cruise = held ? 0 : act.speed * Math.max(0.15, Math.min(1, ahead / patrolBrake));
    this.travelSpeed += (cruise - this.travelSpeed) * patrolEase;
    this.travel += (this.travelDir * this.travelSpeed) / length;
    if (this.travel >= 1 || this.travel <= 0) {
      this.travel = Math.max(0, Math.min(1, this.travel));
      this.travelDir = this.travelDir === 1 ? -1 : 1;
    }
  }

  /**
   * THE STAIRS (SHA-204): on the stair, and — on the last one — the strike.
   * The look is carried with the socket, so the pupil opens on the new stair
   * looking the way it was looking rather than swinging in from the old one.
   */
  private landStair(index: number): void {
    const act = this.placement?.act;
    if (act?.kind !== EYE_ACT.STAIRS) {
      return;
    }
    const [fromX, fromY] = act.steps[this.stair] ?? [0, 0];
    const [toX, toY] = act.steps[index] ?? [0, 0];
    this.lookX += toX - fromX;
    this.lookY += toY - fromY;
    this.stair = index;
    this.strikeEdge = act.strike === true && index === act.steps.length - 1;
  }

  /** Shut the lid and do `move` at the bottom of the blink. One at a time. */
  private hop(move: () => void): void {
    if (this.pendingHop !== null) {
      return;
    }
    this.pendingHop = move;
    if (this.blinkLeft <= 0) {
      this.blinkLeft = gameConfig.observer.eye.blinkTicks;
      this.nextBlink = this.drawNextBlink();
    }
  }

  /** THE PATH (SHA-188): walk it, and turn, wrap or start again at the end. */
  private stepPath(): void {
    const act = this.placement?.act;
    if (act?.kind !== EYE_ACT.PATH) {
      return;
    }
    const mode = act.mode ?? EYE_PATH.LOOP;
    const total = pathLength(act.points, mode === EYE_PATH.LOOP);
    if (total <= 0) {
      return;
    }
    if (mode === EYE_PATH.LOOP) {
      this.pathAt = (this.pathAt + act.speed) % total;
      return;
    }
    if (mode === EYE_PATH.PINGPONG) {
      this.pathAt += this.pathDir * act.speed;
      if (this.pathAt >= total || this.pathAt <= 0) {
        this.pathAt = Math.max(0, Math.min(total, this.pathAt));
        this.pathDir = this.pathDir === 1 ? -1 : 1;
      }
      return;
    }
    // RESTART: it waits at the end with its lid coming down, and opens at the start.
    if (this.pathAt < total) {
      this.pathAt = Math.min(total, this.pathAt + act.speed);
      return;
    }
    this.hop(() => {
      this.pathAt = 0;
    });
  }

  /**
   * THE HAUNT (SHA-188): hold the place while any of its bricks stands; when
   * the last one falls, go to the next place still guarded — or the last
   * place, which has no guard. On a blink, or gliding if the act says so.
   */
  private stepHaunt(sight: EyeSight): void {
    const act = this.placement?.act;
    if (act?.kind !== EYE_ACT.HAUNT) {
      return;
    }
    const held = (spot: EyeSpot): boolean =>
      spot.guard === undefined || spot.guard.some(([column, row]) => sight.standing(column, row));
    let next = this.haunt;
    while (next < act.spots.length - 1 && act.spots[next].guard !== undefined && !held(act.spots[next])) {
      next += 1;
    }
    const target = act.spots[next];
    if (next !== this.haunt) {
      if (act.glide !== undefined) {
        this.haunt = next;
      } else {
        this.hop(() => {
          this.haunt = next;
          this.glideX = target.x;
          this.glideY = target.y;
        });
        return;
      }
    }
    if (!target) {
      return;
    }
    const speed = act.glide ?? Number.POSITIVE_INFINITY;
    const dx = target.x - this.glideX;
    const dy = target.y - this.glideY;
    const distance = Math.hypot(dx, dy);
    if (distance <= speed) {
      this.glideX = target.x;
      this.glideY = target.y;
    } else {
      this.glideX += (dx / distance) * speed;
      this.glideY += (dy / distance) * speed;
    }
  }

  /** THE DUCK (SHA-188): a ball too close, and it blinks away somewhere else. */
  private stepDuck(sight: EyeSight): void {
    const act = this.placement?.act;
    const socket = this.socket;
    if (act?.kind !== EYE_ACT.DUCK || !socket || !sight.ball || act.spots.length < 2) {
      return;
    }
    if (Math.hypot(sight.ball.x - socket.x, sight.ball.y - socket.y) > act.near) {
      return;
    }
    const others = act.spots.map((_, index) => index).filter((index) => index !== this.duck);
    const pick = others[Math.floor(Math.random() * others.length)];
    this.hop(() => {
      this.duck = pick;
    });
  }

  /**
   * THE BOUNCE (SHA-188): held until its bricks are gone, then out — drifting
   * inside its area and off its edges like a ball, fading to its own opacity.
   */
  private stepBounce(sight: EyeSight): void {
    const act = this.placement?.act;
    if (act?.kind !== EYE_ACT.BOUNCE) {
      return;
    }
    if (!this.loose) {
      this.loose = act.guard === undefined || !act.guard.some(([column, row]) => sight.standing(column, row));
      return;
    }
    this.looseBlend = Math.min(1, this.looseBlend + 1 / gameConfig.observer.eye.releaseTicks);
    // It gets up to speed with the fade rather than leaving at full tilt.
    const speed = act.speed * this.looseBlend;
    const { x, y, w, h } = act.area;
    this.looseX += this.looseVx * speed;
    this.looseY += this.looseVy * speed;
    if (this.looseX < x || this.looseX > x + w) {
      this.looseVx = this.looseX < x ? 1 : -1;
      this.looseX = Math.max(x, Math.min(x + w, this.looseX));
    }
    if (this.looseY < y || this.looseY > y + h) {
      this.looseVy = this.looseY < y ? 1 : -1;
      this.looseY = Math.max(y, Math.min(y + h, this.looseY));
    }
  }

  /** THE FOLLOW (SHA-188): ride its line after the ball's height. */
  private stepFollow(sight: EyeSight): void {
    const act = this.placement?.act;
    if (act?.kind !== EYE_ACT.FOLLOW) {
      return;
    }
    const want = Math.max(act.min, Math.min(act.max, sight.ball?.y ?? this.placement?.y ?? this.followY));
    this.followY += Math.max(-act.speed, Math.min(act.speed, want - this.followY));
  }

  private lookAt(at: { x: number; y: number } | null): void {
    const { trackEase } = gameConfig.observer.eye;
    const to = at ?? this.socket ?? { x: this.lookX, y: this.lookY };
    this.lookX += (to.x - this.lookX) * trackEase;
    this.lookY += (to.y - this.lookY) * trackEase;
  }

  private drawNextBlink(): number {
    const { blinkMin, blinkRand } = gameConfig.observer.eye;
    return blinkMin + Math.floor(Math.random() * blinkRand);
  }
}

/** THE PATH's length, closed back to its first point when it loops. */
function pathLength(points: readonly EyePathPoint[], closed: boolean): number {
  let total = 0;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    total += Math.hypot(to[0] - from[0], to[1] - from[1]);
  }
  return total;
}

/**
 * The point `distance` pixels along a path, with the opacity and the scale
 * the points carry, eased between them. Points that do not say are opaque
 * as the placement says, at full size.
 */
function walkPath(
  points: readonly EyePathPoint[],
  distance: number,
  closed: boolean,
): { x: number; y: number; opacity?: number; scale: number } {
  const first = points[0];
  if (!first) {
    return { x: 0, y: 0, scale: 1 };
  }
  const count = closed ? points.length : points.length - 1;
  let left = distance;
  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (left <= length || index === count - 1) {
      const t = length > 0 ? Math.min(1, left / length) : 0;
      const between = (a: number | undefined, b: number | undefined, fallback: number) =>
        (a ?? fallback) + ((b ?? fallback) - (a ?? fallback)) * t;
      const opacity = from[2] !== undefined || to[2] !== undefined ? between(from[2], to[2], 1) : undefined;
      return {
        x: from[0] + (to[0] - from[0]) * t,
        y: from[1] + (to[1] - from[1]) * t,
        opacity,
        scale: between(from[3], to[3], 1),
      };
    }
    left -= length;
  }
  return { x: first[0], y: first[1], opacity: first[2], scale: first[3] ?? 1 };
}
