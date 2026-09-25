# The observer, five veils — counter-design

**Date**: 2026-09-17
**Status**: design proposal, written from a playable mockup. It answers the 16 September draft (`2026-09-16-observer-universe-design.md`) and asks the owner to arbitrate between the two where they disagree (section 1). Every number is the mockup's and is a starting value; every look is what the mockup draws and is open to a better drawing.
**Spec of record**: the Claude Design mockup `SHATTER Observer v2.dc.html`. Its embedded script is the reference implementation of every rule below; the appendix says where each rule lives in it. Console shortcuts in the mockup: **N** next veil, **B** open the eye now; the Tweaks panel's _Start veil_ picks the first veil.
**Audience**: the owner, then Claude Code, then the tickets cut from the arbitrated version.
**Language of the mockup's copy**: English, in the house voice — capitals, one word where one will do.

## 1. Where this differs from the 16 September draft

The draft's chamber — four particle species, side ports, the clock and the bag (its sections 5, 6, 10, 11) — **stands as written** and is not repeated here. The disagreement is about who the observer is and where the eye lives.

| Decision     | 16 September draft                                                                     | This document                                                                                                                                                                                                                          | Why                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Who observes | You. The wall collapses under measurement.                                             | You — and **something observes you back**. The Observer is one eye, present on five levels, and the run's antagonist.                                                                                                                  | A premise the player never sees is a README. An eye that watches the ball, blinks, weeps and finally hunts is a premise on the field.   |
| The monsters | Four particles through side ports.                                                     | The particles **and** the Observer's **brood**: eggs it lays that hatch and take wing when struck.                                                                                                                                     | Devil's Crush's lesson is a table that fights back and _changes_ when hit. Particles scatter; the brood mutates. Both earn their place. |
| The eye      | A boss interlude after every sixth clear, built from the EYE level's bricks, one look. | **Five levels** — THE VEIL, THE IRIS, THE TEAR, THE WRATH, THE LID — spaced through the loop. The eye sits in a different place, at a different size, doing a different thing on each. THE LID is the loop's last level and the fight. | The owner played five identical eyes and named it: wallpaper. A recurring antagonist has to be staged, not repeated.                    |
| Additive     | No existing level, capsule, background or panel element changes.                       | **Kept**: the veils are five _new_ levels, one new background, one new brick kind, three new panel readouts. Nothing that exists is edited.                                                                                            | —                                                                                                                                       |
| Score        | As is.                                                                                 | A **chain multiplier** on everything the ball hits between two deck touches, and an eight-digit readout.                                                                                                                               | The pinball fantasy is the long volley. Without a chain the brood is décor.                                                             |

## 2. The premise

**You are the observer, and so is it.** Behind the lattice an eye has been watching the chamber since before the first brick was measured. Break the wall and you see it; see it and it sees you. It blinks at the ball. It hunts it with its gaze. It weeps eggs. It rebuilds what you collapse. And at the end of the loop it seals itself under a bronze lid — break the seal, and the pupil leaves the socket to come for you. Blind it and the sky is yours: a diadem of six stars lit over its socket, one for each of its creatures you sent back.

## 3. House rules kept, and two bent

Kept from the draft: the ball's silhouette is sacred; everything arrives and leaves with a fade; everything acts on the field; a latent threat wears its cue on itself; area tones darker than sprites; nothing new is yellow; every sprite has a DEMAKE tell; one plain knob per number; text measured in pixels.

Bent, with reason:

- **The panel names capsules only** → the panel gains three readouts (CHAIN, OCULI, DIADEM). They are score state, not power state, and score state has always lived on the panel. The POWER inset is untouched.
- **No floating labels for field points** → the chain pops a label (`x4 1600`) **only while the multiplier is above one**. At ×1 the field is as silent as BUMPERS. The pop is the multiplier's tell; without it the chain is a number nobody watches.

## 4. The veils — five levels

### 4.1 Placement in the roster (fixed by this proposal, open to the tickets)

| Veil      | After  | Position in a 43-level loop | Neighbours' themes                                     |
| --------- | ------ | --------------------------- | ------------------------------------------------------ |
| THE VEIL  | BOLT   | 9                           | circuit / vault                                        |
| THE IRIS  | COOL   | 18                          | circuit / vault                                        |
| THE TEAR  | PLAY   | 27                          | circuit / grid                                         |
| THE WRATH | EYE    | 38                          | nebula / horizon — the portrait, then the thing itself |
| THE LID   | FINALE | 43, the loop's last         | starfield / horizon (wrap)                             |

All five paint the new background **`observer`** (starfield with a dim zodiac ring centred on the eye's socket); `check:backgrounds` passes because no veil is adjacent to another. Ball speed is the loop's, as on any level. After THE LID the loop wraps to SUNRISE as today; whether the eye grows back on the second loop, and harder, is a later ticket.

### 4.2 The definition

`LevelDefinition` gains an optional block; a level without it is a level as today.

```ts
observer?: {
  mode: "veil" | "iris" | "tear" | "wrath" | "lid";
  eye: { x: number; y: number; hw: number; hh: number };   // socket centre, half-width, half-height
  tint: "blue" | "red";
  hint: string;                     // one line under the serve prompt, e.g. IT PEERS THROUGH THE STONE
  brood?: { x: number; y: number; form: 0 | 1 | 2 }[];    // eggs pinned on the band, like SUPER MAZE's drops
  diadem: [number, number][];       // six star points, an arc under the socket
  oculi?: false;                    // THE LID has none
};
```

### 4.3 The five walls

```
THE VEIL      5555GGGG5555    THE IRIS      GG.GGG.GGG.G    THE TEAR      .....GGGGGGG
              4444SSSS4444                  5S.S5S.S5S.S                  .....4444444
              33.3S..S3.33                  ............                  .....33S3S33
              22.2S..S2.22                  ............                  .....22S2S22
              1111SSSS1111                  3..........3                  .....1111111
              .GG......GG.                  2S........S2                  ......SS..SS

THE WRATH     SS.SSS.SSS.S    THE LID       ..LLLLLLLL..
              5G.G5G.G5G.G                  .LLLLLLLLLL.
              444444444444                  SLLLLLLLLLLS      L = the lid's bronze, new kind
              3.3.3.3.3.3.                  SLLLLLLLLLLS      the seal: rows 1..4, cols 4..7
              222222222222                  .SLLLLLLLLS.
              .1.1.1.1.1.1                  ..SSLLLLSS..
```

One layout rule: **no oculus sits behind more than one hit of brick** (THE VEIL's are under `5`s; the gaps in THE IRIS and THE WRATH are cut for them; THE TEAR's first is in open sky). An oculus under gold is a dig nobody makes.

## 5. The eye

### 5.1 The body — look open, staging fixed

An almond drawn on the canvas _behind_ the wall: sclera `#dbe4ff` / `#c7d2f5`, a bronze rim `#7a5a08` with a gold lash line `#dfae2c`, an iris of radius 0.8·hh in the veil's tint, a pupil of radius 0.34·hh in `#05050f` with a 2 px glint. It is not matter: the ball passes over it. It is the one thing on the field that **looks at the ball** — the iris slides toward the nearest live ball (0.4 of the horizontal offset, 0.22 of the vertical, clamped to the sclera) and back to the deck when no ball is live. It **blinks** for 14 ticks every 180–440 ticks. While the eye is open (section 8) the iris turns gold.

| Veil      | Socket (x, y) | Half-size (hw, hh) | Where it is                                        | What the player sees                                                                  |
| --------- | ------------- | ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| THE VEIL  | 186, 72       | 42 × 15            | behind the wall's centre                           | glimpses of an iris through the holes; it is found, not shown                         |
| THE IRIS  | 186, 100      | 116 × 38           | bare, the whole upper field                        | only two rows of brow remain above it                                                 |
| THE TEAR  | 46, 62        | 62 × 23            | the top-left corner, cut by the frame              | tear tracks under the lid; the wall is pushed right, leaving a corridor for the tears |
| THE WRATH | 186, 292      | 84 × 30            | below the rail, behind the deck                    | red iris, veins across the sclera; it looks up at the ball from under your feet       |
| THE LID   | 186, 74       | 120 × 27           | a shut slit across the width, under the lid bricks | it does not blink; the slit shows at both ends of the lid                             |

The zodiac ring (radius 86, dashed, twelve ticks) is baked into the background around the socket, so the eye has a place even before the wall reveals it.

### 5.2 THE VEIL — it watches

Nothing acts. The eye tracks and blinks. This is the introduction: the brood (section 6), the chain (7), the oculi (8), the diadem (10) are all met here against a plain eye. Three eggs pinned on the band.

### 5.3 THE IRIS — the gaze petrifies

| Phase  | Ticks | On the field                                                                                                                          |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| idle   | 330   | —                                                                                                                                     |
| charge | 45    | a ring pulses white / gold on the pupil (held cue)                                                                                    |
| fire   | 50    | a 6 px beam from the pupil to the rail, `#e8384f` / `#8e1220` flicker with a `#fff9d0` core, tracking the deck's centre at 3 % a tick |

If the beam crosses the deck while it fires, the deck is **PETRIFIED for 70 ticks**: it cannot move, it is drawn as grey stone (`#8f9ac8` body, cracks in `#1b2244`), and it _still returns the ball_ — the punishment is the lost steering, not a lost life. A label PETRIFIED pops once; the field shakes five ticks. The beam does nothing to the ball.

### 5.4 THE TEAR — its tears hatch

Every 270 ticks (first at 200) a **tear** — a 5 × 8 drop in `#63b0ff` / `#a8d8ff` — leaves the lower lid under the pupil and falls: 0.6 px a tick, +0.012 a tick, capped at 1.7. Struck by a ball or a laser bolt in the air it bursts for 600 points and a chain hit. Reaching y 236 it **hatches**: an egg (form 0 of the brood) appears at that x on the band with a white flash and a HATCHED pop. The brood's cap is 5 on this veil. The wall is pushed to the right five columns so the tears have a corridor down the left; two eggs pinned.

### 5.5 THE WRATH — each blink rebuilds

The iris is red. On every blink the Observer **rebuilds one brick**: a random hole of the level's own layout is refilled with a brick of its original kind at **one hit point whatever the kind — scar tissue**, born with a 16-tick white flicker. Only holes are rebuilt; the clear condition is untouched, and a wall whose last brick dies clears before the next blink can rebuild. The rhythm is the eye's own blink clock, so a player who learns the blink learns the rebuild.

### 5.6 THE LID — the seal, the waking, the loose pupil

**Shut.** The eye is a slit (open 0.08) with no blink. The wall is the **lid**: the new brick kind `L` (two hits, 250 points, never a capsule, bronze `#c9a24a` / `#ffe9a0` / `#7a5a08`, a rivet line for its kind mark) with a silver rim. There are no oculi and no opening on this veil; the panel's OCULI pips are dark.

**The seal** is the 16 cells at rows 1..4, columns 4..7. Killing the **tenth** of them wakes the Observer: the field shakes 12 ticks, IT WAKES pops over the socket, the slit opens wide, the socket is **empty and red**, and the **pupil leaves it**.

**The loose pupil** is a disc of radius 15 in `#05050f` with a `#55000f` rim, six red spokes turning slowly around it, and the glint. It bounces inside x ∈ [3+17, 369−17], y ∈ [122, 232] at 1.1 px a tick, **+0.045 for every hit taken**. It reflects the ball off its surface (BUMPERS' disc reflection). Every hit is 4000 points and a chain hit, a white ring flash, and a 5-tick shake. It also **fires the gaze** (5.3) from wherever it is, idle 220. It takes **24 hits**. The remaining lid bricks are irrelevant once it is loose: on THE LID the level ends when the pupil dies, not when the grid is empty.

**The end.** Twenty-four hits and THE OBSERVER IS BLIND: a card over the field (section 11), 250,000 points plus 25,000 a lit star, then the loop wraps. A lost ball during the fight costs a life as anywhere; the pupil stays loose through the serve. The fight has no timer: a loose pupil that keeps speeding up is its own clock.

## 6. The brood — beasts that mutate

**A creature that changes when you hit it, which is the whole Devil's Crush inheritance.** Eggs are pinned on the band by the level (2–3 a veil) or hatched from tears. A beast walks a fixed height along the band, turning at the side walls; a ball or a bolt that reaches it reflects vertically and **advances it one form**:

| Form | Name      | Size    | Speed          | Points a hit | Motion                                |
| ---- | --------- | ------- | -------------- | ------------ | ------------------------------------- |
| 0    | EGG       | 16 × 12 | 0.32 px / tick | 400          | drifts, bobs 1.5 px                   |
| 1    | HATCHLING | 20 × 14 | 0.80           | 800          | trots, two frames every 12 ticks      |
| 2    | WYVERN    | 28 × 14 | 1.45           | 1500         | flies, wings every 6 ticks, bobs 3 px |
| —    | the kill  | —       | —              | 5000         | lights one star of the diadem         |

Each form flashes white 8 ticks when struck and is re-centred on the previous form's centre. Cap 3 per veil (5 on THE TEAR). Palettes: egg in nebula blues (`#12276a` / `#1d47a8` / `#63b0ff`), hatchling in the greens (`#155c1f` / `#3fbf4f` / `#a6f0a6`, red spine), wyvern in the reds (`#55000f` / `#e8384f` / `#f07d10`, white eyes). **None is yellow.** DEMAKE tells: the egg's oval, the hatchling's legs, the wyvern's span. The bitmaps are ASCII in the mockup and are the sprites to refine, not to redraw from scratch.

The brood and the chamber's particles share the band. The caps are what keep it legible; if a picture shows five beasts and three particles as noise, the brood's cap drops before anything else does.

## 7. The chain

**Every hit between two deck touches is a link.** Bricks, beasts, tears, oculi, the pupil: each adds one. The multiplier is `1 + floor(chain / 3)`, capped at **×8**, applied to every point the ball earns. The deck breaks the chain to ×1; a lost ball does too. The panel's CHAIN inset shows `NN HITS` and the multiplier in a colour that climbs `#8fd0ff → #3fbf4f → #ffcf1c → #f07d10 → #e8384f`; the deck's blue core turns gold above ×3. Above ×1 every gain pops `x4 1600` at the hit. The best chain of a run is shown on GAME OVER.

Open: how the chain stacks with PAYDAY and TURBO (the mockup has neither). Proposed: the chain multiplies first, the gild multiplies the result.

## 8. The oculi and the opening

Three bronze **oculi** — plaques 20 × 14 at y 16, x 52 / 176 / 300, marked I · II · III — sit in the sky between the frame and the wall. **They must be struck in order.** The next one blinks gold; a hit on it pays 1500 and a chain link; a hit out of order resets all three with a low rasp. The third **opens the eye**: one star lights, the iris turns gold, and a 52 px gap parts in the top frame above the socket (clamped to the field) for **600 ticks**, its edge running red-orange-gold with a thin bar counting down. A ball through the gap goes **inside** (section 9). When the window closes unused, the oculi reset.

## 9. Inside the eye

**The field becomes the iris.** The whole canvas is a baked iris — bands and fibres in the veil's tint, a bronze lash line across the top — and the only thing in it is the **pupil**: radius 15, orbiting the centre (186, 100) on a Lissajous path (66 × 40, `sin(1.7t)`), faster with every hit. It reflects the ball; every hit is 3000 and a chain link; it takes **14 + 3·veil** hits. A bar across the top counts **1300 ticks**. Kill it: 60,000 points, **two stars**, and the eye spits you out to the serve of the veil you left, wall as you left it. Time out, or lose the ball: the same exit, **no life lost** — the eye spits you out — and the chain breaks. The chamber is empty inside; nothing else is in there with you.

## 10. The diadem

Six dark stars in an arc under the socket, positioned per veil. A star lights for: a beast killed (one), the oculi completed (one), the pupil killed inside (two). Lit stars twinkle and join their neighbours with a dim bronze line, so a finished diadem is a constellation. At the clear each lit star pays **25,000**. The panel mirrors it as six pips and a `N/6` readout.

## 11. The words — open

| Where                   | Now                            | Proposed                                                                     |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| title tagline           | A BRICK BREAKER FOR ONE PLAYER | FIVE VEILS · ONE EYE · BLIND IT                                              |
| title wordmark sub-line | —                              | THE OBSERVER                                                                 |
| serve, on a veil        | CLICK TO LAUNCH                | above it, one line: THE IRIS · BARE AND HUGE · ITS GAZE PETRIFIES            |
| level clear, on a veil  | GRID CLEARED                   | VEIL BROKEN, over the veil's name, DIADEM N/6, BONUS                         |
| the opening             | —                              | THE EYE OPENS · SEND THE BALL UP (pulsing, mid-field)                        |
| inside                  | —                              | INSIDE THE EYE · STRIKE THE PUPIL (bottom line)                              |
| the waking              | —                              | IT WAKES pops; THE PUPIL IS LOOSE · BLIND IT (bottom line)                   |
| the blinding            | —                              | THE FIFTH VEIL FALLS / THE OBSERVER IS BLIND / THE SKY IS YOURS · DIADEM N/6 |
| game over               | GAME OVER                      | unchanged, plus BEST CHAIN NN · VEIL NN                                      |
| hall of fame            | HALL OF FAME                   | THE WATCHED                                                                  |
| panel, level row        | LEVEL                          | VEIL on a veil, LEVEL elsewhere                                              |
| panel, lives            | LIVES                          | unchanged (the mockup's COMETS was a conceit; the ball is the ball)          |

Veil hints, one each: IT PEERS THROUGH THE STONE · BARE AND HUGE · ITS GAZE PETRIFIES · IT WEEPS FROM THE CORNER · BURST THE TEARS · IT RISES BELOW · EACH BLINK REBUILDS · SEALED SHUT · BREAK THE SEAL, BLIND THE EYE.

## 12. The panel — three readouts, open

Under the lives rack: **CHAIN** (an inset: `NN HITS` left, `×N` right, 15 px), **OCULI** (three pips: dark, gold for the next, green for taken), **DIADEM N/6** (six pips). The mockup fits them in a 108 × 300 panel with the shortcuts line kept; the shipped panel carries more (the POWER inset, five reserve bars) and the fit is the first thing to check against it. If it does not fit, the oculi pips go first: their state is already on the field.

## 13. The sounds — open, thirteen recipes

| Event                    | Character                                                |
| ------------------------ | -------------------------------------------------------- |
| chain step               | a short square note climbing 70 Hz a step                |
| beast struck / advanced  | a two-note rise, higher a form                           |
| beast killed             | a three-note arp up                                      |
| tear falls               | a sine drip                                              |
| tear bursts              | a high square pip                                        |
| egg hatches              | a low square knock                                       |
| oculus taken             | a note per oculus, rising                                |
| oculi reset              | a sawtooth rasp, low                                     |
| the eye opens            | a five-note arp up                                       |
| the gaze charges / fires | a sine ping, then a sawtooth drone the beam's length     |
| petrified                | a low sawtooth thud, long                                |
| a brick rebuilt          | a dull square knock                                      |
| the waking               | five low notes climbing; the blinding, six climbing high |

## 14. The knobs — defaults, one block `observer` in `GameConfig`

Points below are the mockup's, written for an eight-digit readout; **scale them to the roster's economy in one pass** (a brick is 60–250 there) rather than knob by knob.

| Group  | Knob                                   | Default                                                  |
| ------ | -------------------------------------- | -------------------------------------------------------- |
| eye    | blink length / next blink              | 14 / 180 + random 260 ticks                              |
|        | track factors x, y                     | 0.4, 0.22                                                |
|        | shut opening on THE LID                | 0.08                                                     |
| chain  | hits a step / cap                      | 3 / ×8                                                   |
| brood  | forms                                  | 16×12 @0.32 / 20×14 @0.80 / 28×14 @1.45 px·tick⁻¹        |
|        | points a form / kill                   | 400, 800, 1500 / 5000                                    |
|        | cap / cap on THE TEAR                  | 3 / 5                                                    |
| oculi  | plaques                                | 20 × 14 at y 16, x 52 · 176 · 300                        |
|        | points / window / gap                  | 1500 / 600 ticks / 52 px                                 |
| inside | pupil radius / hits / timer            | 15 / 14 + 3·veil / 1300 ticks                            |
|        | orbit / speed                          | 66 × 40 Lissajous / 0.018 + 0.0035 a hit + 0.002 a level |
|        | points a hit / kill / stars            | 3000 / 60,000 / 2                                        |
| gaze   | idle / charge / fire                   | 330 (220 loose) / 45 / 50 ticks                          |
|        | beam width / tracking / petrify        | 6 px / 0.03 / 70 ticks                                   |
| tears  | first / interval                       | 200 / 270 ticks                                          |
|        | fall / floor / burst points            | 0.6 +0.012·tick, max 1.7 / y 236 / 600                   |
| wrath  | rebuilt a blink / hit points / flicker | 1 / 1 / 16 ticks                                         |
| lid    | kind L / seal / wake                   | 2 hits, 250 pts / rows 1–4 × cols 4–7 / 10 kills         |
|        | pupil hits / speed / bounds            | 24 / 1.1 + 0.045 a hit / y 122..232                      |
|        | points a hit / blinding                | 4000 / 250,000 + 25,000 a star                           |
| diadem | stars / points a star at clear         | 6 / 25,000                                               |

## 15. The console — fixed

Three words in the test console's grammar, one legend line each: `veil <1..5>` builds that veil now; `open` opens the eye (the oculi are taken); `wake` breaks the seal on THE LID. The mockup's **N** and **B** keys are these words' prototypes and are removed when the words ship.

## 16. Build order

| Step                     | What ships                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1. The chain             | multiplier, pops, CHAIN inset, best chain on GAME OVER — playable on every level today                              |
| 2. The eye               | `observer` block, `observer` background, the drawn eye with tracking and blink, THE VEIL in the roster, `veil` word |
| 3. The brood             | three forms, pins, the kill, the diadem and its pips                                                                |
| 4. The oculi             | the three plaques, the order, the opening, `open` word                                                              |
| 5. Inside                | the iris field, the pupil, the timer, the two exits                                                                 |
| 6. THE IRIS              | the gaze, PETRIFIED                                                                                                 |
| 7. THE TEAR              | tears, bursting, hatching                                                                                           |
| 8. THE WRATH             | the rebuild on the blink                                                                                            |
| 9. THE LID               | kind L, the seal, the waking, the loose pupil, the blinding card, `wake` word                                       |
| 10. The words and sounds | sections 11 and 13                                                                                                  |
| 11. Docs                 | README premise paragraph, the bestiary's brood entries, the architecture page                                       |

Steps 1–5 are one system met on THE VEIL; 6–9 are one veil each and can be cut, reordered or replaced by a better idea without touching the others.

## 17. Verification — fixed

As the draft's: `pnpm typecheck`, `lint`, `fmt:check`, `build`, `check:backgrounds`, `check:drops` green per step, then walked in a real Chrome through the console words, then the owner's QA. One step In Progress at a time.

## Appendix — the mockup as code

`SHATTER Observer v2.dc.html`, the logic class, by rule:

| Rule                                    | Where                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| the five veils, staging, layouts, hints | `LEVELS`                                                                                                 |
| brick tones and hit points, kind `L`    | `COLORS`, `HP`                                                                                           |
| brood forms and bitmaps                 | `FORMS`, `BM`, `PAL`; `stepBeasts`, `hurtBeast`, `drawBeasts`                                            |
| the eye                                 | `drawEye` (tracking, blink, tints, veins, tear tracks), `blinkOpen`, `eyeTarget`                         |
| the gaze                                | `stepGaze`, `drawGaze`; petrify in `onMove` and `drawPaddle`                                             |
| tears                                   | `stepTears`, `burstTear`, `hatch`, `drawTears`                                                           |
| the rebuild                             | `regen`, called from the blink in `step`                                                                 |
| the seal and the loose pupil            | `damage` (seal count), `wake`, `stepFinal`, `hurtFinal`, `drawPupil`                                     |
| the chain                               | `gain`, `bumpChain`, `breakChain`; pops in `drawPops`                                                    |
| the oculi and the opening               | `SIGILS`, `sigilAt`, `hitSigil`, `openGate`, `drawSigils`, `drawGate`                                    |
| inside the eye                          | `enterBonus`, `stepBoss`, `hurtBoss`, `exitBonus`, `bakeIris`                                            |
| the diadem                              | `lit`, `drawDiadem`, `starPips`                                                                          |
| the deck                                | `drawPaddle` — bronze crescent, red gem tips, blue core (gold above ×3), thrusters; stone when petrified |
| screens and copy                        | the template's `sc-if` blocks: Titre, Pause, Voile brisé, Fin, Game over, Scores                         |

**Tones this proposal adds**: lid bronze `#c9a24a` / `#ffe9a0` / `#7a5a08`; panel bronze `#2a1d0c` with `#c9a24a` labels; sclera `#dbe4ff` / `#c7d2f5`; egg blues `#12276a` / `#1d47a8` / `#63b0ff`; wyvern `#55000f` / `#e8384f` / `#f07d10`; tear `#63b0ff` / `#a8d8ff` / `#1d47a8`. Everything else is a brick, frame or capsule tone the game already has.
