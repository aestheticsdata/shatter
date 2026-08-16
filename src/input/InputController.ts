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

export class InputController {
  private pointerLocked = false;

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
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onScroll);
    if (document.pointerLockElement === this.lockTarget) {
      document.exitPointerLock();
    }
    this.pointerLocked = false;
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.pointerLocked) {
      this.handlers.onPointerMoveBy(event.movementX / this.scaler.scale);
      return;
    }
    this.handlers.onPointerMoveTo(this.scaler.toStageX(event.clientX));
  };

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
    // Only the losing edge matters: unlocking hands the run back to a free cursor,
    // and nothing re-locks until the next mousedown.
    const lost = this.pointerLocked && !locked;
    this.pointerLocked = locked;
    if (lost) {
      this.handlers.onInputLost();
    }
  };

  private readonly onResize = (): void => {
    this.scaler.fit();
  };

  private readonly onScroll = (): void => {
    this.scaler.invalidateRect();
  };

  private requestPointerLock(): void {
    try {
      const result = this.lockTarget.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          // Pointer lock was denied; absolute mouse tracking keeps working.
        });
      }
    } catch {
      // Pointer lock is unsupported; absolute mouse tracking keeps working.
    }
  }
}
