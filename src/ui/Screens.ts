import type { ScoreRowView, ScreenName } from "@interfaces/types";

export interface ScreensElements {
  title: HTMLElement;
  titleTopScore: HTMLElement;
  serve: HTMLElement;
  pause: HTMLElement;
  clear: HTMLElement;
  clearLevelName: HTMLElement;
  clearBonus: HTMLElement;
  over: HTMLElement;
  overScore: HTMLElement;
  scores: HTMLElement;
  scoreRows: HTMLElement;
  entryLine: HTMLElement;
  entryText: HTMLElement;
  returnHint: HTMLElement;
}

export class Screens {
  constructor(private readonly elements: ScreensElements) {}

  show(screen: ScreenName): void {
    const { elements } = this;
    const scoresVisible = screen === "scores" || screen === "entry";

    elements.title.hidden = screen !== "title";
    elements.serve.hidden = screen !== "serve";
    elements.pause.hidden = screen !== "pause";
    elements.clear.hidden = screen !== "clear";
    elements.over.hidden = screen !== "over";
    elements.scores.hidden = !scoresVisible;
    elements.entryLine.hidden = screen !== "entry";
    elements.returnHint.hidden = screen !== "scores";
  }

  updateTitle(topScoreText: string, topScoreName: string): void {
    this.elements.titleTopScore.textContent = `TOP SCORE ${topScoreText} · ${topScoreName}`;
  }

  updateClear(levelName: string, bonusText: string): void {
    this.elements.clearLevelName.textContent = levelName;
    this.elements.clearBonus.textContent = `BONUS ${bonusText}`;
  }

  updateOver(scoreText: string): void {
    this.elements.overScore.textContent = `SCORE ${scoreText}`;
  }

  updateScoreRows(rows: readonly ScoreRowView[]): void {
    const rowElements = rows.map((row) => {
      const rowElement = document.createElement("div");
      rowElement.className = row.isTopRank ? "score-row score-row--top" : "score-row";
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
