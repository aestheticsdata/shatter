# The HD pixel-art pass

Confirmed by the user on 2026-09-20, on the `design_handoff_hd_pixel_art/` bundle: _"visuellement ça me convient ce qu'à fait Claude Design"_, then, on the two places the handoff is narrower than the game: _"il ne faut pas prendre au pied de la lettre la doc alors, il faut garder tout ce qu'il y a de présent et uniquement ajouter des améliorations ! et donc mettre à jour la doc si elle est trop restrictive"_ and _"pareil il faut surtout garder tout ce que l'on a deja, et faire tous les ajouts qui améliore"_.

The art is Claude Design's. This spec is the same art measured against the repo, and it supersedes the bundle's `README.md` wherever the two disagree — the bundle's amendment note points here.

## The idea

The renderer already paints on a **1116×900 backing store**: the game simulates on a 372×300 grid and `SCALE` is 3. Every sprite today goes through `pixel()`, which does `Math.round(left) * scale` — so a sprite is snapped to 3×3 blocks and two thirds of the resolution is thrown away. The HD pass **draws on the fine grid**: bevels, ordered dither, round balls, three-times-finer motion.

**Nothing under the drawing moves.** Same collision boxes, same level rows, same seeded backgrounds, same canvas. It is an art pass, not a refactor. (Two tones did move, and both are recorded below: silver, by the owner's choice, and the brightest star, because the guard refused the pair.)

## Two rules

1. **Nothing that ships is dropped.** The handoff describes 8 of 10 brick kinds, 2 of 6 paddle states and 8 of 9 background themes. The game is the inventory, not the document: every kind, state, theme and paint modifier that exists today gets its HD drawing, and where the handoff is silent the recipe is extended in its own idiom rather than the thing being left classic. A wall where granite is blocky beside an HD gold, or a deck that degrades when XWIDE is caught, is the defect this rule exists to prevent.
2. **Classic stays, intact and reachable.** Both paths live behind `ART_MODE`; classic is untouched code and stayed the default until the pass was done — HD took over on 2026-09-25 (SHA-248), and classic is still `art classic` away. That is the regression net, the DEMAKE path, and the A/B tool.

## The flag

Per the house rule on names that are strings, in `src/interfaces/art.ts`:

```ts
export const ART_MODE = { CLASSIC: "classic", HD: "hd", SPLIT: "split" } as const;
export type ArtMode = (typeof ART_MODE)[keyof typeof ART_MODE];
```

Dev console words `art classic` / `art hd` / `art split` (the prototypes' **C** and **V** keys). Split draws the classic frame to an offscreen canvas and blits its left half over the HD one, tagged `CLASSIC 1X` / `HD 3X`.

## The toolkit — `src/render/pix.ts`

A small software raster baked into an offscreen canvas, ported from the prototypes' `Pix` class: `set`, `rect`, `dither` (4×4 Bayer, threshold `t·16`), `vgrad`, `disc` (solid or dithered), `ring`, `discBand`, `rgrad`, `toCanvas` via `putImageData`. Plus `mix(a, b, t)`, `pillRows(h)`, `scale3x` (AdvMAME3x, for the ASCII bitmaps), and `BAYER`.

`BackgroundBrush` in `@render/backgrounds` already carries `rect` / `disc` / `discBand` / `random` / `randomInt`. The HD brush is that interface widened with the dither verbs, drawing in fine px instead of game px — **one toolkit, two resolutions**, not two toolkits that drift.

**Every intermediate tone is `mix()` of two palette tones.** `bricks.ts` and `palette.ts` stay the single source of truth; the pass adds no hex of its own.

## What is baked and what is not

`SpriteCache` bakes anything whose drawing is a pure function of a small key: the ball, the capsule pills, the frame, the beasts, the backgrounds. Per-frame work for those is one `drawImage`.

**Bricks are not baked.** `drawBrick` takes seven live paint modifiers — `fade` (GHOST), `gilded` (PAYDAY), `erodeX`/`erodeY` (ERODE and COLLAPSE's fog), `strain` (JELLY), `unmoored` (SLUMP), `demade` — plus `cell.seed` (granite's hashed grain), `cell.hitPoints` and `cell.scarTicks` (WRATH's flicker). Two of those are continuous floats and one is per-cell, so a cache key over them is not a cache. The HD brick recipe is ~20 fills against today's ~10, with the two dithered bands drawn as repeating patterns rather than pixel by pixel. Measured on the densest wall the roster has (8 rows x 12 columns, all ten kinds): **1.30 ms a frame classic against 2.34 ms HD**, so the whole frame costs 1.8x what it did and still leaves 14 ms of the budget. Every capsule that touches a brick keeps working for free. This is a deliberate departure from the handoff's "per-frame work is `drawImage` only".

## Positioning

HD sprites blit at `Math.round(x * 3)`, classic at `Math.round(x) * 3`. Motion gets three-times-finer steps and the simulation does not change. `imageSmoothingEnabled = false`; CSS `image-rendering: pixelated` only when the display scale is ≥ 1, `auto` below — a downscaled pixelated canvas shimmers.

## Part A — the shipped game in HD

Geometry is the game's, unchanged: field 372×300 (1116×900 fine), rails 3 px (9), brick cell 30×12 (90×36) at origin (6, 38), body inset 1 (3), ball 8×8 (24×24), capsule 20×8 (60×24), paddle rail y 276, height 7.

**Bricks.** The handoff's recipe — drop shadow, knocked-corner `D3` outline, `M0` body, `M1` top band over 50 % dither, `D1` dither into a solid foot, `L1`/`D2` bevel, three `L2` speculars — applied to all ten kinds: `1`–`5`, `S`, `G`, `L`, and the two the handoff omits:

- **`R` granite** keeps its material. The grain stays hashed from `cell.seed` and the pits still multiply per hit. A fleck is **2 fine px with the count raised by the area it lost**, not 1: the first pass drew one fine pixel where classic draws nine and granite came out a flat slab with noise on it. Same coverage, twice the grain. Pits stay a whole game pixel — a fracture is damage, meant to be read across the wall.
- **`F` fence** takes the plain recipe in its own tones.

Damage uses the authored ramps — `BRICK_RAMPS`, `BRICK_STRAIN_RAMPS`, `GILD_RAMP`, and each kind's `wear` array — **not** the handoff's `mix()`-derived hurt face, which would throw away authored tones (`G` has one, `R` two). The handoff's crack overlay is added on top of the ramp, not instead of it. Kind marks stay drawn in game-px blocks so they stay chunky; `L`'s rivets and `R`'s grain are already faces of their own.

**Silver is Claude Design's:** `S` becomes flat `#8f9ac8`, light `#dbe4ff`, dark `#3c50a0` in `bricks.ts`, for both paths. Confirmed 2026-09-20. `L` is not new — it ships, with rivets — and its tones already match.

That retone has one consequence, and `check:backgrounds` found it: the brightest star was `#7f92c8`, 17 from the new silver, and a star that reads as a chip of brick is exactly what that guard exists to refuse. It moves to `#6c7cb4` — the brightest of the handoff's own night blues, and the tone its starfield is already drawn in, so it is not a colour invented to get past a check. `starfield` and `observer` share it.

**A worn face takes its engraving with it.** At its last damage stage a brick's body *is* its own `dark`, so the mark is drawn dark on dark and disappears — classic has always done that. The HD engraving is a sheen line and would have survived it, leaving a bright dash floating on a blank face; when the face has gone, all of it goes.

**Ball.** The handoff's disc stack, in `@render/hdBall`: a near-black contour, a ring of `ballShade` inside it, the body offset one authored pixel up and left so the shade gathers at the lower right, a dithered rim where the two meet, a `ballHighlight` disc and a blown-out white specular. `ballSprite.ts` stays the source of shape — `Pix.disc` and `ballRows` are the same arithmetic, so the outermost disc *is* `ballRows(size x 3)` and the silhouette the player sees is the one the simulation collides. Every radius is the authored 24 px one times this ball's own scale, so GIANT's nine diameters each bake their own sprite rather than one being zoomed. `check:pix` pins the silhouette and the specular at all nine.

Three things that belong to the ball came with it, because rule 1 says so and because each is the ball's own silhouette drawn some other way: **the newborn's pip** (MULTI and SWARM), which is a disc here rather than the square classic draws — it was never meant to be a square, the round rows simply *are* one when they are clipped to four pixels; **TEMPO's pace ghost**, the same outline two fine pixels thick instead of a staircase of 3x3 blocks; and **the speed streak**.

The streak is where the handoff is narrower than the game, and it is not taken as written. It is **not** new to the game and it is **not** always on: RUSH and TURBO are the only things that draw one, and that is the cue that says this ball is fast. An always-on trail would spend that cue on every ball in the game and leave the two capsules with nothing to announce themselves with, so the HD path keeps the streak exactly where the game puts it, in the capsules' own tones, and only redraws it. The handoff's taper is not taken either: it pinches three copies down to a quarter of the ball's width, which suits a prototype whose trail is sampled every few frames and reaches a long way back, but this game's streak is two copies of *one tick's* displacement — a few pixels — so a copy that small would sit entirely inside the ball's own footprint and the capsule would stop showing. The taper is gentle instead: 0.85 and 0.95 of the diameter, round rather than blocked, so the smear narrows behind the sprite without vanishing into it.

**Paddle.** The pill recipe in `@render/hdPaddle`, at all six states rather than the two the handoff lists: base 46, WIDE 72, XWIDE 144, JAMMER 30, each half of a SPLIT 66 with its 26 px hole, and `MirrorPaddle` at any fraction of all of them. The deck telescopes one px per edge per tick, so **the recipe is a function of width and nothing else** — there is no "the WIDE sprite", only the sprite at 58 fine px and the sprite at 60, and a recipe written per named state would flicker between two pictures for the twelve ticks a capsule takes to arrive. Under 18 game px there is no room for two 8 px caps, so the recipe falls back to a rounded bar, exactly where classic falls back to a flat one; only MIRROR's ghost gets there.

**This one is baked, and the wall is not.** The difference is what the recipe asks of a pixel. A brick is bands, so it is twenty fills drawn straight; a deck asks of every pixel which side of the dither it is on and whether it is inside a dash, so drawn straight it would be several hundred fills for each of the six pills a frame can hold. The cache key is the width and the four tones together, which stays small because the tones are a fixed set — the player's deck, its JAMMER caps, the chain's gold sheen, MIRROR's ghost, a BOMB's whiteout — except while THE IRIS is turning the deck to stone, and `petrifyBlend` is a ramp of sixths and twelfths, so that adds at most eighteen tone sets rather than one a frame.

Two places the handoff is written for a deck this game does not always have. Its light bar is held six fine px off each cap weld, which is right at every width it was authored on and wrong at 20 game px: two caps take 48 of the 60 fine pixels a SPLIT half has, six a side leaves the bar nothing, and the half comes out unlit where classic still shows two game px of sheen. The inset is a quarter of the body span, capped at six — unchanged on a wide deck, a glint kept on a narrow one. And its turret wears a white charge cap always; here it wears one only while the gun is still coming out, because that is the game's cue for a cannon that is not ready, and a finished turret's top row is left as the bore instead.

Laser turrets and bolts as drawn, at the sizes they already are: the stud is the two game px classic paints and the bolt its two by nine. Neither grows — both gain an edge and a hot core.

The deck's *capsule* overlays — GLUE's resin, ENGLISH's felt, PYRE's ember, SPLIT's seam, the stone cracks — stay classic here and go with the rest of the effects (SHA-222). They are bands and lines laid on the deck rather than sprites with silhouettes, so none of them reads as coarse next to the HD pill; verified on a magnified strip rather than assumed.

**Capsules.** The handoff's row table in `@render/hdCapsule`: rounded ends off `pillRows(24)`, a contour of `mix(colour, #000, .5)`, two rows of white glare, a lighter band, the body, a three-row dithered waterline into `mix(colour, dropShade, .5)`, and an ink foot. `canvasPalette.dropShade` is `#0b0b26` — the handoff's own ink, already in the palette — so the recipe adds no hex.

**Baked per colour, not per kind.** Six capsules wear a brick's exact tone by design and several more share one, so fifty-eight kinds come out as rather fewer sprites, and a capsule that is only its colour and its letter is exactly what the player reads.

**The letter is not in the sprite.** It stays live text, as classic draws it, for three reasons the handoff's prototype does not have: `dropGlyphFont` measures against Silkscreen's advance and steps down a ladder so a four-character glyph fits, where a fixed 16 px would overflow one; `uprightText` turns a label back over under FLIP; and DEMAKE punches the glyph out of the flat ink slab in ground. Baking it would cost all three to save one `fillText`. What it gains instead is the handoff's **2 px ink shadow**, which is what keeps a light letter legible now that the pill has a white glare across its top — and which a dark-lettered kind does not get, because ink under ink says nothing.

`MALUS_KINDS` keep their blink on both paths and the dark-ink letters keep theirs. The ends are rounder than classic's cut corners, and the catch box does not move: it is 20 x 8 and the full 20 px is still drawn at the rows the deck actually meets.

Three callers reach this sprite at `SCALE` and all three take the HD path: the falling drops, XRAY's reveal inside a brick, and GAMBLE's reel over the deck. The capsule catalogue draws at `SCALE` too but never asks for HD, and the level gallery draws at 1 — both are SHA-224.

**Frame.** The silver nine-rail recipe with rivets, drawn straight on the fine grid — one tone per fine pixel across the three game pixels the rail has always been, mitred at the corners by starting rail `i` at `(i, i)`. The rail does not move or change width. THE OCULI's door stays a genuine hole: the top rail is painted as two spans with nothing between them, exactly as classic does, and a rivet that would fall in the opening is not driven rather than painted and then cut.

The ramp is the one place the pass **adds authored hexes**, and the rule above is amended for it: no hex is written inside a recipe, but an artist's ramp that is not derivable belongs in `palette.ts` beside the brick ramps, which is what "the palette is the single source of truth" has always meant. Three of the nine rails are tones this game already has (`wallLight` twice, `wallShade`) and two more are exact `mix()` of them; the other four are Claude Design's reading of light across a bevelled rail, and blending toward them would be redrawing the thing the bundle was picked for. They live in `FRAME_RAILS`, and `check:pix` pins the ramp's width, its two anchors in the wall's own tones, and that it descends.

**Backgrounds.** All nine painters, `observer` included, plus the horizon's foreground.

`BackgroundBrush` is widened rather than replaced: the same `rect` / `disc` / `discBand` / `random` / `randomInt` in game pixels, plus `finePixel` / `fineRect` / `fineDither` / `fineVgrad` / `fineRgrad` / `fineDisc` / `fineDiscBand` in fine ones. On the HD path it is backed by a `Pix` — a dithered sky asks a question of every one of a million pixels, and a `fillRect` apiece is not a thing that finishes — and the whole field lands in one `putImageData`. The game-pixel verbs round and *then* multiply, exactly as `pixel()` does, so every element sits where its classic twin sits; radii are multiplied unrounded, which is what turns a scaled disc into a round one instead of a blown-up small one. That alone is most of the ticket: every cloud, dune, planet and bloom stops being a 3x nearest-neighbour enlargement.

**The rule the themes are written to is that the *generator* calls never change.** A painter may draw its own elements differently at the two resolutions — a lattice line is one fine pixel in HD and one game pixel in classic — but `random()` and `randomInt()` must be called the same number of times, in the same order, with the same arguments. That is what keeps every star, dune and stone in the same place on both paths, which makes `art split` a comparison of drawing rather than of two layouts. HD-only detail is drawn from the generator *where it then stands*, so nothing above it moves.

**No new tones.** These themes are authored far darker than the handoff's prototype, because `check:backgrounds` demands 3:1 for every sprite against an `area` tone; a bright pre-dawn `glowHi` would simply be refused. It is not needed: the win is dithering *between the tones already there*, and every HD-only tone is `mix()` of the theme's own — always toward its base or toward black, never up, since the guard only sees what is named in `BACKGROUND_COLORS`.

What each theme gained: `starfield` and `observer`, stars as a lit point with four dim arms instead of a 3x3 block, over a deep field of single fine pixels; `nebula`, a dithered shell where the haze runs out, and fine dust; `grid`, a hairline lattice and etched junctions; `horizon`, the four sky slabs replaced by one dithered gradient over the same four tones, a dithered dome where the sun has not come up yet, a horizon line, grit in the ground and a shadow rim on each dune; `planet`, a dithered terminator across the four-pixel step between limb and body; `circuit`, one-pixel traces and pads with a hole in them; `cathode`, the four-disc bloom replaced by one radial ramp and the ribbing at a third of its pitch for the same coverage; `vault`, a lit lip on each joint and a dithered shadow at each stone's foot.

`check:backgrounds` now also runs every theme through both arts against a stub canvas, and refuses an HD field with a transparent pixel in it — a background is the one layer nothing is drawn under, so a gradient that stopped a row short would show straight through to the page. Classic and the demade field were both proved byte-identical across all nine themes.

The `monoImageFor` pair runs the painter itself now rather than borrowing the colour layer. Same painter, same seed, same picture — but the colour layer may be on the fine grid, and asking it for a classic field would repaint it at the other resolution twice a frame for the whole of DEMAKE's crossfade.

INSIDE THE EYE's iris stays classic: it is the Observer's chamber and goes with the rest of it.

**Panel.** Most of this section describes what the game already does, and one part of it does not transfer.

Already true: the panel is set in Silkscreen with Press Start 2P for the wordmark, both loaded, and `--color-inset` is already `#0d0d24` — the handoff's exact tone.

Does not transfer: the handoff's "Silkscreen 16/24 px" is its prototype's *in-canvas* panel measured in fine pixels. This panel is DOM, measured in CSS pixels, and its columns are tuned to the pixel at 6, 7, 11 and 12 px — `checkCapsuleBlurbs` exists because Silkscreen is proportional and counting characters is how a column overflows. Restating those sizes would break every measured column to match a number that means something else. Same for "lives as small paddle glyphs": the rack is five 16x5 bars in the deck's own blue, which is already a paddle glyph at a size where a nine-row pill recipe has nothing to say, and they are `div`s rather than canvas.

Shipped: the insets get the handoff's 2 px bevel — `inset 2px 2px 0` in a new `--color-inset-shadow`, `inset -2px -2px 0` in the existing `--color-panel-edge-light` — so a readout sits in a cut rather than on a dark rectangle. It costs no layout, because every inset already holds its content 5 px in from the edge.

**This one change is not behind the flag.** The panel is DOM: there is one of it, and it looks the same in `classic` as in `hd`. It is written through tokens so DEMAKE collapses it with everything else, and `box-shadow` was added to the stage's transition list so the bevel sags with the panel instead of snapping. In the tube the light edge is ink and the dark edge is ground, which is how every other bevel in this panel is already demade.

Where the bundle's README and its prototypes disagree on a value, **the Observer prototype wins** — the README names it the spec of record for the art. The brick drop shadow is one such case and it is not a conflict after all: `SHATTER Observer HD.dc.html` and the README both say `#05050f`, and only the level-1 file says `#03080e`. It is `canvasPalette.brickJoint` now.

**The effects the renderer paints.** The handoff's Part A stops at the furniture and jumps to the Observer, but the roster's own drawing lives in `CanvasRenderer` — the effect modules compute state, they do not draw. Everything that reaches the screen through `drawBrick` is covered by the brick recipe. The threads, dust, washes and specks the renderer paints itself were not, and a 1-px mark is a 3×3 block beside an HD wall.

*The fourth quadrant.* `pixel` is a game position and a game size; `spritePixel` is a fine position and a game size. The pass adds `mote` — fine position, **fine** size — with `grain` for a mark that belongs to the wall rather than to something moving (classic snaps it to the game grid the way `pixel` does; ERODE's grains fall at 0.55 px a tick, and rounding a fractional y after multiplying instead of before would move every one of them), and `fineRect` for a mark that is not square. Classic goes through the old methods unchanged, so the mode is one branch in each primitive rather than fifty at the call sites, and `this.fine` replaces the twelve hand-written `artMode === HD && !demade` tests.

*Three trades, each stated once and cited after.*

- **A line's weight is its thickness times its duty.** The fine grid takes a line from three pixels thick to one, so the pitch has to close by `FINE` *twice* — `finePitch(gamePitch)` in `@interfaces/art`. Carrying a dash pattern over at `gamePitch / FINE`, the obvious arithmetic, leaves a thread at a third of its ink; on a dark field that is a cue the player has to hunt for, and it looks like a considered choice. **This pass shipped that bug for an hour and `check:pix` now refuses it.** TWIN's threads and TRACER's guide take the whole trade and close into hairlines — the dash was never their idiom, only the coarse grid's way of keeping a 3 px line from reading as a rope. MAGNET's tether takes two thirds and keeps a gap, because there its dashes *crawl*, and a crawl with nothing to crawl in says nothing.
- **Dust: half the grain, twice as many.** A 3×3 mote cut to 2×2 keeps four of its nine fine pixels, and a thinner trickle is not a finer one — it is the same trickle further away. Doubling the count puts the weight back while each grain reads at two thirds the size. ERODE's seams, GRAVEL's grit, COLLAPSE's rim, HAYWIRE's static. Only ever taken where the count is a drawing loop that nothing downstream reads.
- **A designed arrangement keeps its count.** ENGLISH's three flecks at 120° and TIDE's eight rim marks are the drawing; a fourth fleck would be a different capsule. Those get a finer speck and nothing else — and they orbit on the fine grid now, so the turn is smooth instead of a three-pixel ratchet.

What each effect gained: TWIN's threads and snap comets, and TRACER's guide, pip walk and slack rope, are hairlines with the shiver reading as a curve; MAGNET's tether is a fine crawling dash and its band edges are 1-px ticks; GRAVEL's fractures are the *same walk* traced a third as thick — every decision bit for bit classic's, with a riser at each step down so the staircase stays closed — over finer grit; ERODE's and COLLAPSE's grains likewise; HAYWIRE's static is twelve fine discharges instead of six coarse ones, which reads as more electrical and not merely as smaller; PYRE's crown keeps the ball's width and measures its height finely, so fire climbs smoothly and ends in a tip rather than in a third of a lick.

The deck's own overlays, deferred here from the deck ticket: GLUE's resin reads its twelve-step lag table as *depths* — classic has two levels to spend it on and collapses into a battlement, fine pixels give the table the range it was written for and it becomes a liquid surface; ENGLISH's cloth is laid a fine column at a time, so the roll-out stops being thirty visible steps; PYRE's wash travels the same way; SPLIT's seam is one fine pixel on the deck's true middle, because three of them down a machined cylinder is a milled channel and a crack is the width of nothing; TIDE's drips run at the width water runs at, falling finely over the twelve ticks they have.

## DEMAKE on the fine grid (SHA-223)

The tube ran on classic for the length of the pass, because the filter maps a colour by *membership*: `DEMAKE_GROUND_TONES` lists the tones that carry a shape, everything else is ink. The HD recipes derive five tones per material out of the roster's three, none of them in any list — so an HD sprite under the filter came out a solid ink slab with every tell gone, for the eight seconds the capsule holds.

**A derived tone takes the role of the tone it came out nearest.** `mix` records which end of the blend that was, and `demakeTone` walks the chain until it reaches a tone the palette has an opinion about. The brick's `d3` — its dark pulled 40% toward black — is ground because the dark it came off is; `d1`, the same dark blended 45% of the way *into* the body, is ink because the body is. One is the outline and the other is the shaded half of the face, they are made from the same two authored tones, and the blend is the only thing that knows the difference. No recipe says a word about the tube.

A luma threshold was the other candidate and is the right tool one layer down: `@render/backgrounds` thresholds the painted *field* at 22, because those tones were authored dark by the `check:backgrounds` rules and a whole theme is one material. It is the wrong tool for sprites, whose tones run the full range — any single number turns the dark bricks to ground and the light ones to a slab, which is the flattening the filter exists to avoid.

Three things the palette still has to say out loud, because they are authored rather than blended: **black** is the shadow role (the ball's, the deck's, the capsule's and the brick's contours are all `mix(<shade>, "#000000", …)`, and one line here is what resolves all four); the **frame's** outer contour and inner lip, the two ends of its nine-tone ramp, which are the arena's edges rather than light falling across it; and the **mortar seam**, which classic leaves as bare field and HD paints — ink there welds sixty bricks into one sheet and takes the wall's grid with it. None of the three is drawn on the classic path, so classic is untouched.

The plumbing is one line at the bottom of the raster: `Pix` takes the filter and applies it in `set`, which every verb funnels through, so a recipe written once bakes its own demade twin with no branch anywhere in it. The baked sprites carry the machine in their cache key; the wall, which is drawn rather than baked, takes the filter down with the rest of its paint. `this.fine` no longer excludes DEMAKE, and the field's mono twin follows the wall onto the fine grid — same painter, same seed, same threshold, three times the pixels. `check:pix` pins it: every HD sprite under the tube is the two tube tones and no others, and is neither all ink nor all ground.

## The catalogue and the gallery (SHA-224)

Both screens are miniatures of the real field: `capsuleScenes.ts` and `levelStill.ts` paint it at its own size with the game's own sprite functions, and the tile is a downscale of that. Which is why a retouched bevel reaches 58 catalogue pictures with no second edit — and why they could not reach the HD path, which exists at 3×.

**They paint the field at `FINE` now, and the existing downscale does the rest.** It is the one downscale in this codebase that keeps smoothing on, which is what makes this cheap: the still is three times bigger and the box filter is nine times wider, so an authored mark is the same fraction of a tile it always was — a 3 px line is one tile pixel either way — while everything the recipes draw below a field pixel arrives as tone rather than being dropped. A finer photograph of the same screen. The ticket's worry about legibility turns out to be a worry about *nearest-neighbour* downscales, which these are not.

`scale` is the one number that changed. The `Field` brush that stages all 58 scenes multiplies by it, the sprite calls pass it, and not one scene body knows which art it is in — a scene is staged in the units the game is designed in and the art is the reader's business. `drawDeckBody` came out of the renderer for `drawBrick`'s reason: two things paint a deck now, and a second copy of the HD-or-classic-or-narrow branch would drift the first time one is retouched.

The pill badge beside each catalogue entry is the one picture on either screen that is not downscaled at all — it is backed at `SCALE`, which is the fine grid itself, so the HD capsule arrives there at exactly the resolution it is baked at.

Two bugs the screenshots caught, both older than this ticket and both invisible in the arena:

- `Pix.blitTo` is `putImageData`, which **replaces** alpha and all. Right for a field — an opaque base clearing whatever the last theme left is how the layer is reused — and wrong for a sheet with holes, which is what a foreground is. The arena never saw it because there the two layers have a canvas each; the gallery paints both into one, and the horizon's dunes punched the sky back out to transparent. `blitTo` takes a `compose` flag now and the foreground always composes. The blend is "an opaque pixel wins" and nothing more, because `Pix.set` writes 255 or nothing — and it is arithmetic over two arrays rather than a `drawImage`, so `check:backgrounds` goes on running the painters under plain node.
- `drawEye`'s third argument is `open`, not `scale` — `scale` is the sixth. A still asking for a 3× eye got an eyelid opened to 3 and a sprite still drawn at 1.

## Out of scope here

Part B (the Observer in HD) has one of its own: `2026-09-21-observer-hd-design.md` (SHA-225). The bundle predates `2026-09-18-observer-43-levels`, `2026-09-19-observer-one-eye-43-placements` and `2026-09-19-bestiary-and-bosses`, so its eye/veil art covers roughly half of what is on screen — it knows nothing of the twenty-species bestiary, the bosses grown by `doubled()`, or THE CHART.

## The figures (SHA-227)

SHA-222 took every effect whose mark is a **sample** and gave it the fine grid through `mote` / `grain` / `fineRect`, because a sample only ever needed a resolution. This is the other half: everything whose mark is a **figure**, where each pixel means something and the drawing had to be redrawn rather than switched over.

**Drawn, because they are parametric.** SNAP's lattice puts a *crossing* at each node — a plus rather than a block, five fine pixels against nine, and the shape now says which way the lines run. Its bracket is two fine pixels with a game pixel of node at the vertex: the capsule's claim is that a rebound is exact, and a 3 px arm is a painted corner where a hairline is an instrument — but the arms are long on a dark field, so it takes two thirds rather than the whole trade, as MAGNET's tether does. The homing mark's corners become **L**s along the brick's own edges, which is what a reticle corner is and what makes four of them say "this rectangle" rather than "these four points". LEAP's diamond is walked in fine steps, closing its risers to a third of their height — a diamond is the one figure here whose whole edge is a diagonal — and its flashes are sized in fine pixels, which buys the *animation* rather than the outline: a square opening over a handful of ticks could only grow in whole game pixels before, so a continuous movement arrived in four or five visible steps. CHAIN's core goes to under half its sheath's width, which is the drawing that makes an arc read as hot. PYRE's wave thins through nine rungs instead of three. The NUKE's ring goes to two thirds, where it stops being a band and starts being an edge. XRAY's trail is finally lighter than the beam it follows. FENCE's posts take the wall's own HD brick, because a fence made of different stuff from the row it is driven into reads as an overlay. And the rail mark keeps every pixel of its width — that is its whole message, and SHA-222 was right to leave it — while losing a third of its thickness, which is not.

**Baked, in `@render/hdFigures`, because their key space is finite.** GRAVEL's chip has four tumble faces, a METEOR five burn rungs, BANANA's peel one pose, CRITTER's grub twelve states. The chip gets a bevel — lit on the two edges meeting at the tumbling corner, shadowed on the other two, with a two-pixel catch of light at the corner itself. (A lit right triangle across a third of the face was the first draft, and at twelve pixels that is not a facet, it is a square with stripes on it.) The meteor becomes two discs of the same radius, the flame's centre raised by a cap, so the silhouette is one teardrop whose leading end is on fire rather than an ember cap perched on a ball. The peel rounds off through `pillRows` with its underside dithering up into the body, which is the deck's waterline on a skin. And the grub is a **character grid put through `scale3x`** — the house idiom, and the one `pix.ts` has been carrying since SHA-215 for exactly this: the 1x bitmap stays the source of truth, Scale3x rounds its staircases into the curve the outline was always drawing, and the one thing it had to be *given* is two creases behind the head, because thirty by twenty-four pixels of flat body is nothing to look at and a grub is segmented.

`check:pix` pins all four against silhouettes something else already defines — the square the simulation scatters, a rock that is not a square, `pillRows`, and the bitmap at exactly three times the size with its jaw at the end it is walking toward.

Score pops need nothing: they are `fillText`, already rasterised at fine resolution. So are the stasis and bumper rings, which are `ctx.arc`.

## The screens (SHA-249..251)

The pass drew the field and stopped at its edge. The bundle did not: `SHATTER Observer HD.dc.html` redraws the title, GAME OVER and THE WATCHED too — a title canvas on the stage's fine grid, and every heading and line re-set at about 60 % of the v2 mockup's size with a third of its shadow. Neither spec ported it, and the owner found the gap the day HD became the default (SHA-248): _"ok sauf l'écran d'accueil, les écrans de levels, les écrans de capsules et l'écran de score, et l'écran de game over"_. The one open question was theirs to answer, and they took the bundle's sizes.

**The type is the bundle's, in the bundle's units.** `--fine` is a third of a stage pixel, so `calc(40 * var(--fine))` is the bundle's 40 px as written rather than a number translated out of it. Headings 40 with a 5 shadow; lines 24, 20 and 16; rules 3 or 2 thick; the lines on the live field lifted off it by a 2-pixel shadow in the field's own ink. Where the game has more than the bundle drew, the extra takes its neighbour's size: the CHART line like BEST CHAIN, the `L · LEVELS` / `B · CAPSULES` row at the top score's size in the gap the bundle leaves above its footer, all fifteen ranks of THE WATCHED on the 11-pixel pitch they need (the bundle drew five, 54 apart). Where a line sits on the field stays the game's — those tops were chosen against the wall, the brood and the deck. The screens are DOM, so there is one set for both arts, as with the panel's bevel. GRID CLEARED's long-name guard moves with the font: at 13.3 px the 366-px card holds twenty-seven characters, so THE OBSERVER IS BLIND fits at full size and the guard is for a name nobody has written yet.

**The title canvas is backed at the fine grid** (SHA-249). `drawEye` and `drawZodiac` have had fine recipes since SHA-228 and SHA-232, both gated on `scale === FINE`; the title asked at 1 on a 480×300 canvas and went on showing the coarse eye after the whole field had left it. In HD the canvas is 1440×900 and follows the renderer's art the way the two galleries do. The stars keep their seeded places and become the in-game starfield's lit point with four dimmer arms, over fine dust drawn from the generator _after_ them so that none of them moves. The copper takes the bundle's bars of four fine pixels, its 32-pixel period and its 2.2 s.

**The menus' tiles are backed at the fine grid** (SHA-251). SHA-224 put the HD still under each tile and kept the tile at one pixel a stage pixel, so every recipe the pass drew arrived averaged into the same 124×100 and the screen read exactly as coarse as before. In HD the tile is 372×300 behind the same CSS box, and the downscale is the same 1/3 box on both paths. It costs ~450 KB a tile — ~45 MB if every page of both screens is turned to, against ~5 MB. The two headings and rules take THE WATCHED's; the entries keep their measured sizes, which `checkCapsuleBlurbs` holds.

## Verification

Per step: `pnpm typecheck`, `lint`, `fmt:check`, `build`, `check:backgrounds`, `check:drops` green. Then `art split` in a real Chrome on SUNRISE, a granite level and a fence level. Then the owner's QA. Performance budget: the canvas does not change size and nothing new is painted per frame except the bricks, which cost what they cost today.
