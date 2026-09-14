import { BRICK_BY_ID } from "@core/config/bricks";
import { gameConfig } from "@core/config/GameConfig";
import { paintBackground } from "@render/backgrounds";
import {
  BLACKOUT_TORCH,
  drawAngelWings,
  drawBall,
  drawGambleReel,
  drawBlackoutVeil,
  drawBrick,
  drawCapsule,
  drawPaddleBands,
  MIRROR_BANDS,
  PADDLE_BANDS,
} from "@render/CanvasRenderer";
import { BRICK_COLORS, canvasPalette } from "@render/palette";

import type { BrickCell, BrickKind, PowerUpKind } from "@interfaces/types";
import type { Torch } from "@render/CanvasRenderer";

/**
 * One picture per capsule: the real field, with that capsule's effect on it.
 *
 * **Not screenshots, and not the live game either.** A capture would be bytes in
 * the repo that go stale the first time a sprite is retouched, and replaying the
 * running game would mean inventing a whole run's state 35 times over. A scene
 * is the middle: the field at its real size, painted with the game's own
 * background, bricks, deck, ball and pills, then blitted down to a miniature
 * exactly as the LEVELS gallery blits a level. The sprites and the geometry are
 * the game's, so a retouched bevel or a retuned width reaches these pictures
 * with no second edit; only the staging is authored.
 */
const FIELD_WIDTH = gameConfig.field.width;
const FIELD_HEIGHT = gameConfig.field.height;

// The classic starfield, the same for every scene: the point of the picture is
// the effect, and eight different backdrops would be eight distractions.
const SCENE_BACKGROUND = "starfield";
const SCENE_VARIANT = 0;

const { left: GRID_LEFT, top: GRID_TOP, brickWidth: BRICK_WIDTH, brickHeight: BRICK_HEIGHT } = gameConfig.grid;
const COLUMNS = gameConfig.grid.columns;
const DECK_Y = gameConfig.paddle.y;
// One capsule pill, in field pixels: what `drawCapsule` paints, and the step
// between two of them standing shoulder to shoulder in FUSE's scene.
const CAPSULE_WIDTH = 20;
const DECK_HOME = (FIELD_WIDTH - gameConfig.paddle.baseWidth) / 2;
const BALL_HOME = { x: 182, y: 200 };

// The wall most scenes are staged against: four rows of the four colours a
// player meets first, which is a level's top half and reads as a wall at a
// third of the size.
const DEFAULT_WALL: readonly BrickKind[] = ["1", "2", "3", "4"];

// A brick at full health. Hit points come off the roster rather than being typed
// as 1: `drawBrick` reads the damage stage out of them, and a silver brick one
// short would be drawn chipped in a catalogue that never hit it.
function cell(kind: BrickKind, seed: number): BrickCell {
  return { kind, hitPoints: BRICK_BY_ID[kind].hitPoints, points: 0, seed, capsule: null, seeded: false };
}

/** The field, in field pixels, with the game's sprites placed on it. */
class Field {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly demade = false,
  ) {}

  rect(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = this.demade ? canvasPalette.demakeInk : color;
    this.ctx.fillRect(Math.round(x), Math.round(y), width, height);
  }

  disc(x: number, y: number, radius: number, color: string): void {
    this.ctx.fillStyle = this.demade ? canvasPalette.demakeInk : color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  ring(x: number, y: number, radius: number, color: string, width = 1): void {
    this.ctx.strokeStyle = this.demade ? canvasPalette.demakeInk : color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  // The same, squashed. PYRE's crater is measured in cells on a grid of 30x12
  // bricks, so its shockwave is an ellipse — the field draws one and so does
  // this, or the picture would be of a blast that never happened.
  oval(x: number, y: number, radiusX: number, radiusY: number, color: string, width = 1): void {
    this.ctx.strokeStyle = this.demade ? canvasPalette.demakeInk : color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  brickAt(column: number, row: number): { x: number; y: number } {
    return { x: GRID_LEFT + column * BRICK_WIDTH, y: GRID_TOP + row * BRICK_HEIGHT };
  }

  // `worn` is ERODE's wear, 0 to 1, threaded down from `wall` for the one scene
  // that needs it: the insets it becomes are the config's, so a retuned lane is
  // a retuned picture with no second edit.
  brick(column: number, row: number, kind: BrickKind, fade = 0, worn = 0): void {
    const { x, y } = this.brickAt(column, row);
    const { insetX, insetY } = gameConfig.powerUps.erode;
    drawBrick(this.ctx, x, y, cell(kind, row * COLUMNS + column), 1, {
      fade,
      demade: this.demade,
      erodeX: Math.round(worn * insetX),
      erodeY: Math.round(worn * insetY),
    });
  }

  // One full row of the wall, the width of the grid.
  row(row: number, kind: BrickKind, fade = 0, worn = 0): void {
    for (let column = 0; column < COLUMNS; column++) {
      this.brick(column, row, kind, fade, worn);
    }
  }

  wall(kinds: readonly BrickKind[] = DEFAULT_WALL, fade = 0, top = 0, worn = 0): void {
    kinds.forEach((kind, index) => this.row(top + index, kind, fade, worn));
  }

  /**
   * JELLY's wall: the same rows, each brick hung by its column's own
   * displacement and painted with its column's own load.
   *
   * Per column and not per cell, which is the one simplification this picture
   * makes about the sheet: the real one is a two-dimensional membrane and rows
   * bend against each other slightly. A still cannot show that and does not
   * need to — what the reader has to come away knowing is that the wall is a
   * curve now, that the curve is deepest where two of them met, and that the
   * bricks there have gone dark and started to go.
   */
  sheetWall(hang: readonly number[], strain: readonly number[], gone: readonly number[]): void {
    DEFAULT_WALL.forEach((kind, index) => {
      const row = index;
      for (let column = 0; column < COLUMNS; column++) {
        if (row === DEFAULT_WALL.length - 1 && gone.includes(column)) {
          continue;
        }
        const { x, y } = this.brickAt(column, row);
        drawBrick(this.ctx, x, y + hang[column], cell(kind, row * COLUMNS + column), 1, {
          demade: this.demade,
          strain: strain[column],
        });
      }
    });
  }

  // A brick lit the way the field lights one that has just been killed.
  flash(column: number, row: number, color: string): void {
    const { x, y } = this.brickAt(column, row);
    this.rect(x + 1, y + 1, BRICK_WIDTH - 2, BRICK_HEIGHT - 2, color);
  }

  clear(column: number, row: number): void {
    const { x, y } = this.brickAt(column, row);
    this.ctx.clearRect(x, y, BRICK_WIDTH, BRICK_HEIGHT);
    paintBackgroundPatch(this.ctx, x, y, BRICK_WIDTH, BRICK_HEIGHT);
  }

  // `y` is annotated rather than inferred from its default: `gameConfig` is
  // `as const`, so `DECK_Y` is the literal 276 and an inferred parameter would
  // accept nothing else — which was fine while the deck only ever sat there.
  deck(width: number = gameConfig.paddle.baseWidth, x = (FIELD_WIDTH - width) / 2, y: number = DECK_Y): void {
    drawPaddleBands(this.ctx, x, y, width, PADDLE_BANDS, 1, this.demade);
  }

  /**
   * TIDE's sea, laid over whatever has already been painted.
   *
   * Last in its scene and not first, so the deck and the ball are *under* it the
   * way they are on the field — the point of the picture is things seen through
   * water, and a wash painted before them would be a green floor with sprites
   * standing on it.
   */
  water(surface: number): void {
    const { left, right, height } = gameConfig.field;
    this.ctx.globalAlpha = 0.34;
    this.rect(left, surface, right - left, height - surface, canvasPalette.tideBody);
    for (let x = left; x < right; x += 4) {
      this.rect(x, surface - 1, 2, 1, canvasPalette.tideBody);
    }
    this.ctx.globalAlpha = 1;
    this.rect(left, surface, right - left, 1, canvasPalette.tideCrest);
    for (let x = left + 2; x < right; x += 6) {
      this.rect(x + ((x >> 2) % 4), surface - 1, 1, 1, canvasPalette.tideFoam);
    }
  }

  // GAMBLE's window over the deck, showing one face.
  gambleReel(face: PowerUpKind, x = FIELD_WIDTH / 2): void {
    drawGambleReel(this.ctx, x, DECK_Y, face, 1, 0, this.demade);
  }

  // A face the drum has already turned past, fading as it goes.
  ghostCapsule(x: number, y: number, kind: PowerUpKind, alpha: number): void {
    this.ctx.globalAlpha = alpha;
    this.capsule(x, y, kind);
    this.ctx.globalAlpha = 1;
  }

  // The deck with a save in hand, which is what a player holding ANGEL looks at
  // for as long as they hold it.
  wingedDeck(width: number = gameConfig.paddle.baseWidth, x = (FIELD_WIDTH - width) / 2): void {
    this.deck(width, x);
    drawAngelWings(this.ctx, x, width, DECK_Y, 1, 0, this.demade);
  }

  mirrorDeck(width: number = gameConfig.paddle.baseWidth, x = DECK_HOME): void {
    drawPaddleBands(this.ctx, x, gameConfig.powerUps.mirrorY, width, MIRROR_BANDS, 1, this.demade);
  }

  ball(x = BALL_HOME.x, y = BALL_HOME.y, size: number = gameConfig.ball.size): void {
    drawBall(this.ctx, x, y, 1, this.demade, { size });
  }

  capsule(x: number, y: number, kind: PowerUpKind): void {
    drawCapsule(this.ctx, x, y, kind, 1, 0, this.demade);
  }

  // The lights out, with a pool of light wherever there is something to see by.
  // The field's own veil at the field's own size, so the picture is the effect
  // rather than a drawing of it.
  blackout(torches: readonly Torch[]): void {
    const tone = this.demade ? canvasPalette.demakeGround : canvasPalette.blackoutVeil;
    drawBlackoutVeil(this.ctx, torches, tone, 1);
  }

  // The field turned over, which is FLIP's whole picture. The backdrop is not
  // in it: the renderer leaves the field art where it is and turns the wall,
  // what stands on it and the frame around it, so the scene turns the same
  // three things — here, everything the painter draws after this call.
  turned(paint: () => void): void {
    this.ctx.save();
    this.ctx.translate(FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
    this.ctx.rotate(Math.PI);
    this.ctx.translate(-FIELD_WIDTH / 2, -FIELD_HEIGHT / 2);
    paint();
    this.ctx.restore();
  }

  // Where the ball has been, or where it is going.
  trace(x: number, y: number, alpha: number): void {
    this.ctx.globalAlpha = alpha;
    this.ball(x, y);
    this.ctx.globalAlpha = 1;
  }

  // The whole wall, see-through: GHOST's picture. Solid bricks at low alpha
  // rather than `drawBrick`'s fade — the fade's 1 px outlines dissolve at a
  // third of the size into columns of dashes, while a translucent wall still
  // reads as a wall that stopped being solid. The alpha is set per brick, not
  // once around the loop: `drawBrick` restores full opacity on its way out
  // (its own fade needs that), so one setting would ghost a single brick and
  // leave the other 47 solid.
  ghostWall(kinds: readonly BrickKind[], alpha: number): void {
    kinds.forEach((kind, row) => {
      for (let column = 0; column < COLUMNS; column++) {
        this.ctx.globalAlpha = alpha;
        this.brick(column, row, kind);
      }
    });
    this.ctx.globalAlpha = 1;
  }
}

// The backdrop again, for the holes an effect punches in the wall: a cleared
// brick has to show the field behind it rather than a transparent square.
let patchCanvas: HTMLCanvasElement | null = null;
function paintBackgroundPatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!patchCanvas) {
    patchCanvas = document.createElement("canvas");
    patchCanvas.width = FIELD_WIDTH;
    patchCanvas.height = FIELD_HEIGHT;
    const patchCtx = patchCanvas.getContext("2d");
    if (patchCtx) {
      paintBackground(patchCtx, SCENE_BACKGROUND, SCENE_VARIANT, FIELD_WIDTH, FIELD_HEIGHT);
    }
  }
  ctx.drawImage(patchCanvas, x, y, width, height, x, y, width, height);
}

type Painter = (field: Field) => void;

const baseScene: Painter = (field) => {
  field.wall();
  field.ball();
  field.deck();
};

const SCENES: Record<PowerUpKind, Painter> = {
  // The three decks that are not the deck, at the widths the game gives them.
  E: (field) => {
    field.wall();
    field.ball();
    field.deck(gameConfig.paddle.wideWidth);
  },
  XW: (field) => {
    field.wall();
    field.ball();
    field.deck(gameConfig.paddle.extraWideWidth);
  },
  J: (field) => {
    field.wall();
    field.ball();
    field.deck(gameConfig.paddle.narrowWidth);
  },
  // More balls than the player started with, which is the whole capsule.
  M: (field) => {
    field.wall();
    field.deck();
    field.ball(96, 176);
    field.ball(182, 214);
    field.ball(268, 158);
  },
  S: (field) => {
    field.wall();
    field.deck();
    for (const [x, y] of [
      [44, 168],
      [84, 214],
      [120, 150],
      [156, 192],
      [196, 240],
      [232, 162],
      [268, 206],
      [304, 178],
      [64, 248],
      [140, 262],
      [216, 132],
      [292, 246],
    ]) {
      field.ball(x, y);
    }
  },
  // Cannons on the deck and two shots already climbing.
  L: (field) => {
    field.wall();
    field.deck();
    field.rect(DECK_HOME + 5, DECK_Y - 3, 2, 3, canvasPalette.laserCannon);
    field.rect(DECK_HOME + gameConfig.paddle.baseWidth - 7, DECK_Y - 3, 2, 3, canvasPalette.laserCannon);
    field.rect(DECK_HOME + 5, 150, 2, 12, canvasPalette.laserShot);
    field.rect(DECK_HOME + gameConfig.paddle.baseWidth - 7, 206, 2, 12, canvasPalette.laserShot);
  },
  // The ball two rows deep into the wall, the channel it drilled open behind
  // it, and the drill sparks spraying back down it: the same three tones the
  // field sprays, hand-placed mid-shower. Sparks only read against the dark —
  // on an intact brick a 1 px spark is invisible, which is why the channel is
  // cleared rather than the ball merely overlaid on the wall.
  P: (field) => {
    field.wall();
    field.deck();
    field.clear(5, 2);
    field.clear(5, 3);
    field.trace(167, 140, 0.3);
    for (const [x, y, tone] of [
      [165, 63, canvasPalette.dropSheen],
      [176, 66, canvasPalette.ballHighlight],
      [163, 70, canvasPalette.laserCannon],
      [172, 73, canvasPalette.dropSheen],
      [168, 78, canvasPalette.laserCannon],
      [177, 81, canvasPalette.ballHighlight],
    ] as const) {
      field.rect(x, y, 1, 1, tone);
    }
    field.ball(167, 52);
  },
  // One kill, and the eight around it taking the damage too.
  B: (field) => {
    field.wall();
    field.deck();
    field.clear(5, 1);
    for (const [column, row] of [
      [4, 0],
      [5, 0],
      [6, 0],
      [4, 1],
      [6, 1],
      [4, 2],
      [5, 2],
      [6, 2],
    ]) {
      field.flash(column, row, canvasPalette.blastFlash);
    }
    field.ball(182, 120);
  },
  // The barrier along the floor, with the ball it just saved on top of it.
  W: (field) => {
    field.wall();
    field.deck();
    field.rect(gameConfig.field.left, gameConfig.powerUps.wallY, 366, 2, canvasPalette.energyWall);
    field.ball(268, gameConfig.powerUps.wallY - 8);
  },
  // Bullet time: the ball's own steps, close together because it is barely
  // moving. RUSH is the same idea with the steps flung apart.
  T: (field) => {
    field.wall();
    field.deck();
    field.trace(158, 224, 0.25);
    field.trace(170, 212, 0.45);
    field.ball(182, 200);
  },
  // Speed as a comet: the ball out front and its own silhouette echoed behind
  // it, white where it just was and darkening with distance. The game smears a
  // RUSH ball with two flat streaks, which works at 60 Hz and says nothing in a
  // still — a graded trail of ball-ghosts is the same fact drawn for a picture.
  RU: (field) => {
    field.wall();
    field.deck();
    for (const [step, tone] of [
      [3, "#3a3a46"],
      [2, "#71717e"],
      [1, "#b8b8c4"],
      [0.45, "#ffffff"],
    ] as const) {
      field.disc(186 + 4 - step * 16, 196 + 4 + step * 12, 4, tone);
    }
    field.ball(186, 196);
  },
  // The kinked flight, which is the only part of HAYWIRE a still can hold. The
  // game says the trap in sparks and in a heading that keeps changing — one is
  // a moment and the other is time, and neither survives being frozen. What
  // does survive is the *path*: four legs with hard elbows between them, drawn
  // as the ball's own sprite fading back the way TEMPO's trace does, so the
  // picture is a ball that has been knocked off course three times rather than
  // a diagram of one. The arcs are on the head alone, where the last kick was.
  HA: (field) => {
    field.wall();
    field.deck();
    for (const [x, y, alpha] of [
      [120, 250, 0.2],
      [156, 226, 0.35],
      [130, 200, 0.5],
      [170, 178, 0.7],
    ] as const) {
      field.trace(x, y, alpha);
    }
    field.ball(206, 158);
    for (const [x, y, tone] of [
      [204, 154, canvasPalette.haywireArc],
      [215, 160, canvasPalette.haywireArc],
      [201, 168, canvasPalette.haywireArcDim],
      [213, 152, canvasPalette.haywireArcDim],
    ] as const) {
      field.rect(x, y, 1, 1, tone);
    }
  },
  // The shot, drawn as the shot: a deck wearing the cloth, and the ball's own
  // track bending away from the straight line it left on. Deliberately not a
  // picture of the paddle moving — a blurred deck would say "this capsule is
  // about the paddle", and the capsule is about what the paddle does to the
  // ball. The ghosts are spaced evenly and turn by a fixed angle each step,
  // which is exactly `curveBall` run five times, so the curvature in the
  // miniature is the curvature in the game.
  EN: (field) => {
    field.wall();
    field.deck(undefined, 128);
    // The cloth, laid the way `drawFelt` lays it: the deck's middle row, cap to
    // cap inside the bevel, with the nap lit at each end.
    field.rect(129, DECK_Y + 3, 44, 1, canvasPalette.englishFelt);
    field.rect(129, DECK_Y + 3, 2, 1, canvasPalette.englishFeltNap);
    field.rect(171, DECK_Y + 3, 2, 1, canvasPalette.englishFeltNap);
    for (const [x, y, alpha] of [
      [150, 262, 0.2],
      [159, 238, 0.35],
      [173, 215, 0.5],
      [189, 195, 0.7],
    ] as const) {
      field.trace(x, y, alpha);
    }
    field.ball(209, 178);
    // The three flecks, at the orbit and the spacing the field draws them at.
    for (const [x, y] of [
      [219, 182],
      [209, 187],
      [209, 176],
    ] as const) {
      field.rect(x, y, 1, 1, canvasPalette.englishFleck);
    }
  },
  // RUSH's comet, run cold, against PAYDAY's gold wall: the same speed for the
  // opposite reason, and the half of the capsule RUSH does not pay. Mirrored
  // across the field as well, so the two do not share a diagonal either.
  TU: (field) => {
    field.wall(["G", "G", "G", "G"]);
    field.deck();
    for (const [step, tone] of [
      [3, "#0a3a44"],
      [2, "#158fa8"],
      [1, "#5fe0f0"],
      [0.45, "#ffffff"],
    ] as const) {
      field.disc(186 + 4 + step * 16, 196 + 4 + step * 12, 4, tone);
    }
    field.ball(186, 196);
  },
  // A wall worth twice what it says.
  X: (field) => {
    field.wall(["G", "G", "G", "G"]);
    field.deck();
    field.flash(7, 1, canvasPalette.deathFlash);
    field.ball(182, 160);
  },
  // Everything at once, from a shockwave that starts at the deck.
  N: (field) => {
    field.wall();
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        field.flash(column, row, canvasPalette.nukeFlash);
      }
    }
    field.deck();
    field.ring(FIELD_WIDTH / 2, DECK_Y, 96, canvasPalette.nukeRing, 4);
    field.ring(FIELD_WIDTH / 2, DECK_Y, 64, canvasPalette.nukeRing, 3);
  },
  // The save, at the instant it happens. The whole picture is one fact: the
  // ball is **below the deck**, at the height ANGEL puts it back at, which in
  // any other frame of this game means it is already gone. The feathers fan out
  // and up around it so the reader takes it as an event rather than a ball
  // somebody left there, and — like BOMB's debris below — they are drawn
  // several times the size the field throws them at, because at a third of this
  // a 1 px chunk is nothing at all.
  A: (field) => {
    const y = gameConfig.powerUps.angelReturnY;
    field.wall();
    field.wingedDeck();
    for (const [x, top, size, tone] of [
      [132, y + 6, 3, BRICK_COLORS.S.dark],
      [142, y - 2, 4, BRICK_COLORS.S.flat],
      [154, y - 11, 5, BRICK_COLORS.S.light],
      [168, y - 20, 4, canvasPalette.dropSheen],
      [204, y - 20, 4, canvasPalette.dropSheen],
      [218, y - 11, 5, BRICK_COLORS.S.light],
      [230, y - 2, 4, BRICK_COLORS.S.flat],
      [242, y + 6, 3, BRICK_COLORS.S.dark],
    ] as const) {
      field.rect(x, top, size, size, tone);
    }
    // Where it was caught, where it crossed back over the deck, and where it is
    // now: the same graded trail the rest of the catalogue draws motion with,
    // read bottom to top for once.
    field.trace(186, y, 0.45);
    field.trace(186, 244, 0.6);
    field.ball(186, 196);
  },
  // A life in hand: the reserve the LIVES inset counts, one of them new.
  U: (field) => {
    field.wall();
    field.ball();
    for (const [index, x] of [96, 152, 208, 264].entries()) {
      if (index === 3) {
        field.rect(x - 3, DECK_Y - 3, 46, 13, canvasPalette.popBonus);
      }
      field.deck(40, x, DECK_Y);
    }
  },
  // The bottom row going, and — for QUAKE — everything above it coming down.
  Z: (field) => {
    field.wall();
    for (let column = 0; column < COLUMNS; column++) {
      field.flash(column, 3, canvasPalette.deathFlash);
    }
    field.deck();
    field.ball();
  },
  Q: (field) => {
    field.wall(DEFAULT_WALL, 0, 1);
    for (let column = 0; column < COLUMNS; column++) {
      field.flash(column, 0, canvasPalette.deathFlash);
    }
    field.deck(gameConfig.paddle.baseWidth, DECK_HOME + 5);
    field.ball(190, 204);
  },
  // The drum, mid-turn: faces stacked into a framed window over the deck, the
  // one in the window solid and the ones it has already passed fading out above
  // it. Deliberately *not* RAIN's picture, which is four pills scattered loose
  // across the field — this capsule never drops anything to catch, it decides
  // one thing at the paddle, and the frame is what says so. Three bonuses on
  // the drum and no trap among them, because that is what the reel holds.
  GB: (field) => {
    const x = FIELD_WIDTH / 2 - 10;
    field.wall();
    field.deck();
    field.ball(122, 188);
    field.ghostCapsule(x, DECK_Y - 44, "E", 0.2);
    field.ghostCapsule(x, DECK_Y - 30, "U", 0.45);
    field.gambleReel("N");
  },
  // Four more on their way down, which is what the shower looks like.
  R: (field) => {
    field.wall();
    field.deck();
    field.capsule(48, 132, "E");
    field.capsule(130, 180, "L");
    field.capsule(212, 108, "X");
    field.capsule(296, 156, "M");
  },
  // Two pills touching, welded by the seam between them. Deliberately not what
  // its two neighbours in this file say: RAIN is four pills scattered across
  // the field and GAMBLE is a reel of faces over the deck, so a fusion is two
  // and only two, side by side, mid-field, with the join lit. The pair is
  // LASER and PIERCE — LANCE — because red against yellow still reads as two
  // things at a third of this size, which a still has to survive.
  FU: (field) => {
    const x = FIELD_WIDTH / 2 - CAPSULE_WIDTH;
    const y = DECK_Y - 40;
    field.wall();
    field.deck();
    field.capsule(x, y, "L");
    field.capsule(x + CAPSULE_WIDTH, y, "P");
    // The seam stands taller than the pills it joins: contained inside them it
    // would read as a gap between two capsules rather than as the weld.
    field.rect(x + CAPSULE_WIDTH - 1, y - 4, 2, 16, canvasPalette.dropSheen);
    field.rect(x + CAPSULE_WIDTH - 2, y + 3, 4, 2, canvasPalette.dropSheen);
  },
  // One ball, parked on the deck where it landed — off-centre, because a serve
  // is the only other time a ball sits on the paddle and a serve is centred.
  G: (field) => {
    field.wall();
    field.deck();
    field.ball(DECK_HOME + 32, DECK_Y - 8);
  },
  // Balls held where they were, each in its own ring.
  I: (field) => {
    field.wall();
    field.deck();
    for (const [x, y] of [
      [110, 160],
      [182, 210],
      [258, 178],
    ]) {
      field.ring(x + 4, y + 4, 12, canvasPalette.stasisRing);
      field.ball(x, y);
    }
  },
  // The lock on a brick, and the ball bending onto it.
  H: (field) => {
    field.wall();
    field.deck();
    const target = field.brickAt(9, 3);
    field.rect(target.x + 13, target.y + 4, 4, 4, canvasPalette.homingMark);
    field.trace(150, 230, 0.3);
    field.trace(196, 190, 0.5);
    field.ball(244, 142);
  },
  // The ghost deck riding the ceiling over the real one.
  Y: (field) => {
    field.mirrorDeck();
    field.wall();
    field.ball(140, 200);
    field.deck();
  },
  // A kill arcing to bricks the ball never touched.
  C: (field) => {
    field.wall();
    field.deck();
    field.flash(3, 2, canvasPalette.deathFlash);
    const from = field.brickAt(3, 2);
    field.rect(from.x + 30, from.y + 4, 26, 2, canvasPalette.chainBolt);
    field.rect(from.x + 54, from.y + 7, 30, 3, canvasPalette.chainCore);
    field.rect(from.x + 82, from.y - 2, 24, 2, canvasPalette.chainBolt);
    field.ball(120, 190);
  },
  // The pull, drawn the way the field draws it: a dotted tether to the deck.
  K: (field) => {
    field.wall();
    field.deck();
    field.capsule(172, 190, "X");
    for (let y = 202; y < DECK_Y; y += 4) {
      field.rect(181, y, 2, 2, canvasPalette.magnetTether);
    }
  },
  // The two black holes, each at the size and place it opens at.
  V: (field) => {
    const { x, y, discRadius } = gameConfig.powerUps.singularity;
    field.wall();
    field.deck();
    field.disc(x, y, discRadius + 6, canvasPalette.singularityHalo);
    field.disc(x, y, discRadius, canvasPalette.singularityCore);
    field.ring(x, y, discRadius + 9, canvasPalette.singularityRim, 2);
    field.trace(96, 236, 0.3);
    field.trace(126, 208, 0.5);
    field.ball(150, 186);
  },
  VX: (field) => {
    const radius = gameConfig.powerUps.singularity.discRadius * gameConfig.powerUps.vortex.scale;
    field.wall();
    field.deck();
    field.disc(250, 155, radius + 6, canvasPalette.singularityHalo);
    field.disc(250, 155, radius, canvasPalette.singularityCore);
    field.ring(250, 155, radius + 9, canvasPalette.singularityRim, 2);
    field.trace(120, 210, 0.3);
    field.trace(170, 190, 0.5);
  },
  // A mouth on each wall, and the ball on its way into one.
  PO: (field) => {
    field.wall();
    field.deck();
    for (const x of [0, FIELD_WIDTH - 3]) {
      field.rect(x, 120, 3, 48, canvasPalette.portalDark);
      field.rect(x, 130, 3, 28, canvasPalette.portalMid);
      field.rect(x, 138, 3, 12, canvasPalette.portalBright);
    }
    field.ball(14, 140);
    field.trace(342, 140, 0.4);
  },
  // The discs under the wall, and a ball coming off one.
  O: (field) => {
    field.wall();
    field.deck();
    for (const x of [56, 122, 186, 250, 316]) {
      field.disc(x, 168, 9, canvasPalette.bumperBody);
      field.ring(x, 168, 11, canvasPalette.bumperRim, 2);
      field.disc(x, 168, 4, canvasPalette.bumperCore);
    }
    field.ball(150, 214);
  },
  // The wall gone see-through, and the ball straight up through it, out the
  // top. Seen on both sides of the wall, or the picture says nothing.
  GH: (field) => {
    field.ghostWall(DEFAULT_WALL, 0.3);
    field.deck();
    field.trace(182, 236, 0.3);
    field.trace(182, 166, 0.45);
    field.trace(182, 96, 0.65);
    field.ball(182, 14);
  },
  // The grub, mid-meal, with the gap it has eaten behind it.
  CR: (field) => {
    field.wall();
    field.clear(2, 0);
    field.clear(3, 0);
    const bite = field.brickAt(3, 0);
    field.rect(bite.x + 18, bite.y + 3, 10, 5, canvasPalette.critterBody);
    field.rect(bite.x + 19, bite.y + 7, 8, 2, canvasPalette.critterUnder);
    field.rect(bite.x + 28, bite.y + 4, 3, 3, canvasPalette.critterJaw);
    field.rect(bite.x + 24, bite.y + 4, 1, 1, canvasPalette.critterEye);
    field.deck();
    field.ball(240, 200);
  },
  // What the wall is holding, shown through it.
  XR: (field) => {
    field.wall();
    field.deck();
    for (const [column, row, kind] of [
      [1, 0, "L"],
      [4, 1, "N"],
      [7, 0, "GH"],
      [9, 2, "E"],
    ] as const) {
      const brick = field.brickAt(column, row);
      field.capsule(brick.x + 5, brick.y + 2, kind);
    }
    field.ball(182, 200);
  },
  // Three lanes drilled straight down, trails still burning.
  MT: (field) => {
    field.wall();
    [1, 5, 9].forEach((column, index) => {
      for (let row = 0; row < 4 - index; row++) {
        field.clear(column, row);
      }
      const brick = field.brickAt(column, 0);
      const nose = GRID_TOP + (4 - index) * BRICK_HEIGHT;
      field.rect(brick.x + 9, nose - 16, 12, 22, canvasPalette.meteorFlame);
      field.rect(brick.x + 12, nose - 2, 6, 10, canvasPalette.meteorCore);
    });
    field.deck();
  },
  // The deck in two, with the hole the ball falls through.
  SP: (field) => {
    const { splitWidth, splitGap } = gameConfig.paddle;
    const half = (splitWidth - splitGap) / 2;
    const left = (FIELD_WIDTH - splitWidth) / 2;
    field.wall();
    field.ball(FIELD_WIDTH / 2 - 4, DECK_Y - 14);
    field.deck(half, left);
    field.deck(half, left + half + splitGap);
  },
  // The deck gone in a flash, and the pieces of it still in the air. Bigger and
  // brighter than the debris the field actually throws: at a third, two-pixel
  // chips are dust, and the picture has to say "that was your paddle".
  BM: (field) => {
    field.wall();
    field.rect(160, 264, 28, 12, canvasPalette.nukeFlash);
    for (const [x, y, size] of [
      [128, 250, 7],
      [150, 226, 5],
      [176, 238, 8],
      [204, 220, 5],
      [222, 246, 7],
      [244, 232, 5],
      [116, 272, 5],
      [252, 268, 6],
    ]) {
      field.rect(x, y, size, size, canvasPalette.paddleCap);
    }
  },
  // The peel lying on the rail the deck has to cross.
  BN: (field) => {
    const { peelWidth } = gameConfig.powerUps.banana;
    field.wall();
    field.deck(gameConfig.paddle.baseWidth, 120);
    field.rect(233, DECK_Y - 4, peelWidth - 2, 1, canvasPalette.peelBody);
    field.rect(232, DECK_Y - 3, peelWidth, 3, canvasPalette.peelBody);
    field.rect(233, DECK_Y - 1, peelWidth - 2, 1, canvasPalette.peelShade);
    field.ball(160, 210);
  },
  // A bank shot, called. The lattice is settled, the ball has just come off the
  // left wall, and the bracket and the dashes say where it is going before it
  // gets there — which is the whole of what the capsule sells. Drawn by hand
  // like ENGLISH's felt above: the pitch and the reach come out of the config
  // the field uses, and only the staging is authored.
  SN: (field) => {
    const { cell: pitch, dashStep, dashes, bracketArm } = gameConfig.powerUps.snap;
    for (let x = pitch; x < FIELD_WIDTH; x += pitch) {
      for (let y = pitch; y < FIELD_HEIGHT; y += pitch) {
        field.rect(x, y, 1, 1, canvasPalette.snapGrid);
      }
    }
    field.wall();
    const hit = { x: 7, y: 196 };
    field.rect(hit.x, hit.y, bracketArm, 1, canvasPalette.snapMark);
    field.rect(hit.x, hit.y - bracketArm, 1, bracketArm, canvasPalette.snapMark);
    for (let index = 1; index <= dashes; index++) {
      field.rect(hit.x + index * dashStep, hit.y - index * dashStep, 2, 1, canvasPalette.snapMark);
    }
    field.ball(hit.x + 26, hit.y - 30);
    field.deck(gameConfig.paddle.baseWidth, 96);
  },
  // The wall fully worn, and a ball already inside it. The lane it is threading
  // is the real one — the deck is where it always is, the wall is the default
  // four rows, and the only staging is that both were painted at full wear —
  // so the picture answers the one question a player has about this capsule,
  // which is whether the ball actually fits.
  //
  // The ball sits on a column boundary rather than in a brick's middle for the
  // same reason: it is the geometry that has to be legible, and there is exactly
  // one place a threading ball can be.
  ER: (field) => {
    field.wall(DEFAULT_WALL, 0, 0, 1);
    // The seams still giving. Spread from the second row down to well under the
    // wall, so the trickle reads as coming out of the whole thing rather than
    // off its bottom edge.
    for (let index = 0; index < 26; index++) {
      const hash = (index * 2654435761) >>> 8;
      field.rect(
        GRID_LEFT + (hash % (COLUMNS * BRICK_WIDTH)),
        GRID_TOP + BRICK_HEIGHT + ((hash >>> 9) % 40),
        1,
        1,
        index % 2 === 0 ? canvasPalette.erodeGrain : canvasPalette.erodeDust,
      );
    }
    // Dead centre of the sixth column boundary, which is where a 10 px lane puts
    // an 8 px ball, and deep enough into the wall to read as threading it rather
    // than as arriving at it.
    field.ball(GRID_LEFT + 6 * BRICK_WIDTH - gameConfig.ball.size / 2, GRID_TOP + BRICK_HEIGHT + 6);
    field.deck();
  },
  /**
   * Both halves of the capsule in one frame: the wall that is going to crumble,
   * and one brick that already has.
   *
   * **The cracks run at double length and the chips at five across**, which is
   * more than the field gives either. PYRE's crown paid for this rule and it
   * bites hardest here: a tile is the field divided by three, so a 1 px
   * fracture is a third of a pixel and a chip is barely one — a card painted at
   * the real sizes would be a plain wall over a plain deck. What has to survive
   * the divide is that the faces are *split* and that something is *falling*,
   * so those are the two things drawn at a size that can.
   *
   * The fracture is lengthened rather than thickened, which is the whole
   * difference between a card that says cracked and one that says punctured: a
   * 2 px-square walk resolves at a third into a row of black holes, while a
   * long chain of 2x1 dashes resolves into the dark line it is meant to be.
   *
   * The fault is staged mid-crossing rather than complete: the right-hand
   * columns are still whole, which says the cracks arrive along the wall rather
   * than appearing on it, and is the only thing one still frame can say about a
   * front.
   */
  GR: (field) => {
    const dead = { column: 4, row: 2 };
    field.wall();
    for (let row = 0; row < DEFAULT_WALL.length; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        // Where the front has got to, staged as the game stages it: the column's
        // own share of the wall, jittered off its own hash so the edge is ragged.
        const hash = ((column * 73856093) ^ (row * 19349663)) >>> 6;
        if (column * 12 + (hash % 24) > 96) {
          continue;
        }
        const { x, y } = field.brickAt(column, row);
        for (let index = 0; index < 2; index++) {
          let crackX = x + 3 + ((hash >>> (index * 3)) % 12);
          let crackY = y + 3 + ((hash >>> (index * 5)) % 5);
          for (let step = 0; step < 7; step++) {
            field.rect(crackX, crackY, 2, 1, canvasPalette.gravelCrack);
            crackX += 2;
            crackY += (hash >>> (step + index * 7)) & 1;
          }
        }
      }
    }
    // The brick that went, and the flash it went in: the pips leave the hole
    // rather than the wall, so the card says a *kill* crumbles and not the
    // capsule.
    field.clear(dead.column, dead.row);
    const origin = field.brickAt(dead.column, dead.row);
    field.rect(origin.x + 8, origin.y + 3, 14, 6, canvasPalette.deathFlash);
    // The shower, spread down and out of that hole and one of them arriving at
    // the deck — the whole of the choice the capsule offers, which is that the
    // chips and the ball want the deck in different places.
    for (const [x, y] of [
      [-14, 14],
      [-4, 26],
      [6, 18],
      [16, 34],
      [-22, 44],
      [10, 58],
      [-2, 96],
      [24, 150],
      [-30, 212],
    ]) {
      const chipX = origin.x + BRICK_WIDTH / 2 + x;
      const chipY = origin.y + BRICK_HEIGHT / 2 + y;
      field.rect(chipX, chipY, 5, 5, canvasPalette.gravelChip);
      field.rect(chipX, chipY, 2, 2, canvasPalette.gravelChipLit);
      field.rect(chipX + 3, chipY + 3, 2, 2, canvasPalette.gravelCrack);
    }
    field.ball(300, 150);
    field.deck();
  },
  /**
   * The trade, both halves of it in one frame: a crater where one ball went,
   * and two more still wearing their fire.
   *
   * The hole is the real one — every cell inside two of the impact point, which
   * on a grid of 30x12 bricks is five columns wide and five rows tall — and the
   * shockwave is drawn as the ellipse those cells actually make rather than as
   * a circle over them. A round ring here would be a picture of a blast the
   * capsule does not have.
   *
   * The crowns are drawn **three times the height the field draws them**, by
   * ANGEL's rule and for its reason: at a third of this size a 1 px lick is
   * nothing at all, and the one thing this card has to say is that the fire is
   * on the *balls*. Two of them, because two is what a catch hands you and
   * because a single crowned ball beside a crater reads as the survivor rather
   * than as the ammunition.
   *
   * They are kept well clear of the crater and low on the field: a ball drawn
   * inside its own explosion would say the fire is on the wall.
   */
  PY: (field) => {
    const impact = { column: 6, row: 1 };
    const { cellRadius } = gameConfig.powerUps.pyre;
    field.wall();
    for (let row = 0; row < DEFAULT_WALL.length; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const deltaRow = row - impact.row;
        const deltaColumn = column - impact.column;
        if (deltaRow * deltaRow + deltaColumn * deltaColumn <= cellRadius * cellRadius) {
          field.clear(column, row);
        }
      }
    }
    const center = field.brickAt(impact.column, impact.row);
    const x = center.x + BRICK_WIDTH / 2;
    const y = center.y + BRICK_HEIGHT / 2;
    field.disc(x, y, 8, canvasPalette.pyreFireball);
    field.disc(x, y, 4, canvasPalette.deathFlash);
    // Three quarters of the way out, so the ring is visibly still travelling
    // and the bricks it has already taken are visibly already gone.
    field.oval(x, y, cellRadius * BRICK_WIDTH * 0.75, cellRadius * BRICK_HEIGHT * 0.75, canvasPalette.pyreRing, 2);
    field.deck();
    // The deck alight, on the same two rows the field burns and inset past the
    // caps for the same reason: an ember over the cap's red is one warm colour
    // on another.
    for (let column = 8; column < gameConfig.paddle.baseWidth - 8; column++) {
      field.rect(DECK_HOME + column, DECK_Y + 4, 1, 2, canvasPalette.pyreWash);
    }
    for (const [x0, y0] of [
      [96, 176],
      [246, 208],
    ]) {
      field.ball(x0, y0);
      // The field's own crown — six licks tapering to the middle, cooling
      // upward off the ball's yellow — at twice its height and two pixels a
      // lick, which is the smallest it can be drawn and still read as fire at a
      // third of this size. Capped at the ball's own 8 px: taller than that and
      // the sprite disappears under its own flame, and what the card has to say
      // is that the fire is on a *ball*.
      for (const [lick, height] of [2, 5, 8, 8, 5, 2].entries()) {
        for (let step = 0; step < height; step++) {
          const tone = step >= height - 3 ? canvasPalette.pyreFlameTip : canvasPalette.pyreFlame;
          field.rect(x0 + lick * 2 - 1, y0 - 1 - step, 2, 1, tone);
        }
      }
    }
  },
  // The default staging, upside down — the only scene that needs no staging of
  // its own, because the capsule does nothing but turn the field over.
  F: (field) => field.turned(() => baseScene(field)),
  // The whole machine, in the tube's two tones. The only scene that paints the
  // default staging demade rather than adding anything to it: the capsule
  // changes nothing about the game, only about the machine showing it.
  D: baseScene,
  // Torchlight. The wall and the deck are where they always are and the dark is
  // laid over both of them, so the picture says what the trap does: you can see
  // what the ball is near, and a dim patch of your own deck. The ball's pool is
  // the solo radius, since there is one ball in the picture.
  BK: (field) => {
    const ball = { x: 182, y: 120 };
    field.wall();
    field.ball(ball.x, ball.y);
    field.deck();
    field.blackout([
      { x: ball.x + 4, y: ball.y + 4, radius: BLACKOUT_TORCH.ballRadius, peak: 1 },
      {
        x: FIELD_WIDTH / 2,
        y: DECK_Y + gameConfig.paddle.height / 2,
        radius: BLACKOUT_TORCH.paddleRadius,
        peak: BLACKOUT_TORCH.paddlePeak,
      },
    ]);
  },
  /**
   * The ball at full weight, standing in the hole it just made.
   *
   * Staged from the real geometry rather than composed by eye: a 24 px ball
   * straddling the boundary at x 144 covers columns 4 and 5, and over 24 px of
   * a 12 px row it covers rows 1, 2 and 3 — the six cells that are cleared.
   * The ring is those six cells' neighbours, which is what `crushRadius: 1`
   * actually reaches, and it is flashed rather than cleared because the ring
   * takes a hit and not necessarily a kill.
   *
   * Both halves have to be in the frame or the picture is the wrong capsule: a
   * hole alone is BLAST, and a big ball alone says nothing about what it does
   * to the wall.
   */
  GI: (field) => {
    const size = gameConfig.ball.size * gameConfig.powerUps.giant.scale;
    // The crater a 1-HP wall actually gives: the two columns the ball straddles
    // and the row it reached, plus the ring, which on this wall dies with it.
    const gone = [3, 4, 5];
    const rows = [1, 2, 3];
    field.wall();
    // The ring that survives, flashed rather than cleared — a ring takes a hit
    // and not necessarily a kill, and on a deeper wall this is what is left.
    for (const row of rows) {
      for (const column of [2, 6]) {
        field.flash(column, row, canvasPalette.blastFlash);
      }
    }
    for (const column of gone) {
      field.flash(column, 0, canvasPalette.blastFlash);
      for (const row of rows) {
        field.clear(column, row);
      }
    }
    // Low in the crater, so the hole reads *above* it: the ball is 24 px and a
    // row is 12, so a ball parked in a two-row hole fills it exactly and the
    // picture becomes a ball with no damage around it. Sitting it on the
    // bottom two rows leaves the third open over its head.
    field.ball(GRID_LEFT + 3 * BRICK_WIDTH + 3, GRID_TOP + 2 * BRICK_HEIGHT, size);
    field.deck();
  },
  // A falling ball, the thread it has paid out, and the pip waiting on the rail.
  //
  // **The bounce is the whole reason this picture exists.** A thread drawn
  // straight down would say the capsule draws a plumb line, which is the thing
  // it is most likely to be mistaken for and the thing it is not: the ball is
  // travelling left, the thread banks off the wall, and the pip is on the *other*
  // side of the field from the ball. A player who reads only this picture should
  // still come away knowing it predicts rather than points.
  //
  // The second pip is the ball the deck is not answering first — the rail says
  // where every falling ball is going, and only the soonest one draws its line.
  TR: (field) => {
    const { pipWidth, pipHeight, dotPitch } = gameConfig.powerUps.tracer;
    field.wall();
    // Walked the way the real one is, off the same heading, so the corner lands
    // where physics would put it rather than where it looks nice.
    const start = { x: 232, y: 150 };
    const bounce = { x: gameConfig.field.left + gameConfig.ball.size / 2, y: 214 };
    const land = { x: 104, y: DECK_Y };
    for (const [from, to] of [
      [start, bounce],
      [bounce, land],
    ]) {
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      for (let step = 0; step < length; step += dotPitch) {
        const at = step / length;
        field.rect(from.x + (to.x - from.x) * at, from.y + (to.y - from.y) * at, 1, 1, canvasPalette.tracerThread);
      }
    }
    field.rect(land.x - pipWidth / 2, DECK_Y - pipHeight, pipWidth, pipHeight, canvasPalette.tracerPip);
    // The other ball's landing, further along the rail and threadless.
    field.rect(286 - pipWidth / 2, DECK_Y - pipHeight, pipWidth, pipHeight, canvasPalette.tracerPip);
    field.ball(start.x, start.y);
    field.ball(300, 176);
    field.deck(gameConfig.paddle.baseWidth, 72);
  },
  /**
   * Two fronts meeting, the wall gone dark where they did, and the hole they
   * have started to tear.
   *
   * **The superposition is the whole picture.** A single wave rolling through
   * the wall would say the capsule ripples it, which is the easy half and the
   * half a player will assume anyway; what they have to learn from this is that
   * the *crossing* is where the damage comes from. So the two shoulders are 5 px
   * deep and the middle, where both are, is 7 — deeper than either front alone
   * ever gets — and it is the middle that has gone.
   *
   * The ball is on the far side of the field from the hole and on its way up,
   * which is the other thing this has to say: it did not break those bricks by
   * touching them. It broke them by making the wall ring.
   */
  /**
   * A wall that has fallen into its own holes, and the ragged skyline that
   * leaves.
   *
   * **The compaction is the picture, and the top edge is where it shows.** A
   * wall drawn simply lower would say the capsule drops the wall, which is
   * QUAKE's job and is the thing this is most likely to be mistaken for. What
   * says *slump* is that the columns disagree: every one of them has its bottom
   * on the same floor and its top wherever its own losses left it, so the flat
   * band the player built up is now a skyline.
   *
   * The bricks keep their own colours as they stack, which is the other half of
   * it: a column that lost its yellow shows red over orange over green, and the
   * reader can see these are the same bricks and not a new wall.
   */
  SL: (field) => {
    // What each column has left, bottom-justified on the slump floor. Authored
    // as a profile rather than simulated, for the reason every scene here is
    // staged: a truthful frame needs a wall the player spent a minute eating.
    const standing = [4, 4, 3, 4, 2, 4, 4, 1, 3, 4, 4, 2];
    // The capsule's own floor, read off the config rather than picked: the whole
    // point of the picture is *how far down* the wall ends up, and a staged
    // height would be the one thing here that could quietly stop being true.
    const floorRow = gameConfig.effects.slumpFloorRow;
    standing.forEach((count, column) => {
      // The kinds this column kept, taken off the bottom of the original wall
      // so the colours it lost are the ones off the top.
      const kinds = DEFAULT_WALL.slice(DEFAULT_WALL.length - count);
      kinds.forEach((kind, index) => {
        const row = floorRow - count + index + 1;
        field.brick(column, row, kind);
      });
    });
    // Two columns still settling, and the dust they squeezed out either side.
    for (const column of [4, 7]) {
      const { x, y } = field.brickAt(column, floorRow);
      for (let index = 0; index < 7; index++) {
        const hash = (index * 2654435761) >>> 9;
        const side = index % 2 === 0 ? x : x + BRICK_WIDTH;
        field.rect(side - 2 + (hash % 5), y + BRICK_HEIGHT - 1 - ((hash >>> 7) % 4), 1, 1, canvasPalette.erodeDust);
      }
    }
    // Under the pile and close to it, which is the other half of what the
    // picture has to say: a slumped wall is a wall that is suddenly *near*.
    field.ball(210, 206);
    field.deck(gameConfig.paddle.baseWidth, 168);
  },
  /**
   * TIDE: the field flooded and the deck up on the surface, in the wall's face.
   *
   * Staged at full flood rather than mid-arrival, because what the reader has to
   * come away knowing is not that water moves but **where the deck ends up** —
   * and the only way a still can say that is by showing it there, 96 px above
   * the rail with the wall close enough to touch. The empty rail at the bottom
   * of the picture is doing as much work as the deck is: it is where the reader
   * expects a paddle and there is water instead.
   *
   * The ball is drawn under the surface, which is the other half of the
   * sentence: a ball past the deck is not a ball lost any more.
   *
   * The wash, the crest and the foam are the field's own numbers read out of the
   * config, so a retuned waterline is a retuned picture with no second edit.
   */
  TI: (field) => {
    field.wall();
    const { waterline, draft } = gameConfig.powerUps.tide;
    field.ball(150, waterline + 34);
    // The draft too, so the still shows the deck sitting *in* the water rather
    // than balanced on it — which is the difference the field's own float line
    // makes and the one thing a reader could otherwise get wrong from here.
    field.deck(gameConfig.paddle.baseWidth, undefined, waterline - gameConfig.paddle.height + draft);
    field.water(waterline);
  },
  JE: (field) => {
    // Two crests four columns apart, summed. The shape is a Gaussian rather
    // than the sheet's own front for the reason every scene stages rather than
    // replays: at four rows and a third of the size, a truthful frame of the
    // simulation is a two-pixel wobble, and a picture nobody can read is not
    // more honest than one they can.
    const hang = [0, 0, 0, 2, 5, 7, 7, 5, 2, 0, 0, 0];
    // The load, on the bricks' own damage ramp: full at the crossing, half on
    // its shoulders, and nothing out where only the frames have felt anything.
    const strain = [0, 0, 0, 0.3, 0.65, 1, 1, 0.65, 0.3, 0, 0, 0];
    field.sheetWall(hang, strain, [5, 6]);
    field.ball(86, 196);
    field.deck(gameConfig.paddle.baseWidth, 58);
  },
};

/** Paint one capsule's field, at field size, ready to be blitted down. */
export function paintCapsuleScene(ctx: CanvasRenderingContext2D, kind: PowerUpKind): void {
  const demade = kind === "D";
  paintBackground(ctx, SCENE_BACKGROUND, SCENE_VARIANT, FIELD_WIDTH, FIELD_HEIGHT);
  if (demade) {
    ctx.fillStyle = canvasPalette.demakeGround;
    ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  }
  SCENES[kind](new Field(ctx, demade));
}
