import {
  GAMBLE_FACES,
  POWER_UP_BY_ID,
  POWER_UP_GLYPHS,
  POWER_UP_IDS,
  POWER_UP_NAMES,
  POWER_UPS,
} from "@core/config/powerUps";
import { getElementByIdOrThrow } from "@shared/dom";
import { renderPageIndicator } from "@ui/pagePips";

import type { PowerUpKind } from "@interfaces/types";

// What a command is allowed to do to the running game — the console never
// reaches into it directly, the same arrangement InputController has.
export interface DevConsoleHost {
  // Makes these capsules fall, rather than granting them: `false` when the pool
  // has no room for the whole line, in which case nothing was spawned.
  dropCapsules(kinds: readonly PowerUpKind[]): boolean;
  jumpToLevel(levelNumber: number): void;
  setBonusSpread(amount: number): void;
  // Pins what GAMBLE's reel lands on, or `null` to hand it back to chance.
  setGamblePin(kind: PowerUpKind | null): void;
}

// A stuck key may not grow the buffer forever; nothing useful is this long.
const MAX_INPUT_CHARS = 32;
// Letters, digits, space and the decimal point cover every operand there is.
const TYPABLE = /^[a-z0-9 .]$/i;

// Every command is a word and its arguments, so the legend is the grammar and
// not four lines you could type. Worked examples were the mistake they always
// are on a list this short: with a real operand filled in, `BONUS 1` and `GAMBLE
// NUKE` read as two more command names rather than as `BONUS` and `GAMBLE` shown
// in use, and the reader who did not already know the command learns nothing
// about what else it would take. A slot says there is a slot.
//
// `<XX>` is a capsule, and it is the same `<XX>` in both places it appears: the
// glyph off the roster below, or the name beside it, or the id. Written as two
// letters because that is what the pills say and what the roster's left rail is
// almost entirely made of — the handful that run to three or four (MIR, BLAS)
// the list itself shows better than a wider placeholder would.
const EXAMPLES: readonly (readonly [string, string])[] = [
  ["POWER <XX>", "DROP THAT CAPSULE · CATCH IT YOURSELF"],
  ["LEVEL <N>", "JUMP TO THAT LEVEL"],
  ["BONUS <0-1>", "CHANCE A BRICK DROPS ONE · 1 = EVERY BRICK"],
  ["GAMBLE <XX>", "PIN WHAT GAMBLE PAYS · BARE = UNPIN"],
];
// The roster is printed underneath, whole, a page at a time: fifty capsules is
// far more than anyone keeps in their head, and it grows with the registry it is
// built from. Not one count here is written down — how many cells fit a row is
// measured against the field, how many rows fit a page comes from the room the
// chrome leaves, and how many pages there are follows from those two.
//
// In pixels, and every one of them measured, because Silkscreen is proportional:
// a space is not a unit of width in it, `SN` and `BLAS` are not two characters
// apart on screen, and a grid laid out by padding names to a character count
// comes out staggered in every column. Characters were the wrong unit; this
// budget is the 366px field less a margin either side.
const ROSTER_MAX_WIDTH = 348;
// More than the roster will ever hold — the fit loop counts down from here.
const MAX_ROSTER_COLUMNS = 8;
// One gap between every rail, glyph to name and name to the next glyph alike:
// the pairs are told apart by colour, which does it without spending width.
const COLUMN_GAP = 7;
// The roster line, set rather than inherited, because a page is this divided
// into the room there is — a measured line would make that arithmetic a guess.
const ROSTER_LINE = 10;
const ROSTER_GAP = 3;
// Below this a page is a peephole, not a page, and the console is worth less
// than the field it covers. Reported rather than fixed: what to give back is a
// judgement about this screen, and only a person looking at it can make it.
const MIN_ROSTER_ROWS = 4;
const CLOSE_HINT = "ENTER APPLIES · ESC OR CLICK CLOSES";
const UNKNOWN_HINT = "UNKNOWN COMMAND";

// Inline styles, not a stylesheet: this element exists in dev builds only, and
// CSS in css/components.css would ship to players. The geometry and backdrop
// still come from .field-overlay, so the modal matches the pause screen.
const HEADING =
  "font: 400 17px var(--font-display); color: var(--color-yellow);" +
  " text-shadow: 3px 3px 0 var(--color-orange-shadow);";
const DIVIDER = "width: 210px; height: 2px; background: var(--color-orange);";
// `white-space: pre` so a typed space stands under the caret instead of collapsing.
const COMMAND = "font: 400 14px var(--font-pixel); color: var(--color-green); letter-spacing: 1px; white-space: pre;";
const HINT = "font: 400 8px var(--font-pixel); color: var(--color-dim-text); letter-spacing: 1px;";
const EXAMPLE = "font: 400 8px var(--font-pixel); color: var(--color-green); letter-spacing: 1px; white-space: pre;";
// The glyph is what you type and the name is what you are looking for, so they
// are told apart by colour as well as by column: two rails the eye can pick out
// of the block without reading a word of it.
const ROSTER_GLYPH = `font: 400 8px/${ROSTER_LINE}px var(--font-pixel); color: var(--color-sky); letter-spacing: 1px;`;
const ROSTER_NAME = `font: 400 8px/${ROSTER_LINE}px var(--font-pixel); color: var(--color-green); letter-spacing: 1px;`;
const ERROR = "font: 400 8px var(--font-pixel); color: var(--color-red); letter-spacing: 1px;";

/**
 * The test console (⌃⌥⌘K on a Mac, Ctrl+Alt+Shift+K anywhere), the replacement
 * for the `?level=` / `?droprate=` / `?power=` URL params: it takes a command
 * mid-run instead of costing a reload, and its operands are separated by spaces,
 * so a two-letter capsule glyph reads as one capsule instead of two.
 *
 * It is a modal over the field and the game freezes behind it, so it must never
 * be the only thing holding a run hostage: Escape, the chord again and a click
 * all close it. Escape only works because the game releases pointer lock as the
 * console opens — the browser swallows that key when it needs it to leave a lock.
 *
 * Constructed under `import.meta.env.DEV`, or in any build whose
 * `gameConfig.rules.testConsole` knob is up — turning it up is how a machine
 * that is not the developer's gets to try a capsule on the live site. With both
 * down the whole module drops out of the bundle, markup, styles and parser with
 * it, which is why its styles are inline and not in css/components.css.
 */
export class DevConsole {
  private opened = false;
  private text = "";
  private error = "";
  private view: ConsoleView | null = null;
  // Which page of the roster is up and how many there are: written by the render
  // that measures the room for them, read by the arrows that turn them.
  private page = 0;
  private pageCount = 1;
  private fitReported = false;

  constructor(private readonly host: DevConsoleHost) {}

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    this.opened = true;
    this.text = "";
    this.error = "";
    this.render();
  }

  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.render();
  }

  // The console owns every key while it is open — Space, P and Escape included,
  // so a typed command can never also drive the game behind the frozen field.
  handleKey(event: KeyboardEvent): void {
    event.preventDefault();

    if (event.key === "Enter") {
      this.submit();
      return;
    }
    if (event.key === "Escape") {
      this.close();
      return;
    }
    // The same two keys that turn the LEVELS and CAPSULES pages turn these.
    // Neither is typable, so the command line pays nothing for them.
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      this.turnPage(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "Backspace") {
      this.text = this.text.slice(0, -1);
      this.error = "";
      this.render();
      return;
    }
    // Modified keys are chords, not typing: the ⌃⌥⌘K that opened the console
    // reports a dead-key glyph on a Mac keyboard and would otherwise be typed.
    if (event.ctrlKey || event.metaKey || !TYPABLE.test(event.key) || this.text.length >= MAX_INPUT_CHARS) {
      return;
    }
    this.text += event.key;
    this.error = "";
    this.render();
  }

  // A command that applies closes the console; one that does not says what is
  // wrong with it and keeps the line, so a typo is one Backspace from fixed.
  private submit(): void {
    const error = this.apply(this.text);
    if (error === null) {
      this.close();
      return;
    }
    this.error = error;
    this.render();
  }

  // `null` when the line applied, otherwise what the inset should say about it.
  // A known command with a bad argument answers for itself: only an unrecognised
  // first word falls through to guessing what was meant.
  private apply(line: string): string | null {
    const [command, ...operands] = line.toLowerCase().split(" ").filter(Boolean);
    switch (command) {
      case "power":
        return this.dropCapsules(operands);
      case "level":
        return this.jumpToLevel(operands);
      case "bonus":
        return this.setBonusSpread(operands);
      case "gamble":
        return this.setGamblePin(operands);
      default:
        return suggestionFor(line);
    }
  }

  /**
   * `power NU`, `power NUKE`, `power N`, `power WI MU LA`.
   *
   * It **drops** the capsules rather than granting them. Granting them outright
   * used to mean the effect had already arrived by the time the console closed
   * and the field unfroze — so the one thing you opened the console to watch,
   * the effect starting, was the one thing you could never see. Now the line
   * spawns capsules at the top of a frozen field and they fall the moment the
   * game is yours again, to be caught with the paddle like any other. Miss one
   * and it is gone; the console is one chord away and the line is two words.
   *
   * Every capsule resolves before any of them falls, and the pool is asked for
   * room before any of them is spawned: half a line would leave the run in a
   * state nobody asked for.
   */
  private dropCapsules(operands: string[]): string | null {
    if (operands.length === 0) {
      return "POWER NEEDS A CAPSULE";
    }
    const kinds: PowerUpKind[] = [];
    for (const operand of operands) {
      const kind = resolveCapsule(operand);
      if (kind === null) {
        return `NO SUCH CAPSULE: ${operand.toUpperCase()}`;
      }
      kinds.push(kind);
    }
    if (!this.host.dropCapsules(kinds)) {
      return "NO ROOM · CAPSULES ALREADY FALLING";
    }
    return null;
  }

  // `level 12`, 1-based. Unbounded above: runs loop past the last level, and
  // level 30 is the honest way to see level 2 at its wrapped ball speed.
  private jumpToLevel(operands: string[]): string | null {
    const levelNumber = Number(operands[0]);
    if (operands.length !== 1 || !Number.isInteger(levelNumber) || levelNumber < 1) {
      return "LEVELS START AT 1";
    }
    this.host.jumpToLevel(levelNumber);
    return null;
  }

  // `bonus 1` — the run's bonusSpreadAmount, the chance a destroyed brick drops
  // a capsule at all. Not a speed: nothing here touches how fast capsules fall.
  private setBonusSpread(operands: string[]): string | null {
    const amount = Number(operands[0]);
    if (operands.length !== 1 || !Number.isFinite(amount) || amount < 0 || amount > 1) {
      return "BONUS IS 0 TO 1";
    }
    this.host.setBonusSpread(amount);
    return null;
  }

  // `gamble NUKE` pins every reel from here on; `gamble` on its own hands it
  // back to chance. Testing a one-in-thirty-nine result any other way means
  // catching capsules until it comes up.
  private setGamblePin(operands: string[]): string | null {
    if (operands.length === 0) {
      this.host.setGamblePin(null);
      return null;
    }
    if (operands.length > 1) {
      return "GAMBLE TAKES ONE CAPSULE";
    }
    const kind = resolveCapsule(operands[0]);
    if (kind === null) {
      return `NO SUCH CAPSULE: ${operands[0].toUpperCase()}`;
    }
    if (kind === "GB") {
      return "THE REEL CANNOT ROLL ITSELF";
    }
    // Refused rather than allowed as a testing escape hatch: a pin that could
    // produce a result the reel cannot would be testing something that does not
    // exist. Asked of the same list the reel rolls from, so the two can never
    // disagree about it. `power JA` still drops the capsule itself.
    if (!GAMBLE_FACES.includes(kind)) {
      return `NOT ON THE REEL: ${POWER_UP_NAMES[kind]}`;
    }
    this.host.setGamblePin(kind);
    return null;
  }

  // Wrapping both ways, as the catalogue's pages do, and kept across opens: the
  // page you were reading is the page you closed the console to go and test.
  private turnPage(step: number): void {
    if (this.pageCount < 2) {
      return;
    }
    this.page = (this.page + step + this.pageCount) % this.pageCount;
    this.render();
  }

  private render(): void {
    this.view ??= buildView();
    const view = this.view;
    view.root.hidden = !this.opened;
    view.command.textContent = `>${this.text.toUpperCase()}`;
    view.status.textContent = this.error || CLOSE_HINT;
    view.status.style.cssText = this.error ? ERROR : HINT;
    // A hidden modal has no height to divide into pages, and nobody to show one to.
    if (this.opened) {
      this.renderRoster(view);
    }
  }

  /**
   * The roster, cut to the room the chrome left it.
   *
   * How many rows a page holds is the region's height divided by the line, never
   * a number written down: the region is the only child of the modal that
   * flexes, so a line added above it costs a roster row instead of pushing the
   * heading off the top of the field. How many pages that makes follows from the
   * registry's own length, so a capsule invented tomorrow files itself onto one.
   */
  private renderRoster(view: ConsoleView): void {
    const capacity = Math.max(1, Math.floor((view.roster.clientHeight + ROSTER_GAP) / (ROSTER_LINE + ROSTER_GAP)));
    const total = Math.ceil(ROSTER_CELLS.length / view.columns);
    this.pageCount = Math.max(1, Math.ceil(total / capacity));
    // Spread over the pages there are rather than filled to the brim and then
    // spilled: at 49 capsules the room holds ten rows, which is one page of ten
    // and one of three. Two pages of seven is the same two pages, and turning to
    // the second no longer feels like walking off the end of the list.
    const rows = Math.ceil(total / this.pageCount);
    const perPage = rows * view.columns;
    this.page = Math.min(this.page, this.pageCount - 1);
    const first = this.page * perPage;
    view.roster.replaceChildren(...rosterElements(ROSTER_CELLS.slice(first, first + perPage)));
    renderPageIndicator(view, this.page, this.pageCount);
    this.reportFit(view, capacity);
  }

  /**
   * The guard this screen earned. It has outgrown the field twice, and both
   * times the tell was a heading sliced off the top rather than anything that
   * said so — noticed once at 40 capsules, and again at 49.
   *
   * Asked at the first open rather than from `main.ts`, which cannot measure a
   * modal that does not exist yet: the console is built lazily and has no height
   * until it is on screen. Once a session, because the answer cannot change
   * between two keystrokes and an error a line long should not repeat itself.
   */
  private reportFit(view: ConsoleView, rows: number): void {
    if (this.fitReported) {
      return;
    }
    this.fitReported = true;

    const overflow = view.root.scrollHeight - view.root.clientHeight;
    if (overflow > 0) {
      console.error(
        `[devconsole] the chrome wants ${view.root.scrollHeight}px of a ${view.root.clientHeight}px field ` +
          `— ${overflow}px of it has to go, and the roster has none left to give`,
      );
    }
    if (rows < MIN_ROSTER_ROWS) {
      console.error(
        `[devconsole] ${rows} roster row(s) fit under the chrome: ` +
          `${ROSTER_CELLS.length} capsules over ${this.pageCount} pages is a peephole, not a list`,
      );
    }
  }
}

// The three the shared page indicator writes into are named as it names them,
// so the view is the thing handed to it.
interface ConsoleView {
  root: HTMLDivElement;
  command: HTMLSpanElement;
  status: HTMLDivElement;
  roster: HTMLDivElement;
  // How many capsules the fitted grid puts on a row. Measured once, at build.
  columns: number;
  pages: HTMLDivElement;
  count: HTMLSpanElement;
  arrows: HTMLSpanElement;
}

// Built on first open and kept: the modal is a sibling of the game's own screens,
// mounted on the stage so it scales with everything else.
function buildView(): ConsoleView {
  const root = styled("div", "");
  root.className = "field-overlay";
  // The heading is pinned to the top of the field and the roster takes whatever
  // is left. The overlay centres its children, so a stack that outgrew its 297px
  // used to spill equally both ways, and the first thing over the edge was the
  // heading — twice, at 40 capsules and at 49, each time answered by tightening
  // a gap. Nothing below the heading can push it now, because the one child that
  // grows with the registry is no longer allowed to grow at all: it pages.
  //
  // So the spacing is back to something that reads rather than something that
  // fits, and the roster is the only thing that pays for a line added up here.
  //
  // `border-box` is load-bearing: the overlay is 297px of content box, so inline
  // padding on it would hang 13px of console off the bottom of the field — and
  // silently, because a modal that grows is not a modal that overflows and the
  // guard below would have had nothing to report.
  root.style.cssText = "box-sizing: border-box; justify-content: flex-start; gap: 8px; padding: 8px 0 7px;";

  const commandLine = styled("div", COMMAND);
  const command = document.createElement("span");
  const caret = document.createElement("span");
  caret.className = "blink";
  caret.textContent = "_";
  commandLine.append(command, caret);

  // A grid here too, and for the same reason the roster is one: these were
  // padded to twelve characters, which in a proportional face started the four
  // hints at four different places. Two tracks start them at one.
  const examples = styled(
    "div",
    `display: grid; grid-template-columns: auto auto; row-gap: 6px;` +
      ` column-gap: ${COLUMN_GAP}px; justify-items: start;`,
  );
  for (const [example, effect] of EXAMPLES) {
    examples.append(styled("span", EXAMPLE, example), styled("span", HINT, effect));
  }

  // Two things at once. `flex: 1` with nothing to overflow into makes the region
  // as tall as the field minus the chrome, whatever the chrome comes to, and the
  // rows that fit are counted at render.
  //
  // And a grid, rather than lines of text padded out with spaces. A capsule's
  // glyph and its name are separate elements in tracks of their own, so they
  // line up because the browser lays them out on a rail — not because a count of
  // characters was hoped to be a count of pixels, which in a proportional face
  // it is not: that is what left every column of the old roster staggered.
  const roster = styled(
    "div",
    `display: grid; grid-auto-rows: ${ROSTER_LINE}px; row-gap: ${ROSTER_GAP}px; column-gap: ${COLUMN_GAP}px;` +
      " align-content: start; justify-items: start; flex: 1; min-height: 0; overflow: hidden;",
  );

  // The indicator the paged screens share, in the order they lay it out and
  // built from their classes — which ship already, for those screens, so the
  // console borrows the look of the game without adding a byte to it.
  const pages = styled("div", "");
  pages.className = "screen-pages";
  const count = styled("span", "");
  count.className = "screen-count";
  const arrows = styled("span", "", "← →");
  arrows.className = "screen-arrows";
  const pager = styled("div", "display: flex; align-items: center; gap: 7px;");
  pager.append(pages, count, arrows);

  const status = styled("div", HINT);
  root.append(
    styled("div", HEADING, "DEV CONSOLE"),
    styled("div", DIVIDER),
    commandLine,
    examples,
    status,
    styled("div", DIVIDER),
    // The count is the one fact the list itself cannot tell you at a glance,
    // now that it is only ever a page of it.
    styled("div", HINT, `CAPSULES · ${POWER_UPS.length}`),
    roster,
    pager,
  );
  getElementByIdOrThrow("stage").append(root);

  // The whole geometry of the grid is settled here, once, with every capsule in
  // it — the only moment the entire roster is on screen to be measured.
  const columns = fitColumns(roster);
  // The used track sizes, read back off the layout and written down. `auto`
  // tracks size to what is in them, so the page holding SINGULARITY would set
  // its columns one way and the page holding PYRE another, and the table would
  // shift under you as you turned it. Pinned, every page is the same table.
  roster.style.gridTemplateColumns = getComputedStyle(roster).gridTemplateColumns;
  roster.style.width = `${roster.scrollWidth + 1}px`;
  roster.replaceChildren();

  return { root, command, status, roster, columns, pages, count, arrows };
}

function styled<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cssText: string,
  content = "",
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.style.cssText = cssText;
  element.textContent = content;
  return element;
}

// The first thing anyone types is the bare thing they want — `M`, or `12`. Name
// the command it belongs to rather than refusing it with nothing to go on.
function suggestionFor(line: string): string {
  const words = line.toUpperCase().split(" ").filter(Boolean);
  if (words.length > 0 && words.every((word) => resolveCapsule(word) !== null)) {
    return `TYPE: POWER ${words.join(" ")}`;
  }
  const value = Number(words[0]);
  if (words.length === 1 && Number.isInteger(value) && value >= 1) {
    return `TYPE: LEVEL ${value}`;
  }
  if (words.length === 1 && Number.isFinite(value) && value >= 0 && value <= 1) {
    return `TYPE: BONUS ${words[0]}`;
  }
  return UNKNOWN_HINT;
}

// A capsule answers to its name, to what its pill says, or to its id — `power
// multi`, `power mu` and `power m` are one capsule. The glyph is the one of the
// three a player has actually seen, and the id only still resolves because it is
// what the code calls it. Ids are tried first, so on the day a glyph reads as
// another capsule's id the shorter, older meaning is the one that wins.
function resolveCapsule(word: string): PowerUpKind | null {
  const wanted = word.toUpperCase();
  if (isPowerUpKind(wanted)) {
    return wanted;
  }
  return (
    POWER_UP_IDS.find((id) => POWER_UP_NAMES[id] === wanted) ??
    POWER_UP_IDS.find((id) => POWER_UP_GLYPHS[id] === wanted) ??
    null
  );
}

// hasOwn, not `in`: `power constructor` would otherwise pass as a capsule id.
function isPowerUpKind(id: string): id is PowerUpKind {
  return Object.hasOwn(POWER_UP_BY_ID, id);
}

// A capsule as the roster prints it. The glyph, not the id: what is printed here
// is what a pill says, and an id is an internal name the player has never seen.
interface RosterCell {
  glyph: string;
  name: string;
}

// By name, not by the order the registry happens to list them in. Looking one up
// is the only thing anybody does with this list — you come here because you know
// there is a capsule called something like SNAP, not because you know it was the
// forty-third one written.
const ROSTER_CELLS: readonly RosterCell[] = POWER_UPS.map((definition) => ({
  glyph: POWER_UP_GLYPHS[definition.id],
  name: definition.name,
})).toSorted((left, right) => left.name.localeCompare(right.name));

// The most columns the field will hold, found by laying the whole roster out at
// each width and measuring it. Tried widest-first and taken at the first fit.
//
// Measured rather than counted, and this is the lesson the screen was rebuilt
// around: `SN SNAP` and `BLAS BLACKOUT` are two characters apart in a string and
// nowhere near two characters apart on screen, so no amount of padding puts them
// on the same rail. The browser knows the widths; ask it.
function fitColumns(roster: HTMLDivElement): number {
  for (let columns = MAX_ROSTER_COLUMNS; columns > 1; columns--) {
    // Two tracks a capsule: the glyphs of a column share one and the names the
    // other, each `auto` and so as wide as its own longest entry — the narrowest
    // grid in which everything still lines up.
    roster.style.gridTemplateColumns = `repeat(${columns}, auto auto)`;
    roster.replaceChildren(...rosterElements(ROSTER_CELLS));
    if (roster.scrollWidth <= ROSTER_MAX_WIDTH) {
      return columns;
    }
  }
  roster.style.gridTemplateColumns = "auto auto";
  roster.replaceChildren(...rosterElements(ROSTER_CELLS));
  return 1;
}

// A capsule is two elements, never two words in a padded string.
function rosterElements(cells: readonly RosterCell[]): HTMLElement[] {
  return cells.flatMap((cell) => [styled("span", ROSTER_GLYPH, cell.glyph), styled("span", ROSTER_NAME, cell.name)]);
}
