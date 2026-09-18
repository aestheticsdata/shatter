# THE 43 — OWNER'S LIST

This is the full level roster for the Observer universe: 43 levels, each with one named eye that differs from every other by what it *does* — not by where it sits — plus creatures on every level and a boss closing each series. Against what ships today, only five of these exist (the veils: THE VEIL, THE IRIS, THE TEAR, THE WRATH, THE LID); the other 38 are new eyes, 21 new creature species, and roughly a dozen new wall behaviours, none of which is in the tree. The governing rule, and the thing that changed since the last cut: **an eye's attention must change by something other than position** — size, phase, orientation, aperture, focus, tension, polarity, count, rhythm, latency, or form — and the table below names that channel first in every behaviour cell.

## Series & bosses (EVEN NINES)

| Series | Levels | Length | Boss | Fight |
|---|---|---|---|---|
| I | 1–9 | 9 | **9 THE VEIL** | it only watches — the ruler every other eye is read against |
| II | 10–18 | 9 | **18 THE IRIS** | the gaze: charge, fire, petrified deck |
| III | 19–27 | 9 | **27 THE TEAR** | weeps down a corridor, the drops hatch brood |
| IV | 28–36 | 9 | **36 THE WRATH** | half-buried under the rail, each blink rebuilds a brick |
| V | 37–43 | 7 | **43 THE LID** | sealed shut, then the pupil comes loose |

**The slide, applied here:** EYE and THE WRATH move two places together, from 37/38 to **35/36**; PACHINKO and KEYHOLE take **37/38**. Nothing else moves, no wall or sprite is touched, and both the veil numbering and the gaze's per-veil escalation fall out of array order. Note for the record: the critic's claim that KEYHOLE's own numbering note was a spec error is itself wrong — KEYHOLE becomes 38 under the slide, exactly as its note says. The design text for 35–38 still cross-references the old indices and needs a read-through before anyone implements it.

## The 43

| # | NAME | EYE | ANATOMY | BEHAVIOUR | CREATURES | BOSS |
|---|---|---|---|---|---|---|
| 1 | SUNRISE | THE DAWN | half-disc, flat base pinned at **y 252**, dome climbs to y 216; 12 brow rays, round pupil, no lashes; new `dawn` tones | **LOOK = SIZE.** Openness is bricks destroyed, not a clock; trackY 0, slides along the baseline. No blink | BELL x1 (halves a ball inside it) | |
| 2 | SMILEY | THE GRIN | fixed socket, only the lower lid rises; corner ticks ride the floor; iris 0.5 (reachX 71) | **LOOK = MEANING.** Floor rises per sixth cleared, never falls; on each blink it stares at one brick — that brick takes double damage | SWARM x1 (worked loose, not shot) | |
| 3 | PYRAMID | THE CAPSTONE | a triangle: lid power 1 over power 8; tiny pale iris, pinprick pupil, bone tones, no glint | **LOOK = STATE.** Dead stare, gains 0/0, ignores the ball entirely; at half the pyramid it blinks once over 80 ticks and wakes tracking | MASON x1 (walks the terracing, lays scar bricks) | |
| 4 | CHOMP | THE THROAT | portrait 52x112; iris as wide as the tube, horizontal bar pupil, lashes down both long sides | **LOOK = DEPTH.** trackX 0, trackY 0.9 — the iris rides the gullet; a ball crossing it is swallowed and spat out above the wall | SPITTER x1 (granites the jaw) | |
| 5 | GATEWAY | THE BOLT | a slot with **no ends**, bleeding off both screen edges; 3px bar pupil the lids amputate | **LOOK = FENCED TRAVEL.** Clamped to the gate's two columns and nowhere else; its blink removes the keystone and gives it back as scar | SLIT x2 (track by aperture, not position) | |
| 6 | HEART | THE SLEEPER | hooded: flat slab over a bulging orb, never opens past 0.55; 12 veins, lower lashes only | **LOOK = RHYTHM.** Lub-dub then rest; each systole shoves the ball, and the rest shortens 150→60 ticks as you cut it open | HUSK x1 → MOTH (twitches on the beat) | |
| 7 | VORTEX | THE SPIRAL | lidless disc, four banded rings, drain pupil, own 2px rim | **LOOK = SPEED.** Bands spin faster the nearer the ball; the pull you feel is literally the spin you can see. Contracts to a point every 600 ticks | CARAPACE x1 (wall), SWARM x1 (band) | |
| 8 | BOLT | THE SPARK GAP | stepped, burred, ink-filled zigzag; the pupil is a 1px **gap**, not a disc | **LOOK = BEARING.** The gap never moves; it pivots to aim at a live brick. Charge is filled by your own demolition and drawn as line weight | STALK x2 (the only things that look at *you*) | |
| 9 | THE VEIL | THE VEIL | **shipped** — the founding almond, the ruler | **LOOK = POSITION.** It watches and does nothing; the blink edge it emits is the event bus five levels later read | BROOD x3, eggs — the promote-don't-damage lesson | ★ |
| 10 | CHECKER | THE BOARD | near-rectangular plate whose interior is a **live 12x5 map of the wall**; four bronze studs | **LOOK = A CELL.** Quantised, steps square to square; disc over a live cell, bare ring over a dead one. Metronome blink moves a piece diagonally — mass constant | MASON x1 (relights squares), ANCHOR x1 | |
| 11 | INVADER | THE CROSSED PAIR | two hard rectangles, pale with an ink square knocked out (the opposite of 8's ink mass with a ground gap); never blink, never ease | **LOOK = TWO SUBJECTS.** Left eye the ball, right the paddle; when they cross, the whole sprite marches a column sideways | RAM x1, ROOST x1 on the aerial | |
| 12 | RAMPART | THE CRACK | hh nailed at 10, hw 36→186; cross pupil, dotted head running into unsplit stone | **LOOK = ASPECT.** 3.6:1 to 18.6:1, never a pixel taller; a rebound near the cross leaves flat. Slowest ease in the game | CARAPACE x1 (shove it, don't kill it), MAW x1 | |
| 13 | ROCKET | THE FURNACE | round, iris lid-to-lid, **annulus** pupil, no glint, no lashes | **LOOK = BREATH.** trackX 1.0 on the *paddle*, never the ball; 90-tick inhale drags, 30-tick exhale shoves, in a column welded to your hands | BORER x1 (hull), MOTH x1 (band) | |
| 14 | HELIX | THE BEAD | two D-sockets, flat-sided, plumbed together by a 4px channel across the field | **LOOK = TRAVEL.** The pupil contracts to a bead and crosses 300px in plain sight; rungs it passes exchange contents. One open D, one shut seam | HUSK x1 → LASH (ripens on the spine) | |
| 15 | TETRA | THE PIECE | a T-tetromino, stem up, cut by 1px seams; domino pupil | **LOOK = STEPPED.** trackY only, six 5px stops; the top stop plugs the stem and drops the piece a row. Landing takes a row away and shuts the eye for good | SPITTER x1 (can plug the well), SWARM x1 | |
| 16 | ORBIT | THE ECLIPSE | six near-round sockets, each drawn as a **phase** of itself; glints on the lit limb | **LOOK = PHASE.** The awake socket is the light; the five others point at it. The shadowed arc of the dotted ellipse is a solid rail you can bank off | STALK x1, MAW x1 | |
| 17 | COOL | THE FILAMENT | one pupil, four sockets, **a different outline in each**: crescent, two ovals, cornered slab; empties read as bare rims | **LOOK = OUTLINE.** The letter it occupies is live and refuses damage; hitting it chases the eye into another letter. Refuges run out as the word dies | MASON x1 (relights letters), VANE x1 | |
| 18 | THE IRIS | THE IRIS | **shipped** — the house eye, biggest almond, unchanged | **LOOK = POSITION + GAZE.** 45 ticks charge, 50 fire, a column to the rail you can walk out of, 70 ticks petrified | BROOD x3 + ANCHOR x2 (chains across the gaze column) | ★ |
| 19 | HIVE | THE COMB | 61 hexagonal facets, no lid, no sclera, no single pupil; scalloped silhouette, chitin band | **LOOK = A HEAT MAP.** Gains 0/0; the facet nearest the ball fills and heat bleeds outward. A hot facet's cell is brittle and chains. Shimmer wave wipes it | WEAVER x1, RAM x1 | |
| 20 | DNA | THE NARROWS | the one lid that **opens outward** — two lobes and a 34px waist; no iris at all, two bare pupils | **LOOK = REACH.** Clamped by the lid's own half-width, so in the neck it cannot look sideways at all. When the pupils meet, two strands trade kind | SLIT x1, LASH x1 | |
| 21 | SERPENT | THE SHED SKIN | the same almond **drawn twice**: live eye, and a dead hollow slough with the lashes still on it | **LOOK = THE GAP.** The live look tracks, the shed one never has; their offset 0→8px is how near the next crawl is. The body steps on *your* travelled distance | BORER x1 (tunnel walks with the body), BELL x1 | |
| 22 | SKULL | THE SOCKET BEHIND THE BONE | too big for its hole; dead 0.09 slit, then a bulging near-round eye, blown pupil, 12 veins | **LOOK = WHOLE ANATOMY.** Furniture until half the wall is gone, then 40 ticks of waking and it hunts at ease 0.9 | SOCKET (empty hole, swallows), MAW — both quicken on the wake | |
| 23 | MIRROR | THE PANE | identical twins, one **positive**, one its exact negative; lashes hang below the inked one | **LOOK = POLARITY.** Left tracks the ball, right tracks your paddle reflected across the line. Each crossing swaps the ink — and swaps your hands | VANE x1 (the one thing with no reflection), SHADE x1 | |
| 24 | BUNKER | THE EMBRASURE | splayed gun slit on a stepped sill, stone wedges, flat ink iris; the pupil is an **absence** | **LOOK = WIDTH.** 64px dim while searching, easing to your paddle's exact width when it acquires you. 30 ticks pinned and the column above you stores hits — step off and they all land | SPITTER x1, HUSK x1 → MOTH | |
| 25 | CASCADE | THE FALL | 6.4:1 under a straight spillway lip, and **cut in half** by a 6px band of water, right side drawn 3px lower | **LOOK = DISPLACEMENT.** Gains 0/0 — the sheet drags the pupil 12px and it drifts back. Two glints while the cut crosses it. The field column under the sheet is wet and will not bite | ANCHOR x1, WEAVER x1 | |
| 26 | PLAY | THE RALLY | two round sockets: one solid ink, one a ring with the field showing through | **LOOK = POSSESSION.** Neither socket has a subject — the look is an object thrown between them on a drawn catenary that is solid while in flight. Intercept it and the sign goes blind | MASON x1, SWARM x1 | |
| 27 | THE TEAR | THE WEEPING CORNER | **shipped** — the only almond the frame amputates, two wet tracks under the pupil | **LOOK = POSITION + WEEP.** Drops hatch brood where they land, cap five. Burst them in the air or live with the walkers | BROOD x2 + hatchlings, BELL x1 in the corridor | ★ |
| 28 | MAZE | THE SHAFT | portrait diamond, sealed its whole length except one 14px band; square pupil in square iris bands | **LOOK = APERTURE.** trackX 0; the open band rides up the shaft like a lift, and only the maze row it is level with is fully lit | SHADE x2 (visible in the dark), MAW x1 | |
| 29 | OMEGA | THE HORSESHOE | a broken ring — no lower lid, the white pours out two legs; crescent pupil | **LOOK = PHASE.** Bearing is the crescent's direction, range is how deep the bite is; the pupil never moves. Phase aims two sightlines whose crossing catches the ball onto the arch | HUSK x1 → MOTH (changes its mind with the phase) | |
| 30 | 1991 | THE ROLLING PICTURE | the largest eye, drawn in **scanlines**, rounded-rectangle bezel, one bright hold bar | **LOOK = LATENCY.** It tracks where the ball was 90 ticks ago — it is playing back, not watching. When the bar runs off the bottom the wall scrolls a row and wraps | BORER x1, ROOST x1 (bolted to the frame, doesn't roll) | |
| 31 | PILLARS | THE LANCET | six pointed arches on flat sills, five hollow, one flooded; no iris, crescent pupil | **LOOK = OCCUPANCY + PHASE.** It never translates; the crescent's fullness is how far the lane has closed, and the two flanking pillars step inward 30px→18 | STALK x1, ANCHOR x1 | |
| 32 | GALAXY | THE ARM | a comma — per-row spine sweeping along a curve; the pupil is a 1px **coil** with the glint on its outer end | **LOOK = TENSION.** Gains 0/0; the coil winds and unwinds with the ball's distance from the core. Every 240 ticks each live brick steps one place around its ring and the arms shear tighter | SPITTER x1 (visibly leads its shot), LASH x1 | |
| 33 | SUPER MAZE | THE THREE BENDS | three different **L-bends** (┘ long, └ stubby, ┌ hanging), channels not sclera, 9px segment pupil | **LOOK = ORIENTATION.** The segment walks its corridor and turns the corner as a knot. Closing is a fold — arm to I to knee square — and a granite shutter grows in that mouth at exactly the same rate | SHADE x1 | |
| 34 | PONG | THE OPPONENT | a perfect circle with **no iris at all**; the pupil is a 4x16 bat; net line, square bezel, glint on the glass | **LOOK = AXIS SWAP.** trackX 0; your deck's x drives the bat's y, rate-limited so it visibly lags. The bat is matter and returns the ball — you position your own opponent | CARAPACE x1 (left), BELL x1 (right) | |
| 35 | EYE | THE REACH | cornered lens filled nearly solid; one crescent of white; the pupil grows a **lobe** that points | **LOOK = PUPIL SHAPE.** Subject is the live brick *farthest* from the ball; the centre never moves. A looked-at brick is eaten over 200 ticks for no score, and the rim crusts with what it took | STALK x2 rooted in the painted pupil, SWARM x1 | |
| 36 | THE WRATH | THE WRATH | **shipped** — half off the bottom of the field, bloodshot, the paddle rides its white | **LOOK = POSITION + REBUILD.** Each blink rebuilds one brick as scar; the armour at the top means the eye has had most blinks by the time you reach it | BROOD x3, all hatchlings. No extra species | ★ |
| 37 | PACHINKO | THE PAYOUT | hexagonal bezel, twelve lamp dots outside, twelve spokes, **three reel pupils** | **LOOK = A COUNT.** Every peg struck advances a detent and darkens a reel; twelve detents is its only blink of the level, and the blink pays a capsule down the nearest clear shaft | LASH x2 (pegs that came alive) | |
| 38 | KEYHOLE | THE TUMBLER | the outline is a **keyhole** — dome over shaft — in brass, in an escutcheon; the pupil is a smaller keyhole | **LOOK = DILATION + ROTATION.** trackY 0. Thread the slot and it dilates; each thread turns the pupil a quarter, and the second turn lifts the shackle's twelve gold | DIAPHRAGM x1 (caps the slot), RAM x1 | |
| 39 | HOURGLASS | THE GLASS | **portrait, scan rotated 90°** — lids on the left and right, corners top and bottom; bowtie pupil | **LOOK = A FALL.** Gains 0/0: the iris drops 1px per 12 ticks and every brick you break knocks it up 6. On the floor the lids sweep shut, the piles trade, and it reopens. Break the gold neck and it never turns again | HUSK x2 → MOTH (ripening on the draining clock) | |
| 40 | CENTIPEDE | THE SEAMS | five 5px hairlines; the live one opens **downward** into a 52x32 lens; three-bar segmented pupil | **LOOK = AN OPENING.** On each blink the look hands off a segment and the seam it lands on changes form. Each handoff steps the nearest steel mushroom one cell down | BORER x1, SPITTER x1 (one moves mushrooms, one makes them) | |
| 41 | FLOPPY | THE READ LINE | not a shape — a 1px rule 366px wide with sector ticks; the pupil is a **gap** in the line | **LOOK = FOCUS.** The head's x is the seek, never the ball; the smear tightens to 6px bright as you come overhead and spreads to 40px dim as you leave. It is erasing the wall for no score, and the gold shutter is the drive's brake | MASON x2 (the drive writes while it erases) | |
| 42 | FINALE | THE CURTAIN | 356x112, iris corner to corner, vertical slit pupil, twelve-lash fringe across the field | **LOOK = APERTURE.** Every blink the grid steps a column behind the closed lid. At half dead the lids leave the field and the slit blows to a 40px disc — no behaviour left, it just watches you finish | FACET x1 (hit points in its silhouette), RAM x1 | |
| 43 | THE LID | THE LID | **shipped** — never drawn open; a 48:1 rule with four lash posts and a 44px bar of iris | **LOOK = A GLIDE.** reachY 0 by construction. Break ten of sixteen seal cells and the socket empties for good; the pupil comes loose and accelerates for 24 hits | BROOD x2, both wyverns. No extra species | ★ |

## Hints

1. IT RISES AS THE WALL FALLS
2. THE MOUTH IS AN EYE · IT GRINS
3. IT HAS NOT BLINKED YET
4. THE GAP IS A THROAT · IT SWALLOWS
5. IT WATCHES ONE DOOR AND SHUTS IT
6. IT SLEEPS IN THE CHEST · IT BEATS
7. NO LIDS · IT SPINS AS YOU FALL IN
8. IT AIMS WITH A CRACK OF LIGHT
9. IT PEERS THROUGH THE STONE
10. IT KEEPS THE BOARD · AND IT MOVES
11. WHEN THE TWO EYES CROSS · IT STEPS
12. A WATCHED BREACH SHOOTS FLAT
13. IT BREATHES UNDER THE SHIP · MIND YOUR FALL
14. ITS LOOK LEAVES · THE RUNGS TURN
15. GO HIGH AND THE PIECE DROPS ANOTHER ROW
16. ITS SHADOW HAS A SURFACE
17. IT LIVES IN A LETTER · HIT IT OUT OF THERE
18. BARE AND HUGE · ITS GAZE PETRIFIES
19. IT REMEMBERS WHERE YOU PLAY
20. WHEN THE PUPILS MEET · IT TRADES
21. IT CRAWLS ONLY WHILE YOU PLAY
22. IT WAKES WHEN THE SKULL IS HALF GONE
23. CROSS THE PANE AND YOUR HANDS TURN
24. STAND IN ITS LIGHT AND THE WALL SETS
25. A WET STEP WILL NOT BITE · WATCH THE SHEET
26. IT THROWS THE LOOK · BREAK THE ARC
27. IT WEEPS FROM THE CORNER · BURST THE TEARS
28. IT LIGHTS ONLY THE ROW YOU ARE IN
29. ITS PHASE AIMS THE ARCH
30. THE PICTURE ROLLS · THE WALL ROLLS WITH IT
31. THE LIT WINDOW LEANS ITS PILLARS IN
32. THE ARMS WIND ON ITS CLOCK
33. A CLOSED CORNER IS A CLOSED DOOR
34. IT RETURNS SERVE · YOUR DECK AIMS ITS BAT
35. IT LOOKS WHERE YOU ARE NOT PLAYING
36. IT RISES BELOW · EACH BLINK REBUILDS
37. IT COUNTS YOUR BOUNCES · TWELVE PAYS OUT
38. THREAD THE SLOT · THE TUMBLER TURNS
39. ITS PUPIL FALLS · THE GLASS TURNS
40. ONE SEAM OPENS · THE FIELD CREEPS
41. IT IS FORMATTING WHAT YOU LEAVE
42. THE WALL STEPS ASIDE · HALF DEAD, IT OPENS
43. SEALED SHUT · BREAK THE SEAL, BLIND THE EYE

## What this costs

Be clear about one thing first: **almost none of this is data-only.** Three levels (9, 36, 43) need no code beyond the renumbering. Two more (18, 27) need one creature each. The other 38 each need renderer work, and about 30 of them need engine work as well, because the whole point of the roster is that the eye's *idiom* changes — and an idiom is code, not a config row.

**Renderer foundations — nothing else can start until these land (~9 tickets).** A per-eye lid-curve plugin (`lidPower` plus arbitrary per-row half-width functions, used by ~20 levels); asymmetric upper/lower lids, an independent lower-lid depth, and a base-line-anchored socket for SUNRISE; a per-row spine offset (stepped for 8, swept for 32) and per-side half-widths (14, 33); rows that emit a span *list* instead of one run (29) and a scan rotated 90° (39); `eye` as an **array** threaded through `drawEye`, `eyePupilPoint`, `levelStill` and the gaze source; a pupil-shape plugin (bar, cross, square, domino, annulus, crescent, coil, bowtie, authored bitmap, segmented, gap, none); `eyePupilPoint` gaining asymmetric clamps, quantised stops and a lid-width clamp; `eyeTarget` gaining new subjects (paddle, reflected paddle, nearest live brick, farthest live brick, grid cell); and new `EYE_TONES` records (`dawn`, `bone`, `brass`, one inverted) plus per-eye lash tables and a small kit of socket furniture — rays, studs, bezels, escutcheon, lamp ring, dotted ellipse, channel, spillway lip.

**Per-eye anatomy (~24 tickets).** Most eyes fall out of the foundations, but eight are genuinely bespoke draw paths and each is its own ticket: HIVE's 61-facet lattice in three states, CHECKER's live 12x5 wall map, 1991's raster and hold bar, CASCADE's split sprite with a y-offset right half, ORBIT's per-socket terminator, SUPER MAZE's three L-bends, KEYHOLE's four authored pupil bitmaps, PACHINKO's spokes and reels. HIVE is the single most expensive eye in the batch; say so on its ticket.

**Verbs (~30 tickets, ~12 of them in `BrickGrid` or ball physics).** New wall transforms: column step (11, 42), row scroll (30), ring permutation (32), rung swap (14), diagonal piece move (10), row shift and wrap (21), kind swap (20), hourglass turn (39), tetromino drop plus row clear (15), mushroom creep (40). New brick states: pinned-and-stitched (24), brittle-and-chaining (19), charged (8), erasing (41), being eaten for no score (35), live/armoured letters (17). New ball interactions that must never redraw the ball: heading bend (7, 29), rebound flattening (12, 25), the shadow rail (16), the thrown arc (26), the opponent's bat as a collision rect (34), lane-narrowing collision (31), reversed controls (23). Plus field lighting (28, 33).

**Bestiary (~29 tickets).** 21 new species — MASON, SWARM, BELL, SLIT, STALK, SPITTER, HUSK, MOTH, CARAPACE, MAW, ANCHOR, RAM, WEAVER, LASH, BORER, ROOST, SHADE, VANE, SOCKET, DIAPHRAGM, FACET/MITE — at roughly one ticket each, plus about eight placement and tuning passes once they are on real levels together.

**Plumbing (~7 tickets).** Positions, backgrounds and the `check:backgrounds` seam, the 43 `demade` records, the gallery stills (several eyes need a seeded resting state or they draw as nothing — CASCADE and HELIX in particular), the hint lines, and the EVEN NINES slide itself.

**Total: 100–120 tickets.** At one ticket In Progress at a time with user QA gating every commit, that is a long run — plan it as five waves (foundations, then one wave per series) and expect the foundations wave alone to be 10–15 tickets before a single new level is playable. Do not start any level ticket before the foundations land; every eye in this roster assumes them.

## Open questions

**1. The numbering.** Confirm EVEN NINES with bosses at 9/18/27/36/43, which means EYE and THE WRATH become 35 and 36 and PACHINKO and KEYHOLE become 37 and 38. If you'd rather leave the roster as drafted, the fourth series runs eleven levels and the last runs five, which is the shape the slide exists to fix. Either way, the design text for those four levels cross-references the old indices and must be corrected before implementation.

**2. Nine creature-adjacency collisions.** The three-level rule is broken in nine places, and BELL alone appears on seven levels. Proposed one-line swaps, all of which keep the level that needs the species most: 7 SLIT→CARAPACE; 11 STALK→ROOST (on the aerial); 14's HUSK releases a LASH instead of a MOTH; 15 MASON→SPITTER (it plugs the well with granite instead of a brick); 16 BELL→MAW; 17 BELL→VANE; 19 BELL→RAM; 20 WEAVER→SLIT; 32 SWARM→LASH. These are already folded into the table above — approve them, or waive the rule for BELL specifically and put them back.

**3. The multi-socket family is six levels.** 14, 16, 17, 26, 31 and 40 all run "the look lives in one of N holders and hands off". Each hands off differently — the bead physically travels, the phases rotate, the pupil is re-formed by the letter, the look is thrown and can be intercepted, occupancy leans the pillars, the seam opens into a lens — but it is one structural idea six times in 43 levels. Accept it as a motif, or cut two of them (26 and 31 are the ones whose verbs would survive being rebuilt around a single socket).

**4. Build order.** Foundations-first as a single wave with a 43-still gallery shipped before any level behaviour, so you can approve every silhouette at one ink in one sitting — or series-by-series, where each series drags in whichever foundations it happens to need and the gallery only fills up at the end. The first is slower to first playable level and much cheaper to change your mind in.