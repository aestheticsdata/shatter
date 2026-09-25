import { gameConfig } from "@core/config/GameConfig";

/**
 * THE LID's loose pupil (SHA-176): what comes out of the socket when the seal
 * breaks.
 *
 * **The same sprite as INSIDE THE EYE's pupil, and nothing else in common.**
 * That one is a boss in a room of its own, on an orbit, against a clock; this
 * one is loose in the chamber the player has been defending all along — it
 * bounces off the frame the ball bounces off, it reflects the ball, and it
 * fires the gaze from wherever it happens to be. `drawPupil` takes either,
 * because a player who fought the first one must recognise the second
 * instantly: the point of the fifth veil is that the thing you have been
 * visiting has come to you.
 *
 * There is no timer. The pupil speeds up with every hit it takes, so the fight
 * gets harder exactly as it gets closer to won, and a clock on top of that
 * would be two pressures where the design has one.
 */
export class LoosePupil {
  private live = false;
  private posX = 0;
  private posY = 0;
  private dirX = 0;
  private dirY = 0;
  private hitsLeft = 0;
  private flash = 0;
  /** Turns the six spokes, and it is the only thing this angle is for. */
  private turn = 0;

  get active(): boolean {
    return this.live;
  }

  get x(): number {
    return this.posX;
  }

  get y(): number {
    return this.posY;
  }

  get radius(): number {
    return gameConfig.observer.lid.radius;
  }

  /** How much of it is left, 1 untouched to 0 blind. */
  get health(): number {
    return this.hitsLeft / gameConfig.observer.lid.hits;
  }

  get flashTicks(): number {
    return this.flash;
  }

  get spin(): number {
    return this.turn;
  }

  /**
   * The seal is broken: the pupil leaves the socket.
   *
   * It starts at the socket's own x and at the top of its box, heading down and
   * to one side — out of the eye and into the room, which is the one thing the
   * first frame of this has to say. The side is drawn rather than fixed, so the
   * fight does not open the same way twice.
   */
  wake(fromX: number): void {
    const { hits, boxTop } = gameConfig.observer.lid;
    this.live = true;
    this.posX = Math.max(this.left, Math.min(this.right, fromX));
    this.posY = boxTop;
    this.dirX = Math.random() < 0.5 ? -0.8 : 0.8;
    this.dirY = 0.6;
    this.hitsLeft = hits;
    this.flash = gameConfig.observer.lid.wakeShakeTicks;
    this.turn = 0;
  }

  reset(): void {
    this.live = false;
    this.flash = 0;
  }

  /**
   * One tick of the bounce.
   *
   * The heading is kept as a direction and the speed applied to it fresh every
   * tick rather than stored in the velocity, so the acceleration from damage
   * lands whole: a pupil that had its components scaled would drift off pace
   * over a few hundred bounces, and this one is meant to be exactly twice as
   * fast on its last hit as on its first.
   */
  step(): void {
    if (!this.live) {
      return;
    }
    const { hits, speed, speedPerHit, boxTop, boxBottom } = gameConfig.observer.lid;
    const pace = speed + (hits - this.hitsLeft) * speedPerHit;
    const length = Math.hypot(this.dirX, this.dirY) || 1;
    this.posX += (this.dirX / length) * pace;
    this.posY += (this.dirY / length) * pace;
    if (this.posX <= this.left) {
      this.posX = this.left;
      this.dirX = Math.abs(this.dirX);
    }
    if (this.posX >= this.right) {
      this.posX = this.right;
      this.dirX = -Math.abs(this.dirX);
    }
    if (this.posY <= boxTop) {
      this.posY = boxTop;
      this.dirY = Math.abs(this.dirY);
    }
    if (this.posY >= boxBottom) {
      this.posY = boxBottom;
      this.dirY = -Math.abs(this.dirY);
    }
    // Slowly, and against the bounce rather than with it: the spokes are what
    // says this is the thing from inside the eye, and a disc whose spokes kept
    // pace with its own travel would read as a wheel rolling.
    this.turn += 0.02;
    if (this.flash > 0) {
      this.flash -= 1;
    }
  }

  /** One strike. `true` when that was the last of the twenty-four. */
  strike(): boolean {
    this.hitsLeft -= 1;
    this.flash = gameConfig.observer.lid.flashTicks;
    return this.hitsLeft <= 0;
  }

  /**
   * The box's sides, off the field's own frame rather than written down.
   *
   * Two pixels inside the radius, which is the same clearance the brood turns
   * at: a pupil resting exactly on the wall would have half its rim painted
   * under the side bar.
   */
  private get left(): number {
    return gameConfig.field.left + this.radius + 2;
  }

  private get right(): number {
    return gameConfig.field.right - this.radius - 2;
  }
}
