import type { StageScaler } from "@ui/StageScaler";

export interface InputHandlers {
  onPointerMoveTo(stageX: number): void;
  onPointerMoveBy(deltaX: number): void;
  onAdvance(): void;
  onKeyDown(event: KeyboardEvent): void;
  // The mouse is the only paddle control, and it goes quiet without warning: the
  // cursor can leave the window, another window can take focus, or pointer lock
  // can drop. The paddle would then sit frozen while the run kept playing.
  onInputLost(): void;
}

// Once a lock has been held, every rejection is transient (Chromium refuses
// re-lock for ~1.25s after an Esc exit) and the game must stay on its hint
// screen for a retry. Before any lock has ever been held, this many consecutive
// rejections mean the setup will not lock at all (permissions policy, embedded
// page, ...): degrade to absolute tracking to stay playable.
const FALLBACK_REJECTION_LIMIT = 2;

// Every request must end in pointerlockchange or pointerlockerror; a browser
// that breaks that promise would leave an attempt pending forever and eat every
// later gated advance. A request this old is abandoned at the next attempt.
const LOCK_ATTEMPT_TIMEOUT_MS = 1500;

export class InputController {
  private pointerLocked = false;
  private lockUnsupported = false;
  private lockEverAcquired = false;
  private rejectionsSinceAcquire = 0;
  private attemptPending = false;
  private attemptStartedAt = 0;
  private pendingAction: (() => void) | null = null;

  constructor(
    private readonly lockTarget: HTMLElement,
    private readonly scaler: StageScaler,
    private readonly handlers: InputHandlers,
  ) {}

  attach(): void {
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseleave", this.onMouseLeave);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("pointerlockerror", this.onPointerLockError);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("resize", this.onResize, { passive: true });
    window.addEventListener("scroll", this.onScroll, { passive: true });
  }

  detach(): void {
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseleave", this.onMouseLeave);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("pointerlockerror", this.onPointerLockError);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onScroll);
    if (document.pointerLockElement === this.lockTarget) {
      document.exitPointerLock();
    }
    this.pointerLocked = false;
    this.attemptPending = false;
    this.pendingAction = null;
  }

  // Every advance that enters live play routes through here, from mouse and
  // keyboard alike: run now when the lock is already held (or this setup cannot
  // lock), otherwise hold the action and let the grant deliver it. A keydown
  // carries the same transient activation a mousedown does.
  runGated(action: () => void): void {
    if (this.pointerLocked) {
      action();
      return;
    }
    if (!this.canLock()) {
      // Unsupported or degraded to absolute tracking: play proceeds unlocked,
      // still quietly retrying so a late grant can heal back to delta mode.
      action();
      this.requestPointerLock();
      return;
    }
    this.pendingAction = action;
    this.requestPointerLock();
  }

  // A modal over the field may not keep the cursor captive: the player cannot see
  // it, and the browser eats the Escape that would close the modal, since it
  // takes that key to exit the lock itself. Releasing hands both back.
  releaseLock(): void {
    if (document.pointerLockElement === this.lockTarget) {
      document.exitPointerLock();
    }
  }

  // For the game's watchdog: "play" may never keep running unlocked while a
  // lock is still expected on this setup.
  get isLocked(): boolean {
    return this.pointerLocked;
  }

  get lockExpected(): boolean {
    return this.canLock();
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.pointerLocked) {
      this.handlers.onPointerMoveBy(event.movementX / this.scaler.scale);
      return;
    }
    this.handlers.onPointerMoveTo(this.scaler.toStageX(event.clientX));
  };

  // The game routes play-entering advances back through runGated, which issues
  // its own request; the trailing re-arm here only fires after menu clicks and
  // no-ops while an attempt is already in flight.
  private readonly onMouseDown = (): void => {
    this.handlers.onAdvance();
    if (!this.pointerLocked) {
      this.requestPointerLock();
    }
  };

  // Leaving the window stops mousemove delivery, which strands the paddle. Under
  // lock the cursor is confined, so a mouseleave then is never a real exit and the
  // run must keep going; pointerlockchange always lands first, so the flag is fresh.
  private readonly onMouseLeave = (): void => {
    if (!this.pointerLocked) {
      this.handlers.onInputLost();
    }
  };

  private readonly onWindowBlur = (): void => {
    this.handlers.onInputLost();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.handlers.onKeyDown(event);
  };

  private readonly onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.lockTarget;
    // Only the losing edge pauses: unlocking hands the run back to a free
    // cursor, and nothing re-locks until the next gated advance.
    const lost = this.pointerLocked && !locked;
    this.pointerLocked = locked;
    if (locked) {
      this.attemptPending = false;
      this.lockEverAcquired = true;
      this.rejectionsSinceAcquire = 0;
      this.flushPendingAction();
      return;
    }
    if (lost) {
      this.pendingAction = null;
      this.handlers.onInputLost();
    }
  };

  // Chromium reports a failed request twice — the promise rejection and this
  // event. Whichever lands first closes the attempt; the echo finds it closed.
  private readonly onPointerLockError = (): void => {
    this.onLockRejected();
  };

  private readonly onResize = (): void => {
    this.scaler.fit();
  };

  private readonly onScroll = (): void => {
    this.scaler.invalidateRect();
  };

  private canLock(): boolean {
    return !this.lockUnsupported && (this.lockEverAcquired || this.rejectionsSinceAcquire < FALLBACK_REJECTION_LIMIT);
  }

  private onLockRejected(): void {
    if (!this.attemptPending) {
      return;
    }
    this.attemptPending = false;
    this.rejectionsSinceAcquire++;
    if (!this.canLock()) {
      // The limit-crossing rejection lands within the gesture's own
      // milliseconds: flushing here makes the degrade seamless instead of
      // eating one more click.
      this.flushPendingAction();
      return;
    }
    this.pendingAction = null;
  }

  private flushPendingAction(): void {
    const action = this.pendingAction;
    this.pendingAction = null;
    if (action) {
      action();
    }
  }

  private requestPointerLock(): void {
    if (this.attemptPending && performance.now() - this.attemptStartedAt > LOCK_ATTEMPT_TIMEOUT_MS) {
      this.attemptPending = false;
    }
    if (this.lockUnsupported || this.attemptPending) {
      return;
    }
    this.attemptPending = true;
    this.attemptStartedAt = performance.now();
    try {
      const result = this.lockTarget.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => this.onLockRejected());
      }
    } catch {
      // Pointer lock is unsupported; absolute mouse tracking is the permanent mode.
      this.lockUnsupported = true;
      this.attemptPending = false;
      this.flushPendingAction();
    }
  }
}
