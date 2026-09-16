import { trace } from "@core/ballTrace";
import { BRICK_BY_ID } from "@core/config/bricks";
import { COMBO_GLYPHS, COMBOS, completableCombos, OVERTIME_FROZEN } from "@core/config/combos";
import { ballSpeedForLevel, gameConfig, peelFlightTicks } from "@core/config/GameConfig";
import {
  GAMBLE_FACES,
  MALUS_KINDS,
  POWER_UP_DURATIONS,
  POWER_UP_GLYPHS,
  POWER_UP_IDS,
  POWER_UP_NAMES,
} from "@core/config/powerUps";
import { DemoHook } from "@core/DemoHook";
import { DevConsole } from "@core/DevConsole";
import { levelAt, levelIndexOf, wallFor } from "@core/levels/levels";
import { computePaddleBounceVelocity, relativePaddleHit } from "@core/physics/PaddleBounce";
import { Ball, ballSizeFor, paceGhost } from "@entities/ball/Ball";
import { BrickGrid } from "@entities/bricks/BrickGrid";
import { BumperField } from "@entities/effects/BumperField";
import { Critter } from "@entities/effects/Critter";
import { Decoherence } from "@entities/effects/Decoherence";
import { Detonation } from "@entities/effects/Detonation";
import { Entanglement } from "@entities/effects/Entanglement";
import { Erosion } from "@entities/effects/Erosion";
import { Fence } from "@entities/effects/Fence";
import { GravelField } from "@entities/effects/GravelField";
import { JellySheet } from "@entities/effects/JellySheet";
import { MeteorField } from "@entities/effects/MeteorField";
import { ParticleField } from "@entities/effects/ParticleField";
import { Quake } from "@entities/effects/Quake";
import { ShadowCast } from "@entities/effects/ShadowCast";
import { Singularity } from "@entities/effects/Singularity";
import { Slump } from "@entities/effects/Slump";
import { Superposition } from "@entities/effects/Superposition";
import { WallOffsets } from "@entities/effects/WallOffsets";
import { ShotPool } from "@entities/laser/ShotPool";
import { mirrorBounds, mirrorGap, mirrorSpan } from "@entities/paddle/MirrorPaddle";
import { Paddle } from "@entities/paddle/Paddle";
import { DropBag } from "@entities/powerups/DropBag";
import { DropPool } from "@entities/powerups/DropPool";
import { PowerUpTimers } from "@entities/powerups/PowerUpTimers";
import { InputController } from "@input/InputController";
import { zeroPad } from "@shared/format";
import { type HiScores, TABLE_SIZE } from "@state/HiScores";

import type { SoundBank } from "@audio/SoundBank";
import type { TraceRules } from "@core/ballTrace";
import type { ComboId } from "@core/config/combos";
import type { Landing } from "@entities/effects/Slump";
import type { EchoContact } from "@entities/effects/Superposition";
import type { WidthCurve } from "@entities/paddle/Paddle";
import type {
  BrickFlash,
  BrickHit,
  BurstSpec,
  CatchPop,
  ChainBolt,
  PanelView,
  PaddleShard,
  Peel,
  PowerUpKind,
  PyreBlast,
  RailMark,
  RectangleBounds,
  ScreenName,
  SnapMark,
  StasisRing,
  TracerThread,
} from "@interfaces/types";
import type { CanvasRenderer } from "@render/CanvasRenderer";
import type { CapsuleCatalogue } from "@ui/CapsuleCatalogue";
import type { LevelGallery } from "@ui/LevelGallery";
import type { Panel } from "@ui/Panel";
import type { Screens } from "@ui/Screens";
import type { StageScaler } from "@ui/StageScaler";

export interface ShatterGameDeps {
  renderer: CanvasRenderer;
  panel: Panel;
  screens: Screens;
  levels: LevelGallery;
  capsules: CapsuleCatalogue;
  sfx: SoundBank;
  hiScores: HiScores;
  scaler: StageScaler;
  lockTarget: HTMLElement;
}

const ENTRY_LENGTH = 3;
const ENTRY_COMMIT_DELAY_MS = 260;
// The pool is exactly the SWARM size; MULTI tier 3's 9 balls fit inside it.
const MAX_BALLS = 12;

// Longest label that fits the POWER inset, counted in characters — a proxy for
// a width, since Silkscreen is proportional. Measured against the widest label
// each candidate allows in the 92px inset at 7px and 1px letter-spacing: 14 tops
// out at 87.5px ("PAYDAY BUMPERS") and 15 lands exactly on 92 with no margin at
// all. At 14, five two-letter glyphs are a 14-character row and fit.
const POWER_LABEL_MAX_CHARS = 14;

// Sideways kick on a bolt's three middle points, in game pixels.
const CHAIN_BOLT_JITTER = 3;

// The capsules that resize the deck, and the width each one sets. They are a
// group because only one of these widths can hold at a time: catching any of
// them cancels the other two, and the deck goes back to `baseWidth` only once
// the last of them has run out.
const PADDLE_WIDTH_KINDS = ["E", "XW", "J", "SP"] as const satisfies readonly PowerUpKind[];

type PaddleWidthKind = (typeof PADDLE_WIDTH_KINDS)[number];

const PADDLE_WIDTHS: Record<PaddleWidthKind, number> = {
  E: gameConfig.paddle.wideWidth,
  XW: gameConfig.paddle.extraWideWidth,
  J: gameConfig.paddle.narrowWidth,
  // SPLIT is in the group for the same reason the others are: it owns the deck
  // while it lasts. Its width is the span end to end, hole included — what
  // actually catches is the two 20 px halves `splitSegments` cuts out of it.
  SP: gameConfig.paddle.splitWidth,
};

// How JAMMER's shut differs from every reward's run: fast-first, so the deck is
// most of the way gone before the player has finished reading the pill.
const WIDTH_CURVES: Partial<Record<PaddleWidthKind, WidthCurve>> = { J: "out" };

/**
 * How long the caps take to travel from `from` to `to`.
 *
 * One pixel an edge a tick, which makes the duration a consequence of the
 * distance rather than a number anybody maintains: WIDE is 13 ticks, XWIDE 49,
 * JAMMER 8, and XWIDE gives its 49 back at expiry.
 *
 * `maxTicks` is passed by exactly one caller and covers exactly one case: a
 * capsule caught over another live capsule, where the distance is nobody's
 * design — XWIDE over a live JAMMER is 57 px an edge. Everything else runs
 * uncapped, because XWIDE's caps still travelling long after WIDE's would have
 * stopped *is* the capsule saying what it is, and a retraction is the same
 * mechanism run backwards.
 */
function widthEaseTicks(from: number, to: number, maxTicks = Number.POSITIVE_INFINITY): number {
  const ticks = Math.round(Math.abs(to - from) / (2 * gameConfig.paddle.widthEasePxPerEdge));
  return Math.min(maxTicks, ticks);
}

function isPaddleWidthKind(kind: PowerUpKind): kind is PaddleWidthKind {
  return Object.hasOwn(PADDLE_WIDTHS, kind);
}

// DEMAKE is barred from a run's first level *by chance*, because that level now
// hands one over on purpose instead — `wallFor` seeds it, and this is what makes
// the guarantee exact rather than a floor: one DEMAKE, in a row the rule chose,
// and not a second one rolled into the front rows to go off on the third brick.
// Enforced at the roll rather than at the catch, so the dev console still grants
// it anywhere. A module constant because it is the same list every roll.
const FIRST_LEVEL_EXCLUDES: readonly PowerUpKind[] = ["D"];
const NO_EXCLUDES: readonly PowerUpKind[] = [];

// What dealt the damage. Only the first two are things the player did: the rest
// are consequences of one, and the game stays quiet about them so a single kill
// is acknowledged once however far it spreads.
//
// `twin` is the newest and the one that is not a consequence of a *hit* — it is
// a consequence of a grid write, whatever made it, which is why it is reachable
// from a nuke and a grub as well as from a ball. It pays exactly what `chain`
// pays and it exists as its own word rather than borrowing that one so the one
// rule this capsule has cannot be lost: a `twin` write never fires a second
// `strikeTwin`. See `strikeTwin`.
type BrickDamageSource = "ball" | "laser" | "splash" | "chain" | "twin";

// A face that is not the one already showing: a reel that repeats itself for a
// step reads as stuck rather than as spinning.
//
// Uniform over `GAMBLE_FACES`, deliberately: the bag's tickets say how often a
// capsule *falls*, and the point of the reel is that the rare things are on the
// table.
//
// Which cuts both ways now, and did not under weights. 38 faces is 2.63 % each
// against a rare capsule's 1.67 % of a draw — so the drum is 1.58x its drop rate
// for a rare, and 0.79x for a common, which turns up here *less* often than it
// falls. Under the old weighted roll a rare was 2.47x and nothing was under 1x,
// which is why this comment used to say "several times more often". Both ratios
// move every time a capsule is invented or a tier is retuned; re-read them,
// never assume a percentage.
function rollFace(besides: PowerUpKind | null): PowerUpKind {
  const pool = besides === null ? GAMBLE_FACES : GAMBLE_FACES.filter((kind) => kind !== besides);
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * One tick of an effect's 0..1 blend: toward 1 while its capsule is live, back
 * to 0 once it is not. Five capsules ride one of these — GHOST's fade, DEMAKE's
 * dissolve, BLACKOUT's iris, FLIP's turn and TURBO's spool.
 *
 * The floor is not `Math.max(0, …)`. Subtracting 1/30 from 1 thirty times lands
 * on 2e-16, never on 0, and every gate that asks `blend > 0` then stays open for
 * the rest of the run over a blend nobody can see — which for DEMAKE means the
 * renderer paints every frame twice, forever, after one capsule. Anything under
 * half a step is spent.
 *
 * **The ceiling is not `Math.min(1, …)` either, and for the same reason read the
 * other way up.** Adding 1/10 ten times lands on 0.9999999999999999, so the
 * clamp never fires and a gate asking `blend < 1` holds for one tick past the
 * end — which for LASER (SHA-88) is the muzzle staying white for a frame after
 * the bolt it was charging has already left. Whether it lands over or under 1
 * depends on the denominator, which is no way to decide when an effect finishes.
 * Anything within half a step of the end has arrived.
 */
function stepBlend(blend: number, rising: boolean, ticks: number): number {
  const step = 1 / ticks;
  if (rising) {
    const next = blend + step;
    return next > 1 - step / 2 ? 1 : next;
  }
  const next = blend - step;
  return next < step / 2 ? 0 : next;
}

// The modifier half of the two dev chords, WARP's and the test console's: Ctrl
// and Alt held with a third modifier that is Command *or* Shift.
//
// Command alone was the Mac answer — nothing claims all three there, since Chrome
// binds ⌘N and ⇧⌘N only and macOS has no ⌃⌥⌘ default. On Windows `metaKey` is the
// Windows key, and Ctrl+Alt+Win+letter is both a knuckle-breaker and the OS's to
// claim, so Shift stands in for it: Ctrl+Alt+Shift+letter is free in Chrome on
// Windows, and it is the same chord to describe on both platforms.
//
// Either, rather than one per platform sniffed from the user agent: a Mac keeps
// the chord its owner already has in their fingers, and a browser lying about its
// platform cannot take the shortcut away from anyone.
function hasDevChord(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.altKey && (event.metaKey || event.shiftKey);
}

function isDirectHit(source: BrickDamageSource): boolean {
  return source === "ball" || source === "laser";
}

export class ShatterGame {
  private screen: ScreenName = "title";
  private score = 0;
  private lives: number = gameConfig.rules.startLives;
  // 1UPs granted, and 1UPs caught on a full rack. Deliberately not reset by
  // `startRun` or `gameOver`: they exist only so the panel can notice they
  // changed, and a counter that went back to zero would read as one more of
  // itself on the first frame of a new run.
  private lifeGainedCount = 0;
  private lifeRefusedCount = 0;
  private level = 0;
  private entry = "";
  private booted = false;
  private wallArmed = false;
  /**
   * WALL's bar as a picture: how much of it is drawn, where it is being drawn
   * out of, and what is left of the white core at the point a ball struck it.
   *
   * A blend and not a timer, because WALL is `timed: false` — the roster row is
   * `ticks: 0` and `PowerUpTimers` never counts it, so `wallArmed` above is the
   * whole contract and these three decide nothing but the picture.
   *
   * Zeroed at `resetServe` and `gameOver` and deliberately **not** at
   * `onLevelCleared`, which is the odd one out of the reset sites — because
   * `wallArmed` is not cleared there either. A charge bought on level 3 is
   * still there on level 4, and a bar that vanished under a player who still
   * had the save would be the picture lying about the contract.
   */
  private wallBlend = 0;
  private wallOriginX = 0;
  private wallStrikeLeft = 0;
  // ANGEL's charge: one lost ball cancelled. Armed by the catch and spent by
  // the loss, like `wallArmed` above it — and unlike it, deliberately not
  // cleared by `resetServe()`, which is what carries it across levels.
  private angelCharged = false;
  /**
   * SNAP's lattice, 0 to 1 — the grid dithering in over the field and back out.
   *
   * Only the paper. The rule itself is the timer's and nothing about it eases:
   * a bounce is snapped or it is not, and a half-snapped rebound would be an
   * angle nobody could call. What arrives and leaves is the picture that
   * explains it, which is exactly the right way round for a capsule whose whole
   * promise is that the ball is now honest.
   */
  private snapBlend = 0;
  private snapMarks: SnapMark[] = [];
  /**
   * TRACER's guide, 0 to 1 — the whole thing fading in and back out.
   *
   * Unlike SNAP's lattice above, this one is *only* strength: the two ends have
   * shapes of their own (the thread pays out from the ball, and lets go at the
   * rail) and those are drawn off `payOutTicks`/`letGoTicks` in the renderer. A
   * capsule whose promise is "this is where it lands" may not spend either end
   * half-claiming it, so the picture eases and the claim never does.
   */
  private tracerBlend = 0;
  /**
   * The threads themselves, rebuilt every tick from the live balls rather than
   * aged like `snapMarks`. A mark is a record and may go stale; a guide is a
   * claim about the next second and may not.
   */
  private tracerThreads: TracerThread[] = [];
  /**
   * PYRE's ember wash, 0 to 1 — the fire rolling over the deck and rolling back
   * off it.
   *
   * The capsule's whole transition lives on this one number. It is spent
   * geometrically rather than as an alpha: the front sweeps cap to cap across
   * the deck as the blend climbs, and sweeps back the way it came as it falls,
   * so the twenty seconds start and end with something *travelling* rather than
   * with a colour appearing. The crowns on the balls read it too — they will not
   * light until the wash is half across, which is the ticket's "then".
   *
   * The crowns themselves are not here. They are per ball (`Ball.pyreCrown`),
   * because one number for the field cannot carry nine balls lighting at
   * different moments and guttering out one after another — the same reason
   * HOMING's reticle is on the ball and not on the game.
   */
  private pyreBlend = 0;
  // Craters, until their light runs out. Render-only and already spent: the
  // bricks died on the frame the player clicked.
  private pyreBlasts: PyreBlast[] = [];
  // GAMBLE's reel: how long it still turns, what it will land on, and the face
  // it is showing right now. The winner is drawn on the catch and held here
  // rather than rolled at the end, so the spin is a replay of a decision
  // already made and the face that stops is the one that fires.
  private gambleTicksLeft = 0;
  private gambleKind: PowerUpKind | null = null;
  private gambleFace: PowerUpKind | null = null;
  // Dev console only (`gamble NU`): pins every reel from here on to one result.
  // Survives a lost ball and a new run the way a console setting should — it is
  // a testing tool, not run state, and clearing it on death would mean retyping
  // it after every mistake.
  private gamblePin: PowerUpKind | null = null;
  private brickFlashes: BrickFlash[] = [];
  private catchPops: CatchPop[] = [];
  // Capsules caught this run, and how many of them were traps. Read by the
  // film's snapshot alone: a catch is acknowledged on the field by its pop, and
  // these count the pops.
  private capsulesCaught = 0;
  private trapsCaught = 0;
  private stasisRings: StasisRing[] = [];
  private bolts: ChainBolt[] = [];
  private readonly singularity = new Singularity();
  private readonly vortex = new Singularity();
  // Both black holes, in the order everything that walks them uses: SINGULARITY's
  // fixed core first, VORTEX's drifting one second. Two entries today, and every
  // loop over them is written for the array rather than the pair, so a third
  // hole is a row here and nothing else.
  private readonly cores: readonly Singularity[] = [this.singularity, this.vortex];
  // The combos live this tick, in table order, and one bit per row of `COMBOS`
  // for what was live last tick. The array is rewritten in place rather than
  // rebuilt — it is read once a tick on the hot path — and the mask is what
  // makes a *new* fusion audible without the sound retriggering every tick the
  // pair stays up.
  private readonly combos: ComboId[] = [];
  private comboMask = 0;
  // Which capsule the deck is currently telescoping for, and the marks a
  // JAMMER leaves on the rail behind it. The kind outlives the catch because
  // the tint belongs to the *run* — the deck wears pink ends for the eight
  // ticks it is shutting, not for the six seconds it stays shut.
  private widthEaseKind: PaddleWidthKind | null = null;
  private railMarks: RailMark[] = [];
  // BANANA's peels, oldest first: in the air on the way to the rail, then on
  // it, and the skid one causes once it is.
  // `lastPaddleX` is the deck's position at the end of the previous tick, which
  // is what makes the slide the player's own last movement rather than a
  // constant: it is sampled at the end of `stepPeels`, so a skid already under
  // way never feeds itself.
  private peels: Peel[] = [];
  private skidTicksLeft = 0;
  private skidVx = 0;
  private skidCooldown = 0;
  private lastPaddleX: number = gameConfig.paddle.initialX;
  // Absolute-tracking only: where the pointer went while the deck was not
  // following it, or `null` when the two are in step. See `pointToStage`.
  private pointerTargetX: number | null = null;
  private resyncTicksLeft = 0;
  private readonly bumpers = new BumperField();
  private readonly quake = new Quake();
  // GRAVEL's chips, in the air. Its own pool rather than the debris field's,
  // because a pip is worth points: see `GravelField` for the three things that
  // follow from that and none of which a `Particle` could carry.
  private readonly gravel = new GravelField();
  // ERODE's wear, cell by cell. Handed to the grid once at construction and read
  // by its hitbox from there — this class only steps it.
  private readonly erosion = new Erosion();
  // JELLY's sheet, cell by cell. Handed to the grid once at level load and read
  // by its hitbox from there, exactly as the wear above it is — the wall never
  // learns whose capsule moved its bricks.
  private readonly sheet = new JellySheet();
  // The cells the sheet tore this tick, as flat indices. A field rather than a
  // local so the drain does not allocate an array on every one of the
  // capsule's six hundred frames; it is never read outside the one method that
  // clears it.
  private readonly jellyTears: number[] = [];
  // SLUMP's fall, cell by cell. Beside the sheet above it and handed to the
  // grid through the same seam — see `WallOffsets`, which is what lets both
  // capsules move the same brick without the wall learning either one's name.
  private readonly slump = new Slump();
  private readonly wallOffsets = new WallOffsets(this.sheet, this.slump);
  // FENCE's posts, handed to the grid the way the three above it are — and
  // through a seam of their own, because the fence is the one thing the wall
  // holds that is not the wall: `WallFence` is read by the hitbox and by
  // nothing that walks `rows`. See the class for why it is six cells beside the
  // grid array rather than nine empty rows inside it.
  private readonly fence = new Fence();
  // The posts that finished arriving and leaving this tick, reused rather than
  // allocated for the reason `landings` is.
  private readonly fenceSeated: number[] = [];
  private readonly fencePulled: number[] = [];
  // UMBRA's shadow field. Unlike the four above it this one is *not* handed to
  // the grid: the wall's hitbox is where its bricks are, and a shadow is a
  // surface hanging in the empty band that no brick occupies. It is rebuilt
  // from the wall every tick and owns nothing the wall would have to know about.
  private readonly shadows = new ShadowCast();
  // SUPERPOSE's echoes. Handed the grid rather than holding a reference to it,
  // the way the shadows are: an echo is a second surface standing off a brick
  // and the wall's hitbox is still exactly where its bricks are. What it owns
  // that a shadow does not is the bit saying whether a pair has been collapsed
  // yet, which is the only part of the capsule the wall cannot be asked for.
  private readonly superposition = new Superposition();
  // COLLAPSE's fog. Unlike the echoes above it this one *is* handed to the
  // grid, because what it changes is the wall's own answer to the ball — but
  // only to the ball: it is read in `findBallOverlap` and nowhere else, so a
  // fogged brick is still a brick to the gild front, to XRAY's span, to HOMING's
  // targets, to ZAP's bottom row and to `remaining`. See `WallFog`.
  private readonly decoherence = new Decoherence();
  // TWIN's couples. The cheapest of the wall capsules to hold, and the odd one
  // out among the six above it: it is handed neither to the grid nor a surface
  // of its own, because a thread is not a thing the ball can touch. What it
  // owns is a pairing over cell indices, and the only question anything asks it
  // is `partnerOf` — at the two places a brick is written to the grid, never at
  // a collision. See `strikeTwin`.
  private readonly entanglement = new Entanglement();
  // The bricks that landed this tick, reused rather than allocated: a whole
  // wall arriving at the floor is ninety-six of these in one frame.
  private readonly landings: Landing[] = [];
  private readonly critter = new Critter();
  private readonly meteors = new MeteorField();
  // Ticks each ball has spent inside each core's reach, indexed `[core][ball]`.
  // Ball slot is a stable identity: `balls` is a fixed array built once at
  // construction and never reordered. If that ever changes, this moves onto Ball.
  //
  // Per core and not per ball: the two holes hold a ball independently, and one
  // counter would let a ball that merely crossed VORTEX come out of SINGULARITY
  // already released.
  private readonly coreHold: number[][] = this.cores.map(() => Array.from({ length: MAX_BALLS }, () => 0));
  // `null` until a `bonus` command sets it; see bonusSpreadAmount().
  private bonusSpreadOverride: number | null = null;

  // The test console (see DevConsole), on in dev and in any build whose
  // `testConsole` knob is up. With the knob down a production build gets `null`
  // and the module drops out of the bundle with this branch.
  private readonly devConsole: DevConsole | null =
    import.meta.env.DEV || gameConfig.rules.testConsole
      ? new DevConsole({
          // Dropped, not granted: the console freezes the field, so anything it
          // applied outright would already have happened by the time the player
          // was looking at the game again. These land at the top of the frozen
          // field and fall on the first live tick, and the paddle earns them.
          dropCapsules: (kinds) => {
            if (this.dropPool.freeSlots() < kinds.length) {
              return false;
            }
            this.dropPool.spawnAcrossTop(kinds);
            return true;
          },
          // `level N` is 1-based; rebuilding the grid serves at the new level.
          jumpToLevel: (levelNumber) => {
            this.level = levelNumber - 1;
            this.buildLevel(this.level);
          },
          setGamblePin: (kind) => {
            this.gamblePin = kind;
          },
          setBonusSpread: (amount) => {
            this.bonusSpreadOverride = amount;
            // The wall standing right now was seeded at the old rate, so re-roll
            // it: `bonus 1` has to mean every brick from the next kill on, not
            // every brick of the next level.
            this.grid.reseedCapsules(() => this.rollBrickCapsule());
          },
        })
      : null;

  // The film's hook (SHA-133): the autopilot that plays the take and the
  // read-only snapshot its storyboard asserts against, reachable as
  // `window.__shatter.demo` through the dev handle `main.ts` hangs on `window`.
  // The whole branch folds away in production, like the console's above —
  // nothing here ships.
  readonly demo: DemoHook | null = import.meta.env.DEV
    ? new DemoHook(() => ({
        screen: this.screen,
        levelNumber: this.level + 1,
        levelName: levelAt(this.level).name,
        score: this.score,
        lives: this.lives,
        ballsInPlay: this.balls.filter((ball) => ball.active).length,
        ballsStuck: this.balls.filter((ball) => ball.active && ball.stuckOffsetX !== null).length,
        capsulesFalling: this.dropPool.drops.filter((drop) => drop.active).length,
        capsulesCaught: this.capsulesCaught,
        trapsCaught: this.trapsCaught,
        paddle: {
          centerX: this.paddle.centerX,
          width: this.paddle.width,
          y: this.paddle.y,
          pointerX: this.flipped ? gameConfig.field.width - this.paddle.centerX : this.paddle.centerX,
        },
      }))
    : null;

  private readonly paddle = new Paddle();
  private readonly grid = new BrickGrid();
  private readonly timers = new PowerUpTimers();
  private readonly dropPool = new DropPool();
  // Which capsule comes next, for every draw in the run: the wall's seeds,
  // MAGNET's guarantee and RAIN's shower all take tickets out of this one bag.
  // `startRun` reshuffles it and nothing else does — a pass is meant to outlast
  // a level, and one bag per wall would be the weighted roll's drought again
  // with extra steps.
  private readonly dropBag = new DropBag();
  private readonly shotPool = new ShotPool();
  private readonly balls: Ball[] = Array.from({ length: MAX_BALLS }, () => new Ball());
  private readonly particles = new ParticleField();
  private readonly detonation = new Detonation();
  private multiTier = 0;
  private swarmLive = false;
  private clearCountdown = 0;
  private deathCountdown = 0;
  // GHOST's fade, 0 solid to 1 ghosted. It chases the timer rather than being
  // the timer: the renderer sweeps a wave across the wall as this moves, while
  // the collision stays binary on the capsule itself.
  private ghostBlend = 0;
  /**
   * ERODE's wear, 0 whole to 1 the mortar fully gone — and GHOST's exact
   * opposite in the one way that matters here.
   *
   * The fade above is a picture over a rule that switched instantly: the wall is
   * already intangible while it still looks solid. This one *is* the rule. The
   * brick's collider is cut from this number, in whole pixels, so a wall halfway
   * through wearing is a wall with half-width lanes in it and the player can see
   * exactly how much room they have.
   *
   * It is the target and not the truth, mind: each cell chases it through
   * `Erosion`, and a cell with a ball standing in it stops chasing until the
   * ball has gone.
   */
  private erodeBlend = 0;

  /**
   * GRAVEL's fault, 0 whole wall to 1 every face split.
   *
   * The **held cue**, and the only one this capsule has: for twenty-four seconds
   * every brick on the wall wears the cracks that say the next kill will
   * crumble. It is on the wall rather than in the POWER inset by the rule
   * ANGEL's wings paid for — the cue belongs on the thing the capsule changes,
   * and what this one changes is what a brick does when it dies.
   *
   * One number for the wall and no companion flag, unlike the wear above it:
   * each cell reads its own turn out of this, so running it down heals the wall
   * from the far column back with nothing else to pass over.
   */
  private gravelBlend = 0;
  /**
   * MAGNET's reach, 0 to 1 of the full 96 px either side of the deck.
   *
   * The range and not the strength, which is the whole design: the pull is at
   * full power the instant the edge takes hold of a capsule, and what grows is
   * how far out that edge is. It eases the simulation on purpose and the config
   * already says why — the magnet "biases a capsule toward the paddle without
   * ever promising it", so a ramp at each end bites only at the extreme edge,
   * on the weakest pull the effect has, exactly where it already promises
   * nothing.
   */
  private magnetBlend = 0;
  /**
   * PAYDAY's tide, 0 dull to 1 the whole wall gilded. Presentational, and the
   * one blend in the game where that is a rule and not a preference:
   * `scoreMultiplier()` reads the timer and always will, because a brick killed
   * at 0.5 paying 1.5x would make the same run score differently depending on
   * which tick landed where — and two runs that cannot be compared are not a
   * hall of fame.
   */
  private paydayBlend = 0;
  /**
   * XRAY's scan, 0 unread to 1 the whole wall read — and the odd blend of the
   * presentational set, because what moves over it is a *boundary* and not a
   * strength. A pill is whole, sliced, or not there; nothing ever fades.
   *
   * Ramping the reveal's alpha instead would be thirty pills breathing in
   * together with no direction, at a glance the same event as the fade above —
   * the only other capsule about seeing the wall differently — and it would
   * spend most of its travel below the 0.65 where a pill sinks into its own
   * brick, which is the exact range that constant exists to stay out of.
   */
  private xrayBlend = 0;
  /**
   * How far the bar has to travel this sweep, in px from the wall's top, taken
   * once as the sweep leaves its rest and held until it gets back.
   */
  private xraySweepSpan = 0;
  // DEMAKE's dissolve, 0 in colour to 1 fully demade. The capsule's timer is
  // still the truth about whether the machine is broken; this is only how far
  // along the picture and the panel are, and it is what the sound chip follows
  // too — see `stepSimulation`.
  private demakeBlend = 0;
  // BLACKOUT's iris, 0 lit to 1 fully dark. Like the two above it, presentational
  // only: the dark is already owed the moment the capsule is caught, and this
  // number decides nothing but how much of the field the light still reaches.
  private blackoutBlend = 0;
  /**
   * PORTAL's door, 0 shut to 1 cut all the way open — and the only blend in the
   * game that closes *inside* its own capsule rather than after it.
   *
   * The mouth is a hole in a wall that otherwise bounces, so the aperture has
   * to be the hitbox or a ball vanishes into a hairline crack. Driven down off
   * `!isActive("PO")` it would leave that hitbox live for twenty ticks after
   * the timer said the capsule was over, with the panel already having dropped
   * PORTAL — balls still warping through a doorway the game had stopped
   * admitting to. So the fall starts at `remaining("PO") <= portalFadeTicks`
   * and the door is pinched shut on the exact tick the timer expires.
   *
   * The cost is real and small, and all of it at the edges: the mouth opens
   * from its centre line, which is where transits actually happen, so what is
   * missing for those forty ticks is the outer 23 px of a 48 px door.
   */
  private portalBlend = 0;
  // FLIP's turn, 0 upright to 1 fully over. Presentational like the three above
  // it — the ball is played the same way up throughout, and the only thing that
  // turns with the picture is which way round the hand steering it is read.
  private flipTurn = 0;
  // TURBO's spool, 0 at true speed to 1 fully wound up. Unlike the four above
  // it this one is not presentational: the displacement scale is read off it,
  // so the balls wind up to 1.5x and back down instead of jumping. The points
  // do not ramp — a fraction of a multiplier is not a thing the player could
  // ever see — so the timer alone owns those.
  private turboSpool = 0;
  /**
   * The other three clocks on the ball, and the last of the six the balls read:
   * TEMPO's drift, RUSH's surge and STASIS's hold, each 0 absent to 1 in full.
   *
   * All three are the displacement scale rather than pictures over it, like the
   * spool above them — `ballTimeScale()` is one product of the four, so a field
   * holding several of them composes instead of arbitrating, and nothing is
   * stored on a ball that would have to be unwound when one runs out.
   *
   * STASIS's is read twice off one number: the ring closes on the blend itself
   * while the balls only brake over its second half, which is what buys the
   * coast into the freeze.
   */
  private tempoBlend = 0;
  private rushBlend = 0;
  private stasisBlend = 0;
  /**
   * GIANT's swell, 0 to 1, and the only blend in the class that is a hitbox
   * rather than a picture.
   *
   * The three above it scale a ball's clock; this one scales the ball. It is
   * spent through `ballSizeFor` onto every live ball's own `size` on the tick
   * it moves, so the sprite and the collision are read off one number and
   * cannot disagree about how big the ball is part-way through growing — which
   * is the whole reason the size lives on the ball rather than being derived
   * twice.
   */
  private giantBlend = 0;
  /**
   * HAYWIRE's fault, 0 to 1, and the size of every kick it throws.
   *
   * The odd one out among the ball capsules above: it is not a factor in
   * `ballTimeScale()` and never will be. Speed is what those four argue over,
   * and this one changes only direction — so it composes with every one of them
   * without appearing in the product, and a ball kicked during a STASIS holds
   * its new heading until the field starts again.
   */
  private haywireBlend = 0;
  /**
   * Ticks until the next kick, counted for the field rather than per ball.
   *
   * One fault in the machine, not one per ball: the whole roster's other
   * per-ball state (HOMING's lock, PORTAL's cooldown, TEMPO's debt) is per ball
   * because the *ball* is what differs, and here it is the machine. Twelve
   * balls jinking on twelve private schedules is twelve faults, which reads as
   * noise rather than as a thing that just happened.
   */
  private haywireKickIn = 0;
  // Whether this tick is a kick, decided above the ball loop and read inside
  // it. The clock has to move once per tick while the kick has to be applied
  // per ball, and those are the two halves of the same event.
  private haywireKicking = false;
  /**
   * ENGLISH's felt, 0 to 1 — the cloth on the deck, and nothing else.
   *
   * The curve itself is not on this blend and deliberately cannot be: the spin
   * is banked on the ball at the moment of contact and decays on its own, so
   * there is no global strength to fade. What the blend owns is the *surface* —
   * a deck that can put english on a ball, arriving and leaving as a sweep
   * across its own face. A ball still curving when the forty seconds run out
   * keeps curving until its spin runs out, which is the departure the capsule
   * actually has.
   */
  private englishBlend = 0;
  /**
   * How far the deck travelled over the last tick, signed, sampled once at the
   * top of the tick and read at the moment of contact.
   *
   * Not `lastPaddleX`, which is eight lines up and looks like the same number.
   * That one is sampled at the *end* of `stepPeels`, after a skid has already
   * moved the deck, precisely so a slide cannot feed itself — BANANA wants the
   * player's own last movement. ENGLISH wants everything the deck did,
   * skid included: a ball struck by a deck sliding out from under the player is
   * a ball with english on it, and pretending otherwise would be the simulation
   * lying about a shot the player is watching.
   */
  private paddleVx = 0;
  private paddleWasX: number = gameConfig.paddle.initialX;
  /**
   * HOMING's pull, 0 straight to 1 turning at the full rate — and only the
   * pull. The reticle is per ball and lives on `Ball.homingMarkTicks`, because
   * twelve balls hold twelve different bricks and a single number cannot say
   * where twelve sets of corners are.
   *
   * The two are the same idiom read at two scales: the marks show how much
   * steering a lock has earned, and this is that steering. A lock that has not
   * closed yet has no business pulling at full strength.
   */
  private homingBlend = 0;
  /**
   * GLUE's resin, in **pixels of reach** out from each half of the deck's own
   * centre — not a 0..1 blend, and that is the whole point of it.
   *
   * A blend divided by a duration would wet a 20 px SPLIT half and a 144 px
   * XWIDE deck in the same twenty ticks, which means the wide one spreading
   * seven times faster. A liquid does not know how big the thing it is spreading
   * across is. So this creeps at a fixed rate and stops when it runs out of
   * deck, and the ceiling is only how long the widest deck takes.
   */
  private glueReach = 0;
  /**
   * SPLIT's tear, 0 whole to 1 fully open — and the odd one out of the six.
   *
   * The five above it are pictures over a simulation that has already changed.
   * This one *is* the change: `splitGap()` is derived from it, and the catch
   * surface, MIRROR's ghost and a glued ball's clamp all read `splitGap()`. The
   * player watches the hole open and the hole opening are the same event.
   */
  private splitBlend = 0;
  // Ticks left of the weld spark at the seam, set on the tick the gap reaches 0
  // on the way back. The deck healing had no picture at all before — the width
  // branch simply snapped 66 back to 46 and the hole stopped existing.
  private splitWeldTicks = 0;
  /**
   * TIDE's sea, 0 dry field to 1 flooded to the waterline — and the blend on
   * this list that changes the most about the game while it is up.
   *
   * It is not a picture. It says where the deck's top edge is, which is the
   * catch surface for balls, capsules and gravel alike; it says which balls are
   * under water and are therefore being pushed back out of it; and it says how
   * fast a capsule is falling. Three hitboxes off one number, which is why the
   * drain is spent out of the capsule's own sixteen seconds rather than after them
   * — PORTAL's rule, and this blend needs it harder than PORTAL's door did.
   *
   * The deck is never *moved* by the capsule. The water is raised and the deck
   * takes the higher of the rail and its own float line, so the lift is caused
   * on screen rather than applied: the sea climbs an empty field for six ticks,
   * then takes the deck off the rail and carries it up the remaining 96 px over
   * the other thirty-four.
   */
  private tideBlend = 0;
  /**
   * The swell's clock, counting only while there is water to swell.
   *
   * Its own counter and not the frame count, for the reason every other
   * simulation number here is: the deck's y is a catch surface, and a surface
   * that rode the renderer's clock would move on a frame the simulation never
   * stepped. It is read by the deck's bob and by the capsules floating in it,
   * so one sea heaves them both.
   */
  private tidePhase = 0;
  // What the deck is still shedding once it is back on the rail, 1 on the frame
  // the water finishes draining down to 0 twelve ticks later. Render-only and
  // already spent — the sea has gone, and this is the deck dripping after it.
  private tideDrip = 0;
  /**
   * MIRROR's reflection, 0 absent to 1 fully resolved onto the ceiling.
   *
   * The second blend on this list that eases the simulation rather than a
   * picture over it: the ghost's span is read off this, and the span is what
   * returns the ball. A reflection that bounced off a surface wider than the one
   * drawn would be the capsule lying at the one end of the field the player is
   * not watching.
   */
  private mirrorForm = 0;
  // Ticks left of the line the reflection leaves behind it. It returns nothing —
  // that is what makes it an after-image and not a surface — and it is the only
  // thing on screen explaining the ball that just went straight through.
  private mirrorAfterImageTicks = 0;
  /**
   * LASER's cannons coming out of the deck, 0 bare to 1 locked out.
   *
   * Presentational, unlike the two above it: it is a pixel height and a colour,
   * and nothing reads it but `drawPaddle`. It runs over
   * `laserFirstShotDelayTicks` rather than a duration of its own, because the
   * whole justification for that number is the pause before the first shot —
   * and a second constant equal to it by comment would be free to drift.
   */
  private laserBlend = 0;
  /**
   * BOMB's break, 1 on the frame the deck goes up and 0 twelve ticks later.
   *
   * Not the shards — those are per-piece state and live in the list below. This
   * is only what genuinely is a curve: the whiteout on the catch frame, how much
   * of each piece is left to draw, and how fast BLACKOUT's deck torch dies, so
   * the light the player was steering by goes out with the deck instead of
   * switching off under them.
   *
   * Forced to 0 whenever there is no fuse burning, and that is the whole guard:
   * `die()` goes straight to `resetServe`, which draws a fresh 46 px deck, and a
   * break blend still ramping down there would visibly reassemble a paddle out
   * of three pieces on the serve screen.
   */
  private paddleBreak = 0;
  private paddleShards: PaddleShard[] = [];
  // Armed by a MAGNET catch, spent by the next brick a ball or a laser kills.
  // A magnet with nothing falling is a magnet nobody can see working.
  private guaranteedDrop = false;
  private laserCountdown = 0;

  // Which way round the mouse is read. The picture turns continuously; the
  // mapping cannot — at a quarter turn the field is on its side and there is no
  // left or right to lend the hand — so it changes over at the halfway point,
  // which is the frame the player watches the field pass through vertical.
  private get flipped(): boolean {
    return this.flipTurn >= 0.5;
  }

  private readonly input: InputController;
  private lastTime = 0;
  private accumulator = 0;
  private animationFrameId: number | null = null;
  private entryCommitTimeoutId: number | null = null;

  constructor(private readonly deps: ShatterGameDeps) {
    this.input = new InputController(deps.lockTarget, deps.scaler, {
      onPointerMoveTo: (stageX) => this.pointToStage(stageX),
      // Under pointer lock the mouse names a movement, not a place: a skid drops
      // the deltas it arrives with and nothing is owed afterwards — there is no
      // absolute position for the deck to be out of step with.
      onPointerMoveBy: (deltaX) => {
        if (this.skidTicksLeft === 0) {
          // FLIP: the deck is drawn upside down, so a hand moving right has to
          // move the sim's paddle left for the one on screen to follow it.
          this.paddle.moveByDelta(this.flipped ? -deltaX : deltaX);
        }
      },
      onAdvance: () => this.advanceGated(),
      onKeyDown: (event) => this.onKeyDown(event),
      onInputLost: () => this.onInputLost(),
    });
  }

  start(): void {
    this.deps.scaler.fit();
    this.input.attach();
    this.deps.hiScores.onChange = () => this.onScoresChanged();
    this.deps.hiScores.sync();
    this.grid.load(wallFor(0), () => this.rollBrickCapsule());
    this.resetServe();
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.frame);
  }

  // A remote score sync can land on any screen; refresh whichever one shows the table.
  private onScoresChanged(): void {
    if (this.screen === "title") {
      const top = this.deps.hiScores.top;
      this.deps.screens.updateTitle(zeroPad(Math.max(top.score, this.score), 6), top.name);
    }
    if (this.screen === "scores" || this.screen === "entry") {
      this.refreshScoreRows();
    }
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.input.detach();
  }

  private readonly frame = (now: number): void => {
    this.animationFrameId = requestAnimationFrame(this.frame);

    const delta = Math.min(gameConfig.loop.maxFrameDeltaMs, now - this.lastTime);
    this.lastTime = now;
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= gameConfig.loop.tickMs && steps++ < gameConfig.loop.maxCatchUpSteps) {
      this.stepSimulation();
      this.accumulator -= gameConfig.loop.tickMs;
    }

    const mouth = this.portalMouth();
    this.deps.renderer.draw({
      background: levelAt(this.level).background,
      backgroundVariant: levelIndexOf(this.level),
      grid: this.grid.rows,
      paddle: {
        x: this.paddle.x,
        // The deck's own top edge, off the deck rather than off the config: the
        // sprite, the cannons, the wings, the reel and the tethers all hang off
        // this one number, so nothing on screen can be drawn at a height the
        // ball is not caught at.
        y: this.paddle.y,
        width: this.paddle.width,
        laserBlend: this.laserBlend,
        splitGap: this.splitGap(),
        splitCrack: this.splitCracking(),
        splitWeld: this.splitWeldTicks > 0,
        // Only while the caps are actually travelling: the deck wears pink ends
        // for the eight ticks JAMMER is shutting it, not for the six seconds it
        // stays shut.
        capsJammed: this.widthEaseKind === "J" && this.paddle.easingWidth,
        glueReach: this.glueReach,
        english: this.englishBlend,
        // PYRE's wash, on the deck's own record beside the resin and the felt
        // and for their reason: the deck is what paints it, and MIRROR's ghost
        // gets it through the same record — a reflection of a burning deck is a
        // burning deck.
        ember: this.pyreBlend,
      },
      mirrorForm: this.mirrorForm,
      mirrorAfterImage: this.mirrorAfterImageTicks / gameConfig.effects.mirrorAfterImageTicks,
      // The reach in pixels, not a flag: the band the pull actually has this
      // frame is the band the tethers are cut to and the marks are drawn at.
      magnetReach: this.magnetReach(),
      // The two numbers and not the blend: the mouth the renderer paints has to
      // be the mouth a ball is let through, by construction rather than by two
      // formulas agreeing.
      portalMouthTop: mouth.top,
      portalMouthHeight: mouth.height,
      // The scan's boundary and the scan's clock. The bar itself is only drawn
      // while the blend is between its ends, so no line sits on the wall for
      // the 260 ticks in the middle.
      xrayBlend: this.xrayBlend,
      xrayBeamY: this.xrayBeamY(),
      xrayReading: this.timers.isActive("XR"),
      demakeBlend: this.demakeBlend,
      ghostBlend: this.ghostBlend,
      // The wear itself goes over as the object, the way the quake and the
      // critter do: the renderer needs the inset of the cell it is painting, and
      // the whole point of that number being per-cell is that no single one
      // stands for the wall.
      erosion: this.erosion,
      // The two numbers the trickle needs, which the wear cannot say. The first
      // is how heavy it is; the second is which way it runs — grains fall out of
      // the seams while the mortar is going and are drawn back up into them
      // while it sets, and one frame of a symmetric blend looks the same either
      // way. Read off the timer and not the blend, so the trickle turns round on
      // the tick the capsule ends rather than a tick later.
      erodeBlend: this.erodeBlend,
      erodeSetting: !this.timers.isActive("ER"),
      // The sheet itself, the way the wear above it goes over: the renderer
      // needs the hang and the load of the cell it is painting, and the whole
      // point of both being per-cell is that no single number stands for the
      // wall.
      // Two fields where the wall has one, and each says one thing. `offsets` is
      // the geometry — where every brick actually is, JELLY's ripple and
      // SLUMP's fall added — and is the same object the hitbox reads. `jelly`
      // is the load on the bricks' faces, which is one capsule's alone.
      offsets: this.wallOffsets,
      jelly: this.sheet,
      slump: this.slump,
      fence: this.fence,
      shadows: this.shadows,
      // The echo field itself, the way the sheet above it goes over: the
      // renderer needs the rect every echo is standing in this frame and the
      // effect has just built exactly that list for the collision test. One
      // walk of the wall a tick, read twice.
      superpose: this.superposition,
      // And the fog, for the echoes' reason exactly: it already holds how out
      // of focus every cell is, and the renderer reads that rather than
      // re-deriving a picture the collision has an opinion about.
      fog: this.decoherence,
      // And the couples, for the echoes' reason exactly: the effect has already
      // walked the wall this tick to place every thread, and the renderer reads
      // that list rather than asking the wall the same question twice.
      twin: this.entanglement,
      // One number, and the pips it is about. The fault says which bricks will
      // crumble and the pool says which ones already did — the capsule's state
      // and its history, the way SNAP's lattice and its marks are two fields.
      gravelBlend: this.gravelBlend,
      pips: this.gravel.pips,
      paydayFront: this.paydayFront(),
      // The two freezes light the field by definition: a nuke is the brightest
      // thing the game does, and the last brick's shatter has to be seen. Both
      // stop the timers as well, so the ticks the dark still owes survive it —
      // and the iris, frozen at whatever it had reached, closes the rest of the
      // way once the field is the player's again.
      blackoutBlend: this.detonation.active || this.clearCountdown > 0 ? 0 : this.blackoutBlend,
      // Not gated on the two freezes the way the dark is: a shockwave sweeping
      // an upside-down field is the joke landing twice, and neither freeze runs
      // the timers, so the turn cannot come undone behind one either.
      flipTurn: this.flipTurn,
      angelArmed: this.angelCharged,
      gambleFace: this.gambleFace,
      paddleHidden: this.deathCountdown > 0,
      paddleBreak: this.paddleBreak,
      paddleShards: this.paddleShards,
      bumpers: this.bumpers.discs,
      peels: this.peels,
      railMarks: this.railMarks,
      balls: this.balls,
      ballTrail: this.ballTrail(),
      // The blend and not the timer, so the tones do not swap out from under a
      // streak that is still retracting: RUSH keeps the smear all the way back
      // into the sprite, and a TURBO underneath it only gets the cold one once
      // the trap's own picture is finished.
      turboTrail: this.rushBlend === 0,
      // TEMPO's pace ghost, as the scale on every ball's banked debt. One
      // number for the field and the debt per ball, because the debt is the
      // ball's own history and the blend is the capsule's.
      tempoGhost: this.tempoBlend,
      // HAYWIRE's fault, as the size of the crackle rather than as a flag: the
      // static thickens as the kicks grow and thins as they shrink, so what the
      // ball is wearing is what is being done to it.
      haywire: this.haywireBlend,
      // STASIS's ring closing on the balls — one way, deliberately. Read
      // symmetrically it would paint the same ring growing back out on the
      // departure, on top of the one `popStasisRings` has already pinned where
      // each ball hung: two concentric expanding rings per ball for twelve
      // ticks. The release is the pool's alone and is left exactly as it was.
      stasisClosing: this.timers.isActive("I") ? this.stasisBlend : 0,
      // Which way every reticle is travelling. Global because the capsule is:
      // how far each set of corners has got is the ball's own counter, but they
      // all close on the catch and all open on the expiry.
      homingOpening: !this.timers.isActive("H"),
      // The lattice under everything, and the marks over it. Two fields because
      // they are two different kinds of thing: the grid is the capsule's state
      // and the marks are its history.
      snapGrid: this.snapBlend,
      snapMarks: this.snapMarks,
      // TRACER, as the strength and the threads themselves. Two fields for the
      // reason SNAP has two: the blend is the capsule's state and the threads
      // are this frame's claim, and only one of them is allowed to be stale.
      tracerBlend: this.tracerBlend,
      tracerThreads: this.tracerThreads,
      // Off the timer rather than off the blend, the way `homingOpening` is: the
      // timer is live exactly while the guide is arriving, and the blend spends
      // its half second winding down after it has gone.
      tracerArriving: this.timers.isActive("TR"),
      // PYRE's craters. The crowns are not here: they ride `Ball.pyreCrown` and
      // the renderer reads them off the balls it is already drawing.
      pyreBlasts: this.pyreBlasts,
      drops: this.dropPool.drops,
      shots: this.shotPool.shots,
      flashes: this.brickFlashes,
      pops: this.catchPops,
      stasisRings: this.stasisRings,
      bolts: this.bolts,
      particles: this.particles.particles,
      meteors: this.meteors.meteors,
      detonation: this.detonation,
      cores: this.cores,
      quake: this.quake,
      critter: this.critter,
      energyWallBlend: this.wallBlend,
      energyWallOriginX: this.wallOriginX,
      energyWallStrike: this.wallStrikeLeft > 0,
      // TIDE, as the three things the renderer cannot work out for itself: how
      // much sea there is, where its surface is, and how far through the swell
      // it has got. The surface is passed rather than re-derived from the blend
      // for the reason PORTAL's mouth is — the water a capsule sinks in and the
      // water the player can see have to be one line by construction.
      tideBlend: this.tideBlend,
      tideWaterline: this.waterline(),
      tidePhase: this.tidePhase,
      // Which way it is going, which the blend cannot say: a sea half in looks
      // the same as a sea half out, and only one of the two has a plughole in
      // the bottom of it.
      tideDraining: this.tideBlend > 0 && !this.tideFlooding(),
      tideDrip: this.tideDrip,
    });
    this.deps.panel.update(this.panelView());
  };

  private stepSimulation(): void {
    if (this.screen !== "play" && this.screen !== "serve") {
      return;
    }
    if (this.screen === "serve") {
      this.balls[0].followPaddle(this.paddle);
      return;
    }
    // An open console freezes the run exactly like the pause screen: a command
    // is typed one key at a time and may not land in a field still moving.
    if (this.devConsole?.isOpen) {
      return;
    }

    // Belt over the pointer-lock gate: however "play" was reached, it may not
    // keep running unlocked while this setup is expected to lock. Any leak
    // lands on the pause screen instead of playing with a free, hidden cursor.
    if (!this.input.isLocked && this.input.lockExpected) {
      this.setScreen("pause");
      return;
    }

    // The film's autopilot (SHA-133) moves the deck here, where a mouse move
    // arriving just before the tick would have left it: above the `paddleVx`
    // reading below, so the skid and the english see a hand, not a jump.
    const steered = this.demo === null ? null : this.demo.steer(this.balls, this.dropPool.drops, this.paddle);
    if (steered !== null) {
      this.steerTo(steered);
    }

    this.brickFlashes = this.brickFlashes.filter((flash) => --flash.ticksLeft > 0);
    this.stasisRings = this.stasisRings.filter((ring) => --ring.ticksLeft > 0);
    this.bolts = this.bolts.filter((bolt) => --bolt.ticksLeft > 0);
    // Pops animate above the freeze returns below, so the catch that started a
    // NUKE (or ended the level) still gets its acknowledgment on screen.
    for (const pop of this.catchPops) {
      pop.y -= gameConfig.powerUps.catchPopRiseSpeed;
    }
    this.catchPops = this.catchPops.filter((pop) => --pop.ticksLeft > 0);
    // Above the freeze gates for the same reason the pops are, and with one of
    // its own: two capsules can be caught in a single `DropPool.step` pass, so
    // a BANANA and a NUKE landing on the same tick would otherwise hang a peel
    // in mid-arc behind the shockwave for the whole detonation. It counts one
    // past the end and stops there — 0 is the tick the peel lands and squashes
    // on, below 0 it is at rest and the count is done with.
    for (const peel of this.peels) {
      if (peel.flightTicksLeft >= 0) {
        peel.flightTicksLeft--;
      }
    }
    // Read before the width moves, because the width is one of the two things
    // that can close SPLIT's hole: a JAMMER caught over a live SPLIT shuts the
    // deck until there is no room left for a gap, and the halves meet on a tick
    // the blend had nothing to do with. Sampling after `stepDeckWidth` misses
    // exactly that weld — the only one the player has not already been told
    // about by a timer running out.
    const gapBefore = this.splitGap();
    // Above the gates with the readings around it, and above `stepPeels` for a
    // reason of its own: the skid moves the deck later in this same tick, and
    // sampling after it would count that displacement twice.
    this.paddleVx = this.paddle.x - this.paddleWasX;
    this.paddleWasX = this.paddle.x;
    // Above the gates with the peel's flight and for the same reason: a deck
    // caught halfway out from under a shockwave would hold there for the whole
    // detonation, and the drawn deck is the catch surface.
    this.stepDeckWidth();
    // The sea, beside the width it sits next to and for exactly its reason: this
    // is the other half of where the deck is, and a deck frozen halfway out of
    // the water behind a shockwave would hold there for the whole detonation.
    this.stepTide();
    this.railMarks = this.railMarks.filter((mark) => --mark.ticksLeft > 0);
    this.particles.step(this.cores);
    this.quake.step();
    // Moved up out of the tick body: a NUKE catching the rack mid-arrival is
    // exactly the case this rule exists for, and a disc frozen halfway in is a
    // ring hanging over a spot nothing will ever land on.
    this.bumpers.step();
    // The lattice, above the gates with every other picture: a grid frozen half
    // dithered behind a shockwave is graph paper with holes in it.
    this.snapBlend = stepBlend(this.snapBlend, this.timers.isActive("SN"), gameConfig.effects.snapGridTicks);
    // The guide's strength, above the gates with every other picture: a thread
    // caught half drawn behind a shockwave is a line that stops in mid-air.
    this.tracerBlend = stepBlend(this.tracerBlend, this.timers.isActive("TR"), gameConfig.effects.tracerFadeTicks);
    // The fault, above the gates with every other picture: this one changes
    // nothing but the face of the bricks, and a wall frozen with the crack
    // halfway along it is a wall someone stopped drawing.
    this.gravelBlend = stepBlend(this.gravelBlend, this.timers.isActive("GR"), gameConfig.effects.gravelCrackTicks);
    // Beside the brick flashes at the top of the tick and for their reason: the
    // marks are a record of something that already happened, and a bracket held
    // still behind a detonation is pointing at a ball that has long gone.
    this.snapMarks = this.snapMarks.filter((mark) => --mark.ticksLeft > 0);
    // The wash and the crowns, above the gates with every other picture: a fire
    // frozen halfway over the deck behind a shockwave is a deck someone spilled
    // paint on. The crowns follow it in the same call, because which ball is the
    // reserve is a fact about where the balls are right now.
    this.pyreBlend = stepBlend(this.pyreBlend, this.timers.isActive("PY"), gameConfig.effects.pyreEmberTicks);
    this.stepPyreCrowns();
    // Beside the snap marks and for their reason: a crater is a record of
    // something that already happened, and a shockwave held still behind a
    // freeze is a ring around bricks that have been gone for a second.
    this.pyreBlasts = this.pyreBlasts.filter((blast) => --blast.ticksLeft > 0);
    // One number, read by the hitbox and by everything painted in wall
    // coordinates. Assigned here rather than in `Quake` so the grid keeps
    // knowing nothing about the capsule that moved it — and above the freeze
    // gates with the step that produces it, or a NUKE caught on the same tick
    // would hold the wall in mid-air for the length of the shockwave.
    this.grid.topOffset = this.quake.dropOffset;
    // Above the freeze gates like the shake: a NUKE caught mid-fade must not
    // hold the wall half-dissolved on screen.
    this.ghostBlend = stepBlend(this.ghostBlend, this.timers.isActive("GH"), gameConfig.effects.ghostFadeTicks);
    // Above the gates with the rest: a reach frozen halfway out is a band the
    // player cannot read the edges of.
    this.magnetBlend = stepBlend(this.magnetBlend, this.timers.isActive("K"), gameConfig.powerUps.magnet.reachTicks);
    // Beside it and for its reason exactly: a NUKE caught mid-tide must not hold
    // the wall half-gilded behind the shockwave.
    this.paydayBlend = stepBlend(this.paydayBlend, this.timers.isActive("X"), gameConfig.effects.paydayFadeTicks);
    // Beside the fade above it and above the gates with it, though for the
    // weakest of the six reasons: XRAY says nothing about light, speed or
    // collision, so this is passed raw. It is here because a bar parked
    // halfway down the wall for the length of a shockwave stops reading as a
    // scan and starts reading as a scratch on the glass.
    const xrayWas = this.xrayBlend;
    this.xrayBlend = stepBlend(this.xrayBlend, this.timers.isActive("XR"), gameConfig.effects.xrayFadeTicks);
    // Sampled once as each sweep leaves its rest, and held. Normalised to the
    // level's row count instead, a wall with one row left would be read in
    // three ticks and the bar would crawl the other seventeen through empty
    // space — the transition degrading back into a switch exactly when the
    // wall is thinnest. Bricks also die mid-sweep, and recomputing per frame
    // would jump the bar every time the deepest row lost its last one.
    if ((xrayWas === 0 && this.xrayBlend > 0) || (xrayWas === 1 && this.xrayBlend < 1)) {
      this.xraySweepSpan = this.xrayWallSpan();
    }
    // Above the freeze gates for the same reason the fade above it is: a NUKE
    // caught mid-dissolve must not hold the machine half-broken on screen.
    this.demakeBlend = stepBlend(this.demakeBlend, this.timers.isActive("D"), gameConfig.effects.demakeFadeTicks);
    // The chip cannot dissolve — a square is a square — so it gives out as the
    // picture passes halfway, which reads as one machine failing rather than
    // as a sound effect fired alongside a visual one.
    this.deps.sfx.setDemake(this.demakeBlend >= 0.5);
    // Above the freeze gates with the rest: a NUKE caught halfway through the
    // iris must not leave the light frozen mid-collapse behind the shockwave.
    this.blackoutBlend = stepBlend(
      this.blackoutBlend,
      this.timers.isActive("BK"),
      gameConfig.effects.blackoutFadeTicks,
    );
    // Above the gates with the rest: a door caught halfway by a shockwave is a
    // hitbox frozen halfway, and this one is the only blend that is one.
    const doorWas = this.portalBlend;
    this.portalBlend = stepBlend(
      this.portalBlend,
      // Both halves of the test. The second is what spends the closing ticks
      // out of the capsule's own eighteen hundred instead of borrowing twenty
      // it does not own, and the blends step above `timers.tick()`, so the
      // last fall lands on the same frame the timer reaches zero.
      this.timers.isActive("PO") && this.timers.remaining("PO") > gameConfig.effects.portalFadeTicks,
      gameConfig.effects.portalFadeTicks,
    );
    // Fired on the frame each cut starts rather than on the catch and the
    // expiry, so the sound is the door and not the capsule: a PORTAL taken over
    // a live one moves nothing and says nothing.
    if (doorWas === 0 && this.portalBlend > 0) {
      this.deps.sfx.portalOpen();
    } else if (doorWas === 1 && this.portalBlend < 1) {
      this.deps.sfx.portalShut();
    }
    // Not `stepBlend`: the two ends have different lengths on purpose, since
    // writing a barrier out of the deck is deliberate and spending it is not.
    // Above the gates with the rest all the same — a bar frozen half-written
    // behind a shockwave is a save the player cannot read the extent of.
    this.wallBlend = this.wallArmed
      ? Math.min(1, this.wallBlend + 1 / gameConfig.effects.wallChargeTicks)
      : Math.max(0, this.wallBlend - 1 / gameConfig.effects.wallDischargeTicks);
    if (this.wallStrikeLeft > 0) {
      this.wallStrikeLeft--;
    }
    // Above the freeze gates with the rest, and for the starkest reason of the
    // four: a NUKE caught mid-turn would otherwise park the field on its side
    // for the length of the sweep.
    this.flipTurn = stepBlend(this.flipTurn, this.timers.isActive("F"), gameConfig.effects.flipTurnTicks);
    // Above the freeze gates like the four before it, and with one more reason:
    // a ball frozen behind a shockwave may not come out of it at a speed the
    // spool has not reached.
    this.turboSpool = stepBlend(this.turboSpool, this.timers.isActive("TU"), gameConfig.effects.turboSpoolTicks);
    // The spool's three siblings, above the gates for its reason exactly: a ball
    // frozen behind a shockwave may not come out of it on a clock the blends
    // have not reached. TEMPO's debt is cleared here rather than per ball, so a
    // marker cannot outlive the blend that scales it.
    this.tempoBlend = stepBlend(this.tempoBlend, this.timers.isActive("T"), gameConfig.effects.tempoDriftTicks);
    if (this.tempoBlend === 0) {
      for (const ball of this.balls) {
        ball.tempoDebt = 0;
      }
    }
    this.rushBlend = stepBlend(this.rushBlend, this.timers.isActive("RU"), gameConfig.effects.rushSurgeTicks);
    // Above the gates with the four clocks it sits beside, and for their reason
    // exactly: a ball frozen behind a shockwave may not come out of it under a
    // fault the blend has not reached. The kick clock below is gated instead —
    // see `stepHaywire`.
    this.haywireBlend = stepBlend(this.haywireBlend, this.timers.isActive("HA"), gameConfig.effects.haywireFrayTicks);
    // Above the gates with the rest, and with the plainest reason of any of
    // them: this one is only a picture. A deck frozen with the cloth half laid
    // across it behind a shockwave is a surface caught mid-arrival, and the
    // sweep is the only thing that says which way it was going.
    this.englishBlend = stepBlend(this.englishBlend, this.timers.isActive("EN"), gameConfig.effects.englishFeltTicks);
    // STASIS's arrival read off the ring it already ships: `stasisRingLifeTicks`
    // is what the release ring expands over, so closing on the same count is
    // that ring run backwards. Any other number would give the capsule two ring
    // speeds — one for stopping the field and one for letting it go.
    this.stasisBlend = stepBlend(this.stasisBlend, this.timers.isActive("I"), gameConfig.powerUps.stasisRingLifeTicks);
    // Above the gates with the four clocks above it, and with a reason of its
    // own on top of theirs: this blend is a hitbox. A ball held mid-swell
    // behind a shockwave would be a ball whose collision box the player cannot
    // predict, which is worse than any of the pictures the others would freeze.
    this.giantBlend = stepBlend(this.giantBlend, this.timers.isActive("GI"), gameConfig.effects.giantFadeTicks);
    this.resizeBalls();
    // Above the gates with the rest, and the only one of them that is two
    // things: a global ease on the turn rate, and twelve independent reticles.
    this.stepHomingMarks();
    this.stepGlueResin();
    // Above the freeze gates like the five before it, and for a reason none of
    // them has: this blend is the catch surface. A deck frozen half-torn behind
    // a shockwave would hold a half-open hole over the drops the detonation is
    // still letting fall.
    //
    // It chases the timer rather than being driven by the catch, which is what
    // makes the swap cases free: a WIDE taken over a live SPLIT calls
    // `timers.deactivate("SP")` and never appears in `expired` at all, and the
    // halves still come back together on their own.
    if (this.splitWeldTicks > 0) {
      this.splitWeldTicks--;
    }
    this.splitBlend = stepBlend(this.splitBlend, this.timers.isActive("SP"), gameConfig.effects.splitTearTicks);
    if (gapBefore > 0 && this.splitGap() === 0) {
      this.splitWeldTicks = gameConfig.effects.splitWeldFlashTicks;
      this.deps.sfx.deckWeld();
    }
    // Above the freeze gates with the rest, and with SPLIT's reason: this one is
    // a surface. A NUKE caught while the reflection is resolving would park a
    // half-formed ceiling over the field for the length of the shockwave, and it
    // would still be bouncing at whatever width it froze on.
    // Above the gates like the rest — though BOMB's fuse is a freeze of its own
    // and this is the one effect that plays *during* one. The pieces fall while
    // everything else is held still, which is the whole of what the fuse buys.
    this.paddleBreak =
      this.deathCountdown > 0 ? stepBlend(this.paddleBreak, false, gameConfig.effects.paddleBlast.breakTicks) : 0;
    if (this.paddleBreak === 0) {
      this.paddleShards = [];
    }
    for (const shard of this.paddleShards) {
      shard.x += shard.vx;
      shard.y += shard.vy;
      shard.vy += gameConfig.effects.particleGravity;
    }
    // Above the gates with the rest, and the only one up here that changes
    // nothing but a picture: the guns are still the timer's, and a bolt already
    // climbing the field is drawn and stepped unconditionally, so they stow at
    // expiry with the last shot still in the air.
    this.laserBlend = stepBlend(
      this.laserBlend,
      this.timers.isActive("L"),
      gameConfig.powerUps.laserFirstShotDelayTicks,
    );
    if (this.mirrorAfterImageTicks > 0) {
      this.mirrorAfterImageTicks--;
    }
    const wasReflecting = this.mirrorForm > 0;
    this.mirrorForm = stepBlend(this.mirrorForm, this.timers.isActive("Y"), gameConfig.effects.mirrorFormTicks);
    if (wasReflecting && this.mirrorForm === 0) {
      this.mirrorAfterImageTicks = gameConfig.effects.mirrorAfterImageTicks;
    }

    // A pending level clear freezes the rest of the simulation so the final
    // brick's shatter can play out — no ball can be lost, no capsule caught,
    // no timer expiring behind the effect.
    // A NUKE detonation freezes the rest of the simulation the same way while
    // its shockwave sweeps the field and its debris falls.
    if (this.detonation.active) {
      this.stepDetonation();
      return;
    }
    if (this.clearCountdown > 0) {
      if (--this.clearCountdown === 0) {
        this.onLevelCleared();
      }
      return;
    }
    // BOMB's fuse, and the same freeze: the paddle is in pieces, so nothing may
    // be bounced, caught or drained while they are still in the air. Below the
    // clear gate on purpose — a pending clear already refuses catches, so a
    // bomb can never be taken after the last brick has gone.
    if (this.deathCountdown > 0) {
      if (--this.deathCountdown === 0) {
        this.die();
      }
      return;
    }

    // OVERTIME holds PAYDAY's clock for the length of TEMPO's. Read off last
    // tick's table on purpose: a combo is a fact about two timers, and asking
    // before they move would need the answer before the question.
    const expired = this.timers.tick(this.hasCombo("OVERTIME") ? OVERTIME_FROZEN : undefined);
    // Below both freeze gates with the timers it reads: nothing may fuse or
    // come apart behind a shockwave or a pending clear.
    this.refreshCombos();
    // Beside the timers and below both freeze gates: the reel is a countdown
    // like theirs, and a NUKE sweep must not resolve one behind its shockwave.
    this.stepGamble();
    this.stepPeels();
    // Below both freeze gates, unlike the blend above it: a shockwave or a
    // pending clear holds the field still, and a fault that kept counting
    // behind one would spend its kicks on balls nobody can see move — then let
    // several land at once on the frame the field comes back.
    this.stepHaywire();
    // Below the gates, unlike the blend above: the threads are a claim about
    // where balls are going, and balls behind a shockwave are not going
    // anywhere. Re-walking them there would redraw the same picture at some
    // cost; leaving them is the frozen field's own answer, held with the balls.
    this.stepTracer();
    /**
     * The mortar, and the one of the roster's blends stepped **below** the
     * freeze gates rather than above them.
     *
     * Every other one is a picture, so a shockwave holding it still costs
     * nothing but a frozen frame. This one is the wall's own hitbox. A
     * detonation takes the wall apart from the top while it runs, and a wall
     * growing back underneath it is a wall changing shape twice at once —
     * worse, the freeze parks the balls too, so a cell would be held open by a
     * ball that cannot leave it, which is the hold doing the opposite of its
     * job. Frozen, the wear keeps whatever it had reached and takes up again on
     * the tick the field is the player's again.
     *
     * Under `grid.topOffset` as well, which is set above the gates: a cell's
     * hold is tested where the wall is being *painted*, and QUAKE's is still on
     * its way down.
     */
    this.erodeBlend = stepBlend(this.erodeBlend, this.timers.isActive("ER"), gameConfig.effects.erodeTicks);
    this.erosion.follow(this.erodeBlend, this.balls, this.grid.topOffset);
    /**
     * The sheet, beside the mortar and below the freeze gates for its reason
     * exactly: this is the wall's own hitbox and not a picture of it, and a
     * detonation taking the wall apart from the top while ninety-six bricks
     * swing underneath is the wall changing shape twice at once. Frozen, the
     * wave keeps whatever it had reached and takes up again on the tick the
     * field is the player's again.
     *
     * The settle is armed off the timer's own remaining ticks rather than off
     * the expiry, and that is the whole reason `PowerUpTimers.remaining` is not
     * only PIERCE's: a sheet told to stop on the tick it stops being a sheet
     * would snap a wall full of hanging bricks back into line in one frame. It
     * has to be still *before* the capsule ends, so the setting runs inside the
     * last of the twenty seconds rather than after them.
     */
    if (this.timers.remaining("JE") > 0 && this.timers.remaining("JE") <= gameConfig.effects.jellySettleTicks) {
      this.sheet.settle();
    }
    this.sheet.step(this.balls, this.grid.topOffset);
    this.tearStrainedBricks();
    /**
     * SLUMP's gravity, beside the sheet above it and below the freeze gates for
     * its reason exactly: this is the wall's own hitbox and not a picture of
     * it. The settle is armed off the timer's remaining ticks rather than off
     * the expiry, again for the sheet's reason — a wall told to stop falling on
     * the tick it stops being a slump would leave bricks in mid-air.
     *
     * Gravity runs every tick it is on, not only at the catch: the capsule's
     * whole second half is that every brick the player kills drops the column
     * above it onto the gap, so the wall goes on eating itself downward for the
     * rest of the sixteen seconds.
     */
    if (this.timers.remaining("SL") > 0 && this.timers.remaining("SL") <= gameConfig.effects.slumpSetTicks) {
      this.slump.settle();
    }
    this.landings.length = 0;
    this.slump.step(this.grid, this.landings);
    this.settleLandings();
    /**
     * FENCE's posts, beside the three wall effects above it and below the
     * freeze gates for their reason: these are surfaces the ball is collided
     * against, not a picture of them. Nothing here reads the wall — the fence
     * is planted in the empty band over the deck and never touches it.
     *
     * The extraction is armed off the timer's remaining ticks, the way the
     * sheet's settle and the slump's mortar are, and for a reason of its own on
     * top of theirs: the pull is exactly as long as `fenceReleaseTicks`, so the
     * last post bursts on the tick the capsule ends rather than leaving a fence
     * standing after its timer has gone.
     */
    if (this.timers.remaining("FE") > 0 && this.timers.remaining("FE") <= gameConfig.effects.fenceReleaseTicks) {
      this.fence.release();
    }
    this.fenceSeated.length = 0;
    this.fencePulled.length = 0;
    this.fence.step(this.fenceSeated, this.fencePulled);
    this.settlePosts();
    /**
     * UMBRA's sun, and the twelve wedges it throws.
     *
     * Last of the four wall effects and deliberately so: it reads where every
     * brick is standing *after* QUAKE's drop, the sheet's ripple and the slump's
     * fall have all had their say this tick, so a shadow always hangs off the
     * brick as painted rather than off the brick as indexed. It writes nothing
     * back — the wall does not know it is casting anything.
     *
     * Below the freeze gates with them, and for their reason: this is a hitbox
     * and not a picture of one. A detonation holding the field still holds the
     * sun still too, so the twenty seconds a player caught are twenty seconds they
     * get to use.
     *
     * `paddle.y` and not `gameConfig.paddle.y`: the deck floats under TIDE, and
     * the one invariant this capsule may not break is that a shadow never
     * reaches it.
     */
    if (this.timers.remaining("UM") === gameConfig.powerUps.umbra.setTicks) {
      this.deps.sfx.umbraSet();
    }
    this.shadows.step(this.grid, this.paddle.y);
    // The echoes starting for home, scored where the sunset above it is: the
    // twelve ticks they take to travel are what the sound is over, so the wall
    // is whole again on the tick the room goes quiet.
    if (this.timers.remaining("SU") === gameConfig.powerUps.superpose.mergeTicks) {
      this.deps.sfx.superposeMerge();
    }
    // The wall coming back, scored over the fifteen ticks it takes rather than
    // announced when the timer notices — the sunset's rule, two capsules up.
    if (this.timers.remaining("CO") === gameConfig.powerUps.collapse.condenseTicks) {
      this.deps.sfx.collapseCondense();
    }
    // SUPERPOSE's echoes, beside the shadows and below the same gates for the
    // same reason: an echo is a hitbox. It is stepped after them and after the
    // wall has settled, so the rect an echo is placed at this tick is taken off
    // a brick that has already finished moving.
    this.superposition.step(this.grid);
    // COLLAPSE's fog, stepped after the balls have been moved and below the
    // same gates: the exit test asks where every ball finished this tick, so it
    // has to run once the tick's movement is over. A cell is condensed by the
    // ball having *left* it, which is a fact about the end of a tick and not
    // about any one sub-step inside it.
    this.decoherence.step(this.grid, this.balls);
    // The threads going slack, scored where the sunset and the merge above are
    // and for their reason: the twenty ticks they take to fall are what the
    // sound is over, so the field is bare on the tick the room goes quiet.
    if (this.timers.remaining("TW") === gameConfig.powerUps.twin.slackTicks) {
      this.deps.sfx.twinSlack();
    }
    // TWIN's couples, beside the echoes and below the same gates — though for a
    // milder reason than theirs. A thread is not a hitbox, so a detonation
    // holding the field still is not holding a collider still; what the gates
    // buy here is that the refill clock does not spend the capsule's eighteen
    // seconds while the wall is frozen behind a clear.
    this.entanglement.step(this.grid);
    this.lightCasters();
    for (const core of this.cores) {
      if (core.active) {
        core.step();
      }
    }
    // The deck goes back to base only when the last width capsule has run out:
    // a WIDE expiring under the JAMMER caught over it must not widen it again.
    if (expired.some(isPaddleWidthKind) && !PADDLE_WIDTH_KINDS.some((kind) => this.timers.isActive(kind))) {
      // The reward's own linear run, whichever capsule is running out — JAMMER
      // gives the wood back at the pace WIDE hands it over, because being let
      // go of is not the same event as being shut.
      const { baseWidth } = gameConfig.paddle;
      this.widthEaseKind = null;
      this.paddle.easeWidthTo(baseWidth, widthEaseTicks(this.paddle.width, baseWidth));
    }
    // Expired glue may not strand balls on the paddle with no way to launch.
    if (expired.includes("G")) {
      this.releaseStuckBalls();
    }
    // Time restarting: a ring where each ball stood. This runs above the ball
    // loop, so the rings mark the frozen positions rather than the first step
    // out of them.
    if (expired.includes("I")) {
      this.popStasisRings();
    }
    if (expired.includes("V")) {
      this.closeCore(this.singularity);
    }
    if (expired.includes("VX")) {
      this.closeCore(this.vortex);
    }
    if (expired.includes("O")) {
      // Seen leaving rather than cut: the records stay for twelve ticks while
      // their rings travel out, and the kick loop has already stopped reading
      // them, so the picture is the only thing still running.
      this.bumpers.retire();
    }
    // The wall setting again. Balls still inside it stay intangible until they
    // are out — `ghosted` owns that — so this is only the announcement.
    if (expired.includes("GH")) {
      this.deps.sfx.ghostSolidify();
    }
    // Nothing to undo — the scale is gone the moment the timer is — but the ball
    // dropping back to true speed has to be heard by someone whose eyes are on it.
    if (expired.includes("RU") || expired.includes("TU")) {
      this.deps.sfx.rushRelease();
    }
    // Nothing to undo here either — a heading is where it is — so the fizzle is
    // the whole of the ending, and it is owed: the kicks have been shrinking
    // for twenty-four ticks and the last of them is too small to be felt. The
    // sound is what says the fault cleared rather than got quiet.
    if (expired.includes("HA")) {
      this.deps.sfx.haywireClear();
    }
    // The paper coming up. Nothing has to be undone — the next bounce simply is
    // not snapped — so the tick and the grid dissolving under it are the whole
    // of the ending, and a ball already flying a diagonal keeps flying it until
    // something turns it.
    if (expired.includes("SN")) {
      this.deps.sfx.snapGridOff();
    }
    // The mortar setting again — and the announcement only. The wall takes a
    // full second to close and may take longer still where a ball is standing,
    // so what this marks is the moment the lanes stopped being promised, not
    // the moment they stopped being there.
    if (expired.includes("ER")) {
      this.deps.sfx.mortarSet();
    }
    // The wall setting again. The sheet has already been walked still by the
    // settle above — that started twenty-four ticks ago — so this only takes
    // the flag down and lets the grid back onto its fast path. The tremor the
    // player hears is the last of it rather than the announcement of it, which
    // is the one place this capsule's two ends deliberately differ: the arrival
    // had to be understood before it could be used, and the departure only has
    // to be noticed.
    // The mortar poured back in. The line has been running up the pile for the
    // last half second already — this only takes gravity off, and what the
    // player hears is the last of it rather than the announcement of it.
    if (expired.includes("SL")) {
      this.slump.stop();
      this.deps.sfx.slumpSet();
    }
    if (expired.includes("JE")) {
      this.sheet.stop();
      this.deps.sfx.jellySet();
    }
    // The sun already set: the wedges stopped being surfaces thirty ticks ago
    // and have spent them running off the bottom of the field, so by this tick
    // there is nothing on screen and nothing in the way. `reset` is the
    // bookkeeping catching up with a picture that has already finished, which is
    // why there is no sound here — `umbraSet` played when the light started to
    // go, not when the timer noticed.
    if (expired.includes("UM")) {
      this.shadows.reset();
    }
    // The posts already out: the pull was armed seventeen ticks ago and the
    // last of them burst on this tick, so there is nothing on screen and
    // nothing in the way. `reset` is the bookkeeping catching up with a picture
    // that has already finished — which is why there is no sound here either,
    // the same as the sun above it.
    if (expired.includes("FE")) {
      this.fence.reset();
    }
    // The echoes already home: they stopped being surfaces twelve ticks ago and
    // have spent them travelling back into their bricks, so by this tick the
    // wall is a wall again and there is nothing on screen and nothing in the
    // way. `reset` is the bookkeeping catching up with a picture that has
    // already finished, which is why the sound is not here — `superposeMerge`
    // played when the echoes started for home, not when the timer noticed.
    if (expired.includes("SU")) {
      this.superposition.reset();
    }
    // The wall already back: it stopped letting the ball through fifteen ticks
    // ago and has spent them condensing from the bottom course up, so by this
    // tick there is nothing out of focus and nothing to walk through. `reset`
    // is the bookkeeping catching up with a picture that has finished, and the
    // sound played when the wall started coming back rather than here.
    // The threads already down: they stopped paying twenty ticks ago and have
    // spent them falling through the field, so by this tick there is nothing on
    // screen and nothing wired. `reset` is the bookkeeping catching up with a
    // picture that has already finished, which is why the sound is not here —
    // `twinSlack` played when they let go, not when the timer noticed.
    if (expired.includes("TW")) {
      this.entanglement.reset();
    }
    if (expired.includes("CO")) {
      this.decoherence.reset();
    }
    // The faces closing again, and — like the mortar setting above it — the
    // announcement only: the cracks heal along the wall from the far column
    // back over the next half second, and a kill landing inside that half
    // second no longer crumbles. What this marks is the moment the wall stopped
    // owing you gravel.
    if (expired.includes("GR")) {
      this.deps.sfx.gravelSettle();
    }
    // The fires going out, one ball at a time. Nothing has to be undone — a
    // click after this is simply a click again — so the crowns guttering are the
    // whole of the ending, and they are owed one: the standing cue is on the
    // balls, and a cue that vanished on a frame would leave the player unsure
    // whether they had just missed their last shot.
    if (expired.includes("PY")) {
      this.gutterPyreCrowns();
      this.deps.sfx.pyreGutter();
    }
    // The cloth coming off, and the one ending here that is *not* the whole of
    // it: a ball already curving keeps curving until its own spin runs out. The
    // sound belongs to the deck, which is where the change actually happens.
    if (expired.includes("EN")) {
      this.deps.sfx.englishClear();
    }
    // The field comes back the same way it went, and the turn back owes the
    // same half second of sound: without it the second tumble reads as a fault.
    if (expired.includes("F")) {
      this.deps.sfx.flipRelease();
    }

    // CHARGE (GLUE+LASER) holds the cadence while a ball is stuck: the shots
    // are not lost, they are spent as one salvo on the release. STROBE
    // (LASER+TEMPO) halves the gap between them.
    if (this.timers.isActive("L") && !this.chargeHolding() && --this.laserCountdown <= 0) {
      this.laserCountdown = this.hasCombo("STROBE")
        ? gameConfig.powerUps.comboLaserCadenceTicks
        : gameConfig.powerUps.laserCadenceTicks;
      this.shotPool.fireFromPaddle(this.paddle);
      this.deps.sfx.laserFire();
    }
    // LANCE (LASER+PIERCE): the shot lives through the brick it hit.
    this.shotPool.step(
      this.grid,
      this.timers.isActive("GH"),
      (hit) => this.strikeWithShot(hit),
      this.hasCombo("LANCE"),
    );
    this.stepCritter();
    this.stepMeteors();

    // One reading for the whole field, so every ball on it is stepped on the
    // same tick of the same clock — and so the gate below and the debt above it
    // are asking about the number the ball actually moved on.
    const timeScale = this.ballTimeScale();
    for (let index = 0; index < this.balls.length; index++) {
      const ball = this.balls[index];
      if (!ball.active) {
        continue;
      }
      if (ball.stuckOffsetX !== null) {
        // Glued balls ride the paddle; the offset re-clamps in case a WIDE or
        // JAMMER catch changed the width underneath them — or a SPLIT opened a
        // hole where one was parked.
        ball.x = this.paddle.x + this.clampStuckOffset(ball.stuckOffsetX, ball.size);
        ball.y = this.paddle.y - ball.size;
        ball.tempoDebt = 0;
        continue;
      }
      // STASIS stops the balls and nothing else — capsules keep falling, shots
      // keep flying, the paddle keeps moving, and this is the whole of it.
      // Skipping the body writes no position or velocity, so the ball resumes
      // on exactly the trajectory it was frozen on.
      //
      // The product and not the timer, which is what lets the ball coast into
      // the freeze — and it still has to be a `continue` rather than a scale of
      // 0 fed to `moveBall`: at 0 the sub-step loop would run `findBallOverlap`
      // every tick on a ball parked inside a brick and chew straight through it
      // while the field is supposed to be held still.
      if (timeScale === 0) {
        continue;
      }
      const wasVx = ball.velocity.x;
      const wasVy = ball.velocity.y;
      this.moveBall(ball, index, timeScale);
      this.stepPaceDebt(ball, timeScale, wasVx, wasVy);
    }
    // The MULTI ladder and the swarm end as soon as a single ball is left —
    // checked before capsule catches so a fresh pickup is not instantly reset.
    if (this.balls.filter((ball) => ball.active).length <= 1) {
      this.multiTier = 0;
      this.swarmLive = false;
    }
    // Trigger-tick guard: a kill earlier in this same tick may have set
    // clearCountdown; the freeze must already apply — a drained ball must not
    // cost a life on a cleared level, and no capsule may be caught behind a
    // pending clear.
    if (this.clearCountdown === 0 && !this.balls.some((ball) => ball.active)) {
      this.die();
    }

    if (this.clearCountdown === 0) {
      const field = {
        magnetReach: this.magnetReach(),
        cores: this.cores,
        onSwallowed: (x: number, y: number) => {
          this.particles.burst(x, y, "S", gameConfig.effects.brickDeathBurst);
        },
        // Null on a dry field rather than a surface at the floor line, so the
        // fall keeps its one-line fast path on every tick of every other
        // capsule: what the pool asks is whether there is a sea at all.
        tide: this.tideBlend > 0 ? { waterline: this.waterline(), phase: this.tidePhase } : null,
      };
      this.dropPool.step(this.paddleSegments(), field, (kind) => {
        // Two capsules can reach the paddle on one tick; nothing applies once a
        // NUKE detonation has started — the refused drop stays live and freezes.
        if (this.detonation.active) {
          return false;
        }
        this.applyPowerUp(kind);
        this.capsulesCaught++;
        if (MALUS_KINDS.has(kind)) {
          this.trapsCaught++;
        }
        return true;
      });
      this.stepGravel();
    }
  }

  /**
   * SINGULARITY and VORTEX: bend one ball toward every open hole, at unchanged
   * speed.
   *
   * Returns whether the ball is inside any core's reach, which is where HOMING
   * stands aside. A ball is never eaten and never accelerated: the impulses go
   * on and the speed comes straight back off, so what a core changes is heading
   * alone — and a ball dragged in from low on the field is dragged *away* from
   * the loss line, never into it.
   *
   * Both holes are summed before the one renormalise at the end. Normalising
   * per core would make the pair order-dependent — the second hole's bend
   * applied to a heading the first had already stretched to full speed — and a
   * ball between them would drift toward whichever came last in the array.
   */
  private pullIntoCores(ball: Ball, index: number): boolean {
    const { holdDecay, holdRelease, holdFree } = gameConfig.powerUps.singularity;
    let inside = false;
    let bent = false;

    for (const [slot, core] of this.cores.entries()) {
      if (!core.active) {
        continue;
      }
      const hold = this.coreHold[slot];
      const held = this.heldBy(core, ball);
      inside = held || inside;
      // Held time climbs while the ball is close and drains twice as fast once it
      // is out, so passing through costs nothing and circling ends itself.
      hold[index] = held ? hold[index] + 1 : Math.max(0, hold[index] - holdDecay);
      const pullScale = Math.max(0, Math.min(1, 1 - (hold[index] - holdRelease) / (holdFree - holdRelease)));
      bent = this.bendTowardCore(ball, core, pullScale) || bent;
    }
    if (!bent) {
      return inside;
    }

    // One renormalise for the whole guidance step: a core bends a ball, it never
    // speeds one up. HOMING preserves speed on its own, so running after this
    // cannot undo it.
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    const wanted = this.speed();
    ball.velocity.x = (ball.velocity.x / speed) * wanted;
    ball.velocity.y = (ball.velocity.y / speed) * wanted;
    return inside;
  }

  // Whether this ball is close enough to `core` for it to own the guidance.
  // The cutoff is the core's own, so the bigger hole waves HOMING off from
  // proportionally further out.
  private heldBy(core: Singularity, ball: Ball): boolean {
    const { homingCutoff } = gameConfig.powerUps.singularity;
    const toCoreX = core.x - ball.centerX;
    const toCoreY = core.y - (ball.y + ball.size / 2);
    return Math.hypot(toCoreX, toCoreY) <= core.reach(homingCutoff);
  }

  // One core's impulse, added raw. Reports whether it added anything, which is
  // what tells the caller there is a heading to renormalise.
  //
  // The constant and the floor are the core's own: the inverse-square law is the
  // same curve at both sizes, read 1.5x further out at VORTEX.
  private bendTowardCore(ball: Ball, core: Singularity, pullScale: number): boolean {
    const { pullConstant, minDistance } = gameConfig.powerUps.singularity;
    const toCoreX = core.x - ball.centerX;
    const toCoreY = core.y - (ball.y + ball.size / 2);
    const distance = Math.hypot(toCoreX, toCoreY);
    if (pullScale === 0 || distance === 0) {
      return false;
    }

    const acceleration = (core.pull(pullConstant) / Math.max(distance, core.reach(minDistance)) ** 2) * pullScale;
    ball.velocity.x += (toCoreX / distance) * acceleration;
    ball.velocity.y += (toCoreY / distance) * acceleration;
    return true;
  }

  /**
   * VORTEX: open the drifting hole somewhere new, heading somewhere new.
   *
   * A fixed spawn would make the second hole a second landmark, and the whole
   * point of it is that it is never where it was last time. The heading is drawn
   * near horizontal because the roam box is 260 px wide and 34 tall: a steep one
   * is a hole that bounces top to bottom and never crosses the field.
   *
   * A second catch over an open vortex buys time instead of moving it — see
   * `Singularity.renew`.
   */
  private openVortex(lifeTicks: number): void {
    if (this.vortex.active) {
      this.vortex.renew(lifeTicks);
      return;
    }
    const { scale, driftSpeed, driftMaxAngle, left, right, top, bottom } = gameConfig.powerUps.vortex;
    const heading = (Math.random() * 2 - 1) * driftMaxAngle + (Math.random() < 0.5 ? 0 : Math.PI);
    this.vortex.open({
      x: left + Math.random() * (right - left),
      y: top + Math.random() * (bottom - top),
      lifeTicks,
      scale,
      drift: { speed: driftSpeed, angle: heading, left, right, top, bottom },
    });
  }

  private closeCore(core: Singularity): void {
    core.reset();
    this.coreHold[this.cores.indexOf(core)].fill(0);
  }

  private closeCores(): void {
    for (const core of this.cores) {
      core.reset();
    }
    for (const hold of this.coreHold) {
      hold.fill(0);
    }
  }

  /**
   * GLUE's film, one tick of it: out from the middle of each half of the deck
   * while the capsule is fresh, and back in over its last twenty ticks.
   *
   * The target is how much deck there is to wet rather than a constant, so a
   * SPLIT caught over a live GLUE is two short halves that finish quickly and a
   * JAMMER shutting the deck pulls the film in with the wood. Both directions
   * run at the same fixed rate: resin spreads and recedes at the speed resin
   * does, whatever it is spreading across.
   *
   * Not `ghostProgress`, which is the wall's dissolve threshold — that one hard-
   * codes the 12x8 brick grid and its own centre, and there is nothing shared
   * here but the idea of a front that does not arrive everywhere at once.
   */
  private stepGlueResin(): void {
    const { glueFadeTicks, glueCreepPx } = gameConfig.effects;
    // The capsule's own last ticks and not the ticks after it: the deck has to
    // be dry before the timer clears, or the film outlives the label telling the
    // player why it is there.
    //
    // How many of them is the deck's own business, the same way the creep is —
    // the film recedes at `glueCreepPx` too, so the window is exactly how long
    // that takes and `glueFadeTicks` is only the ceiling on it. A flat twenty
    // would leave a base deck looking dry for fourteen ticks while it was still
    // catching; this way the last resin leaves on the last tick.
    const dryTicks = Math.min(glueFadeTicks, Math.ceil(this.glueReachNeeded() / glueCreepPx));
    const drying = !this.timers.isActive("G") || this.timers.remaining("G") <= dryTicks;
    const target = drying ? 0 : this.glueReachNeeded();
    const step = Math.min(glueCreepPx, Math.abs(target - this.glueReach));
    this.glueReach += target > this.glueReach ? step : -step;
  }

  // The widest half the film has to cross, which is what it is aiming at. Read
  // off the same segments the catch test uses, so a hole opening under a wet
  // deck leaves two films rather than one that reaches past its own wood.
  private glueReachNeeded(): number {
    let widest = 0;
    for (const segment of this.paddleSegments()) {
      widest = Math.max(widest, (segment.right - segment.left) / 2);
    }
    return widest;
  }

  // How far out from the deck's centre the magnet can reach this frame, in px.
  // One number for the pull's gate, the tethers' cut and the two rail marks —
  // three things that would otherwise have to agree about a product they each
  // computed for themselves.
  private magnetReach(): number {
    return gameConfig.powerUps.magnet.rangeX * this.magnetBlend;
  }

  /**
   * Where the doorway is this frame: the top of the aperture and how tall it is,
   * in game pixels, 0 tall when the wall is whole.
   *
   * One method and not a formula written twice, because the renderer paints
   * these rows and the transit test reads them, and two copies that have to
   * agree to the pixel are two copies that eventually will not. The height is
   * forced even so the aperture stays symmetric about its own centre line and
   * the top stays a whole pixel.
   */
  private portalMouth(): { top: number; height: number } {
    const { portalTop, portalHeight } = gameConfig.powerUps;
    const open = 2 * Math.round((portalHeight * this.portalBlend) / 2);
    return { top: portalTop + (portalHeight - open) / 2, height: open };
  }

  /**
   * The topmost row PAYDAY's tide has reached, and the wall's row count while it
   * has reached none — one number for the standing wall and for the flash a kill
   * leaves behind it, so the two cannot disagree about where the front is.
   *
   * Rounded up, so a row gilds on the tick the tide covers the whole of it: the
   * front is five or six steps, and a step taken early is a step the wall spends
   * in a state the blend has not earned.
   */
  private paydayFront(): number {
    const rows = this.grid.rows.length;
    return this.paydayBlend <= 0 ? rows : Math.ceil(rows * (1 - this.paydayBlend));
  }

  /**
   * How far down a scan has to travel: the bottom edge of the deepest row still
   * holding a brick, measured from the wall's top.
   *
   * The *live* wall and not the level's, which is the whole reason this is a
   * function and not `rows.length * brickHeight` written inline.
   */
  private xrayWallSpan(): number {
    const rows = this.grid.rows;
    for (let row = rows.length - 1; row >= 0; row--) {
      if (rows[row].some((cell) => cell !== null)) {
        return (row + 1) * gameConfig.grid.brickHeight;
      }
    }
    return 0;
  }

  // Where the reading edge stands. Rounded to a whole game pixel here rather
  // than in the renderer, so the slice a half-read row is clipped to lands on
  // the 3x grid the wall is drawn on and not between two of its pixels.
  private xrayBeamY(): number {
    return gameConfig.grid.top + Math.round(this.xraySweepSpan * this.xrayBlend);
  }

  /**
   * HOMING's two clocks, one tick of each.
   *
   * The pull is global and eases like every other capsule's; the reticles are
   * per ball and run their own counters, because a lock is per ball and up to
   * twelve of them are held at once. The tempting shortcut — one blend, dropped
   * to 0 when a target brick dies — would fling every ball's corners open
   * because one ball's brick died, which under MULTI or SWARM is most ticks.
   *
   * On the way out the counters open and it is a counter reaching 0, not the
   * expiry tick, that releases the lock. The lock is the draw condition, so
   * clearing it at expiry is precisely why the marks used to vanish outright —
   * and `steerBall` is gated on the timer rather than on this blend for the
   * same reason: its first branch clears the lock on any ball below the grid
   * heading down, which would blink that ball's corners off mid-open.
   */
  private stepHomingMarks(): void {
    const { homingRetargetTicks } = gameConfig.powerUps;
    const locking = this.timers.isActive("H");
    this.homingBlend = stepBlend(this.homingBlend, locking, homingRetargetTicks);
    for (const ball of this.balls) {
      if (ball.homingRow < 0) {
        continue;
      }
      if (locking) {
        ball.homingMarkTicks = Math.min(homingRetargetTicks, ball.homingMarkTicks + 1);
      } else if (--ball.homingMarkTicks <= 0) {
        ball.clearHoming();
      }
    }
  }

  /**
   * HOMING: bend this ball one step toward the brick it has locked, at constant
   * speed. The turn is capped per tick, so the ball arcs onto its target over
   * about ninety ticks rather than snapping to it — a curve the player can read
   * and still bounce off, not a magnet.
   */
  /**
   * TRACER: rebuild every ball's thread for this tick.
   *
   * **The honesty is all here, and it is the capsule.** A straight walk is exact
   * in open field and a lie everywhere else, and a guide that lies once is worse
   * than no guide: the player stops believing the next one, which leaves them
   * worse off than if they had never caught it. So every way the walk could be
   * wrong ends the thread early instead, and a thread that never reached the
   * rail pins no pip.
   *
   * Three ways it can be wrong, and they are handled in the order they cost:
   *
   * 1. **Something bends the ball.** HOMING, ENGLISH, HAYWIRE and the two wells
   *    all turn a heading mid-flight, so the walk's premise is gone before it
   *    starts. No amount of walking recovers it — the thread is a stub for as
   *    long as they are up, and under HOMING that is the whole twenty seconds. That
   *    is the correct picture rather than a degraded one.
   * 2. **Something is in the way.** Live bricks and bumper discs both, sampled
   *    along the path by `ballTrace`. The thread then ends at the face of
   *    whatever it met, which is where the prediction honestly ends.
   * 3. **A door is open.** PORTAL is the one case that makes the walk *better*:
   *    inside the mouth the side walls wrap instead of reflecting, so the thread
   *    goes through one doorway and out the other.
   */
  private stepTracer(): void {
    if (this.tracerBlend === 0) {
      if (this.tracerThreads.length > 0) {
        this.tracerThreads = [];
      }
      return;
    }

    // Anything that turns a heading mid-flight. GLUE and STASIS are deliberately
    // not here: they hold a ball rather than bending it, and `trace` already
    // returns no arrival for a ball that is stuck or not falling.
    const bent =
      this.timers.isActive("H") ||
      this.timers.isActive("EN") ||
      this.timers.isActive("HA") ||
      this.timers.isActive("V") ||
      this.timers.isActive("VX");

    const mouth = this.portalMouth();
    const rules: TraceRules = {
      portal: mouth.height > 0 ? mouth : null,
      // The line the thread is drawn to, off the deck rather than off the rail:
      // TIDE floats the deck 96 px up, and a guide whose whole promise is where
      // the ball lands may not point at a surface that has moved.
      deckY: this.paddle.y,
      blocked: (x, y) => {
        const cell = this.grid.cellAt(x, y);
        // COLLAPSE: a fogged brick is not in the ball's way, so it may not be in
        // the guide's either. TRACER's whole promise is where the ball lands,
        // and a line that stopped against a wall the ball flies straight through
        // would be the one capsule on the board actively lying to the player.
        // Read without touching: this is a probe and not a pass, and a
        // prediction that solved the cell it predicted through would hand the
        // wall back for free from the deck.
        if (cell !== null && !(this.decoherence.fogged(cell.row, cell.column) && !this.timers.isActive("GH"))) {
          return true;
        }
        const { radius } = gameConfig.powerUps.bumpers;
        return this.bumpers.discs.some((disc) => Math.hypot(disc.x - x, disc.y - y) <= radius);
      },
    };

    // The soonest arrival is the ball the deck has to answer, and the only one
    // that earns a whole thread.
    let soonest = Infinity;
    let soonestBall: Ball | null = null;
    const traced = this.balls.map((ball) => {
      const walk = bent ? { points: [{ x: ball.centerX, y: ball.y }], arrival: null } : trace(ball, rules);
      if (walk.arrival !== null && walk.arrival.ticks < soonest) {
        soonest = walk.arrival.ticks;
        soonestBall = ball;
      }
      return { ball, walk };
    });

    this.tracerThreads = traced
      .filter(({ ball }) => ball.active)
      .map(({ ball, walk }) => ({
        points: walk.points,
        pipX: walk.arrival === null ? null : walk.arrival.x,
        full: ball === soonestBall,
        // **Slack means "no claim", and that is the whole rule.** A climbing ball
        // has nothing to predict yet; a ball HOMING is bending has nothing that
        // can be predicted at all. Both hang rope, because the alternative is
        // drawing nothing — and a capsule that draws nothing for twenty seconds
        // reads as one that broke, which is the defect this roster keeps
        // relearning. A thread that got *part* of the way down (stopped at a
        // brick face) is not slack: it has something true to show and shows it.
        // A stuck ball gets no rope — GLUE's resin is already its own tell.
        slack: walk.arrival === null && walk.points.length < 2 && ball.stuckOffsetX === null,
      }));
  }

  /**
   * HAYWIRE's clock: whether this tick is a kick, for the whole field.
   *
   * Driven off the blend and not the timer, which is what makes the departure a
   * fade rather than a cut. The timer reaches zero, the blend spends its
   * twenty-four ticks winding down, and the kicks that land inside that window
   * are the last, smallest ones — the fault clearing rather than being switched
   * off. Reading the timer here would end the trap on a full-strength kick.
   */
  private stepHaywire(): void {
    if (this.haywireBlend === 0) {
      this.haywireKicking = false;
      return;
    }
    this.haywireKicking = --this.haywireKickIn <= 0;
    if (this.haywireKicking) {
      this.haywireKickIn = gameConfig.powerUps.haywire.kickTicks;
      this.deps.sfx.haywireKick(this.haywireBlend);
    }
  }

  /**
   * One kick: this ball's heading knocked off course, its speed untouched.
   *
   * **Rotation, never displacement.** The velocity is rebuilt at the same speed
   * from a new angle, so the trap owns direction and nothing else — it costs
   * the player their read on where the ball is going and not their grip on how
   * fast it is going there, which is RUSH's job and is already taken.
   *
   * The magnitude is the blend, so both ends of the capsule are in the kicks
   * themselves: the first are nudges, the middle are the full cone, the last
   * are nudges again. There is no sprite state to unwind at expiry — a heading
   * is where it is — and that is exactly why the fade has to live here.
   *
   * A glued ball is skipped: it has no heading to knock, and kicking the stored
   * velocity would hand the player a launch angle they never chose.
   */
  private glitchBall(ball: Ball): void {
    const { maxKickRad, minKickRad, minVerticalFraction } = gameConfig.powerUps.haywire;
    if (ball.stuckOffsetX !== null) {
      return;
    }
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed === 0) {
      return;
    }

    const heading = Math.atan2(ball.velocity.y, ball.velocity.x);
    const size = (minKickRad + Math.random() * (maxKickRad - minKickRad)) * this.haywireBlend;
    const away = Math.random() < 0.5 ? -1 : 1;

    /**
     * The flat cone, and the three ways out of it in order of honesty.
     *
     * A ball knocked flatter than `minVerticalFraction` rattles between the two
     * walls until the timer runs out, and a trap that ends by boring the player
     * stopped being a trap — so headings that shallow are refused. HOMING has
     * the identical test and simply *skips* the turn, which it can afford
     * because the next bounce resumes its arc for free. This may not: a kick
     * that does nothing is a spark shower over a ball that did not move, and
     * the sparks would be lying about the simulation.
     *
     * **Turning the other way is the first answer**, and it is a real turn of
     * the full size — the fault still happened, it just could not push that way.
     * From any legal heading this always lands inside the cone: the floor puts
     * the ball at least 20.5 deg off horizontal and the kick is at most 34.4,
     * so turning away from the near wall of the cone moves toward vertical and
     * cannot reach the far one.
     *
     * **Clamping is the fallback**, for a ball that arrived flatter than the
     * floor by some other route — a singularity or a bumper can bend a heading
     * anywhere, while the deck cannot: its widest bounce is 1.05 rad, which is
     * 0.498 vertical and clear of this. Clamping to the edge is what the first
     * cut did in every case, and it was wrong for the common one: a ball parked
     * exactly on the boundary was re-clamped to the identical heading, so every
     * kick toward flat visibly did nothing while the sparks still fired.
     *
     * The vertical *sense* survives all three. A fault may take the player's
     * aim, but it may not decide that every ball is now heading for the floor.
     */
    let kicked = heading + away * size;
    if (Math.abs(Math.sin(kicked)) < minVerticalFraction) {
      kicked = heading - away * size;
    }
    if (Math.abs(Math.sin(kicked)) < minVerticalFraction) {
      const rising = ball.velocity.y < 0 ? -1 : 1;
      const forward = Math.cos(kicked) < 0 ? -1 : 1;
      kicked = Math.atan2(rising * minVerticalFraction, forward * Math.sqrt(1 - minVerticalFraction ** 2));
    }

    ball.velocity.x = Math.cos(kicked) * speed;
    ball.velocity.y = Math.sin(kicked) * speed;
    // The kick, seen: sparks off the ball on the frame its heading changed, and
    // only on that frame. The shower thins with the blend for the same reason
    // the kick does — the two are one event and may not disagree about how
    // strong it was.
    const { haywireSparkBurst } = gameConfig.effects;
    this.particles.sparkBurst(ball.centerX, ball.y + ball.size / 2, {
      ...haywireSparkBurst,
      chunkCount: Math.max(1, Math.round(haywireSparkBurst.chunkCount * this.haywireBlend)),
    });
  }

  /**
   * GIANT: every ball to the size the swell is at, on the tick it moves.
   *
   * **About the centre, then back inside the frame.** A ball whose top-left
   * corner stayed put would drift down and right as it grew, and 16 px of drift
   * over the swell is a ball the player was not aiming. Growing about the
   * centre spends the same pixels either side, so the ball goes on travelling
   * the line it was on.
   *
   * Parked balls are resized too, and re-parked: GLUE can be holding one
   * against the deck while this runs, and a ball that grew downward through the
   * wood would be sitting in it.
   */
  private resizeBalls(): void {
    const size = ballSizeFor(this.giantBlend);
    const { left, right, top } = gameConfig.field;
    for (const ball of this.balls) {
      if (ball.size === size) {
        continue;
      }
      // Even sizes throughout, so this is whole pixels and the sprite never
      // lands on a half.
      const half = (size - ball.size) / 2;
      ball.size = size;
      if (!ball.active) {
        continue;
      }
      ball.x -= half;
      ball.y -= half;
      ball.x = Math.min(Math.max(ball.x, left), right - size);
      ball.y = Math.max(ball.y, top);
      if (ball.stuckOffsetX !== null) {
        ball.stuckOffsetX = this.clampStuckOffset(ball.stuckOffsetX, size);
        ball.x = this.paddle.x + ball.stuckOffsetX;
        ball.y = this.paddle.y - size;
      }
    }
  }

  /**
   * What one contact takes out of the wall.
   *
   * An ordinary ball damages the brick it struck, which is the game as it has
   * always been. A heavy one takes the whole patch it is standing on and the
   * ring around it — see `crushBricks`.
   *
   * **Gated on the ball's own size and not on the timer.** The swell runs on
   * for `giantFadeTicks` after GIANT expires, and a 20 px ball that collided
   * wide while crushing like an 8 px one is the kind of disagreement the
   * player feels without being able to name.
   */
  private strikeBricks(ball: Ball, hit: BrickHit): void {
    // JELLY: the wall does not break here any more, it gives. The contact is a
    // dimple pressed into the sheet and the damage is the sheet's business from
    // here — which is the capsule, and the one thing about it the player has to
    // understand before it is any use to them.
    //
    // **The ball's own size still decides how much wall is pressed**, for the
    // reason the branch below it exists: a 24 px ball is standing on up to six
    // cells, and a trampoline it dimpled in one of them would be a heavy ball
    // that hits like a light one. Gated on the size and not on GIANT's timer,
    // again for that branch's reason — the swell runs on after the capsule.
    //
    // A laser bolt is deliberately not here. It goes to `damageBrick` directly
    // and still drills stone while the wall is pudding, which is right twice
    // over: the capsule is about what a *ball* does to a sheet, and a player who
    // has caught a LASER over a JELLY has earned the only way left to take a
    // brick down on demand.
    if (this.timers.isActive("JE")) {
      const { jellyPressDepth } = gameConfig.effects;
      if (ball.size <= gameConfig.ball.size) {
        this.sheet.press(hit.row, hit.column, jellyPressDepth);
      } else {
        for (const cell of this.grid.findBallOverlaps(ball.x, ball.y, ball.size)) {
          this.sheet.press(cell.row, cell.column, jellyPressDepth);
        }
      }
      this.reboundOffSheet(ball);
      this.deps.sfx.jellyBounce();
      return;
    }
    if (ball.size <= gameConfig.ball.size) {
      this.damageBrick(hit);
      return;
    }
    this.crushBricks(ball, hit);
  }

  /**
   * JELLY's trampoline: the ball comes off the sheet faster than it went in.
   *
   * **Applied at the bounce and stored nowhere**, which is HAYWIRE's rule about
   * heading and is here for a harder reason than tidiness. A multiplier held on
   * the ball would compound — a ball ricocheting in a pocket of the wall would
   * be through the floor in a second and a half — so what is stored is the
   * velocity itself, and it is clamped against the level's own speed rather
   * than against whatever it happened to be. One bounce takes the ball to the
   * ceiling, the next twenty hold it there, and the next paddle bounce puts it
   * back on the level's pace with nothing to unwind.
   *
   * A drill is not thrown back. PIERCE goes through the brick rather than off
   * it, and there is no rebound to be faster than.
   */
  private reboundOffSheet(ball: Ball): void {
    if (this.timers.isActive("P")) {
      return;
    }
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    const ceiling = this.speed() * gameConfig.effects.jellyRebound;
    if (speed === 0 || speed >= ceiling) {
      return;
    }
    const scale = Math.min(gameConfig.effects.jellyRebound, ceiling / speed);
    ball.velocity.x *= scale;
    ball.velocity.y *= scale;
  }

  /**
   * The cells the sheet has bent past breaking this tick, paid out through the
   * ordinary damage path.
   *
   * `"ball"` is the source, and it is the right one rather than a convenient
   * one: a ball is what put the energy into the sheet, and everything that
   * hangs off a ball's kill has to hang off this. Points, the capsule the brick
   * was holding, a live BLAST's splash, a live CHAIN's links and GRAVEL's chips
   * all pay out exactly as they would have if the ball had simply broken the
   * brick — which is what it was doing twenty seconds ago and will be doing
   * again in twenty more.
   *
   * It is a *hit* and not a kill, so granite still takes four tears and shows
   * its ramp going down between them.
   */
  private tearStrainedBricks(): void {
    if (!this.sheet.rippling) {
      return;
    }
    this.jellyTears.length = 0;
    this.sheet.drainTears(this.jellyTears);
    if (this.jellyTears.length === 0) {
      return;
    }
    const { columns } = gameConfig.grid;
    for (const index of this.jellyTears) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const hit = this.grid.hitAtCell(row, column);
      // A cell the wave is still working that has nothing in it any more. It
      // costs one lookup and is cleared rather than left to recharge, so an
      // open hole in the wall stops asking to be broken.
      if (hit === null) {
        this.sheet.clearCell(row, column);
        continue;
      }
      this.damageBrick(hit);
    }
    // One tear for the tick however many cells went, which is the same bargain
    // `brickDestroyed` strikes with its own retrigger guard: what the player
    // has to hear is the wall coming apart, not eight of them.
    this.deps.sfx.jellyTear();
  }

  /**
   * GIANT's contact: every brick under the ball, plus the ring around them.
   *
   * The patch is the honest half — a 24 px ball is genuinely standing on up to
   * six cells, and breaking one of them was the bounce test's answer rather
   * than the physics'. The ring is the weight: what a mass this size lands on
   * does not stop at the bricks it touched.
   *
   * The ring is collected as **coordinates and re-resolved afterwards**, never
   * as the `BrickHit`s taken before the patch ran. A patch kill removes cells
   * from the grid, and a hit captured earlier holds a reference to one that is
   * already gone — damaging it would take points for a brick twice and drop a
   * second capsule out of it.
   *
   * Ring bricks come in as `"splash"`, exactly as BLAST's do, which is what
   * keeps one contact reading as one event: no chaining out of it, no capsule
   * out of it, and no eight overlapping pops.
   */
  private crushBricks(ball: Ball, struck: BrickHit): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const radius = gameConfig.powerUps.giant.crushRadius;
    const patch = this.grid.findBallOverlaps(ball.x, ball.y, ball.size);
    // The bounce found its cell by sampling a corner, and ERODE can wear a
    // cell out of the patch's reach that the corner still landed on. Whatever
    // the bounce was against is part of the contact by definition.
    if (!patch.some((cell) => cell.row === struck.row && cell.column === struck.column)) {
      patch.push(struck);
    }

    const inPatch = new Set(patch.map((cell) => `${cell.row},${cell.column}`));
    const ring = new Set<string>();
    for (const cell of patch) {
      for (let deltaRow = -radius; deltaRow <= radius; deltaRow++) {
        for (let deltaColumn = -radius; deltaColumn <= radius; deltaColumn++) {
          const key = `${cell.row + deltaRow},${cell.column + deltaColumn}`;
          if (!inPatch.has(key)) {
            ring.add(key);
          }
        }
      }
    }

    for (const cell of patch) {
      this.damageBrick(cell);
    }

    for (const key of ring) {
      const [row, column] = key.split(",").map(Number);
      const neighbor = this.grid.hitAtCell(row, column);
      if (!neighbor) {
        continue;
      }
      this.brickFlashes.push({
        x: left + neighbor.column * brickWidth,
        y: top + neighbor.row * brickHeight + this.cellSag(neighbor.row, neighbor.column),
        ticksLeft: gameConfig.powerUps.splashFlashTicks,
        kind: "blast",
        // A splash off a fence post reaches the posts either side of it, and a
        // post is not in wall coordinates — see `emitBurst`.
        onWall: !this.isPost(neighbor.row),
        gild: false,
      });
      this.damageBrick(neighbor, "splash");
    }
  }

  private steerBall(ball: Ball): void {
    const { homingTurnRad, homingMinVerticalFraction } = gameConfig.powerUps;
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const size = ball.size;

    // Below the grid on the way down there is nothing ahead to steer toward,
    // and a mark under the bricks would point at a brick this ball is leaving.
    if (ball.velocity.y > 0 && ball.y > top + this.grid.rows.length * brickHeight) {
      ball.clearHoming();
      return;
    }

    // Re-pick on the clock, and the instant the locked brick stops existing.
    if (--ball.homingRetargetIn <= 0 || this.grid.hitAtCell(ball.homingRow, ball.homingColumn) === null) {
      this.lockNearestBrick(ball);
    }
    // An empty grid: the tick the last brick died, before the clear delay engages.
    if (ball.homingRow < 0) {
      return;
    }

    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed === 0) {
      return;
    }
    const heading = Math.atan2(ball.velocity.y, ball.velocity.x);
    const wanted = Math.atan2(
      top + (ball.homingRow + 0.5) * brickHeight - (ball.y + size / 2),
      left + (ball.homingColumn + 0.5) * brickWidth - (ball.x + size / 2),
    );
    // Wrapped into (-pi, pi] so the ball always turns the short way round.
    let difference = (wanted - heading) % (Math.PI * 2);
    if (difference > Math.PI) {
      difference -= Math.PI * 2;
    } else if (difference <= -Math.PI) {
      difference += Math.PI * 2;
    }
    // The pull eased by the same number the corners are drawn from: a lock that
    // has not closed yet does not get to steer at full strength. ~0.2 rad lost
    // over the ramp against the ~90 ticks the capsule needs to reverse a
    // heading, which is the ease being free.
    const turn = homingTurnRad * this.homingBlend;
    const steered = heading + Math.max(-turn, Math.min(turn, difference));

    // A ball steered flat never comes back down. Skip the turn, keep the lock:
    // the next bounce changes the heading and the arc resumes on its own.
    if (Math.abs(Math.sin(steered)) < homingMinVerticalFraction) {
      return;
    }
    // Rebuilt in place from the unchanged speed: exact, and no allocation on a
    // path that runs for every ball on every tick.
    ball.velocity.x = Math.cos(steered) * speed;
    ball.velocity.y = Math.sin(steered) * speed;
  }

  // Nearest live brick by centre distance, compared squared and scanned over
  // indices — this runs per ball whenever a lock expires, and allocates nothing.
  private lockNearestBrick(ball: Ball): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const size = ball.size;
    const ballX = ball.x + size / 2;
    const ballY = ball.y + size / 2;
    const rows = this.grid.rows;
    let bestRow = -1;
    let bestColumn = -1;
    let bestDistance = Infinity;

    for (let row = 0; row < rows.length; row++) {
      for (let column = 0; column < rows[row].length; column++) {
        if (!rows[row][column]) {
          continue;
        }
        const dx = left + (column + 0.5) * brickWidth - ballX;
        const dy = top + (row + 0.5) * brickHeight - ballY;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRow = row;
          bestColumn = column;
        }
      }
    }

    // Only a genuinely different cell restamps the reticle. `homingRetargetIn`
    // resets to 12 on every lock and `steerBall` re-locks unconditionally when
    // it hits 0 — usually onto the same brick — so stamping here regardless
    // would close the corners afresh five times a second for the whole capsule.
    if (bestRow !== ball.homingRow || bestColumn !== ball.homingColumn) {
      ball.homingMarkTicks = 0;
    }
    ball.homingRow = bestRow;
    ball.homingColumn = bestColumn;
    ball.homingRetargetIn = gameConfig.powerUps.homingRetargetTicks;
  }

  /**
   * BUMPERS: kick this ball off the first disc it is touching.
   *
   * The ball reflects off the disc's surface normal, is pushed clear of it and
   * put back to the level's speed — a kick changes heading and pays, never
   * pace. Only an approaching ball is kicked: one already travelling outward
   * was kicked on an earlier sub-step, and reflecting it again would drag it
   * back into the disc it is leaving.
   *
   * Returns whether a kick happened, which is what the streak counts.
   */
  private kickOffBumpers(ball: Ball): boolean {
    const size = ball.size;
    const contact = gameConfig.powerUps.bumpers.radius + size / 2;
    const centerY = ball.y + size / 2;

    for (const disc of this.bumpers.discs) {
      // A converging ring is a warning that a surface is coming and a diverging
      // one is what a surface left behind. Kicking a ball off either would be
      // the bug this whole transition exists to avoid, in reverse.
      if (disc.arriveTicksLeft > 0 || disc.leaveTicksLeft > 0) {
        continue;
      }
      const toBallX = ball.centerX - disc.x;
      const toBallY = centerY - disc.y;
      const distance = Math.hypot(toBallX, toBallY);
      if (distance >= contact) {
        continue;
      }
      // A ball dead on the centre has no normal to work with; up is the one
      // direction that cannot answer it by shoving it at the deck.
      const normalX = distance === 0 ? 0 : toBallX / distance;
      const normalY = distance === 0 ? -1 : toBallY / distance;
      const approach = ball.velocity.x * normalX + ball.velocity.y * normalY;
      if (approach >= 0) {
        continue;
      }

      ball.velocity.x -= 2 * approach * normalX;
      ball.velocity.y -= 2 * approach * normalY;
      // Half a pixel past the surface, so the next sub-step reads as clear of
      // the disc rather than as a second contact at exactly the contact radius.
      const push = contact - distance + 0.5;
      ball.x += push * normalX;
      ball.y += push * normalY;
      // A reflection preserves speed on paper; this is what keeps it true after
      // a few hundred of them.
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      if (speed > 0) {
        const scale = this.speed() / speed;
        ball.velocity.x *= scale;
        ball.velocity.y *= scale;
      }

      disc.flashTicksLeft = gameConfig.powerUps.bumpers.flashTicks;
      this.score += gameConfig.scoring.bumperPoints * this.paydayMultiplier();
      this.deps.sfx.bumperKick();
      return true;
    }
    return false;
  }

  /**
   * A laser bolt reaching a brick — and, under COLLAPSE, the one thing on the
   * board that can hand a hitbox back without flying through it.
   *
   * **The bolt is spent on the fog and the brick takes no damage.** That is the
   * whole trade and it is the capsule's counter-play: the ball can only solve
   * the wall at the speed it can cross it, and a bolt solves a cell instantly
   * from the deck. Eight seconds of COLLAPSE is the strongest argument the
   * roster has for chasing a LASER.
   *
   * Under LANCE the bolt pierces, so one shot can solve a whole column — which
   * is the fusion doing what a fusion is for, and is left alone.
   */
  private strikeWithShot(hit: BrickHit): void {
    if (this.decoherence.solve(hit.row, hit.column)) {
      this.deps.sfx.collapseSolve();
      return;
    }
    this.damageBrick(hit, "laser");
  }

  /**
   * SUPERPOSE: a ball meeting an echo, into the brick that cast it.
   *
   * **The pair collapses and the brick pays**, which is the whole capsule in
   * one line: an echo is a second place to hit a brick from, so the hit is
   * routed through `damageBrick` on the ordinary `"ball"` path and points, the
   * capsule the brick was holding, a live BLAST's splash, a live CHAIN's links
   * and GRAVEL's chips all fall out of it with no new branches. UMBRA's
   * `strikeShadow` below reaches the same conclusion from the same place, and
   * for the same reason: a surface standing in for a brick is not a new kind of
   * event, it is a brick hit taken somewhere else.
   *
   * It is a *hit* and not a kill, so granite still takes four — and a granite
   * brick whose echo is spent on the first of them is a brick with three hits
   * left and only one place left to take them, which is the capsule paying
   * itself back down to a plain wall.
   *
   * **The echo pays nothing of its own.** No points, no capsule, no chip: it is
   * not a brick, it is a second face of one, and a double that dropped its own
   * loot would be the wall handing over twice for a wall it only has once.
   *
   * The collapse is taken before the lookup rather than after it, so a cell the
   * grid can no longer answer for still loses its echo. A surface with nothing
   * behind it is the one thing this may not leave standing.
   *
   * No cooldown, unlike the shadow below — and none is needed. A wedge is
   * pushed out of and stays there for several sub-steps, which is what
   * `umbraCooldown` is paying for; an echo is bounced out of on the axis it was
   * entered on and is gone from the field on the same tick, so there is nothing
   * left to graze.
   */
  private strikeEcho(echo: EchoContact): void {
    this.superposition.collapse(echo.row, echo.column);
    this.deps.sfx.superposeCollapse();
    const brick = this.grid.hitAtCell(echo.row, echo.column);
    if (brick === null) {
      return;
    }
    this.damageBrick(brick);
  }

  /**
   * UMBRA: a ball meeting a shadow, off its face and into its caster.
   *
   * **The wedge damages the brick that threw it**, which is the whole capsule
   * in one line: the wall can be worked from 96 px below itself, and a silver
   * or a gold ground down without the ball ever reaching the grid. Through
   * `damageBrick` on the ordinary `"ball"` path, so points, the capsule the
   * brick was holding, a live BLAST's splash, a live CHAIN's links and GRAVEL's
   * chips all pay out with no new branches — a shadow hit is a ball hit taken
   * at a distance, and everything that has ever hung off one hangs off this.
   *
   * It is a *hit* and not a kill, so granite still takes four.
   *
   * Three guards, and the middle one is the capsule's own.
   *
   * A ball passing through the wall is not stopped by what the wall is
   * throwing: GHOST makes the whole grid intangible and a shadow is the grid
   * reaching further down.
   *
   * **A wedge that overtook the ball pushes it clear and charges it nothing.**
   * The sun moves every tick, so a ball sitting in a lane can have a shadow
   * edge sweep onto it without ever having travelled into one — and swallowing
   * it would be the ball inside a surface with no way out. This is ERODE's
   * guard for ERODE's reason, arrived at from the opposite end: the mortar can
   * be held back from a ball and a sunrise cannot, so the ball is moved instead.
   *
   * And the cooldown, which is bookkeeping rather than design: one contact is
   * several sub-steps of overlap, and without it a graze would cost the brick
   * four hit points.
   *
   * PIERCE drills a shadow exactly as it drills the brick above it — the damage
   * is paid and the ball is not turned. A drill that bounced off the projection
   * of a brick it would have gone straight through is the capsule contradicting
   * itself 96 px lower down.
   */
  private strikeShadow(ball: Ball, phasing: boolean): void {
    if (phasing) {
      return;
    }
    const contact = this.shadows.contact(ball.x, ball.y, ball.size);
    if (contact === null) {
      return;
    }

    // Clear of the face either way, and half a pixel past it for the disc
    // kick's reason: at exactly the surface the next sub-step reads as a second
    // contact.
    ball.x += contact.normalX * (contact.depth + 0.5);
    ball.y += contact.normalY * (contact.depth + 0.5);

    const approach = ball.velocity.x * contact.normalX + ball.velocity.y * contact.normalY;
    if (approach >= 0) {
      return;
    }
    if (!this.timers.isActive("P")) {
      ball.velocity.x -= 2 * approach * contact.normalX;
      ball.velocity.y -= 2 * approach * contact.normalY;
      // A reflection preserves speed on paper, and a slanted one off a surface
      // that moves every tick is where that stops being true. Renormalised for
      // the disc kick's reason exactly.
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      if (speed > 0) {
        const scale = this.speed() / speed;
        ball.velocity.x *= scale;
        ball.velocity.y *= scale;
      }
    }
    // ENGLISH: the shot is delivered into the wall's own shadow, so it is
    // spent — the wall is what the curve was aimed at, and this is the wall.
    ball.spin = 0;

    if (ball.umbraCooldown > 0) {
      return;
    }
    ball.umbraCooldown = gameConfig.powerUps.umbra.contactCooldownTicks;
    const caster = this.grid.hitAtCell(contact.row, contact.column);
    if (caster === null) {
      return;
    }
    this.shadows.strike(contact.column, contact.row, ball.y + ball.size / 2);
    this.deps.sfx.umbraStrike();
    this.damageBrick(caster);
  }

  /**
   * The brick flashing as its band gets home.
   *
   * Drained after the field has been rebuilt, so a caster killed by its own
   * shadow this tick has already been taken out of `arrivals` by the effect —
   * the burst its death threw is a louder report than a flash, and two of them
   * on one cell would read as two hits.
   */
  private lightCasters(): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    for (const arrival of this.shadows.arrivals) {
      if (this.grid.hitAtCell(arrival.row, arrival.column) === null) {
        continue;
      }
      this.brickFlashes.push({
        x: left + arrival.column * brickWidth,
        // Wall coordinates, like every other brick flash: the renderer takes
        // QUAKE's drop off at paint time, and the per-cell sag has to be in or
        // a slumped wall lights the cell the brick used to be in.
        y: top + arrival.row * brickHeight + this.cellSag(arrival.row, arrival.column),
        ticksLeft: gameConfig.powerUps.umbra.flashTicks,
        kind: "umbra",
        onWall: true,
        gild: false,
      });
    }
  }

  /**
   * BLACKOUT arriving over a live UMBRA: the sun is sent down early.
   *
   * Through the capsule's own sunset rather than switched off — see
   * `ShadowCast.retire`. The timer is cut to match, so the POWER inset stops
   * claiming twenty seconds of a capsule that has half a second left, and the
   * expiry branch still fires at the end of it and does the bookkeeping.
   */
  private retireForUmbra(): void {
    if (!this.timers.isActive("UM")) {
      return;
    }
    this.shadows.retire();
    this.timers.activate("UM", gameConfig.powerUps.umbra.setTicks);
    this.deps.sfx.umbraSet();
  }

  /**
   * GHOST: whether this ball is passing through the wall on this tick.
   *
   * The capsule's timer arms the pass; the per-ball flag is what ends it. A ball
   * still overlapping a brick when the timer runs out keeps going until it is
   * clear — turning solid inside the grid would bounce it out of the middle of
   * the wall, or wedge it between two cells with nowhere to go.
   *
   * Called once per tick rather than per sub-step, so a ball that leaves and
   * re-enters the wall inside one tick finishes that tick intangible.
   */
  private ghosted(ball: Ball, capsuleLive: boolean): boolean {
    if (capsuleLive) {
      ball.phasing = true;
      return true;
    }
    if (ball.phasing && this.grid.findBallOverlap(ball.x, ball.y, ball.size) === null) {
      ball.phasing = false;
    }
    return ball.phasing;
  }

  /**
   * TEMPO's factor on its own, because the deck reads it too: BANANA's skid is
   * slowed by bullet time, and a skid still skating at full speed while the
   * balls ease into it would read as two clocks running at once. One expression,
   * one place — the blend is what makes that matter, since a hard 0.6 could be
   * written twice and still agree.
   */
  private tempoScale(): number {
    return 1 + (gameConfig.powerUps.tempoTimeScale - 1) * this.tempoBlend;
  }

  /**
   * How much of STASIS's hold is on the ball, against how much is on the ring.
   *
   * Two curves off one number: the ring closes over the whole blend while the
   * balls only brake over its second half, so a frozen field is entered by
   * coasting about 14 px into a ring already tightening around it rather than
   * by stopping dead the frame the capsule lands.
   */
  private stasisMotion(): number {
    return Math.max(0, Math.min(1, (this.stasisBlend - 0.5) * 2));
  }

  // All four clocks in one product: TEMPO slows, RUSH and TURBO speed, STASIS
  // takes it to a stop, and a field holding TEMPO and RUSH lands at 1.08 —
  // near-normal, which is the counter-play TEMPO is meant to be and wants no
  // special case. Displacement only, so stored velocities are untouched and any
  // of them expiring restores the true speed with nothing to unwind.
  //
  // Every factor is read off a blend rather than a timer, and each is exactly 1
  // at blend 0 — which is what lets a capsule that has not wound up yet, or has
  // wound back down, cost nothing without a branch of its own.
  private ballTimeScale(): number {
    const { rushTimeScale, turboTimeScale } = gameConfig.powerUps;
    return (
      this.tempoScale() *
      (1 + (rushTimeScale - 1) * this.rushBlend) *
      (1 + (turboTimeScale - 1) * this.turboSpool) *
      (1 - this.stasisMotion())
    );
  }

  /**
   * How far back the streak is smeared, which is the ground a ball actually
   * covers in a tick — a TEMPO in hand shortens it, and STASIS holding the
   * field ends it, because frozen balls cover nothing, both of which fall out
   * of the product for free.
   *
   * Whichever of the two smearing capsules is further along owns the length, so
   * the streak grows out of the sprite either way and neither jumps when the
   * other arrives or leaves. Written as the blend rather than as the bare
   * product on purpose: at blend 0 the product is 1, and a far copy 3.7 px
   * behind a level-15 ball would pop into being at three solid pixels of red
   * and only *then* start growing.
   */
  private ballTrail(): number {
    return this.ballTimeScale() * Math.max(this.rushBlend, this.turboSpool);
  }

  /**
   * TEMPO's debt, one tick of it: the displacement this ball did not cover on
   * the slowed clock, banked so the pace ghost can be spent forward off it.
   *
   * Derived, never simulated. A phantom flying free walks through bricks and
   * walls, and after a bounce — 55 px of travel in 12 ticks at level 15, against
   * a 37-62 tick trip from the deck to the grid — the pair diverges in
   * *direction* and the gap stops meaning speed at all. So anything that turns
   * the ball wipes the debt and the marker starts again from the sprite, which
   * is also the whole of "the ghost dies on the first bounce".
   *
   * It stops growing rather than resetting once the projection leaves the
   * field: zeroing it there would walk the ghost back out of the ball the very
   * next tick, over and over, on a ball that has done nothing.
   */
  private stepPaceDebt(ball: Ball, timeScale: number, wasVx: number, wasVy: number): void {
    if (this.tempoBlend === 0) {
      return;
    }
    if (!ball.active || ball.stuckOffsetX !== null || ball.velocity.x !== wasVx || ball.velocity.y !== wasVy) {
      ball.tempoDebt = 0;
      return;
    }
    if (paceGhost(ball, this.tempoBlend) !== null || ball.tempoDebt === 0) {
      ball.tempoDebt += 1 - timeScale;
    }
  }

  /**
   * ENGLISH: the deck's travel at the moment of contact, banked on the ball.
   *
   * Replaces whatever was there rather than adding to it. The deck has just hit
   * this ball, so what the deck was doing *is* the shot — and that makes a
   * straight-bat return a real move, because it is the one way to take the spin
   * back off a ball that is carrying some.
   *
   * The sign is the obvious one and has to be: a deck sliding right bends the
   * ball right. Anything cleverer would be a control the player cannot learn by
   * doing it once.
   */
  private putEnglishOn(ball: Ball): void {
    const { perPixel, maxSpinRad, minPaddleVx } = gameConfig.powerUps.english;
    // The deadzone, and it cuts both ways: under it the deck was tracking the
    // ball rather than whipping at it, so the return is straight *and* clean.
    if (Math.abs(this.paddleVx) < minPaddleVx) {
      ball.spin = 0;
      return;
    }
    ball.spin = Math.max(-maxSpinRad, Math.min(maxSpinRad, this.paddleVx * perPixel));
    this.deps.sfx.englishWhip(Math.abs(ball.spin) / maxSpinRad);
  }

  /**
   * One tick of the curve, and one tick of it running out.
   *
   * Rotation at constant speed, which is what a Magnus force on a ball that
   * cannot slow down comes to — the same trick `glitchBall` and `steerBall`
   * both do, for the third reason: the player bought an arc, not a boost.
   *
   * The decay is spent whether or not the turn lands, so the shot has a fixed
   * life however it is spent. Below `minSpinRad` the arc is under a tenth of a
   * degree a tick — less than the sprite can show — so it is dropped outright,
   * which is also what puts the last fleck out.
   *
   * A heading that would come out flatter than the floor simply does not turn
   * this tick. HOMING's answer rather than HAYWIRE's, because this is HOMING's
   * situation: the spin is still there, the next bounce hands it a heading it
   * can bend, and the arc resumes. HAYWIRE could not skip because it had fired
   * sparks over the tick; nothing here has announced anything.
   */
  private curveBall(ball: Ball): void {
    const { decay, minSpinRad, minVerticalFraction } = gameConfig.powerUps.english;
    // A glued ball has no heading to bend, and bending the stored velocity would
    // hand back a launch angle the player never chose.
    if (ball.stuckOffsetX !== null) {
      return;
    }
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed === 0) {
      return;
    }
    const turn = ball.spin;
    const curved = Math.atan2(ball.velocity.y, ball.velocity.x) + turn;
    ball.spin *= decay;
    if (Math.abs(ball.spin) < minSpinRad) {
      ball.spin = 0;
    }
    if (Math.abs(Math.sin(curved)) < minVerticalFraction) {
      return;
    }
    // Below the floor test, and advanced by the turn that was actually
    // delivered: a tick spent refusing a flat heading is a tick the flecks do
    // not move either. They are showing the curve, not the capsule.
    ball.spinPhase += turn;
    ball.velocity.x = Math.cos(curved) * speed;
    ball.velocity.y = Math.sin(curved) * speed;
  }

  /**
   * SNAP: the heading a bounce just produced, put on the nearest diagonal.
   *
   * Speed is untouched, which is what makes this a *quantiser* and not a
   * capsule about pace: the ball covers exactly the ground it was going to,
   * along one of four headings instead of a continuum of them. What the player
   * buys is that a bank shot can be called before it is taken.
   *
   * **The paddle still chooses.** `computePaddleBounceVelocity` fans the return
   * across 1.05 rad either side of vertical, and the sign of that fan is what
   * this reads: hit the ball left of centre and it leaves up-left, right of
   * centre and it leaves up-right. The capsule takes the fine control away and
   * leaves the coarse one, which is the trade.
   *
   * A rebound with no lateral component at all — straight up off the middle of
   * the deck, straight down off the ceiling — has no side to fall on, so it is
   * sent toward the middle of the field. Away from the near wall rather than
   * toward it, because the alternative is a ball that snaps into the corner it
   * was already closest to and rattles there.
   */
  private snapBall(ball: Ball): void {
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed === 0) {
      return;
    }
    const lateral = Math.sign(ball.velocity.x) || (ball.centerX < gameConfig.field.width / 2 ? 1 : -1);
    // A ball with no vertical component is heading along the floor; up is the
    // only answer that is not a slow loss.
    const vertical = Math.sign(ball.velocity.y) || -1;
    ball.velocity.x = lateral * speed * Math.SQRT1_2;
    ball.velocity.y = vertical * speed * Math.SQRT1_2;
    // The mark is pushed here rather than at each bounce site for the reason the
    // hook itself is one test: whatever turned the ball, this is the moment the
    // diagonal was decided, and that is what the bracket is pointing at.
    this.snapMarks.push({
      x: ball.centerX,
      y: ball.y + ball.size / 2,
      dirX: lateral,
      dirY: vertical,
      ticksLeft: gameConfig.powerUps.snap.markTicks,
    });
  }

  private moveBall(ball: Ball, index: number, timeScale: number): void {
    // Guidance, then physics. Anything that bends a ball without touching its
    // speed belongs here, once per tick — never inside the sub-step loop, where
    // a fast ball would be steered four times and a slow one once.
    //
    // The core goes first because it is physics; HOMING is aim, and it gives way
    // wherever the core has real hold of the ball.
    const insideCore = this.pullIntoCores(ball, index);
    // Second, and above HOMING because it is the same kind of thing the core is:
    // a spinning ball curves whether or not anything is aiming it, and the
    // capsule that put the spin there may already have expired. Gated on the
    // ball and not on the timer for exactly that reason.
    if (ball.spin !== 0) {
      this.curveBall(ball);
    }
    if (this.timers.isActive("H") && !insideCore) {
      this.steerBall(ball);
    }
    // Last of the three, and deliberately after HOMING: a capsule whose whole
    // job is to take the player's aim away has to be able to take the game's
    // too. Caught together, HOMING re-aims at its brick every tick and HAYWIRE
    // knocks it off every fifteen — the ball wanders and still finds bricks,
    // which is the honest sum of the two rather than either of them winning.
    if (this.haywireKicking) {
      this.glitchBall(ball);
    }
    // Fourth, and last of the things that act on a heading before it is walked.
    // It is the only one of them that is a *force* — the three above bend a
    // heading at unchanged speed, and the water pushes — which is why it is here
    // rather than inside the sub-step loop: an acceleration applied per sub-step
    // would be four times as strong on a fast ball as on a slow one.
    if (this.tideBlend > 0) {
      this.floatBall(ball);
    }
    const stepVx = ball.velocity.x * timeScale;
    const stepVy = ball.velocity.y * timeScale;
    const subSteps = Math.max(1, Math.ceil(Math.max(Math.abs(stepVx), Math.abs(stepVy)) / 2));
    const dx = stepVx / subSteps;
    const dy = stepVy / subSteps;
    const { left, right, top, height } = gameConfig.field;
    const size = ball.size;
    const pierce = () => this.timers.isActive("P");
    const { wallKeep } = gameConfig.powerUps.english;
    const phasing = this.ghosted(ball, this.timers.isActive("GH"));
    // Neither deck can move between sub-steps — the paddle only moves on input —
    // so both are cut once per tick rather than per sub-step. The ghost is split
    // wherever the paddle is: it is the paddle's reflection, and a solid ghost
    // over a broken deck would be a surface the player cannot read.
    // The blend and not the timer: the ghost is a surface from the tick it is
    // first drawn, and stops being one on the tick it stops being drawn. The
    // after-image that outlives it deliberately does not appear here.
    const mirror = this.mirrorSegments();
    const deck = this.paddleSegments();
    const { portalInset } = gameConfig.powerUps;
    const mouth = this.portalMouth();
    if (ball.portalCooldown > 0) {
      ball.portalCooldown--;
    }
    if (ball.umbraCooldown > 0) {
      ball.umbraCooldown--;
    }
    // Beside the cooldown, and below the same gates: a MULTI caught on the tick
    // a NUKE goes off leaves its newborns 4 px wide until the shockwave has
    // finished. Every ball on the field is frozen behind it anyway.
    if (ball.birthTicksLeft > 0) {
      ball.birthTicksLeft--;
    }

    // The order every sub-step runs in, and the one the rest of the wave writes
    // into: bricks -> bumpers -> mirror ceiling -> portal transit -> wall clamp
    // -> paddle. Anything that moves a ball without bouncing it goes above the
    // clamps; anything that bounces it goes below whatever it bounces off.
    //
    // The frame and the paddle also zero the bumper streak wherever they touch
    // the ball: a ball that reached either of them is not wedged between discs.

    // SNAP: whether the rebounds this tick land on the 45-degree lattice. Read
    // once per tick like the decks above it, since a timer cannot expire between
    // two sub-steps.
    const snapping = this.timers.isActive("SN");

    let drilling = false;
    for (let i = 0; i < subSteps; i++) {
      // What the ball was doing before anything in this sub-step touched it.
      // One reading at the top and one test at the foot is the whole of SNAP's
      // hook into the physics: six different things in this loop can turn a
      // ball — bricks, discs, the ghost ceiling, the three walls, the deck and
      // the barrier — and a call bolted onto each of them would be six places
      // for the seventh to be forgotten.
      const wasVx = ball.velocity.x;
      const wasVy = ball.velocity.y;
      ball.x += dx;
      let hit = phasing ? null : this.grid.findBallOverlap(ball.x, ball.y, size);
      // SUPERPOSE's echo, tested on the axis the brick was tested on and only
      // where the brick missed: a ball already turned by a brick on this
      // sub-step cannot be turned again by that brick's own double, which is
      // what `hit` being live rules out — UMBRA's guard, for UMBRA's reason.
      //
      // **And only on an axis the ball actually moved along.** Unlike a brick,
      // an echo is spent by the contact that finds it, so a test on a zero
      // delta is not the harmless double-check it is above: a ball running
      // flat along a rally has `dy` of 0, and testing y anyway would collapse
      // the pair against a velocity there is nothing to reverse — the player
      // pays for a double they never hit and the bounce lands on neither axis.
      let echo = dx !== 0 && hit === null && !phasing ? this.superposition.overlap(ball.x, ball.y, size) : null;
      if (echo !== null) {
        if (pierce()) {
          drilling = true;
        } else {
          ball.x -= dx;
          ball.velocity.x = -ball.velocity.x;
        }
        ball.spin = 0;
        this.strikeEcho(echo);
      }
      if (hit) {
        if (pierce()) {
          drilling = true;
        } else {
          ball.x -= dx;
          ball.velocity.x = -ball.velocity.x;
        }
        // ENGLISH: the shot is delivered, so it is spent. A curve is aimed at a
        // brick, and one that survived the brick would go on bending the ball
        // round the wall for the rest of the rally — the arc has to end where it
        // was pointed. Above the pierce branch and not inside it: a drill that
        // kept its spin would corkscrew through the wall on a single whip.
        ball.spin = 0;
        this.strikeBricks(ball, hit);
      }

      ball.y += dy;
      hit = phasing ? null : this.grid.findBallOverlap(ball.x, ball.y, size);
      echo = dy !== 0 && hit === null && !phasing ? this.superposition.overlap(ball.x, ball.y, size) : null;
      if (echo !== null) {
        if (pierce()) {
          drilling = true;
        } else {
          ball.y -= dy;
          ball.velocity.y = -ball.velocity.y;
        }
        ball.spin = 0;
        this.strikeEcho(echo);
      }
      if (hit) {
        if (pierce()) {
          drilling = true;
        } else {
          ball.y -= dy;
          ball.velocity.y = -ball.velocity.y;
        }
        ball.spin = 0;
        this.strikeBricks(ball, hit);
      }

      // UMBRA's wedges, directly under the bricks they hang off and above
      // everything free-standing: a shadow is not a thing on the field, it is
      // the wall reaching 96 px further down than it is standing. A ball that
      // has already been turned by the brick on this sub-step cannot be turned
      // again by that brick's own shadow, which is what `hit` being live here
      // rules out.
      if (hit === null && this.shadows.solid) {
        this.strikeShadow(ball, phasing);
      }

      // A disc is a free-standing thing to bounce off, so it sits with the
      // bricks rather than with the frame.
      if (this.bumpers.active && this.kickOffBumpers(ball)) {
        this.bumpers.streak++;
        if (this.bumpers.streak >= gameConfig.powerUps.bumpers.streakLimit) {
          this.timers.deactivate("O");
          // `retire` and not `reset`, and it has to be said here: `deactivate`
          // puts nothing in `expired`, so the expiry branch never runs for this
          // one. The ball is released on this tick either way — the discs stop
          // being read the moment they start leaving — and this is what buys
          // the departure being seen as well as taken.
          this.bumpers.retire();
        }
      }

      // The paddle test upside down, over the same 10 px window. A ball that
      // misses the ghost sideways falls through to the ceiling clamp below and
      // ricochets flat, exactly as it always has.
      const mirrorCatch =
        mirror !== null && ball.velocity.y < 0 && ball.y >= top
          ? (mirror.find((half) => ball.y <= half.bottom && ball.x + size > half.left && ball.x < half.right) ?? null)
          : null;
      if (mirrorCatch) {
        const relativeHit = relativePaddleHit(ball.centerX, mirrorCatch);
        const bounced = computePaddleBounceVelocity(relativeHit, this.speed(), gameConfig.bounce.maxAngleRad);
        ball.velocity.x = bounced.x;
        // Downward: the ghost returns balls into the field, not out of it.
        ball.velocity.y = Math.abs(bounced.y);
        ball.y = mirrorCatch.bottom;
        this.bumpers.streak = 0;
        this.deps.sfx.mirrorBounce(relativeHit);
      }

      // A transit replaces the bounce the ball would otherwise have taken, which
      // is why it sits above the clamps. Neither `y` nor `velocity` is touched,
      // so the ball arrives at the same height on the same heading.
      if (mouth.height > 0 && ball.portalCooldown === 0) {
        const center = ball.y + size / 2;
        // Exclusive at the bottom, so the hole a ball is let through is exactly
        // the rows that are painted — inclusive it was 49 px against a 48 px
        // door, and the odd pixel was the one at the very edge of the mouth.
        const inMouth = center >= mouth.top && center < mouth.top + mouth.height;
        const leftward = ball.x <= left && ball.velocity.x < 0 ? right - size - portalInset : null;
        const rightward = ball.x >= right - size && ball.velocity.x > 0 ? left + portalInset : null;
        const landing = leftward ?? rightward;
        if (inMouth && landing !== null) {
          ball.x = landing;
          ball.portalCooldown = gameConfig.powerUps.portalCooldownTicks;
          this.deps.sfx.portalWarp();
        }
      }

      // ENGLISH: a bounce off the frame mirrors the spin and takes half of it —
      // `wallKeep` is one negative number because those are one fact. All three
      // walls and not just the two vertical ones: a reflection reverses
      // handedness whichever way the surface lies, so a ball curving right off
      // the ceiling comes back curving left. The half is what stops a hard whip
      // surviving the rally it was thrown in.
      //
      // **Guarded on the velocity it is about to turn, and it has to be.** `dx`
      // and `dy` are fixed for the whole tick, so a ball parked on a wall by one
      // sub-step is walked back into it by every later one and re-clamped — at
      // base speed that is two sub-steps and so two clamps per bounce. The three
      // lines under each guard are all idempotent (`Math.abs` of an already
      // positive number, a streak already zero); a multiply is not, and unguarded
      // it quartered the spin on the commonest bounce in the game.
      if (ball.x <= left) {
        ball.x = left;
        if (ball.velocity.x < 0) {
          ball.spin *= wallKeep;
        }
        ball.velocity.x = Math.abs(ball.velocity.x);
        this.bumpers.streak = 0;
        this.deps.sfx.wallBounce();
      }
      if (ball.x >= right - size) {
        ball.x = right - size;
        if (ball.velocity.x > 0) {
          ball.spin *= wallKeep;
        }
        ball.velocity.x = -Math.abs(ball.velocity.x);
        this.bumpers.streak = 0;
        this.deps.sfx.wallBounce();
      }
      if (ball.y <= top) {
        ball.y = top;
        if (ball.velocity.y < 0) {
          ball.spin *= wallKeep;
        }
        ball.velocity.y = Math.abs(ball.velocity.y);
        this.bumpers.streak = 0;
        this.deps.sfx.wallBounce();
      }

      const paddleTop = this.paddle.y;
      // Which half of the deck took it, or null. Solid, that list is one box and
      // this is the test it has always been; split, a ball down the middle finds
      // neither half and carries on into the drain — which is the whole capsule.
      const paddleCatch =
        ball.velocity.y > 0 && ball.y + size >= paddleTop && ball.y + size <= paddleTop + gameConfig.paddle.height + 3
          ? (deck.find((half) => ball.x + size > half.left && ball.x < half.right) ?? null)
          : null;
      if (paddleCatch) {
        this.bumpers.streak = 0;
        if (this.timers.isActive("G")) {
          // GLUE: the ball parks on the paddle; a click (or Space) releases it.
          ball.velocity = { x: 0, y: 0 };
          ball.stuckOffsetX = this.clampStuckOffset(ball.x - this.paddle.x, ball.size);
          ball.x = this.paddle.x + ball.stuckOffsetX;
          ball.y = paddleTop - size;
          this.deps.sfx.wallBounce();
          return;
        }
        // Measured against the half that caught it, so each one throws its own
        // full fan: the inner edges fire hard across the hole, the outer edges
        // hard toward the walls.
        const relativeHit = relativePaddleHit(ball.centerX, paddleCatch);
        ball.velocity = computePaddleBounceVelocity(relativeHit, this.speed(), gameConfig.bounce.maxAngleRad);
        ball.y = paddleTop - size;
        this.deps.sfx.paddleBounce(relativeHit);
        // Below the bounce, because the spin is put on the heading the deck just
        // gave the ball rather than on the one it arrived with. MIRROR's ceiling
        // deliberately does not do this: the ghost is a reflection of where the
        // paddle *is*, not of what it is doing, and english off a surface the
        // player is not holding would be a curve nobody threw.
        if (this.timers.isActive("EN")) {
          this.putEnglishOn(ball);
        }
      }

      if (this.wallArmed && ball.velocity.y > 0 && ball.y + size >= gameConfig.powerUps.wallY) {
        this.wallArmed = false;
        // The save is the whole of y 294 from the catch frame, and has to be:
        // WALL's signature moment is catching it with a ball already past the
        // deck, and refusing that because the picture had not finished drawing
        // would be a life taken by an animation. So when the strike lands
        // outside the reach the bar had written, the bar completes itself in
        // the instant it pays — which is what a barrier catching a ball at a
        // point it had not reached should look like, and leaves the picture
        // never claiming less than it can do.
        const reach = (gameConfig.field.right - gameConfig.field.left) * this.wallBlend;
        if (Math.abs(ball.centerX - this.wallOriginX) > reach) {
          this.wallBlend = 1;
        }
        // The strike is the origin, so the last pixel to go out is the one
        // under the ball it saved. Collapsing toward the field's centre instead
        // would spend it where nothing happened.
        this.wallOriginX = ball.centerX;
        this.wallStrikeLeft = gameConfig.effects.wallStrikeTicks;
        ball.y = gameConfig.powerUps.wallY - size;
        ball.velocity.y = -Math.abs(ball.velocity.y);
        this.deps.sfx.energyWallBounce();
      }

      if (ball.y > height) {
        // ANGEL, on the far side of the line the ball is lost at: the catch
        // that cancels the loss and serves it straight back. Only ever the last
        // ball on the field — the dying one still counts itself in this test —
        // because a charge spent while eleven others are in flight is a charge
        // nobody saw being spent.
        //
        // WALL never has to be arbitrated against: its line is at 294, so an
        // armed barrier has already turned this ball around 6 px above here.
        if (this.angelCharged && this.balls.filter((other) => other.active).length === 1) {
          this.angelCharged = false;
          ball.y = gameConfig.powerUps.angelReturnY;
          ball.launch(this.speed());
          this.particles.burst(ball.centerX, ball.y + size / 2, "S", gameConfig.effects.angelBurst);
          this.catchPops.push({
            // Clamped like every other pop: a label centred on a ball against
            // the wall would hang off the frame.
            x: Math.max(40, Math.min(332, ball.centerX)),
            y: this.freeCatchPopY(),
            label: "SAVED",
            malus: false,
            ticksLeft: gameConfig.powerUps.catchPopLifeTicks,
          });
          this.deps.sfx.angelSave();
          return;
        }
        ball.active = false;
        return;
      }

      // The foot of the sub-step: if anything turned the ball, the heading it
      // leaves on is a diagonal. Deliberately not gated on *what* turned it —
      // a rebound off a bumper is as much a rebound as one off the deck — and
      // deliberately after the loss test, which returns, so a ball leaving the
      // field is never snapped on its way out.
      if (snapping && (ball.velocity.x !== wasVx || ball.velocity.y !== wasVy)) {
        this.snapBall(ball);
      }
    }

    // One shower per tick however many sub-steps ground through something: the
    // cue is "the ball is drilling", not a per-contact count, and a fast ball
    // spraying four bursts a tick would read as an explosion.
    if (drilling) {
      this.emitPierceSparks(ball);
    }
  }

  /**
   * PIERCE's whole picture: sparks off the ball while it is inside a brick, and
   * nothing at any other moment — the ball itself is never restyled.
   *
   * The shower's size is the capsule's clock. It grows over the first
   * `riseTicks` (the drill spinning up) and starves over the last `fallTicks`,
   * so the player watches the bite going out of it while it still works —
   * there is no sprite change to round off, so the thinning showers are the
   * whole departure warning. Never below one spark: a silent drill on a brick
   * that dies without a bounce reads as a collision bug, not as an ending.
   */
  private emitPierceSparks(ball: Ball): void {
    const { burst, riseTicks, fallTicks } = gameConfig.effects.pierceSparks;
    const remaining = this.timers.remaining("P");
    const elapsed = POWER_UP_DURATIONS.P - remaining;
    const intensity = Math.min(elapsed / riseTicks, remaining / fallTicks, 1);
    this.particles.sparkBurst(ball.centerX, ball.y + ball.size / 2, {
      ...burst,
      chunkCount: Math.max(1, Math.round(burst.chunkCount * intensity)),
    });
  }

  /**
   * The width of SPLIT's hole, or 0 while the deck is whole. One reading,
   * shared by the catch tests, the ghost, a glued ball and the renderer, so the
   * gap a ball falls through is the gap the player is looking at.
   *
   * **Derived from the width, not eased on a clock of its own.** The deck's
   * surplus over two 20 px halves is the most it can ever open by, and the gap
   * is a fraction of that: `gap = min(surplus, 26) * blend`. Equivalently, the
   * *half* is what is being interpolated — from half the whole deck down to the
   * 20 px SPLIT leaves — and the hole is what falls out of the arithmetic.
   *
   * Which means `half` can never go under 20, because it is `(width - gap) / 2`
   * and the gap is bounded by the width's own surplus. A gap eased on a clock
   * of its own against SHA-85's width ease has no such floor: SPLIT caught over
   * a live JAMMER telescopes out from 30 px while a 26 px hole opens, and around
   * tick 5 that asks for halves of 15 — a negative-width sheen painted leftward
   * over the cap. There is no second clock here, so there is nothing to fall out
   * of step with, and it composes with WIDE, XWIDE and JAMMER for nothing: a
   * deck too narrow to hold two halves has no surplus, so it simply does not
   * open, and widens into its tear instead.
   *
   * The 26 is the ceiling and not the size. Undamped, a SPLIT caught over a live
   * XWIDE would open a 104 px hole on the way down from 144 — a void nobody
   * designed, in place of the width playtest actually measured. Clamped, the
   * hole is the authored one and the halves ride in from 59 px to 20 as the deck
   * retracts, which is the same event told the right way round.
   *
   * Even, so both halves land on whole pixels — `spriteBrush` rounds a sprite's
   * position but not its size, and an odd gap stands each half's sheen on a half
   * pixel for the length of the tear.
   */
  private splitGap(): number {
    if (this.splitBlend === 0) {
      return 0;
    }
    const { splitWidth, splitGap } = gameConfig.paddle;
    const surplus = this.paddle.width - (splitWidth - splitGap);
    if (surplus <= 0) {
      return 0;
    }
    return 2 * Math.round((Math.min(surplus, splitGap) * this.splitBlend) / 2);
  }

  // The deck under tension with nothing open yet: the first ticks of a tear,
  // the last of a weld, and the whole of a SPLIT caught on a deck too narrow to
  // hold two halves. Drawn as a hairline down the middle, because a deck that
  // has been split and shows nothing is the trap failing to say it landed.
  private splitCracking(): boolean {
    return this.splitBlend > 0 && this.splitGap() === 0;
  }

  // A deck, as the pieces that actually catch things: one box whole, two while
  // SPLIT holds. Applied to the paddle and to MIRROR's ghost alike.
  private splitSegments(bounds: RectangleBounds, gap = this.splitGap()): RectangleBounds[] {
    if (gap === 0) {
      return [bounds];
    }
    const half = (bounds.right - bounds.left - gap) / 2;
    return [
      { ...bounds, right: bounds.left + half },
      { ...bounds, left: bounds.right - half },
    ];
  }

  private paddleSegments(): RectangleBounds[] {
    return this.splitSegments(this.paddle.bounds);
  }

  /**
   * The ghost, as the pieces that actually return balls — or `null` while there
   * is no reflection to return them.
   *
   * Narrowed about the mirrored centre by `mirrorSpan` and holed by `mirrorGap`,
   * the two functions the renderer draws through, so the surface the ball meets
   * and the surface on screen cannot come apart.
   *
   * Cut once a tick rather than per sub-step, like the deck below it and for the
   * same reason — neither surface moves between sub-steps.
   */
  private mirrorSegments(): RectangleBounds[] | null {
    if (this.mirrorForm === 0) {
      return null;
    }
    const full = mirrorBounds(this.paddle.x, this.paddle.width);
    const span = mirrorSpan(this.paddle.width, this.mirrorForm);
    const center = (full.left + full.right) / 2;
    const narrowed = { ...full, left: center - span / 2, right: center + span / 2 };
    return this.splitSegments(narrowed, mirrorGap(this.splitGap(), span, this.paddle.width));
  }

  /**
   * One tick of the telescope, and the rail JAMMER took back.
   *
   * The marks are read off the move rather than computed from the capsule: what
   * is drawn is the span the deck occupied a tick ago and does not now, which
   * is right at a wall too, where `clampX` pins one end and the whole retreat
   * happens at the other.
   *
   * Only JAMMER leaves them. A reward retracting at expiry is the player's own
   * timer running out and needs no monument; a trap taking the wood away is the
   * thing being said, and the mark is how long you can still see where it was.
   */
  private stepDeckWidth(): void {
    if (!this.paddle.easingWidth) {
      return;
    }
    const wasLeft = this.paddle.x;
    const wasRight = this.paddle.x + this.paddle.width;
    this.paddle.stepWidth();
    if (this.widthEaseKind !== "J") {
      return;
    }
    const { railMarkTicks } = gameConfig.paddle;
    if (this.paddle.x > wasLeft) {
      this.railMarks.push({ x: wasLeft, width: this.paddle.x - wasLeft, ticksLeft: railMarkTicks });
    }
    const right = this.paddle.x + this.paddle.width;
    if (right < wasRight) {
      this.railMarks.push({ x: right, width: wasRight - right, ticksLeft: railMarkTicks });
    }
  }

  // The deck, now, with no travel left in it: every reset site takes this and
  // not the ease. Beside it goes the rail it marked — a run that has ended owes
  // the next one a clean rail.
  /**
   * TIDE, a tick at a time: the sea in or out, the swell turning, and the deck
   * put wherever the two of them leave it.
   *
   * **The drain is spent out of the capsule's own 480 ticks**, the way PORTAL's
   * door is and for a harder version of its reason: the mouth was one hitbox and
   * this is three. A sea still draining after the timer had expired would leave
   * the deck floating over a field with nothing under it, and a ball in a column
   * of water no capsule was paying for.
   *
   * A second TIDE over a live one tops the sixteen seconds up and changes nothing
   * else. The sea is already in and the blend is already 1; there is no arrival
   * to restart, because the arrival is the water rising and the water is here.
   */
  private stepTide(): void {
    const { tideFloodTicks, tideDrainTicks, tideDripTicks } = gameConfig.effects;
    const flooding = this.tideFlooding();
    const was = this.tideBlend;
    // `stepBlend` with a different count each way, which is what the two ends
    // being different shapes costs: water arrives all at once and leaves through
    // a hole, so the drain is the slower of the two.
    this.tideBlend = stepBlend(this.tideBlend, flooding, flooding ? tideFloodTicks : tideDrainTicks);
    // The swell runs while there is a sea to run in and is *not* reset until
    // there is none, so a second TIDE caught on a draining one picks the heave
    // up where it was rather than snapping the deck to the top of a fresh one.
    this.tidePhase = this.tideBlend === 0 ? 0 : this.tidePhase + 1;
    // Fired on the frame the plug is pulled rather than at the expiry, the way
    // PORTAL's two cuts are: the gurgle is scored to the fifty ticks the sea
    // takes to go, so it ends as the deck touches down.
    if (was === 1 && this.tideBlend < 1) {
      this.deps.sfx.tideDrain();
    }
    if (was > 0 && this.tideBlend === 0) {
      this.tideDrip = 1;
    } else if (this.tideDrip > 0) {
      this.tideDrip = stepBlend(this.tideDrip, false, tideDripTicks);
    }
    this.paddle.y = this.deckY();
  }

  /**
   * Whether the sea is still coming in — which is the capsule's whole clock,
   * because the last fifty ticks of the sixteen seconds are the drain.
   *
   * Both halves of the test, exactly as PORTAL's door reads them: the second is
   * what spends the drain out of the capsule's own 480 ticks instead of
   * borrowing fifty it does not own, and the blends step above `timers.tick()`,
   * so the last fall lands on the same frame the timer reaches zero.
   */
  private tideFlooding(): boolean {
    return this.timers.isActive("TI") && this.timers.remaining("TI") > gameConfig.effects.tideDrainTicks;
  }

  /**
   * Where the sea's surface is, in field pixels.
   *
   * It climbs from the frame's bottom line rather than appearing at its level:
   * at blend 0 the surface *is* the floor, which is why a dry field needs no
   * branch anywhere that reads this — nothing is ever under it. At blend 1 it is
   * `waterline`, and the deck's own bottom edge sits exactly on it.
   */
  private waterline(): number {
    const { height } = gameConfig.field;
    return height - (height - gameConfig.powerUps.tide.waterline) * this.tideBlend;
  }

  /**
   * The deck's top edge this tick: the rail, or the water if the water is
   * higher.
   *
   * `Math.min` and not a branch on the capsule, and that is the whole design of
   * the lift. The capsule raises the sea and the deck answers to the sea, so the
   * deck is picked up when the water reaches it and set down when the water
   * leaves — including the frame it is half under, which the sprite gets for
   * free because the wash is painted over whatever is below the surface.
   *
   * The bob is scaled by the flood so the deck settles onto a swell rather than
   * starting to heave the instant it floats, and it can never push the deck
   * below the rail, because the rail is the floor of the `min`.
   */
  private deckY(): number {
    const rest = gameConfig.paddle.y;
    if (this.tideBlend === 0) {
      return rest;
    }
    const { bobAmplitude, bobPeriodTicks, draft } = gameConfig.powerUps.tide;
    const bob = Math.sin((this.tidePhase / bobPeriodTicks) * Math.PI * 2) * bobAmplitude * this.tideBlend;
    return Math.min(rest, this.waterline() - gameConfig.paddle.height + draft + bob);
  }

  /**
   * TIDE's buoyancy: one ball, pushed back out of the water.
   *
   * **A force and not a time scale.** It is deliberately outside
   * `ballTimeScale()` — that product is TEMPO, RUSH, TURBO and STASIS arguing
   * about the pace of the run, and the water is not an opinion about pace — so
   * this composes with all four for nothing and stores nothing on the ball that
   * would have to be unwound when the sea goes. A ball still rising when the
   * water drains out from under it is simply a ball rising.
   *
   * **The guarantee is arithmetic, not a clamp.** The fastest the game ever runs
   * is 4.6 px a tick; at 0.14 a tick squared that turns round inside 76 px, and
   * the surface is 120 px above the floor. Nothing has to check for the floor
   * because nothing can reach it — which is the difference between this and WALL
   * or ANGEL, both of which catch a ball at a line and are spent doing it.
   *
   * The speed is capped rather than renormalised. A cap lets the water genuinely
   * slow a diving ball to nothing at the turn — the soup the player cannot steer
   * through — while keeping the run's own speed as the ceiling everything else
   * in the game is written against.
   */
  private floatBall(ball: Ball): void {
    if (ball.y + ball.size / 2 < this.waterline()) {
      return;
    }
    const { lift, drag } = gameConfig.powerUps.tide;
    ball.velocity.y -= lift;
    ball.velocity.x *= drag;
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    const ceiling = this.speed();
    if (speed > ceiling) {
      ball.velocity.x = (ball.velocity.x / speed) * ceiling;
      ball.velocity.y = (ball.velocity.y / speed) * ceiling;
    }
  }

  private snapDeck(): void {
    this.widthEaseKind = null;
    this.railMarks = [];
    // The sea too, and with it whatever it was holding up. A serve, a cleared
    // level and a game over all land here, and a deck left floating over a field
    // that has been reset is the one piece of this capsule that would outlive
    // the run it was caught in. It goes with the width rather than with the
    // blends the three reset sites list, because where the deck is has never
    // been anything but the deck's business.
    this.tideBlend = 0;
    this.tidePhase = 0;
    this.tideDrip = 0;
    this.paddle.y = gameConfig.paddle.y;
    // The tear too, and silently: a serve, a cleared level and a game over all
    // land here, and a deck welding itself shut behind the CLEARED overlay —
    // with the spark and the sound that go with it — is an effect outliving the
    // run that earned it.
    this.splitBlend = 0;
    this.splitWeldTicks = 0;
    this.paddle.snapWidth(gameConfig.paddle.baseWidth);
  }

  /**
   * Where a glued ball may sit on the deck, as an offset from its left edge.
   *
   * Whole, that is the length that keeps the ball on the wood. Split, it is the
   * two halves, and a ball caught over the hole — or standing where a hole has
   * just opened under it — slides to the inner edge of the nearer one. A ball
   * hovering in mid-air over the gap would be GLUE contradicting SPLIT.
   */
  private clampStuckOffset(offset: number, size: number): number {
    const rightmost = this.paddle.width - size;
    const gap = this.splitGap();
    if (gap === 0) {
      return Math.max(0, Math.min(offset, rightmost));
    }
    const leftEdge = (this.paddle.width - gap) / 2 - size;
    const rightEdge = this.paddle.width - (this.paddle.width - gap) / 2;
    if (offset <= leftEdge) {
      return Math.max(0, offset);
    }
    if (offset >= rightEdge) {
      return Math.min(offset, rightmost);
    }
    return offset - leftEdge < rightEdge - offset ? leftEdge : rightEdge;
  }

  /**
   * One capsule out of the brick that was holding it, and the beep for it.
   *
   * `forced` is the level's own capsule rather than a rolled one: it takes a
   * slot in a full pool, since a promise that can be lost to six airborne pills
   * is not one. Returns whether it made it out — nothing does today when the
   * pool refuses an ordinary drop, but MAGNET's guarantee is spent on the answer.
   */
  private spawnCapsule(hit: BrickHit, kind: PowerUpKind, forced: boolean): boolean {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    if (!this.dropPool.trySpawn(kind, left + hit.column * brickWidth, top + hit.row * brickHeight, forced)) {
      return false;
    }
    this.deps.sfx.capsuleSpawn();
    return true;
  }

  /**
   * The capsule a brick removed outright still owes the level.
   *
   * NUKE, ZAP, the critter and a meteor all bypass `damageBrick` — full points,
   * no drops — and that carve-out is right for a rolled capsule, which is a
   * chance and not a debt. A seeded one is the level's difficulty valve: SUPER
   * MAZE without its two LASERs is 53 four-hit bricks and a ball, so a bomb
   * landing on one of them releases it rather than swallowing it.
   */
  private releaseSeededCapsule(hit: BrickHit): void {
    if (hit.cell.seeded && hit.cell.capsule !== null) {
      this.spawnCapsule(hit, hit.cell.capsule, true);
    }
  }

  /**
   * `amount` is what comes off, and it is a parameter for one caller only:
   * TWIN's partner, which owes *the same damage* the struck brick took rather
   * than the damage its own kind would have taken from the same source. A laser
   * drilling a granite for two and its plain partner chipping for one would be
   * the capsule quietly not meaning what it says, and it is reachable — the
   * cannons are the one thing on the board whose damage depends on what it hit.
   */
  private damageBrick(hit: BrickHit, source: BrickDamageSource = "ball", amount?: number): void {
    // What the source takes off. Only granite reads anything but 1 here, and
    // only for a laser: the cannons drill stone at double the ball's rate, which
    // is what makes SUPER MAZE's two seeded LASERs the way through it rather
    // than a nicety. Silver and gold still die in two and three bolts.
    const taken = amount ?? (source === "laser" ? BRICK_BY_ID[hit.cell.kind].laserDamage : 1);
    const destroyed = this.grid.damage(hit, taken);
    // TWIN, at the grid write and before anything else this method does: the
    // partner takes the same damage on the same tick, and a chip is damage — a
    // granite partner chips exactly as the struck brick chips, and the thread
    // stays until one of them actually dies.
    if (source !== "twin") {
      this.strikeTwin(hit, taken);
    }
    if (!destroyed) {
      // A BLAST splash is covered by its one boom and a CHAIN link by its one
      // crack; only what the player aimed clanks.
      if (isDirectHit(source)) {
        this.deps.sfx.brickArmored();
      }
      // ERODE: a clip off a brick worn thin knocks the rest of it loose. Only on
      // the survivors — a kill already throws six chunks of its own — and only
      // while the wall is actually worn, so an ordinary rally against granite is
      // exactly as dusty as it has always been.
      //
      // This is what says the ball is *inside* the wall. The clank is the
      // brick's and sounds the same from either side of it, and without a puff
      // at the point of contact a rally down a lane is a ball ricocheting off
      // nothing the player can point at.
      if (this.erosion.worn) {
        this.emitClipDust(hit);
      }
      return;
    }

    // Whatever killed it, the load it was carrying goes with it: a cell with
    // nothing in it is not under strain, and QUAKE slides a fresh brick into
    // this one soon enough for the difference to be visible.
    this.sheet.clearCell(hit.row, hit.column);
    this.slump.clearCell(hit.row, hit.column);
    this.score += hit.cell.points * this.scoreMultiplier(source);
    if (isDirectHit(source)) {
      // A post snapping, not a brick shattering. Its own sound and not merely
      // its own pitch: `brickDestroyed` tunes itself off the row, and row 16 is
      // eleven rows past the bottom of the ramp it was written for — it would
      // arrive as a 65 Hz thud nobody can hear.
      if (this.isPost(hit.row)) {
        this.deps.sfx.fenceSnap();
      } else {
        this.deps.sfx.brickDestroyed(hit.row);
      }
    }
    this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
    // GRAVEL: the chips, thrown alongside the brick's own dust. Here and
    // nowhere else, which is the capsule's one real rule: `damageBrick` is
    // every kill a *ball* is behind — direct, laser, BLAST splash, CHAIN link —
    // and a pip is worth points, so it sits on the capsule side of the line
    // NUKE, ZAP, the grub, a meteor and a PYRE crater are already on. Those
    // five take the wall without paying it out, and thirteen bricks each
    // throwing five 30-point chips would make a spent ball worth more than the
    // level.
    //
    // It is also the honest half of the ticket's note about capping a NUKE or a
    // BLAST fired during the window. The nuke is gone by construction, and what
    // is left to cap is a NOVA taking 25 cells at once — which the pool does by
    // running out rather than by clamping. See `GravelField.burst`.
    if (this.timers.isActive("GR")) {
      this.crumbleBrick(hit);
    }

    // What falls was drawn into the brick when the wall was built, so a capsule
    // XRAY showed is the capsule that comes out. MAGNET's guarantee still draws
    // live: it promises the next kill drops something, whichever brick that is.
    //
    // That live draw takes `dropExcludes()` like every other one. It did not
    // while this was a weighted roll, which made the first level's DEMAKE ban a
    // rule with a hole in it — the one capsule barred from level 1 could still
    // arrive there out of a magnet.
    //
    // A seeded capsule ignores all of that. The level pinned it, so it comes out
    // of a splash or a chain link exactly as it does out of a ball, and it does
    // not spend MAGNET's guarantee — that was promised to the next brick the
    // player kills, and this brick was always going to drop something.
    const seeded = hit.cell.seeded;
    const capsule = seeded
      ? hit.cell.capsule
      : isDirectHit(source)
        ? (hit.cell.capsule ?? (this.guaranteedDrop ? this.dropBag.draw(this.dropExcludes()) : null))
        : null;
    if (capsule !== null && this.spawnCapsule(hit, capsule, seeded) && !seeded) {
      // Spent on a capsule that actually got a slot: a full drop pool would
      // otherwise swallow MAGNET's one guaranteed demonstration.
      this.guaranteedDrop = false;
    }

    if (source === "ball" && this.timers.isActive("B")) {
      this.blastNeighbors(hit);
    }
    // After the splash, so a chain starts outside the crater BLAST just made.
    // `"ball"` and not `isDirectHit`: a laser shot arcs nothing, and a chained
    // kill may not chain again — the web's reach is `chainFrom`'s to decide.
    if (source === "ball" && this.timers.isActive("C")) {
      this.chainFrom(hit);
    }

    // Idempotent on purpose: a BLAST chain reaches here recursively when the
    // splash kill and its outer ball kill both empty the grid in one tick —
    // the old direct onLevelCleared() call double-scored the clear bonus.
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  /**
   * A brick taken out of the wall by something that is not a hit — a nuke, a
   * ZAP sweep, a grub's bite, a meteor, a PYRE crater — and TWIN's partner
   * paid for it.
   *
   * **This exists so the capsule is routed once rather than five times.**
   * `BrickGrid.damage` and `BrickGrid.destroy` are the only two ways a brick
   * leaves the wall, and `damageBrick` has always been the single wrapper round
   * the first; this is the single wrapper round the second. The five callers
   * that used to reach `destroy` directly go through here now, so "the partner
   * has to be paid whichever of those did the killing" is one line in one place
   * instead of an enumeration that is wrong the day a sixth killer is added.
   *
   * The payout itself stays each caller's business: they disagree about the
   * burst and about whether anything is heard, and folding those in would make
   * this a fourth thing the nuke and the grub had to agree on.
   */
  private destroyBrick(hit: BrickHit): void {
    this.grid.destroy(hit);
    this.strikeTwin(hit, null);
  }

  /**
   * TWIN: the partner of a cell just written to the grid, paid the same damage
   * on the same tick.
   *
   * `amount` is the hit points that came off, or null for an outright destroy —
   * a partner of a brick a nuke took is a brick the nuke took, and a granite
   * that survived on paper while its twin was vaporised would be the capsule
   * arguing with the thing that killed it.
   *
   * **The payout is `chainFrom`'s and not a ball's**, which is this ticket's one
   * ruling worth writing down. The spec's prose says the partner rolls its own
   * capsule and its instruction says to reuse the chain's path; those two
   * disagree, because `damageBrick(_, "chain")` deliberately drops nothing. The
   * instruction wins. Every indirect kill in the game already settles this the
   * same way — a chain link, a BLAST splash, a nuke, a ZAP sweep, a bite, a
   * drill and a crater all pay full points and roll nothing — and a partner
   * paying like a ball would be the only brick on the board that dropped loot
   * for a hit it never took. A *seeded* capsule still comes out, because a
   * seeded capsule is the level's promise and not a roll.
   *
   * **One hop, and the at-most-one rule is what makes that structural.** The
   * partner has no pairing of its own to fire, so there is no cascade to guard
   * against — and the `source !== "twin"` gate above is belt to that braces,
   * covering the one case the pairing cannot: a couple broken by the write that
   * is itself paying a couple.
   *
   * PIERCE through a couple takes both halves of two different couples in one
   * pass, and that is the best thing this capsule can do. Nothing here guards
   * against it.
   */
  private strikeTwin(hit: BrickHit, amount: number | null): void {
    const partner = this.entanglement.partnerOf(hit.row, hit.column);
    if (partner === null) {
      return;
    }
    const target = this.grid.hitAtCell(partner.row, partner.column);
    if (target === null) {
      // Nothing left to pay, and a thread with one anchor is not a thread. The
      // wall's own tick would retire this couple anyway; snapping it here means
      // the pairing is never a frame out of date with the wall.
      this.entanglement.snap(hit.row, hit.column, this.grid);
      return;
    }
    if (amount === null) {
      this.grid.destroy(target);
      this.releaseSeededCapsule(target);
      this.score += target.cell.points * this.scoreMultiplier("twin");
      this.emitBurst(target, gameConfig.effects.brickDeathBurst);
    } else {
      this.damageBrick(target, "twin", amount);
    }
    // The hop, whether or not it killed: what the player has to hear is that
    // the damage crossed the field, which is the capsule's whole event and is
    // just as true of a chip as of a kill.
    this.deps.sfx.twinStrike();

    // The thread stays until one of them *actually* dies: two granites wired
    // together are a couple that survives its own first exchange, which is the
    // capsule paying a chip forward rather than a kill.
    const struckGone = this.grid.hitAtCell(hit.row, hit.column) === null;
    const partnerGone = this.grid.hitAtCell(partner.row, partner.column) === null;
    if (struckGone || partnerGone) {
      this.entanglement.snap(hit.row, hit.column, this.grid);
    }
  }

  /**
   * CHAIN: walk lightning out from a brick a ball just killed, two jumps per
   * node, until the link budget runs out.
   *
   * Breadth-first in cell space and self-contained — it damages through
   * `damageBrick(_, "chain")`, which cannot start another chain, so this walk is
   * the only thing deciding how far the web reaches.
   */
  private chainFrom(seed: BrickHit): void {
    const { maxDepth, maxLinks, boltTicks } = gameConfig.effects.chain;
    const { columns } = gameConfig.grid;
    const key = (row: number, column: number): number => row * columns + column;
    // The seed is already dead, but it still has to be unreachable: an arc back
    // onto it would spend a link on nothing.
    const visited = new Set<number>([key(seed.row, seed.column)]);
    const queue = [{ row: seed.row, column: seed.column, depth: 0 }];
    let links = 0;

    for (let head = 0; head < queue.length && links < maxLinks; head++) {
      const node = queue[head];
      if (node.depth >= maxDepth) {
        continue;
      }
      for (const target of this.chainTargets(node.row, node.column, visited)) {
        if (links >= maxLinks) {
          break;
        }
        links++;
        // Marked before the damage: the cell may survive as a chipped silver,
        // and either way no later node may spend a second link on it.
        visited.add(key(target.row, target.column));
        this.bolts.push(chainBolt(node.row, node.column, target.row, target.column, boltTicks));
        queue.push({ row: target.row, column: target.column, depth: node.depth + 1 });
        this.damageBrick(target, "chain");
      }
    }

    if (links > 0) {
      this.deps.sfx.chainArc();
    }
  }

  // The nearest live cells a bolt may jump to from one node. The 8 touching
  // cells are excluded on purpose — reaching them is BLAST's job, and skipping
  // them is what makes a chain read as a jump rather than a wider crater.
  private chainTargets(row: number, column: number, visited: ReadonlySet<number>): BrickHit[] {
    const { cellRadius, linksPerNode } = gameConfig.effects.chain;
    const { columns } = gameConfig.grid;
    const reach = Math.floor(cellRadius);
    const found: Array<{ hit: BrickHit; distance: number }> = [];

    for (let deltaRow = -reach; deltaRow <= reach; deltaRow++) {
      for (let deltaColumn = -reach; deltaColumn <= reach; deltaColumn++) {
        if (Math.max(Math.abs(deltaRow), Math.abs(deltaColumn)) < 2) {
          continue;
        }
        const distance = Math.hypot(deltaRow, deltaColumn);
        if (distance > cellRadius) {
          continue;
        }
        const target = this.grid.hitAtCell(row + deltaRow, column + deltaColumn);
        if (!target || visited.has(target.row * columns + target.column)) {
          continue;
        }
        found.push({ hit: target, distance });
      }
    }

    // Nearest first, then row before column: the same board always arcs the
    // same way, so a chain can be read as a rule rather than as noise.
    found.sort((a, b) => a.distance - b.distance || a.hit.row - b.hit.row || a.hit.column - b.hit.column);
    return found.slice(0, linksPerNode).map((entry) => entry.hit);
  }

  // Splash kills never chain and never drop capsules — one explosion per ball
  // hit, however wide it is. NOVA (PIERCE+BLAST) is the width: one ring of
  // neighbours becomes two, the 5x5 block around the kill, 24 cells.
  private blastNeighbors(center: BrickHit): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const radius = this.hasCombo("NOVA") ? gameConfig.powerUps.comboBlastRadius : 1;
    let blasted = false;

    for (let deltaRow = -radius; deltaRow <= radius; deltaRow++) {
      for (let deltaColumn = -radius; deltaColumn <= radius; deltaColumn++) {
        if (deltaRow === 0 && deltaColumn === 0) {
          continue;
        }
        const neighbor = this.grid.hitAtCell(center.row + deltaRow, center.column + deltaColumn);
        if (!neighbor) {
          continue;
        }
        blasted = true;
        this.brickFlashes.push({
          x: left + neighbor.column * brickWidth,
          y: top + neighbor.row * brickHeight + this.cellSag(neighbor.row, neighbor.column),
          ticksLeft: gameConfig.powerUps.splashFlashTicks,
          kind: "blast",
          onWall: !this.isPost(neighbor.row),
          // BLAST's splash keeps its own colour through a PAYDAY: the chain
          // reads as one explosion, and half of it in a different tone would
          // read as two.
          gild: false,
        });
        this.damageBrick(neighbor, "splash");
      }
    }

    // The neighbors themselves stay silent (source "splash"): the chain reads as
    // one explosion, not eight overlapping pops.
    if (blasted) {
      this.deps.sfx.blastExplosion();
    }
  }

  // White death flash on the brick footprint plus a debris burst in the
  // brick's own colors, shared by ordinary kills and NUKE kills.
  // The clip puff, thrown from the middle of what the brick has left rather than
  // the middle of its cell: at full wear those are 5 px apart on one axis and
  // 3 on the other, and dust coming off the empty half of a cell would be dust
  // coming off the lane instead of off the stone.
  /**
   * Where a cell is being *painted* this frame, in field pixels.
   *
   * Three displacements meet here and nothing else in the game adds them up:
   * QUAKE's wall-wide drop, JELLY's ripple and SLUMP's fall. Anything thrown
   * *from* a brick — its death flash, its dust, its chips — has to come from
   * where the brick is rather than from where its row index says, or a slumped
   * wall throws its debris out of the ceiling.
   */
  private paintedCellY(row: number, column: number): number {
    const { top, brickHeight } = gameConfig.grid;
    if (this.isPost(row)) {
      // The fence, in its own coordinates, exactly as the hitbox reads it: no
      // quake drop and no sag, and the post's own rise while it is being pulled.
      return top + row * brickHeight + this.fence.riseAt(column);
    }
    return top + row * brickHeight - this.grid.topOffset + this.cellSag(row, column);
  }

  // Whether a row index is the fence's rather than the wall's. One number, and
  // it is asked wherever something derived from the wall would be wrong about a
  // post — the gild front, the kill's pitch, and where a cell is painted.
  private isPost(row: number): boolean {
    return row === gameConfig.powerUps.fence.row;
  }

  // Just the per-cell part of it: JELLY's ripple plus SLUMP's fall, with
  // QUAKE's wall-wide drop left out. For the callers that are already writing
  // in wall coordinates and whose reader subtracts the drop for them.
  private cellSag(row: number, column: number): number {
    return this.grid.sheet?.offsetAt(row, column) ?? 0;
  }

  /**
   * SLUMP: the dust a landing throws out of both sides of the cell it hit.
   *
   * Scaled by how hard the brick came down, so a column closing a one-row gap
   * puffs and a whole wall arriving from six rows up does not do the same
   * thing six times over. The chunks come out of the brick's own colour, like
   * every other burst on the wall, so a landing granite brick throws stone.
   */
  private settleLandings(): void {
    if (this.landings.length === 0) {
      return;
    }
    const { left, brickWidth, brickHeight } = gameConfig.grid;
    const { slumpLandingBurst, slumpMaxSpeed } = gameConfig.effects;
    let loudest = 0;
    for (const landing of this.landings) {
      const cell = this.grid.hitAtCell(landing.row, landing.column);
      if (!cell) {
        continue;
      }
      loudest = Math.max(loudest, landing.speed);
      const weight = Math.min(1, landing.speed / slumpMaxSpeed);
      const count = Math.max(1, Math.round(slumpLandingBurst.chunkCount * weight));
      const y = this.paintedCellY(landing.row, landing.column) + brickHeight;
      // Both sides of the impacted cell rather than its middle: what is being
      // shown is the brick squeezing the air out from under itself, and dust
      // out of the centre of a 30 px face reads as the brick breaking.
      for (const x of [left + landing.column * brickWidth, left + (landing.column + 1) * brickWidth]) {
        this.particles.burst(x, y, cell.cell.kind, { ...slumpLandingBurst, chunkCount: count });
      }
    }
    if (loudest > 0) {
      this.deps.sfx.slumpLand(Math.min(1, loudest / slumpMaxSpeed));
    }
  }

  /**
   * FENCE: the dust a post throws as it seats, and the debris one throws as it
   * is pulled out.
   *
   * The two ends of the capsule in one method, because they are the same
   * bookkeeping and opposite pictures: a post arriving puffs at its foot, where
   * the ground closed around it, and a post leaving bursts at its middle in the
   * standard chunks every brick on this field dies in.
   */
  private settlePosts(): void {
    const { left, brickWidth, brickHeight } = gameConfig.grid;
    const { top } = gameConfig.grid;
    const fenceY = top + gameConfig.powerUps.fence.row * brickHeight;
    for (const column of this.fenceSeated) {
      // Both sides of the post's foot rather than its middle, by the landing
      // dust's rule above: what is being shown is the ground taking the post,
      // and a puff out of the centre of a 30 px face reads as the post breaking.
      for (const x of [left + column * brickWidth, left + (column + 1) * brickWidth]) {
        this.particles.burst(x, fenceY + brickHeight, "F", gameConfig.powerUps.fence.seatBurst);
      }
      this.deps.sfx.fenceDrive();
    }
    for (const column of this.fencePulled) {
      this.particles.burst(
        left + column * brickWidth + brickWidth / 2,
        fenceY - gameConfig.powerUps.fence.pullRise + brickHeight / 2,
        "F",
        gameConfig.effects.brickDeathBurst,
      );
      this.deps.sfx.fencePull();
    }
  }

  private emitClipDust(hit: BrickHit): void {
    const { left, brickWidth, brickHeight } = gameConfig.grid;
    this.particles.burst(
      left + hit.column * brickWidth + brickWidth / 2,
      this.paintedCellY(hit.row, hit.column) + brickHeight / 2,
      hit.cell.kind,
      gameConfig.powerUps.erode.clipBurst,
    );
  }

  /**
   * GRAVEL: one dead brick's worth of chips.
   *
   * Thrown from where the brick is being *painted* rather than from where its
   * index says it is — the clip puff's reading, and for its reason: QUAKE's
   * wall is up to a row above its own row while it falls, and gravel arriving
   * out of thin air a brick's height below the stone it came from would be on
   * the one frame the player is watching the wall move.
   */
  private crumbleBrick(hit: BrickHit): void {
    const { left, brickWidth, brickHeight } = gameConfig.grid;
    const { minPips, maxPips, size } = gameConfig.powerUps.gravel;
    this.gravel.burst(
      left + hit.column * brickWidth + (brickWidth - size) / 2,
      this.paintedCellY(hit.row, hit.column) + (brickHeight - size) / 2,
      minPips + Math.floor(Math.random() * (maxPips - minPips + 1)),
    );
  }

  private emitBurst(hit: BrickHit, spec: BurstSpec): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const sag = this.cellSag(hit.row, hit.column);
    this.brickFlashes.push({
      x: left + hit.column * brickWidth,
      // Where the brick was, not where its row is: a slumped wall's bricks sit
      // rows below their own index, and a flash left on the index would mark
      // the death of a brick nobody could see there.
      y: top + hit.row * brickHeight + sag,
      ticksLeft: gameConfig.effects.deathFlashTicks,
      kind: "death",
      // False for a fence post, which is what this flag is actually asking: a
      // flash on the wall is drawn with QUAKE's drop taken off and cut to the
      // wear ERODE has left, and a post takes neither.
      onWall: !this.isPost(hit.row),
      // Read here rather than in the renderer, so the front is legible in the
      // destruction as well as in the standing wall: mid-sweep the bottom rows
      // are visibly already paying gold while the top ones still flash white.
      //
      // Never a fence post, and the guard is load-bearing rather than tidy: the
      // front is a count of *wall* rows, so `16 >= front` is true on every wall
      // in the game and a post would flash gold whether or not a PAYDAY had
      // ever been caught. A post pays nothing, and the flash may not say it did.
      gild: !this.isPost(hit.row) && hit.row >= this.paydayFront(),
    });
    this.particles.burst(
      left + hit.column * brickWidth + brickWidth / 2,
      top + hit.row * brickHeight + brickHeight / 2 + sag,
      hit.cell.kind,
      spec,
    );
  }

  private stepDetonation(): void {
    if (this.detonation.holding) {
      if (this.detonation.stepHold()) {
        this.detonation.reset();
        this.onLevelCleared();
      }
      return;
    }
    this.detonation.step();
    this.nukeBricksWithin(this.detonation.sweepExpired ? Number.POSITIVE_INFINITY : this.detonation.radius);
    if (this.grid.remaining <= 0) {
      this.detonation.beginHold();
    }
  }

  // Detonates every live brick whose centre the shockwave has reached. Nuke
  // kills bypass damageBrick(): full points (PAYDAY applies), but no capsule
  // drops, no BLAST chaining, no per-brick beep, and silver/gold die outright.
  private nukeBricksWithin(radius: number): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const radiusSquared = radius * radius;

    this.grid.rows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (!cell) {
          return;
        }
        const deltaX = left + columnIndex * brickWidth + brickWidth / 2 - this.detonation.x;
        const deltaY = top + rowIndex * brickHeight + brickHeight / 2 - this.detonation.y;
        if (deltaX * deltaX + deltaY * deltaY > radiusSquared) {
          return;
        }
        const hit = { cell, row: rowIndex, column: columnIndex };
        this.destroyBrick(hit);
        this.releaseSeededCapsule(hit);
        this.score += cell.points * this.scoreMultiplier();
        this.emitBurst(hit, gameConfig.effects.nukeBurst);
      });
    });
  }

  /**
   * CRITTER: one tick of the grub, and the brick it closes its jaws on.
   *
   * Bites are of the nuke's kill class rather than the ball's: full points
   * (PAYDAY doubles them) and silver and gold go in one, but no capsule drops,
   * no per-brick beep and neither BLAST nor CHAIN spreads off them. The pet
   * plays *for* the player, not *as* them, and a grub that could set off the
   * player's own combos would be doing the level rather than helping with it.
   *
   * Nothing collides with it — balls, shots and capsules all pass straight
   * through. A pet that deflected a ball would be an obstacle the player never
   * asked to place.
   */
  private stepCritter(): void {
    if (!this.critter.alive) {
      return;
    }
    // It crawls while there is something to chew in the column ahead and scoots
    // over ground already cleared: 30 px of brick is 18 ticks either way, and a
    // stripped row costs a third of that to cross. Walking on and walking off
    // are its own pace instead: there is no column out there to ask about, and a
    // grub that scooted in over the gutter would arrive twice as fast as it
    // leaves.
    const { stepSpeed, emptyRowSpeed } = gameConfig.effects.critter;
    const onTheWall = !this.critter.entering && !this.critter.leaving;
    const ahead = onTheWall
      ? this.grid.hitAtCell(this.critter.row, this.critterColumn() + this.critter.direction)
      : null;
    this.critter.step(onTheWall && !ahead ? emptyRowSpeed : stepSpeed, this.grid.rows.length);

    // Out of life: it goes out in the puff. Off the end of the bottom row: it
    // walks out under the far bar and is simply not there any more — a grub the
    // player watched leave owes nobody an explosion.
    if (this.critter.ticksLeft <= 0) {
      this.despawnCritter();
      return;
    }
    if (this.critter.gone) {
      this.critter.reset();
      return;
    }
    if (this.critter.entering || this.critter.leaving) {
      return;
    }

    const hit = this.grid.hitAtCell(this.critter.row, this.critterColumn());
    if (!hit) {
      return;
    }
    this.destroyBrick(hit);
    this.releaseSeededCapsule(hit);
    this.score += hit.cell.points * this.scoreMultiplier();
    this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
    this.deps.sfx.critterBite();
    // Same idempotent clear trigger as damageBrick: the pet can take the last brick.
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  // Which column the grub's jaws are over. Its own centre, so the bite lands
  // when the sprite is on the brick rather than when its nose touches it.
  private critterColumn(): number {
    return Math.floor((this.critter.centerX - gameConfig.grid.left) / gameConfig.grid.brickWidth);
  }

  // Dropped on the top row that still has bricks, walking in from the paddle's
  // own side of the field: the pet arrives from where the player is looking.
  private spawnCritter(): void {
    const row = this.grid.rows.findIndex((cells) => cells.some((cell) => cell !== null));
    if (row < 0) {
      return;
    }
    this.critter.spawn(row, this.paddle.centerX < gameConfig.field.width / 2);
  }

  // It goes out in a puff of yellow: `ParticleField` colours debris by
  // `BrickKind`, and "3" is the closest the field can paint to a lime grub.
  private despawnCritter(): void {
    this.particles.burst(this.critter.centerX, this.critter.centerY, "3", gameConfig.effects.brickDeathBurst);
    this.critter.reset();
  }

  /**
   * METEOR: one tick of the volley, and the bricks the rocks drill through.
   *
   * Kills are of the nuke's class rather than the ball's: full points (PAYDAY
   * doubles them) and silver and gold go in one pass, but no capsule drops and
   * neither BLAST nor CHAIN spreads off them. Three lanes carved out of the
   * wall is the whole of the capsule — a volley that also spilled capsules and
   * set off the player's combos would be playing the level for them.
   *
   * Nothing collides with a rock and nothing bends one: balls, shots and
   * capsules pass through, and SINGULARITY does not reach them. They fall the
   * line they were launched on until the grid runs out beneath them, and then
   * for the twelve ticks it takes them to burn out below it — during which MT
   * stays lit in the POWER inset, because a rock is still on screen, and the
   * rock still holds its pool slot, which widens the window where a third catch
   * inside one fall lands as the sound alone by a fifth of a second.
   */
  private stepMeteors(): void {
    if (!this.meteors.active) {
      return;
    }
    const { top, brickHeight } = gameConfig.grid;
    // The floor the rocks stop at is the wall's bottom edge as drawn, not as
    // indexed: a rock must not carry on falling through a wall it can be seen
    // resting against.
    this.meteors.step(top + this.grid.rows.length * brickHeight - this.quake.dropOffset);

    let drilled = false;
    for (const meteor of this.meteors.meteors) {
      if (!meteor.active) {
        continue;
      }
      // Every other tick: one puff per rock per two ticks is a trail, and one
      // per tick is a smoke screen over the wall it is drilling. Below the wall
      // there is nothing left to hide, so a burning rock does puff every tick —
      // it is turning into its own smoke, and the trail has to thicken at the
      // rate the core shrinks or the rock just quietly gets smaller.
      if ((meteor.age & 1) === 0 || meteor.burnTicks > 0) {
        this.particles.burst(meteor.x, meteor.y, "2", gameConfig.effects.meteor.trailBurst);
      }
      const hit = this.grid.cellAt(meteor.x, meteor.y);
      if (!hit) {
        continue;
      }
      this.destroyBrick(hit);
      this.releaseSeededCapsule(hit);
      this.score += hit.cell.points * this.scoreMultiplier();
      this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
      // The 30 ms guard folds rocks landing on the same tick into one beep,
      // which is what keeps a volley from sounding like a drum roll.
      this.deps.sfx.brickDestroyed(hit.row);
      drilled = true;
    }

    // Same idempotent clear trigger as damageBrick: a rock can take the last brick.
    if (drilled && this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  // PAYDAY on its own, for the two payouts that are not a brick kill: the
  // level-clear bonus and a BUMPERS kick. TURBO deliberately reaches neither —
  // see the note on `turboMultiplier`.
  private paydayMultiplier(): number {
    return this.timers.isActive("X") ? gameConfig.scoring.paydayMultiplier : 1;
  }

  // What a killed brick pays: PAYDAY's double and TURBO's triple, stacking to
  // x6 on independent timers, and JACKPOT's double over the top of a splash
  // kill for x12 at the extreme. `source` is what the splash carve-out reads —
  // every other caller kills something directly and takes the default.
  private scoreMultiplier(source: BrickDamageSource = "ball"): number {
    const jackpot = source === "splash" && this.hasCombo("JACKPOT") ? gameConfig.scoring.jackpotMultiplier : 1;
    return this.paydayMultiplier() * (this.timers.isActive("TU") ? gameConfig.scoring.turboMultiplier : 1) * jackpot;
  }

  /**
   * The live combos, rewritten in place once a tick.
   *
   * A combo is nothing but two timers overlapping, so there is no state to
   * keep: the table is walked, both halves are asked, and the answer is the
   * whole of it. Rewritten rather than rebuilt because this runs every tick,
   * and compared against `comboMask` because the fusion chord belongs to the
   * tick a pair *forms*, not to every tick it stays up.
   *
   * Combos come apart in silence on purpose: the half that expired is the event,
   * and it has its own tell.
   */
  private refreshCombos(): void {
    this.combos.length = 0;
    let mask = 0;
    for (let index = 0; index < COMBOS.length; index++) {
      const combo = COMBOS[index];
      if (this.timers.isActive(combo.a) && this.timers.isActive(combo.b)) {
        this.combos.push(combo.id);
        mask |= 1 << index;
      }
    }
    // Any bit that was not set last tick: two can light on one catch, and the
    // sound's own retrigger guard makes that one chord rather than two.
    if ((mask & ~this.comboMask) !== 0) {
      this.deps.sfx.comboFuse();
    }
    this.comboMask = mask;
  }

  private hasCombo(id: ComboId): boolean {
    return this.combos.includes(id);
  }

  // CHARGE (GLUE+LASER): fire is held while the deck is holding a ball. Not
  // "GLUE is live" — a stuck ball is what the player can see, and a GLUE that
  // has caught nothing yet must not silence the cannons.
  private chargeHolding(): boolean {
    return this.hasCombo("CHARGE") && this.balls.some((ball) => ball.active && ball.stuckOffsetX !== null);
  }

  // The cache outlives a tick, so it dies with the run state everywhere the
  // timers do: a combo left in the list would be drawn in the POWER inset over
  // the CLEARED or GAME OVER overlay, on halves that no longer exist.
  private clearCombos(): void {
    this.combos.length = 0;
    this.comboMask = 0;
  }

  // Chance that this kill drops a bonus capsule: the console's `drop` command
  // beats the config knob. Clamped, so a typo in the knob (1.5, -1) cannot make
  // the roll nonsensical.
  private bonusSpreadAmount(): number {
    const amount = this.bonusSpreadOverride ?? gameConfig.rules.bonusSpreadAmount;
    return Math.min(1, Math.max(0, amount));
  }

  // One brick's worth of luck, asked for once when the wall is built: whether it
  // holds a capsule at all, and which one. Asking here rather than at the kill is
  // what lets XRAY show the truth instead of a guess.
  //
  // The two halves are independent and stay that way: `bonusSpreadAmount` is a
  // coin per brick, and the bag decides only *which* capsule a winning coin
  // yields. A wall of 40 bricks therefore spends about 12 tickets, which is what
  // makes a 69-ticket pass last about six levels.
  private rollBrickCapsule(): PowerUpKind | null {
    return Math.random() < this.bonusSpreadAmount() ? this.dropBag.draw(this.dropExcludes()) : null;
  }

  // What may not come out of a draw on this level. All three draws go through
  // it now — the wall's seed, RAIN's shower and MAGNET's guarantee — because a
  // shower is as much a drop as a brick's is, and a first-level rule that any of
  // them ignored would not be a rule. The magnet was the one that ignored it.
  private dropExcludes(): readonly PowerUpKind[] {
    return this.level === 0 ? FIRST_LEVEL_EXCLUDES : NO_EXCLUDES;
  }

  // WARP (the Ctrl+Option+Command+N easter egg): finish the level on the spot. The
  // bricks are removed without scoring and the clear bonus is skipped — the hall
  // of fame is shared across all players, so a warp must never be worth points.
  // Allowed from pause too: pausing to reach for a three-modifier chord is normal.
  private warpLevel(): void {
    if (this.screen !== "play" && this.screen !== "serve" && this.screen !== "pause") {
      return;
    }
    this.grid.wipe();
    this.detonation.reset();
    this.clearCountdown = 0;
    this.deathCountdown = 0;
    this.guaranteedDrop = false;
    this.onLevelCleared(false);
  }

  private onLevelCleared(awardBonus = true): void {
    // Nuke chunks (30-45 ticks) can outlive the 30-tick hold: flush so nothing
    // freezes mid-air behind the CLEARED overlay. The ordinary path is clean
    // by construction (15-tick chunks vs a 20-tick delay).
    this.brickFlashes = [];
    this.catchPops = [];
    this.stasisRings = [];
    this.bolts = [];
    this.closeCores();
    this.bumpers.reset();
    this.quake.reset();
    this.critter.reset();
    this.meteors.reset();
    this.snapBlend = 0;
    this.snapMarks = [];
    this.tracerBlend = 0;
    this.tracerThreads = [];
    this.pyreBlend = 0;
    this.pyreBlasts = [];
    this.erodeBlend = 0;
    this.erosion.reset();
    this.sheet.reset();
    this.slump.reset();
    this.fence.reset();
    this.shadows.reset();
    this.superposition.reset();
    this.decoherence.reset();
    this.entanglement.reset();
    this.gravelBlend = 0;
    this.gravel.reset();
    this.ghostBlend = 0;
    this.magnetBlend = 0;
    this.paydayBlend = 0;
    this.xrayBlend = 0;
    this.xraySweepSpan = 0;
    this.demakeBlend = 0;
    this.blackoutBlend = 0;
    this.portalBlend = 0;
    this.flipTurn = 0;
    this.turboSpool = 0;
    this.tempoBlend = 0;
    this.rushBlend = 0;
    this.haywireBlend = 0;
    this.haywireKickIn = 0;
    this.haywireKicking = false;
    this.englishBlend = 0;
    this.paddleVx = 0;
    this.paddleWasX = this.paddle.x;
    this.stasisBlend = 0;
    // The blend and the balls together: a serve reads `ball.size` to park
    // the ball on the deck, and it happens before the next `resizeBalls`.
    this.giantBlend = 0;
    for (const ball of this.balls) {
      ball.size = gameConfig.ball.size;
    }
    this.homingBlend = 0;
    this.glueReach = 0;
    this.mirrorForm = 0;
    this.mirrorAfterImageTicks = 0;
    this.laserBlend = 0;
    this.paddleBreak = 0;
    this.paddleShards = [];
    this.particles.reset();
    this.resetSkid();
    // The deck too, and it is the easy one to miss: this method zeroes every
    // blend and resets the timers but never used to touch the width, so a WIDE
    // caught on the last brick kept running its caps out behind the CLEARED
    // overlay, where the panel goes on drawing the deck.
    this.snapDeck();
    // First, and ahead of `timers.reset()` below: the CLEARED jingle plays out
    // of this method, and a squared-off fanfare would be the reward sounding
    // like the punishment. The blend above would get there on its own, but not
    // for another 15 ticks, and the jingle is already playing by then.
    this.deps.sfx.setDemake(false);
    const bonus = awardBonus ? (this.level + 1) * gameConfig.scoring.clearBonusPerLevel * this.paydayMultiplier() : 0;
    this.score += bonus;
    // The board is won: every running effect dies with it, so no portal mouths,
    // ghost paddle or tethers stay painted behind the CLEARED overlay. After
    // the bonus on purpose — PAYDAY was earned on this level and still doubles it.
    this.timers.reset();
    this.clearCombos();
    this.deps.screens.updateClear(levelAt(this.level).name, zeroPad(bonus, 5));
    this.setScreen("clear");
    this.deps.sfx.levelClear();
  }

  /**
   * Where a fresh catch label starts: the lane just above the paddle, or the
   * first one clear of the pops already rising.
   *
   * Two capsules can be caught on the same tick — `DropPool.step` walks every
   * drop in one pass — and pops all rise at `catchPopRiseSpeed`, so a second
   * label spawned on the first never drifts off it: the pair overprints for its
   * whole life (SINGULARITY under VORTEX rendered as "SINVORTEXTY"). Stacking
   * separates them once, permanently, because the lockstep that caused the bug
   * also preserves the gap.
   *
   * The test is vertical only. Widths belong to the renderer's font, and a pop
   * far off to the side gets nudged up a lane it did not need — 10 px of extra
   * air, against a guessed label width that would sometimes be wrong.
   */
  /**
   * GAMBLE's reel, a tick at a time.
   *
   * Ten faces, then the winner held still for a fifth of a second before it
   * fires: the result has to be *read* before whatever it does happens, or the
   * capsule is a slot machine that pays out while you are still watching the
   * drum.
   *
   * Called below the detonation and clear gates, so a NUKE sweep or a level's
   * last shatter parks the reel mid-spin rather than resolving behind an opaque
   * overlay. A spin still turning when the level actually ends dies with the
   * rest of the run state in `resetServe()`.
   */
  private stepGamble(): void {
    if (this.gambleTicksLeft === 0) {
      return;
    }
    const { stepTicks, holdTicks } = gameConfig.powerUps.gamble;
    this.gambleTicksLeft--;

    if (this.gambleTicksLeft === 0) {
      this.resolveGamble();
      return;
    }
    if (this.gambleTicksLeft === holdTicks) {
      this.gambleFace = this.gambleKind;
      this.deps.sfx.gambleLand();
      return;
    }
    if (this.gambleTicksLeft > holdTicks && this.gambleTicksLeft % stepTicks === 0) {
      this.gambleFace = rollFace(this.gambleFace);
      // The ladder climbs as the reel runs down, so the ear knows the drum is
      // about to stop before the eye does.
      this.deps.sfx.gambleReel((this.gambleTicksLeft - holdTicks) / stepTicks);
    }
  }

  // The reel pays out. Cleared before the winner is applied, so a GAMBLE that
  // somehow rolled itself could not spin forever, and so the winner's own catch
  // pop lands on a field with no reel left over it.
  private resolveGamble(): void {
    const won = this.gambleKind;
    this.gambleTicksLeft = 0;
    this.gambleKind = null;
    this.gambleFace = null;
    if (won !== null) {
      this.applyPowerUp(won);
    }
  }

  private freeCatchPopY(): number {
    const { catchPopStackGap } = gameConfig.powerUps;
    const base = this.paddle.y - 6;
    // Five lanes, which tops out at y 230 — still well below the deepest grid.
    // Past that the stack would climb into the bricks, and an overprint that
    // needs five catches inside 22 ticks is the lesser evil.
    const ceiling = base - catchPopStackGap * 4;
    let y = base;
    while (y > ceiling && this.catchPops.some((pop) => Math.abs(pop.y - y) < catchPopStackGap)) {
      y -= catchPopStackGap;
    }
    return y;
  }

  private applyPowerUp(kind: PowerUpKind): void {
    const durations = POWER_UP_DURATIONS;

    // Every catch gets an unmistakable on-field acknowledgment: passive effects
    // (PAYDAY, BLAST, PIERCE) and refresh catches are otherwise invisible.
    //
    // GAMBLE is the one exception, and it is not an omission: its reel opens
    // over the deck on this very tick, in the same 12 px band the label rises
    // through, and the two printed over each other for the first third of a
    // second. The reel says "GAMBLE" louder than the word does, and the face it
    // lands on gets a pop of its own.
    if (kind !== "GB") {
      this.catchPops.push({
        // The label is centred on the paddle, so a long name at the wall would
        // hang off the frame — SINGULARITY is 11 characters and today's shortest
        // already graze it.
        x: Math.max(40, Math.min(332, this.paddle.centerX)),
        y: this.freeCatchPopY(),
        label: POWER_UP_NAMES[kind],
        malus: MALUS_KINDS.has(kind),
        ticksLeft: gameConfig.powerUps.catchPopLifeTicks,
      });
    }

    if (isPaddleWidthKind(kind)) {
      // The newest catch owns the deck: a WIDE taken under an XWIDE genuinely
      // shrinks it, exactly as a JAMMER has always undone a WIDE.
      for (const other of PADDLE_WIDTH_KINDS) {
        this.timers.deactivate(other);
      }
      const target = PADDLE_WIDTHS[kind];
      // A swap — a capsule taken while another still owns the deck — is the one
      // ease nobody designed the length of, and the only one bounded.
      const swapping = this.paddle.width !== gameConfig.paddle.baseWidth;
      const ticks = widthEaseTicks(
        this.paddle.width,
        target,
        swapping ? gameConfig.paddle.widthEaseSwapMaxTicks : undefined,
      );
      this.widthEaseKind = kind;
      this.paddle.easeWidthTo(target, ticks, WIDTH_CURVES[kind]);
      this.timers.activate(kind, durations[kind]);
    }
    if (kind === "L") {
      this.timers.activate("L", durations.L);
      this.laserCountdown = gameConfig.powerUps.laserFirstShotDelayTicks;
    }
    if (kind === "P") {
      this.timers.activate("P", durations.P);
    }
    // Beside PIERCE, which is the other capsule that changes what the ball does
    // to the wall rather than what the deck does. Nothing to arm but the timer:
    // the swell is a blend off it and the crush is read off the size.
    if (kind === "GI") {
      this.timers.activate("GI", durations.GI);
    }
    if (kind === "M" && !this.swarmLive) {
      // Stacking ladder: each catch climbs a tier and tops the field up to its
      // count. While a swarm is live, MULTI is inert (only the chime plays).
      this.multiTier = Math.min(gameConfig.powerUps.multiTierBallCounts.length, this.multiTier + 1);
      this.topUpBalls(gameConfig.powerUps.multiTierBallCounts[this.multiTier - 1], gameConfig.powerUps.multiBirthTicks);
      this.timers.activate("M", durations.M);
    }
    if (kind === "S") {
      // SWARM replaces the MULTI ladder outright and never stacks with anything:
      // a second catch only tops the field back up to the same 12.
      this.swarmLive = true;
      this.multiTier = 0;
      this.timers.deactivate("M");
      this.timers.activate("S", durations.S);
      this.topUpBalls(gameConfig.powerUps.swarmBallCount, gameConfig.powerUps.swarmBirthTicks);
    }
    if (kind === "B") {
      this.timers.activate("B", durations.B);
    }
    if (kind === "W") {
      // The origin moves only when there is no bar on screen to move. A second
      // WALL caught inside the ten discharge ticks — two in the air, or a RAIN
      // shower — would otherwise tear the collapsing bar sideways to the deck
      // and re-expand it from there; instead the charge restarts from wherever
      // the bar already is.
      if (this.wallBlend === 0) {
        this.wallOriginX = this.paddle.centerX;
        // Seeded so the catch frame itself shows the two pixels the bar starts
        // as, rather than the 48 the first full step would jump it to. One
        // pixel of reach either way, out of 366.
        this.wallBlend = 1 / (gameConfig.field.right - gameConfig.field.left);
      }
      this.wallArmed = true;
      this.deps.sfx.energyWallCharge();
    }
    if (kind === "T") {
      this.timers.activate("T", durations.T);
    }
    if (kind === "X") {
      this.timers.activate("X", durations.X);
    }
    if (kind === "N") {
      // The shockwave ring starts where the capsule was caught: the paddle centre.
      this.detonation.start(this.paddle.x + this.paddle.width / 2, this.paddle.y);
    }
    if (kind === "U") {
      // Split, because a refusal is a different sentence from an arrival and the
      // panel has to be able to say it. `Math.min` swallowed both into one line
      // that changed nothing at the cap, which left the capsule a no-op.
      if (this.lives < gameConfig.rules.maxLives) {
        this.lives++;
        this.lifeGainedCount++;
      } else {
        this.lifeRefusedCount++;
      }
    }
    if (kind === "Z") {
      this.destroyBottomRow();
    }
    if (kind === "R") {
      this.dropPool.rainSpawn(this.dropBag, gameConfig.powerUps.rainSpawnCount, this.dropExcludes());
    }
    if (kind === "G") {
      this.timers.activate("G", durations.G);
    }
    if (kind === "I") {
      this.timers.activate("I", durations.I);
    }
    if (kind === "H") {
      this.timers.activate("H", durations.H);
    }
    if (kind === "Y") {
      this.timers.activate("Y", durations.Y);
    }
    if (kind === "C") {
      this.timers.activate("C", durations.C);
    }
    if (kind === "K") {
      this.timers.activate("K", durations.K);
      // The pull is silent and the tethers only appear once something is
      // falling, so the next kill is made to drop one. Without it a magnet
      // caught over a dry stretch looks like a capsule that did nothing.
      this.guaranteedDrop = true;
    }
    if (kind === "V") {
      const { x, y } = gameConfig.powerUps.singularity;
      this.timers.activate("V", durations.V);
      this.singularity.open({ x, y, lifeTicks: durations.V, scale: 1 });
    }
    if (kind === "VX") {
      this.timers.activate("VX", durations.VX);
      this.openVortex(durations.VX);
    }
    if (kind === "BM") {
      this.blowUpPaddle();
    }
    if (kind === "BN") {
      this.dropPeels();
    }
    if (kind === "D") {
      // The timer and nothing else: the machine sags into the tube over the
      // next half second rather than at this instant, so the womp this catch
      // is about to fire is still the working machine's — the last sound it
      // makes before it goes.
      this.timers.activate("D", durations.D);
    }
    if (kind === "GH") {
      this.timers.activate("GH", durations.GH);
    }
    if (kind === "BK") {
      // The timer and nothing else: the trap is entirely in what the renderer
      // is allowed to show, and the simulation behind it plays on unaware.
      //
      // Except for the one capsule it cannot be shown over. See the UMBRA
      // branch below, which retires this one for the same reason and says why.
      this.retireForUmbra();
      this.timers.activate("BK", durations.BK);
    }
    if (kind === "UM") {
      /**
       * **UMBRA and BLACKOUT retire each other on catch.**
       *
       * There is no honest way to draw a black surface under a black veil.
       * Every other pair on this roster can be held at once because each says
       * something the other leaves alone; these two say the same thing to the
       * same pixels and one of them is a collider. Dimmed, tinted or outlined,
       * a shadow under the veil is a wall the player cannot see and can be
       * turned by — which is the one defect this roster has never shipped, and
       * not one to ship for the sake of a stack nobody asked for.
       *
       * Newest catch wins, both ways: the capsule the player just took is the
       * one they get. Whichever is live simply ends, and ends the way its own
       * expiry does, so the field is never left holding half of it.
       */
      if (this.timers.isActive("BK")) {
        this.timers.deactivate("BK");
        this.deps.sfx.blackoutPickup();
      }
      this.timers.activate("UM", durations.UM);
      this.shadows.start(durations.UM);
      this.deps.sfx.umbraRise();
    }
    if (kind === "CO") {
      // The wall as it stands on the catch frame. A second COLLAPSE re-fogs
      // everything, the cells already solved included — see `Decoherence.start`
      // for why a trap is allowed to charge twice where a bonus is not.
      this.timers.activate("CO", durations.CO);
      this.decoherence.start(this.grid, durations.CO);
      this.deps.sfx.collapseFog();
    }
    if (kind === "SU") {
      // The wall as it stands on the catch frame, which is the whole of the
      // capsule's state: every brick alive right now gets a double, and one
      // caught over a live SUPERPOSE re-echoes rather than tops up. See
      // `Superposition.start` for why that is the only honest answer.
      this.timers.activate("SU", durations.SU);
      this.superposition.start(this.grid, durations.SU);
      this.deps.sfx.superposeSplit();
    }
    if (kind === "TW") {
      // The wall as it stands on the catch frame, and a second TWIN redraws the
      // pairing rather than topping the eighteen seconds up — `Entanglement.start`
      // has the argument, which is SUPERPOSE's above it.
      this.timers.activate("TW", durations.TW);
      this.entanglement.start(this.grid, durations.TW);
      this.deps.sfx.twinWeave();
    }
    if (kind === "GB") {
      const { reelTicks, holdTicks } = gameConfig.powerUps.gamble;
      // A second GAMBLE over a reel still turning resolves that one first: the
      // player caught two capsules and is owed two results, and the alternative
      // — the pending one silently overwritten — is the swallowed effect SHA-29
      // went to some trouble to remove.
      this.resolveGamble();
      this.gambleKind = this.gamblePin ?? rollFace(null);
      this.gambleFace = rollFace(this.gambleKind);
      this.gambleTicksLeft = reelTicks + holdTicks;
    }
    if (kind === "A") {
      // A second catch over a live charge is the chime and nothing else: there
      // is one save, and stacking them would make the strongest capsule in the
      // game stronger still.
      this.angelCharged = true;
    }
    if (kind === "TU") {
      this.timers.activate("TU", durations.TU);
    }
    if (kind === "F") {
      // The timer and nothing else, like the two above it: the field turns in
      // the renderer and the hand is read the other way round, and the ball
      // between them never learns which way up it is being watched.
      this.timers.activate("F", durations.F);
    }
    if (kind === "Q") {
      // The kill first: it is the bottom-most live row that goes, so the slide
      // below can never push a brick off the end of the grid.
      this.destroyBottomRow();
      this.grid.shiftDown();
      // The cells move by reference and their wear moves with them: a brick
      // ERODE has taken 5 px off is still that brick a row further down.
      this.erosion.shiftDown();
      this.sheet.shiftDown();
      this.slump.shiftDown();
      // TWIN's couples are cell indices, so they ride the slide the way the wear
      // above them does — a quake that moved the wall out from under the pairing
      // would leave every thread on the field pointing at the wrong brick.
      this.entanglement.shiftDown();
      this.quake.start();
      // The catch happens below `quake.step()` in the same tick, so the wall
      // would spend its first frame drawn a row above a hitbox that had not
      // moved yet — the one frame of the fall where a ball is most likely to be
      // arriving at the row that just changed.
      this.grid.topOffset = this.quake.dropOffset;
    }
    if (kind === "PO") {
      this.timers.activate("PO", durations.PO);
    }
    if (kind === "O") {
      // A second catch buys time on the set already out there: moving the discs
      // out from under a ball mid-rally would be the game changing its mind.
      if (this.bumpers.active) {
        // A rack halfway out of the door comes back rather than leaving a live
        // timer over an empty field, and a rack simply standing there lights
        // its eyes. One call, because they are the same sentence: the set you
        // already have, topped up.
        this.bumpers.revive();
      } else {
        this.bumpers.spawn(gameConfig.grid.top + this.grid.rows.length * gameConfig.grid.brickHeight);
      }
      this.timers.activate("O", durations.O);
    }
    if (kind === "CR") {
      this.spawnCritter();
    }
    if (kind === "RU") {
      this.timers.activate("RU", durations.RU);
    }
    if (kind === "HA") {
      this.timers.activate("HA", durations.HA);
      // The first kick is a full cadence away rather than on the catch itself.
      // The blend needs those fifteen ticks to be worth anything — a kick on
      // the catch frame would be scaled by a blend of 1/24 and land as nothing,
      // spending the trap's loudest moment on its weakest one. A second HA
      // caught over a live one re-arms the same clock, which is the top-up.
      this.haywireKickIn = gameConfig.powerUps.haywire.kickTicks;
    }
    if (kind === "EN") {
      // Nothing is armed on the catch and nothing needs to be: the shot is put
      // on at the next contact, out of whatever the deck is doing then. A second
      // ENGLISH caught over a live one is a plain top-up of the same forty
      // seconds, and any spin already in the air is untouched by it — the ball
      // is carrying a shot, not a subscription.
      this.timers.activate("EN", durations.EN);
    }
    if (kind === "SN") {
      this.timers.activate("SN", durations.SN);
    }
    if (kind === "TR") {
      // The timer and nothing else, like SNAP above it. The threads are rebuilt
      // from the live balls every tick and hold no state of their own, so there
      // is nothing here to seed and a second TRACER over a live one is a plain
      // top-up of the twenty seconds.
      this.timers.activate("TR", durations.TR);
    }
    if (kind === "ER") {
      this.timers.activate("ER", durations.ER);
    }
    if (kind === "TI") {
      // The timer and nothing else. The sea chases it by itself in `stepTide`,
      // which is what makes a second TIDE over a live one a plain top-up: the
      // water is already in, and there is no arrival to restart — a draining
      // one simply stops draining and climbs back.
      this.timers.activate("TI", durations.TI);
    }
    if (kind === "SL") {
      // The timer and the fall's own start, which is the hesitation: four ticks
      // of a wall that has stopped being held up and has not yet noticed. A
      // second SLUMP over a live one tops the sixteen seconds up and hesitates
      // again, which is right — the wall is being let go of a second time, and
      // whatever had already fallen stays exactly where it fell.
      this.timers.activate("SL", durations.SL);
      this.slump.start();
    }
    if (kind === "FE") {
      // The timer and the planting. A second FENCE over a live one tops the ten
      // seconds up and **repairs** the fence it finds rather than planting a
      // second one into its gaps: the phase is kept, only the posts the player
      // has already smashed are driven back in, and an extraction that had
      // started is called off. Twelve posts in a row would be a wall, and the
      // gaps are the capsule.
      this.timers.activate("FE", durations.FE);
      this.fence.plant();
    }
    if (kind === "JE") {
      // The one capsule whose effect object has to be told the catch happened,
      // rather than chasing a timer by itself. Everything else here either is a
      // timer or is rebuilt from the field every tick; the sheet is a
      // simulation with its own history, and the slack running in from the
      // frames is an event with a start.
      //
      // A second JELLY over a live one tops the twenty seconds up and restarts the
      // slack, which is the honest answer for a capsule whose arrival is how
      // the player is told what the wall is made of: the wave already in the
      // sheet is left exactly alone, so nothing in flight is interrupted.
      this.timers.activate("JE", durations.JE);
      this.sheet.start();
    }
    if (kind === "GR") {
      // The timer and nothing else. The cracks are the capsule's whole state
      // and they chase this by themselves; a second GRAVEL over a live one is a
      // plain top-up of the twenty-four seconds, and the pips already falling are
      // nobody's business but their own — they were paid for by a kill that
      // has already happened.
      this.timers.activate("GR", durations.GR);
    }
    if (kind === "PY") {
      this.timers.activate("PY", durations.PY);
      // The ammunition, and the reason this capsule is not a dud. Through
      // `topUpBalls` rather than around it, so a swarm or a stacked MULTI
      // already over three is left exactly alone: PYRE tops the field up, it
      // never caps it. The ladder itself is untouched — a MULTI caught after
      // this still starts at its own first rung, because the balls on the field
      // are not the ladder's count of them.
      this.topUpBalls(gameConfig.powerUps.pyre.ballCount, gameConfig.powerUps.multiBirthTicks);
    }
    if (kind === "XR") {
      this.timers.activate("XR", durations.XR);
    }
    if (kind === "MT") {
      // A volley already in the air keeps flying and a second one joins it; a
      // third catch inside the same fall finds the pool full and is the sound
      // alone, exactly as a BUMPERS catch over live discs only buys time.
      this.meteors.launch();
    }

    if (kind === "FU") {
      // The missing half, or a whole pair when there is nothing to finish.
      // Both halves go through this same method rather than straight into the
      // timers: LASER owes itself a first-shot delay and GLUE owes itself its
      // stick state, and neither is FUSE's business to know about.
      //
      // Applying a half that is *already* live is the top-up, and it is the
      // point rather than a side effect: a PIERCE with 30 ticks left would
      // otherwise light NOVA for half a second and the capsule would read as
      // broken. `activate` sets the full duration either way, so one call does
      // both jobs.
      const completable = completableCombos((half) => this.timers.isActive(half));
      const pool = completable.length > 0 ? completable : COMBOS;
      const combo = pool[Math.floor(Math.random() * pool.length)];
      this.applyPowerUp(combo.a);
      this.applyPowerUp(combo.b);
    }

    if (kind === "N") {
      // One detonation instead of a pickup jingle — and instead of ~70 per-brick beeps.
      this.deps.sfx.nukeDetonation();
    } else if (kind === "S") {
      this.deps.sfx.swarmPickup();
    } else if (kind === "GH") {
      this.deps.sfx.ghostFade();
    } else if (kind === "SP") {
      // Its own snap ahead of the shared womp, the way GHOST's fade is: the trap
      // is heard as the thing that happened — a deck coming apart.
      this.deps.sfx.splitPickup();
      // And a spray of the deck off the seam on the same frame, so the crack
      // that opens over the next ten ticks has a moment it visibly started at.
      // The material is the deck's, not a brick's: these are pieces of paddle.
      this.particles.burst(
        this.paddle.centerX,
        this.paddle.y + gameConfig.paddle.height / 2,
        "deck",
        gameConfig.effects.splitTearBurst,
      );
    } else if (kind === "BM") {
      // Its own boom instead of the shared womp: this trap is not a setback.
      this.deps.sfx.paddleExplode();
    } else if (kind === "TU") {
      // Its own wind-up instead of the pickup chime: the boost takes half a
      // second to arrive, and a chime that is over before the balls have
      // reached speed says the wrong thing about what just happened.
      this.deps.sfx.turboSpool();
    } else if (kind === "F") {
      // Its own tumble instead of the shared womp, the way GHOST's fade and
      // BLACKOUT's power-down are: what happened is the machine turning over,
      // and the four notes are scored to the half second the turn takes.
      this.deps.sfx.flipPickup();
    } else if (kind === "BK") {
      // Its own power-down instead of the shared womp, the way GHOST's fade and
      // SPLIT's snap are: what happened is the lights going out, and that says
      // "trap" better than the tier's own complaint does.
      this.deps.sfx.blackoutPickup();
    } else if (MALUS_KINDS.has(kind)) {
      // One womp for every trap: the blink and the pink pop already say which.
      this.deps.sfx.malusPickup();
    } else if (kind === "SN") {
      // The switch closing, and nothing more: see `snapGridOn`. A second SNAP
      // caught over a live one is the same tick again, which is right — the
      // setting was already on and has been turned on again.
      this.deps.sfx.snapGridOn();
    } else if (kind === "PY") {
      // Its own strike instead of the pickup chime: what happened is two balls
      // arriving already alight, and the chime says "you have a thing".
      this.deps.sfx.pyreLight();
    } else if (kind === "GR") {
      // Its own rasp instead of the pickup chime, and it has to be its own: the
      // chime says "you have a thing", and what the player has to hear here is
      // sixty brick faces splitting at once.
      this.deps.sfx.gravelRasp();
    } else if (kind === "ER") {
      this.deps.sfx.mortarGive();
    } else if (kind === "SL") {
      // Girders letting go, and it has to be its own: the chime says "you have
      // a thing", and what the player has to hear here is the wall stopping
      // being held up a beat before it moves.
      this.deps.sfx.slumpGive();
    } else if (kind === "JE") {
      // The wall going slack, and it has to be its own: the chime says "you
      // have a thing", and what the player has to hear here is a wall stopping
      // being one.
      this.deps.sfx.jellySlacken();
    } else if (kind === "TI") {
      // The sea coming in, and it has to be its own for the reason the two
      // above it are: the chime says "you have a thing", and what happens here
      // is the field filling up under the player's deck. It is scored to the
      // forty ticks the flood takes, so the sound ends on the frame the deck
      // lifts off the rail.
      this.deps.sfx.tideFlood();
    } else if (kind === "V") {
      this.deps.sfx.singularityOpen();
    } else if (kind === "VX") {
      this.deps.sfx.singularityOpen(gameConfig.powerUps.vortex.scale);
    } else if (kind === "I") {
      this.deps.sfx.stasisFreeze();
    } else if (kind === "U") {
      this.deps.sfx.extraLife();
    } else if (kind === "Z") {
      // The row vaporizes silently brick-by-brick; one boom covers the sweep.
      this.deps.sfx.blastExplosion();
    } else if (kind === "Q") {
      this.deps.sfx.quakeRumble();
    } else if (kind === "MT") {
      // One incoming howl for the volley instead of a pickup chime; the bricks
      // it drills speak for themselves as it goes.
      this.deps.sfx.meteorFall();
    } else {
      this.deps.sfx.capsulePickup();
    }
  }

  // The bottom-most occupied row, vaporized outright: full points (PAYDAY
  // applies), silver and gold die in one hit, but like a nuke it drops no
  // capsules and never chains BLAST. ZAP is this and nothing else; QUAKE runs
  // it and then slides what is left down a row.
  /**
   * Absolute mouse tracking, and BANANA's one complication.
   *
   * Without pointer lock the mouse names a position rather than a movement, so
   * a skid cannot simply drop the input the way the locked path does: the next
   * event would put the deck wherever the pointer is and undo the slide, and
   * ignoring the pointer outright would snap the deck across the field the tick
   * the skid ended. So the position is remembered and `stepPeels` glides onto
   * it once the deck is the player's again.
   */
  private pointToStage(stageX: number): void {
    // Mirrored here, before the steer, so the position BANANA remembers to
    // glide back onto is already the one the deck was steering to.
    this.steerTo(this.flipped ? gameConfig.field.width - stageX : stageX);
  }

  // Put the deck under a field position the way the mouse does: straight
  // there, unless a skid or its resync owns the deck, in which case it is the
  // spot the resync glides back onto. The film's autopilot steers through
  // here too, so it can never do anything a mouse could not.
  private steerTo(fieldX: number): void {
    if (this.skidTicksLeft > 0 || this.resyncTicksLeft > 0) {
      this.pointerTargetX = fieldX;
      return;
    }
    this.paddle.moveCenterTo(fieldX);
  }

  // BANANA: two or three peels thrown onto the rail, never under the deck
  // standing on it. The two spans either side of the keep-out are the free list
  // the throw draws from, and one peel is committed to each side before the
  // rest roll across whatever is left: a trap that can leave the deck a clear
  // side to retreat to is luck rather than a trap. The field is 366 px wide
  // against an 80 px keep-out, so the two spans can never both be empty, and a
  // deck against a wall simply leaves one for them all to land in.
  //
  // Nothing beyond that keep-out and a 4 px gap shapes where they fall. The
  // scatter is the point: the count changes from catch to catch and the spots
  // are rolled flat across whatever rail is left, so two peels can land almost
  // touching or a whole field apart, and neither is the arrangement the player
  // comes to expect.
  private dropPeels(): void {
    const { peelWidth, peelsMinPerDrop, peelsMaxPerDrop, maxPeels, peelLifeTicks, peelBlinkTicks, peelClearX } =
      gameConfig.powerUps.banana;
    const min = gameConfig.field.left;
    const max = gameConfig.field.right - peelWidth;
    const center = this.paddle.centerX;
    // Legal left edges, as a free list that shrinks with every peel placed in
    // it. Both halves of a split keep the side they were cut from, so a span
    // below the deck centre is a left-hand span for as long as the throw lasts.
    const spans: PeelSpan[] = [];
    const leftEnd = center - peelClearX - peelWidth;
    const rightStart = center + peelClearX;
    if (leftEnd >= min) {
      spans.push({ lo: min, hi: leftEnd });
    }
    if (rightStart <= max) {
      spans.push({ lo: rightStart, hi: max });
    }
    // The peel is what is left after the deck ate the banana, so it leaves the
    // deck rather than appearing at full size 150 px away at the edge of
    // vision. The flight comes off the distance, so the eye can follow it out:
    // the peels leave the same point on the same tick and land on as many
    // different ones, which is a spray rather than a volley.
    const fromX = center - peelWidth / 2;

    // Rolled per catch rather than fixed, so the rail has to be read each time.
    const wanted = peelsMinPerDrop + Math.floor(Math.random() * (peelsMaxPerDrop - peelsMinPerDrop + 1));

    for (let thrown = 0; thrown < wanted; thrown++) {
      // The first two are owed a side each; anything past them is free. A side
      // with no room left falls through to the whole list rather than costing
      // the throw a peel.
      const owed =
        thrown === 0
          ? spans.filter((span) => span.lo < center)
          : thrown === 1
            ? spans.filter((span) => span.lo > center)
            : [];
      const x = takePeelSpot(owed.length > 0 ? owed : spans, spans);
      if (x === null) {
        break;
      }
      this.peels.push({
        x,
        ticksLeft: peelLifeTicks,
        flightTicksLeft: peelFlightTicks(Math.abs(x - fromX)),
        fromX,
      });
    }
    // A fourth peel no longer deletes the oldest inside the same statement that
    // made it: the oldest is dropped into its last second instead and leaves
    // the rail through the same blink every other peel does. Clamped as many
    // times over as the cap needs, never index 0 alone — nothing is spliced
    // here any more, so two BANANAs inside a minute would otherwise leave five
    // or six live peels rather than the three the newest catch is worth.
    let fresh = this.peels.reduce((count, peel) => count + (peel.ticksLeft > peelBlinkTicks ? 1 : 0), 0);
    for (const peel of this.peels) {
      if (fresh <= maxPeels) {
        break;
      }
      if (peel.ticksLeft > peelBlinkTicks) {
        peel.ticksLeft = peelBlinkTicks;
        fresh--;
      }
    }
  }

  /**
   * BANANA's peels and the skid one causes, a tick at a time.
   *
   * Contact is horizontal overlap and nothing else: a peel lies on the rail the
   * deck slides along, so there is no height to test and nothing else on the
   * field can touch one. Sweeping it hands the paddle to its own momentum —
   * the deck keeps being moved, the player's steering simply stops reaching it.
   *
   * Called from `stepSimulation` under the detonation, clear and fuse gates, so
   * a peel neither ages nor catches while the field is frozen behind an effect.
   * The throw is the exception and is stepped above them, with the catch pops:
   * a peel left hanging in mid-arc behind a shockwave would be the one part of
   * this the freeze cannot excuse.
   */
  private stepPeels(): void {
    const { skidTicks, skidMaxVx, skidMinVx, skidDecay, skidCooldownTicks, resyncTicks, resyncRate, peelWidth } =
      gameConfig.powerUps.banana;

    this.peels = this.peels.filter((peel) => --peel.ticksLeft > 0);

    if (this.skidTicksLeft > 0) {
      // TEMPO slows the slide as it slows the balls: bullet-time that left the
      // deck skating at full speed would read as two clocks running at once —
      // which is why this is the capsule's own eased factor and not a second
      // reading of the timer. The other three clocks on `ballTimeScale()` are
      // deliberately absent: STASIS stops the balls and nothing else, and a
      // RUSH is not a reason for a banana skin to be more slippery.
      this.paddle.moveByDelta(this.skidVx * this.tempoScale());
      // The paddle's own clamp swallowed the move: a skid into a wall stops
      // dead there rather than banking speed to spend on the way back out.
      if (this.paddle.x <= gameConfig.field.left || this.paddle.x >= gameConfig.field.right - this.paddle.width) {
        this.skidVx = 0;
      }
      this.skidVx *= skidDecay;
      if (--this.skidTicksLeft === 0) {
        this.skidCooldown = skidCooldownTicks;
        this.resyncTicksLeft = this.pointerTargetX === null ? 0 : resyncTicks;
      }
    } else if (this.skidCooldown > 0) {
      this.skidCooldown--;
    }

    if (this.resyncTicksLeft > 0 && this.pointerTargetX !== null) {
      this.paddle.moveByDelta((this.pointerTargetX - this.paddle.centerX) * resyncRate);
      if (--this.resyncTicksLeft === 0) {
        this.pointerTargetX = null;
      }
    }

    // Not while one is running, and not for a moment afterwards: peels come
    // three at a time, and a chained skid is a deck the player never gets back.
    // And not while the deck is off the rail at all — a peel lies on the wood,
    // which is the whole reason contact here is horizontal overlap and nothing
    // else, and a deck TIDE has floated 96 px into the air cannot step on one.
    // The peels go on ageing and blinking underneath, so a flood that outlasts
    // them clears the rail and a flood that does not hands it back.
    if (this.skidTicksLeft === 0 && this.skidCooldown === 0 && this.paddle.y >= gameConfig.paddle.y) {
      const { left, right } = this.paddle.bounds;
      // Nothing in the air is a hazard: you cannot slip on a peel that has not
      // landed. It costs the player 8-24 ticks of a 600-tick life and buys back
      // the case `peelClearX` cannot cover, where the deck walks onto the
      // landing spot during the flight. The life clock runs throughout, so the
      // reprieve is paid for out of the peel's own time.
      const index = this.peels.findIndex(
        (peel) => peel.flightTicksLeft <= 0 && peel.x + peelWidth > left && peel.x < right,
      );
      if (index >= 0) {
        const [peel] = this.peels.splice(index, 1);
        // Whatever the deck was doing, held and decayed. A paddle standing
        // still slides toward the peel it stepped on, so a skid is never a
        // no-op — being motionless is not a way to be immune to one.
        const delta = Math.max(-skidMaxVx, Math.min(skidMaxVx, this.paddle.x - this.lastPaddleX));
        const toward = Math.sign(peel.x + peelWidth / 2 - this.paddle.centerX) || 1;
        this.skidVx = (Math.sign(delta) || toward) * Math.max(skidMinVx, Math.abs(delta));
        this.skidTicksLeft = skidTicks;
        this.deps.sfx.bananaSlip();
      }
    }

    this.lastPaddleX = this.paddle.x;
  }

  // Peels, the slide, its cooldown and the pointer the deck owes a resync to:
  // all of it is run state, and all of it dies with a serve, a cleared level or
  // a run. A peel left on the rail across a reset would be a hazard nobody put
  // there, and a live `skidTicksLeft` would eat the next screen's input.
  private resetSkid(): void {
    this.peels = [];
    this.skidTicksLeft = 0;
    this.skidVx = 0;
    this.skidCooldown = 0;
    this.resyncTicksLeft = 0;
    this.pointerTargetX = null;
    this.lastPaddleX = this.paddle.x;
  }

  /**
   * BOMB: the paddle detonates, and the life goes with it.
   *
   * Three bursts across its width rather than one at the middle, so the whole
   * deck comes apart instead of a spark appearing at its centre. The life is
   * not taken here — the fuse gate in `stepSimulation` calls `die()` when the
   * debris has flown, which is what buys the player the beat to see what hit
   * them.
   */
  private blowUpPaddle(): void {
    const { fuseTicks, burst, shardSpread, shardLift } = gameConfig.effects.paddleBlast;
    const y = this.paddle.y + gameConfig.paddle.height / 2;
    // The deck itself, cut in three and thrown. The pieces tile it exactly on
    // the frame they are cut — the same three places the bursts go off, near
    // enough — so the explosion is the paddle rather than a red flash where the
    // paddle was. `deck` and not a brick kind for the chunks, for the same
    // reason: these are pieces of the thing the player was steering.
    const third = this.paddle.width / 3;
    this.paddleShards = [0, 1, 2].map((index) => ({
      x: this.paddle.x + (index + 0.5) * third,
      y: this.paddle.y,
      vx: (index - 1) * shardSpread,
      vy: -shardLift,
      width: third,
    }));
    this.paddleBreak = 1;
    for (const at of [0.15, 0.5, 0.85]) {
      this.particles.burst(this.paddle.x + this.paddle.width * at, y, "deck", burst);
    }
    this.brickFlashes.push({
      x: this.paddle.centerX - 15,
      y: this.paddle.y - 2,
      ticksLeft: gameConfig.effects.deathFlashTicks,
      kind: "death",
      onWall: false,
      gild: false,
    });
    this.deathCountdown = fuseTicks;
  }

  // One ring per ball on screen, centred where it hung. Glued balls get one
  // too: they were held by the paddle rather than by the freeze, but the ring
  // is the field saying it is moving again, not a per-ball claim.
  private popStasisRings(): void {
    for (const ball of this.balls) {
      if (ball.active) {
        const half = ball.size / 2;
        this.stasisRings.push({
          x: ball.x + half,
          y: ball.y + half,
          ticksLeft: gameConfig.powerUps.stasisRingLifeTicks,
        });
      }
    }
    this.deps.sfx.stasisRelease();
  }

  private destroyBottomRow(): void {
    for (let row = this.grid.rows.length - 1; row >= 0; row--) {
      const hits: BrickHit[] = [];
      for (let column = 0; column < gameConfig.grid.columns; column++) {
        const hit = this.grid.hitAtCell(row, column);
        if (hit) {
          hits.push(hit);
        }
      }
      if (hits.length === 0) {
        continue;
      }
      for (const hit of hits) {
        this.destroyBrick(hit);
        this.releaseSeededCapsule(hit);
        this.score += hit.cell.points * this.scoreMultiplier();
        this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
      }
      break;
    }
    // Same idempotent clear trigger as damageBrick: either capsule can take the
    // last row.
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  /**
   * PYRE: the ball that may never burn.
   *
   * The lowest ball on the field, which is the one nearest the deck — and with
   * one ball left it is that ball, so a single-ball field has a reserve and no
   * ammunition, exactly as the rule says.
   *
   * Read off position rather than stored, and read every tick, so two balls
   * crossing genuinely hand the reserve over: the fire moves to whichever is now
   * further from your deck, which is the same ball `pyreFuse` would spend. The
   * cue and the click can never disagree because they are the same sort.
   *
   * `>=` and not `>`, and it is load-bearing: `pyreFuse` keeps the *first* ball
   * of a tie and this keeps the **last**, so a field of clones stamped at one
   * spot — which is every MULTI for its first two ticks — still has a fuse and a
   * reserve that are two different balls.
   */
  private pyreReserve(): Ball | null {
    let reserve: Ball | null = null;
    for (const ball of this.balls) {
      if (ball.active && (reserve === null || ball.y >= reserve.y)) {
        reserve = ball;
      }
    }
    return reserve;
  }

  // The ball a click spends: the highest one, which is the one nearest the brick
  // wall. Null while there is nothing to spend — one ball on the field, or none.
  private pyreFuse(): Ball | null {
    let fuse: Ball | null = null;
    let live = 0;
    for (const ball of this.balls) {
      if (!ball.active) {
        continue;
      }
      live++;
      if (fuse === null || ball.y < fuse.y) {
        fuse = ball;
      }
    }
    return live >= 2 ? fuse : null;
  }

  /**
   * One tick of every crown, and the whole of PYRE's arrival and departure on
   * the balls.
   *
   * The counter runs `0 .. crownTicks + smokeTicks` and the picture is read off
   * where in that range it stands: the top band is fire and the bottom is smoke,
   * so a crown coming up passes through a wisp before it catches and a crown
   * going down falls back into one. One number, two ends, and neither of them
   * can be the other's opposite by accident.
   *
   * `pyreBlend >= 0.5` is the ticket's "then": the wash has to be half across
   * the deck before the balls take. It costs the first twelve ticks of the
   * catch, which is what buys the arrival its order.
   */
  private stepPyreCrowns(): void {
    const { crownTicks, smokeTicks } = gameConfig.powerUps.pyre;
    const full = crownTicks + smokeTicks;
    const lit = this.timers.isActive("PY") && this.pyreBlend >= 0.5;
    const reserve = this.pyreReserve();
    for (const ball of this.balls) {
      if (!ball.active) {
        // Not decremented: a ball that has left the field has no crown to put
        // out, and a counter still walking down in a dead slot would be a
        // wisp of smoke on the next ball stamped into it.
        ball.pyreCrown = 0;
      } else if (lit && ball !== reserve) {
        ball.pyreCrown = Math.min(full, ball.pyreCrown + 1);
      } else if (ball.pyreCrown > 0) {
        ball.pyreCrown--;
      }
    }
  }

  /**
   * The expiry: the crowns still standing go out one after another.
   *
   * Each is bumped *past* the top of its own range by one stagger more than the
   * last, so it holds at full fire for that long and then falls on the same
   * clock as everything else. The whole "one by one" is that one line — no
   * second counter, no per-ball delay to reset, and a crown lit late is in the
   * queue with the rest because the queue is only the order the loop finds them
   * in.
   */
  private gutterPyreCrowns(): void {
    const { crownTicks, smokeTicks, gutterStaggerTicks } = gameConfig.powerUps.pyre;
    let order = 0;
    for (const ball of this.balls) {
      if (ball.active && ball.pyreCrown > 0) {
        ball.pyreCrown = crownTicks + smokeTicks + order * gutterStaggerTicks;
        order++;
      }
    }
  }

  /**
   * A click, spent: the ball nearest the wall goes up and takes the bricks
   * around it.
   *
   * The kill is on this frame and all of it — the ring that runs out over the
   * next twenty-four ticks is the announcement, exactly as CHAIN's bolts outlive
   * the bricks they arced between. A blast that killed as it expanded would put
   * a quarter of a second between the click and the last brick, and the player
   * would be reading a delay where they meant to read a trade.
   *
   * Returns whether anything was spent, so the caller can tell an armed click
   * from an idle one.
   */
  private firePyre(): boolean {
    if (!this.timers.isActive("PY")) {
      return false;
    }
    const fuse = this.pyreFuse();
    if (!fuse) {
      return false;
    }
    const { size } = gameConfig.ball;
    const x = fuse.x + size / 2;
    const y = fuse.y + size / 2;
    // Out of play before the bricks, so nothing downstream can find a ball
    // standing in the middle of its own crater — `pyreBricksWithin` is about to
    // reopen the cells it was sitting in, and ERODE's wear reads which cells
    // have a ball in them.
    fuse.active = false;
    fuse.stuckOffsetX = null;
    fuse.clearHoming();
    fuse.pyreCrown = 0;
    this.pyreBricksWithin(x, y);
    this.pyreBlasts.push({ x, y, ticksLeft: gameConfig.powerUps.pyre.blastTicks });
    this.particles.sparkBurst(x, y, gameConfig.powerUps.pyre.fireBurst);
    const { shakeTicks, shakeAmplitude } = gameConfig.powerUps.pyre;
    this.quake.rattle(shakeTicks, shakeAmplitude);
    this.deps.sfx.pyreDetonation();
    return true;
  }

  /**
   * The crater, in cells.
   *
   * The centre is the ball's, in fractional cell coordinates — a ball halfway
   * between two columns blows a crater centred halfway between them, rather than
   * one snapped onto whichever cell its middle pixel happened to land in. The
   * offset is `topOffset`'s, so a crater opened while QUAKE's wall is still
   * falling lands on the wall the player can see.
   *
   * Kills are of the nuke's class: full points (PAYDAY applies), silver and gold
   * go in one, and no capsule drops, no BLAST splash and no CHAIN arc comes off
   * them. Thirteen bricks that each dropped a pill and set off their own
   * neighbours would make a spent ball worth more than the level, and the trade
   * this capsule is about is a ball for a hole — not a ball for a jackpot. A
   * seeded drop still comes out, because a seeded drop is a promise.
   */
  private pyreBricksWithin(x: number, y: number): void {
    const { left, top, brickWidth, brickHeight } = gameConfig.grid;
    const { cellRadius } = gameConfig.powerUps.pyre;
    const centerColumn = (x - left) / brickWidth - 0.5;
    const centerRow = (y - top + this.grid.topOffset) / brickHeight - 0.5;
    const radiusSquared = cellRadius * cellRadius;

    this.grid.rows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (!cell) {
          return;
        }
        const deltaRow = rowIndex - centerRow;
        const deltaColumn = columnIndex - centerColumn;
        if (deltaRow * deltaRow + deltaColumn * deltaColumn > radiusSquared) {
          return;
        }
        const hit = { cell, row: rowIndex, column: columnIndex };
        this.destroyBrick(hit);
        this.releaseSeededCapsule(hit);
        this.score += cell.points * this.scoreMultiplier();
        this.emitBurst(hit, gameConfig.effects.brickDeathBurst);
      });
    });

    // The same idempotent clear trigger every other indirect kill uses: a spent
    // ball can take the last brick on the board.
    if (this.grid.remaining <= 0) {
      this.clearCountdown = gameConfig.effects.clearDelayTicks;
    }
  }

  // GLUE release: every stuck ball leaves with a fresh paddle bounce, exactly
  // as if it had struck the paddle at its current spot. Returns how many it
  // freed, which is what CHARGE spends its held salvo on — this is called on
  // every click during play, and a count nobody checked would make an empty
  // click a free salvo.
  /**
   * GRAVEL's chips, one tick, and what the deck took off them.
   *
   * Beside the capsule catch and inside its gate for its reasons exactly: a pip
   * is a drop, so nothing may be collected behind a pending clear and nothing
   * moves behind a detonation — the freeze returns long before this, so a
   * shower caught by a shockwave hangs in the air with everything else and
   * finishes falling on the tick the field is the player's again.
   *
   * PAYDAY doubles the take and TURBO does not, which is the rule the bumper
   * kick and the level-clear bonus already follow: the triple is for kills, and
   * a shower farmed under it would pay more than the wall it came out of.
   *
   * One score line and one tick for the whole shower, and a puff of granite per
   * chip — see `GravelField.step` for why those are two different scales. The
   * puff is the game's stone material rather than a tone of the capsule's,
   * because that is honestly what broke: a chip landing on the deck is granite
   * hitting wood.
   */
  private stepGravel(): void {
    const { points, catchBurst } = gameConfig.powerUps.gravel;
    const caught = this.gravel.step({ cores: this.cores, paddleSegments: this.paddleSegments() }, (x, y) =>
      this.particles.burst(x, y, "R", catchBurst),
    );
    if (caught === 0) {
      return;
    }
    this.score += points * caught * this.paydayMultiplier();
    this.deps.sfx.gravelPip();
  }

  private releaseStuckBalls(): number {
    let released = 0;
    for (const ball of this.balls) {
      if (ball.active && ball.stuckOffsetX !== null) {
        released++;
        ball.stuckOffsetX = null;
        const relativeHit = relativePaddleHit(ball.centerX, this.paddle.bounds);
        ball.velocity = computePaddleBounceVelocity(relativeHit, this.speed(), gameConfig.bounce.maxAngleRad);
        ball.y = this.paddle.y - ball.size;
        this.deps.sfx.paddleBounce(relativeHit);
      }
    }
    return released;
  }

  // Fills the field up to targetCount from whatever is alive, cloning from the
  // first live ball in an even upward fan. Never removes a ball.
  //
  // `birthTicks` is how long the newcomers are *drawn* smaller than they
  // collide — one growth curve, read over whatever the caller names, because
  // three balls out of one separate in a couple of ticks and twelve do not.
  private topUpBalls(targetCount: number, birthTicks: number): void {
    const source = this.balls.find((ball) => ball.active);
    if (!source) {
      return;
    }
    const missing = targetCount - this.balls.filter((ball) => ball.active).length;
    if (missing <= 0) {
      return;
    }
    const { ballFanRad, ballFanJitterRad } = gameConfig.powerUps;
    this.balls
      .filter((ball) => !ball.active)
      .slice(0, missing)
      .forEach((ball, index) => {
        const angle = ballFanRad * ((2 * (index + 0.5)) / missing - 1) + (Math.random() - 0.5) * ballFanJitterRad;
        ball.cloneFrom(source, angle, this.speed(), birthTicks);
      });
  }

  private die(): void {
    this.deps.sfx.ballLost();
    this.lives--;
    if (this.lives <= 0) {
      this.gameOver();
    } else {
      this.resetServe();
    }
  }

  // A run must never keep playing while the paddle has no input: the ball and the
  // capsules would go on without the player, who has no cue that anything is wrong
  // because the cursor is hidden. Only "play" is at risk — on "serve" the ball is
  // still parked on the paddle. Resuming goes through advance(), whose click also
  // re-arms pointer lock.
  private onInputLost(): void {
    if (this.screen === "play") {
      this.setScreen("pause");
    }
  }

  // Serve and pause are the screens whose advance enters live play: that
  // advance re-arms pointer lock and waits for the grant, whether a click,
  // Space or P asked for it. Menu screens advance ungated — they must never
  // stall on a lock rejection — and a click during play is the GLUE release.
  private advanceGated(): void {
    // A click dismisses the console instead of launching a ball behind it — one
    // that did nothing at all would read as a frozen game.
    if (this.devConsole?.isOpen) {
      this.devConsole.close();
      return;
    }
    if (this.screen === "pause" || this.screen === "serve") {
      this.input.runGated(() => this.advance());
    } else {
      this.advance();
    }
  }

  private advance(): void {
    switch (this.screen) {
      case "title":
        this.startRun();
        break;
      case "serve":
        this.launch();
        break;
      case "play":
        // A click during play means one of two things, and never both on the
        // same click. **The release wins.** A player under GLUE has been
        // clicking to serve since they caught it, and a click that burned the
        // ball they were about to launch — because a PYRE happened to be live —
        // would be the game spending their ammunition for them. So: free what is
        // stuck, and if nothing was stuck, spend a ball.
        //
        // Under CHARGE (GLUE+LASER) the release means one more thing: the fire
        // the hold has been sitting on comes out with the balls. Only on a real
        // release, or every idle click would be a free salvo.
        if (this.releaseStuckBalls() > 0) {
          if (this.hasCombo("CHARGE")) {
            this.shotPool.fireFromPaddle(this.paddle);
            this.deps.sfx.laserFire();
            this.laserCountdown = this.hasCombo("STROBE")
              ? gameConfig.powerUps.comboLaserCadenceTicks
              : gameConfig.powerUps.laserCadenceTicks;
          }
          break;
        }
        this.firePyre();
        break;
      case "pause":
        this.setScreen("play");
        break;
      case "clear":
        this.level++;
        this.buildLevel(this.level);
        break;
      case "over":
        this.afterOver();
        break;
      case "scores":
      case "levels":
      case "capsules":
        this.showTitle();
        break;
      default:
        break;
    }
  }

  private startRun(): void {
    this.booted = true;
    // A fresh pass for a fresh run. Inheriting the tail of the last one would
    // open the game on whatever the previous player happened not to draw.
    this.dropBag.reset();
    // The one thing `resetServe()` below will not clear, so the new run clears
    // it here: a save carries across levels, never across runs.
    this.angelCharged = false;
    this.score = 0;
    this.lives = gameConfig.rules.startLives;
    this.level = 0;
    this.capsulesCaught = 0;
    this.trapsCaught = 0;
    this.buildLevel(this.level);
    this.deps.sfx.gameStart();
  }

  private buildLevel(level: number): void {
    this.grid.load(wallFor(level), () => this.rollBrickCapsule());
    // Sized to this wall and handed over once. The grid reads the wear out of it
    // for the rest of the level exactly as it reads QUAKE's drop off a number —
    // it never learns whose capsule either of them is.
    this.erosion.load(levelAt(level).rows.length);
    this.grid.erosion = this.erosion;
    this.sheet.load(levelAt(level).rows.length);
    this.slump.load(levelAt(level).rows.length);
    this.superposition.load(levelAt(level).rows.length);
    this.decoherence.load(levelAt(level).rows.length);
    this.entanglement.load(levelAt(level).rows.length);
    this.grid.fog = this.decoherence;
    this.grid.sheet = this.wallOffsets;
    this.grid.fence = this.fence;
    this.resetServe();
  }

  private resetServe(): void {
    this.balls.forEach((ball, index) => {
      ball.active = index === 0;
      ball.velocity = { x: 0, y: 0 };
      ball.stuckOffsetX = null;
      ball.clearHoming();
      ball.portalCooldown = 0;
      // Its own line, exactly like the cooldown above it: `topUpBalls` clones
      // into any free slot including `balls[0]`, so a MULTI caught after the
      // first ball drained stamps the very ball a lost life re-serves — and a
      // serve drawn 4 px wide is a bug nobody would guess the cause of.
      ball.birthTicksLeft = 0;
      ball.phasing = false;
      // And its own line again: `stepPyreCrowns` puts out the crown on any ball
      // that is not active, but `balls[0]` is about to be, and the serve screen
      // does not step the simulation at all. Without this the ball the player is
      // handed for the next life is still wearing the fire of the last one.
      ball.pyreCrown = 0;
      // Its own line for the cooldown's reason as well: spin outlives its
      // capsule by design, so nothing else would ever take it off, and a serve
      // that curved out of the deck would be the last life's shot arriving on
      // this one.
      ball.spin = 0;
      ball.spinPhase = 0;
    });
    this.balls[0].followPaddle(this.paddle);
    this.snapDeck();
    this.resetSkid();
    this.timers.reset();
    this.clearCombos();
    // Beside the timer that owns it. `ballLost()` has already fired by here, so
    // the drain drone is still heard on the broken machine that caused it.
    this.deps.sfx.setDemake(false);
    this.dropPool.reset();
    this.shotPool.reset();
    this.laserCountdown = 0;
    this.wallArmed = false;
    this.wallBlend = 0;
    this.wallOriginX = 0;
    this.wallStrikeLeft = 0;
    this.gambleTicksLeft = 0;
    this.gambleKind = null;
    this.gambleFace = null;
    // `angelCharged` is deliberately absent from this list, and it is the only
    // run state that is: a charge bought on level 3 is meant to still be there
    // on level 4, and a ball lost with one in hand never reaches this method at
    // all. `startRun()` and `gameOver()` clear it instead.
    this.multiTier = 0;
    this.swarmLive = false;
    this.brickFlashes = [];
    this.catchPops = [];
    this.stasisRings = [];
    this.bolts = [];
    this.closeCores();
    this.bumpers.reset();
    this.quake.reset();
    this.critter.reset();
    this.meteors.reset();
    this.snapBlend = 0;
    this.snapMarks = [];
    this.tracerBlend = 0;
    this.tracerThreads = [];
    this.pyreBlend = 0;
    this.pyreBlasts = [];
    this.erodeBlend = 0;
    this.erosion.reset();
    this.sheet.reset();
    this.slump.reset();
    this.fence.reset();
    this.shadows.reset();
    this.superposition.reset();
    this.decoherence.reset();
    this.entanglement.reset();
    this.gravelBlend = 0;
    this.gravel.reset();
    this.ghostBlend = 0;
    this.magnetBlend = 0;
    this.paydayBlend = 0;
    this.xrayBlend = 0;
    this.xraySweepSpan = 0;
    this.demakeBlend = 0;
    this.blackoutBlend = 0;
    this.portalBlend = 0;
    this.flipTurn = 0;
    this.turboSpool = 0;
    this.tempoBlend = 0;
    this.rushBlend = 0;
    this.haywireBlend = 0;
    this.haywireKickIn = 0;
    this.haywireKicking = false;
    this.englishBlend = 0;
    this.paddleVx = 0;
    this.paddleWasX = this.paddle.x;
    this.stasisBlend = 0;
    // The blend and the balls together: a serve reads `ball.size` to park
    // the ball on the deck, and it happens before the next `resizeBalls`.
    this.giantBlend = 0;
    for (const ball of this.balls) {
      ball.size = gameConfig.ball.size;
    }
    this.homingBlend = 0;
    this.glueReach = 0;
    this.mirrorForm = 0;
    this.mirrorAfterImageTicks = 0;
    this.laserBlend = 0;
    this.paddleBreak = 0;
    this.paddleShards = [];
    this.particles.reset();
    this.detonation.reset();
    this.clearCountdown = 0;
    this.deathCountdown = 0;
    this.guaranteedDrop = false;

    if (this.booted) {
      this.setScreen("serve");
    } else {
      this.showTitle();
    }
  }

  private launch(): void {
    const ball = this.balls[0];
    ball.active = true;
    ball.followPaddle(this.paddle);
    ball.launch(this.speed());
    this.setScreen("play");
    this.deps.sfx.launch();
  }

  private gameOver(): void {
    // Esc can end a run mid-effect, and a last-life drain lands here mid-tick:
    // no stale effect may stay frozen behind the GAME OVER overlay, and the
    // emptied capsule pool makes this tick's trailing dropPool.step a no-op —
    // nothing can be caught on the over screen. Timers and the wall charge must
    // die too: the side panel stays visible, and a leaked WIDE/PAYDAY label (or
    // the PAYDAY score blink) would keep showing through the overlay.
    this.brickFlashes = [];
    this.catchPops = [];
    this.stasisRings = [];
    this.bolts = [];
    this.closeCores();
    this.bumpers.reset();
    this.quake.reset();
    this.critter.reset();
    this.meteors.reset();
    this.snapBlend = 0;
    this.snapMarks = [];
    this.tracerBlend = 0;
    this.tracerThreads = [];
    this.pyreBlend = 0;
    this.pyreBlasts = [];
    this.erodeBlend = 0;
    this.erosion.reset();
    this.sheet.reset();
    this.slump.reset();
    this.fence.reset();
    this.shadows.reset();
    this.superposition.reset();
    this.decoherence.reset();
    this.entanglement.reset();
    this.gravelBlend = 0;
    this.gravel.reset();
    this.ghostBlend = 0;
    this.magnetBlend = 0;
    this.paydayBlend = 0;
    this.xrayBlend = 0;
    this.xraySweepSpan = 0;
    this.demakeBlend = 0;
    this.blackoutBlend = 0;
    this.portalBlend = 0;
    this.flipTurn = 0;
    this.turboSpool = 0;
    this.tempoBlend = 0;
    this.rushBlend = 0;
    this.haywireBlend = 0;
    this.haywireKickIn = 0;
    this.haywireKicking = false;
    this.englishBlend = 0;
    this.paddleVx = 0;
    this.paddleWasX = this.paddle.x;
    this.stasisBlend = 0;
    // The blend and the balls together: a serve reads `ball.size` to park
    // the ball on the deck, and it happens before the next `resizeBalls`.
    this.giantBlend = 0;
    for (const ball of this.balls) {
      ball.size = gameConfig.ball.size;
    }
    this.homingBlend = 0;
    this.glueReach = 0;
    this.mirrorForm = 0;
    this.mirrorAfterImageTicks = 0;
    this.laserBlend = 0;
    this.paddleBreak = 0;
    this.paddleShards = [];
    this.particles.reset();
    this.dropPool.reset();
    this.detonation.reset();
    this.timers.reset();
    this.clearCombos();
    this.deps.sfx.setDemake(false);
    // The deck too: it is run state like the rest, and the panel keeps drawing it
    // behind the overlay — a run ended under a JAMMER or a SPLIT used to leave a
    // stunted or broken paddle sitting on the GAME OVER screen.
    this.snapDeck();
    this.resetSkid();
    this.wallArmed = false;
    this.wallBlend = 0;
    this.wallOriginX = 0;
    this.wallStrikeLeft = 0;
    this.angelCharged = false;
    this.gambleTicksLeft = 0;
    this.gambleKind = null;
    this.gambleFace = null;
    this.clearCountdown = 0;
    this.deathCountdown = 0;
    this.guaranteedDrop = false;
    this.deps.screens.updateOver(zeroPad(this.score, 6));
    this.setScreen("over");
    this.deps.sfx.gameOver();
  }

  private afterOver(): void {
    this.refreshScoreRows();
    // Every run with points ends with initials entry: the server records all scores,
    // even those that do not reach the displayed top 5 of the shared board.
    if (this.score > 0) {
      this.entry = "";
      this.updateEntryText();
      this.setScreen("entry");
    } else {
      this.setScreen("scores");
    }
  }

  private showTitle(): void {
    const top = this.deps.hiScores.top;
    this.deps.screens.updateTitle(zeroPad(Math.max(top.score, this.score), 6), top.name);
    this.setScreen("title");
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.screen === "entry") {
      this.handleEntryKey(event);
      return;
    }

    // The test console: WARP's neighbour on the keyboard, and matched the same
    // way — on the physical key, with the same three modifiers (see hasDevChord).
    // The whole branch folds away in a production build whose `testConsole` knob
    // is down, where both halves of this condition are a literal `false`.
    if ((import.meta.env.DEV || gameConfig.rules.testConsole) && event.code === "KeyK" && hasDevChord(event)) {
      event.preventDefault();
      if (this.devConsole?.isOpen) {
        this.devConsole.close();
        return;
      }
      // Serve, play and pause, exactly like WARP: the console freezes a run to
      // take a command, so it has no meaning on a menu, and pausing to reach for
      // a three-modifier chord is normal. Never over the two effects that
      // already own the simulation, whose freeze it would have to unwind.
      const live = this.screen === "play" || this.screen === "serve" || this.screen === "pause";
      if (live && !this.detonation.active && this.clearCountdown === 0) {
        // Frees the cursor and hands Escape back to the page. Losing the lock
        // pauses a live run through onInputLost, which is the freeze we want.
        this.input.releaseLock();
        this.devConsole?.open();
      }
      return;
    }

    // An open console owns the keyboard, so no command can also drive the game.
    if (this.devConsole?.isOpen) {
      this.devConsole.handleKey(event);
      return;
    }

    if (event.key === " ") {
      // Space mirrors the mouse click: start on title, launch on serve, advance end screens.
      event.preventDefault();
      this.advanceGated();
      return;
    }

    // WARP easter egg: the chord over N clears the level on the spot (see
    // warpLevel and hasDevChord).
    //
    // Matched on `event.code`, not `event.key`: Option rewrites `event.key` into
    // the alternate glyph (⌥N is even a dead key), while the N keycap sits at the
    // same physical spot on AZERTY, QWERTY and QWERTZ — so the physical key is the
    // layout-proof one here. Read before the plain-letter keys below.
    if (event.code === "KeyN" && hasDevChord(event)) {
      event.preventDefault();
      this.warpLevel();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "p" && this.screen === "play") {
      this.setScreen("pause");
      this.deps.sfx.pauseToggle();
    } else if (key === "p" && this.screen === "pause") {
      // Resuming by key must re-arm the lock exactly like the resume click: an
      // ungated P would silently rebuild the free-cursor run the gate prevents.
      this.input.runGated(() => {
        this.setScreen("play");
        this.deps.sfx.pauseToggle();
      });
    }
    if (key === "m") {
      this.deps.sfx.toggleMuted();
    }
    // The level gallery, from the title only — it is a menu, and there is no
    // point in a still of a level while one is being played.
    if (key === "l" && this.screen === "title") {
      this.deps.levels.open();
      this.setScreen("levels");
      return;
    }
    // The capsule catalogue, from the title too, and for the same reason.
    if (key === "b" && this.screen === "title") {
      this.deps.capsules.open();
      this.setScreen("capsules");
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const step = event.key === "ArrowLeft" ? -1 : 1;
      // Only a page that moved clicks: on a roster small enough to fit one page
      // the arrows land back where they were, and a click would say otherwise.
      const turned =
        (this.screen === "levels" && this.deps.levels.turn(step)) ||
        (this.screen === "capsules" && this.deps.capsules.turn(step));
      if (turned) {
        this.deps.sfx.uiKeyClick();
      }
      return;
    }
    if (event.key === "Escape" && (this.screen === "play" || this.screen === "pause" || this.screen === "serve")) {
      this.gameOver();
    }
    // Escape backs out of a menu screen, the way its click and its Space do. A
    // separate branch from the quit above: a menu has no run to end.
    if (event.key === "Escape" && (this.screen === "levels" || this.screen === "capsules")) {
      this.showTitle();
    }
  }

  private handleEntryKey(event: KeyboardEvent): void {
    if (/^[a-z0-9]$/i.test(event.key) && this.entry.length < ENTRY_LENGTH) {
      this.entry += event.key.toUpperCase();
      this.updateEntryText();
      this.deps.sfx.uiKeyClick();
      if (this.entry.length === ENTRY_LENGTH) {
        this.entryCommitTimeoutId = window.setTimeout(() => this.commitScore(this.entry), ENTRY_COMMIT_DELAY_MS);
      }
      return;
    }

    if (event.key === "Backspace") {
      this.clearEntryCommitTimeout();
      this.entry = this.entry.slice(0, -1);
      this.updateEntryText();
      return;
    }

    // Exactly 3 initials: the server rejects shorter names, which would leave the
    // score on the local board but silently missing from the shared one.
    if (event.key === "Enter" && this.entry.length === ENTRY_LENGTH) {
      this.commitScore(this.entry);
    }
  }

  private commitScore(name: string): void {
    this.clearEntryCommitTimeout();
    if (this.screen !== "entry" || name.length !== ENTRY_LENGTH) {
      return;
    }

    this.deps.hiScores.commit(name, this.score);
    this.entry = "";
    this.refreshScoreRows();
    this.setScreen("scores");
  }

  private clearEntryCommitTimeout(): void {
    if (this.entryCommitTimeoutId !== null) {
      window.clearTimeout(this.entryCommitTimeoutId);
      this.entryCommitTimeoutId = null;
    }
  }

  private refreshScoreRows(): void {
    const { entries } = this.deps.hiScores;
    // Always TABLE_SIZE ranks, however few names the server holds: the block's
    // height is part of the screen's layout, not a function of who has played.
    const rows = Array.from({ length: TABLE_SIZE }, (_, index) => {
      const entry = entries[index];
      return {
        rank: zeroPad(index + 1, 2),
        name: entry?.name ?? "---",
        score: zeroPad(entry?.score ?? 0, 6),
        isTopRank: index === 0 && entry !== undefined,
        isEmpty: entry === undefined,
      };
    });
    this.deps.screens.updateScoreRows(rows);
  }

  private updateEntryText(): void {
    this.deps.screens.updateEntryText(`${this.entry}___`.slice(0, ENTRY_LENGTH));
  }

  private setScreen(screen: ScreenName): void {
    this.screen = screen;
    this.deps.screens.show(screen);
  }

  private speed(): number {
    return ballSpeedForLevel(this.level);
  }

  private panelView(): PanelView {
    const top = this.deps.hiScores.top;
    return {
      score: this.score,
      hiScore: Math.max(top.score, this.score),
      levelNumber: this.level + 1,
      levelName: levelAt(this.level).name,
      reserveLives: Math.max(0, this.lives - 1),
      powerLabel: this.powerLabel(),
      // Both, and in that order: the tide has to have crossed the whole wall
      // before the readout says anything, because the blink is the effect at
      // full strength and the wall is it arriving — and the timer has to still
      // be live, so the blink cannot outlive the rule it is reporting by even
      // the one frame the blend's own decay would cost it. It stops
      // deliberately without a fade: a steps(1) blink is a 1-bit signal, and
      // the 1-bit way to say "not any more" is to stop.
      //
      // TURBO's boost is unchanged. It gilds nothing and owes no arrival.
      scoreBoosted: (this.paydayBlend >= 1 && this.timers.isActive("X")) || this.timers.isActive("TU"),
      demakeActive: this.timers.isActive("D"),
      lifeGainedCount: this.lifeGainedCount,
      lifeRefusedCount: this.lifeRefusedCount,
      muted: this.deps.sfx.muted,
    };
  }

  // Every live effect, in roster order. WALL and NUKE are named here by hand
  // because no timer holds them — an armed charge and a running detonation —
  // and any later effect carrying its own state is added the same way. Order
  // comes from the roster, not from insertion, so the inset never reshuffles
  // itself under the player mid-rally.
  private activeEffects(): PowerUpKind[] {
    const live = new Set<PowerUpKind>(this.timers.activeKinds());
    if (this.wallArmed) {
      live.add("W");
    }
    if (this.angelCharged) {
      live.add("A");
    }
    if (this.gambleTicksLeft > 0) {
      live.add("GB");
    }
    if (this.detonation.active) {
      live.add("N");
    }
    if (this.critter.alive) {
      live.add("CR");
    }
    if (this.meteors.active) {
      live.add("MT");
    }
    // No timer holds BANANA either: what is live is a peel on the rail or the
    // slide itself, and both are things the player is owed a warning about.
    if (this.peels.length > 0 || this.skidTicksLeft > 0) {
      live.add("BN");
    }
    return POWER_UP_IDS.filter((kind) => live.has(kind));
  }

  /**
   * The POWER inset, 13 characters wide at 7px Silkscreen.
   *
   * One or two effects read as their names, the way the inset always has. Past
   * that the names give way to a still glyph row: the old label cycled one name
   * per second, so five live effects took five seconds to read and never showed
   * the same thing twice in a rally. A row that holds still is read at a glance,
   * and glyphs fall off the end for a `+n` count rather than wrap or truncate.
   */
  private powerLabel(): string {
    const kinds = this.activeEffects();
    if (kinds.length === 0) {
      return "- - -";
    }

    // Combos come after the capsules, and the halves stay listed: a fusion is
    // what the pair is doing, not a thing instead of them. Nothing here can be
    // live without both its halves, so the empty check above covers it too.
    const names = [...kinds.map((kind) => this.effectName(kind)), ...this.combos].join(" ");
    if (names.length <= POWER_LABEL_MAX_CHARS) {
      return names;
    }

    const glyphs = [...kinds.map((kind) => this.effectGlyph(kind)), ...this.combos.map((id) => COMBO_GLYPHS[id])];
    if (glyphs.join(" ").length <= POWER_LABEL_MAX_CHARS) {
      return glyphs.join(" ");
    }
    let shown = glyphs.length - 1;
    while (shown > 1 && countedGlyphRow(glyphs, shown).length > POWER_LABEL_MAX_CHARS) {
      shown--;
    }
    return countedGlyphRow(glyphs, shown);
  }

  // MULTI carries its tier into the inset either way it is written:
  // "MULTI x3" spelled out, "M3" in the glyph row.
  private effectName(kind: PowerUpKind): string {
    const name = POWER_UP_NAMES[kind];
    return kind === "M" && this.multiTier >= 2 ? `${name} x${this.multiTier}` : name;
  }

  private effectGlyph(kind: PowerUpKind): string {
    const glyph = POWER_UP_GLYPHS[kind];
    return kind === "M" && this.multiTier >= 2 ? `${glyph}${this.multiTier}` : glyph;
  }
}

// One run of rail a BANANA peel's left edge may still be thrown at. A throw
// starts with one span either side of the deck's keep-out and cuts a peel's
// width plus its gap out of the list as it places each one, so no roll is ever
// rejected and retried and two peels never land in a heap that reads as one.
interface PeelSpan {
  lo: number;
  hi: number;
}

// Rolls a landing spot inside `from` — either the whole free list or the one
// side of it a peel is owed — and carves it out of `all`. Null when there is no
// room anywhere in `from`, which is the only way a throw comes up short.
function takePeelSpot(from: readonly PeelSpan[], all: PeelSpan[]): number | null {
  const usable = from.filter((span) => span.hi >= span.lo);
  if (usable.length === 0) {
    return null;
  }
  // Weighted by length, so the spot is flat across the rail rather than flat
  // across the spans: a peel is as likely to land on any px still open to it,
  // which is what keeps the scatter from drifting toward even intervals.
  let roll = Math.random() * usable.reduce((total, span) => total + (span.hi - span.lo), 0);
  let picked = usable[usable.length - 1];
  for (const span of usable) {
    const width = span.hi - span.lo;
    if (roll < width) {
      picked = span;
      break;
    }
    roll -= width;
  }
  const x = picked.lo + Math.max(0, Math.min(roll, picked.hi - picked.lo));
  const { peelWidth, peelMinGap } = gameConfig.powerUps.banana;
  const blocked = peelWidth + peelMinGap;
  // Everything within a peel and a gap of the spot is off the list. Walked over
  // the whole list rather than the span the spot came out of, and backwards
  // because a span the spot sits inside of splits into two: a gap wide enough
  // would reach past the end of its own span and into the next.
  for (let index = all.length - 1; index >= 0; index--) {
    const span = all[index];
    const halves: PeelSpan[] = [];
    if (x - blocked >= span.lo) {
      halves.push({ lo: span.lo, hi: Math.min(span.hi, x - blocked) });
    }
    if (x + blocked <= span.hi) {
      halves.push({ lo: Math.max(span.lo, x + blocked), hi: span.hi });
    }
    all.splice(index, 1, ...halves);
  }
  return x;
}

// A bolt from one cell centre to the other as five points, the middle three
// kicked sideways so it reads as lightning and not as a ruler line.
function chainBolt(fromRow: number, fromColumn: number, toRow: number, toColumn: number, ticks: number): ChainBolt {
  const { left, top, brickWidth, brickHeight } = gameConfig.grid;
  const fromX = left + (fromColumn + 0.5) * brickWidth;
  const fromY = top + (fromRow + 0.5) * brickHeight;
  const spanX = left + (toColumn + 0.5) * brickWidth - fromX;
  const spanY = top + (toRow + 0.5) * brickHeight - fromY;
  const length = Math.hypot(spanX, spanY) || 1;

  const points = [];
  for (let step = 0; step <= 4; step++) {
    const along = step / 4;
    const kick = step === 0 || step === 4 ? 0 : (Math.random() * 2 - 1) * CHAIN_BOLT_JITTER;
    points.push({
      x: fromX + spanX * along - (spanY / length) * kick,
      y: fromY + spanY * along + (spanX / length) * kick,
    });
  }
  return { points, ticksLeft: ticks };
}

// "E L P X J +2" — the glyphs that fit, then how many did not.
function countedGlyphRow(glyphs: readonly string[], shown: number): string {
  return `${glyphs.slice(0, shown).join(" ")} +${glyphs.length - shown}`;
}
