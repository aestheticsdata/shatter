import { gameConfig } from "@core/config/GameConfig";
import { FINE } from "@interfaces/art";

const VIEWPORT_FILL = 0.99;

export class StageScaler {
  private currentScale = 1;
  private stageRect: DOMRectReadOnly | null = null;

  constructor(
    private readonly stage: HTMLElement,
    private readonly playfield: HTMLCanvasElement | null = null,
  ) {}

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
    this.fitPixels();
  }

  /**
   * Whether a fine pixel is worth a whole screen pixel, and the filter that
   * follows from it (SHA-215).
   *
   * The canvas is `FINE` times the field and is laid out at the field's size, so
   * one backing pixel is `scale / FINE` screen pixels — under 1 for every window
   * that does not give the stage three times its own width. `pixelated` on a
   * canvas being *downscaled* is nearest-neighbour throwing pixels away, and
   * which pixels it throws changes with the window: a dithered band flickers as
   * the window is dragged, and a 1-px bevel disappears entirely at some widths.
   * Smoothing is the right answer below 1, and the wrong one above it, where it
   * would blur the blocks the whole game is made of.
   *
   * Classic art never noticed because every sprite was a 3x3 block: throwing
   * away two pixels in three left the same picture. The HD art is exactly the
   * detail that cannot survive it, which is why the rule arrives with the pass
   * rather than having been needed all along.
   */
  private fitPixels(): void {
    if (this.playfield === null) {
      return;
    }
    this.playfield.style.imageRendering = this.currentScale / FINE >= 1 ? "pixelated" : "auto";
  }

  toStageX(clientX: number): number {
    this.stageRect ??= this.stage.getBoundingClientRect();
    return (clientX - this.stageRect.left) / this.currentScale;
  }

  toStageY(clientY: number): number {
    this.stageRect ??= this.stage.getBoundingClientRect();
    return (clientY - this.stageRect.top) / this.currentScale;
  }

  invalidateRect(): void {
    this.stageRect = null;
  }
}
