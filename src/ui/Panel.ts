import { zeroPad } from "@shared/format";

import type { PanelView } from "@interfaces/types";

export interface PanelElements {
  score: HTMLElement;
  hiScore: HTMLElement;
  levelNumber: HTMLElement;
  levelName: HTMLElement;
  lives: HTMLElement;
  power: HTMLElement;
  soundHint: HTMLElement;
}

export class Panel {
  private last: PanelView | null = null;

  constructor(private readonly elements: PanelElements) {}

  update(view: PanelView): void {
    const last = this.last;

    if (last?.score !== view.score) {
      this.elements.score.textContent = zeroPad(view.score, 6);
    }
    if (last?.hiScore !== view.hiScore) {
      this.elements.hiScore.textContent = zeroPad(view.hiScore, 6);
    }
    if (last?.levelNumber !== view.levelNumber) {
      this.elements.levelNumber.textContent = zeroPad(view.levelNumber, 2);
    }
    if (last?.levelName !== view.levelName) {
      this.elements.levelName.textContent = view.levelName;
    }
    if (last?.reserveLives !== view.reserveLives) {
      this.renderLives(view.reserveLives);
    }
    if (last?.powerLabel !== view.powerLabel) {
      this.elements.power.textContent = view.powerLabel;
    }
    if (last?.paydayActive !== view.paydayActive) {
      this.elements.score.classList.toggle("blink", view.paydayActive);
    }
    if (last?.muted !== view.muted) {
      this.elements.soundHint.textContent = `M · SOUND ${view.muted ? "OFF" : "ON"}`;
    }

    this.last = { ...view };
  }

  private renderLives(count: number): void {
    const bars = Array.from({ length: count }, () => {
      const bar = document.createElement("div");
      bar.className = "panel-life";
      return bar;
    });
    this.elements.lives.replaceChildren(...bars);
  }
}
