import { gameConfig } from "@core/config/GameConfig";
import { Observer } from "@entities/effects/Observer";
import { ART_MODE, FINE, type ArtMode } from "@interfaces/art";
import { EYE_TINT } from "@interfaces/eye";
import { dialTonesFor } from "@render/backgrounds";
import { drawEye, drawZodiac } from "@render/CanvasRenderer";
import { canvasPalette } from "@render/palette";
import { mix } from "@render/pix";

const STAR_COUNT = 110;
// THE HD PASS (SHA-249): the sky behind the sky, in single fine pixels — the
// in-game starfield's depth layer at the title's size, and in its split: most
// of it faint, a fifth of it at the dimmest star tone.
const DUST_FAINT = 160;
const DUST_DIM = 40;

/**
 * THE TITLE (SHA-211): the mockup's home — the Observer enormous behind the
 * wordmark, on its zodiac dial, looking at the mouse.
 *
 * A canvas under the title's DOM, the stage's own 480 × 300, scaled with the
 * stage the way the mockup's is. The eye is a real `Observer` loaded with the
 * title's placement, so it blinks on the game's clock and follows the pointer
 * with the game's own ease: the first thing the player sees is the thing the
 * whole loop is about, already watching them.
 *
 * The sky is seeded, so two loads of the title are the same sky.
 *
 * **THE HD PASS (SHA-249): the stage's fine grid.** The eye and the dial have
 * had fine recipes since SHA-228 and SHA-232, but both are gated on being drawn
 * at `FINE`, and this canvas was one pixel a stage pixel — so the title went on
 * showing the coarse eye after the whole field had left it. In HD the canvas is
 * backed at three times the stage, which is what the bundle's `drawTitle` paints
 * on, and the art follows the renderer's the way the two galleries do. The stars
 * keep their seeded places in both arts; HD draws each as the in-game
 * starfield's lit point with four dimmer arms, and lays fine dust behind them
 * from the generator *after* the stars, so not one of them moves.
 */
export class TitleScene {
  private readonly ctx: CanvasRenderingContext2D;
  // The stage, in stage pixels — what the stars are placed in, whichever grid
  // the canvas is backed at.
  private readonly width: number;
  private readonly height: number;
  private readonly stars: readonly { x: number; y: number; tone: string; halo: string }[];
  private readonly dust: readonly { x: number; y: number; tone: string }[];
  private readonly eye = new Observer();
  private frame = 0;
  // Which grid the canvas is backed at now. `null` until the first frame, so the
  // first frame sizes it for whatever the art is by then.
  private hd: boolean | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly art: () => ArtMode,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D title context unavailable");
    }
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.width = canvas.width;
    this.height = canvas.height;
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const tones = [canvasPalette.titleStarDim, canvasPalette.titleStarMid, canvasPalette.titleStarBright];
    this.stars = Array.from({ length: STAR_COUNT }, (_, index) => {
      const tone = tones[index % tones.length];
      return {
        x: Math.floor(random() * this.width),
        y: Math.floor(random() * this.height),
        tone,
        // Always toward the base, never up: a glow round a point, not a brighter
        // square — the in-game starfield's rule, for the same reason.
        halo: mix(tone, canvasPalette.titleBase, 0.55),
      };
    });
    const faint = mix(canvasPalette.titleStarDim, canvasPalette.titleBase, 0.35);
    this.dust = Array.from({ length: DUST_FAINT + DUST_DIM }, (_, index) => ({
      x: Math.floor(random() * this.width * FINE),
      y: Math.floor(random() * this.height * FINE),
      tone: index < DUST_FAINT ? faint : canvasPalette.titleStarDim,
    }));
    this.eye.load(undefined, gameConfig.title.eye);
  }

  /** One frame: the eye steps toward the pointer (stage pixels) and the dial turns. */
  draw(pointer: { x: number; y: number }): void {
    this.frame += 1;
    this.eye.step(pointer, { standing: () => false });
    // Anything but classic paints the fine grid — under `split` the title is
    // not the arena and has no half to give, so it takes the new art, as the
    // galleries do.
    const hd = this.art() !== ART_MODE.CLASSIC;
    this.fit(hd);
    const { ctx, canvas } = this;
    ctx.fillStyle = canvasPalette.titleBase;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (hd) {
      this.paintFineSky();
    } else {
      for (const star of this.stars) {
        ctx.fillStyle = star.tone;
        ctx.fillRect(star.x, star.y, 1, 1);
      }
    }
    const socket = this.eye.socket;
    if (!socket) {
      return;
    }
    const scale = hd ? FINE : 1;
    drawZodiac(
      ctx,
      socket.x,
      socket.y,
      gameConfig.observer.ring.title,
      this.frame,
      scale,
      false,
      dialTonesFor("observer"),
      hd,
    );
    drawEye(ctx, socket, this.eye.open, this.eye.target, EYE_TINT.BLUE, scale, { hd });
  }

  // The backing store for the art. Resizing a canvas resets its context, so the
  // smoothing flag goes back on with it.
  private fit(hd: boolean): void {
    if (this.hd === hd) {
      return;
    }
    this.hd = hd;
    const scale = hd ? FINE : 1;
    this.canvas.width = this.width * scale;
    this.canvas.height = this.height * scale;
    this.ctx.imageSmoothingEnabled = false;
  }

  private paintFineSky(): void {
    const { ctx } = this;
    for (const grain of this.dust) {
      ctx.fillStyle = grain.tone;
      ctx.fillRect(grain.x, grain.y, 1, 1);
    }
    for (const star of this.stars) {
      const x = star.x * FINE + 1;
      const y = star.y * FINE + 1;
      ctx.fillStyle = star.halo;
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillStyle = star.tone;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
