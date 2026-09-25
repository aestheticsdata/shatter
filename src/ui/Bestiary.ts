import { gameConfig } from "@core/config/GameConfig";
import { BOSS_NAME, BOSS_OF_LEVEL } from "@core/levels/bosses";
import { LEVELS, VEIL_LEVELS } from "@core/levels/levels";
import { SPECIES } from "@entities/creatures/species";
import { ART_MODE } from "@interfaces/art";
import { BESTIARY_BROOD, CREATURE } from "@interfaces/creatures";
import { SCALE } from "@render/CanvasRenderer";
import { paintCreaturePortrait, PORTRAIT_CYCLE, PORTRAIT_ROOM } from "@render/creaturePortraits";
import { zeroPad } from "@shared/format";
import { renderPageIndicator } from "@ui/pagePips";

import type { ArtMode } from "@interfaces/art";
import type { BestiaryKind, CreatureKind } from "@interfaces/creatures";

export interface BestiaryElements {
  card: HTMLElement;
  pages: HTMLElement;
  arrows: HTMLElement;
  count: HTMLElement;
  facts: HTMLElement;
}

/**
 * The text column on the right of a card, in stage pixels, the type the lore
 * and the tip are set in, and how many lines the lore may take. They live here
 * because this is where they are spent, and `@render/checkBestiary` reads them
 * — `.creature-sheet` and `.creature-lore` in `components.css` must agree.
 */
export const SHEET_WIDTH = 248;
export const SHEET_FONT = "7px Silkscreen, monospace";
export const LORE_LINES = 11;
// The name, in the display face at the size `.creature-name` sets it.
export const NAME_FONT = "10px 'Press Start 2P', monospace";
// The air between a stat's label and its value, set on `.creature-stats`.
export const STATS_GAP = 8;

/**
 * How much bigger than on the field every creature is drawn — the same for all
 * of them (SHA-256).
 *
 * Three, because the portrait is backed at `SCALE` and three is the zoom that
 * puts one fine pixel of it on one stage pixel: the grid the page's own type is
 * set on, and as fine as the book can go while a moth is still worth looking
 * at. The first cut zoomed each creature to fill its window, up to ten, and a
 * fine pixel came out three times coarser than anything else on the screen.
 * One zoom for all also keeps the creatures' true sizes: a boss is bigger than
 * a moth here because it is bigger than a moth on the field.
 */
const PORTRAIT_ZOOM = 3;
/**
 * The creature's window, in stage pixels, border included (SHA-257): half the
 * 168×240 column it stands in, which at ×3 still leaves every ordinary species
 * room around it. One that needs more (a boss, the brood) gets a window cut to
 * it with `FRAME_MARGIN` all round, so its window is bigger because it is.
 */
const FRAME = { width: 84, height: 120 } as const;
const FRAME_MARGIN = 12;
// `.creature-stage`'s border, which the creature is set inside.
const FRAME_BORDER = 1;
// The most a creature can measure: the whole column less the margin. Every
// portrait fits it at `PORTRAIT_ZOOM` today; a bigger one would be drawn
// smaller rather than spill out of the page.
const PORTRAIT_BOX = { width: 168 - 2 * FRAME_MARGIN, height: 240 - 2 * FRAME_MARGIN } as const;
// How finely the portrait's loop is sampled to find everything it covers.
// Every clock a portrait keeps turns over on a multiple of this or faster than
// it, and a frog's hop peaks on frame 138 of its loop, which is one.
const TRIM_STEP = 6;

// What the brood's page says. Not in a species row, because the brood is not a
// species: it is the veils' own system.
const BROOD_NAME = "THE BROOD";
const BROOD_LORE =
  "THE EYE'S OWN CHILDREN, LAID ON THE BAND BENEATH EVERY VEIL. STRIKE AN EGG AND IT HATCHES. " +
  "STRIKE THE HATCHLING AND IT GROWS WINGS. EACH FORM IS FASTER, WIDER AND WORTH MORE THAN THE LAST, " +
  "AND ONLY THE WYVERN CAN DIE — LIGHTING A STAR IN THE EYE'S DIADEM AS IT GOES.";
const BROOD_TIP = "FINISH WHAT YOU HATCH";

/** One page: which creature, and the level a player first meets it on. */
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
 * level moves up the book with it, and a species added to `CREATURE` and dealt
 * onto a level files itself in — the registry is typed against `CreatureKind`,
 * so a new name is already a species, and the portraits' own `Record` makes it
 * a picture. One no level pins yet sorts after everything a level does.
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

/** What the page is headed with: the boss's title, or the species' own name. */
export function creatureName(entry: BestiaryEntry): string {
  if (entry.kind === BESTIARY_BROOD) {
    return BROOD_NAME;
  }
  // The constant's own value, capitalised: every ordinary species is named by
  // one word, and it is the word the console already takes.
  return BOSS_NAME[entry.kind] ?? entry.kind.toUpperCase();
}

export function creatureLore(entry: BestiaryEntry): string {
  return entry.kind === BESTIARY_BROOD ? BROOD_LORE : SPECIES[entry.kind].lore;
}

export function creatureTip(entry: BestiaryEntry): string {
  return `TIP · ${entry.kind === BESTIARY_BROOD ? BROOD_TIP : SPECIES[entry.kind].tip}`;
}

/**
 * The four facts at the top of a page, every one read off the registry: where
 * it is met, how many hits it takes, what the ball does when it gets there,
 * and what it pays.
 */
export function creatureStats(entry: BestiaryEntry): readonly (readonly [string, string])[] {
  const where = (level: number): string =>
    Number.isFinite(level) ? `${zeroPad(level, 2)} ${LEVELS[level - 1].name}` : "NOT YET";
  if (entry.kind === BESTIARY_BROOD) {
    const { forms, killPoints } = gameConfig.observer.brood;
    return [
      ["MET", `THE VEILS · FROM ${where(entry.level)}`],
      ["HITS", `${forms.length} · IT CHANGES TWICE, THEN DIES`],
      // A beast is a shelf, like a solid creature.
      ["BALL", "BOUNCES OFF IT"],
      ["WORTH", `${forms.map((form) => form.points).join(" · ")} · ${killPoints} THE KILL`],
    ];
  }
  const species = SPECIES[entry.kind];
  const boss = BOSS_NAME[entry.kind] !== undefined;
  const worth =
    species.points === 0 && species.killPoints === 0
      ? "NOTHING · IT IS ON YOUR SIDE"
      : `${species.points} A HIT · ${species.killPoints} THE KILL`;
  return [
    boss ? ["LAIR", `THE END OF ${where(entry.level)}`] : ["MET", where(entry.level)],
    ["HITS", String(species.hits ?? species.hitPoints)],
    // A boss is always a shelf, whatever its species says: the fight is played
    // off it (`bossPool` in the game).
    [
      "BALL",
      species.shotOnly ? "CANNOT TOUCH IT · BOLTS ONLY" : boss || species.solid ? "BOUNCES OFF IT" : "GOES THROUGH IT",
    ],
    ["WORTH", worth],
  ];
}

function even(length: number): number {
  return 2 * Math.ceil(length / 2);
}

// `readable` for the scratch room the trim reads back, and only for it: the
// hint moves a canvas off the GPU, which the portrait on the page has no use for.
function contextOf(canvas: HTMLCanvasElement, readable = false): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: readable });
  if (!ctx) {
    throw new Error("2D bestiary context unavailable");
  }
  return ctx;
}

interface Trim {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Everything a portrait ever covers over its whole loop, in pixels of a canvas
 * `SCALE` times the room — a wing at the top of its beat, a beetle's legs in
 * the air — so the creature can be cut to its own outline and blown up without
 * a wingtip ever leaving the frame.
 */
function trimOf(kind: BestiaryKind, hd: boolean): Trim {
  const room = document.createElement("canvas");
  room.width = PORTRAIT_ROOM.width * SCALE;
  room.height = PORTRAIT_ROOM.height * SCALE;
  const ctx = contextOf(room, true);
  const { width, height } = room;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let frame = 0; frame < PORTRAIT_CYCLE; frame += TRIM_STEP) {
    ctx.clearRect(0, 0, width, height);
    paintCreaturePortrait(ctx, kind, frame, SCALE, hd);
    // One word a pixel, and only the rows and columns outside what is already
    // known to be covered: after the first frame, a frame that reaches no
    // further than the last costs a few edges rather than the whole room.
    const pixels = new Uint32Array(ctx.getImageData(0, 0, width, height).data.buffer);
    const inked = (x0: number, y0: number, x1: number, y1: number): boolean => {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (pixels[y * width + x] !== 0) {
            return true;
          }
        }
      }
      return false;
    };
    const known = right >= 0;
    for (let y = 0; y < (known ? top : height); y++) {
      if (inked(0, y, width - 1, y)) {
        top = y;
        break;
      }
    }
    if (top >= height) {
      continue;
    }
    for (let y = height - 1; y > (known ? bottom : top - 1); y--) {
      if (inked(0, y, width - 1, y)) {
        bottom = Math.max(bottom, y);
        break;
      }
    }
    for (let x = 0; x < (known ? left : width); x++) {
      if (inked(x, top, x, bottom)) {
        left = x;
        break;
      }
    }
    for (let x = width - 1; x > (known ? right : left - 1); x--) {
      if (inked(x, top, x, bottom)) {
        right = Math.max(right, x);
        break;
      }
    }
  }
  return { left, top, width: Math.max(1, right - left + 1), height: Math.max(1, bottom - top + 1) };
}

/**
 * The BESTIARY screen (SHA-255): a book of cards, one creature to a page — the
 * creature alive on the left at three times its size (SHA-256), and on the
 * right its name, its four facts, its lore and a tip.
 *
 * It reads the registry and paints. It never touches the game's state and the
 * running game never touches it — the screen is only ever open from the title.
 */
export class Bestiary {
  private page = 0;
  // The portrait on the page now, and the clock it is being drawn on.
  private portrait: { canvas: HTMLCanvasElement; kind: BestiaryKind; trim: Trim; hd: boolean } | null = null;
  private frame = 0;
  private animation = 0;
  // What each creature covers, per art, found once and kept.
  private readonly trims = new Map<string, Trim>();

  /**
   * `art` is read at paint time, for the reason `CapsuleCatalogue` gives: the
   * dev console can change it between two openings of this screen.
   */
  constructor(
    private readonly elements: BestiaryElements,
    private readonly art: () => ArtMode,
  ) {}

  get pageCount(): number {
    return Math.max(1, BESTIARY_ROSTER.length);
  }

  open(): void {
    this.page = 0;
    this.render();
    this.animate();
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
    const entry = BESTIARY_ROSTER[this.page];
    this.elements.card.replaceChildren(this.stage(entry), this.sheet(entry));
    renderPageIndicator(this.elements, this.page, this.pageCount);
    this.elements.facts.textContent = "CLICK TO RETURN";
  }

  // The window on the left, with the creature in it at `PORTRAIT_ZOOM`.
  private stage(entry: BestiaryEntry): HTMLElement {
    const hd = this.art() !== ART_MODE.CLASSIC;
    const key = `${hd ? "hd" : "classic"}:${entry.kind}`;
    let trim = this.trims.get(key);
    if (!trim) {
      trim = trimOf(entry.kind, hd);
      this.trims.set(key, trim);
    }

    const canvas = document.createElement("canvas");
    canvas.className = "creature-portrait";
    canvas.width = trim.width;
    canvas.height = trim.height;
    const real = { width: trim.width / SCALE, height: trim.height / SCALE };
    const zoom = Math.max(
      1,
      Math.min(PORTRAIT_ZOOM, Math.floor(Math.min(PORTRAIT_BOX.width / real.width, PORTRAIT_BOX.height / real.height))),
    );
    const shown = { width: real.width * zoom, height: real.height * zoom };
    canvas.style.width = `${shown.width}px`;
    canvas.style.height = `${shown.height}px`;
    this.portrait = { canvas, kind: entry.kind, trim, hd };
    this.paintPortrait();

    // Even, so the column's centring puts the window on whole pixels; and the
    // creature set in it by hand, rounded down, where centring would split an
    // odd leftover into two half pixels and smear every edge of the sprite.
    const frame = {
      width: even(Math.max(FRAME.width, shown.width + 2 * FRAME_MARGIN)),
      height: even(Math.max(FRAME.height, shown.height + 2 * FRAME_MARGIN)),
    };
    canvas.style.marginLeft = `${Math.floor((frame.width - 2 * FRAME_BORDER - shown.width) / 2)}px`;
    canvas.style.marginTop = `${Math.floor((frame.height - 2 * FRAME_BORDER - shown.height) / 2)}px`;

    const stage = document.createElement("div");
    stage.className = "creature-stage";
    stage.style.width = `${frame.width}px`;
    stage.style.height = `${frame.height}px`;
    stage.appendChild(canvas);
    return stage;
  }

  private sheet(entry: BestiaryEntry): HTMLElement {
    const sheet = document.createElement("div");
    sheet.className = "creature-sheet";

    const name = document.createElement("div");
    name.className = "creature-name";
    name.textContent = creatureName(entry);
    sheet.appendChild(name);

    // A grid, so the values line up on one rail whatever the labels measure.
    const stats = document.createElement("div");
    stats.className = "creature-stats";
    for (const [label, value] of creatureStats(entry)) {
      const term = document.createElement("span");
      term.className = "creature-stat-label";
      term.textContent = label;
      const fact = document.createElement("span");
      fact.className = "creature-stat-value";
      fact.textContent = value;
      stats.append(term, fact);
    }
    sheet.appendChild(stats);

    const lore = document.createElement("div");
    lore.className = "creature-lore";
    lore.textContent = creatureLore(entry);
    sheet.appendChild(lore);

    const tip = document.createElement("div");
    tip.className = "creature-tip";
    tip.textContent = creatureTip(entry);
    sheet.appendChild(tip);

    return sheet;
  }

  private paintPortrait(): void {
    if (!this.portrait) {
      return;
    }
    const { canvas, kind, trim, hd } = this.portrait;
    const ctx = contextOf(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, -trim.left, -trim.top);
    paintCreaturePortrait(ctx, kind, this.frame, SCALE, hd);
  }

  /**
   * The creature's own clock, a tick a frame, for as long as the screen is up.
   * It stops itself the first frame the screen is hidden, so leaving the page
   * by any of its three ways out needs no word from the game.
   */
  private animate(): void {
    cancelAnimationFrame(this.animation);
    const tick = (): void => {
      if (this.elements.card.closest(".stage-screen")?.hasAttribute("hidden")) {
        return;
      }
      this.frame += 1;
      this.paintPortrait();
      this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }
}
