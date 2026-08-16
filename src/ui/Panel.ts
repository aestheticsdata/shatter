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
  volume: HTMLInputElement;
  volumeRow: HTMLElement;
}

export class Panel {
  private last: PanelView | null = null;

  constructor(private readonly elements: PanelElements) {}

  // The fader is the panel's one mouse-interactive element. Its mousedown must reach
  // neither the document handler that advances screens nor the pointer-lock grab, so
  // it never leaves the fader row. The guard sits on the whole VOL row: the label
  // text and the flex gap are part of the visible control, and a click there would
  // otherwise bubble to the document and resume/launch with the cursor locked away.
  // Volume is not part of PanelView — the fader's own position is the whole UI state.
  bindVolume(initial: number, onVolumeChange: (volume: number) => void): void {
    const fader = this.elements.volume;
    fader.valueAsNumber = Math.round(initial * 100);
    this.elements.volumeRow.addEventListener("mousedown", (event) => event.stopPropagation());
    fader.addEventListener("input", () => onVolumeChange(fader.valueAsNumber / 100));
    // Keys stay reserved for the game (Space launches); the fader is mouse-only, so
    // drop focus once the drag ends.
    fader.addEventListener("change", () => fader.blur());
  }

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
