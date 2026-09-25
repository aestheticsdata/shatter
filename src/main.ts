import { SoundBank } from "@audio/SoundBank";
import { ShatterGame } from "@core/ShatterGame";
import { CanvasRenderer } from "@render/CanvasRenderer";
import { checkBestiaryBlurbs } from "@render/checkBestiary";
import { checkCapsuleBlurbs, checkCapsuleLegibility } from "@render/checkCapsules";
import { getElementByIdOrThrow } from "@shared/dom";
import { HiScores } from "@state/HiScores";
import { ScoreApi } from "@state/ScoreApi";
import { Bestiary } from "@ui/Bestiary";
import { CapsuleCatalogue } from "@ui/CapsuleCatalogue";
import { LevelGallery } from "@ui/LevelGallery";
import { Panel } from "@ui/Panel";
import { Screens } from "@ui/Screens";
import { StageScaler } from "@ui/StageScaler";
import { TitleScene } from "@ui/TitleScene";

// The longest the stage waits for its fonts before showing anyway (SHA-252).
const REVEAL_CAP_MS = 1000;

document.addEventListener("DOMContentLoaded", () => {
  const stage = getElementByIdOrThrow<HTMLDivElement>("stage");
  // Held rather than looked up twice: the renderer paints it and the scaler
  // decides how it is filtered, and both want the same element.
  const playfield = getElementByIdOrThrow<HTMLCanvasElement>("playfield");

  const panel = new Panel({
    stage,
    score: getElementByIdOrThrow("panelScore"),
    hiScore: getElementByIdOrThrow("panelHiScore"),
    levelLabel: getElementByIdOrThrow("labelLevel"),
    levelNumber: getElementByIdOrThrow("panelLevelNumber"),
    levelName: getElementByIdOrThrow("panelLevelName"),
    lives: getElementByIdOrThrow("panelLives"),
    power: getElementByIdOrThrow("panelPower"),
    chainInset: getElementByIdOrThrow("insetChain"),
    chainHits: getElementByIdOrThrow("panelChainHits"),
    chainMultiplier: getElementByIdOrThrow("panelChainMult"),
    diadem: getElementByIdOrThrow("panelDiadem"),
    soundHint: getElementByIdOrThrow("panelSoundHint"),
    volume: getElementByIdOrThrow<HTMLInputElement>("volFader"),
    volumeRow: getElementByIdOrThrow("panelVolume"),
  });
  const sfx = new SoundBank();
  panel.bindVolume(sfx.volume, (volume) => sfx.setVolume(volume));

  // Named rather than inlined: the LEVELS gallery, the CAPSULES and BESTIARY
  // pages and the title paint pictures of the arena's art, so they have to be
  // able to ask it which art it is in (SHA-224, SHA-249, SHA-253). A thunk and
  // not the mode itself — the dev console can change it long after this line
  // has run.
  const renderer = new CanvasRenderer(playfield);
  const game = new ShatterGame({
    renderer,
    titleScene: new TitleScene(getElementByIdOrThrow<HTMLCanvasElement>("titleEye"), () => renderer.art),
    panel,
    screens: new Screens({
      title: getElementByIdOrThrow("screenTitle"),
      titleTopScore: getElementByIdOrThrow("titleTopScore"),
      serve: getElementByIdOrThrow("screenServe"),
      serveVeil: getElementByIdOrThrow("serveVeil"),
      fieldNotice: getElementByIdOrThrow("fieldNotice"),
      pause: getElementByIdOrThrow("screenPause"),
      clear: getElementByIdOrThrow("screenClear"),
      clearHeading: getElementByIdOrThrow("clearHeading"),
      clearLevelName: getElementByIdOrThrow("clearLevelName"),
      clearBonus: getElementByIdOrThrow("clearBonus"),
      clearDiadem: getElementByIdOrThrow("clearDiadem"),
      over: getElementByIdOrThrow("screenOver"),
      overScore: getElementByIdOrThrow("overScore"),
      overChain: getElementByIdOrThrow("overChain"),
      overChart: getElementByIdOrThrow("overChart"),
      scores: getElementByIdOrThrow("screenScores"),
      scoreRows: getElementByIdOrThrow("scoreRows"),
      entryLine: getElementByIdOrThrow("entryLine"),
      entryText: getElementByIdOrThrow("entryText"),
      returnHint: getElementByIdOrThrow("returnHint"),
      levels: getElementByIdOrThrow("screenLevels"),
      capsules: getElementByIdOrThrow("screenCapsules"),
      bestiary: getElementByIdOrThrow("screenBestiary"),
    }),
    levels: new LevelGallery(
      {
        tiles: getElementByIdOrThrow("levelTiles"),
        pages: getElementByIdOrThrow("levelsPages"),
        arrows: getElementByIdOrThrow("levelsArrows"),
        count: getElementByIdOrThrow("levelsCount"),
        facts: getElementByIdOrThrow("levelsFacts"),
      },
      () => renderer.art,
    ),
    capsules: new CapsuleCatalogue(
      {
        entries: getElementByIdOrThrow("capsuleEntries"),
        pages: getElementByIdOrThrow("capsulesPages"),
        arrows: getElementByIdOrThrow("capsulesArrows"),
        count: getElementByIdOrThrow("capsulesCount"),
        facts: getElementByIdOrThrow("capsulesFacts"),
      },
      () => renderer.art,
    ),
    bestiary: new Bestiary(
      {
        entries: getElementByIdOrThrow("bestiaryEntries"),
        pages: getElementByIdOrThrow("bestiaryPages"),
        arrows: getElementByIdOrThrow("bestiaryArrows"),
        count: getElementByIdOrThrow("bestiaryCount"),
        facts: getElementByIdOrThrow("bestiaryFacts"),
      },
      () => renderer.art,
    ),
    sfx,
    hiScores: new HiScores(new ScoreApi()),
    scaler: new StageScaler(stage, playfield),
    lockTarget: stage,
  });

  game.start();

  // THE LOAD (SHA-252): `start` has just scaled the stage, which has been at
  // opacity 0 since the first paint — see `#stage` in `layout.css`. It shows
  // once the two pixel faces have landed too, so the first picture anyone sees
  // is the title at its real size in its real type, and on the frame after the
  // game's first, so the title's canvas is already painted under it. The font
  // families come from the tokens rather than being spelt again here. Capped: a
  // font server that never answers costs a second, not the page.
  const tokens = getComputedStyle(document.documentElement);
  const faces = ["--font-display", "--font-pixel"].map((token) =>
    document.fonts.load(`16px ${tokens.getPropertyValue(token)}`),
  );
  const cap = new Promise((resolve) => setTimeout(resolve, REVEAL_CAP_MS));
  void Promise.race([Promise.allSettled(faces), cap]).then(() => {
    requestAnimationFrame(() => stage.classList.add("ready"));
  });

  // Dev-only QA handle: lets debug tooling drive and inspect the live game.
  if (import.meta.env.DEV) {
    (window as Window & { __shatter?: ShatterGame }).__shatter = game;
    // Once, and only once Silkscreen has loaded: the fallback font is wider and
    // would report glyph widths no capsule actually draws at.
    void document.fonts.ready.then(() => {
      checkCapsuleLegibility();
      checkCapsuleBlurbs();
      checkBestiaryBlurbs();
    });
  }
});
