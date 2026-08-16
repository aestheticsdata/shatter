import { gameConfig } from "@core/config/GameConfig";

const VIEWPORT_FILL = 0.99;

export class StageScaler {
  private currentScale = 1;
  private stageRect: DOMRectReadOnly | null = null;

  constructor(private readonly stage: HTMLElement) {}

  get scale(): number {
    return this.currentScale;
  }

  fit(): void {
    const { width, height } = gameConfig.stage;
    this.currentScale = Math.min(
      (window.innerWidth * VIEWPORT_FILL) / width,
      (window.innerHeight * VIEWPORT_FILL) / height,
    );
    this.stage.style.transform = `scale(${this.currentScale})`;
    this.stageRect = null;
  }

  toStageX(clientX: number): number {
    this.stageRect ??= this.stage.getBoundingClientRect();
    return (clientX - this.stageRect.left) / this.currentScale;
  }

  invalidateRect(): void {
    this.stageRect = null;
  }
}
