import { gameConfig } from "@core/config/GameConfig";

import type { ObserverDefinition } from "@interfaces/types";

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
 * Absent on the other thirty-eight levels. `live` is false and every reader is
 * expected to ask.
 */
export class Observer {
  private definition: ObserverDefinition | null = null;
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

  get live(): boolean {
    return this.definition !== null;
  }

  get level(): ObserverDefinition | null {
    return this.definition;
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
    const socket = this.definition?.eye;
    return socket ? eyePupilPoint(socket, this.open, this.target) : { x: 0, y: 0 };
  }

  /**
   * The veil's own block, or nothing on an ordinary level.
   *
   * The look starts on the socket rather than anywhere else, so the first frame
   * of a veil is an eye looking straight out — the glide below carries it to
   * the deck over the next few ticks, which is a level opening by noticing the
   * player rather than by snapping to them.
   */
  load(definition: ObserverDefinition | undefined): void {
    this.definition = definition ?? null;
    this.empty = false;
    this.blinkLeft = 0;
    this.nextBlink = this.drawNextBlink();
    this.stars.length = 0;
    for (const _star of definition?.diadem ?? []) {
      this.stars.push(false);
    }
    this.lookX = definition?.eye.x ?? 0;
    this.lookY = definition?.eye.y ?? 0;
  }

  reset(): void {
    this.load(undefined);
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
  step(at: { x: number; y: number } | null): boolean {
    if (!this.definition) {
      return false;
    }
    const { blinkTicks } = gameConfig.observer.eye;
    let blinked = false;
    // THE LID does not blink, shut or woken: the clock is skipped rather than
    // having its result thrown away by `open`, so an eye that is later opened
    // by something else cannot come up mid-blink from a lid nobody watched.
    if (this.definition.mode === "lid") {
      this.lookAt(at);
      return false;
    }
    if (this.blinkLeft > 0) {
      this.blinkLeft -= 1;
    } else if (--this.nextBlink <= 0) {
      this.blinkLeft = blinkTicks;
      this.nextBlink = this.drawNextBlink();
      blinked = true;
    }
    this.lookAt(at);
    return blinked;
  }

  private lookAt(at: { x: number; y: number } | null): void {
    const { trackEase } = gameConfig.observer.eye;
    const to = at ?? this.definition?.eye ?? { x: this.lookX, y: this.lookY };
    this.lookX += (to.x - this.lookX) * trackEase;
    this.lookY += (to.y - this.lookY) * trackEase;
  }

  private drawNextBlink(): number {
    const { blinkMin, blinkRand } = gameConfig.observer.eye;
    return blinkMin + Math.floor(Math.random() * blinkRand);
  }
}
