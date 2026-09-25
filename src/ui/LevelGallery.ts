import { gameConfig } from "@core/config/GameConfig";
import { LEVELS, levelIndexOf } from "@core/levels/levels";
import { ART_MODE, FINE } from "@interfaces/art";
import { paintLevelStill } from "@render/levelStill";
import { zeroPad } from "@shared/format";
import { renderPageIndicator } from "@ui/pagePips";

import type { ArtMode } from "@interfaces/art";

export interface LevelGalleryElements {
  tiles: HTMLElement;
  pages: HTMLElement;
  arrows: HTMLElement;
  count: HTMLElement;
  facts: HTMLElement;
}

// Three tiles across, two down. Every number the screen shows is derived from
// this and `LEVELS.length` — nothing here, in the markup or in the footer knows
// how many pages there are, so a layout invented tomorrow files itself onto a
// page and the last page is however short it happens to be.
const TILES_PER_PAGE = 3 * 2;

// The field divided by a whole number, which is the point of 3: brick cells
// (30×12) land on 10×4 and the themes' 1px specks stay on whole pixels. 1/4 puts
// a cell on 7.5px, and 1/6 reads as a smudge — SMILEY is not a face at 5×2 px a
// brick. Six tiles over more pages beats eighteen nobody can tell apart.
const TILE_SCALE = 3;
const TILE_WIDTH = gameConfig.field.width / TILE_SCALE;
const TILE_HEIGHT = gameConfig.field.height / TILE_SCALE;

function createStillContext(hd: boolean): CanvasRenderingContext2D {
  const scale = hd ? FINE : 1;
  const canvas = document.createElement("canvas");
  canvas.width = gameConfig.field.width * scale;
  canvas.height = gameConfig.field.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D level still context unavailable");
  }
  return ctx;
}

/**
 * The LEVELS screen: every layout in the roster as a miniature of the real
 * field, six to a page.
 *
 * It reads `LEVELS` and paints. It never touches the game's state and the
 * running game never touches it — the screen is only ever open from the title,
 * where there is no simulation to freeze.
 */
export class LevelGallery {
  private page = 0;
  // One painted tile per level, kept for as long as the page is loaded: a
  // 124×100 tile is ~50 KB, so the whole roster is ~1.4 MB at 28 levels and
  // still nothing at any roster a person would author. Nothing on this screen
  // animates, and no tile is ever painted twice. In HD a tile is backed at the
  // fine grid (SHA-251), nine times the pixels: ~450 KB, ~22 MB for all 49 —
  // and only for the pages actually turned to.
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  // One field-sized canvas for every still ever painted: a still is blitted down
  // into its own tile the moment it is drawn, so the next level paints straight
  // over it. Made on first sight of the screen — a player who never opens it
  // never pays for it.
  private stillCtx: CanvasRenderingContext2D | null = null;
  // Which art that canvas was made for. The two are different sizes, so a mode
  // change gets a new one rather than a resize — and the tiles already painted
  // stay, keyed by their own art, which is what makes `art classic` / `art hd`
  // a flick back and forth rather than a repaint of the roster each way.
  private stillArt: boolean | null = null;

  /**
   * `art` is read at paint time rather than held (SHA-224), because the dev
   * console can change it between two openings of this screen and a gallery
   * showing the art the game is no longer in is the wrong picture of it.
   *
   * Anything but `classic` paints the fine grid, which is the one place this
   * screen cannot follow the arena exactly: under `split` the arena is showing
   * both arts at once and a 124 px tile has no room to be cut in half, so it
   * takes the new one — the half that mode exists to look at.
   */
  constructor(
    private readonly elements: LevelGalleryElements,
    private readonly art: () => ArtMode,
  ) {}

  // At least one page, whatever the roster does — a roster under seven has a
  // single page, and it pages nowhere.
  get pageCount(): number {
    return Math.max(1, Math.ceil(LEVELS.length / TILES_PER_PAGE));
  }

  // Opening lands on the first page every time: the screen is entered from the
  // title, and a gallery that reopened four pages in would read as a bug.
  open(): void {
    this.page = 0;
    this.render();
  }

  /**
   * Page by `step`, wrapping both ways like the level loop itself.
   *
   * Answers whether the page actually changed: a single page wraps to itself,
   * which is not a turn, and a key click on a screen that did not move would be
   * a lie about what just happened.
   */
  turn(step: number): boolean {
    const pages = this.pageCount;
    if (pages < 2) {
      return false;
    }
    this.page = (this.page + step + pages) % pages;
    this.render();
    return true;
  }

  private render(): void {
    const first = this.page * TILES_PER_PAGE;
    const last = Math.min(first + TILES_PER_PAGE, LEVELS.length);
    const entries: HTMLElement[] = [];
    for (let index = first; index < last; index++) {
      entries.push(this.entry(index));
    }
    this.elements.tiles.replaceChildren(...entries);

    renderPageIndicator(this.elements, this.page, this.pageCount);
    this.elements.facts.textContent = "CLICK TO RETURN";
  }

  private entry(index: number): HTMLElement {
    const entry = document.createElement("div");
    entry.className = "level-entry";
    entry.appendChild(this.tile(index));

    const caption = document.createElement("div");
    caption.className = "level-caption";
    // The number the panel shows for this level and the name it shows beside it,
    // both read from the roster: `startRun` sets `level = 0`, so the first level
    // is 01.
    caption.textContent = `${zeroPad(index + 1, 2)} ${LEVELS[index].name}`;
    entry.appendChild(caption);

    return entry;
  }

  private tile(index: number): HTMLCanvasElement {
    const hd = this.art() !== ART_MODE.CLASSIC;
    const key = `${hd ? "hd" : "classic"}:${index}`;
    const painted = this.tiles.get(key);
    if (painted) {
      return painted;
    }

    // THE HD PASS (SHA-251): in HD the tile is backed at the fine grid, three
    // times its box each way, and the CSS box does not move. SHA-224 put the HD
    // still under the tile but kept the tile at one pixel a stage pixel, so every
    // recipe the pass drew arrived averaged into the same 124×100 and the screen
    // read exactly as coarse as before. A stage pixel is three fine ones on the
    // field; it is three on a tile now too.
    const scale = hd ? FINE : 1;
    const tile = document.createElement("canvas");
    tile.className = "level-tile";
    tile.width = TILE_WIDTH * scale;
    tile.height = TILE_HEIGHT * scale;
    const ctx = tile.getContext("2d");
    if (!ctx) {
      throw new Error("2D level tile context unavailable");
    }

    // The one downscale in this codebase that keeps smoothing on, and it needs
    // saying because every other canvas here turns it off on purpose.
    // Nearest-neighbour at 1/3 keeps one pixel row in three: brick bevels vanish
    // unevenly and the theme's specks flicker from tile to tile. Smoothed, a
    // tile reads as a photographed screen, which is what a miniature is.
    //
    // **And it is why HD needs no second thought about legibility** (SHA-224).
    // HD's still is three times bigger and so is its tile, so the filter is the
    // same 1/3 box on both paths and an authored mark is the same fraction of a
    // tile it always was — while the tile now has the pixels to show everything
    // the recipes draw below a field pixel, instead of arriving as tone.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.paintStill(index, hd), 0, 0, tile.width, tile.height);

    this.tiles.set(key, tile);
    return tile;
  }

  private paintStill(index: number, hd: boolean): HTMLCanvasElement {
    if (this.stillCtx === null || this.stillArt !== hd) {
      this.stillCtx = createStillContext(hd);
      this.stillArt = hd;
    }
    // `levelIndexOf` rather than the index itself: it is what the run seeds the
    // field art with, and saying so here is what keeps the two the same picture.
    paintLevelStill(this.stillCtx, LEVELS[index], levelIndexOf(index), hd);
    return this.stillCtx.canvas;
  }
}
