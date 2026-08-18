import { POWER_UP_BY_ID, POWER_UP_IDS, POWER_UP_NAMES, POWER_UPS } from "@core/config/powerUps";
import { getElementByIdOrThrow } from "@shared/dom";

import type { PowerUpKind } from "@interfaces/types";

// What a command is allowed to do to the running game — the console never
// reaches into it directly, the same arrangement InputController has.
export interface DevConsoleHost {
  grantPowerUp(kind: PowerUpKind): void;
  jumpToLevel(levelNumber: number): void;
  setBonusSpread(amount: number): void;
}

// A stuck key may not grow the buffer forever; nothing useful is this long.
const MAX_INPUT_CHARS = 32;
// Letters, digits, space and the decimal point cover every operand there is.
const TYPABLE = /^[a-z0-9 .]$/i;

// Every command is a word and its arguments. Shown as worked examples with what
// they do, because a bare list of names reads as decoration, not as a grammar.
const EXAMPLES: readonly (readonly [string, string])[] = [
  ["POWER MULTI", "CATCH A CAPSULE NOW · NAME OR LETTER"],
  ["LEVEL 12", "JUMP TO A LEVEL"],
  ["BONUS 1", "CHANCE A BRICK DROPS A CAPSULE · 1 = ALL"],
];
const EXAMPLE_WIDTH = 12;
// The roster is printed in full underneath: fifteen ids is already more than
// anyone keeps in their head, and it grows with the registry it is built from.
const ROSTER_COLUMNS = 5;
const ROSTER_CELL_WIDTH = 9;
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
 * two-character capsule id reads as one capsule instead of two.
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
        return this.grantPowerUps(operands);
      case "level":
        return this.jumpToLevel(operands);
      case "bonus":
        return this.setBonusSpread(operands);
      default:
        return suggestionFor(line);
    }
  }

  // `power N`, `power NUKE`, `power E M L`, and `power MT` for a two-character
  // id. Every capsule resolves before any of them is granted: half a line would
  // leave the run in a state nobody asked for.
  private grantPowerUps(operands: string[]): string | null {
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
    for (const kind of kinds) {
      this.host.grantPowerUp(kind);
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
  root.style.gap = "13px";

  const commandLine = styled("div", COMMAND);
  const command = document.createElement("span");
  const caret = document.createElement("span");
  caret.className = "blink";
  caret.textContent = "_";
  commandLine.append(command, caret);

  const examples = styled("div", "display: flex; flex-direction: column; gap: 5px;");
  for (const [example, effect] of EXAMPLES) {
    const row = styled("div", "");
    row.append(styled("span", EXAMPLE, example.padEnd(EXAMPLE_WIDTH)), styled("span", HINT, effect));
    examples.append(row);
  }

  const roster = styled("div", "display: flex; flex-direction: column; gap: 4px; align-items: center;");
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

// A capsule answers to its letter or to its label — `power m` and `power multi`
// are the same grant. Nobody should have to remember fifteen letters to use this.
function resolveCapsule(word: string): PowerUpKind | null {
  const wanted = word.toUpperCase();
  if (isPowerUpKind(wanted)) {
    return wanted;
  }
  return POWER_UP_IDS.find((id) => POWER_UP_NAMES[id] === wanted) ?? null;
}

// hasOwn, not `in`: `power constructor` would otherwise pass as a capsule id.
function isPowerUpKind(id: string): id is PowerUpKind {
  return Object.hasOwn(POWER_UP_BY_ID, id);
}

// "E WIDE   M MULTI  L LASER  ..." — the whole roster, laid out in a grid the
//366px field can hold, built from the registry so a new capsule appears by itself.
function rosterRows(): string[] {
  const cells = POWER_UPS.map((definition) => `${definition.id} ${definition.name}`.padEnd(ROSTER_CELL_WIDTH));
  const rows: string[] = [];
  for (let index = 0; index < cells.length; index += ROSTER_COLUMNS) {
    rows.push(
      cells
        .slice(index, index + ROSTER_COLUMNS)
        .join(" ")
        .trimEnd(),
    );
  }
  return rows;
}
