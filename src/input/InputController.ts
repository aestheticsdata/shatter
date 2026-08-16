import type { StageScaler } from "@ui/StageScaler";

export interface InputHandlers {
  onPointerMoveTo(stageX: number): void;
  onPointerMoveBy(deltaX: number): void;
  onAdvance(): void;
  onKeyDown(event: KeyboardEvent): void;
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
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    window.addEventListener("resize", this.onResize, { passive: true });
    window.addEventListener("scroll", this.onScroll, { passive: true });
  }

  detach(): void {
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
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

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.handlers.onKeyDown(event);
  };

  private readonly onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.lockTarget;
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
