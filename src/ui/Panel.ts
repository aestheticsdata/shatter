import { zeroPad } from "@shared/format";

import type { PanelView } from "@interfaces/types";

export interface PanelElements {
  // The stage, not the panel: DEMAKE greens everything standing on it — the
  // panel, and the overlays that share it — and one class on the common
  // ancestor is what a theme swap is. Nothing else here reaches outside #panel.
  stage: HTMLElement;
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
      // The bar is new because a 1UP was caught, not because the number went up:
      // the first render, a restart out of GAME OVER and a death all move the
      // rack too, and one of them can move it by exactly one bar. `last` is null
      // on the very first update, which is the case that would otherwise
      // mint-pulse both starting bars.
      this.renderLives(view.reserveLives, last !== null && last.lifeGainedCount !== view.lifeGainedCount);
    }
    if (last !== null && last.lifeRefusedCount !== view.lifeRefusedCount) {
      this.pulseLives();
    }
    if (last?.powerLabel !== view.powerLabel) {
      this.elements.power.textContent = view.powerLabel;
    }
    if (last?.demakeActive !== view.demakeActive) {
      this.elements.stage.classList.toggle("demake", view.demakeActive);
    }
    if (last?.scoreBoosted !== view.scoreBoosted) {
      this.elements.score.classList.toggle("blink", view.scoreBoosted);
    }
    if (last?.muted !== view.muted) {
      this.elements.soundHint.textContent = `M · SOUND ${view.muted ? "OFF" : "ON"}`;
    }

    this.last = { ...view };
  }

  /**
   * The rack, brought to `count` bars by adding or removing from its end.
   *
   * Incremental rather than `replaceChildren` with a fresh array, which tore
   * down every bar to add one: the arriving bar appeared at full size while the
   * five beside it silently blinked out of existence and back in the same frame.
   * Nothing can be animated onto a node that is rebuilt every time the number
   * changes, so the fix and the transition are one change — and death gets it
   * too, since losing a bar stops being a full-rack teardown at the same line.
   */
  private renderLives(count: number, gained: boolean): void {
    const rack = this.elements.lives;
    while (rack.childElementCount > count) {
      rack.lastElementChild?.remove();
    }
    while (rack.childElementCount < count) {
      const bar = document.createElement("div");
      bar.className = "panel-life";
      rack.append(bar);
    }
    const newest = gained ? rack.lastElementChild : null;
    if (newest) {
      newest.classList.add("gained");
      // Dropped when the growth finishes, so the DOM stops asserting that the
      // last bar in the rack is the new one for the rest of the run.
      newest.addEventListener("animationend", () => newest.classList.remove("gained"), { once: true });
    }
  }

  /**
   * A 1UP the rack had no room for.
   *
   * Remove, force a reflow, add: without the reflow the browser never sees the
   * class leave, so a second refusal would not restart the pulse and the
   * capsule would go quiet again exactly when the player is testing what it
   * does. The class is left on afterwards on purpose — the removal above is the
   * restart, and stripping it on `animationend` would only fight that.
   */
  private pulseLives(): void {
    const rack = this.elements.lives;
    rack.classList.remove("refused");
    void rack.offsetWidth;
    rack.classList.add("refused");
  }
}
