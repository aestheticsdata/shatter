// THE CHAMBER's roster (SHA-179): one row per particle, and what the game knows
// about each one that is not a number. The numbers — sizes, speeds, points,
// lives, the depth a species joins the bag at — are knobs, and live under
// `gameConfig.particles` beside the gates and the clock.
//
// Adding a species is a row here, a block there and its verb in `Chamber`: the
// bag and the bestiary walk this list, so a row is how a species is let out.

import { PARTICLE } from "@interfaces/particles";

import type { ParticleKind } from "@interfaces/particles";

export interface ParticleDefinition {
  id: ParticleKind;
  // Capitals, one word, the house voice.
  name: string;
  // What it does to a ball, in one word: the four verbs of the premise.
  verb: string;
  // Its page in the BESTIARY (SHA-185), in the book's voice and to the book's
  // measure — `checkBestiaryText` holds both to the column in pixels.
  lore: string;
  tip: string;
  // The page's three facts after where it is met: how many hits, what the ball
  // does on contact, and what it pays.
  hits: string;
  ball: string;
  worth: string;
}

export const PARTICLES: readonly ParticleDefinition[] = [
  {
    id: PARTICLE.PHOTON,
    name: "PHOTON",
    verb: "SCATTER",
    lore:
      "A SPECK OF LIGHT LET IN THROUGH THE SIDE GATES, AND THE ONLY THING IN THE ROOM THAT NEVER CURVES. " +
      "IT CROSSES THE FIELD ON A DEAD-STRAIGHT LINE, GLANCING OFF WALL, BRICK AND DECK WITHOUT HARMING ANY OF THEM. " +
      "MEET IT WITH THE BALL AND THE LIGHT GOES INTO IT — AND THE BALL LEAVES BENT TOWARD WHERE THE PHOTON WAS GOING. " +
      "LEFT ALONE, IT DIMS AWAY IN TWENTY SECONDS.",
    tip: "READ ITS LINE BEFORE YOUR BALL CROSSES IT",
    hits: "1",
    ball: "BENT TOWARD ITS PATH",
    worth: "50",
  },
  {
    id: PARTICLE.ELECTRON,
    name: "ELECTRON",
    verb: "SHIELD",
    lore:
      "A COLD LITTLE SPARK THAT FLIES STRAIGHT TO THE HEAVIEST BRICK IN THE WALL AND CIRCLES IT, " +
      "ITS DOTTED ORBIT DRAWN ROUND THE STONE LIKE A WARD. WHILE IT TURNS, IT TAKES THE BLOW MEANT FOR ITS BRICK — " +
      "BUT ONLY ON ITS OWN SIDE OF THE CIRCLE. BREAK THE BRICK OUT FROM UNDER IT AND IT FLIES OFF AS PLAIN LIGHT.",
    tip: "WAIT FOR IT TO SWING TO THE FAR SIDE",
    hits: "1",
    ball: "BOUNCES OFF IT",
    worth: "150",
  },
  {
    id: PARTICLE.NUCLEUS,
    name: "NUCLEUS",
    verb: "SPLIT",
    lore:
      "A LUMP OF PACKED MATTER THAT DRIFTS THROUGH THE BAND AS SLOW AS A THOUGHT. " +
      "ONE HIT SPLITS IT IN TWO, AND SOMETHING ELSE GOES ON THROUGH THE BREAK: A NEUTRON, WHICH IS TO SAY A WHOLE NEW BALL. " +
      "THE TWO HALVES FLY APART AND DIE ON THEIR NEXT HIT. THE ONE THING IN THE CHAMBER THAT PAYS YOU IN BALLS.",
    tip: "SPLIT IT EARLY · CATCH WHAT COMES OUT",
    hits: "1 · THEN 1 EACH HALF",
    ball: "BOUNCES · A NEW BALL GOES ON",
    worth: "100 · 200 EACH HALF",
  },
  {
    id: PARTICLE.ANTIBALL,
    name: "ANTIBALL",
    verb: "ANNIHILATE",
    lore:
      "THE BALL'S DARK TWIN, WEARING ITS SHAPE IN THE COLOURS OF NIGHT, WITH A PALE HALO BREATHING ROUND IT " +
      "SO IT IS NEVER TRULY HIDDEN. IT CANNOT BE HIT. TOUCH IT AND BOTH ARE ERASED IN A FLASH THAT BLOWS A CRATER " +
      "IN THE WALL. A SPARE BALL IS A FAIR TRADE; YOUR LAST ONE IS A LIFE. A LASER BOLT ERASES IT FOR NOTHING.",
    tip: "LASER IT · NEVER FEED IT YOUR LAST BALL",
    hits: "NONE · IT CANNOT BE HIT",
    ball: "ERASED WITH IT",
    worth: "500 · AND A CRATER",
  },
];

export const PARTICLE_BY_ID = Object.fromEntries(PARTICLES.map((row) => [row.id, row])) as Record<
  ParticleKind,
  ParticleDefinition
>;

/**
 * The tones each species is drawn in.
 *
 * **None of them is yellow.** The ball is the one yellow thing on the field and
 * nothing that moves beside it may be mistaken for it — the premise's first
 * readability rule, and the reason the photon is the energy wall's white-cyan
 * rather than a star's gold.
 */
export const PARTICLE_TONES = {
  photon: {
    // The energy wall's core and its glow: the one light on the field that is
    // not the ball's, which is what a photon is.
    core: "#f4fbff",
    trail: "#8fd0ff",
  },
  electron: {
    // The deck's sheen: a light, cold thing that belongs to the machine's side
    // of the field rather than to the wall's.
    body: "#a8d8ff",
    // The arc's dim blue, so the orbit is seen from across the field without
    // being mistaken for anything that can be hit.
    ring: "#5b74e8",
  },
  nucleus: {
    // Warm and heavy, a fired-clay red nowhere near the ball's yellow: the one
    // particle that is worth chasing should never be mistaken for the thing
    // doing the chasing.
    body: "#b84a2a",
    shade: "#5a1f0e",
    highlight: "#ffb08a",
  },
  antiball: {
    // The ball's own three roles, turned to night: a navy body, a cold
    // highlight and a near-black shade. The one thing on the field drawn with
    // the ball's sprite, which is the point — and the one thing never yellow.
    body: "#1d1d4a",
    highlight: "#b8c8ff",
    shade: "#0b0b26",
    // The halo in the death flash's white, and TWIN's thread for the warning.
    halo: "#ffffff",
    thread: "#ffbda5",
  },
} as const;

/**
 * NUCLEUS and its daughters as character grids: nucleons packed into a lump,
 * lit from the upper left.
 *
 * **A cluster, never a disc.** A ten-pixel sphere in two warm tones would be a
 * red ball, and a red ball is the one thing a particle may not look like; the
 * lumpy outline is what says *matter* at a glance and survives the tube, where
 * the shade goes to ground and the nucleons stand out of it. `h` highlight,
 * `b` body, `s` shade, `.` nothing.
 */
export const NUCLEUS_BITMAPS = {
  nucleus: [
    "....hb....",
    "...hbbs...",
    ".hbbbsshb.",
    "hbbssshbbs",
    "bbshbbsbss",
    ".ssbbssss.",
    ".hbbssbbs.",
    ".bbhbbsss.",
    "..sbbsss..",
    "....ss....",
  ],
  daughter: ["...hb.", "..hbbs", ".hbhbs", "hbhbbs", "bbbbss", ".ssss."],
} as const;
