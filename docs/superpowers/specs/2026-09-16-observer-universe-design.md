# The observer — a universe for SHATTER

**Date**: 2026-09-16
**Status**: design draft. The mechanics were decided in a brainstorming session and are marked **fixed** below. Every look, tone, motion, sound and line of copy is marked **open** and is what Claude Design is asked to refine or amend. Numbers are starting values, to be tuned in play.
**Audience**: Claude Design first, then the tickets that will be cut from the final version of this document.
**What the game is today**: the playable mockup [SHATTER.dc.html](https://claude.ai/design/p/ef3c88b2-5b26-4718-81f4-0d354e0592bc?file=SHATTER.dc.html) was the spec of record for the rebuild; the shipped game is described in `README.md` and drawn in `docs/ARCHITECTURE.md`.

## 1. SHATTER in one page, for a reader who has not seen it

An Amiga-style brick breaker for one player, in the browser. A fixed **480×300 stage**, scaled to the viewport: a **372×300 pixel-art canvas playfield** on the left and a **108 px Workbench-style side panel** on the right (score, hi-score, level name, lives as a rack of paddles, a POWER inset naming live capsules). Fonts: Press Start 2P for the title wordmark, Silkscreen at 7 px for everything else. Audio is 100% synthesized chiptune, no files.

**Geometry** (game pixels, before the 3× scale):

| Thing | Where |
| --- | --- |
| Field | 372 × 300; playable x 3..369, top y 3; the frame is a 3 px bar in `#dbe4ff` / `#8f9ac8` |
| Grid | origin (6, 38); 12 columns of 30 × 12 px cells; the deepest wall is 8 rows, ending at y 134 |
| Band | the empty stretch between the wall and the deck; BUMPERS' discs live in y 165..216 |
| Deck (paddle) | rests on a rail at y 276; TIDE can float it up to y 180 |
| Ball | an 8 px sprite, `#ffe14a` body, `#fff9d0` highlight, `#c98f0a` shade; **never reshaped, never recoloured** |
| Bottom | open; a ball past y 300 is lost |

**Content**: 38 named levels (SUNRISE, SMILEY, PYRAMID, … EYE, HOURGLASS, CENTIPEDE, FLOPPY, FINALE), looping with rising ball speed. Eight static backgrounds (starfield, nebula, blueprint grid, sunrise horizon, gas giant, circuit board, CRT cathode, stone vault). 59 capsules, dropped by bricks from a shuffled bag, in four tiers: common, uncommon, rare, trap. The newest capsules are SUPERPOSE, COLLAPSE, TWIN, LEAP and HEISEN, and their source files are called Superposition, Decoherence, Entanglement, Tunnelling and Uncertainty. The game already speaks the language of this universe; it has never said its name on screen.

**Brick kinds**: `1`..`5` (one hit, 60–100 pts, red / orange / yellow / green / blue), `S` silver (two hits, 150), `G` gold (three hits, 200), `R` granite (four hits, 250), `F` the fence post (a trap's timber, 0 pts). Each kind is one row in a roster with its `flat`, `light` and `dark` tones; everything else derives.

**The house voice**: names in capitals, one word where one will do. The README explains every capsule in a paragraph that starts with a bold sentence saying what is unique about it. That is the register this spec is written in, and the register the bestiary's blurbs must keep.

## 2. The premise

**You are the observer.** The wall is a lattice nobody has looked at, and a brick is undecided until the ball reaches it. The hit is the measurement, and a measured brick has only one way to be, which is broken. That is what shattering means here: collapse. The paddle is the detector at the bottom of the chamber, and a ball that gets past it is a measurement lost. Capsules are what the lattice throws off under bombardment. Particles are loose in the chamber, and they come in four verbs: scatter, shield, split, annihilate. And every sixth wall you collapse, something looks back.

## 3. Decisions already made — fixed

1. **The universe is the observer.** Not a haunted 1991 machine, not a gothic pinball table, not space. Those were considered and set aside.
2. **Additive.** No existing capsule, level, background, sound or panel element changes. The universe is expressed through what is added: particles, the eye, and the words on the screens.
3. **Particles arrive through gates on a clock**, on every level, and a level may pin its own inhabitants the way SUPER MAZE pins its two LASER drops.
4. **The boss is an interlude**, fought after every sixth level clear, taking no slot in the level roster.

What follows implements those four. Where a rule is stated as a number, the number is a starting point and lives in one config knob.

## 4. House rules the design must keep

These are rules the project has already paid for and will not relitigate.

- **The ball's silhouette is sacred.** Nothing reshapes or recolours the ball. The antiball is drawn with the ball's own sprite in another palette. The neutron the nucleus releases is a ball, born the way a MULTI clone is born.
- **Everything arrives and leaves with a fade, in its own idiom.** A gate opens before a particle appears. A photon dims before it dies. The eye descends and shatters. A hard on/off is a defect.
- **Everything acts on the field.** No requesters, no widgets, no inventories, no deferred payoffs. A particle is a thing the ball hits. The eye is a thing the ball hits.
- **A latent threat wears a held cue on itself**, not in the panel: the antiball's halo, the electron's orbit ring, the eye's glint.
- **Readability.** Area tones stay darker than the sprites. Nothing on the field may be mistaken for the ball, so no new sprite is yellow. Every new sprite needs a shape tell that survives DEMAKE, the trap that flattens the whole machine to a 1-bit green tube.
- **Text is measured in pixels, not characters.** Silkscreen is proportional. A bestiary blurb must fit the catalogue's 148 px column at 7 px, and there is a check script for it.
- **The panel's POWER inset names capsules only.** Particles and the eye never appear there; their state is on the field.
- **One plain knob per number** in `GameConfig`, no debug/shipped split.

## 5. The chamber — particles

### 5.1 The object — fixed

A particle is a **disc**: a position, a radius, a velocity, a species. It moves on its own integrator, one step a tick, using the same X-then-Y sub-step against the grid the ball uses, because bricks are matter to it. It reflects off the frame, the wall, the deck's live rectangle, and the rail line at the deck's bottom edge, which is the chamber's floor for particles: only the ball can leave the field. Particles pass through each other. TIDE's water is not matter to them; the floating deck still is.

The species roster is one config file, one row per species: id, name, tones, radius, speed, points, lifetime, blurb. The union type, the palette entries and the bestiary page derive from it, exactly as bricks and capsules do. `ShatterGame` owns the collisions and the scoring, the division the grub, the black hole and the detonation already use; the field module owns the population, the gates and the clock.

### 5.2 The gates — rule fixed, look open

Two **ports in the side frames at band height**, one in each 3 px bar, 12 px tall, centred on y 200: under the deepest wall the game ships, above the deck, clear of BUMPERS' discs.

```
y 3    +------------------------------------------------+   top frame
y 38   | ############  grid: 12 cols x 30 px, rows 12   |
       | ############                                   |
y 134  | ############  the deepest wall ends here       |
       |                                                |
y 194  >  gate, 12 px                       gate, 12 px <   the side bars open here
y 206  >                                               <
       |             the band: particles drift here     |
y 276  |                    =====  deck                 |   the rail is the chamber's floor
y 300  + - - - - - - - - - - - - - - - - - - - - - - - -+   open to the ball only
```

**Opening** (open): over six ticks the 12 px of bar parts, 6 px sliding up and 6 px sliding down, and the gap shows the background through it. The particle emerges from the gap already moving inward, at its own speed, on a heading between 20° and 60° off the horizontal, up or down at random. Six ticks after the particle is 12 px in, the bar closes the same way. The gate used is the one **farther from the deck's centre**, so nothing is born on top of the paddle.

### 5.3 The clock and the bag — fixed

| Knob | Default |
| --- | --- |
| first release, after a level's first launch | 480 ticks (8 s) |
| every release after that | 720 ticks (12 s) |
| population cap | 3 |
| after a lost ball | the chamber is emptied and the clock restarts at 480 after the re-serve |

At the cap the clock holds; it resumes 720 ticks after the population drops. Which species comes out is drawn from a **bag**, one ticket per species allowed, reshuffled when empty, and the bag widens with depth in the 38-level loop:

| Level in the loop | In the bag |
| --- | --- |
| 1 to 5 | photon |
| 6 to 12 | photon, electron |
| 13 to 24 | photon, electron, nucleus |
| 25 to 38 | photon, electron, nucleus, antiball |

### 5.4 Pins — fixed

A level definition gains an optional `inhabitants` list: each entry is a species and, for an electron, the cell it orbits. Pins are released on the level's first serve, before the clock starts, and count toward the cap. Electrons take their orbit during the serve so the player sees them before launching; free particles come through the gate at launch, the one farther from the deck as always.

This pass pins one level, **ORBIT** (level 15): two electrons on the gold core's opposite corners, row 2 column 4 and row 3 column 7, where the layout was already drawing an orbit.

```
ORBIT      ....5555....
           ..55....55..
           .5..GGGG..5.     <- electron on the first G of this row
           .5..GGGG..5.     <- electron on the last G of this row
           ..55....55..
           ....5555....
```

The existing `check:drops` script, which verifies that seeded drops sit on real bricks, is extended to verify that a pinned electron's cell is a real brick.

### 5.5 What the roster does to particles — fixed

| Capsule | Effect on particles |
| --- | --- |
| NUKE | kills every particle, paying each its own points; a nucleus pays its split and leaves no daughters and no neutron |
| STASIS | holds them where they are |
| GHOST | the wall is intangible to them exactly as to the ball |
| FLIP | turns them over with everything else, for free (FLIP is a render and input flip) |
| BLACKOUT | they are in the dark like everything else, except the antiball's halo, which is drawn as its own dim pool: a threat you cannot see is a defect, not a difficulty |
| LASER | a bolt kills a photon, an electron or a daughter; splits a nucleus; annihilates an antiball |
| everything else | nothing. TEMPO, RUSH and TURBO are the ball's clock and a particle is not a ball. SINGULARITY and VORTEX bend balls and eat capsules and leave particles alone. PORTAL is for balls; particles reflect off the side walls. HOMING and MAGNET ignore them |

### 5.6 Contact with the ball — fixed

The ball meets a particle through the disc reflection BUMPERS already has: it leaves along the reflection of its heading off the disc's surface normal, is pushed clear, and keeps its speed. What happens to the particle in that contact is the species' verb. Points are scored silently with a flash, as BUMPERS' kicks are; no floating label.

## 6. The four species

| Species | Verb | Size | Speed | Points | Lives |
| --- | --- | --- | --- | --- | --- |
| PHOTON | scatter | 4 px | 2.5 px / tick | 50 | 1200 ticks, then fades |
| ELECTRON | shield | 4 px on a 36 × 18 orbit | one turn per 90 ticks | 150 | until knocked out or its brick dies |
| NUCLEUS | split | 10 px; daughters 6 px | 0.6; daughters 1.2 | 100 to split, 200 a daughter | until dead |
| ANTIBALL | annihilate | 8 px, the ball's silhouette | 0.8 | 500 | 1200 ticks, then decays |

### 6.1 PHOTON — scatter

**Rule (fixed).** A speck on a dead-straight line, the only thing on the field that never curves. It reflects off the frame, the deck and the wall without harming anything. When a ball meets it, the photon is absorbed and the ball leaves bent **30° toward the photon's heading**, at the speed it arrived with. Scatter, not a kick: Arkanoid's enemy role, a ball sent somewhere you did not plan. It lives 1200 ticks; over its last 60 it dims out.

**Look (open).** A 2 × 2 core in white-cyan `#f4fbff` with a 1 px trail of six pixels behind it in `#8fd0ff` fading to nothing, so the line can be read. Its DEMAKE tell is the trail. Suggested flash on absorption: the core blooms to 6 px for four ticks and is gone.

**Sound (open).** A short high blip with a downward chirp on absorption; nothing while it flies.

### 6.2 ELECTRON — shield

**Rule (fixed).** Through the gate it flies to the **nearest untaken live silver or gold brick** from the gate it came through, the heaviest matter on the field (any untaken live brick if there is none; a pupil cell during the eye), and takes an orbit around it: a 36 × 18 px ellipse centred on the brick, one turn every 90 ticks. **It takes one hit for its brick.** Contact with a ball knocks the electron out, reflects the ball, and the brick takes nothing from that hit. On the far side of its orbit the brick is exposed, so the shield is a timing problem, never a wall. If the brick dies under it, the electron is freed: it flies off along the tangent of its orbit as a photon, which is what ionisation looks like. Two electrons never share a brick.

**Look (open).** A 4 px disc in the paddle's sheen blue `#a8d8ff`. The orbit is drawn as a 1 px dotted ring, one dot every 4 px, in the dim arc blue `#5b74e8`, so the shield is visible from across the field. Its DEMAKE tell is the ring. Knock-out: a spark of four pixels thrown off along the ball's leaving direction.

**Sound (open).** A knock: a detuned pair, very short. The freeing gets the photon's launch, if there is one.

### 6.3 NUCLEUS — split

**Rule (fixed).** Heavy and slow, it drifts in the band and reflects the ball off its surface while **recoiling a fifth of the ball's velocity**. The first hit splits it: two **daughters** fly apart across the impact, along the tangent, at 1.2 px a tick, and a **neutron** leaves the split, which is a ball, born the way a MULTI clone is born, on the incoming ball's heading continued through the nucleus, if a ball slot is free. A daughter reflects the ball and dies on its own first hit. Daughters do not split. It is the one particle that pays in balls, so hunting it is worth the detour.

**Look (open).** A 10 px disc in two tones plus highlight: body `#b84a2a`, shade `#5a1f0e`, highlight `#ffb08a`, a warm heavy thing, nowhere near the ball's yellow. Daughters are the same tones at 6 px. Its DEMAKE tell is its size, and the split. The split: the disc stretches along the tangent for three ticks and parts.

**Sound (open).** A low thud with a rising pair on the split; a pop on a daughter's death. The neutron's birth uses MULTI's clone sound.

### 6.4 ANTIBALL — annihilate

**Rule (fixed).** The ball's dark twin. It drifts from the gate, reflecting off the frame, the wall and the deck. **It cannot be hit.** Contact with a ball annihilates both, in a flash, and takes **PYRE's crater** around the point of contact: cell radius two, the thirteen cells of a plus five wide and five tall, full points, bypassing the damage ramp the way NUKE and ZAP do. It pays 500. Your only ball gone is a ball lost, a life. A spare gone is a trade, and the game already sells that trade in PYRE. A **laser bolt** annihilates it for the same crater and no ball, which makes LASER the tool for it. It lives 1200 ticks; over its last 60 the halo fades and the body dims out. Under NUKE it simply dies.

**Tell (fixed).** A **hairline** is drawn between an antiball and every ball within 24 px, TWIN's shivering thread in TWIN's `#ffbda5`, so the annihilation is announced before it happens.

**Look (open).** `drawBall` at 1:1 with another palette: body `#1d1d4a`, highlight `#b8c8ff`, shade `#0b0b26`. A 1 px halo two pixels outside the sprite pulsing in the death-flash white `#ffffff` at half a hertz. Under BLACKOUT the halo is its own dim pool of light. Its DEMAKE tell is the halo and the thread. The annihilation flash: one frame of whiteout in a 24 px circle, then the crater's own brick death bursts.

**Sound (open).** A womp with a noise burst, the trap catch's detuned family, big: the loudest thing a particle does.

## 7. The eye

### 7.1 When — fixed

Clears are counted per run. After the sixth, and every sixth after it, the CLICK TO CONTINUE on the clear screen leads into the eye instead of the next level. The level counter does not move for it, so the loop position holds; the ball runs at the speed of the level that follows. After the eye, that level, as normal. A run can die during the eye like anywhere else.

### 7.2 The body — rule fixed, look open

The eye is the EYE level's top six rows, brought down from the top frame as one object. Rows 6 and 7 of that level are not part of the boss.

```
col:      0 1 2 3 4 5 6 7 8 9 10 11
row 0     . . . . 1 1 1 1 . . .  .      y 38
row 1     . . 1 2 2 2 2 2 2 1 .  .      y 50
row 2     . 1 2 S S S S S S 2 1  .      y 62    <- the lid parks over rows 0..2 when open
row 3     1 1 2 S P P P P S 2 1  1      y 74    +
row 4     1 1 2 S P P P P S 2 1  1      y 86    | pupil: 12 cells of kind P, x 126..246, y 74..110
row 5     . 1 2 S P P P P S 2 1  .      y 98    + the lid covers exactly this when shut
                                        y 110   the pupil's underside: the only face the ball reaches
```

- **The body** (brow, sclera, socket: every cell above except the P cells) is one solid object drawn in those cells' own brick tones. The ball reflects off it as off the frame. It is invulnerable, never drops a capsule, and is not in the grid.
- **The pupil** is the twelve cells marked P, and they are the only bricks on the field: a new brick kind **P**, one hit, 300 points, no capsule ever (the way the fence post has none), added as one row in the brick roster. Because the grid holds only the pupil, the existing clear condition is untouched: the eye is dead when the grid is empty. Reachability makes the kills go bottom row first.
- **The lid** is a solid bar the pupil's footprint, 120 × 36 px, in the sclera's silver tones. **Shut**: it sits over the pupil, y 74..110, and the whole face is a wall. **Open**: it has swept up 36 px to y 38..74, onto the brow, and the pupil's underside is exposed. It travels in six ticks, 6 px a tick. It is solid wherever it is; on the brow that changes nothing. A lid closing on a ball pushes the ball clear, the disc's own push.
- **Descent**: the body enters from above the frame and slides to its seat over 60 ticks while the serve screen is up; the serve is accepted once it is seated. The lid is shut throughout.

**Look (open)**: the lid's lash line, whether the brow rows keep their bevels, the glint's size, how the eye "sits" when seated (a 1 px settle would be in character). The EYE level itself stays where it is in the roster and the gallery: a portrait of the thing.

### 7.3 The rhythm — fixed

| Phase | Ticks |
| --- | --- |
| shut | 200 |
| open | 40 on the first return, 32 on the second, 24 from the third |
| lid travel, each way | 6 |

While shut, a hit on a P cell is **refused with a plain bounce**. While open, a hit kills the cell, and the body **flinches** two pixels for six ticks. The rhythm pauses, shut, during a serve. The kill order is bottom row first, since that is the face the ball reaches; when the bottom row is dead the next row's underside is the face.

### 7.4 The look and the shot — fixed

On opening, the eye looks at you: the **glint** in the pupil slides toward the nearest ball, within the live pupil area, and returns to centre when the lid shuts. The glint is a true tell: the cells never move. On the tick the lid parks open, **one photon leaves the pupil's underside, below its centre, toward the nearest ball**, at photon speed. It does not count toward the chamber's cap. Opening is the danger and the opportunity in one motion.

### 7.5 The chamber during the fight — fixed

| Knob | Default |
| --- | --- |
| first release, after the first launch | 240 ticks |
| every release after that | 360 ticks |
| cap | 4 |

The bag ignores depth and escalates with the eye (table below). Electrons find no silver or gold, so they orbit the pupil's cells: a shield on the boss, one per cell at most. A lost ball costs a life as on any level, empties the chamber, and the eye stays, shut, through the serve; the fight clock restarts at its first release after the re-serve.

### 7.6 The end — fixed

- **Kill.** Twelve cells dead and the eye **shatters**: the body's cells burst through the brick death burst in their own tones, staggered outward from the pupil over 30 ticks; the lid drops off the bottom of the field. Then the clear screen with the bonus.
- **Timeout.** If the fight reaches **5400 ticks (90 s) from the first launch**, the lid shuts for good and the body lifts back out through the top frame over 60 ticks. The clear screen shows no bonus. A stalemate can never hold the run.

### 7.7 Escalation — fixed

| Return | Open window | In the bag | Bonus |
| --- | --- | --- | --- |
| first | 40 ticks | photon, electron | 5000 |
| second | 32 ticks | photon, electron, nucleus | 10000 |
| third | 24 ticks | photon, electron, nucleus, antiball | 15000 |
| fourth and after | 24 ticks | the same | 20000 |

### 7.8 Where it lives — fixed

One module for the eye: its descent, its rhythm, its glint and its shatter clock, beside the other field objects. `ShatterGame` owns the pupil's refusal while shut and the photon shot. The renderer draws it. One config block holds the rhythm, the windows, the timer, the bonus and the fight's gate clock. There is no new screen state: the fight is `play` with the eye up.

## 8. The words — open

The story lives in one word on the title and in the README, which is where this game's voice already is.

| Where | Now | Proposed |
| --- | --- | --- |
| title tagline | A BRICK BREAKER FOR ONE PLAYER | A BRICK BREAKER FOR ONE OBSERVER |
| title menu | L · LEVELS, B · CAPSULES | plus P · PARTICLES |
| level clear heading | GRID CLEARED | LATTICE COLLAPSED |
| eye killed | none | THE EYE IS SHUT, over THE EYE and BONUS 05000 |
| eye timed out | none | THE EYE LOOKED AWAY, over THE EYE and BONUS 00000 |
| game over heading | GAME OVER | DECOHERENCE |
| hall of fame | HALL OF FAME | unchanged |
| panel, during the fight | the level's name | THE EYE |
| serve hint, during the fight | CLICK TO LAUNCH OR PRESS SPACE | unchanged |

DECOHERENCE is the least certain line here. The README gains a short paragraph at the top of Gameplay stating the premise (section 2, in the game's voice), a species table beside the capsule table, and the eye in a paragraph of its own.

## 9. The sounds — open

Thirteen recipes in the sound bank, synthesized like everything else in it (square pitch-bends, detuned pairs, filtered noise bursts), no file.

| Event | Character |
| --- | --- |
| gate opens | a mechanical slide, two short clicks |
| photon absorbed | a high blip, chirping down |
| electron knocked out | a knock, detuned pair, very short |
| electron freed | the photon's launch |
| nucleus split | a low thud with a rising pair |
| daughter dead | a pop |
| annihilation | a womp with a noise burst, the trap catch's family, big |
| eye descends | a slow low slide, the length of the descent |
| eye opens | a wet click up |
| eye shuts | the same down |
| eye hit | the granite hit, a notch lower |
| eye shatters | the NUKE shockwave's family, longer |
| eye leaves | the descent reversed |

## 10. The knobs — defaults

Two config blocks, plain, no debug split.

| Block | Knob | Default |
| --- | --- | --- |
| particles | first release | 480 ticks |
| | interval | 720 ticks |
| | cap | 3 |
| | gate y, height | 200, 12 px |
| | gate travel | 6 ticks |
| | spawn heading | 20°..60° off horizontal |
| | bag by depth | 1–5 / 6–12 / 13–24 / 25–38, as in 5.3 |
| | photon | radius 2, speed 2.5, scatter 30°, points 50, life 1200, fade 60 |
| | electron | radius 2, orbit 36 × 18, period 90, points 150 |
| | nucleus | radius 5, speed 0.6, recoil 0.2, split points 100; daughter radius 3, speed 1.2, points 200 |
| | antiball | radius 4, speed 0.8, points 500, life 1200, fade 60, thread reach 24 px, crater = PYRE's |
| eye | every N clears | 6 |
| | descent | 60 ticks |
| | shut | 200 ticks |
| | open windows | 40, 32, 24 |
| | lid travel | 6 ticks |
| | flinch | 2 px, 6 ticks |
| | timer | 5400 ticks |
| | bonus per return | 5000, 10000, 15000, 20000 |
| | fight clock | first 240, interval 360, cap 4 |
| | shatter | 30 ticks |
| | pupil kind P | 1 hit, 300 points, no capsule |

## 11. The console — fixed

The test console (⌃⌥⌘K during serve, play or pause) is a word and its arguments, and its legend is its grammar. Two new words, one line each in the legend:

- `particle <photon|electron|nucleus|antiball>` releases one through the gate farther from the deck, ignoring the cap.
- `eye` summons the eye now: the field is emptied and the descent begins.

Every build step ships with the word that lets you test it.

## 12. The bestiary — rule fixed, look open

`P` from the title opens **PARTICLES** on the same scaffolding as the CAPSULES catalogue: each entry a staged miniature of the species on the field, drawn by the game's own sprites, the sprite at real size beside it, and a one-line blurb under it. Four species and the eye make one page. Blurbs must fit 148 px at 7 px Silkscreen and are checked by the same script as the capsule blurbs.

| Entry | Blurb (open) |
| --- | --- |
| PHOTON | IT BENDS THE BALL IT MEETS |
| ELECTRON | IT TAKES ONE HIT FOR ITS BRICK |
| NUCLEUS | SPLIT IT · IT PAYS A BALL |
| ANTIBALL | IT ERASES THE BALL IT TOUCHES |
| THE EYE | HIT IT WHILE IT LOOKS AT YOU |

## 13. Verification — fixed

The project has no unit tests. Each build step is green on `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, `pnpm build`, `pnpm run check:backgrounds` and `pnpm run check:drops`, then walked in a real Chrome through the console words above, and the owner's QA gates the commit. One step In Progress at a time.

## 14. Build order

Tickets are cut from the final version of this document, after Claude Design's pass. The order they will take:

| Step | What ships |
| --- | --- |
| 1. The chamber | species roster, gates, clock, bag, PHOTON, its console word |
| 2. ELECTRON | the orbit, the shield, the knock-out, the freeing |
| 3. NUCLEUS | the drift, the recoil, the split, the neutron |
| 4. ANTIBALL | the twin, the thread, the crater, the laser counterplay, the BLACKOUT pool |
| 5. Pins | the inhabitants field, ORBIT's two electrons, `check:drops` extended |
| 6. The eye | descent, rhythm, glint, shot, fight clock, shatter, timeout, escalation, console word |
| 7. The words | every line in section 8 |
| 8. The bestiary | P from the title, the catalogue's scaffolding, one staged miniature an entry |
| 9. Docs | README and the architecture page, including a "where to add a species" row |

## 15. What Claude Design is asked to refine

Anything marked open above, and in particular:

1. **The four sprites** at their real sizes (4, 4, 10 and 6, and the antiball's 8 px silhouette in its palette), against the eight backgrounds, and under DEMAKE's single ink.
2. **The gate**: how a 12 px gap in a 3 px bar opens and closes so that it reads as a port and not as a rendering fault.
3. **The electron's orbit ring** and how it sits over a brick without hiding the brick's kind.
4. **The antiball's halo and thread**, so the threat is read at a glance and the thread does not read as TWIN's own pairing.
5. **The nucleus split** and the neutron's birth in three or four frames.
6. **The eye**: the seated body, the lid shut and open, the sweep, the glint's travel, the flinch, the shatter, and the exit. A frame-by-frame of one open-and-shut would settle most of section 7.
7. **The five miniatures** for the bestiary page and the blurbs' wording.
8. **The copy** in section 8, and whether DECOHERENCE earns the game-over screen.
9. Any mechanic in sections 5 to 7 that a picture shows to be wrong. Mechanics are fixed against taste, not against evidence.

## Appendix — reference tones and layouts

**Tones already in the game that this spec borrows**

| Name | Hex | Used by |
| --- | --- | --- |
| ball body / highlight / shade | `#ffe14a` / `#fff9d0` / `#c98f0a` | the ball; never for anything else |
| frame light / shade | `#dbe4ff` / `#8f9ac8` | the field's bars, the gates |
| paddle sheen | `#a8d8ff` | proposed electron body |
| arc dim | `#5b74e8` | proposed orbit ring |
| energy wall core | `#f4fbff` | proposed photon core |
| energy wall | `#8fd0ff` | proposed photon trail |
| TWIN thread | `#ffbda5` | the antiball's thread |
| death flash | `#ffffff` | the antiball's halo, the annihilation |
| drop shade | `#0b0b26` | proposed antiball shade, pupil body |

**Brick tones** (`flat` / `light` / `dark`): `1` `#e8384f` / `#ff8a9c` / `#8e1220` · `2` `#f07d10` / `#ffc27a` / `#8a3d00` · `3` `#ffcf1c` / `#fff59a` / `#8a6a00` · `4` `#3fbf4f` / `#a6f0a6` / `#155c1f` · `5` `#2d7fe0` / `#a8d8ff` / `#0b3a78` · `S` `#b0b4cc` / `#f2f4ff` / `#5a5e80` · `G` `#dfae2c` / `#ffe9a0` / `#7a5a08` · `R` `#857a6e` / `#b9ab98` / `#3f3931`.

**The EYE level as shipped** (8 rows; the boss uses rows 0–5 and turns its `R` core into `P`):

```
....1111....
..12222221..
.12SSSSSS21.
112SRRRRS211
112SRRRRS211
.12SRRRRS21.
..2SSSSSS2..
....2222....
```

**Existing things this spec reuses**: the disc reflection and kick flash of BUMPERS; the grub's spawn, walk-in and despawn as the model for a creature's life on the field; PYRE's thirteen-cell crater; TWIN's thread; MULTI's clone birth; the brick death burst; NUKE's flash family; the CAPSULES catalogue's scaffolding; the test console's grammar; `check:drops`.
