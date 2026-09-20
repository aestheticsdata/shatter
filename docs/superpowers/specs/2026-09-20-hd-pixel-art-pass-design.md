# The HD pixel-art pass

Confirmed by the user on 2026-09-20, on the `design_handoff_hd_pixel_art/` bundle: _"visuellement ça me convient ce qu'à fait Claude Design"_, then, on the two places the handoff is narrower than the game: _"il ne faut pas prendre au pied de la lettre la doc alors, il faut garder tout ce qu'il y a de présent et uniquement ajouter des améliorations ! et donc mettre à jour la doc si elle est trop restrictive"_ and _"pareil il faut surtout garder tout ce que l'on a deja, et faire tous les ajouts qui améliore"_.

The art is Claude Design's. This spec is the same art measured against the repo, and it supersedes the bundle's `README.md` wherever the two disagree — the bundle's amendment note points here.

## The idea

The renderer already paints on a **1116×900 backing store**: the game simulates on a 372×300 grid and `SCALE` is 3. Every sprite today goes through `pixel()`, which does `Math.round(left) * scale` — so a sprite is snapped to 3×3 blocks and two thirds of the resolution is thrown away. The HD pass **draws on the fine grid**: bevels, ordered dither, round balls, three-times-finer motion.

**Nothing under the drawing moves.** Same collision boxes, same level rows, same `bricks.ts` tones, same seeded backgrounds, same canvas, same fill cost. It is an art pass, not a refactor.

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

**Bricks are not baked.** `drawBrick` takes seven live paint modifiers — `fade` (GHOST), `gilded` (PAYDAY), `erodeX`/`erodeY` (ERODE and COLLAPSE's fog), `strain` (JELLY), `unmoored` (SLUMP), `demade` — plus `cell.seed` (granite's hashed grain), `cell.hitPoints` and `cell.scarTicks` (WRATH's flicker). Two of those are continuous floats and one is per-cell, so a cache key over them is not a cache. The HD brick recipe is ~20 fills against today's ~10: drawn straight onto the fine grid it costs about what the wall costs now, and every capsule that touches a brick keeps working for free. This is a deliberate departure from the handoff's "per-frame work is `drawImage` only".

## Positioning

HD sprites blit at `Math.round(x * 3)`, classic at `Math.round(x) * 3`. Motion gets three-times-finer steps and the simulation does not change. `imageSmoothingEnabled = false`; CSS `image-rendering: pixelated` only when the display scale is ≥ 1, `auto` below — a downscaled pixelated canvas shimmers.

## Part A — the shipped game in HD

Geometry is the game's, unchanged: field 372×300 (1116×900 fine), rails 3 px (9), brick cell 30×12 (90×36) at origin (6, 38), body inset 1 (3), ball 8×8 (24×24), capsule 20×8 (60×24), paddle rail y 276, height 7.

**Bricks.** The handoff's recipe — drop shadow, knocked-corner `D3` outline, `M0` body, `M1` top band over 50 % dither, `D1` dither into a solid foot, `L1`/`D2` bevel, three `L2` speculars — applied to all ten kinds: `1`–`5`, `S`, `G`, `L`, and the two the handoff omits:

- **`R` granite** keeps its material. The grain stays hashed from `cell.seed` and the pits still multiply per hit; at 3× they are 1-fine-px flecks and 3-fine-px pits, so the stone reads as stone rather than as a red brick with the lights off.
- **`F` fence** takes the plain recipe in its own tones.

Damage uses the authored ramps — `BRICK_RAMPS`, `BRICK_STRAIN_RAMPS`, `GILD_RAMP`, and each kind's `wear` array — **not** the handoff's `mix()`-derived hurt face, which would throw away authored tones (`G` has one, `R` two). The handoff's crack overlay is added on top of the ramp, not instead of it. Kind marks stay drawn in game-px blocks so they stay chunky; `L`'s rivets and `R`'s grain are already faces of their own.

**Silver is Claude Design's:** `S` becomes flat `#8f9ac8`, light `#dbe4ff`, dark `#3c50a0` in `bricks.ts`, for both paths. Confirmed 2026-09-20. `L` is not new — it ships, with rivets — and its tones already match.

**Ball.** The handoff's disc stack. `ballSprite.ts` stays the source of shape: its rows and glints already scale with the ball, so GIANT's nine sizes each bake once rather than the 24 px one being zoomed. The trail is new to the game — keep it subtle.

**Paddle.** The pill recipe at all six states, not two: base 46, WIDE 72, XWIDE 144, JAMMER 30, SPLIT 66 with its 26 px hole, and `MirrorPaddle`. The deck telescopes one px per edge per tick, so **the recipe is a function of width** and bakes per live width rather than per named state. Laser turrets and bolts as drawn.

**Capsules.** 58 pills, the handoff's row table, letter in Silkscreen 16 px. `MALUS_KINDS` keep their blink and the dark-ink letters keep theirs.

**Frame.** The silver nine-rail recipe with rivets.

**Backgrounds.** All nine painters, `observer` included. Each keeps its existing generator calls in the same order, then draws HD-only detail from the *continuing* generator — the RNG in the prototypes is byte-identical to `createRandom`/`hashSeed`, so classic and HD share every star and dune and `check:backgrounds` stays green.

**Panel.** Silkscreen and Press Start 2P are already loaded; insets and lives glyphs as specified.

Where the bundle's README and its prototype disagree on a value, **the prototype wins** — it is the spec of record for the art. (Known: the brick drop shadow is `#03080e` in the prototype, `#05050f` in the README.)

**The effects the renderer paints.** The handoff's Part A stops at the furniture and jumps to the Observer, but the roster's own drawing lives in `CanvasRenderer` — the effect modules compute state, they do not draw. Everything that reaches the screen through `drawBrick` is covered by the brick recipe; the threads, veils, particle fields, debris, reticles and score pops are not, and a 1-px line becomes a 3×3 block beside an HD wall. Taken as the tail of Part A rather than as a gap to argue about, and likely to split once the split view shows which of them actually read as coarse.

## Out of scope here

Part B (the Observer in HD) is deferred and will need its own spec: the bundle predates `2026-09-18-observer-43-levels`, `2026-09-19-observer-one-eye-43-placements` and `2026-09-19-bestiary-and-bosses`, so its eye/veil art covers roughly half of what is on screen — it knows nothing of the twenty-species bestiary, the bosses grown by `doubled()`, or THE CHART.

Also deferred, each its own ticket: the DEMAKE filter on the HD path (every `mix()` tone falls outside `DEMAKE_GROUND_TONES`, so it needs its own mapping), and the capsule catalogue and level gallery, which call the sprite functions at `scale: 1` and so stay classic until an HD path exists at that scale.

## Verification

Per step: `pnpm typecheck`, `lint`, `fmt:check`, `build`, `check:backgrounds`, `check:drops` green. Then `art split` in a real Chrome on SUNRISE, a granite level and a fence level. Then the owner's QA. Performance budget: the canvas does not change size and nothing new is painted per frame except the bricks, which cost what they cost today.
