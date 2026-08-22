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
    drawBrick(this.ctx, x, y, cell(kind, hurt), 1, { fade, demade: this.demade });
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
