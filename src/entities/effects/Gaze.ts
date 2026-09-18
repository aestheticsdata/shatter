import { gameConfig } from "@core/config/GameConfig";

export type GazePhase = "idle" | "charge" | "fire";

/**
 * THE IRIS's gaze (SHA-173): the eye looks at the deck, and looking is enough.
 *
 * **Idle, charge, fire, and round again.** The charge is the whole fairness of
 * the mechanism: for three quarters of a second a ring pulses on the pupil and
 * the beam's column is already standing where it will fire, so every catch is a
 * thing the player was shown coming. What the beam takes is the *steering* —
 * the deck turns to stone where it stands and still returns the ball — which is
 * the only punishment in this game that costs a rally rather than a life.
 *
 * It does nothing at all to the ball. A beam that killed would be a second
 * drain the player cannot defend against; a beam that freezes the hand is a
 * problem they can solve by being somewhere else.
 *
 * Reused as it stands by THE LID's loose pupil (SHA-176), which fires the same
 * gaze from wherever it happens to be — which is why the source point is a
 * parameter of `step` rather than anything this object knows.
 */
export class Gaze {
  private live = false;
  private currentPhase: GazePhase = "idle";
  private ticks = 0;
  /** Where the beam's column is, in field pixels. */
  private beamX = 0;
  private sourceX = 0;
  private sourceY = 0;
  /**
   * How long this gaze rests between shots.
   *
   * The one number THE LID changes (SHA-176): the loose pupil fires on a
   * shorter idle than the veil that taught the beam, because by then the
   * warning is a known quantity and the fight needs something happening in it.
   * Held here rather than read from the config at every use, so the two callers
   * differ in their `load` and nowhere else.
   */
  private idle: number = gameConfig.observer.gaze.idleTicks;

  get active(): boolean {
    return this.live;
  }

  get phase(): GazePhase {
    return this.currentPhase;
  }

  /** How far through the current phase, 0 at its start and 1 at its end. */
  get progress(): number {
    const { chargeTicks, fireTicks } = gameConfig.observer.gaze;
    const span = this.currentPhase === "idle" ? this.idle : this.currentPhase === "charge" ? chargeTicks : fireTicks;
    return span > 0 ? 1 - this.ticks / span : 0;
  }

  get x(): number {
    return this.beamX;
  }

  get source(): { x: number; y: number } {
    return { x: this.sourceX, y: this.sourceY };
  }

  /**
   * On for the veils whose eye does this, off everywhere else — and on whatever
   * idle the caller wants between shots.
   */
  load(active: boolean, idleTicks: number = gameConfig.observer.gaze.idleTicks): void {
    this.live = active;
    this.idle = idleTicks;
    this.currentPhase = "idle";
    this.ticks = idleTicks;
    this.beamX = gameConfig.field.width / 2;
  }

  reset(): void {
    this.load(false);
  }

  /**
   * One tick, from `source` at `deckX`. Returns what just started, so the
   * caller can sound it — `null` on the ticks nothing changed.
   *
   * The column is pinned to the source while it charges and only starts hunting
   * once it fires: a beam that tracked during the wind-up would give the player
   * nothing to read, since the thing they are being shown is *where it will
   * be*, not where the eye is looking.
   */
  step(source: { x: number; y: number }, deckX: number): GazePhase | null {
    if (!this.live) {
      return null;
    }
    const { chargeTicks, fireTicks, tracking } = gameConfig.observer.gaze;
    this.sourceX = source.x;
    this.sourceY = source.y;
    if (this.currentPhase === "charge") {
      this.beamX = source.x;
    } else if (this.currentPhase === "fire") {
      this.beamX += (deckX - this.beamX) * tracking;
    }
    this.ticks -= 1;
    if (this.ticks > 0) {
      return null;
    }
    if (this.currentPhase === "idle") {
      this.currentPhase = "charge";
      this.ticks = chargeTicks;
      this.beamX = source.x;
    } else if (this.currentPhase === "charge") {
      this.currentPhase = "fire";
      this.ticks = fireTicks;
    } else {
      this.currentPhase = "idle";
      this.ticks = this.idle;
    }
    return this.currentPhase;
  }

  /** Whether the beam is over this span of deck right now. */
  catches(left: number, right: number): boolean {
    const half = gameConfig.observer.gaze.beamWidth / 2;
    return this.currentPhase === "fire" && this.beamX + half > left && this.beamX - half < right;
  }
}
