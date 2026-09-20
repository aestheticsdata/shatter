# Handoff: SHATTER — HD pixel-art pass (3× fine grid)

> **Amended 2026-09-20 — superseded by `docs/superpowers/specs/2026-09-20-hd-pixel-art-pass-design.md`.**
>
> The art below is the target and is unchanged. What the repo spec corrects is the **inventory**: this document is narrower than the game, and the rule agreed with the owner is that nothing shipped gets left on classic art.
>
> - **Bricks**: the recipe covers 8 of 10 kinds. `R` (granite, hashed grain and pits) and `F` (fence) are missing and are in scope.
> - **Bricks are drawn, not baked.** `drawBrick` takes seven live paint modifiers (GHOST, PAYDAY, ERODE, COLLAPSE, JELLY, SLUMP, WRATH) plus a per-cell seed, two of them continuous — no sprite cache can key on that. The HD recipe is drawn on the fine grid per frame, at about today's cost.
> - **Damage** uses the repo's authored ramps (`BRICK_RAMPS`, `BRICK_STRAIN_RAMPS`, `GILD_RAMP`, per-kind `wear`), not a `mix()`-derived hurt face, which would discard authored tones.
> - **Paddle**: 6 states, not 2 — base 46, WIDE 72, XWIDE 144, JAMMER 30, SPLIT 66/gap 26, and `MirrorPaddle`. The deck telescopes 1 px per edge per tick, so the recipe bakes per live width, not per named state.
> - **The deck's light bar needs a narrow case.** Six fine px off each cap weld leaves a 20 px SPLIT half unlit, where classic still shows two game px of sheen. Inset a quarter of the body span, capped at six — the wide deck is untouched.
> - **The turret's charge cap is a cue, not decoration.** It runs white only while the cannon is still coming out; a finished one shows its bore.
> - **Backgrounds**: 9 themes, not 8 — `observer` is the ninth painter.
> - **The ball's trail is not new and is not always on.** RUSH and TURBO already draw one, and that streak is the game's cue for a fast ball; an always-on trail would spend it on every ball. The HD path redraws the streak where the game puts it, in the capsules' own tones. Its taper is gentle rather than the quarter-width this document asks for: the streak here is two copies of one tick's displacement, so a copy that small would sit entirely inside the ball's own footprint.
> - **The ball's family comes with it** — the MULTI/SWARM newborn pip, and TEMPO's pace ghost. Neither is in this document, and both are the ball's own silhouette drawn another way.
> - **`L` is not new.** It ships, with `rivets: true` and `capsules: false`; its tones already match.
> - **Silver `S`** takes this document's tones (`#8f9ac8` / `#dbe4ff` / `#3c50a0`), confirmed by the owner; `bricks.ts` is updated for both paths.
> - **Capsule `20 × 8` is right** — verified against `drawCapsule`.
> - **The capsule's letter cannot be baked into its sprite.** A fixed 16 px overflows a four-character glyph, `uprightText` has to turn it back over under FLIP, and DEMAKE punches it out of the pill in ground. It stays live text and takes the 2 px ink shadow — except on a dark-lettered kind, where ink under ink says nothing.
> - **Part B is a version behind.** `2026-09-18-observer-43-levels`, `2026-09-19-observer-one-eye-43-placements` and `2026-09-19-bestiary-and-bosses` landed after this bundle; its eye art knows nothing of the bestiary, the bosses grown by `doubled()`, or THE CHART. Deferred to its own spec.
> - Where this README and its prototypes disagree, the Observer file wins — this README names it the spec of record. The brick drop shadow turned out not to be a disagreement: the Observer prototype and this README both say `#05050f`; only `SHATTER HD.dc.html` says `#03080e`.
> - `PROMPT-claude-code.md`, named in the delivery instructions, is not in the bundle. This README was used as the brief.

**Repo**: `aestheticsdata/shatter`, branch `master`.
**Design references in this bundle** (open them in a browser, they are playable):

- `SHATTER Observer HD.dc.html` — **the spec of record for the art.** The Observer proposal (five veils, eye, zodiac wheel, brood, oculi, diadem) redrawn in HD. Rules are byte-for-byte those of `SHATTER Observer v2.dc.html` (see `docs/2026-09-17-observer-veils-design.md` in the repo / the earlier `handoff/` bundle); only drawing changed.
- `SHATTER HD.dc.html` — level 1 (SUNRISE) of the _shipped_ roster in HD, with a **C** key (classic ↔ HD) and a **V** key (split-screen compare). Shows how the existing game looks after the pass, and the A/B tool to keep in dev builds.
- `support.js` — runtime the two files need to open. Not for the repo.

## About the design files

These are **design references written in HTML/JS** — prototypes of the intended look and behaviour, not code to paste. The task is to **recreate the drawing in the repo's own renderer** (`src/render/CanvasRenderer.ts`, TypeScript, canvas 2D, pnpm scripts, `check:*` guards), following its patterns. That said, the sprite recipes in the prototype's logic class are written as plain, framework-free pixel code (a small software raster + `drawImage`), so they port almost line for line into TS. The appendix maps every visual to the method that draws it.

## Fidelity

**High-fidelity.** Every colour, size and offset below is what the prototype draws and is the target. Where a value is a starting point (dither ratios, twinkle periods) it says so.

## The idea in one paragraph

The renderer already has a **`SCALE = 3` backing store**: the game simulates on a 372×300 grid and paints on 1116×900. Today every sprite fills 3×3 blocks, so the fine pixels are wasted. The HD pass **draws on the fine grid** — bevels, ordered dither, round balls, curved eyes — while **the game grid, the rules, the palette and the layouts do not change**. Same collision boxes, same level rows, same brick tones from `bricks.ts`, same seeded backgrounds. It is an art pass, not a refactor.

Two rendering paths co-exist behind one flag (`artMode: 'classic' | 'hd'`): classic stays as it is (regression safety, and the DEMAKE filter keeps working); HD is new code. A split view draws both halves for review.

## Fixed geometry (unchanged from the game)

| Thing              | Game px                                              | Fine px (×3)                    |
| ------------------ | ---------------------------------------------------- | ------------------------------- |
| Field              | 372 × 300                                            | 1116 × 900                      |
| Frame rails        | x 0–3, x 369–372, y 0–3                              | 9 px thick                      |
| Brick grid         | origin (6, 38), cell 30 × 12, 12 columns             | cell 90 × 36                    |
| Brick visible body | inset 1 px → 28 × 10                                 | inset 3 → 84 × 30               |
| Ball               | 8 × 8                                                | 24 × 24                         |
| Paddle             | y 276, h 7 (roster) / h 9 (Observer), w 46 / 72 wide | sprite 24 px tall in both files |
| Capsule            | 20 × 8                                               | 60 × 24                         |
| Oculi plaques      | 20 × 14 at y 16, x 52 / 176 / 300                    | 60 × 42                         |

**Positioning rule that makes it look HD:** HD sprites are blitted at `Math.round(x * 3)`, classic ones at `Math.round(x) * 3`. Motion gets 3× finer steps for free; nothing in the simulation changes.

**Display:** `imageSmoothingEnabled = false` on the context; CSS `image-rendering: pixelated` **only when the display scale is ≥ 1**, `auto` below (a downscaled pixelated canvas shimmers). The prototype toggles it in its resize handler.

## Drawing toolkit to add (one file, ~120 lines)

`src/render/pix.ts` — a tiny software raster, baked once per sprite into an offscreen canvas:

- `class Pix { w, h, data: Uint8ClampedArray }` with `set(x,y,hex)`, `rect`, `dither(x,y,w,h,hex,t)` (4×4 Bayer, threshold `t·16`), `vgrad(x,w,stops)` (dithered vertical gradient), `disc(cx,cy,r,hex,t?)` (filled or dithered disc), `ring(cx,cy,r,hex,dash?)` (midpoint circle, optional dash), `discBand` (disc clipped to a row band — the dunes), `rgrad(cx,cy,r,tones)` (radial gradient dithered through a tone list), `toCanvas()` via `putImageData`.
- `BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]`.
- `mix(a,b,t)` — linear hex blend. All intermediate tones below are derived with it from the palette, so the palette stays the single source of truth.
- `pillRows(h)` — per-row inset for a capsule/pill of height `h`.
- `scale3x(rows, palette)` — AdvMAME3x upscale of the existing ASCII bitmaps (beasts, tears). Keeps the 1× bitmaps as the source of truth; the diagonals resolve, the tells survive.
- `SpriteCache`: `Map<string, HTMLCanvasElement>`, keyed by kind + variant. Everything static is baked on first use; per-frame work is `drawImage` only. Backgrounds are baked once per level.

## Part A — the shipped game in HD (`SHATTER HD.dc.html`)

### Bricks (`brickSprite`)

Per kind, from `bricks.ts` tones `light / flat / dark`. Derived: `L2 = mix(light,#fff,.5)`, `L1 = light`, `M1 = mix(flat,light,.3)`, `M0 = flat`, `D1 = mix(flat,dark,.45)`, `D2 = dark`, `D3 = mix(dark,#000,.4)`. Body at inset 3 (`ox = oy = 3`, `w = 84`, `h = 30`):

1. Drop shadow into the joint: `#05050f` 2 px along bottom (`ox+2, oy+h, w, 2`) and right (`ox+w, oy+2, 2, h`).
2. Outline `D3`, corners knocked (rect `ox+1,oy,w-2,h` ∪ `ox,oy+1,w,h-2`).
3. Fill `M0` inside (`ox+1,oy+1,w-2,h-2`).
4. Top band `M1` 5 px, then 4 rows of 50 % dither `M1` (rows 6–9).
5. 4 rows of 50 % dither `D1` (rows h−12…h−9), then solid `D1` 7 px at the bottom.
6. Bevel: `L1` 1 px line top and left (inset 1), `D2` 1 px line bottom and right.
7. Specular: `L2` at (`ox+4, oy+3`) 14×1, (`ox+4, oy+4`) 6×1, (`ox+w-14, oy+3`) 5×1.

Kind marks (Observer file, drawn in **game-px** blocks so they stay chunky): `S` silver cross, `G` gold cross with a light core, `L` lid rivet line, digits a bar + stem. Each mark is `D2` with a 1-fine-px `L1` line under it (engraved).

Hurt (multi-hit) face: `light = mix(flat,light,.35)`, `flat = mix(flat,dark,.55)`, `dark = mix(dark,#000,.35)` + three 2-px zig-zag cracks in `D3` from (18,4), (56,4), (40,20). Rebuilt bricks (WRATH) flash white every other 2 ticks for 16 ticks.

Kill flash: 2 ticks white then 1 tick `light`, full body. Debris: 10 chunks per brick, 2–3 fine px, in the brick's own three tones, gravity 0.22, life 22–40 ticks, cap 240.

### Ball (`ballSprite`) — 24 × 24

`disc(12,12,12, mix(#c98f0a,#000,.4))` rim → `disc(12,12,11,#c98f0a)` → `disc(11,11,10,#ffe14a)` + `disc(11.5,11.5,10.5,#ffe14a, .5)` → highlight `disc(9,9,4.5,#fff9d0)` + `disc(9.5,9.5,5.5,#fff9d0,.5)` → white glint 2×2 at (7,7) + (9,7) + (7,9). Trail: three squares at the previous positions, 14/9/5 px in `#c98f0a / #8a6a00 / #4a3f0d` (Observer) — or alpha-faded yellow squares (level 1 file). Tweakable; a trail is the one thing the classic art never had, keep it subtle.

### Paddle, roster (`paddleSprite`, level-1 file) — pill, 24 px tall

Palette `body #2d7fe0, cap #e8384f, sheen #a8d8ff, shade #0b3a78`. Outline `mix(shade,#000,.5)` on `pillRows(24)`; inside, per row: 0–2 `sheen`, 3–5 `mix(body,sheen,.4)`, 6–13 `body`, 14–16 50 % dither `body/mix(body,shade,.55)`, 17–18 `mix(body,shade,.55)`, 19+ `shade`. Caps: 8 game px (24 fine) at both ends in `cap`, rows 0–2 `mix(cap,#fff,.4)`, 14–16 dithered to `mix(cap,#000,.45)`; a 1-px outline column separates cap from body. Light bar rows 9–11 in the middle: 13-on/2-off dashes, row 10 `sheen`, rows 9/11 `mix(body,sheen,.5)`. Wide paddle (72) is the same recipe on a wider canvas.

### Capsules (`dropSprite`) — 60 × 24 pill

`O = mix(col,#000,.5)` outline on `pillRows(24)`; inside rows: 0–1 white, 2–4 `mix(col,#fff,.45)`, 5–15 `col`, 16–18 50 % dither `col / mix(col,#0b0b26,.5)`, 19–21 `mix(col,#0b0b26,.5)`, 22 `#0b0b26`. Letter: Silkscreen 16 px centred at (30, 13), 2-px `#0b0b26` shadow, white (dark ink on the yellow PIERCE capsule). **The roster has ~60 capsules with drawn effects (`capsuleScenes.ts`) — see the estimate.**

### Frame (`drawFrame`) — nine 1-px rails, mitred

Roster (silver): `['#6f7aa8','#eef2ff','#dbe4ff','#dbe4ff','#c9d2f2','#b4bee6','#a0aad6','#8f9ac8','#5c6690']` drawn as concentric rectangles `i..FW-1-i` (top and both sides, no bottom rail). Rivets 3×3 (`#5c6690` body, `#f4f7ff` top-left, `#8f9ac8` bottom-right) at y 40, mid, FH−43 on the sides and x 40, mid, FW−43 on top.

Observer (bronze): `['#3b2a0e','#ffe9a0','#f4dd8a','#dfae2c','#dfae2c','#c9a24a','#a8841c','#7a5a08','#3b2a0e']`; rivets 5×5 `#7a5a08` + 2×2 `#ffe9a0` + 1 px `#3b2a0e`, every 24 game px along the top from x 12, and at FH/3 and 2FH/3 on the sides.

### Background, SUNRISE / `horizon` theme (`paintHorizon`)

**Same seeded layout as the shipped theme** — call the theme's existing `makeRandom(hashSeed('horizon:0'))` sequence in the same order (horizon, 18 stars, 2 dunes), then keep drawing from the _continuing_ generator for the HD-only detail (90 fine stars, 160 grit). Classic and HD then share every star and dune.

- Sky: `vgrad` over `[[hz-210,base],[hz-120,sky1],[hz-90,sky2],[hz-60,sky3],[hz-30,glow],[hz-8,glowHi]]` (theme tones: `base #061019, sky1 #08161f, sky2 #0b1b26, sky3 #0e202c, glow #112733, glowHi #152f3c, dome #183744, ground #040c12, dune #020809, star #2a4a5c`).
- Pre-dawn dome: `rgrad(0.56·FW, hz, 260, [null, sky3, glow, glowHi, dome])`.
- Stars: the 18 seeded ones as crosses (`#5a89a0` centre, `#2a4a5c` arms); 90 fine single pixels `#1d3846`.
- Horizon line 1 px `#1e4050`; ground `#040c12` with grit `#08141c`; dunes: rim `#0a1a22` (r+1) then `#020809`.

The other 7 themes get the same treatment: keep their generator calls, add dithered gradients and fine detail after them. `check:backgrounds` stays green because adjacency is unchanged.

### Panel (HTML, `index.html` + `css/tokens/colors.css`)

Type: **Silkscreen** 16 / 24 px for labels and readouts, **Press Start 2P** 16 px for the wordmark (both Google Fonts; `Press Start 2P` is already the house face). Insets: `#0d0d24` with `inset 2px 2px 0 #05051a, inset -2px -2px 0 #e6e8f4` (roster) — bronze variant for the Observer: panel `#2a1d0c`, inset `#0b0b26` with `inset -2px -2px 0 #7a5a08, inset 2px 2px 0 #05050f`, labels `#c9a24a`, rules `#7a5a08` over `#dfae2c`. Lives as small paddle glyphs (9+30+9 × 12 px, roster) or comet glyphs (Observer).

### Dev tooling

Console words: `art classic`, `art hd`, `art split` (the prototype's **C** / **V** keys). Split draws the classic frame to an offscreen canvas and blits its left half over the HD frame, with two tags `CLASSIC 1X` / `HD 3X`. Optional `crt` flag: 1-px `rgba(0,0,0,.22)` scanline every 3 fine px.

## Part B — the Observer in HD (`SHATTER Observer HD.dc.html`)

Only if the Observer proposal ships. Rules: `docs/2026-09-17-observer-veils-design.md`. Art:

### The eye (`scleraSprite`, `irisSprite`, `pupilSprite`, `drawEye`)

Per veil `eye = {x, y, hw, hh}` in game px; opening `open` ∈ [0.08, 1] (blink 14 ticks every 180–440; THE LID sits at 0.08). `hhO = max(2, round(hh·open))`, `HW = hw·3`, `HO = hhO·3`.

Sclera, baked per `(hw, hhO)`: almond rows `w(t) = W·(1 − t²)`, `t = dy/H`:

- rim `#3b2a0e` at (HW+4, HO+3), rim `#7a5a08` at (HW+2, HO+2), top-edge gold `#ffe9a0` at (HW+1, HO+1);
- sclera `#dbe4ff` at (HW, HO); shading `#c7d2f5` solid for `t < −0.62`, dithered in over `−0.62…−0.4`, dithered in again for `t > 0.84`;
- upper lid line `#dfae2c` (top 3 rows), lower `#7a5a08` (bottom row);
- four lashes 2×9 px on the almond's own edge at ±(HW−9) and ±(HW−27), leaning outward one px every 3 rows, tips `#ffe9a0`;
- corner tendons 9×3 `#7a5a08` with a `#dfae2c` top line.

Iris radius `ir = round(hh·0.8)`, pupil `pr = round(hh·0.34)` (game px ×3). Tracking: `ox = clamp((tx − cx)·0.4, ±(hw − ir − 4))`, `oy = clamp((ty − cy)·0.22, ±(hhO − pr − 1))`; target = nearest live ball in play, else the paddle centre. Iris and pupil are **clipped to the almond** (`HW−2`, rows `−HO+3 … HO−2`).

Iris sprite per tint (`blue #2d7fe0/#1d47a8/#63b0ff`, `red #e8384f/#8e1220/#ff8a9c`, `gold #ffcf1c/#f07d10/#ffe9a0` while the gate is open): edge disc, body disc at r−3 plus 50 % dither at r−1, 28 radial fibres from 0.42r to r−3 alternating inner/edge tones, centre dithers `inner` 35 % at 0.5r and `edge` 50 % at 0.42r.

Pupil: `#05050f` disc; **round** glint `disc(c − 0.42·PR, c − 0.44·PR, max(1.5, 0.18·PR), #fff)` + secondary `disc(c + 0.1·PR, c − 0.06·PR, 0.45·that, #dbe4ff)`. Empty socket (THE LID awake): `#55000f` disc, `#8e1220` at r−2 + 50 % dither at r−1. Red tint adds four 2-px veins from the corners toward the iris. THE TEAR adds two tear tracks (2×27 and 2×18 `#3c50a0`, a `#63b0ff` bead) under the pupil.

### The zodiac wheel (baked into the background, `bakeBackground`)

Centred on the socket. Rings (game-px radii ×3): 96 `#151a38`; 86 two px `#1f2650`; 82 dashed (24) `#2b3a72`; 60 dashed (8) `#1b2244`. 36 ticks from r 84 (minor, `#2b3a72`) or r 82 (major every 3rd, `#3c50a0`, 2 px) to r 86. Twelve glyph crosses at r 91: centre `#4a5fb0`, arms `#3c50a0` then `#2b3a72`. Starfield: 90 fine stars `#1b2244 / #333f78 / #6c7cb4`, every other third one a small cross. Floor ticks at `y = (PY+PH+6)·3`: 24×1 `#151a38` over 18×1 `#10142e` every 16 game px.

### Inside the eye (`bakeIris`)

Full-field iris: bands at game radii 104, 98, 88, 76, 66, 56, 46, 38 (each solid + 50 % dither ring 4 px outside) through `blue: #12276a,#1d47a8,#2d7fe0,#1d47a8,#2d7fe0,#63b0ff,#2d7fe0,#1d47a8` (red analogue `#55000f,#8e1220,#e8384f,…`), 28 fibres from r 40 to 100, a 4-px `#0b0b26` limbus at 100–104, sclera `#dbe4ff` with 60 faint `#c7d2f5` streaks. Lash line across the top: 18 game px `#3b2a0e`, 2 px `#7a5a08`, 2 fine px `#dfae2c` + 1 `#ffe9a0`, lash stubs every 22 game px.

### The loose pupil / boss (`drawPupil`)

Six spokes rotating with `o.t·0.5`, from R+6 to R+48, `#e8384f` with a `#8e1220` twin 1 px right. Disc R+3 `#55000f`, R `#05050f`, round glint r 5 at (−17, −19) + r 2 `#dbe4ff` at (−8, −11). Hit flash: rings R+9, R+10 white, R+15 `#ffe9a0`. HP bar 6 px tall under it (`#2a1000` track, `#e8384f` fill, `#ff8a9c` top 2 px). Inside-the-eye timer: 6-px bar at y 18 across FW−60, `#ffcf1c` → `#e8384f` under 270 px.

### The gaze (`drawGaze`)

Charge: two concentric rings at `r = (5 + t mod 9)·3`, alternating white / `#ffcf1c` every 3 ticks. Fire: from the pupil to the rail, 18 px `#8e1220/#e8384f` flicker, 10 px `#e8384f/#ff8a9c`, 4-px core `#fff9d0`, hatch bars 24×2 `#ff8a9c` every 21 px sliding with the flicker.

### Paddle, the Chariot (`paddleSprite`)

Bronze pill (`body #dfae2c, hi #ffe9a0, dk #7a5a08, dk2 #3b2a0e`; `mid = mix(body,hi,.4)`, `low = mix(body,dk,.45)`), rows as the roster paddle. Ribs every 12 px from x 36: 2 px `dk` + 1 px `hi`. **Gems set in bezels** at `gx = 12` and `Wf − 13`, `y = 12`: `disc r9.5 dk2` → `disc r8.5 hi` → `disc(gx+1, 13, 8.5, dk)` (shade) → `disc r7 dk2` (seat) → `disc r6 #8e1220` → `disc r5 #e8384f` → `disc(gx−1.5, 10.5, 2.8, #ff8a9c)` → `disc(gx+1.5, 13.5, 3.5, #8e1220, .5)` → white 2×2 at (gx−3, 9); four prongs 2×2 at (gx±8/6, 4) in `hi` and (…, 18) in `dk`. Blue core: 24×21 rim `#0b3a78` at centre, 20×17 `#2d7fe0`, highlight 8×2 `#a8d8ff` + 2×6, 45 % dither of rim over the bottom 6 rows, a 2×11 + 4×3 `#a8d8ff` centre bar. Above ×3 chain the core is gold (`#ffcf1c / #fff9d0`). Petrified: whole thing in `#8f9ac8 / #dbe4ff / #3c50a0 / #1b2244`, gems `#5a5e80`, two 2-px cracks. Thrusters under it: two 9×5/3 flames `#e8384f → #f07d10 → #ffcf1c → #fff9d0` alternating every 2 ticks while in play. Laser turrets: 6×9 `#3b2a0e` with a 4×8 `#ffcf1c` core and `#fff9d0` cap; bolts 4×27 `#ffcf1c` with a 2×22 `#fff9d0` core.

### Brood (`scale3x` of the v2 bitmaps), tears, oculi, diadem, gate, pops

- **Beasts**: the ASCII bitmaps of v2 (egg 16×12, hatchling 20×14 two frames, wyvern 28×14 two frames, tear 5×8) upscaled with `scale3x` at bake time; an 18×2 `#151a38` shadow 5 px under the sprite; white 55 % flash overlay 8 ticks when struck.
- **Oculi**: 60×42 plates, 2-px chamfer, edge `#7a5a08` (next: blinks `#ffcf1c` 22/40 ticks; taken: `#3fbf4f`), fill `#3b2a0e` (taken `#155c1f`), 1-px top/left highlight `mix(edge,#fff,.35)`, 1-px bottom/right `#1f1608`, four 2×2 rivets, numeral I/II/III Silkscreen 16 px with a (+2,+3) `#1f1608` shadow, ink `#c9a24a` / `#ffcf1c` / `#a6f0a6`.
- **Diadem**: unlit star 3×3 `#2b2d40`, centre `#4a4c60`, four dots at ±3; lit star: twinkling arms 8 ↔ 12 px every 15 ticks (`#ffcf1c` ↔ `#ffe14a`), 9×3 + 3×9 `#ffcf1c`, 5×5 `#ffe14a`, 3×3 `#fff9d0`, four `#ffe9a0` corners; neighbours joined by a dashed (8) `#7a5a08` line with a `#3b2a0e` shadow line.
- **Gate**: 9-px band of 12-px chevrons cycling `#ffe14a / #f07d10 / #e8384f` (each with 40 % lighter top 2 rows and 40 % darker bottom 2), 3-px pillars `#ffcf1c` with a `#fff9d0` edge, 3-px countdown bar at y 12 in `#8fd0ff` with a `#d6ffff` top line.
- **Score pops**: Silkscreen 16 px, `#0b0b26` shadow (+2,+2), `#ffe14a` for the first 22 ticks then `#8a6a00`, rising 0.35 game px a tick.

## Design tokens

- **Roster palette** (`palette.ts` / `bricks.ts`): bricks `1 #e8384f/#ff8a9c/#8e1220`, `2 #f07d10/#ffc27a/#8a3d00`, `3 #ffcf1c/#fff59a/#8a6a00`, `4 #3fbf4f/#a6f0a6/#155c1f`, `5 #2d7fe0/#a8d8ff/#0b3a78`, `S #8f9ac8/#dbe4ff/#3c50a0`, `G #dfae2c/#ffe9a0/#7a5a08`, `L #c9a24a/#ffe9a0/#7a5a08` (new, Observer). Ball `#ffe14a / #fff9d0 / #c98f0a`. Ink `#0b0b26`, deep `#05050f`. Wall `#dbe4ff / #8f9ac8`.
- **Bronze** (Observer UI): `#3b2a0e, #7a5a08, #a8841c, #c9a24a, #dfae2c, #f4dd8a, #ffe9a0`, panel `#2a1d0c`, label `#c9a24a`.
- **Night blues** (wheel, stars): `#10142e, #151a38, #1b2244, #1f2650, #2b3a72, #333f78, #3c50a0, #4a5fb0, #6c7cb4`.
- **Type**: Silkscreen 400 at 16 / 20 / 24 / 32 px; Press Start 2P 400 at 16 (wordmark), 36–64 (cards). Letter-spacing 1–6 px on labels, 10 px on THE OBSERVER.
- **Dither**: 4×4 Bayer only; 50 % for material bands, 30–65 % for glows. No alpha blending inside sprites (the trail and hit flashes are the only translucent draws).
- **Every intermediate tone is `mix()` of two palette tones** — no new hex outside the lists above.

## Build order & estimate

| Step        | Ships                                                                                                                       | Effort                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1           | `pix.ts` + `SpriteCache`, `artMode` flag, fine-grid blit, `art` console words, split view                                   | ½ day                                    |
| 2           | Bricks (all kinds + hurt/rebuilt faces), debris                                                                             | ½ day                                    |
| 3           | Ball + trail, roster paddle (46 / 72), laser turrets and bolts                                                              | ½ day                                    |
| 4           | Frame, panel type + insets                                                                                                  | ½ day                                    |
| 5           | Backgrounds: 8 themes, seeded-layout parity, dithered gradients                                                             | 1 day                                    |
| **A total** | **the shipped game in HD**                                                                                                  | **≈ 3 days**                             |
| 6           | Capsules: 60 pill sprites are cheap; **the ~60 drawn effects in `capsuleScenes.ts` and the DEMAKE tells** are the long tail | 1–2 weeks                                |
| 7           | DEMAKE filter on the HD path, gallery thumbnails                                                                            | 3–5 days                                 |
| 8           | Part B — Observer art (eye, wheel, iris field, brood, oculi, diadem, gate, gaze, Chariot)                                   | 3–4 days, after the Observer rules exist |

Verification per step: `pnpm typecheck`, `lint`, `fmt:check`, `build`, `check:backgrounds`, `check:drops` green; then `art split` on SUNRISE, a granite level and a fence level in a real Chrome; then the owner's QA. Performance budget: no per-frame pixel work — everything baked; the background is one `drawImage`.

## Appendix — where each drawing lives in the prototype

`SHATTER Observer HD.dc.html`, logic class:

| Visual                                                    | Method                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| raster toolkit, Bayer, `mix`, `pillRows`, `scale3x`       | top of the class file (`Pix`, helpers)                                                                 |
| starfield + zodiac wheel + floor ticks                    | `bakeBackground(eye)`                                                                                  |
| inside-the-eye field                                      | `bakeIris(bands, fibers)`                                                                              |
| sclera / iris / pupil / eye assembly                      | `scleraSprite`, `irisSprite`, `pupilSprite`, `drawEye`                                                 |
| bricks, kind marks, hurt face, rebuilt flicker            | `brickSprite`, `drawBrick`                                                                             |
| the Chariot, gems, core, petrified, thrusters, turrets    | `paddleSprite`, `drawPaddle`                                                                           |
| ball + trail                                              | `ballSprite`, `drawBall`                                                                               |
| capsules                                                  | `dropSprite`, `drawDrop`                                                                               |
| diadem, oculi, gate, brood, tears, gaze, pupil boss, pops | `drawDiadem`, `drawSigils`, `drawGate`, `drawBeasts`, `drawTears`, `drawGaze`, `drawPupil`, `drawPops` |
| frame                                                     | `drawFrame`                                                                                            |
| title eye + wheel                                         | `drawTitle`                                                                                            |

`SHATTER HD.dc.html`: `paintHorizon(hd)` (seeded parity, both arts), `brickSprite / ballSprite / paddleSprite / dropSprite (k, hd)` (classic and HD recipes side by side), `drawFrame(g, hd)`, `paint(g, hd)`, `draw()` (split view), `crtLayer()`.
