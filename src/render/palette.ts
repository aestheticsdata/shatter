import { BRICK_BY_ID, byBrickId } from "@core/config/bricks";
import { byId, POWER_UPS } from "@core/config/powerUps";
import { parentTone } from "@render/pix";

import type { BrickKind, ChunkMaterial, PowerUpKind } from "@interfaces/types";

export interface BrickColorSet {
  flat: string;
  light: string;
  dark: string;
}

/**
 * Which deck is being painted: the player's, MIRROR's ghost, a BOMB's whiteout,
 * or the stone THE IRIS turns it into.
 *
 * Here rather than beside the sets themselves because two modules draw a pill
 * now — `CanvasRenderer` in whole game pixels and `@render/hdPaddle` on the fine
 * grid — and a type owned by one of them would have the other importing the
 * renderer for four strings.
 */
export interface PaddleBandColors {
  body: string;
  cap: string;
  sheen: string;
  shade: string;
}

// The body and its two bevels, per brick, off the roster in
// `@core/config/bricks` — one row per brick, exactly as the capsule bodies come
// off theirs. The damage tones *between* `flat` and `dark` live there as well
// and stay there: this is what a sprite outside the wall needs, and a chunk of
// debris has no hit points to be part-way through.
export const BRICK_COLORS: Record<BrickKind, BrickColorSet> = byBrickId((definition) => ({
  flat: definition.flat,
  light: definition.light,
  dark: definition.dark,
}));

// Capsule bodies and letter tones are authored per capsule in
// `@core/config/powerUps`; both tables are derived so they can never drift out
// of step with the roster. Names and types are unchanged for their consumers.
export const DROP_COLORS: Record<PowerUpKind, string> = byId((definition) => definition.color);

// Light and mid-tone capsule bodies need a dark letter to stay readable; white
// on M's green and B's orange sat under 3:1.
export const DARK_LETTER_DROP_KINDS: ReadonlySet<PowerUpKind> = new Set(
  POWER_UPS.filter((definition) => definition.dark).map((definition) => definition.id),
);

// Sprite and effect colors. The playfield field tones live per theme in
// `src/render/backgrounds.ts`.
export const canvasPalette = {
  wallLight: "#dbe4ff",
  wallShade: "#8f9ac8",
  paddleBody: "#2d7fe0",
  paddleCap: "#e8384f",
  paddleTopSheen: "#a8d8ff",
  paddleBottomShade: "#0b3a78",
  // CHAIN paying at x4 or better: the deck's top sheen, in gold. The same
  // yellow the panel's xN turns on the same step, and the same one the cannons
  // and the shots are painted in — the deck is not wearing a new colour, it is
  // wearing the one this machine already uses for "this is worth something".
  chainSheen: "#ffcf1c",
  /**
   * THE OBSERVER's eye (SHA-169). Four tones, and only four: the sclera is
   * `wallLight`, the bronze rim and the gold lash are the gold brick's own dark
   * and flat, and the red iris is the red brick's three — an eye made of the
   * colours this machine is already built from, rather than a palette of its
   * own arriving with it.
   *
   * `eyePupil` is the deepest tone on the field, darker than the field itself:
   * a pupil is a hole, and a hole has to be blacker than what it is cut in.
   */
  eyeScleraShade: "#c7d2f5",
  eyePupil: "#05050f",
  /**
   * THE HD PASS (SHA-216): the shadow a brick drops into its own mortar seam.
   *
   * The same near-black as the pupil, and named separately because it is doing
   * a different job — this one says the wall is *laid*, courses of it standing
   * proud of the dark behind, which is most of what separates a 2026 wall from
   * a 1987 one. It lives in the 3 fine pixels of seam the grid has always left
   * between cells, so it costs the brick nothing.
   */
  brickJoint: "#05050f",
  eyeIrisEdge: "#1d47a8",
  eyeIrisInner: "#63b0ff",
  /**
   * THE LID's emptied socket (SHA-176): the hole the loose pupil left.
   *
   * A red so deep it is nearly the field — darker than the red brick's own
   * shade, which the iris that used to sit here was drawn from — because what
   * the picture has to say is that the socket is *empty*. A brighter red would
   * be an eye with a red iris, and the player has spent the last four veils
   * learning to read exactly that.
   */
  eyeSocket: "#3d0009",
  /**
   * THE DIADEM's stars (SHA-170). Gold, because this is the one thing on a veil
   * that is a *reward* — the house keeps yellow for what pays, and six of these
   * are worth more at a clear than the wall under them.
   *
   * Two tones for a lit star and two for a dark one, and the pair is the whole
   * tell: a star that is only dimmer would read as a star further away, while a
   * dark one drawn as three grey pixels reads as a socket waiting to be filled.
   */
  /**
   * THE IRIS's gaze has the deck (SHA-173): the pill in stone.
   *
   * The body and the sheen are the wall frame's own two greys, so the deck turns
   * into the same rock the chamber is built out of. The caps are the deck's red
   * drained of it rather than a new colour — what happened is that the paddle
   * *stopped being paint* — and the cracks are the darkest blue on the field, so
   * they read as depth rather than as dirt.
   */
  // THE TEAR's tracks (SHA-174): the wet trail down the cheek. Dark enough to
  // read as a stain on the sclera rather than as a second sprite laid on it,
  // and the same blue the drop itself is cut from.
  tearTrack: "#3c50a0",
  stoneCap: "#5a6486",
  stoneCrack: "#1b2244",
  // THE OCULI's plaques (SHA-171): the recess behind the bronze. Darker than the
  // sky they hang in, so a plaque reads as something set into the wall of the
  // chamber rather than as a tile lying on the starfield.
  oculusRecess: "#3b2a0e",
  diademStar: "#ffcf1c",
  diademTwinkle: "#ffe14a",
  diademCore: "#fff9d0",
  diademDark: "#4a4c60",
  diademDarkEdge: "#2b2d40",
  laserCannon: "#ffcf1c",
  // A cannon still coming out of the deck. `laserCannon` and `laserShot` are the
  // same yellow, so a muzzle painted in either while it rises is painted in the
  // colour it is about to be — the charge would be invisible. This is the ball's
  // own highlight tone, and it cools to the yellow above on the frame the gun
  // locks out and fires.
  laserCharge: "#fff9d0",
  ballBody: "#ffe14a",
  ballHighlight: "#fff9d0",
  ballShade: "#c98f0a",
  // The middle of a MULTI or SWARM clone's birth: the one step between the
  // white-hot pip it is drawn as on its first frame and the ball it settles
  // into. Halfway between the two tones above, so the growth reads as one
  // sprite cooling rather than as three sprites.
  ballNewborn: "#ffed8d",
  // HAYWIRE's static, arcing off the ball. Two tones and not one: a single
  // colour flickering on and off reads as a rendering fault, while a hot core
  // with a cooler outer scatter reads as a discharge. Deliberately blue-white
  // and nowhere near the ball's yellow — the arc has to be legible as something
  // happening *to* the sprite, not as the sprite changing colour, which is the
  // one thing the ball is never allowed to do.
  haywireArc: "#dce8ff",
  haywireArcDim: "#5b74e8",
  // ENGLISH's cloth, laid across the deck. Two tones for the same reason the
  // arc above has two: the band is a *sweep*, and a flat colour arriving all
  // at once cannot show which way it is travelling. The dark one is the felt
  // and the light one is the nap at its leading edge, so the cloth reads as
  // being rolled out from the middle of the deck and rolled back in at expiry.
  //
  // Deep enough to sit under the deck's blue rather than on top of it: this is
  // a surface the paddle is wearing, and a band brighter than the sheen above
  // it would read as a second cap.
  englishFelt: "#0a6a30",
  englishFeltNap: "#25b45c",
  // The spin, orbiting the ball it is stored on. Mint rather than the felt's
  // green: these are 1 px specks against the field at whatever the background
  // is, not paint on a deck, and they have to clear the dark themes on their
  // own. Nowhere near the ball's yellow, by the rule the arc above states.
  englishFleck: "#7cffb0",
  laserShot: "#ffcf1c",
  dropLetterLight: "#ffffff",
  dropLetterDark: "#0b0b26",
  dropSheen: "#ffffff",
  dropShade: "#0b0b26",
  energyWall: "#8fd0ff",
  // The two pixels the ball struck, for the three ticks after it did. A white
  // with the bar's own blue still in it rather than `deathFlash`'s flat one:
  // this is the barrier at its brightest, not a thing being destroyed.
  energyWallCore: "#f4fbff",
  popBonus: "#c8ffc8",
  popMalus: "#ff70d0",
  popShadow: "#0b0b26",
  blastFlash: "#ffc27a",
  deathFlash: "#ffffff",
  // PAYDAY's gild is not here: it is the gold brick's own damage ramp, read off
  // the roster by `GILD_RAMP` in `@render/CanvasRenderer`. A brick behind the
  // tide wears gold's sheen for the damage stage it is on, which is what makes
  // the sweep read as the whole wall turning into the gold brick.
  // A brick killed behind the front. As bright as `deathFlash` so a
  // double-points kill lands at least as hard, and unmistakably gold beside it.
  paydayFlash: "#fff0b0",
  nukeFlash: "#ffffff",
  nukeRing: "#eaf7ff",
  // STASIS's own frost aqua, so the release ring is read as that capsule's.
  stasisRing: "#9effd6",
  // TEMPO's pace ghost: the capsule's own near-white, drawn as a 1 px shell of
  // the ball rather than a ball. A filled sprite is the game's most loaded
  // signal, and under a live SWARM twelve of them would be TEMPO saying MULTI's
  // sentence.
  paceGhost: "#f2f4ff",
  // GLUE's resin, a shade up from the capsule's own #b07840 so it reads as wet
  // over both of the deck's top tones — the pale blue sheen in the middle and
  // the red caps at either end.
  glueResin: "#e0a54c",
  // XRAY's scan bar and the trail behind it. White-cyan rather than the
  // capsule's own acid green, which is a brick colour six capsules already
  // wear: a reading line has to be the one thing on the wall that is plainly
  // not part of it. The dimmer tone sits on the side the bar has come from, so
  // a still frame says which way the scan is running.
  xrayScan: "#e6fffa",
  xrayScanTrail: "#5fbfae",
  // HOMING's signal green, on the four corners of the brick a ball has locked.
  homingMark: "#00e05a",
  // MIRROR's ghost: the paddle's own tones taken down far enough to read as a
  // reflection rather than a second paddle. It reuses `paddleBottomShade` for
  // its shade, which is already dark enough to pass for one.
  mirrorBody: "#1e5796",
  mirrorCap: "#93273a",
  mirrorSheen: "#5f8fc4",
  // The last step of MIRROR's after-image, under its own body tone: still a
  // reflection's blue, but only just — the line has to be gone before the player
  // can wonder whether the ghost is still a surface.
  mirrorFade: "#123258",
  // RUSH's streak: the ball smeared along the path it covered this tick. Amber
  // into the capsule's own crimson, so the trail says both "moving" and "this
  // is the red thing you caught" — a plain grey blur said neither.
  rushTrailNear: "#ff8a1c",
  rushTrailFar: "#e1001b",
  // TURBO's streak, the same smear run cold: the capsule's own electric cyan at
  // the far end into a near-white at the ball. RUSH's is amber into crimson,
  // and the two capsules do the same thing for opposite reasons — the
  // temperature of the comet is what says which one is in hand.
  turboTrailNear: "#d6ffff",
  turboTrailFar: "#00b8d4",
  // CHAIN's arc: the capsule's mint under a white core, so a bolt reads as hot
  // on every field the game paints.
  chainBolt: "#3dff8e",
  chainCore: "#ffffff",
  // MAGNET's tether, the capsule's own seafoam: the pull is silent, so this
  // dashed line is the only thing telling the player it is happening.
  magnetTether: "#6fd0b4",
  // SINGULARITY: a hole darker than any field theme, ringed by a breathing halo
  // in the capsule's violet and an outer rim that fixes its true reach.
  singularityCore: "#05030d",
  singularityHalo: "#c9a7ff",
  singularityRim: "#6d3bd6",
  // PORTAL: three bands scrolling up the wall, bright to nearly black, so a
  // mouth reads as a moving opening rather than a coloured strip.
  portalBright: "#00b3fa",
  portalMid: "#0a6ea8",
  portalDark: "#08324f",
  // GHOST: all that is left of a brick while the wall is intangible. One white
  // outline and the playfield theme showing through where the body was.
  ghostBrick: "#f2f4ff",
  // BUMPERS: the capsule's hot rose, ringed in white so a disc reads against
  // every field theme, with a dark eye that goes white for the kick flash.
  bumperBody: "#ff00aa",
  bumperRim: "#f2f4ff",
  bumperCore: "#0b0b26",
  // CRITTER: the grub's acid lime over a brown belly and feet, and a red jaw at
  // the leading end — the one warm pixel on it, so which way it is walking can
  // be read without waiting to see it move.
  critterBody: "#a3e04a",
  // The rung between the two above: what a grub's lime steps through on its way
  // to its own belly brown as it runs down. Deliberately not a
  // `DEMAKE_GROUND_TONES` member — it is a shade, not a shape, and a dying grub
  // sinking into the background would read worse on the tube than one that
  // keeps its ink and blinks.
  critterSpent: "#969d3a",
  critterUnder: "#8a5a2a",
  critterJaw: "#e8384f",
  critterEye: "#0b0b26",
  // BANANA: the peel on the rail, in the capsule's own body over the gold
  // brick's shade — what is lying there reads as what was caught, which is the
  // only warning the player gets before stepping on it.
  peelBody: "#e2fe74",
  peelShade: "#8a6a00",
  /**
   * TIDE: the sea, in four tones and one of them not a colour at all.
   *
   * `tideBody` is the wash laid over everything below the surface, and it is the
   * capsule's own body taken right down — the pill and the water it pours are
   * one colour, the way GRAVEL's cracks are drawn in GRAVEL's green. It is the
   * only tone on this list painted under a `globalAlpha`, and that is the point:
   * a sea has to be something you see *through*, or the bottom third of the
   * field becomes a green rectangle with the ball inside it.
   *
   * `tideCrest` is the one opaque pixel row at the surface, so the sea has an
   * edge whatever it is lying over, and `tideFoam` is what breaks along it —
   * near-white, because foam is the one part of water that is not the colour of
   * the water.
   *
   * `tidePlug` is the hole it goes down, and it is the darkest thing the field
   * carries short of a black hole: what says *drain* rather than *ebb* is that
   * the water is visibly going somewhere.
   */
  tideBody: "#0b5f47",
  tideCrest: "#3ddba6",
  tideFoam: "#d6fff0",
  tidePlug: "#04231b",
  /**
   * UMBRA: the shadows, the sun that throws them, and the band that runs back
   * up a struck one.
   *
   * `umbraCast` is the one tone on this list that is not a colour decision.
   * Flat `#000000`, opaque, over the field art — a shadow is the absence of the
   * light the field is lit by, and every other answer is worse in a way the
   * player can feel: a dark blue reads as a pane of glass, and an alpha wash
   * reads as weather. What makes it a *surface* rather than a tint is that the
   * field behind it is gone. It is also the reason this capsule and BLACKOUT
   * retire each other — black on black is an invisible collider.
   *
   * `umbraSun` and `umbraRim` are the light: a hot mark sliding along the top
   * frame for the whole twenty seconds, and the wash that lights the left frame
   * top to bottom while it comes up. Pale rather than saturated, because what
   * is on the frame is a light source and not a gold pill — the capsule's own
   * body is the low sun and this is the sun itself.
   *
   * `umbraSurge` is what a hit sends home: near-white, because it travels up a
   * black wedge and has nothing else to be read against, and it is the one part
   * of this capsule that is drawn brighter than anything around it on purpose.
   */
  umbraCast: "#000000",
  /**
   * And the one pixel of it that is not black: the lit field showing along the
   * shadow's own silhouette.
   *
   * **A flat black shadow is invisible on half the playfield themes.** The rule
   * the backgrounds are held to is that their `area` tones stay dark — `circuit`
   * is `#05130d`, `cathode` `#14100a`, `vault` `#0e0e13` — so black on black is
   * not a corner case here, it is four of the eight rooms the game ships. The
   * wedge was legible on `starfield` and gone on the rest, which is the
   * invisible collider this capsule retires BLACKOUT to avoid, arriving from the
   * one direction nobody was watching: not another capsule, the room.
   *
   * So one pixel of this runs down inside the wedge's right flank and the fill
   * stays flat black — a liseré rather than a lighter body, because what has to
   * be read is the *shape*, and a grey wedge would be a pane of glass.
   *
   * **Grey and not white**, at 5.0:1 against the shadow it sits in against a
   * white's 16.7 — a shadow is the darkest thing the field carries short of a
   * black hole, and a line at full value beside it stops reading as a shadow's
   * own edge and starts reading as a wire laid over one. It still clears 4.5:1
   * against the darkest playfield theme, which is inside the 3:1 rule the
   * backgrounds are held to rather than sitting on its floor.
   *
   * Cool and neutral, so it is never mistaken for the band a hit sends home:
   * that one is `umbraSurge`, it is warm, near-white, and it fills the wedge's
   * whole width instead of tracing it.
   */
  umbraEdge: "#767c88",
  umbraSun: "#ffeaa0",
  umbraRim: "#c9a13c",
  umbraSurge: "#fff6d8",
  // And the caster's own answer, one step down from the surge: the brick
  // flashes as the band arrives, in the same warm white the band is drawn in so
  // the two read as one thing travelling and landing rather than two events.
  umbraFlash: "#ffe9a8",
  /**
   * SUPERPOSE's echo: the 1 px edge drawn round a brick's double.
   *
   * The body of the echo is the brick's own flat tone at half alpha — a double
   * exposure of the wall has to be made of the wall — which leaves it with no
   * outline of its own on a busy field, and SHA-137 is the ticket that says
   * what happens then. So the edge is the capsule's own violet taken up rather
   * than a brick tone taken down: it is the one pixel in the picture that
   * belongs to SUPERPOSE and not to the brick, and it reads on a brick face,
   * on bare field and against every theme.
   */
  superposeEdge: "#f0b8f8",
  /**
   * COLLAPSE's fog: the grain that eats a decohered brick's edge.
   *
   * Pale and cool where the pill is a saturated electric blue, and the row
   * comment in the registry says why the two cannot match — there is no pale
   * blue body left on the board. What the field needs is the one thing the pill
   * could not be: fog reads as *pale*, and a brick dissolving into a dark blue
   * would read as a brick being shaded rather than one going out of focus.
   *
   * It is drawn as scattered pixels rather than an outline on purpose. SUPERPOSE
   * has the clean edge on this board; an edge here would say the same thing
   * about two capsules that mean opposite things — one puts a second solid
   * rectangle on the field, and this one takes the rectangle away.
   */
  collapseGrain: "#9fb4d8",
  /**
   * TWIN: the thread between two paired bricks, and the flash that runs down it
   * when the pair is spent.
   *
   * `twinThread` is the capsule's own coral taken one step down, which is the
   * rule this board has used since SNAP's lattice: what a capsule draws on the
   * field is drawn in the colour of the pill that put it there. One step and
   * not SNAP's several — that one is graph paper the ball is read *against* and
   * has to lose, while this is the held cue and has to be findable from across
   * the field for eighteen seconds. It clears 6.85:1 on the darkest playfield theme
   * and still sits well under the pill, so a thread never competes with the
   * capsule falling.
   *
   * `twinFlash` is the hot end, and it is near-white rather than a brighter
   * coral for PIERCE's reason: a discharge is hot, not branded. It is also the
   * one tone here the player has a fraction of a second to read, and the
   * thread it is running along is still drawn underneath it.
   */
  twinThread: "#e89a78",
  twinFlash: "#ffe2d4",
  /**
   * LEAP: the pip that says where the next jump lands, and the flash at each
   * end of one.
   *
   * `leapPip` is the capsule's magenta taken *up* rather than down, which is
   * where it parts company with `twinThread` one entry above. A thread is
   * hundreds of pixels of line and can afford to sit under the sprites; a pip
   * is a diamond four pixels across hanging in open field, and SHA-137 is the
   * ticket about what happens to a small faint thing on a dark theme — UMBRA
   * shipped a half-transparent wedge with no edge and nobody could find it. It
   * clears 6.10:1 on the darkest playfield theme, which is `twinThread`'s
   * bracket, and it is drawn at an alpha that falls with the capsule's reach so
   * "faint" is a thing it *becomes* rather than a thing it starts as.
   *
   * `leapFlash` is the hot end, near-white with the magenta still in it, and it
   * is near-white for PIERCE's reason and `twinFlash`'s: a discharge is hot, not
   * branded. It is on screen for seven ticks at each end of a jump and has to be
   * caught out of the corner of an eye that is following the ball.
   */
  leapPip: "#f078d0",
  leapFlash: "#ffd8f4",
  // JAMMER: the rail the deck has just been shut off, dying through four steps
  // of the capsule's own magenta. Authored rather than alpha-blended, because
  // everything else on this field fades in whole pixels of a named tone and a
  // `globalAlpha` mark would be the one thing on screen that does not.
  railMarkHot: "#d13be8",
  railMarkMid: "#a02fb3",
  railMarkLow: "#6f217d",
  railMarkFaint: "#3e1347",
  // METEOR: a white-hot core under the capsule's own ember, the flame drawn on
  // the trailing side so a rock reads as falling even in a still frame.
  meteorCore: "#ffe8b0",
  meteorFlame: "#c84b19",
  // SNAP's lattice, and the mark a snapped bounce leaves on it. The grid is the
  // capsule's own acid green taken right down to a tone that sits under every
  // sprite on the field — it is graph paper, and paper the player has to read
  // the ball against may not compete with the ball. The mark is the same green
  // most of the way back up, because the bracket has to be legible for the
  // twelve ticks it exists and is drawn over the field rather than under it.
  snapGrid: "#20461a",
  snapMark: "#9cff7a",
  // TRACER's thread and the pip it pins on the rail. **Not the capsule's olive**,
  // which is the one obvious choice and the wrong one: the pill is the round and
  // the thread is the burn, so it is drawn off the ball's own yellow the way
  // PIERCE throws white sparks from a yellow body. A burn is hot, not branded.
  //
  // The thread is taken below the ball (`ballBody` is #ffe14a) because it is a
  // line the player reads *past* while watching the ball — bright enough to
  // follow across the field, never bright enough to win against the thing it is
  // pointing at. The pip is the hot end: it is a single mark on the rail and the
  // one pixel of this capsule the player actually acts on.
  tracerThread: "#c9a22e",
  tracerPip: "#fff3b0",
  // The same thread with the tension gone, for a ball still on its way up. Kept
  // dark enough to read as slack rope rather than as a live guide: the shape
  // says which one it is, and the tone only has to agree with the shape.
  tracerSlack: "#7a6320",
  // ERODE: the mortar coming out of the seams, in two tones for granite's
  // reason — one colour trickling on its own reads as a rendering fault, and a
  // fall that brackets its own value reads as grit. Both are the capsule's own
  // khaki, one taken down and one taken up, and both are kept well under a
  // brick: the dust falls *between* the bricks over whatever theme the field is
  // wearing, and grains as bright as the wall would turn the lattice into noise
  // at exactly the moment the player is looking for a lane through it.
  erodeGrain: "#8c8869",
  erodeDust: "#c4c0a0",
  /**
   * GRAVEL: the fractures on the wall, and the chips that come off it.
   *
   * The crack is a **near-black** rather than a dark version of the capsule's
   * own stone, and that is the one tone here that had to be measured against
   * the bricks instead of against the roster: a fracture is drawn on top of six
   * different brick bodies, and anything carrying a hue of its own would read
   * as a crack on four of them and as a smudge on the other two. A shadow reads
   * on everything, which is what a crack in a face actually is.
   *
   * The chip is the pill's own body with the pale on one corner and the crack's
   * own near-black on the corner across from it, and the pair walks the square
   * on `tumbleTicks`. A lit corner on its own would only blink; a lit corner
   * with a shadow opposite is a solid thing catching the light from a new side,
   * which is the whole of the tumble and the reason there are three tones on
   * the block rather than one.
   *
   * The dust is the pale taken further up, because it is 1 px and lives nine
   * ticks over a brick face that is already mid-value: the grit either arrives
   * brighter than the stone it comes off or it is not there at all.
   */
  gravelCrack: "#26261f",
  gravelChip: "#8a8c78",
  gravelChipLit: "#c4c6ae",
  gravelDust: "#d8dac0",
  /**
   * PYRE: the fire on the balls, the ember over the deck, and the crater.
   *
   * The crown is drawn **cooling upward**, which is the one thing that made it
   * legible: a flame is hottest at its base, and the base here is the ball's own
   * yellow. Painting a pale core over a `#ffe14a` sprite would have been a
   * crown nobody could see, so the ball is the hot part and the licks above it
   * run from the pill's orange to a deep red as they leave — physically right
   * and, more to the point, the two tones on the field furthest from the thing
   * they sit on.
   *
   * The smoke is the only grey in the palette, and deliberately warm and light
   * rather than a true one: it is a wisp of 1 px specks against playfields that
   * are all under 0.02 luminance, and anything darker would be a crown going
   * out into nothing at all.
   *
   * The wash over the deck is deep enough to sit *under* the deck's blue rather
   * than on it, by ENGLISH's rule for exactly the same reason — this is a
   * surface the paddle is wearing, and a band brighter than the sheen above it
   * would read as a second cap. The leading edge is the only bright one, and it
   * is bright because it is travelling: it is the front of the fire, and it is
   * on screen for twenty-four ticks at either end and never in between.
   */
  pyreFlame: "#ff8a4a",
  pyreFlameTip: "#e0350c",
  pyreSmoke: "#8a8290",
  pyreWash: "#c2401c",
  pyreWashHot: "#ff9a3c",
  // The crater. The fireball is a shade hotter than anything the crown wears —
  // it is the ball itself going up, not a flame standing on one — and the ring
  // is the pill's own body, so the reach the player is being shown is drawn in
  // the colour of the capsule that gave it to them. The white the first three
  // frames flash is `deathFlash`, shared with every other kill on the field: a
  // brick dying under a fireball may not flash a different white from a brick
  // dying under a ball.
  pyreFireball: "#ffb43c",
  pyreRing: "#ff744a",
  // DEMAKE: the two tones the whole machine collapses onto for 8 seconds. Ink
  // is a P1 phosphor at the brightness a sprite has to hold against the ground,
  // which is the tube's black with just enough green in it to read as glass
  // rather than as a hole in the screen.
  demakeInk: "#6cf08a",
  demakeGround: "#07160c",
  // THE TITLE (SHA-211): the mockup's home sky — near-black, and three star
  // tones from dim to bright.
  titleBase: "#05050f",
  titleStarDim: "#1b2244",
  titleStarMid: "#333f78",
  titleStarBright: "#6c7cb4",
  // BLACKOUT: the dark the field goes under for 5 seconds. Near-black with just
  // enough blue left in it to read as the lights going out rather than as a
  // hole cut in the canvas — and it is never seen flat, since the pools around
  // the balls and the deck are punched straight out of it. While DEMAKE holds
  // the machine the tube's own ground stands in for it: a green screen going
  // dark stays green.
  blackoutVeil: "#05050c",
} as const;

/**
 * THE HD PASS (SHA-220): the arena frame, as nine tones from its outer edge
 * inward — one fine pixel each across the three game pixels the rail has always
 * been.
 *
 * Claude Design's ramp, and **authored rather than derived**: three of the nine
 * are tones this game already has and two more are exact `mix()` of them, but
 * `#6f7aa8`, `#b4bee6`, `#a0aad6` and `#5c6690` are none of that — they are an
 * artist's reading of light falling across a bevelled rail, and approximating
 * them with a blend would be redrawing the thing the owner picked the bundle
 * for. The pass's rule is that no hex is written *inside a recipe*; an authored
 * ramp belongs here, beside the brick ramps, which is what "the palette is the
 * single source of truth" means.
 *
 * Read outward-in: a dark contour, a blown highlight, the wall's own light held
 * for two pixels, then four steps down to the dark lip the field sits behind.
 */
export const FRAME_RAILS: readonly string[] = [
  "#6f7aa8",
  "#eef2ff",
  canvasPalette.wallLight,
  canvasPalette.wallLight,
  "#c9d2f2",
  "#b4bee6",
  "#a0aad6",
  canvasPalette.wallShade,
  "#5c6690",
];

/**
 * A rivet in the rail: three fine pixels square, lit from the upper left.
 *
 * Its body is the rail's own innermost tone and its shadow is the wall's shade,
 * so a rivet is made of the thing it is driven into. Only the catch of light on
 * its head is new, and that is the highlight rail taken the rest of the way to
 * white.
 */
export const FRAME_RIVET = {
  body: FRAME_RAILS[8],
  light: "#f4f7ff",
  dark: canvasPalette.wallShade,
} as const;

/**
 * A chunk of debris, by what it broke off.
 *
 * The bricks bring their own three tones; the deck's are its bands, minus the
 * shade — `flat` is the body, `light` the sheen along its top, and `dark` the
 * red of its caps, which is not dark at all but is the third colour the pill is
 * actually made of. A tear that sprayed only blue would be spraying a rectangle
 * rather than the deck.
 *
 * This is the whole of what widening `ParticleField.burst` past bricks costs:
 * one row here, and the simulation still names a material rather than a colour.
 */
/**
 * WORMHOLE (SHA-165): the throat, the rim in the pill's own aqua, and the rim's
 * lit pixels. The throat is darker than any field theme, so a mouth is a hole
 * in the picture on every background.
 */
export const WORMHOLE_TONES = {
  throat: "#020409",
  rim: "#4effc9",
  rimLight: "#d6fff2",
} as const;

/**
 * KLAXON (SHA-143): the bulb in the capsule's own mint with a dark rib for each
 * honk left, the brass bell it blows through, and the front's two strokes.
 */
export const KLAXON_TONES = {
  bulb: "#00d989",
  bulbLight: "#8dffd0",
  rib: "#006b44",
  brass: "#c99a3a",
  brassLight: "#ffe08a",
  front: "#b8ffe2",
  frontEdge: "#00ff9b",
} as const;

/**
 * MOULD (SHA-142): the fur on the seams, dark olive over a lighter olive tip;
 * the grey it dries to on the way out; and the speckle a grown brick wears for
 * the rest of the level. The pill is a leaf green and this is that green taken
 * well down — the mould's own colour, and far from SNAP's acid lattice.
 */
export const MOULD_TONES = {
  fur: "#5f7d22",
  tip: "#a2c64e",
  bud: "#3c5218",
  dry: "#8a8b7a",
  speckle: "#2c3f12",
} as const;

/**
 * RIBBON's track (SHA-139): the pill's green taken down a step for the body, the
 * pill itself for the lit edge and a deep moss for the shadow, banded the way a
 * brick is so a block reads as a solid thing and not a smear of trail.
 */
export const RIBBON_TONES: BrickColorSet = {
  flat: "#3f9a4a",
  light: "#73cd73",
  dark: "#1d5226",
};

export const CHUNK_COLORS: Record<ChunkMaterial, BrickColorSet> = {
  ...BRICK_COLORS,
  ribbon: RIBBON_TONES,
  wormhole: { flat: WORMHOLE_TONES.rim, light: WORMHOLE_TONES.rimLight, dark: "#1a7a5e" },
  deck: {
    flat: canvasPalette.paddleBody,
    light: canvasPalette.paddleTopSheen,
    dark: canvasPalette.paddleCap,
  },
};

/**
 * The sprite tones DEMAKE paints as ground; everything else becomes ink.
 *
 * The rule is the **shadow role**, not a brightness: 1-bit art is edges, and
 * the game's edges are the 1px bevels every sprite is banded with. Flattening
 * those to one tone would turn the field into green slabs — the bricks would
 * lose their grid, the paddle its ends, the wall its depth.
 *
 * Which is also why the list is longer than the bevels: a hole that goes ink is
 * a disc, and three portal bands that all go ink stop scrolling. A tone earns a
 * place here when going ink would cost a *shape*, not merely a shade.
 *
 * Deduplicated by value, so `paddleBottomShade` (the blue brick's own dark),
 * `peelShade` (the gold brick's), and `popShadow`/`bumperCore`/`critterEye`
 * (all `dropShade`) are already covered by the entries below.
 */
export const DEMAKE_GROUND_TONES: ReadonlySet<string> = new Set([
  ...Object.values(BRICK_COLORS).map((set) => set.dark),
  // Granite's pits, by the same rule: what says a stone brick is two hits from
  // gone is the holes in it, and a slab of ink with the holes filled back in is
  // an intact brick.
  ...Object.values(BRICK_BY_ID).flatMap((definition) => (definition.grain ? [definition.grain.pit] : [])),
  canvasPalette.wallShade,
  canvasPalette.ballShade,
  canvasPalette.dropShade,
  canvasPalette.singularityCore,
  canvasPalette.portalDark,
  // RIBBON's shadow edge, so a block keeps its square under DEMAKE rather than
  // welding into the next one.
  RIBBON_TONES.dark,
  // The rail's dark contour and the dark lip the field sits behind (SHA-223).
  // Authored tones rather than blends, so nothing can infer their role: they
  // are the two ends of the frame's ramp, and they are the frame's *edges* —
  // ink there and the arena has no outline against the page and no lip under
  // the wall, which is a bright bar where a machined rail was. The four steps
  // between them stay ink, because those are the light falling across it.
  FRAME_RAILS[0],
  FRAME_RAILS[8],
  // The mortar seam's shadow, which the HD wall paints and the classic one
  // leaves as bare field (SHA-223). Ink there would weld sixty bricks into one
  // sheet and take the wall's grid with it — the exact cost the rule above is
  // written to avoid. `titleBase` shares its value and is covered with it.
  canvasPalette.brickJoint,
  // Black, which is not a sprite tone and is not drawn anywhere on the classic
  // path — `umbraCast` is the only `#000000` in the roster and DEMAKE replaces
  // it with a halftone before it reaches the filter. It is here for the HD
  // recipes, which reach for it as the end of a blend whenever they want a
  // contour: the ball's, the deck's, the capsule's and the brick's outermost
  // pixel are all `mix(<shade>, "#000000", …)`. Pure black is the shadow role
  // by definition, and saying so once is what lets those four silhouettes
  // resolve to ground without a word in any of the recipes.
  "#000000",
]);

/**
 * One colour, on the tube — the whole of DEMAKE's palette, for any tone the art
 * can produce.
 *
 * The rule is `DEMAKE_GROUND_TONES`' rule and has not changed: the tones that
 * carry a *shape* go to ground and everything else to ink. What is new
 * (SHA-223) is that it now answers for the tones the HD recipes derive as well
 * as the ones the roster authored — five per material where three were written
 * down, none of them in any set.
 *
 * **A derived tone takes the role of the tone it came out nearest**, which
 * `@render/pix` records as the blend is made. So the brick's `d3` — its body's
 * dark pulled 40% toward black — is ground because the dark it came off is,
 * while `d1`, the same dark blended 45% of the way *into* the body, is ink
 * because the body is. One is the brick's outline and the other is the shaded
 * half of its face, and no recipe had to say so.
 *
 * The walk is a loop rather than one step because a derived tone is routinely
 * derived from a derived tone: the brick's specular is `mix(sheen, white, 0.5)`
 * on a sheen that THE WRATH may already have mixed toward the death flash.
 *
 * The alternative the ticket floated was a luma threshold. It is the right tool
 * one layer down — `@render/backgrounds` thresholds the *painted field* at 22,
 * because those tones were authored dark by the `check:backgrounds` rules and
 * a whole theme is one material. It is the wrong tool here: sprite tones run
 * the full range, so any single number turns the dark bricks to ground and the
 * light ones to a slab, which is the flattening this filter exists to avoid.
 */
export function demakeTone(color: string): string {
  let tone: string | undefined = color;
  // Capped rather than walked to the end. The chain is three deep at the worst
  // the roster can build, and `mix` never records a tone as its own parent —
  // but two blends *can* land on each other's inputs, and an unbounded walk
  // over a map the art writes into is a render loop that can hang on a colour.
  for (let step = 0; step < 8 && tone !== undefined; step++) {
    if (DEMAKE_GROUND_TONES.has(tone)) {
      return canvasPalette.demakeGround;
    }
    tone = parentTone(tone);
  }
  return canvasPalette.demakeInk;
}
