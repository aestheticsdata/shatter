// The capsule roster: one entry per power-up, and the single source of truth
// for every table the game reads about them. Adding a capsule is adding a row
// here — the union type, the lookups below, `DROP_COLORS` and
// `DARK_LETTER_DROP_KINDS` in `@render/palette`, and the dev console's roster
// all derive from it. Nothing else needs an edit.
//
// This module imports nothing on purpose: `@interfaces/types` re-exports
// `PowerUpKind` from here, and a cycle would put half the game's types behind
// a partially initialised module.

// How often a capsule drops, and — for `trap` — whether it is a malus at all.
// The two are one field because they have never disagreed: every trap in the
// roster is a trap precisely because catching it hurts.
export type PowerUpTier = "common" | "uncommon" | "rare" | "trap";

// How many tickets a tier puts in the bag — see `DropBag`, which draws without
// replacement instead of rolling weighted odds. A tier is a count of copies, not
// a probability, and it is almost the whole of the rarity system: 64 tickets,
// about five levels, every capsule out once or twice a pass. Two rows carry an
// exception, and `POWER_UP_DROP_TICKETS` says why.
//
// **Weighted odds were the bug, and no number in this table could have fixed
// them.** The old spread — common 1, trap 0.7, uncommon 0.6, rare 0.35 — put its
// commonest capsule at 3.05 % of a roll and its rarest at 1.07 %, which is 2.9x
// end to end and reads as reasonable. It was not. With 48 rows and a level
// seeding about 12 capsules, a specific rare averaged one appearance per 94 drops
// — 8 levels — with nothing bounding the tail: an 8.3 % chance of going 20 levels
// without a given one, and a 65 % chance that at least one of the twelve was
// missing over that stretch. That is the arithmetic of a player saying they have
// never seen a capsule, and they were right.
//
// Three rows had already bought their way out with per-row exceptions (DEMAKE,
// VORTEX, GIANT), and 1-in-33 was the ceiling the roster size imposed on all of
// them: per-row numbers could only ever redistribute underneath it. GIANT is the
// one measured case — missed across three levels at `rare`, where missing was
// 70 % likely. A second miss after its bump to `common` is *not* cited here: the
// deployed HTML carries no cache header while its assets are immutable, so an
// open tab keeps the old bundle indefinitely and nobody could confirm which
// build was being played. A comment is not the place for a number that might be
// a stale browser.
//
// A bag lifts the ceiling by construction rather than by odds. For the nine rares
// that never had an exception this is a straight win — 1.07 % a roll becomes
// 1.61 % a draw *and* a guarantee.
//
// It is **not** a straight win for a capsule that already had one, and that is
// worth spelling out because it nearly shipped as a regression. A single ticket
// is 1.61 % against the 3.05 % an exception bought, and a bag's advantage is all
// in the tail: over three levels one ticket is 54 % against the exception's 63 %,
// over four 71 % against 73 %, and it only overtakes from the fifth level on.
// Most sessions are shorter than that. The guarantee is the fix for the 20-level
// drought; it is not a licence to take visibility away at the horizon people
// actually play.
//
// `trap` sits at parity with `uncommon` here rather than above it, which is where
// weights had it. Integer tickets cannot land between 1 and 2: at 2 traps would
// be 28.6 % of everything that falls, and at 1 they are 16.7 %, near the
// "roughly 18 %" this comment has named as the intent since the roster was half
// its size (weights had drifted to 22.3 %). Outweighing `uncommon` was how that
// number used to be approached, never the goal — and "met often enough to teach
// its blink" is served better by a guarantee than by a weight.
export const TIER_TICKETS: Record<PowerUpTier, number> = {
  common: 2,
  uncommon: 1,
  rare: 1,
  trap: 1,
};

export interface PowerUpDefinition {
  // `string`, not the union — the union is inferred *from* these ids, and typing
  // it as itself would be circular. One or two characters, and internal: the
  // player never sees an id, they read the glyph. Short because it is what the
  // thirty-odd `kind === "..."` branches across the game are written in.
  id: string;
  // The POWER inset label and the catch pop, and what the console accepts
  // alongside the id (`power multi` === `power M`). The glyph painted on the
  // pill is its opening letters — see `POWER_UP_GLYPHS`.
  name: string;
  // Capsule body. Every one of these is checked against the playfield themes by
  // `pnpm run check:backgrounds`, and each new one re-opens all 8 of them.
  //
  // Hue is a soft cue; the glyph is the discriminator. The families the roster
  // fell into, measured rather than decreed: offence warm 340-30° (LASER 352°,
  // BLAST 29°), control cool 170-260° (SWARM 174°, ZAP 190°, WALL 205°, WIDE
  // 213°, RAIN 258°), ball-count green 75-140° (NUKE 77°, MULTI 128°), economy
  // gold 40-75° (PAYDAY 44°, PIERCE 47°). No band is reserved and none bans a
  // capsule — eight traps cannot be held apart inside one 35° hazard band, and a
  // trap tells on itself through the blink and the pink pop, which are
  // hue-independent. TEMPO (5 % saturation), GLUE (30°, dark enough to read
  // brown) and 1UP (330°) sit outside every band and stay there.
  //
  // The rule for a new body is **>= 58 RGB from every other capsule and from the
  // ball**, and nothing else is a hard constraint.
  //
  // Bricks deliberately are not: six capsules wear a brick's exact colour by the
  // game's original design — WIDE is the blue brick, MULTI the green, LASER the
  // red, PIERCE the yellow, BLAST the orange, PAYDAY the gold. A capsule is a
  // moving pill with a letter and a sheen; it was never going to be mistaken for
  // a static brick, and matching them is the look.
  //
  // Saturation is an aim, not a floor. Reach for something vivid, but a pale body
  // is fine when the distance holds: TEMPO at 5 % and WALL at 44 % both shipped
  // long before anyone wrote a number down, and 36 capsules cannot all be vivid
  // and 58 apart at once.
  //
  // One grandfathered exception: PIERCE and PAYDAY sit 49 apart. Every other pair
  // in the roster clears 58.
  color: string;
  // Dark letter on a light body. Authored, not computed: true iff the body's
  // WCAG luminance is >= 0.28 — today's roster splits cleanly either side of
  // that (GLUE #b07840 = 0.230 is the lightest light, BLAST #f07d10 = 0.332 the
  // darkest dark). A future body inside that gap keeps whatever is authored
  // here; the DEV pass in `@render/checkCapsules` only warns about it.
  dark: boolean;
  // How long the effect lasts, in 60 Hz ticks. 0 for the instantaneous and
  // one-shot capsules (see `timed`).
  ticks: number;
  // Rarity, and for `trap` the malus tell as well — `MALUS_KINDS` below is that
  // tier, and it drives the blinking glyph, the pink catch pop and the womp, so
  // a new trap is one word here rather than three more `=== "J"` branches.
  // It buys tickets in the bag rather than odds in a roll — see `TIER_TICKETS`.
  // Whether a brick drops anything at all is a separate coin:
  // `gameConfig.rules.bonusSpreadAmount`.
  tier: PowerUpTier;
  // Whether `PowerUpTimers` counts it down. W (WALL) is a one-shot charge owned
  // by the game and N (NUKE) is driven by the Detonation, so neither is timed.
  // S (SWARM) is instantaneous like M: its timer only keeps the inset label lit.
  // U/Z/R/Q are instantaneous with no lingering state at all — the catch pop is
  // their whole acknowledgment, and BM ends the life it was caught on.
  timed: boolean;
  // The line the CAPSULES screen prints under the pill: what the player sees,
  // present tense — `WIDER PADDLE`, `BALLS STICK · CLICK TO FREE`. Required, so
  // a capsule invented tomorrow cannot reach the catalogue without one.
  //
  // **The limit is rendered width, not a character count.** `checkCapsuleBlurbs`
  // in `@render/checkCapsules` measures the line at `ENTRY_FONT` and wraps it
  // against `ENTRY_COLUMN_WIDTH`, and the entry has room for `ENTRY_BLURB_LINES`
  // — one. Silkscreen is proportional, so no character count is safe in either
  // direction: the three widest blurbs in the roster are ENGLISH at 146.1 px,
  // ERODE at 145.3 and SNAP at 144.4, which is 32, 31 and 30 characters landing
  // within 1.7 px of each other.
  //
  // This comment said "in about 40 characters" for a long time and that number
  // was never reachable — 40 characters of ordinary text measures about 184 px,
  // some 36 px past the 148 px column, and a 33-character blurb already wraps at
  // 152.3. It cost two sessions a wave of rewritten capsule specs before anyone
  // measured it. Run the check against a new row instead of counting: a blurb
  // that wraps shoves the whole entry down, and the DEV pass is the only thing
  // here that knows what a glyph actually costs.
  //
  // The README's Effect column is the longer reference and the two must agree:
  // when a capsule is retuned, both move.
  blurb: string;
  // What the catalogue prints for duration, for the rows where `ticks` is not
  // the answer. Everything else derives it — `ticks / 60`, or `INSTANT` at 0 —
  // and five rows would come out a lie:
  //
  //   WALL      its charge is not instant, it waits until it saves you
  //   MULTI     3 s is how long the POWER inset names it; the balls stay
  //   SWARM     the same
  //   CRITTER   the grub lives `powerUps.critter.lifeTicks`, not `ticks`
  //   BANANA    the catch is instant, the peels it leaves are not
  //
  // Authored, and the one thing on this screen that can drift: it is prose, and
  // this module imports nothing, so it cannot read the config those last three
  // live in. Retune one and the string moves with it.
  lasts?: string;
}

// One row per capsule, and it must stay one row: this is the table the hue
// families, the `dark` split and the tier balance above were all read off, and
// none of that can be seen down a column of 35 ten-line blocks.
//
// The blurb pushed the row past the formatter's 120 columns, which is what the
// ignore is for — the block is data, there is nothing here for oxfmt to get
// right, and it would otherwise explode the roster into 350 lines.
// oxfmt-ignore
export const POWER_UPS = [
  { id: "E", name: "WIDE", color: "#2d7fe0", dark: false, ticks: 720, tier: "common", timed: true, blurb: "WIDER PADDLE" },
  { id: "M", name: "MULTI", color: "#3fbf4f", dark: true, ticks: 180, tier: "common", timed: true, blurb: "MORE BALLS · 3 THEN 6 THEN 9", lasts: "INSTANT" },
  { id: "L", name: "LASER", color: "#e8384f", dark: false, ticks: 720, tier: "common", timed: true, blurb: "THE PADDLE GROWS CANNONS" },
  { id: "P", name: "PIERCE", color: "#ffcf1c", dark: true, ticks: 480, tier: "uncommon", timed: true, blurb: "THE BALL GOES THROUGH BRICKS" },
  { id: "B", name: "BLAST", color: "#f07d10", dark: true, ticks: 720, tier: "common", timed: true, blurb: "KILLS DAMAGE THE 8 AROUND" },
  { id: "W", name: "WALL", color: "#8fd0ff", dark: true, ticks: 0, tier: "uncommon", timed: false, blurb: "A BARRIER CATCHES ONE BALL", lasts: "ONE SAVE" },
  { id: "T", name: "TEMPO", color: "#f2f4ff", dark: true, ticks: 480, tier: "common", timed: true, blurb: "BULLET TIME · BALLS AT 0.6" },
  { id: "X", name: "PAYDAY", color: "#dfae2c", dark: true, ticks: 600, tier: "uncommon", timed: true, blurb: "DOUBLE POINTS" },
  { id: "J", name: "JAMMER", color: "#d13be8", dark: false, ticks: 360, tier: "trap", timed: true, blurb: "THE PADDLE SHRINKS" },
  { id: "N", name: "NUKE", color: "#b6ff00", dark: true, ticks: 0, tier: "rare", timed: false, blurb: "A SHOCKWAVE TAKES THE WALL" },
  { id: "S", name: "SWARM", color: "#1fd8c4", dark: true, ticks: 180, tier: "rare", timed: true, blurb: "TWELVE BALLS AT ONCE", lasts: "INSTANT" },
  { id: "U", name: "1UP", color: "#ff70b8", dark: true, ticks: 0, tier: "rare", timed: false, blurb: "ONE EXTRA LIFE, UP TO SIX" },
  { id: "Z", name: "ZAP", color: "#4ae0ff", dark: true, ticks: 0, tier: "uncommon", timed: false, blurb: "THE BOTTOM ROW VAPORIZES" },
  { id: "R", name: "RAIN", color: "#8a5cf5", dark: false, ticks: 0, tier: "uncommon", timed: false, blurb: "FOUR MORE CAPSULES FALL" },
  { id: "G", name: "GLUE", color: "#b07840", dark: false, ticks: 720, tier: "common", timed: true, blurb: "BALLS STICK · CLICK TO FREE" },
  { id: "I", name: "STASIS", color: "#9effd6", dark: true, ticks: 90, tier: "common", timed: true, blurb: "EVERY BALL STOPS IN MID-AIR" },
  { id: "H", name: "HOMING", color: "#00e05a", dark: true, ticks: 480, tier: "common", timed: true, blurb: "BALLS CURVE ONTO BRICKS" },
  { id: "Y", name: "MIRROR", color: "#a878b4", dark: false, ticks: 600, tier: "common", timed: true, blurb: "A GHOST PADDLE ON THE CEILING" },
  { id: "C", name: "CHAIN", color: "#3dff8e", dark: true, ticks: 600, tier: "uncommon", timed: true, blurb: "KILLS ARC TO OTHER BRICKS" },
  { id: "K", name: "MAGNET", color: "#6fd0b4", dark: true, ticks: 720, tier: "common", timed: true, blurb: "THE PADDLE PULLS CAPSULES IN" },
  { id: "V", name: "SINGULARITY", color: "#c9a7ff", dark: true, ticks: 720, tier: "uncommon", timed: true, blurb: "A BLACK HOLE BENDS THE BALLS" },
  { id: "PO", name: "PORTAL", color: "#00b3fa", dark: true, ticks: 1800, tier: "uncommon", timed: true, blurb: "SIDE WALLS BECOME DOORWAYS" },
  { id: "O", name: "BUMPERS", color: "#ff00aa", dark: false, ticks: 720, tier: "uncommon", timed: true, blurb: "FIVE DISCS · 100 A KICK" },
  { id: "Q", name: "QUAKE", color: "#ffab6b", dark: true, ticks: 0, tier: "uncommon", timed: false, blurb: "THE WALL DROPS A ROW" },
  { id: "BM", name: "BOMB", color: "#ff3b00", dark: false, ticks: 0, tier: "trap", timed: false, blurb: "IT BLOWS UP THE PADDLE" },
  { id: "GH", name: "GHOST", color: "#e1f0b4", dark: true, ticks: 300, tier: "trap", timed: true, blurb: "THE WALL GOES INTANGIBLE" },
  { id: "CR", name: "CRITTER", color: "#a3e04a", dark: true, ticks: 0, tier: "uncommon", timed: false, blurb: "A GRUB EATS THROUGH THE WALL", lasts: "15 S" },
  { id: "RU", name: "RUSH", color: "#e1001b", dark: false, ticks: 300, tier: "trap", timed: true, blurb: "EVERY BALL AT 1.8 SPEED" },
  { id: "XW", name: "XWIDE", color: "#0082a0", dark: false, ticks: 720, tier: "rare", timed: true, blurb: "TWICE THE WIDE DECK" },
  { id: "XR", name: "XRAY", color: "#2aff00", dark: true, ticks: 300, tier: "rare", timed: true, blurb: "EVERY BRICK SHOWS ITS CAPSULE" },
  { id: "MT", name: "METEOR", color: "#c84b19", dark: false, ticks: 0, tier: "rare", timed: false, blurb: "THREE METEORS DRILL THE WALL" },
  { id: "SP", name: "SPLIT", color: "#e0607a", dark: false, ticks: 360, tier: "trap", timed: true, blurb: "THE DECK BREAKS AROUND A HOLE" },
  { id: "VX", name: "VORTEX", color: "#b000fc", dark: false, ticks: 720, tier: "rare", timed: true, blurb: "A BIGGER BLACK HOLE, ADRIFT" },
  { id: "BN", name: "BANANA", color: "#e2fe74", dark: true, ticks: 0, tier: "trap", timed: false, blurb: "PEELS SKID THE DECK", lasts: "10 S PEELS" },
  { id: "D", name: "DEMAKE", color: "#00d200", dark: true, ticks: 480, tier: "trap", timed: true, blurb: "THE MACHINE DROPS TO 1-BIT" },
  { id: "BK", name: "BLACKOUT", color: "#6998f7", dark: true, ticks: 1200, tier: "trap", timed: true, blurb: "LIGHTS OUT · THE BALL GLOWS" },
  { id: "F", name: "FLIP", color: "#ff1aff", dark: true, ticks: 480, tier: "trap", timed: true, blurb: "THE WHOLE FIELD TURNS OVER" },
  { id: "TU", name: "TURBO", color: "#00ffff", dark: true, ticks: 600, tier: "rare", timed: true, blurb: "BALLS RUN FAST · POINTS x3" },
  { id: "A", name: "ANGEL", color: "#ffb0e0", dark: true, ticks: 0, tier: "rare", timed: false, blurb: "IT CATCHES ONE LOST BALL", lasts: "ONE SAVE" },
  { id: "GB", name: "GAMBLE", color: "#ff6cff", dark: true, ticks: 0, tier: "uncommon", timed: false, blurb: "A REEL PAYS A RANDOM BONUS", lasts: "ONE SPIN" },
  // The body is the widest gap left on a 40-capsule board, measured rather than
  // picked: 98 from CRITTER and MULTI, 99 from NUKE, and 5.99:1 against the
  // darkest field theme. The green quarter looks crowded and is not — the lime
  // capsules all sit well above it in value.
  { id: "FU", name: "FUSE", color: "#77b200", dark: true, ticks: 0, tier: "uncommon", timed: false, blurb: "IT COMPLETES A COMBO", lasts: "ONE FUSION" },
  // Hazard pink, and the one row in the roster where every constraint was
  // binding at once. Three rules had to hold: 58 from every capsule and the
  // ball, 3:1 against the darkest playfield themes, and 48 from every star and
  // glint tone the backgrounds paint. This clears them at 65 (LASER), 4.3:1 and
  // 178 respectively.
  //
  // The two colours it wanted to be both failed, and the failures are worth
  // keeping: a deep indigo (#2a1ae0) reads at 1.7:1 against the dark themes —
  // a body is read against the field before it is read against the roster, and
  // anything under about 0.154 luminance is out however empty its corner looks
  // — and the steel blue above the line (#6175b3) lands 11 from `planet`'s
  // glint, which is a trap disguised as a star. The blue quarter is simply
  // full: WIDE, XWIDE, WALL, MIRROR, BLACKOUT, RAIN and SINGULARITY hold the
  // capsule side of it and the starfields hold the rest.
  //
  // So the pill is loud instead of atmospheric, which is the honest answer for
  // a trap that has to be read while a ball is in the air — 178 from the
  // nearest speck is the largest margin on the board, and no starfield has
  // anything like it. The arcs it throws stay blue-white regardless: PIERCE is
  // a yellow pill throwing white sparks for the same reason, since a spark is
  // hot, not branded.
  { id: "HA", name: "HAYWIRE", color: "#ff0066", dark: false, ticks: 300, tier: "trap", timed: true, blurb: "EVERY BALL FLIES OFF COURSE" },
  // Billiard felt, and the roster's first dark green: the eight greens already
  // on the board are all pale or acid (DEMAKE 0.30 luminance is the darkest of
  // them), so the table's own colour was the one green nobody had taken. 80
  // from MULTI, 3.88:1 against the darkest field theme and 79 from the nearest
  // star, which is room on every rule at once.
  //
  // Hue 142 lands it in the ball-count band MULTI and NUKE were measured into,
  // and it stays there: the bands are a description of where the roster fell,
  // not a reservation, and a capsule about putting english on a ball is the
  // colour of the cloth you do it on or it is nothing. The glyph is what tells
  // them apart, as it is for the other seven.
  { id: "EN", name: "ENGLISH", color: "#009436", dark: false, ticks: 1200, tier: "rare", timed: true, blurb: "WHIP THE PADDLE · CURVE THE BALL" },
  // The brightest body on the board and the one with the most room under it:
  // 11.6:1 against the darkest field theme, which is three times the bar, and
  // 76 from XRAY, MULTI and CRITTER alike. The green quarter is crowded and
  // this still fits, because what is crowded there is the *hue* and not the
  // value — the four bright greens sit at four different luminances.
  //
  // It is measured against the traps as well, which is not one of the roster's
  // written rules and is the rule that actually decided it: the nearest trap is
  // DEMAKE at 119, further than any other candidate came, and a capsule the
  // player might read as a trap while it falls is worse than one they cannot
  // tell from another bonus. The grid it lays over the field is drawn in this
  // green taken right down, so the effect and the pill are one colour.
  { id: "SN", name: "SNAP", color: "#60ff36", dark: true, ticks: 720, tier: "common", timed: true, blurb: "EVERY BOUNCE SNAPS TO THE GRID" },
  // Mortar, which is the one thing on the field this capsule is about and the
  // one colour nothing on the board had taken. 77 from QUAKE, MIRROR and GHOST
  // alike — the widest gap left on a 44-capsule board — and 0.469 luminance
  // against the darkest field theme, which is more room than a pale body
  // usually gets.
  //
  // The khaki quarter looked full and was not. What is crowded there is the
  // *acid* end of it: BANANA, GHOST and PAYDAY are all vivid and all above 60 %
  // saturation, and this sits at 26 % where none of them can reach it. A body
  // the colour of the stuff between the bricks is what the pill is for, and a
  // saturated one would have been a lime capsule about a lime nothing.
  //
  // The nearest trap is GHOST at 77, which matters more here than anywhere: the
  // two capsules do the same thing to the wall from opposite ends, and one that
  // could be mistaken for the other while it falls would be the worst pill on
  // the board.
  { id: "ER", name: "ERODE", color: "#bcb88e", dark: true, ticks: 720, tier: "rare", timed: true, blurb: "MORTAR ERODES · THREAD THE WALL" },
  // Coral, and the roster's own answer to a fire capsule arriving on a board
  // where fire is the one thing everybody already took. Swept properly, the
  // warm quarter has exactly one opening left: 60.5 from SPLIT and 60.6 from
  // BLAST at hue 14, which clears the 58 bar and is the *most* any colour in
  // the flame family can clear it by. Hue 20-34 has nothing at all — BLAST
  // 29°, GLUE 30°, QUAKE 26° and METEOR 17° hold every value in it, and no
  // saturation or lightness inside that band reaches 58 from all four.
  //
  // The two colours that scored better were both refused. A dark bronze at hue
  // 45 reaches 71 and sits at exactly 3.01:1 against the darkest field theme —
  // on the floor of the rule rather than inside it, and a smouldering brown is
  // not what a pyre looks like. A pale salmon at hue 2 reaches 60 as well and
  // reads as a cousin of ANGEL's pink, which is the last thing a capsule that
  // spends your spare balls should look like.
  //
  // The nearest trap is SPLIT at 60.5, and the 34° of hue between them is what
  // does the work there: SPLIT is rose and this is orange. Against the fire it
  // could actually be confused with — BOMB, the trap that blows up the deck —
  // it sits 93 away, which matters more, because BOMB and PYRE are the two
  // capsules on the board about something exploding.
  { id: "PY", name: "PYRE", color: "#ff744a", dark: true, ticks: 600, tier: "uncommon", timed: true, blurb: "CLICK BURNS A BALL AS A BOMB" },
  // Stone, and the one material on the board nobody had taken. The roster is
  // 45 pills of hue and this is the first one with none: at 8 % saturation it
  // reads as grey to the eye, and grey is what is left when every quarter of
  // the wheel has been spent. 70 from MIRROR, ERODE and GLUE alike — the widest
  // gap on a 45-capsule board — 4.48:1 against the darkest field theme, and 97
  // from the nearest trap.
  //
  // **Not granite's own #857a6e**, which was the tempting answer: six capsules
  // already wear a brick's exact colour by the game's original design, and a
  // capsule about bricks crumbling into stone belongs in that tradition. It
  // measures worse on both rules that matter — 63 from GLUE against this one's
  // 70, and 3.68:1 against the field against this one's 4.48 — and 21 RGB is
  // already near enough to read as the same rock without spending the margin
  // to be it.
  //
  // The letter is light at 3.44:1 rather than dark at 5.60, which is the one
  // measurement here that does not take the better number. Luminance 0.255 sits
  // in the gap the registry's `dark` note describes, and GLUE (0.230, light
  // letter, 3.75:1) is the precedent for a mid-value body on this board: a pill
  // is read as a shape with a letter in it before it is read as a letter, and
  // the light one keeps it in the family of everything else that is not a
  // yellow or an orange.
  { id: "GR", name: "GRAVEL", color: "#8a8c78", dark: false, ticks: 720, tier: "common", timed: true, blurb: "KILLS CRUMBLE · CATCH THE BITS" },
  // Verdigris, which is what heavy bronze actually turns into and the one
  // honest colour left for a capsule about weight: the warm quarter that owns
  // impact — BLAST, BOMB, METEOR, PYRE — has been full since PYRE took its last
  // opening, and a fifth orange would have been the demolition capsule nobody
  // could tell from the other four.
  //
  // Measured rather than picked. 73 from GRAVEL and XWIDE, the nearest bodies
  // on a 46-capsule board; 4.25:1 against the darkest field theme, which is
  // room rather than the 3:1 floor two candidates sat on; 52 from the nearest
  // speck. The nearest trap is 107 away, and that is the measurement that
  // decided it over the olive and the bronze that scored similarly: this
  // capsule takes a hole out of the wall, and one the player reads as a trap
  // while it falls is one they let go.
  { id: "GI", name: "GIANT", color: "#469292", dark: false, ticks: 480, tier: "rare", timed: true, blurb: "A HUGE BALL CRUSHES A PATCH" },
  // Olive drab, which is the colour ammunition comes in and the widest opening
  // left on a board this full. Swept rather than picked: 70.2 from MULTI, 70.7
  // from GRAVEL, 72.0 from FUSE and 74.5 from GLUE against the 58 bar, 3.88:1
  // against the darkest field theme, and 95 from the nearest speck.
  //
  // **The two colours that measured better were both refused on contrast.** A
  // true olive drab (#556b2f) reaches 91.7 from FUSE — the widest gap anywhere
  // on the board — and reads at 2.59:1 against the darkest theme, which is under
  // the rule and not a matter of taste; #5a6b3a reaches 85.1 and fails the same
  // way at 2.64. This is the brightest point in that family, and the first one
  // that clears 3:1 with room rather than sitting on the floor of it.
  //
  // The nearest trap is DEMAKE at 139, the widest trap margin on the board. That
  // is the measurement that decided it over a cerise that scored similarly: this
  // is a capsule you want reached for, and one the player reads as a trap while
  // it falls is one they let go.
  //
  // A common, and the tier is the whole of what that means now — SHA-148's bag
  // gives `uncommon` and `rare` the same single ticket, so the only frequency
  // choice left is two tickets or one. A capsule whose job is to stop you losing
  // a ball has to be met while you are still learning to read one.
  { id: "TR", name: "TRACER", color: "#688a3a", dark: false, ticks: 600, tier: "common", timed: true, blurb: "THE BALL SHOWS WHERE IT LANDS" },
  // Lime jelly, which is the colour the capsule is about and not a coincidence
  // worth apologising for. The green quarter holds thirteen pills and is still
  // open for the reason SNAP's own note gives: what is crowded there is the
  // *hue* and not the value, and those thirteen sit at thirteen luminances.
  // This one lands fifth from the top, under BANANA, STASIS, GHOST and NUKE and
  // over the other eight.
  //
  // Measured on a 49-capsule board rather than picked, and it measures better
  // than the crowding suggests: 72 from MAGNET, 73 from CRITTER and 74 from
  // STASIS against the 58 bar, 12.2:1 against the darkest field theme — four
  // times the floor — 124 from the nearest speck, and 104 from the ball. The
  // nearest trap is BANANA at 78, and the 42 deg of hue between them does the
  // rest: BANANA is acid yellow and this is a proper green.
  //
  // **The three colours that looked better all failed the 58 bar**, which is
  // what the green quarter being crowded actually costs. A mint (#8cfcc4)
  // lands 26 from STASIS — it *is* STASIS — and a sea green (#7cf0a0) 40 from
  // MAGNET. A brighter spring (#a8ff7a) is the near miss worth recording: 57
  // from CRITTER, under the bar by one, and 58 from BANANA exactly, which is a
  // trap sitting on the floor of the rule. Pale spring green at hue 114 is the
  // one point in the family that clears everything at once.
  { id: "JE", name: "JELLY", color: "#98fc8c", dark: true, ticks: 600, tier: "uncommon", timed: true, blurb: "RIPPLES CROSS · BRICKS BURST" },
] as const satisfies readonly PowerUpDefinition[];

export type PowerUpKind = (typeof POWER_UPS)[number]["id"];

const ALL_NAMES: readonly string[] = POWER_UPS.map((definition) => definition.name);

/**
 * Builds a `Record` keyed by capsule id from one field of each definition —
 * every lookup below, and `DROP_COLORS` in `@render/palette`, is one call.
 *
 * The assertion is the module's only one and the reason this helper exists:
 * `Object.fromEntries` is typed to widen to `Record<string, T>` however precise
 * its input keys are. Each record is built once at load, so nothing downstream
 * allocates per frame or per roll.
 */
export function byId<T>(pick: (definition: PowerUpDefinition) => T): Record<PowerUpKind, T> {
  return Object.fromEntries(POWER_UPS.map((definition) => [definition.id, pick(definition)])) as Record<PowerUpKind, T>;
}

export const POWER_UP_BY_ID: Record<PowerUpKind, PowerUpDefinition> = byId((definition) => definition);
export const POWER_UP_NAMES: Record<PowerUpKind, string> = byId((definition) => definition.name);
/**
 * What `drawCapsule` paints on the pill: **the first two letters of the name**,
 * and more only where two names would collide — MIRROR and MIMIC both open on
 * `MI`, so both go to three; BLAST and BLACKOUT still collide at three, so both
 * go to four. Only the colliding group lengthens.
 *
 * One letter stopped meaning anything around the fifteenth capsule: three names
 * open on B and three on P, and a lone `B` said nothing about which. The glyph
 * is separate from the id because ids are load-bearing in the game's
 * `kind === "..."` branches and renaming them buys the player nothing.
 *
 * Derived rather than authored because the rule is a property of the whole
 * roster, not of one row: adding MIMIC has to lengthen MIRROR in the same
 * breath, and a hand-typed column would be wrong the day that lands. Longer
 * glyphs cost a font tier, not a broken sprite — `dropGlyphFont` picks a size
 * that fits the pill by measuring it.
 */
export const POWER_UP_GLYPHS: Record<PowerUpKind, string> = byId((definition) => glyphFor(definition.name));
export const POWER_UP_DURATIONS: Record<PowerUpKind, number> = byId((definition) => definition.ticks);
// Tickets per capsule: tier-derived for 47 of the 49 rows, and two kept back.
//
// There were three weight exceptions — DEMAKE, VORTEX and GIANT — each promoted a
// class because it was "landing too rarely to enjoy". The instinct was to retire
// all three along with the weighted roll that made them necessary, on the grounds
// that a guarantee beats a bigger number. For DEMAKE and GIANT that was wrong,
// and the short-run table above is why: both already draw at a common's weight
// *in production*, and handing them a rare's single ticket would have quietly
// revoked visibility the player has today in exchange for a promise about level
// ten. A capsule the user has twice said they never see is the last place to
// spend that.
//
// So both keep a common's count, which puts them at 3.23 % a draw against the
// 3.05 % they have live — better at every horizon rather than better eventually —
// and they still inherit the cap the whole bag gets. The tier stays as authored
// on both rows: the CAPSULES screen says how special a capsule is and this table
// says how often the wall hands it over, and those two have been allowed to
// disagree since DEMAKE.
//
// **VORTEX's exception is genuinely gone**, and it is the one that was only ever
// arithmetic: `uncommon`'s 0.6 was 1.83 % a roll, a rare's ticket is 1.61 % a
// draw, and two tenths of a percent is not worth a named row when the bag hands
// it a bound no weight could.
export const POWER_UP_DROP_TICKETS: Record<PowerUpKind, number> = {
  ...byId((definition) => TIER_TICKETS[definition.tier]),
  D: TIER_TICKETS.common,
  GI: TIER_TICKETS.common,
};

// Roster order, which is the order the console prints, `DropBag` fills itself
// from and the POWER inset lists live effects in.
export const POWER_UP_IDS: readonly PowerUpKind[] = POWER_UPS.map((definition) => definition.id);

export const TIMED_KINDS: readonly PowerUpKind[] = POWER_UPS.filter((definition) => definition.timed).map(
  (definition) => definition.id,
);

// The capsules that hurt, which is exactly the `trap` tier. Read by the blinking
// glyph in `drawDrop`, the pink catch pop and the pickup womp — the three things
// that have to say "trap" before and as the paddle takes it.
export const MALUS_KINDS: ReadonlySet<PowerUpKind> = new Set(
  POWER_UPS.filter((definition) => definition.tier === "trap").map((definition) => definition.id),
);

/**
 * Every face GAMBLE's reel can show, and every result it can land on.
 *
 * Derived here rather than in the game, because two places have to agree about
 * it — the reel itself and the dev console's `gamble` pin — and a hand-kept copy
 * in either would be wrong the day a capsule is added.
 *
 * Two exclusions. **GAMBLE itself**, so applying a result can never re-enter the
 * reel. And **the traps**, because a lottery the player cannot stop may not
 * punish them for playing it: catching a capsule that shrinks the deck is a
 * decision they made, and the same thing arriving out of a drum they had no hand
 * in is only the game taking a turn against them.
 *
 * **DEMAKE is the one trap that stays on the drum**, by the user's call and for
 * the reason its own README paragraph gives: it is the trap that costs nothing
 * but nerve. The machine drops to a 1-bit tube for eight seconds and the
 * simulation underneath is untouched — same ball, same deck, same score — so it
 * is a gag the reel can hand you without the reel having cost you anything.
 * BLACKOUT and FLIP are presentation-only in the same way and are *not* here:
 * both genuinely take the ball away from you while they last.
 */
export const GAMBLE_FACES: readonly PowerUpKind[] = POWER_UP_IDS.filter(
  (kind) => kind !== "GB" && (kind === "D" || !MALUS_KINDS.has(kind)),
);

// The shortest opening of `name` that no other capsule shares, never under two.
// Bottoms out at the whole name, which two names can only tie on if one is a
// prefix of the other — the DEV legibility pass says so out loud if that ever
// happens, since there is no length that would separate them.
function glyphFor(name: string): string {
  return glyphAgainst(name, ALL_NAMES);
}

/**
 * The rule itself, over whatever field of names it is handed.
 *
 * Exported for the combo table (SHA-64), which runs its own names through it
 * against the capsules *and* the combos, so a fusion never wears a capsule's
 * opening. That call passes a wider field than this one does, and deliberately:
 * only the combo may lengthen, because a capsule's pill is what the player
 * learns and a combo — which never falls — may not move it.
 */
export function glyphAgainst(name: string, names: readonly string[]): string {
  let length = 2;
  while (length < name.length && names.filter((other) => other.startsWith(name.slice(0, length))).length > 1) {
    length++;
  }
  return name.slice(0, length);
}
