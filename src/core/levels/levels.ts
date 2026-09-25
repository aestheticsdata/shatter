import { isBrickKind } from "@core/config/bricks";
import { gameConfig } from "@core/config/GameConfig";
import { wordRows } from "@core/levels/wordFont";
import { CREATURE } from "@interfaces/creatures";
import { EYE_ACT, EYE_LAYER } from "@interfaces/eye";

import type { LevelDefinition, SeededDrop } from "@interfaces/types";

// `background` picks the playfield theme (see `src/render/backgrounds.ts`).
// Two rules when adding or reordering levels: never repeat a theme on adjacent
// levels — including across the wrap, since the run loops back to level 1 —
// and prefer a theme that suits the layout (SUNRISE over a horizon, MAZE on
// blueprint grid). `pnpm run check:backgrounds` verifies the adjacency rule.
export const LEVELS: readonly LevelDefinition[] = [
  {
    name: "SUNRISE",
    background: "horizon",
    rows: ["111111111111", "222222222222", "333333333333", "444444444444", "555555555555"],
    // The sun: enormous, behind the wall at a fifth, half under the horizon —
    // the theme's ground and dunes are painted over it, so it sets behind the
    // hills rather than being cut at the line (y 180).
    // THE RISE (SHA-200): it climbs as the wall comes down — sixty bricks,
    // sixty-six pixels, about a pixel a brick — brightening as it goes, and it
    // stares dead out until six bricks from the end, when it blinks and looks
    // at you.
    eye: {
      x: 186,
      y: 182,
      hw: 150,
      hh: 60,
      opacity: 0.2,
      act: { kind: EYE_ACT.RISE, to: { y: 116, opacity: 1 }, wakeAt: 0.9 },
    },
    // A moth round the sun, a snail along the top of the wall and a spider
    // over it — the three gentlest things in the bestiary, on the first level.
    creatures: [
      { kind: CREATURE.MOTH, x: 110, y: 160 },
      { kind: CREATURE.SNAIL, x: 13, y: 28 },
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
    ],
  },
  {
    name: "SMILEY",
    background: "starfield",
    rows: ["..55....55..", "..55....55..", "............", ".3........3.", "..33....33..", "....3333...."],
    // It lives in the smiley's left eye, one brick at a time, pressed to the
    // pane; when a brick dies it blinks into the next, and the right eye last.
    eye: {
      x: 96,
      y: 50,
      hw: 20,
      hh: 8,
      cells: [
        [2, 0],
        [3, 0],
        [2, 1],
        [3, 1],
        [8, 0],
        [9, 0],
        [8, 1],
        [9, 1],
      ],
    },
    // Two frogs on the eyes' bricks, pinned with their feet on the brick, and a
    // bat asleep under the middle of the smile.
    creatures: [
      { kind: CREATURE.FROG, x: 74, y: 26 },
      { kind: CREATURE.FROG, x: 284, y: 26 },
      { kind: CREATURE.BAT, x: 166, y: 110 },
    ],
  },
  {
    name: "PYRAMID",
    background: "vault",
    rows: [".....55.....", "....5445....", "...433334...", "..32222223..", ".3111111113."],
    // The eye on the dollar: floating in the sky over the apex, faint, where
    // the bill puts it. It brightens as the pyramid comes down.
    // THE RISE without the climb (SHA-200): it stays over the apex, and stares
    // dead out until half the pyramid is gone.
    eye: { x: 186, y: 21, hw: 22, hh: 8, opacity: 0.35, act: { kind: EYE_ACT.RISE, to: { opacity: 1 }, wakeAt: 0.5 } },
    // Two moths round the eye over the apex, and a wisp under the pyramid.
    creatures: [
      { kind: CREATURE.MOTH, x: 110, y: 160 },
      { kind: CREATURE.MOTH, x: 262, y: 200 },
      { kind: CREATURE.WISP, x: 181, y: 151 },
    ],
  },
  {
    name: "CHOMP",
    background: "cathode",
    rows: [".111.....22.", "1111....2222", "111...5.2222", "1111....2222", ".111....2.2."],
    // In the mouth, between the jaws' upper teeth and above the uvula, so it
    // is seen whole through the gap rather than half behind the 5.
    eye: { x: 186, y: 50, hw: 40, hh: 11 },
    // Two spiders at the ceiling over the mouth, and a frog on the lower jaw.
    creatures: [
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
      { kind: CREATURE.SPIDER, x: 250, y: 4 },
      { kind: CREATURE.FROG, x: 74, y: 26 },
    ],
  },
  {
    name: "GATEWAY",
    background: "grid",
    rows: ["SS........SS", "SS4......4SS", "..44....44..", "...333333...", "....2222....", "SS...11...SS"],
    // A sentry peering round the left pillar: half of it behind the silver,
    // half out. THE PATROL (SHA-202): it walks to peer round the right pillar
    // and back, 0.4 px a tick — ten seconds a crossing — and while the ball is
    // through the gate, under the arch between the pillars, it stops and
    // stares.
    eye: {
      x: 66,
      y: 42,
      hw: 30,
      hh: 9,
      act: { kind: EYE_ACT.PATROL, to: { x: 306, y: 42 }, speed: 0.4, hold: { x: 66, y: 98, w: 240, h: 60 } },
    },
    creatures: [
      { kind: CREATURE.MOTH, x: 110, y: 160 },
      { kind: CREATURE.MOTH, x: 262, y: 200 },
      { kind: CREATURE.BAT, x: 166, y: 110 },
    ],
  },
  {
    name: "HEART",
    background: "nebula",
    rows: ["...55..55...", "..55555555..", "..44444444..", "...333333...", "....2222....", ".....11....."],
    // Inside the heart, behind its bricks: revealed as it dies.
    // THE PULSE (SHA-203): it beats — a quarter bigger and back, once a
    // second — so what the player uncovers brick by brick is a heart that is
    // alive.
    eye: { x: 186, y: 74, hw: 44, hh: 16, act: { kind: EYE_ACT.PULSE, scale: 1.25, period: 60 } },
    // HEART is the firefly level (SHA-243): three lamps under the heart, each
    // blinking on its own beat off its own pin. Lit, they are three pretty
    // things worth a brick and a half; catch a BLACKOUT here and they are the
    // only way to see the ball. Pinned in the open band rather than up in the
    // wall, because what a lamp lights has to be where the rally is.
    creatures: [
      { kind: CREATURE.FIREFLY, x: 70, y: 146 },
      { kind: CREATURE.FIREFLY, x: 296, y: 172 },
      { kind: CREATURE.FIREFLY, x: 184, y: 218 },
    ],
  },
  {
    name: "VORTEX",
    background: "planet",
    rows: ["111111111111", "1..........1", "1.SSSSSSSS.1", "1.S......S.1", "1.S.GGGG.S.1", "1.SSSSSSSS.1"],
    // Discreet in a corner: small, at the bottom left just over the rail, at
    // sixty percent — the storm's edge, watching the deck from beside it.
    eye: { x: 26, y: 262, hw: 16, hh: 6, layer: EYE_LAYER.FRONT, opacity: 0.6 },
    // VORTEX is the wisp level (SHA-242): three of them, one set off inside
    // the storm's own hollow and two in the band under it. Where they are
    // pinned is only where they start — a wisp goes where its heading takes
    // it, through the wall and out the other side, and the heading is taken
    // off the pin so these three set off three different ways.
    creatures: [
      { kind: CREATURE.WISP, x: 180, y: 74 },
      { kind: CREATURE.WISP, x: 60, y: 150 },
      { kind: CREATURE.WISP, x: 300, y: 190 },
      { kind: CREATURE.SNAIL, x: 13, y: 28 },
    ],
  },
  {
    name: "BOLT",
    background: "circuit",
    rows: [
      "......555...",
      ".....555....",
      "....555.....",
      "...555555...",
      "....555.....",
      "...55.......",
      "..5.........",
    ],
    // The charge at the tip of the bolt: small, out in front, just past the
    // last brick. Later it runs the bolt's edge, a stair a blink.
    eye: { x: 56, y: 131, hw: 16, hh: 6, layer: EYE_LAYER.FRONT },
    // BOLT is the bat level (SHA-238). Three of them asleep under the bolt's
    // own underside — cells (8,0), (3,3) and (2,6), each a brick with nothing
    // below it — so they hang in the open along the length of the stroke.
    creatures: [
      { kind: CREATURE.BAT, x: 256, y: 50 },
      { kind: CREATURE.BAT, x: 106, y: 86 },
      { kind: CREATURE.BAT, x: 76, y: 122 },
    ],
  },
  {
    name: "CHECKER",
    background: "vault",
    rows: ["1.2.3.4.5.1.", ".2.3.4.5.1.2", "3.4.5.1.2.3.", ".4.5.1.2.3.4", "5.1.2.3.4.5."],
    creatures: [
      { kind: CREATURE.MOTH, x: 110, y: 160 },
      { kind: CREATURE.FROG, x: 194, y: 26 },
      { kind: CREATURE.FIREFLY, x: 177, y: 151 },
    ],
  },
  /**
   * THE VEIL, the first of the Observer's five (SHA-167).
   *
   * Tenth in the loop since EVERY FIVE (SHA-206) — the veils sit on 10, 20,
   * 30, 40 and 43 so a boss ends every fifth level — between CHECKER's vault
   * and INVADER's starfield, so the `observer` theme sits beside neither of
   * its own kind: the wrap rule holds and `check:backgrounds` passes.
   *
   * The wall is built around the socket rather than over it: the two `S..S`
   * gaps in the middle rows are the only way to see what is behind them, so the
   * eye is **found and not shown**. Nothing acts on this veil. It watches, and
   * everything the Observer will later do to the player is met here first
   * against an eye that only blinks.
   */
  {
    name: "THE VEIL",
    background: "observer",
    rows: ["5555GGGG5555", "4444SSSS4444", "33.3S..S3.33", "22.2S..S2.22", "1111SSSS1111", ".GG......GG."],
    observer: {
      mode: "veil",
      eye: { x: 186, y: 72, hw: 42, hh: 15 },
      tint: "blue",
      hint: "IT PEERS THROUGH THE STONE",
      brood: [
        { x: 60, y: 166, form: 0 },
        { x: 200, y: 198, form: 0 },
        { x: 300, y: 226, form: 0 },
      ],
      diadem: [
        [286, 142],
        [247, 178],
        [207, 192],
        [165, 192],
        [125, 178],
        [86, 142],
      ],
    },
  },
  {
    name: "INVADER",
    background: "starfield",
    rows: [
      "...2.....2..",
      "....2...2...",
      "...2222222..",
      "..22.222.22.",
      ".22222222222",
      ".2.2222222.2",
      ".2.2.....2.2",
      "....22.22...",
    ],
    creatures: [
      { kind: CREATURE.FIREFLY, x: 102, y: 152 },
      { kind: CREATURE.FIREFLY, x: 252, y: 232 },
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
    ],
  },
  {
    name: "RAMPART",
    background: "grid",
    rows: ["SS.SS..SS.SS", "444444444444", "..3..33..3..", "222222222222", "1.1..11..1.1"],
    // RAMPART is the beetle level (SHA-239): three of them patrolling the band
    // at three heights, so the lane the ball comes back up is never the same
    // one twice. Well clear of the wall's underside at y 98 and of the deck.
    creatures: [
      { kind: CREATURE.BEETLE, x: 40, y: 130 },
      { kind: CREATURE.BEETLE, x: 180, y: 168 },
      { kind: CREATURE.BEETLE, x: 300, y: 206 },
    ],
  },
  {
    name: "ROCKET",
    background: "planet",
    rows: [
      ".....11.....",
      "....1111....",
      "....1221....",
      "....1221....",
      "....1111....",
      "...511115...",
      "..5.1111.5..",
      "...5.55.5...",
    ],
    // ROCKET is the woodpecker level (SHA-240). Two, not three: they open
    // bricks the player would otherwise have hit, so a flock of them clears
    // the wall and takes the score with it. Pinned in open air under the
    // fins — they pick their own brick on the first tick anyway.
    creatures: [
      { kind: CREATURE.WOODPECKER, x: 96, y: 150 },
      { kind: CREATURE.WOODPECKER, x: 266, y: 150 },
      { kind: CREATURE.MOTH, x: 110, y: 160 },
    ],
  },
  {
    name: "HELIX",
    background: "nebula",
    rows: ["55........55", "..44....44..", "....SSSS....", "....SSSS....", "..22....22..", "11........11"],
    creatures: [
      { kind: CREATURE.VINE, x: 108, y: 128 },
      { kind: CREATURE.VINE, x: 258, y: 208 },
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
    ],
  },
  {
    name: "TETRA",
    background: "cathode",
    rows: ["........5...", "........5...", "............", "11224433.211", "22114433.112", "44332211.421"],
    creatures: [
      { kind: CREATURE.MOTH, x: 110, y: 160 },
      { kind: CREATURE.MOTH, x: 262, y: 200 },
      { kind: CREATURE.SNAIL, x: 8, y: 64 },
    ],
  },
  {
    name: "ORBIT",
    background: "starfield",
    rows: ["....5555....", "..55....55..", ".5..GGGG..5.", ".5..GGGG..5.", "..55....55..", "....5555...."],
    creatures: [
      { kind: CREATURE.FROG, x: 74, y: 38 },
      { kind: CREATURE.FROG, x: 284, y: 38 },
      { kind: CREATURE.WISP, x: 176, y: 163 },
    ],
  },
  {
    name: "COOL",
    background: "circuit",
    rows: wordRows("COOL", ["1", "2", "3", "4"]),
    creatures: [
      { kind: CREATURE.WOODPECKER, x: 101, y: 112 },
      { kind: CREATURE.WOODPECKER, x: 251, y: 128 },
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
    ],
  },
  {
    name: "HIVE",
    background: "vault",
    rows: ["3.3.3.3.3.3.", ".4.4.4.4.4.4", "3.3.3.3.3.3.", ".4.4.4.4.4.4", "S.S.S.S.S.S.", ".G.G.G.G.G.G"],
    creatures: [
      { kind: CREATURE.BEETLE, x: 89, y: 128 },
      { kind: CREATURE.BEETLE, x: 239, y: 208 },
      { kind: CREATURE.FIREFLY, x: 181, y: 163 },
      { kind: CREATURE.FROG, x: 74, y: 26 },
    ],
  },
  {
    name: "DNA",
    background: "nebula",
    rows: [
      ".1GGGGGGGG5.",
      "..1......5..",
      "...1....5...",
      "....1GG5....",
      "...5....1...",
      "..5......1..",
      ".5GGGGGGGG1.",
    ],
    creatures: [
      { kind: CREATURE.VINE, x: 108, y: 140 },
      { kind: CREATURE.VINE, x: 258, y: 220 },
      { kind: CREATURE.MOTH, x: 110, y: 160 },
      { kind: CREATURE.SNAIL, x: 38, y: 28 },
    ],
  },
  /**
   * THE IRIS, the second veil (SHA-167).
   *
   * Where THE VEIL hid the eye behind a wall, this one takes the wall away:
   * the socket is 116 x 38 across the middle of the field with two rows of brow
   * above it and nothing else up there at all, so the first thing the player
   * sees on arriving is the thing that was hiding. The gaps in the two top rows
   * are cut for the oculi behind them, and the bottom two rows are all there is
   * to break — which is the point. The level is not about the wall.
   */
  {
    name: "THE IRIS",
    background: "observer",
    rows: ["GG.GGG.GGG.G", "5S.S5S.S5S.S", "............", "............", "3..........3", "2S........S2"],
    observer: {
      mode: "iris",
      eye: { x: 186, y: 100, hw: 116, hh: 38 },
      tint: "blue",
      hint: "BARE AND HUGE · ITS GAZE PETRIFIES",
      brood: [
        { x: 90, y: 176, form: 0 },
        { x: 250, y: 206, form: 0 },
        { x: 150, y: 232, form: 0 },
      ],
      diadem: [
        [300, 176],
        [250, 198],
        [207, 208],
        [165, 208],
        [122, 198],
        [72, 176],
      ],
    },
  },
  {
    name: "SERPENT",
    background: "horizon",
    rows: ["222222222222", "...........2", "333333333333", "3...........", "444444444444"],
    // SERPENT is the slug level (SHA-246): the snail crawls the top of the
    // wall and its shell-less cousin crawls the rail, the two slow things of
    // the bestiary on one level at opposite ends of the field. One slug and
    // not two — a third of the rail wet is the hazard, two thirds is a level
    // played on ice. The moth stays on from SHA-210's mix.
    creatures: [
      { kind: CREATURE.SNAIL, x: 8, y: 28 },
      { kind: CREATURE.SLUG, x: 300, y: 0 },
      { kind: CREATURE.MOTH, x: 110, y: 160 },
    ],
  },
  {
    name: "SKULL",
    background: "cathode",
    rows: ["..44444444..", ".4444444444.", ".44..44..44.", ".4444..4444.", "..44444444..", "..S4S44S4S.."],
    creatures: [
      { kind: CREATURE.FROG, x: 74, y: 26 },
      { kind: CREATURE.FROG, x: 284, y: 26 },
      { kind: CREATURE.JELLYFISH, x: 101, y: 114 },
      { kind: CREATURE.JELLYFISH, x: 251, y: 130 },
    ],
  },
  {
    name: "MIRROR",
    background: "grid",
    rows: ["111......SSS", "22........SS", "333......SSS", "22........SS", "111......SSS"],
    creatures: [
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
      { kind: CREATURE.SPIDER, x: 250, y: 4 },
      { kind: CREATURE.WISP, x: 167, y: 151 },
    ],
  },
  {
    name: "BUNKER",
    background: "vault",
    rows: ["....GGGG....", "..SSSSSSSS..", ".S........S.", ".S.555555.S.", ".S.555555.S.", ".SSSSSSSSSS."],
    creatures: [
      { kind: CREATURE.BEETLE, x: 94, y: 128 },
      { kind: CREATURE.BEETLE, x: 244, y: 208 },
      { kind: CREATURE.FIREFLY, x: 186, y: 163 },
      { kind: CREATURE.SLUG, x: 300, y: 0 },
    ],
  },
  {
    name: "CASCADE",
    background: "horizon",
    rows: ["GG..........", "11GG........", "..11GG......", "....11GG....", "......11GG..", "........11GG"],
    // CASCADE is the crab level (SHA-244), and it was picked for its wall: a
    // staircase drops capsules across the whole width, which is the one thing
    // a capsule thief needs to be worth pinning. Two crabs on two lines rather
    // than three on one — the upper one takes them early and the lower one is
    // the last thing between a capsule and the deck, and between the two there
    // are still gaps to thread. The moth is kept on as the guaranteed source:
    // hit it and the capsule it was carrying falls straight into the patrol.
    creatures: [
      { kind: CREATURE.MOTH, x: 186, y: 60 },
      { kind: CREATURE.CRAB, x: 50, y: 150 },
      { kind: CREATURE.CRAB, x: 290, y: 210 },
    ],
  },
  {
    name: "PLAY",
    background: "circuit",
    rows: wordRows("PLAY", ["2", "3", "4", "5"]),
    creatures: [
      { kind: CREATURE.WOODPECKER, x: 101, y: 112 },
      { kind: CREATURE.WOODPECKER, x: 251, y: 128 },
      { kind: CREATURE.FROG, x: 74, y: 26 },
    ],
  },
  {
    name: "MAZE",
    background: "grid",
    rows: [
      "SSSSSSSSSSSS",
      "S........S.S",
      "S.SSSSSS.S.S",
      "S.S.GG.S.S.S",
      "S.S.GG.S.S.S",
      "S.S....S...S",
      "SS.SSSSSS.SS",
    ],
    creatures: [
      { kind: CREATURE.SNAIL, x: 8, y: 28 },
      { kind: CREATURE.CRAB, x: 106, y: 140 },
      { kind: CREATURE.CRAB, x: 256, y: 220 },
      { kind: CREATURE.FIREFLY, x: 181, y: 175 },
    ],
  },
  {
    name: "OMEGA",
    background: "planet",
    rows: ["...SSSSSS...", "..S......S..", "..S.2222.S..", "..S......S..", "...S....S...", ".GGG....GGG."],
    // OMEGA is the jellyfish level (SHA-245), and it was picked for its wall:
    // the Ω is a bowl open at the bottom, so two pinned inside it sink out
    // through the mouth between the feet and come back up into it — the
    // descent is in the open, where it can be read and shot. A frog and the
    // spider stay on from SHA-210's mix, above the bowl and out of their way.
    creatures: [
      { kind: CREATURE.JELLYFISH, x: 130, y: 76 },
      { kind: CREATURE.JELLYFISH, x: 232, y: 76 },
      { kind: CREATURE.FROG, x: 194, y: 26 },
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
    ],
  },
  {
    name: "1991",
    background: "cathode",
    rows: wordRows("1991", ["G", "S", "G", "S"]),
    creatures: [
      { kind: CREATURE.MOTH, x: 110, y: 160 },
      { kind: CREATURE.MOTH, x: 262, y: 200 },
      { kind: CREATURE.BAT, x: 196, y: 74 },
    ],
  },
  /**
   * THE TEAR, the third veil (SHA-167).
   *
   * The eye is pushed into the top-left corner and cut by the frame, and the
   * wall is pushed five columns right to leave it a corridor — so the left
   * quarter of the field is nothing but falling water, and the wall is somewhere
   * the player has to go *past* it to reach. Everything about the layout is
   * about that column: the tears fall down it, the eggs they hatch walk out of
   * it, and the ball has to cross it in both directions.
   */
  {
    name: "THE TEAR",
    background: "observer",
    rows: [".....GGGGGGG", ".....4444444", ".....33S3S33", ".....22S2S22", ".....1111111", "......SS..SS"],
    observer: {
      mode: "tear",
      eye: { x: 46, y: 62, hw: 62, hh: 23 },
      tint: "blue",
      hint: "IT WEEPS FROM THE CORNER · BURST THE TEARS",
      brood: [
        { x: 180, y: 196, form: 0 },
        { x: 300, y: 224, form: 0 },
      ],
      diadem: [
        [150, 126],
        [192, 152],
        [232, 172],
        [272, 182],
        [312, 172],
        [346, 142],
      ],
    },
  },
  {
    name: "PILLARS",
    background: "vault",
    rows: [
      "S.S.S.S.S.S.",
      "5.5.5.5.5.5.",
      "4.4.4.4.4.4.",
      "3.3.3.3.3.3.",
      "2.2.2.2.2.2.",
      "1.1.1.1.1.1.",
      "G.G.G.G.G.G.",
    ],
    // PILLARS is the vine level (SHA-241), and the level was already the
    // argument for it: six columns of brick with six columns of nothing
    // between them, and a vine that reaches the wall fills one of those gaps
    // back in from the bottom up. Three of them, under columns 1, 5 and 9,
    // rooted at three heights so they do not all arrive on the same second —
    // seven, eleven and nine segments to climb, which is fifteen to
    // twenty-five seconds each.
    creatures: [
      { kind: CREATURE.VINE, x: 47, y: 164 },
      { kind: CREATURE.VINE, x: 167, y: 192 },
      { kind: CREATURE.VINE, x: 287, y: 178 },
    ],
  },
  {
    name: "GALAXY",
    background: "nebula",
    rows: [
      "..S555....S.",
      "......55555.",
      ".....GG..35.",
      "..32GGGG23..",
      ".53..GG.....",
      ".55555......",
      ".S....555S..",
    ],
    creatures: [
      { kind: CREATURE.JELLYFISH, x: 92, y: 126 },
      { kind: CREATURE.JELLYFISH, x: 242, y: 142 },
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
    ],
  },
  {
    name: "SUPER MAZE",
    background: "grid",
    rows: [
      "RRRRRRRRRRRR",
      "R..........R",
      "R.RR.RR.RR.R",
      "R.R......R.R",
      "R.R.RR.R.R.R",
      "R...R..R...R",
      "RRR.R.RR.RRR",
      "RR..R.RR..RR",
    ],
    // MAZE's big sibling: the corridors are one cell wide again, but the walls
    // are 53 granite bricks and nothing else — 212 ball hits, or 106 laser
    // bolts. Three mouths in the bottom face let the ball in rather than leaving
    // it to skim the front, and every open cell is reachable from every one of
    // them, so a ball that gets in can get anywhere.
    //
    // Which makes the two LASERs the level rather than a bonus on it. The first
    // is in the bottom face between the left and middle mouths, where a ball
    // working along the front finds it early; the second is dead centre with
    // three open sides, deep enough that reaching it is the middle of the run.
    drops: [
      { row: 7, column: 4, kind: "L" },
      { row: 4, column: 7, kind: "L" },
    ],
    creatures: [
      { kind: CREATURE.SLUG, x: 300, y: 0 },
      { kind: CREATURE.BEETLE, x: 104, y: 152 },
      { kind: CREATURE.BEETLE, x: 254, y: 232 },
      { kind: CREATURE.WISP, x: 177, y: 187 },
    ],
  },
  // The run's one exhale, and its only joke. SUPER MAZE before it is 212 hits of
  // granite; this is eleven bricks on an empty court. Two three-brick gold bars
  // hug the side walls at opposite heights, a dotted blue net runs down the
  // middle column, and the silver ball sits one cell past it — high paddle,
  // ball, low paddle, stepping down the diagonal a rally is already on.
  //
  // The ball is beside the net rather than on it because a silver brick with a
  // blue one hard above and below reads as a length of net and not as a ball at
  // all; off the line it has air on four sides. Dot and ball straddle the exact
  // centre of the court between them, which is the closest either gets on their
  // own: twelve columns have no middle cell, only a seam between the sixth and
  // the seventh.
  //
  // 87 % of the cells are air, which is the gag and also the whole difficulty.
  // The 24 hits are nothing; finding the last of them is, because by then what
  // is left is one 30x12 brick alone in open space with no neighbours to catch a
  // stray. The level is the chase, not the wall.
  {
    name: "PONG",
    background: "cathode",
    rows: [
      "G....5......",
      "G...........",
      "G....5......",
      "......S.....",
      ".....5.....G",
      "...........G",
      ".....5.....G",
    ],
    creatures: [
      { kind: CREATURE.CRAB, x: 106, y: 140 },
      { kind: CREATURE.CRAB, x: 256, y: 220 },
      { kind: CREATURE.FIREFLY, x: 181, y: 175 },
      { kind: CREATURE.FROG, x: 14, y: 26 },
    ],
  },
  // A peg board, and the ball is the ball. Sixteen lone gold pegs in four
  // staggered courses under a solid blue shelf. G is three hits, which is the
  // whole reason the pegs are gold: a peg survives being struck, so the board
  // thins over the run instead of falling out of it, and the ball goes on
  // rattling off the same pegs it has already been rattling off.
  //
  // The stagger is a period of three offset by two, which makes every course
  // the mirror of the one above and leaves three of each four pegs corner to
  // corner with one in the next course down. A shared corner is a point and not
  // a gap, so those pairs are little diagonal deflectors a climbing ball cannot
  // slip between — the thing a peg board is for. Four courses and not five:
  // two of them run flush to the left wall and two to the right, and an odd
  // number would stand one more peg against one wall than the other.
  //
  // Columns 1, 4, 7 and 10 carry no peg at any depth, so four clear shafts run
  // from the deck to the shelf. Kept on purpose. A board with no way through it
  // is a wall, and a ball that leaves the deck steep enough to thread one,
  // spend itself along the prizes and come back down the same shaft is the
  // level's one lucky drop.
  //
  // The shelf is solid and sits straight on top of the pegs rather than a row
  // above them, because it is the ceiling as much as the prize: a ball that
  // gets up there is held in the board rather than sailing over it. 28 bricks,
  // 60 hits, 4400 points.
  {
    name: "PACHINKO",
    background: "vault",
    rows: ["555555555555", "G..G..G..G..", "..G..G..G..G", "G..G..G..G..", "..G..G..G..G"],
    creatures: [
      { kind: CREATURE.SNAIL, x: 8, y: 28 },
      { kind: CREATURE.JELLYFISH, x: 97, y: 102 },
      { kind: CREATURE.JELLYFISH, x: 247, y: 118 },
    ],
  },
  // A padlock, gutted through its own keyhole. BUNKER's cousin and its
  // opposite: that one packs a core of blue inside a silver shell and the shell
  // is a lid to be broken off, this one is hollow and has a way in. The cavity
  // *is* the keyhole — a chamber four cells wide under the body's top course,
  // narrowing to a two-cell slot that runs down and out through the foot — and
  // it is the only opening in the lock. Plug those two cells and the whole
  // interior seals.
  //
  // The slot is two cells because twelve columns have no middle one: a single
  // cell cannot be centred, and the pair either side of the seam is the
  // narrowest mouth that can be. It is also 60 px against an 8 px ball, which
  // is a mouth a player can steer for rather than one they hit by accident —
  // and 48 px of cavity above it, so a ball that gets in has room to work.
  //
  // Nothing forces the trip. Every brick is reachable from outside, so the lock
  // can be taken apart the ordinary way; threading it just puts the ball on the
  // inner faces, where the silver is two hits deep on both sides of it at once.
  // Autoplay finds the slot one to seven times a run, sometimes on the first
  // serve with all 46 bricks standing.
  //
  // The shackle's legs are one cell, not two. Two read as a second block
  // stacked on the body; one reads as wire, and it opens the loop to 120 x 24 —
  // big enough to be a loop instead of a notch. That loop is the level's one
  // sealed pocket, and no brick is in it, so nothing is lost behind it. The
  // body's shoulders and foot are stepped in for the same reason the legs are
  // thin: a rectangle with a slot in it is a bar, and this has to be a lock.
  // 46 bricks, 102 hits, 7400 points.
  {
    name: "KEYHOLE",
    background: "grid",
    rows: [
      "...GGGGGG...",
      "...G....G...",
      "...G....G...",
      "..SSSSSSSS..",
      ".SSS....SSS.",
      ".SSSS..SSSS.",
      ".SSSS..SSSS.",
      "..SSS..SSS..",
    ],
    creatures: [
      { kind: CREATURE.WOODPECKER, x: 97, y: 148 },
      { kind: CREATURE.WOODPECKER, x: 247, y: 164 },
      { kind: CREATURE.MOTH, x: 110, y: 160 },
    ],
  },
  // One eye, filling the wall, looking down the field at the deck. An eight-row
  // almond of soft brick — red at the tips, orange where it meets the iris — a
  // silver ring one cell thick all the way round, and a granite pupil.
  //
  // **The pupil is granite and not the ticket's gold, and the ticket is why.**
  // It was written on 21 August, when gold was the hardest brick in the game;
  // granite landed ten days later with SUPER MAZE. The line the level is named
  // for is "the armored pupil", so it takes whatever the armour brick currently
  // is. It is also the only body on the roster that is the colour a pupil
  // actually is: gold against an orange sclera read as a warm blob with no
  // centre at all, and charcoal reads as a hole. Granite chips visibly over its
  // four states, so the pupil cracks while it is being stared at.
  //
  // Four columns wide because twelve columns have no middle one, and four cells
  // by three rows is 120 x 36 — the closest to round anything gets on a grid of
  // 30 x 12 cells. The iris sits one row below the almond's centre, which is
  // what makes the eye look down rather than out.
  //
  // The white is banded by one rule and not by decoration: a soft brick touching
  // the iris is a 2, every other one is a 1. That puts the warm tone against the
  // silver and leaves the tips red, which is what reads as a curve rather than
  // as a slab — and it is why the bottom tip is orange and the top tip is not,
  // since the iris is a row nearer the bottom.
  //
  // **What the ticket promises and the wall cannot deliver:** "all that's left
  // staring" is not a guarantee and no arrangement makes it one. Over six
  // autoplayed runs the pupil is alive for 87 % of the level and is the last
  // brick standing in two of them. Which brick is genuinely last is positional
  // and not a matter of hit points — it is whichever one the ball has not
  // happened to reach, and on a wall this wide that is usually a lone soft brick
  // out at a tip. A bigger pupil, a granite iris, trimming the tips off the
  // almond and sliding the pupil a row up or down were all measured; none of
  // them moved it. The armour buys the reading, not the certainty.
  // 68 bricks, 122 hits, 8180 points.
  {
    name: "EYE",
    background: "nebula",
    rows: [
      "....1111....",
      "..12222221..",
      ".12SSSSSS21.",
      "112SRRRRS211",
      "112SRRRRS211",
      ".12SRRRRS21.",
      "..2SSSSSS2..",
      "....2222....",
    ],
    creatures: [
      { kind: CREATURE.WISP, x: 96, y: 152 },
      { kind: CREATURE.WISP, x: 246, y: 232 },
      { kind: CREATURE.FROG, x: 164, y: 26 },
      { kind: CREATURE.SLUG, x: 300, y: 0 },
    ],
  },
  // An hourglass: two sand piles pinched at a one-brick gold neck. Each
  // triangle grades 5-to-1 toward the waist in PYRAMID's two-tone rows — the
  // outer tier rides the row's ends, the next one fills it — so all five tiers
  // are present in three rows and the pinch is red-hot where it meets the gold.
  //
  // Twelve columns have no middle one, and a neck of one brick cannot sit on a
  // seam. Rather than hang a lopsided neck under centred bulbs, the whole glass
  // is centred on column 5: eleven columns of perfect symmetry and a clear
  // shaft down the right wall, PACHINKO's lucky lane again — the one way a ball
  // gets above the glass without going through it.
  //
  // The funnel is the air, not the sand. The wedges either side of the glass
  // lose two cells of height per column and close to a one-row slot against the
  // neck, so a ball working inward is squeezed onto the gold's flanks — and the
  // neck is the only brick in its row, so cracking it opens a clean channel and
  // visibly snaps the level in two, one pile drifting over the other.
  //
  // The ticket says TEMPO and STASIS are made for this level, so the level
  // promises them: both pinned to the spine, bullet time in the top bulb where
  // the sand still flows, full stop in the bottom one where it has already
  // fallen. 43 bricks, 45 hits, 3600 points — the exhale after EYE's 122, the
  // way PONG breathes out after SUPER MAZE.
  {
    name: "HOURGLASS",
    background: "horizon",
    rows: [
      "54444444445.",
      "..3222223...",
      "....111.....",
      ".....G......",
      "....111.....",
      "..3222223...",
      "54444444445.",
    ],
    drops: [
      { row: 2, column: 5, kind: "T" },
      { row: 4, column: 5, kind: "I" },
    ],
    creatures: [
      { kind: CREATURE.CRAB, x: 107, y: 140 },
      { kind: CREATURE.CRAB, x: 257, y: 220 },
      { kind: CREATURE.BAT, x: 196, y: 74 },
    ],
  },
  // The arcade bug, three lanes of it, winding down the field toward the deck.
  // Alternating green and yellow segments along a single unbroken path — tail
  // at the top-left, gold head at the bottom-right — over a field of lone
  // silver mushrooms.
  //
  // **Every turn is a mushroom's fault, which is the whole homage.** In the
  // cabinet the centipede does not wind because winding looks nice; it walks
  // straight until something is in the way, then drops a row and reverses. So
  // the mushroom at the end of each lane is the reason that lane ends there:
  // one at the right of row 0, one at the left of row 3, and one directly in
  // front of the head, which is the turn it has not taken yet. Take those three
  // away and the shape stops meaning anything.
  //
  // The lanes sit three rows apart rather than two, and that spacing is load-
  // bearing twice over. It gives each descent two cells instead of one, so a
  // corner is four bricks tall and reads as a bend rather than a nick; and it
  // puts one column three segments away from itself across a turn, which is
  // odd, so the colour flips and each lane is staggered against the one above.
  // With a one-cell descent that distance is two, the parity comes back around,
  // and the body lands in vertical stripes — a checkerboard, not a bug.
  //
  // The wink at CRITTER is on the head, not in the flavour text: the gold is
  // seeded, and cracking it lets a grub out to eat its way across the same wall
  // the centipede is crawling over. 48 bricks, 65 hits, 5170 points — the
  // exhale carrying on from HOURGLASS before FLOPPY's 138.
  {
    name: "CENTIPEDE",
    background: "starfield",
    rows: [
      ".3434343434S",
      "..S...S...3.",
      "....S...S.4.",
      "S4343434343.",
      ".3.S...S...S",
      ".4...S...S..",
      ".34343434GS.",
      ".S...S...S..",
    ],
    drops: [{ row: 6, column: 9, kind: "CR" }],
    creatures: [
      { kind: CREATURE.FIREFLY, x: 107, y: 152 },
      { kind: CREATURE.FIREFLY, x: 257, y: 232 },
      { kind: CREATURE.VINE, x: 198, y: 187 },
    ],
  },
  /**
   * THE WRATH, the fourth of the Observer's five (SHA-175).
   *
   * **Straight after EYE, and that is the joke of the placement**: the level
   * before this one is a wall built in the shape of an eye, a portrait hung in
   * a nebula. Then the portrait's sitter comes up under the floor. The
   * backgrounds hold — nebula, observer, horizon — so `check:backgrounds`
   * passes without either neighbour moving.
   *
   * The socket is below the rail, so the deck rides across the white and the
   * player's own paddle is the thing occluding the eye watching them. Only the
   * brow and the top of the iris clear the wood; the rest of the almond runs off
   * the bottom of the field. The sclera is veined, and the iris is red.
   *
   * The wall is built to be *dug*, because on this veil a hole is a thing that
   * closes. Two soft rows in the middle (`4` solid, `3` combed) and two more
   * under them let a rally open a shaft quickly; the armour is all at the top,
   * where the silver caps and the gold-and-blue row make the last third slow —
   * and the last third is exactly when the eye has had the most blinks. A
   * player who digs fast wins the race, and a player who picks at it finds the
   * holes behind them filling in.
   *
   * Three pins, all born as hatchlings rather than eggs: the band's trotting
   * middle form, because by the fourth veil the introduction is over.
   *
   * 54 bricks, 75 hits, 5610 points.
   */
  {
    name: "THE WRATH",
    background: "observer",
    rows: ["SS.SSS.SSS.S", "5G.G5G.G5G.G", "444444444444", "3.3.3.3.3.3.", "222222222222", ".1.1.1.1.1.1"],
    observer: {
      mode: "wrath",
      eye: { x: 186, y: 292, hw: 84, hh: 30 },
      tint: "red",
      hint: "IT RISES BELOW · EACH BLINK REBUILDS",
      brood: [
        { x: 60, y: 170, form: 1 },
        { x: 200, y: 200, form: 1 },
        { x: 300, y: 228, form: 1 },
      ],
      diadem: [
        [92, 250],
        [115, 221],
        [160, 196],
        [212, 196],
        [257, 221],
        [280, 250],
      ],
    },
  },
  // A 3.5-inch floppy, drawn the way the save icon draws it: label up, metal
  // shutter down. The icon is why — nobody has held one since the machines COOL
  // and 1991 are named after, but everybody still clicks one — and the deck is
  // why too: shutter-down puts the gold on the row the ball reaches first, so
  // the title's promise is load-bearing. The shutter is the armour plate of the
  // whole disk, three hits a cell across the front line, and it is still
  // standing when the shell behind it has gone.
  //
  // The body is silver shell one cell thick, inset a column from either wall so
  // the disk floats on the blueprint grid like a diskette on graph paper — and
  // so the two side lanes are the way behind it. The chamfer is one air cell
  // off the top-right corner, the missing corner that makes a square read as a
  // diskette; it is also the only air inside the outline, which makes this the
  // fullest wall in the game — 79 bricks where EYE carries 68.
  //
  // The label is tier 4 and not the yellow a cheerful label suggests, because
  // yellow and orange both sit inside the gold shutter's own family and a label
  // the colour of the shutter reads as more metal. Green is the one vivid tier
  // that reads as paper against both silvers. 79 bricks, 138 hits, 10530
  // points — the heaviest wall in the game, and the last one before FINALE.
  {
    name: "FLOPPY",
    background: "grid",
    rows: [
      ".SSSSSSSSS..",
      ".S44444444S.",
      ".S44444444S.",
      ".S44444444S.",
      ".S44444444S.",
      ".SSSSSSSSSS.",
      ".SSGGGGGGSS.",
      ".SSGGGGGGSS.",
    ],
    creatures: [
      { kind: CREATURE.JELLYFISH, x: 92, y: 138 },
      { kind: CREATURE.JELLYFISH, x: 242, y: 154 },
      { kind: CREATURE.SNAIL, x: 38, y: 28 },
      { kind: CREATURE.BEETLE, x: 169, y: 187 },
    ],
  },
  {
    name: "FINALE",
    background: "starfield",
    rows: ["GGGGGGGGGGGG", "S5S5S5S5S5S5", "444444444444", "S3S3S3S3S3S3", "GG22222222GG", "S1S1S1S1S1S1"],
    creatures: [
      { kind: CREATURE.FROG, x: 74, y: 26 },
      { kind: CREATURE.SPIDER, x: 120, y: 4 },
      { kind: CREATURE.MOTH, x: 110, y: 160 },
      { kind: CREATURE.SLUG, x: 300, y: 0 },
    ],
  },
  /**
   * THE LID, the last of the Observer's five and the last level of the loop
   * (SHA-176).
   *
   * **The only level in the game that is not won by clearing its wall.** The
   * eye is a shut slit that does not blink, there are no oculi and no door, and
   * what is in front of it is a plate of bronze rivets. Break ten of the
   * sixteen cells behind the seal and the Observer wakes: the socket empties,
   * and the pupil comes out into the chamber. After that the wall is scenery —
   * the level ends when the pupil is blind.
   *
   * The plate is `L`, the one brick that never pays a capsule, so the ten
   * silver bricks of the rim are the level's entire supply. That is the whole
   * argument for the rim being there: without it the last level of the loop
   * would hand the player nothing at all, and with it the thing they have to
   * decide is whether to spend a rally on the outside before starting on the
   * middle.
   *
   * Two pins, both born as wyverns — the third form, straight away. There is no
   * introduction left to give, and the band on this veil is a hazard rather
   * than a ladder: a wyvern killed is still a star, but nothing here turns into
   * anything worse than it already is.
   *
   * Neighbours: FINALE's starfield behind it, and SUNRISE's horizon across the
   * wrap, so `check:backgrounds` passes on the loop's one seam as well as
   * inside it.
   *
   * 60 bricks, 120 hits, 14 000 points — and none of that is how the level ends.
   */
  {
    name: "THE LID",
    background: "observer",
    rows: ["..LLLLLLLL..", ".LLLLLLLLLL.", "SLLLLLLLLLLS", "SLLLLLLLLLLS", ".SLLLLLLLLS.", "..SSLLLLSS.."],
    observer: {
      mode: "lid",
      eye: { x: 186, y: 74, hw: 120, hh: 27 },
      tint: "red",
      hint: "SEALED SHUT · BREAK THE SEAL, BLIND THE EYE",
      oculi: false,
      brood: [
        { x: 100, y: 196, form: 2 },
        { x: 260, y: 224, form: 2 },
      ],
      diadem: [
        [286, 160],
        [247, 196],
        [207, 210],
        [165, 210],
        [125, 196],
        [86, 160],
      ],
    },
  },
];

/**
 * Where the Observer's levels sit in the roster, in order (SHA-167).
 *
 * Derived and never written down, so a veil moved or a veil added is one edit
 * to `LEVELS` and nothing else — the console's `veil 3` means the third veil
 * there is, not level 27.
 */
export const VEIL_LEVELS: readonly number[] = LEVELS.flatMap((level, index) => (level.observer ? [index] : []));

// How many levels a series is. EVERY FIVE (SHA-206): a boss fight ends
// levels 5, 10, 15 … 40, and the last level of the loop whatever its number.
export const BOSS_EVERY = 5;

/** Whether this level (0-based) ends in a boss fight. Nothing in the level's own data says so. */
export function isBossLevel(index: number): boolean {
  return (index + 1) % BOSS_EVERY === 0 || index === LEVELS.length - 1;
}

// Runs loop past the last level; the wrapped index is also the background
// variant, so a level's field art is the same on every visit.
export function levelIndexOf(level: number): number {
  return level % LEVELS.length;
}

export function levelAt(level: number): LevelDefinition {
  return LEVELS[levelIndexOf(level)];
}

// Which rows a run's opening DEMAKE may be seeded in, counted from the bottom of
// the wall. Never the front two: those go in the opening rally, and a capsule
// meant to be the first level's showpiece may not fire before the player has a
// machine to miss.
const DEMAKE_SEED_ROWS_FROM_BOTTOM: readonly number[] = [3, 4, 5];

/**
 * The wall a level builds, which is `levelAt` plus the one capsule a run is
 * promised: **the first level always holds a DEMAKE**.
 *
 * It draws at a common's rate and the user has still twice said they never see
 * it, so the run opens by handing it over rather than hoping. One is pinned into
 * level 1's wall every run, in a random cell of whichever row
 * `DEMAKE_SEED_ROWS_FROM_BOTTOM` picks.
 *
 * Pinned through `drops` — the door SUPER MAZE's two LASERs already come
 * through — rather than by reaching into the built grid, which buys the whole of
 * what a seeded cell means for free: it comes out however the brick dies, splash
 * and bomb included, XRAY shows the truth about it, and the console's `bonus`
 * re-roll leaves it alone.
 *
 * **It costs the bag nothing.** A seeded capsule is not a draw, so the pass is
 * untouched and every other level's odds are exactly what they were — the
 * guarantee is added to the first level, not taken out of the rest of the run.
 * `FIRST_LEVEL_EXCLUDES` in `ShatterGame` is the other half of the rule: DEMAKE
 * stays barred from level 1's *rolls*, so the level holds this one and no other.
 * Lifting that bar would let a second land in the front row and fire on the
 * third brick, which is the thing these rows exist to prevent.
 */
export function wallFor(level: number): LevelDefinition {
  const definition = levelAt(level);
  if (level !== 0) {
    return definition;
  }
  const drop = openingDemakeDrop(definition);
  // Ours first: `BrickGrid.load` stamps drops in order, so a level that pins its
  // own capsule on the cell this one chose keeps it.
  return drop === null ? definition : { ...definition, drops: [drop, ...(definition.drops ?? [])] };
}

/**
 * A cell for the opening DEMAKE: a row drawn uniformly from the ones the rule
 * allows that actually hold a brick, then a column drawn uniformly from that
 * row's bricks.
 *
 * Rows are counted off the wall's own height rather than written down, so
 * editing SUNRISE or putting another level first still obeys the rule instead of
 * quietly pointing at rows that moved. `null` when none of the three holds a
 * brick, which no first level has ever been — a wall the rule cannot place in is
 * a wall without a promise, not a crash.
 */
function openingDemakeDrop(definition: LevelDefinition): SeededDrop | null {
  const candidates = DEMAKE_SEED_ROWS_FROM_BOTTOM.map((fromBottom) => definition.rows.length - fromBottom)
    .filter((row) => row >= 0)
    .map((row) => ({ row, columns: brickColumns(definition.rows[row]) }))
    .filter((candidate) => candidate.columns.length > 0);
  if (candidates.length === 0) {
    return null;
  }
  const { row, columns } = candidates[Math.floor(Math.random() * candidates.length)];
  return { row, column: columns[Math.floor(Math.random() * columns.length)], kind: "D" };
}

// Which columns of a row are bricks, over the grid's width rather than the
// string's: `BrickGrid.load` reads a short row as air past its end, and a
// promise placed in a cell the wall never built would be no promise at all.
function brickColumns(row: string): number[] {
  const columns: number[] = [];
  for (let column = 0; column < gameConfig.grid.columns; column++) {
    if (isBrickKind(row[column] ?? ".")) {
      columns.push(column);
    }
  }
  return columns;
}
