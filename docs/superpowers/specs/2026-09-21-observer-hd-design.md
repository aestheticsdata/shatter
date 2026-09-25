# The Observer in HD

SHA-225, under the HD pass (SHA-214). Part A — the shipped game on the fine grid — landed in SHA-215…224 and SHA-227 and is measured in `2026-09-20-hd-pixel-art-pass-design.md`. This is Part B measured the same way: the handoff's `SHATTER Observer HD.dc.html` held against the Observer that actually ships, object by object.

**Nothing here is implemented.** The ticket asked for the spec first, and for a reason: the bundle's Observer art was drawn against a design that has been superseded three times, and cutting it as drawn would put a beautiful eye on half the things that are on screen.

The two rules carry over unchanged. Nothing that ships is dropped; classic stays intact behind `ART_MODE`. And the third, which Part A earned: **every intermediate tone is `mix()` of two palette tones**, so the derived tones inherit their DEMAKE role by construction (SHA-223) and no recipe here says a word about the tube.

## What the bundle is drawn against

Part B is `2026-09-17-observer-veils-design.md`: five veils with one socket each, the zodiac wheel baked into the field, the brood's three forms, the oculi plaques, the diadem, the gate, the loose pupil, the Chariot. Three specs landed after it — `2026-09-18-observer-43-levels`, `2026-09-19-observer-one-eye-43-placements`, `2026-09-19-bestiary-and-bosses` — and the game moved with them.

What is on screen now, against what Part B knows about:

| Object              | Shipped                                                      | Part B                              |
| ------------------- | ------------------------------------------------------------ | ----------------------------------- |
| The eye             | 13 sockets in the game + the title's, hw 16…150, five states | one socket, 42 × 15                 |
| The dial            | on every level (SHA-212), drawn and turning                  | baked into the field, still         |
| THE CHART           | 54 junctions, the cage                                       | —                                   |
| Creatures           | 3 brood forms + the tear + 8 species, bosses by `doubled()`  | the 3 brood forms + the tear        |
| Oculi, diadem, gate | as drawn                                                     | as drawn — and at the same sizes    |
| Inside the eye      | two irises, the field replaced for 22 s                      | `bakeIris`, richer than the shipped |
| The gaze, the pupil | as drawn                                                     | as drawn                            |
| The Chariot         | does not exist                                               | a full recipe                       |

So Part B covers about half of the Observer, over-specifies one thing that was never built, and disagrees with the shipped drawing in three places. Its recipes are not wasted — the sclera/iris/pupil stack, `scale3x`, the oculi plates and the gate all apply — but they have to be measured before they are cut.

## The eye is a family, not a sprite

THE VEIL's socket is 42 × 15. Part B's eye is *that* eye: its offsets are absolute fine pixels off `HW = hw·3` and `HO = hhO·3` — rim at (HW+4, HO+3), four lashes at ±(HW−9) and ±(HW−27), corner tendons 9 × 3.

The game has fourteen sockets and THE VEIL's is the smallest of the five veils:

| Socket                                      | hw      | hh    |
| ------------------------------------------- | ------- | ----- |
| VORTEX, BOLT                                | 16      | 6     |
| SMILEY, PYRAMID, GATEWAY, CHOMP, HEART      | 20–44   | 8–16  |
| THE VEIL · THE TEAR · the title · THE WRATH | 42–84   | 15–30 |
| THE IRIS · THE LID                          | 116–120 | 27–38 |
| SUNRISE                                     | 150     | 60    |

A factor of nine in width and ten in height. Put Part B's lashes on SUNRISE — HW 450, so ±441 and ±423 — and all four stand in the outermost nine game pixels of a brow three hundred pixels across: four hairs bunched at the corners of a face. Put its rim on VORTEX — HW 48, a four-fine-pixel rim — and the rim is a third of the eye.

The shipped code already solved this once, and says so at `EYE_LASHES`: *"Fractions rather than pixels so they sit in the same places on a 42px eye and on a 120px one."* That is the rule, and it is the rule for every feature Part B gives an absolute offset to.

**Every feature of the almond is a fraction of the socket, with a floor of one fine pixel.** The floor is what `finePitch` is to the frame's rails and `NARROW_DECK` is to the deck: a drawing that is allowed to scale down has to be told where to stop, or the smallest instance loses the feature entirely. The one number the shipped eye did *not* give the treatment is the lashes' `rise` — 3 and 4 game pixels, absolute — which is why SUNRISE's brow has four stubs on it. It becomes a fraction with a floor here.

## The eye stays drawn

Part B bakes the sclera per `(hw, hhO)`. It cannot, and the argument is `drawBrick`'s from Part A, arriving at the same answer from a different direction.

Fourteen sockets, each with a rest lid and the eight-to-fourteen distinct lids a blink passes through (`lid = max(2, round(hh · open))`, `open` walking the blink's fourteen ticks), is on the order of two hundred sprites. SUNRISE's is 900 × 360 fine pixels — 1.3 MB apiece — and `SpriteCache` has no eviction, so one level's eye would hold twenty megabytes for the length of a run. And the bake would only cover the white: the iris and the pupil track the ball every frame at `trackEase` 0.35, so the thing that moves is on top of the thing that was cached.

The eye is drawn, on the fine grid, like the wall.

If measurement says the largest socket does not fit the frame — and SUNRISE's scan is 361 fine rows where classic walks 121 game rows — the fallback is to bake **the rest state only**: one sprite per socket at `open = 1`, blitted on the 90 % of frames where nothing is blinking, with the scan kept for the fourteen ticks of the blink and the iris drawn over either. One sprite per socket is a key that is actually small and finite, which is the test Part A set.

## What the fine grid buys the almond

More than anything else in Part B, and it is worth being exact about why.

The lid's half-width at each row is `hw · (1 − t²)`, `t = dy / lid` — the parabola that gives an eye corners instead of a lens. `drawEye` carries a long note on the one place the mockup's staging did not survive being made small: across the top and round the corners that half-width jumps four and five pixels a row, so a single pixel at each row's end draws a *dashed* outline, and the shipped code paints each row's ends over the whole step from the row before to close it.

On the fine grid the same parabola is sampled three times as finely, and the step per row falls to a third. The staircase that the step-fill exists to hide is small enough to *be* the curve. This is SHA-215's argument exactly — the curve was always there, the grid was not — and the almond is the biggest thing in the game that is nothing but curve.

Two agreements worth recording, because they were reached twice independently: **gold above, bronze below** (the shipped brow-and-lid split; Part B's `#dfae2c` top three rows against `#7a5a08` bottom row), and the two ticks of rim past each corner that set the almond into something instead of floating it on the field (Part B's corner tendons, 9 × 3). Both stay, both get the fine grid's weight — the rim ticks are a game pixel tall today because a game pixel is the thinnest thing classic has, not because that is their thickness.

## The iris, the pupil, and the three states

Part B's iris is the better drawing and the fine grid is what makes it possible: an edge disc, a body disc at r−3 with a 50 % dither ring at r−1, 28 radial fibres from 0.42r to r−3 alternating inner and edge tones, and two dithered centres. The shipped iris scans rows, lays a two-pixel limbal ring at each row's ends, and puts a fibre on every fifth row where `(y + ix) % 5 === 0` — a good approximation of radial fibres by a renderer that could not draw them. Take Part B's.

**Keep the shipped bound.** `drawEye` keeps the whole iris disc inside the almond through `reachX` / `reachY` rather than clipping it to the lid, and the docstring says why: clipped, a 42 × 15 socket behind a wall leaves an arch of iris with the pupil jammed against the bottom edge — an eye reading as a lump rather than as a look. Part B clips. The cost of bounding is that a wide, shallow socket tracks mostly sideways, which is the truth about a wide, shallow socket. Nothing about the fine grid changes that trade.

The pupil takes Part B's round glint — `disc(c − 0.42·PR, c − 0.44·PR, max(1.5, 0.18·PR))` plus a secondary — in place of the shipped 2 × 2 block, which is a glint drawn by something with no discs. The `max(1.5, …)` in Part B's own formula is the floor rule stated one object early.

The three states, and one disagreement:

- **Weeping** (THE TEAR): Part B's two tracks and a bead are the shipped ones at three times the resolution. A tear track is water, so it goes to one fine pixel; the bead keeps a game pixel, because it is the thing being read.
- **Veined** (THE WRATH): Part B's four 2-px veins from the corners, taken. Fine pixels are what make a vein a vein rather than a scratch, and they are drawn over the white and under the glint, as they are now.
- **Hollow** (THE LID's waking): Part B draws a `#55000f` disc with a rim — a red pit. The shipped one fills the whole almond with a flat hollow tone. **The shipped reading wins:** the waking is the pupil having *left*, and a dark disc sitting where the pupil was is a pupil-shaped thing still in there. The fine grid gives it what it is missing instead — a dither deepening toward the middle, so the socket reads as having depth rather than as a hole cut in the field.

## Opacity, and the one thing that has no colour equivalent

Eight of the thirteen sockets are placed rather than veiled, and their disposition includes opacity: SUNRISE at 20 %, PYRAMID at 35 %, VORTEX at 60 %. In colour that is `globalAlpha` and it needs nothing. In DEMAKE there is no alpha, so the almond is painted whole onto a field-sized sheet and a halftone is cut out of it with `destination-in` — one dot in four under a third, two in four above.

The sheet is already right: it is `field.width * SCALE`, and `SCALE` *is* the fine grid. Nothing to size.

**The halftone's cell stays a game pixel.** The mask tile is `2·SCALE` square with `keep` of its four game-pixel cells opaque. Cutting it to fine pixels would make a 50 % mask into a checker at one third the pitch, which at any display scale near 1:1 is not a texture, it is a grey — and grey is the one thing a two-tone machine may not show. Same reasoning that keeps the bricks' kind marks in game-px blocks: the tube's grain is a game pixel wide because that is what makes it legible as grain.

## The dial, the chart, and the pitch trap

`drawZodiac` draws one dot per pixel of circumference, every frame, a little further round. SHA-211 already refused the handoff's baked, motionless wheel and said why: the dial is the one thing moving on the field before the ball is.

On the fine grid the circumference is three times as long, so it is three times as many dots — of one fine pixel each. The outer circle stops being a ring of 3 × 3 blocks and becomes a hairline, which is what a ruled circle on an instrument is. Twelve ticks across the band get the same treatment.

**The dash is a pitch, and the pitch has to be closed twice.** `dashOn: 4, dashOff: 2` is four pixels on and two off *along the circumference*. Step the circumference three times finer without touching the dash and the dial becomes a dotted line running at a third of its intended duty. It is `finePitch(gamePitch, keep)` from the deck (SHA-218), applied to an arc instead of a cylinder: 12 on and 6 off in fine pixels.

THE CHART's threads go fine with it. `drawPixelLine` is Bresenham in whole game pixels and carries a note saying it has to land on the grid the stars do — the premise holds, because the stars go fine too, and the constellation stops being a web of three-pixel cables and becomes a drawn chart.

One exception, and it is SHA-227's rail mark again: **the cage keeps a game pixel.** `barsOnly` paints the six diameters back over a veil's eye, and what they say is *you cannot get at this*. A cage of hairlines is a decoration. Width is the message for some marks and resolution is the message for the rest, and knowing which is which is the whole of this pass.

## The bestiary and the bosses

Part B's recipe is `scale3x` of the ASCII bitmaps at bake time. That is the house idiom, it is what `pix.ts` has carried since SHA-215, and SHA-227 used it in anger for CRITTER's grub. It applies unchanged, and the inventory is four times what Part B lists: the three brood forms (16 × 12, 20 × 14, 28 × 14), the tear (5 × 8), and eight species with two frames each.

**`scale3x` is applied to the bitmap the game would have drawn, whatever produced it.** A boss is `doubled()` of its species, a ceiling snail is `flipped()`, a grub walking the other way is `mirrored()`; all three produce a bitmap, and the art path takes it from there. One rule, and the transforms compose in any order without a second recipe. The thing to look at when it lands: on a doubled bitmap every cell is a 2 × 2 block, so Scale3x spends its rounding on the doubling's own corners rather than on the authored silhouette's — if a boss comes out softer than its species instead of bigger, that is where it came from.

Two details Part B does not have, because the things did not exist:

- **The flash has to be baked, not overridden.** `drawBitmap` takes an `override` keyed on the source character — the outline cools out of a white silhouette over eight ticks — and after `scale3x` there are no source characters left. So each species bakes three variants: plain, whole-silhouette white, outline white. Eight species × two frames × three flashes × two machines is 96 small sprites, which is a cache key that is small and finite, unlike the eye's.
- **The decorations are drawn, not baked.** `species.decorate` runs before the body — a spider's thread goes down before the spider — and a thread is one fine pixel, not three. The shadow under a beast is the other way round: six game pixels by one, and it stays a game pixel, because it is a shadow rather than a line.

## The plaques, the diadem, and the gate

**The oculi are the one place Part B's numbers are already the game's.** `OCULUS_WIDTH` 20 × `OCULUS_HEIGHT` 14 game pixels is exactly Part B's 60 × 42 fine plate, so its two-pixel chamfer, its edge and fill states, its one-pixel highlight and shadow lines and its four rivets drop on with no arithmetic at all.

One disagreement, and the shipped reading wins: Part B sets a Silkscreen numeral I/II/III in the plate; `drawOculi` draws tally strokes, and says why — a numeral rendered from a proportional face at this size is three grey smudges, and strokes survive the tube exactly. The fine grid does not touch that argument. The plate is still 20 × 14 game pixels and the tube is still two tones. Strokes, one fine pixel of relief added under them so they read as *cut* rather than painted, which is what a bronze plaque does.

The diadem's star is a seven-pixel cross with a 3 × 3 core, and its twinkle is a tone swap — except on the tube, where it is already a *size* swap, because one ink cannot say "dimmer". The fine grid lets both paths do both: arms that grow by fine pixels on the twinkle's clock, which is exactly what SHA-227's LEAP flashes bought — a continuous movement that could only arrive in whole game pixels was arriving in four visible steps.

The gate's march steps one four-pixel cell a frame. Part B's twelve-fine-pixel chevrons are those same four-pixel cells, so again the geometry matches; what changes is that the march can step a fine pixel a frame, giving twelve positions where there are four. The door stops jumping and starts running. The countdown bar under it keeps its game pixel: it is a readout.

## Inside the eye

`IrisLayer` is the one field surface SHA-221 did not reach. `BackgroundLayer` grew a `size(canvas, hd)` and put the art into every cache key; `IrisLayer` still sizes its canvases at the field's own dimensions and hands `paintIris` a classic brush. The port is those same three changes, and `paintIris` already draws through `BackgroundBrush`, so the verbs come with it.

The picture wants it. The limbal ring is four game pixels; the eight bands are discs; and the 28 fibres step the radius by whole game pixels from 40 to 100, which on the fine grid leaves them three fine pixels wide — 28 spokes rather than 28 fibres. They want `finePixel` at a fine radial step, which is 180 steps instead of 60 and is the same fix the dial's circumference gets.

Part B's `bakeIris` is richer than the shipped `paintIris` in two ways worth taking: a 50 % dither ring four pixels outside each band, so the bands bleed into each other the way an iris does rather than stacking like contours; and 60 faint streaks across the sclera against the shipped 40 veins. The bands, the fibres, the limbus and the brow are already the same picture in both.

## What Part B has that the game does not

**The Chariot is not adopted.** Part B specifies a bronze paddle in full — gems in bezels with prongs and seats, a blue core going gold above ×3 chain, thrusters, a petrified state, laser turrets. There is no bronze paddle in Shatter. The deck is the roster's on every level including the veils, and the only Observer state it takes is `petrified`, which SHA-218 already draws by blending the bands toward `STONE_BANDS`. Building the Chariot would be a game ticket about what a veil does to the deck, not an art ticket, and it is not one this pass is allowed to decide.

The same goes for anything else in the bundle that is the mockup's HUD rather than the game's panel — the comets that are lives, the card type scale. SHA-220 drew the panel that ships.

Score pops need nothing, for SHA-227's reason: they are `fillText`, already rasterised at fine resolution.

## Out of scope

The thirteen species still on paper, the eight tricks, and series II's re-cut placements. None of them is drawn yet, so none of them has an HD drawing to specify — and the rule for the day they land is the one this spec sets: a fraction of the socket with a floor of one fine pixel, `scale3x` on whatever bitmap the game would have drawn, and width kept only where width is the message.

## Build order

| Step | Ships                                                                                        | Notes                                              |
| ---- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1    | The almond: fractions with floors, the fine scan, brow and lid, the lashes' `rise`           | The fourteen sockets are the test, not THE VEIL's  |
| 2    | The iris and the pupil: Part B's fibres, dithers and round glint; the shipped bound          | `levelStill`'s "no HD eye yet" note comes out here |
| 3    | The three states: tracks at one fine pixel, veins, the hollow's dithered depth               |                                                    |
| 4    | Opacity: colour unchanged, the halftone's cell pinned to a game pixel                        | The eye sheet is already fine-sized                |
| 5    | The dial, the chart, the cage: hairlines, `finePitch` on the dash, the bars kept             | The pitch is the trap                              |
| 6    | The bestiary: `scale3x` after the transforms, three flash bakes a frame, fine decorations    | 8 species + 3 brood forms + the tear               |
| 7    | The plaques, the diadem, the gate: Part B's plates, fine twinkle arms, the twelve-step march | Geometry already matches at all three              |
| 8    | Inside the eye: `IrisLayer` takes the art; fine fibres; Part B's band dithers and streaks    | The last classic field surface                     |
| 9    | The gaze and the loose pupil: Part B's three nested beam tones and sliding hatch bars        | `beamWidth` 6 stays — it is the hitbox's width     |

## Verification

Per step: `pnpm typecheck`, `lint`, `fmt:check`, `build`, `check:pix`, `check:backgrounds`, `check:drops` green.

Then `art split` in a real Chrome on the four sockets that bracket the range: **SUNRISE** (hw 150, 20 % opacity, behind the hills), **VORTEX** (hw 16, in front, 60 %), **THE VEIL** (42 × 15 — the one socket Part B was drawn for, so the one place a straight port would look right) and **THE LID** (hollow, plus the loose pupil and the gaze). Then the level gallery, which is the cheapest whole-inventory check the eye has: forty-three tiles on one screen, every socket in the game, at the resolution SHA-224 gave it.

Then DEMAKE on a placed eye under 1 opacity, because the halftone is the one thing in this spec with no colour equivalent to fall back on.

`check:pix` gains the almond at three sizes — that the fine outline is closed at each of them, that every feature the recipe names is at least one fine pixel wide at hw 16, and that the whole eye under the tube is the two tube tones and neither all ink nor all ground, which is the same pin SHA-223 put on the sprites.
