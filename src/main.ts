import { Sound } from "@audio/Sound";
import { ShatterGame } from "@core/ShatterGame";
import { CanvasRenderer } from "@render/CanvasRenderer";
import { getElementByIdOrThrow } from "@shared/dom";
import { HiScores } from "@state/HiScores";
import { ScoreApi } from "@state/ScoreApi";
import { Panel } from "@ui/Panel";
import { Screens } from "@ui/Screens";
import { StageScaler } from "@ui/StageScaler";

document.addEventListener("DOMContentLoaded", () => {
  const stage = getElementByIdOrThrow<HTMLDivElement>("stage");

  const game = new ShatterGame({
    renderer: new CanvasRenderer(getElementByIdOrThrow<HTMLCanvasElement>("playfield")),
    panel: new Panel({
      score: getElementByIdOrThrow("panelScore"),
      hiScore: getElementByIdOrThrow("panelHiScore"),
      levelNumber: getElementByIdOrThrow("panelLevelNumber"),
      levelName: getElementByIdOrThrow("panelLevelName"),
      lives: getElementByIdOrThrow("panelLives"),
      power: getElementByIdOrThrow("panelPower"),
      soundHint: getElementByIdOrThrow("panelSoundHint"),
    }),
    screens: new Screens({
      title: getElementByIdOrThrow("screenTitle"),
      titleTopScore: getElementByIdOrThrow("titleTopScore"),
      serve: getElementByIdOrThrow("screenServe"),
      pause: getElementByIdOrThrow("screenPause"),
      clear: getElementByIdOrThrow("screenClear"),
      clearLevelName: getElementByIdOrThrow("clearLevelName"),
      clearBonus: getElementByIdOrThrow("clearBonus"),
      over: getElementByIdOrThrow("screenOver"),
      overScore: getElementByIdOrThrow("overScore"),
      scores: getElementByIdOrThrow("screenScores"),
      scoreRows: getElementByIdOrThrow("scoreRows"),
      entryLine: getElementByIdOrThrow("entryLine"),
      entryText: getElementByIdOrThrow("entryText"),
      returnHint: getElementByIdOrThrow("returnHint"),
    }),
    sound: new Sound(),
    hiScores: new HiScores(new ScoreApi()),
    scaler: new StageScaler(stage),
    lockTarget: stage,
  });

  game.start();
});
