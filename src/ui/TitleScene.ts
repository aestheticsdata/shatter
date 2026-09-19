import { gameConfig } from "@core/config/GameConfig";
import { Observer } from "@entities/effects/Observer";
import { EYE_TINT } from "@interfaces/eye";
import { dialTonesFor } from "@render/backgrounds";
import { drawEye, drawZodiac } from "@render/CanvasRenderer";
import { canvasPalette } from "@render/palette";

const STAR_COUNT = 110;

/**
 * THE TITLE (SHA-211): the mockup's home — the Observer enormous behind the
 * wordmark, on its zodiac dial, looking at the mouse.
 *
 * A canvas under the title's DOM, the stage's own 480 × 300 at one pixel each,
 * scaled with the stage the way the mockup's is. The eye is a real `Observer`
 * loaded with the title's placement, so it blinks on the game's clock and
 * follows the pointer with the game's own ease: the first thing the player
 * sees is the thing the whole loop is about, already watching them.
 *
 * The sky is seeded, so two loads of the title are the same sky.
 */
export class TitleScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: readonly { x: number; y: number; tone: string }[];
  private readonly eye = new Observer();
  private frame = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D title context unavailable");
    }
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const tones = [canvasPalette.titleStarDim, canvasPalette.titleStarMid, canvasPalette.titleStarBright];
    this.stars = Array.from({ length: STAR_COUNT }, (_, index) => ({
      x: Math.floor(random() * canvas.width),
      y: Math.floor(random() * canvas.height),
      tone: tones[index % tones.length],
    }));
    this.eye.load(undefined, gameConfig.title.eye);
  }

  /** One frame: the eye steps toward the pointer (stage pixels) and the dial turns. */
  draw(pointer: { x: number; y: number }): void {
    this.frame += 1;
    this.eye.step(pointer, { standing: () => false });
    const { ctx, canvas } = this;
    ctx.fillStyle = canvasPalette.titleBase;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const star of this.stars) {
      ctx.fillStyle = star.tone;
      ctx.fillRect(star.x, star.y, 1, 1);
    }
    const socket = this.eye.socket;
    if (!socket) {
      return;
    }
    drawZodiac(ctx, socket.x, socket.y, gameConfig.observer.ring.title, this.frame, 1, false, dialTonesFor("observer"));
    drawEye(ctx, socket, this.eye.open, this.eye.target, EYE_TINT.BLUE, 1);
  }
}
