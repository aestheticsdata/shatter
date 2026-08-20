import { gameConfig } from "@core/config/GameConfig";
import { paintBackground } from "@render/backgrounds";
import {
  BLACKOUT_TORCH,
  drawBall,
  drawBlackoutVeil,
  drawBrick,
  drawCapsule,
  drawPaddleBands,
  MIRROR_BANDS,
  PADDLE_BANDS,
} from "@render/CanvasRenderer";
import { canvasPalette } from "@render/palette";

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
const DECK_HOME = (FIELD_WIDTH - gameConfig.paddle.baseWidth) / 2;
const BALL_HOME = { x: 182, y: 200 };

// The wall most scenes are staged against: four rows of the four colours a
// player meets first, which is a level's top half and reads as a wall at a
// third of the size.
const DEFAULT_WALL: readonly BrickKind[] = ["1", "2", "3", "4"];

function cell(kind: BrickKind, hurt = false): BrickCell {
  return { kind, hitPoints: 1, points: 0, hurt, capsule: null };
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

  brickAt(column: number, row: number): { x: number; y: number } {
    return { x: GRID_LEFT + column * BRICK_WIDTH, y: GRID_TOP + row * BRICK_HEIGHT };
  }

  brick(column: number, row: number, kind: BrickKind, fade = 0, hurt = false): void {
    const { x, y } = this.brickAt(column, row);
    drawBrick(this.ctx, x, y, cell(kind, hurt), 1, fade, this.demade);
  }

  // One full row of the wall, the width of the grid.
  row(row: number, kind: BrickKind, fade = 0): void {
    for (let column = 0; column < COLUMNS; column++) {
      this.brick(column, row, kind, fade);
    }
  }

  wall(kinds: readonly BrickKind[] = DEFAULT_WALL, fade = 0, top = 0): void {
    kinds.forEach((kind, index) => this.row(top + index, kind, fade));
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

  deck(width: number = gameConfig.paddle.baseWidth, x = (FIELD_WIDTH - width) / 2, y = DECK_Y): void {
    drawPaddleBands(this.ctx, x, y, width, PADDLE_BANDS, 1, this.demade);
  }

  mirrorDeck(width: number = gameConfig.paddle.baseWidth, x = DECK_HOME): void {
    drawPaddleBands(this.ctx, x, gameConfig.powerUps.mirrorY, width, MIRROR_BANDS, 1, this.demade);
  }

  ball(x = BALL_HOME.x, y = BALL_HOME.y): void {
    drawBall(this.ctx, x, y, 1, this.demade);
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
  // The ball inside the wall rather than bouncing off it.
  P: (field) => {
    field.wall();
    field.deck();
    field.trace(182, 140, 0.3);
    field.ball(182, 66);
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
  // Four more on their way down, which is what the shower looks like.
  R: (field) => {
    field.wall();
    field.deck();
    field.capsule(48, 132, "E");
    field.capsule(130, 180, "L");
    field.capsule(212, 108, "X");
    field.capsule(296, 156, "M");
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
