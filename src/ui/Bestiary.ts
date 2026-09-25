import { gameConfig } from "@core/config/GameConfig";
import { BOSS_NAME, BOSS_OF_LEVEL } from "@core/levels/bosses";
import { LEVELS, VEIL_LEVELS } from "@core/levels/levels";
import { SPECIES } from "@entities/creatures/species";
import { ART_MODE, FINE } from "@interfaces/art";
import { BESTIARY_BROOD, CREATURE } from "@interfaces/creatures";
import { SCALE } from "@render/CanvasRenderer";
import { paintCreaturePortrait, paintCreatureScene } from "@render/creatureScenes";
import { zeroPad } from "@shared/format";
import { renderPageIndicator } from "@ui/pagePips";

import type { ArtMode } from "@interfaces/art";
import type { BestiaryKind, CreatureKind } from "@interfaces/creatures";

export interface BestiaryElements {
  entries: HTMLElement;
  pages: HTMLElement;
  arrows: HTMLElement;
  count: HTMLElement;
  facts: HTMLElement;
}

// The CAPSULES page's grid and the CAPSULES page's miniature, for the reasons
// that page gives: six pictures a page, each a third of the field.
const ENTRIES_PER_PAGE = 3 * 2;
const TILE_SCALE = 3;
const TILE_WIDTH = gameConfig.field.width / TILE_SCALE;
const TILE_HEIGHT = gameConfig.field.height / TILE_SCALE;

// The room a portrait is painted in before it is cut to its own size, in stage
// pixels, and where in that room the creature is put down. The biggest thing in
// the bestiary is the queen at 40 x 26 with her thread over her, and a beetle's
// head and legs reach past its box — so a generous room, then a trim, rather
// than a size worked out per species that the next species would outgrow.
const PORTRAIT_ROOM = { width: 64, height: 48 } as const;
const PORTRAIT_AT = 8;

// What the brood's entry is called, and what it does. Not in a species row,
// because the brood is not a species: it is the veils' own system.
const BROOD_NAME = "THE BROOD";
const BROOD_BLURB = "EACH HIT HATCHES A WORSE ONE";

/** One entry: which creature, and the level a player first meets it on. */
export interface BestiaryEntry {
  kind: BestiaryKind;
  /** 1-based, as the panel prints it. */
  level: number;
}

/**
 * The roster, in the order a player meets it: every species by the first level
 * that pins it, the brood by the first veil, and the four bosses last, in the
 * order they end their levels.
 *
 * **Derived, never written down.** A species the re-deal moves to an earlier
 * level moves up the page with it, and a species added to `CREATURE` and dealt
 * onto a level files itself in — the registry is typed against `CreatureKind`,
 * so a new name is already a species, and the scenes' own `Record` makes it a
 * picture. One no level pins yet sorts after everything a level does.
 */
export const BESTIARY_ROSTER: readonly BestiaryEntry[] = buildRoster();

function buildRoster(): BestiaryEntry[] {
  const bosses = Object.entries(BOSS_OF_LEVEL)
    .map(([index, kind]) => ({ kind: kind as CreatureKind, level: Number(index) + 1 }))
    .toSorted((left, right) => left.level - right.level);
  const bossKinds = new Set<BestiaryKind>(bosses.map((boss) => boss.kind));

  const met = new Map<BestiaryKind, number>();
  LEVELS.forEach((level, index) => {
    for (const pin of level.creatures ?? []) {
      if (!met.has(pin.kind)) {
        met.set(pin.kind, index + 1);
      }
    }
  });
  if (VEIL_LEVELS.length > 0) {
    met.set(BESTIARY_BROOD, VEIL_LEVELS[0] + 1);
  }
  // Every species there is, whether or not a level has dealt it yet.
  for (const kind of Object.values(CREATURE)) {
    if (!met.has(kind) && !bossKinds.has(kind)) {
      met.set(kind, Number.POSITIVE_INFINITY);
    }
  }

  // A stable sort, so two met on the same level keep the order that level
  // pins them in.
  const species = [...met.entries()]
    .filter(([kind]) => !bossKinds.has(kind))
    .map(([kind, level]) => ({ kind, level }))
    .toSorted((left, right) => left.level - right.level);
  return [...species, ...bosses];
}

/**
 * The line under an entry's picture: `FROG · 2 HITS · SOLID`, or for a boss
 * `THE FROG KING · BOSS · LV 25`.
 *
 * Every field is read off the registry. The last one is how the ball meets it,
 * which is the first thing a player needs to know about anything on the field:
 * whether the ball comes off it, goes through it, or cannot touch it at all.
 */
export function creatureLabel(entry: BestiaryEntry): string {
  if (entry.kind === BESTIARY_BROOD) {
    // A beast is struck up the ladder of its forms and dies off the last one,
    // and the ball comes off every one of them.
    return `${BROOD_NAME} · ${hitsOf(gameConfig.observer.brood.forms.length)} · SOLID`;
  }
  const boss = BOSS_NAME[entry.kind];
  if (boss) {
    return `${boss} · BOSS · LV ${zeroPad(entry.level, 2)}`;
  }
  const species = SPECIES[entry.kind];
  const meets = species.shotOnly ? "BOLTS ONLY" : species.solid ? "SOLID" : "THROUGH";
  // The constant's own value, capitalised: every ordinary species is named by
  // one word, and it is the word the console already takes.
  return `${entry.kind.toUpperCase()} · ${hitsOf(species.hits ?? species.hitPoints)} · ${meets}`;
}

/** The one line under the label. */
export function creatureBlurb(entry: BestiaryEntry): string {
  return entry.kind === BESTIARY_BROOD ? BROOD_BLURB : SPECIES[entry.kind].blurb;
}

function hitsOf(count: number): string {
  return count === 1 ? "1 HIT" : `${count} HITS`;
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D bestiary context unavailable");
  }
  return ctx;
}

/**
 * The creature at the size it lives at, cut to its own outline.
 *
 * Backed at `SCALE`, which is the fine grid itself, for the reason the CAPSULES
 * page backs its pill there: it is the one picture on the entry that is not
 * downscaled, so it arrives at exactly the resolution the field draws it at. A
 * boss is its own doubled bitmap, never a zoomed small one.
 *
 * Painted into a room and then trimmed to what it drew, because a creature is
 * not its box — a beetle's head is out in front of it and a queen hangs off a
 * thread — and a corner overlay has to sit on the sprite, not on its margin.
 */
function createPortrait(kind: BestiaryKind, hd: boolean): HTMLCanvasElement {
  const room = document.createElement("canvas");
  room.width = PORTRAIT_ROOM.width * SCALE;
  room.height = PORTRAIT_ROOM.height * SCALE;
  const roomCtx = contextOf(room);
  roomCtx.imageSmoothingEnabled = false;
  paintCreaturePortrait(roomCtx, kind, PORTRAIT_AT, PORTRAIT_AT, SCALE, hd);

  const { data, width, height } = roomCtx.getImageData(0, 0, room.width, room.height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  const portrait = document.createElement("canvas");
  portrait.className = "creature-portrait";
  portrait.width = Math.max(1, right - left + 1);
  portrait.height = Math.max(1, bottom - top + 1);
  contextOf(portrait).drawImage(room, -left, -top);
  // Its CSS box in stage pixels: the backing is `SCALE` times it, as the pill's is.
  portrait.style.width = `${portrait.width / SCALE}px`;
  portrait.style.height = `${portrait.height / SCALE}px`;
  return portrait;
}

/**
 * The BESTIARY screen (SHA-253): every creature in the game, each entry a
 * picture of the thing it does with the creature itself over the corner.
 *
 * The CAPSULES screen's shape, entry for entry. It reads the registry and
 * paints; it never touches the game's state and the running game never touches
 * it — the screen is only ever open from the title.
 */
export class Bestiary {
  private page = 0;
  // One painted miniature and one portrait per creature and art, kept: eighteen
  // tiles is under a megabyte in classic and about eight in HD, and a page
  // revisited repaints nothing.
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  private readonly portraits = new Map<string, HTMLCanvasElement>();
  // One field-sized canvas for every miniature ever painted, per art — the
  // CAPSULES page's arrangement.
  private fieldCtx: CanvasRenderingContext2D | null = null;
  private fieldArt: boolean | null = null;

  /**
   * `art` is read at paint time, for the reason `CapsuleCatalogue` gives: the
   * dev console can change it between two openings of this screen.
   */
  constructor(
    private readonly elements: BestiaryElements,
    private readonly art: () => ArtMode,
  ) {}

  get pageCount(): number {
    return Math.max(1, Math.ceil(BESTIARY_ROSTER.length / ENTRIES_PER_PAGE));
  }

  open(): void {
    this.page = 0;
    this.render();
  }

  /** Page by `step`, wrapping both ways; whether the page actually moved. */
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
    const shown = BESTIARY_ROSTER.slice(first, first + ENTRIES_PER_PAGE);
    this.elements.entries.replaceChildren(...shown.map((entry) => this.entry(entry)));
    renderPageIndicator(this.elements, this.page, this.pageCount);
    // The two facts no single entry carries: what SOLID means, and what every
    // kill is worth besides its points — a stroke on THE CHART (SHA-212).
    this.elements.facts.textContent = "SOLID ONES BOUNCE · A KILL DRAWS A STROKE";
  }

  private entry(entry: BestiaryEntry): HTMLElement {
    const element = document.createElement("div");
    element.className = "creature-entry";

    const frame = document.createElement("div");
    frame.className = "creature-frame";
    frame.appendChild(this.tile(entry.kind));
    frame.appendChild(this.portrait(entry.kind));
    element.appendChild(frame);

    const label = document.createElement("div");
    label.className = "creature-label";
    label.textContent = creatureLabel(entry);
    element.appendChild(label);

    const blurb = document.createElement("div");
    blurb.className = "creature-blurb";
    blurb.textContent = creatureBlurb(entry);
    element.appendChild(blurb);

    return element;
  }

  private tile(kind: BestiaryKind): HTMLCanvasElement {
    const hd = this.art() !== ART_MODE.CLASSIC;
    const key = `${hd ? "hd" : "classic"}:${kind}`;
    const painted = this.tiles.get(key);
    if (painted) {
      return painted;
    }

    // Backed at the fine grid in HD (SHA-251's reason), and smoothed on the
    // way down, the one downscale in the codebase that is — see `LevelGallery`.
    const scale = hd ? FINE : 1;
    const tile = document.createElement("canvas");
    tile.className = "creature-scene";
    tile.width = TILE_WIDTH * scale;
    tile.height = TILE_HEIGHT * scale;
    const ctx = contextOf(tile);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.paintField(kind, hd), 0, 0, tile.width, tile.height);

    this.tiles.set(key, tile);
    return tile;
  }

  private portrait(kind: BestiaryKind): HTMLCanvasElement {
    const hd = this.art() !== ART_MODE.CLASSIC;
    const key = `${hd ? "hd" : "classic"}:${kind}`;
    const painted = this.portraits.get(key);
    if (painted) {
      return painted;
    }
    const portrait = createPortrait(kind, hd);
    this.portraits.set(key, portrait);
    return portrait;
  }

  private paintField(kind: BestiaryKind, hd: boolean): HTMLCanvasElement {
    if (this.fieldCtx === null || this.fieldArt !== hd) {
      const scale = hd ? FINE : 1;
      const canvas = document.createElement("canvas");
      canvas.width = gameConfig.field.width * scale;
      canvas.height = gameConfig.field.height * scale;
      this.fieldCtx = contextOf(canvas);
      this.fieldArt = hd;
    }
    paintCreatureScene(this.fieldCtx, kind, hd);
    return this.fieldCtx.canvas;
  }
}
