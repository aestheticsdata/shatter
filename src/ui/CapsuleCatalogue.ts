import { gameConfig } from "@core/config/GameConfig";
import { POWER_UPS } from "@core/config/powerUps";
import { drawCapsule, SCALE } from "@render/CanvasRenderer";
import { paintCapsuleScene } from "@render/capsuleScenes";
import { renderPageIndicator } from "@ui/pagePips";

import type { PowerUpDefinition, PowerUpTier } from "@core/config/powerUps";
import type { PowerUpKind } from "@interfaces/types";

export interface CapsuleCatalogueElements {
  entries: HTMLElement;
  pages: HTMLElement;
  arrows: HTMLElement;
  count: HTMLElement;
  facts: HTMLElement;
}

// Three across and two down. Every number the screen prints is derived from
// this and `POWER_UPS.length` — nothing here, in the markup or in the footer
// knows how many pages there are, so a capsule invented tomorrow files itself
// onto one. Six a page rather than eighteen because each entry is a picture
// now, and a picture too small to read teaches nothing.
const ENTRIES_PER_PAGE = 3 * 2;

// The field divided by a whole number, exactly as the LEVELS gallery divides it:
// 3 keeps brick cells (30x12) on 10x4 and the theme's 1px specks on whole
// pixels. A miniature of the field is what these entries are — the same picture
// the player will be looking at, at a size that fits six to a page.
const TILE_SCALE = 3;
const TILE_WIDTH = gameConfig.field.width / TILE_SCALE;
const TILE_HEIGHT = gameConfig.field.height / TILE_SCALE;

// The pill itself, over the miniature's top corner at exactly the size it
// falls at — 20x8, a sixth of the tile across, the same proportion a falling
// pill has to the field. Not painted into the field (a pill at 1/3 is a 7x3
// smudge) and not enlarged over it (a doubled pill is a monster looming over
// its own wall).
//
// Its own canvas rather than a sprite painted into the tile, and backed SCALE
// times the size it is shown at, because that is the only way its glyph is
// rasterised the way the arena rasterises it — drawn at 1 into the tile, a 7px
// Silkscreen is blown up in blocks the moment the stage scales.
const PILL_WIDTH = 20;
const PILL_HEIGHT = 8;

// The column an entry's two text lines have to fit, in stage pixels, the type
// they are set in, and how many lines the blurb may take. All three live here
// because this is where they are spent, and all three are read by the DEV width
// pass in `@render/checkCapsules` — the CSS rules for `.capsule-label` and
// `.capsule-blurb` must agree with them.
export const ENTRY_COLUMN_WIDTH = 148;
export const ENTRY_FONT = "7px Silkscreen, monospace";
export const ENTRY_BLURB_LINES = 1;

// Commons first and traps last. Rarity is what a player wants grouped, it puts
// the traps together at the end where they read as a warning, and it is the
// tier each row already carries — so a new capsule sorts itself and the groups
// run straight across page boundaries rather than paying for a page each.
const TIER_ORDER: readonly PowerUpTier[] = ["common", "uncommon", "rare", "trap"];

// The roster's own element type rather than `PowerUpDefinition`, which widens
// `id` to `string`: the kind union is inferred *from* these rows, so the
// interface cannot name it, and the pills are keyed by kind.
type Capsule = (typeof POWER_UPS)[number];

const SORTED_CAPSULES: readonly Capsule[] = POWER_UPS.toSorted(
  (left, right) => TIER_ORDER.indexOf(left.tier) - TIER_ORDER.indexOf(right.tier),
);

/**
 * The line under a capsule's name: `WIDE · COMMON · 12 S`.
 *
 * Tier and duration are derived, never authored twice. `lasts` is the one
 * escape hatch, for the five rows whose `ticks` is not what the effect lasts —
 * see the field in the registry.
 */
export function capsuleLabel(definition: PowerUpDefinition): string {
  return `${definition.name} · ${definition.tier.toUpperCase()} · ${durationOf(definition)}`;
}

function durationOf(definition: PowerUpDefinition): string {
  if (definition.lasts) {
    return definition.lasts;
  }
  if (definition.ticks === 0) {
    return "INSTANT";
  }
  // Seconds are not always whole — STASIS is 90 ticks — and one decimal is as
  // fine as a 60 Hz clock is worth saying out loud.
  return `${Math.round((definition.ticks / 60) * 10) / 10} S`;
}

function createPill(kind: PowerUpKind): HTMLCanvasElement {
  const pill = document.createElement("canvas");
  pill.className = "capsule-pill";
  pill.width = PILL_WIDTH * SCALE;
  pill.height = PILL_HEIGHT * SCALE;
  // Frame 0, and no clock behind it: a trap blinks as it *falls*, and the
  // catalogue is where you come to read what it is. The footer says the blink is
  // out there; a list of pictures flashing at you says nothing anyone can read.
  drawCapsule(contextOf(pill), 0, 0, kind, SCALE, 0);
  return pill;
}

function createTile(): HTMLCanvasElement {
  const tile = document.createElement("canvas");
  tile.className = "capsule-scene";
  tile.width = TILE_WIDTH;
  tile.height = TILE_HEIGHT;
  return tile;
}

function createFieldContext(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = gameConfig.field.width;
  canvas.height = gameConfig.field.height;
  return contextOf(canvas);
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D capsule tile context unavailable");
  }
  return ctx;
}

/**
 * The CAPSULES screen: the whole roster, each entry a picture of what the
 * capsule does with the pill that does it falling into the frame.
 *
 * It reads `POWER_UPS` and paints. It never touches the game's state and the
 * running game never touches it — the screen is only ever open from the title.
 */
export class CapsuleCatalogue {
  private page = 0;
  // One painted miniature per capsule, kept: a 124x100 tile is ~50 KB, so the
  // whole roster is under 2 MB and a page revisited repaints nothing.
  private readonly tiles = new Map<PowerUpKind, HTMLCanvasElement>();
  private readonly pills = new Map<PowerUpKind, HTMLCanvasElement>();
  // One field-sized canvas for every miniature ever painted: a scene is blitted
  // down into its own tile the moment it is drawn, so the next capsule paints
  // straight over it. Made on first sight of the screen.
  private fieldCtx: CanvasRenderingContext2D | null = null;
  constructor(private readonly elements: CapsuleCatalogueElements) {}

  // At least one page, whatever the roster does — a roster back under nineteen
  // has a single page, and it pages nowhere.
  get pageCount(): number {
    return Math.max(1, Math.ceil(SORTED_CAPSULES.length / ENTRIES_PER_PAGE));
  }

  open(): void {
    this.page = 0;
    this.render();
  }

  /**
   * Page by `step`, wrapping both ways.
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
    const first = this.page * ENTRIES_PER_PAGE;
    const shown = SORTED_CAPSULES.slice(first, first + ENTRIES_PER_PAGE);
    this.elements.entries.replaceChildren(...shown.map((definition) => this.entry(definition)));
    renderPageIndicator(this.elements, this.page, this.pageCount);
    // The two facts no single entry carries.
    this.elements.facts.textContent = "A TRAP BLINKS AS IT FALLS · PINK POP ON CATCH";
  }

  private entry(definition: Capsule): HTMLElement {
    const entry = document.createElement("div");
    entry.className = "capsule-entry";

    const frame = document.createElement("div");
    frame.className = "capsule-frame";
    frame.appendChild(this.tile(definition.id));
    frame.appendChild(this.pill(definition.id));
    entry.appendChild(frame);

    const label = document.createElement("div");
    label.className = "capsule-label";
    label.textContent = capsuleLabel(definition);
    entry.appendChild(label);

    const blurb = document.createElement("div");
    blurb.className = "capsule-blurb";
    blurb.textContent = definition.blurb;
    entry.appendChild(blurb);

    return entry;
  }

  private tile(kind: PowerUpKind): HTMLCanvasElement {
    const painted = this.tiles.get(kind);
    if (painted) {
      return painted;
    }

    const tile = createTile();
    const ctx = contextOf(tile);
    // The one downscale in this codebase that keeps smoothing on, for the same
    // reason the LEVELS gallery keeps it on: nearest-neighbour at a third keeps
    // one pixel row in three, and the bevels vanish unevenly.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.paintField(kind), 0, 0, TILE_WIDTH, TILE_HEIGHT);

    this.tiles.set(kind, tile);
    return tile;
  }

  private pill(kind: PowerUpKind): HTMLCanvasElement {
    const painted = this.pills.get(kind);
    if (painted) {
      return painted;
    }
    const pill = createPill(kind);
    this.pills.set(kind, pill);
    return pill;
  }

  private paintField(kind: PowerUpKind): HTMLCanvasElement {
    this.fieldCtx ??= createFieldContext();
    paintCapsuleScene(this.fieldCtx, kind);
    return this.fieldCtx.canvas;
  }
}
