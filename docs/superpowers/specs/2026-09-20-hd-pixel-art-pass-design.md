# The HD pixel-art pass

Confirmed by the user on 2026-09-20, on the `design_handoff_hd_pixel_art/` bundle: _"visuellement ça me convient ce qu'à fait Claude Design"_, then, on the two places the handoff is narrower than the game: _"il ne faut pas prendre au pied de la lettre la doc alors, il faut garder tout ce qu'il y a de présent et uniquement ajouter des améliorations ! et donc mettre à jour la doc si elle est trop restrictive"_ and _"pareil il faut surtout garder tout ce que l'on a deja, et faire tous les ajouts qui améliore"_.

The art is Claude Design's. This spec is the same art measured against the repo, and it supersedes the bundle's `README.md` wherever the two disagree — the bundle's amendment note points here.

## The idea

The renderer already paints on a **1116×900 backing store**: the game simulates on a 372×300 grid and `SCALE` is 3. Every sprite today goes through `pixel()`, which does `Math.round(left) * scale` — so a sprite is snapped to 3×3 blocks and two thirds of the resolution is thrown away. The HD pass **draws on the fine grid**: bevels, ordered dither, round balls, three-times-finer motion.

**Nothing under the drawing moves.** Same collision boxes, same level rows, same seeded backgrounds, same canvas. It is an art pass, not a refactor. (Two tones did move, and both are recorded below: silver, by the owner's choice, and the brightest star, because the guard refused the pair.)

## Two rules

1. **Nothing that ships is dropped.** The handoff describes 8 of 10 brick kinds, 2 of 6 paddle states and 8 of 9 background themes. The game is the inventory, not the document: every kind, state, theme and paint modifier that exists today gets its HD drawing, and where the handoff is silent the recipe is extended in its own idiom rather than the thing being left classic. A wall where granite is blocky beside an HD gold, or a deck that degrades when XWIDE is caught, is the defect this rule exists to prevent.
2. **Classic stays, intact and reachable.** Both paths live behind `ART_MODE`; classic is untouched code and stays the default until the pass is done. That is the regression net, the DEMAKE path, and the A/B tool.

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

**Paddle.** The pill recipe at all six states, not two: base 46, WIDE 72, XWIDE 144, JAMMER 30, SPLIT 66 with its 26 px hole, and `MirrorPaddle`. The deck telescopes one px per edge per tick, so **the recipe is a function of width** and bakes per live width rather than per named state. Laser turrets and bolts as drawn.

**Capsules.** 58 pills, the handoff's row table, letter in Silkscreen 16 px. `MALUS_KINDS` keep their blink and the dark-ink letters keep theirs.

**Frame.** The silver nine-rail recipe with rivets.

**Backgrounds.** All nine painters, `observer` included. Each keeps its existing generator calls in the same order, then draws HD-only detail from the *continuing* generator — the RNG in the prototypes is byte-identical to `createRandom`/`hashSeed`, so classic and HD share every star and dune and `check:backgrounds` stays green.

**Panel.** Silkscreen and Press Start 2P are already loaded; insets and lives glyphs as specified.

Where the bundle's README and its prototypes disagree on a value, **the Observer prototype wins** — the README names it the spec of record for the art. The brick drop shadow is one such case and it is not a conflict after all: `SHATTER Observer HD.dc.html` and the README both say `#05050f`, and only the level-1 file says `#03080e`. It is `canvasPalette.brickJoint` now.

**The effects the renderer paints.** The handoff's Part A stops at the furniture and jumps to the Observer, but the roster's own drawing lives in `CanvasRenderer` — the effect modules compute state, they do not draw. Everything that reaches the screen through `drawBrick` is covered by the brick recipe; the threads, veils, particle fields, debris, reticles and score pops are not, and a 1-px line becomes a 3×3 block beside an HD wall. Taken as the tail of Part A rather than as a gap to argue about, and likely to split once the split view shows which of them actually read as coarse.

## Out of scope here

Part B (the Observer in HD) is deferred and will need its own spec: the bundle predates `2026-09-18-observer-43-levels`, `2026-09-19-observer-one-eye-43-placements` and `2026-09-19-bestiary-and-bosses`, so its eye/veil art covers roughly half of what is on screen — it knows nothing of the twenty-species bestiary, the bosses grown by `doubled()`, or THE CHART.

Also deferred, each its own ticket: the DEMAKE filter on the HD path (every `mix()` tone falls outside `DEMAKE_GROUND_TONES`, so it needs its own mapping), and the capsule catalogue and level gallery, which call the sprite functions at `scale: 1` and so stay classic until an HD path exists at that scale.

## Verification

Per step: `pnpm typecheck`, `lint`, `fmt:check`, `build`, `check:backgrounds`, `check:drops` green. Then `art split` in a real Chrome on SUNRISE, a granite level and a fence level. Then the owner's QA. Performance budget: the canvas does not change size and nothing new is painted per frame except the bricks, which cost what they cost today.
