import {
  GAMBLE_FACES,
  POWER_UP_BY_ID,
  POWER_UP_GLYPHS,
  POWER_UP_IDS,
  POWER_UP_NAMES,
  POWER_UPS,
} from "@core/config/powerUps";
import { getElementByIdOrThrow } from "@shared/dom";

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

// Every command is a word and its arguments. Shown as worked examples with what
// they do, because a bare list of names reads as decoration, not as a grammar.
const EXAMPLES: readonly (readonly [string, string])[] = [
  ["POWER MULTI", "DROP A CAPSULE · CATCH IT YOURSELF"],
  ["LEVEL 12", "JUMP TO A LEVEL"],
  ["BONUS 1", "CHANCE A BRICK DROPS A CAPSULE · 1 = ALL"],
  ["GAMBLE NUKE", "PIN WHAT THE REEL LANDS ON · BARE = CHANCE"],
];
const EXAMPLE_WIDTH = 12;
// The roster is printed in full underneath: fifteen capsules is already more
// than anyone keeps in their head, and it grows with the registry it is built
// from. How many fit a row is derived rather than fixed, because the cell is as
// wide as the longest name and the next capsule may be longer still.
//
// The budget is the 366px field at this font: 8px Silkscreen plus its 1px
// letter-spacing measures ~6.3px a character, so 58 is what a row holds.
const ROSTER_ROW_CHARS = 58;
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
const ERROR = "font: 400 8px var(--font-pixel); color: var(--color-red); letter-spacing: 1px;";

/**
 * Dev-only test console (Ctrl+Option+Command+K), the replacement for the
 * `?level=` / `?droprate=` / `?power=` URL params: it takes a command mid-run
 * instead of costing a reload, and its operands are separated by spaces, so a
 * two-letter capsule glyph reads as one capsule instead of two.
 *
 * It is a modal over the field and the game freezes behind it, so it must never
 * be the only thing holding a run hostage: Escape, the chord again and a click
 * all close it. Escape only works because the game releases pointer lock as the
 * console opens — the browser swallows that key when it needs it to leave a lock.
 *
 * Constructed only under `import.meta.env.DEV`, which drops this whole module
 * from production bundles — markup, styles and parser with it.
 */
export class DevConsole {
  private opened = false;
  private text = "";
  private error = "";
  private view: ConsoleView | null = null;

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

  private render(): void {
    this.view ??= buildView();
    this.view.root.hidden = !this.opened;
    this.view.command.textContent = `>${this.text.toUpperCase()}`;
    this.view.status.textContent = this.error || CLOSE_HINT;
    this.view.status.style.cssText = this.error ? ERROR : HINT;
  }
}

interface ConsoleView {
  root: HTMLDivElement;
  command: HTMLSpanElement;
  status: HTMLDivElement;
}

// Built on first open and kept: the modal is a sibling of the game's own screens,
// mounted on the stage so it scales with everything else.
function buildView(): ConsoleView {
  const root = styled("div", "");
  root.className = "field-overlay";
  // 4px, not the pause screen's roomier spacing: the roster is as tall as the
  // registry is long, and the whole modal has to stay inside the 297px overlay
  // or its heading and its last rows hang off the field. At 10px and 40
  // capsules it did exactly that — 318px of content in 297px of room, with the
  // heading clipped off the top — so this and the two lists below were
  // tightened. Measured, not guessed: 280px of content, 17px spare, which is
  // one more roster row and so about five more capsules.
  root.style.gap = "4px";

  const commandLine = styled("div", COMMAND);
  const command = document.createElement("span");
  const caret = document.createElement("span");
  caret.className = "blink";
  caret.textContent = "_";
  commandLine.append(command, caret);

  const examples = styled("div", "display: flex; flex-direction: column; gap: 4px;");
  for (const [example, effect] of EXAMPLES) {
    const row = styled("div", "");
    row.append(styled("span", EXAMPLE, example.padEnd(EXAMPLE_WIDTH)), styled("span", HINT, effect));
    examples.append(row);
  }

  // `flex-start`, so the columns line up: the rows are ragged (each ends where
  // its last cell does), and centring them one by one would stagger the grid.
  // The roster as a block is still centred, by the overlay itself.
  const roster = styled("div", "display: flex; flex-direction: column; gap: 3px; align-items: flex-start;");
  for (const row of rosterRows()) {
    roster.append(styled("div", EXAMPLE, row));
  }

  const status = styled("div", HINT);
  root.append(
    styled("div", HEADING, "DEV CONSOLE"),
    styled("div", DIVIDER),
    commandLine,
    examples,
    status,
    styled("div", DIVIDER),
    styled("div", HINT, "CAPSULES"),
    roster,
  );
  getElementByIdOrThrow("stage").append(root);
  return { root, command, status };
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

// "WI WIDE  MU MULTI  LA LASER  ..." — the whole roster, laid out in a grid the
// 366px field can hold, built from the registry so a new capsule appears by
// itself. The glyph, not the id: what is printed here is what a pill says, and
// an id is an internal name the player has never seen.
function rosterRows(): string[] {
  const cells = POWER_UPS.map((definition) => `${POWER_UP_GLYPHS[definition.id]} ${definition.name}`);
  for (let columns = cells.length; columns > 1; columns--) {
    const rows = rosterGrid(cells, columns);
    if (Math.max(...rows.map((row) => row.length)) <= ROSTER_ROW_CHARS) {
      return rows;
    }
  }
  return rosterGrid(cells, 1);
}

// Row-major, each column only as wide as its own longest cell: padding all of
// them to SINGULARITY's length costs a whole column, and the roster is already
// the tallest thing on the modal.
function rosterGrid(cells: readonly string[], columns: number): string[] {
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(...cells.filter((cell, index) => index % columns === column).map((cell) => cell.length)),
  );
  const rows: string[] = [];
  for (let index = 0; index < cells.length; index += columns) {
    rows.push(
      cells
        .slice(index, index + columns)
        .map((cell, column) => cell.padEnd(widths[column]))
        .join(" ")
        .trimEnd(),
    );
  }
  return rows;
}
