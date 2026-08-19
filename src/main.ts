import { SoundBank } from "@audio/SoundBank";
import { ShatterGame } from "@core/ShatterGame";
import { CanvasRenderer } from "@render/CanvasRenderer";
import { checkCapsuleBlurbs, checkCapsuleLegibility } from "@render/checkCapsules";
import { getElementByIdOrThrow } from "@shared/dom";
import { HiScores } from "@state/HiScores";
import { ScoreApi } from "@state/ScoreApi";
import { CapsuleCatalogue } from "@ui/CapsuleCatalogue";
import { LevelGallery } from "@ui/LevelGallery";
import { Panel } from "@ui/Panel";
import { Screens } from "@ui/Screens";
import { StageScaler } from "@ui/StageScaler";

document.addEventListener("DOMContentLoaded", () => {
  const stage = getElementByIdOrThrow<HTMLDivElement>("stage");

  const panel = new Panel({
    stage,
    score: getElementByIdOrThrow("panelScore"),
    hiScore: getElementByIdOrThrow("panelHiScore"),
    levelNumber: getElementByIdOrThrow("panelLevelNumber"),
    levelName: getElementByIdOrThrow("panelLevelName"),
    lives: getElementByIdOrThrow("panelLives"),
    power: getElementByIdOrThrow("panelPower"),
    soundHint: getElementByIdOrThrow("panelSoundHint"),
    volume: getElementByIdOrThrow<HTMLInputElement>("volFader"),
    volumeRow: getElementByIdOrThrow("panelVolume"),
  });
  const sfx = new SoundBank();
  panel.bindVolume(sfx.volume, (volume) => sfx.setVolume(volume));

  const game = new ShatterGame({
    renderer: new CanvasRenderer(getElementByIdOrThrow<HTMLCanvasElement>("playfield")),
    panel,
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
      levels: getElementByIdOrThrow("screenLevels"),
      capsules: getElementByIdOrThrow("screenCapsules"),
    }),
    levels: new LevelGallery({
      tiles: getElementByIdOrThrow("levelTiles"),
      pages: getElementByIdOrThrow("levelsPages"),
      arrows: getElementByIdOrThrow("levelsArrows"),
      count: getElementByIdOrThrow("levelsCount"),
      facts: getElementByIdOrThrow("levelsFacts"),
    }),
    capsules: new CapsuleCatalogue({
      entries: getElementByIdOrThrow("capsuleEntries"),
      pages: getElementByIdOrThrow("capsulesPages"),
      arrows: getElementByIdOrThrow("capsulesArrows"),
      count: getElementByIdOrThrow("capsulesCount"),
      facts: getElementByIdOrThrow("capsulesFacts"),
    }),
    sfx,
    hiScores: new HiScores(new ScoreApi()),
    scaler: new StageScaler(stage),
    lockTarget: stage,
  });

  game.start();

  // Dev-only QA handle: lets debug tooling drive and inspect the live game.
  if (import.meta.env.DEV) {
    (window as Window & { __shatter?: ShatterGame }).__shatter = game;
    // Once, and only once Silkscreen has loaded: the fallback font is wider and
    // would report glyph widths no capsule actually draws at.
    void document.fonts.ready.then(() => {
      checkCapsuleLegibility();
      checkCapsuleBlurbs();
    });
  }
});
