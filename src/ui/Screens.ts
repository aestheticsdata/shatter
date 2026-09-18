import type { ScoreRowView, ScreenName } from "@interfaces/types";

export interface ScreensElements {
  title: HTMLElement;
  titleTopScore: HTMLElement;
  serve: HTMLElement;
  // One line over the serve prompt, on a veil only.
  serveVeil: HTMLElement;
  // One line in the middle of the field, during play, while something is asking
  // to be done about it.
  fieldNotice: HTMLElement;
  pause: HTMLElement;
  clear: HTMLElement;
  // The card's own line, so THE LID can say something else on it.
  clearHeading: HTMLElement;
  clearLevelName: HTMLElement;
  clearBonus: HTMLElement;
  // THE DIADEM's count, on a veil's clear card only.
  clearDiadem: HTMLElement;
  over: HTMLElement;
  overScore: HTMLElement;
  overChain: HTMLElement;
  scores: HTMLElement;
  scoreRows: HTMLElement;
  entryLine: HTMLElement;
  entryText: HTMLElement;
  returnHint: HTMLElement;
  levels: HTMLElement;
  capsules: HTMLElement;
}

// How many characters of the clear card's name line fit at its full size. The
// card is 755 px inside and the display font is a fixed 45.4 px an advance at
// 22 px, so sixteen fit and the seventeenth wraps. Past this the card drops to
// the smaller size — see `.clear--long-name`.
const CLEAR_NAME_CHARS = 16;

export class Screens {
  // The level's own line, kept because `show` is called on every screen change
  // and has to know whether there is one without reading it back out of the DOM.
  private veilLine: string | null = null;
  private noticeLine: string | null = null;

  constructor(private readonly elements: ScreensElements) {}

  /**
   * The line over the serve prompt, or `null` on a level with no eye.
   *
   * Set when the level is built rather than when the serve screen opens: a death
   * re-serves the same level, and the line is the level's.
   */
  updateServeVeil(line: string | null): void {
    this.veilLine = line;
    this.elements.serveVeil.textContent = line ?? "";
    this.elements.serveVeil.hidden = line === null;
  }

  /**
   * A line in the middle of the field while the run is live, or `null` to take
   * it away.
   *
   * Mid-field and not in the panel, because what it says is always about where
   * to send the ball — THE OCULI's open door is the first of them — and a player
   * reading it has to be looking at the field anyway. It is the one overlay that
   * shows during play, so every caller is expected to take it down again.
   */
  updateFieldNotice(line: string | null, atFoot = false): void {
    this.noticeLine = line;
    this.elements.fieldNotice.textContent = line ?? "";
    this.elements.fieldNotice.hidden = line === null;
    // Mid-field is where THE OCULI's door wants the eye; the foot is where
    // INSIDE THE EYE wants it, because the pupil's orbit runs straight through
    // the middle and a line printed across it would be a line over the one thing
    // in the room.
    this.elements.fieldNotice.classList.toggle("at-foot", atFoot);
  }

  show(screen: ScreenName): void {
    const { elements } = this;
    const scoresVisible = screen === "scores" || screen === "entry";

    elements.title.hidden = screen !== "title";
    elements.serve.hidden = screen !== "serve";
    elements.serveVeil.hidden = screen !== "serve" || this.veilLine === null;
    // Belt on the notice: every caller takes its own line down, and this is what
    // makes a leak impossible anyway — a card over the field may never have a
    // line from the run printed through it.
    elements.fieldNotice.hidden = (screen !== "play" && screen !== "serve") || this.noticeLine === null;
    elements.pause.hidden = screen !== "pause";
    elements.clear.hidden = screen !== "clear";
    elements.over.hidden = screen !== "over";
    elements.scores.hidden = !scoresVisible;
    elements.entryLine.hidden = screen !== "entry";
    elements.returnHint.hidden = screen !== "scores";
    elements.levels.hidden = screen !== "levels";
    elements.capsules.hidden = screen !== "capsules";
  }

  updateTitle(topScoreText: string, topScoreName: string): void {
    this.elements.titleTopScore.textContent = `TOP SCORE ${topScoreText} · ${topScoreName}`;
  }

  /**
   * The card at the end of a level.
   *
   * `heading` overrides the card's own GRID CLEARED, and two ends use it. A
   * veil says VEIL BROKEN, because what the player finished is one of the five
   * and the card should be the place that says so out loud (SHA-177). THE LID
   * says THE FIFTH VEIL FALLS, because its wall is still standing when the loop
   * ends and a card announcing a cleared grid over a plate of bronze would be
   * the game contradicting the field behind it (SHA-176).
   *
   * The smaller size below keys off the **name** line and not off the presence
   * of a heading, which is what lets a veil keep THE WRATH at full size while
   * carrying a heading of its own.
   */
  updateClear(levelName: string, bonusText: string, diademText: string | null, heading: string | null = null): void {
    this.elements.clearHeading.textContent = heading ?? "GRID CLEARED";
    this.elements.clearLevelName.textContent = levelName;
    // A length, which is a width on this one element: the display font is fixed
    // advance, unlike the proportional Silkscreen every other measurement in
    // this project has to be made in pixels for. `.clear--long-name` in
    // `components.css` carries the arithmetic and the threshold.
    this.elements.clear.classList.toggle("clear--long-name", levelName.length > CLEAR_NAME_CHARS);
    this.elements.clearBonus.textContent = `BONUS ${bonusText}`;
    this.elements.clearDiadem.textContent = diademText ?? "";
    this.elements.clearDiadem.hidden = diademText === null;
  }

  // The run's three numbers. The longest chain is on the same card and not on
  // the hall of fame, deliberately: it is a thing the player did rather than a
  // thing they placed with, and the board is only ever sorted by one column.
  //
  // `reachedText` is how far the run got, already worded by the caller — VEIL 39
  // where the panel would have said VEIL, LEVEL 07 where it would have said
  // LEVEL. The same rule as the panel's row and the same number, so a player who
  // has been reading one all run recognises the other (SHA-177).
  updateOver(scoreText: string, bestChainText: string, reachedText: string): void {
    this.elements.overScore.textContent = `SCORE ${scoreText}`;
    this.elements.overChain.textContent = `BEST CHAIN ${bestChainText} · ${reachedText}`;
  }

  updateScoreRows(rows: readonly ScoreRowView[]): void {
    const rowElements = rows.map((row) => {
      const rowElement = document.createElement("div");
      rowElement.className = "score-row";
      rowElement.classList.toggle("score-row--top", row.isTopRank);
      rowElement.classList.toggle("score-row--empty", row.isEmpty);
      for (const text of [row.rank, row.name, row.score]) {
        const cell = document.createElement("span");
        cell.textContent = text;
        rowElement.appendChild(cell);
      }
      return rowElement;
    });
    this.elements.scoreRows.replaceChildren(...rowElements);
  }

  updateEntryText(text: string): void {
    this.elements.entryText.textContent = `TYPE YOUR INITIALS · ${text}`;
  }
}
