# The nine missing species

Confirmed by the user on 2026-09-21, after THE HD PASS landed: the bestiary is
the next direction. Companion to `2026-09-19-bestiary-and-bosses.md`, which
built the framework and the first four, and to
`2026-09-19-observer-one-eye-43-placements.md`, whose list of twenty is where
these nine were first written down — one line each.

Spec ticket **SHA-237**; the work is SHA-238 to SHA-247.

This spec is the second half of that list. It does not revisit the framework's
shape, the boss rule or the veils; it says what the nine are, what each one
needs that the framework has not got, and what happens to the 125 pins when
they land.

## The measure

The thinness is not an impression. Counted on the branch this spec was written
on:

| | |
| --- | --- |
| Creature pins in `levels.ts` | **125** |
| Levels carrying them | **38** of 43 |
| Species doing the work | **4** |
| MOTH · FROG · SPIDER · SNAIL | 50 · 33 · 28 · 14 |

Two in five creatures in the game is the same moth on the same loop. The
placements spec asks for three to four per level with no species shared by
neighbours; with four species that rule can only be satisfied by rotation, and
rotation at four is a pattern the player learns by level 8.

Nine more takes the roster to thirteen, which is where the rule starts buying
variety instead of describing a cycle.

## What the framework already gives

Built by SHA-207, SHA-208 and SHA-213, and not to be re-opened here:

- `Species` — sprite frames, two palettes, the numbers, `spawn`, `step`,
  `struck`, and the optional `armour?` and `decorate?`.
- `CreatureSight` — the nearest ball, the deck's span and rail, `wallRows`,
  `standing(column, row)`, the Observer's socket.
- `CreatureEffects` — nine verbs: `dropCapsule`, `mortar`, `pop`,
  `petrifyDeck`, `burst`, `dust`, `kick`, `lay`, `rattle`.
- `bitmap.ts` — `doubled`, `flipped`, `mirrored`.
- HD for free: SHA-233 runs the bestiary's sprites through scale3x *after* the
  transforms and bakes the strike flash rather than overriding it, so a new
  species authored as ASCII gets the fine grid without knowing the fine grid
  exists. `decorate?` already takes its `unit`.

The house rule from the bestiary spec holds: **a verb arrives with the species
that needs it**, one method on `CreatureEffects`, never as a framework ticket
up front and never as a species reaching into the game. There is therefore no
tenth "foundation" ticket in this plan.

## The five gaps

Measured against the shipped code, not assumed.

**1. `armour?` is never consulted for an ordinary creature.** `strikeCreature`
in `ShatterGame` goes straight to `creatures.strike()`. The hook exists and
works, but only the boss path calls it. BEETLE wires it into the creature path.

**2. The ball strikes every creature regardless of `solid`.** `solid` adds the
shelf bounce and nothing else — `creatures.at()` is called by the ball with
`solidOnly` defaulted to false. So "the ball passes through it" is already
true of a moth, and WISP's *laser only* is a different fact needing a
different flag.

**3. `struck` does not carry where the hit landed.** VINE has to drop
everything above a severed segment, and cannot know which one was cut.

**4. `Species.width` and `Species.height` are fixed.** Twelve call sites across
`ShatterGame.ts` and `Creatures.ts` read them for the hitbox and the draw. A
creature whose size is a function of its state needs an optional
`box?(creature)` to override the pair. VINE is the only species here that
needs it; a fixed box would mean a one-segment vine with a full column's
hitbox.

**5. Nothing fades the deck's handling.** `petrifyBlend()` already ramps six
ticks in and twelve out, which is the house rule on effects in the code rather
than in a comment. SLUG's skid and JELLYFISH's sting copy that shape rather
than inventing one, and neither is ever a hard on/off.

## The nine

Numbers below are the opening proposal for `gameConfig.creatures.<kind>`, to be
judged by ear the way the first four were. Every silhouette is authored with
its 1-bit mapping, per the placements spec's closing rule.

### BAT — asleep under the wall

Hangs upside down beneath a brick, folded and still. A hit wakes it: roughly
five seconds of erratic flight, then it finds another brick and hangs again.
Three hits — the first only wakes it, and the two that kill have to catch a
thing that is not flying a curve.

*States* `HANG → FLIT (300t) → HANG` elsewhere. Two different kinds of choice,
and the house already draws the line between them: **the flight path is a sum
of sines at incommensurate rates**, because a per-frame `random()` is jitter
rather than flight and the moth's wobble is the existing idiom for a wandering
curve; **which brick it hangs under next is a discrete pick among valid cells,
and uses `Math.random()`**, exactly as FROG's `pickBrick` chooses its next seat
(`frog.ts:75`, and THE FROG KING's landing at `frogKing.ts:156`).

*Held cue* folded and eyes shut asleep; wings out and eyes open awake. The
state is legible before you commit the ball to it.

*Needs* nothing. Solid: no. `hitPoints 3`, `points 90`, `killPoints 350`.

### BEETLE — armoured, then a charge, then upended

Walks the band on its own. `armour?` returns `SHELL` over the carapace: the
ball bounces, pays nothing and takes no hit point. A hit that lands rolls it
into a charging shell that travels the band fast and bounces off the frame — a
moving shelf, still armoured. A second hit flips it: legs up, soft, three
seconds, killable.

*States* `WALK → ROLL → FLIPPED (180t) → WALK`.

*Held cue* the legs wave while it is flipped, and **slow as the timer runs
out** — the window closing is visible on the creature rather than nowhere.

*Needs* gap 1: `armour?` honoured in `strikeCreature`. Solid: yes.
`hitPoints 3`, `points 110`, `killPoints 450`.

### WOODPECKER — the ally

Flies to a brick with open air under it, clings to the underside and hammers
upward. When the brick gives it rests on the gap, then finds another. The only
thing in the bestiary that is on your side.

**The blows are not the damage.** The one-liner said three pecks open an
ordinary brick, which is wrong about this game: bricks 1 to 5 all have *one*
hit point and only silver, gold and granite have more, so a bird taking one off
per peck opens a brick on its first tap and eats a level in half a minute —
measured, ten bricks in ten seconds with two birds. The bird counts its own
blows instead and lands a hit point every sixth, and the rest between bricks is
most of its cycle. That is the pacing knob, and it is the bird's rather than
the wall's.

**It pays nothing.** Not per peck and not per brick. The cleared path is the
gift, and a woodpecker that farmed score would be a clock you wait on rather
than a bird you are glad to see. Hitting it is a loss, not a reward: a malus
pop reading `GONE` and the help is over.

*States* `FLY → CLING → PECK ×n → FLY`.

*Needs* `peck(column, row)` — one hit point off that brick, the exact inverse
of SNAIL's `mortar`, and nothing on an empty cell. It goes through the wall's
own `damage`, so a brick the bird opens is counted out of `remaining` exactly
as one the ball took; a hand-rolled decrement would clear the wall and leave
the level unable to end. No score and no rolled capsule, which is what every
indirect kill in the game does — but a *seeded* capsule still comes out and the
TWIN partner still falls, because those are promises the level and a bought
capsule made to the player rather than anything the bird earned. Solid: no.
`hitPoints 1`, `points 0`, `killPoints 0`.

*One wrinkle to handle in the ticket:* `strikeCreature` pops the gain
unconditionally, so a nil-paying creature would print a `0` over itself. The
zero pop is skipped and the species' own malus pop stands in its place.

### VINE — it grows back into wall

Roots at its pin in the band and grows upward, one segment every few seconds.
When the tip reaches the wall's lowest row it converts: one brick laid per
segment grown, up its own column, and the vine is gone — having become the
thing you are trying to remove.

Cut a segment and everything above it falls. So a hit at the tip costs it one
segment and a hit at the root kills it outright: **aim low**. That is the whole
risk, and it is legible from the shape.

*States* `GROW → (tip at the wall) COLUMN`. `hitPoints` is its segment count;
a hit at height *h* takes off every segment above *h*.

*Needs* gap 3 (the hit point passed to `struck`) and gap 4 (`box?`, since the
hitbox is `segments × 7` tall). Lays its column with the existing `lay`.
Solid: no — the framework's shelf bounce is vertical only, which is the wrong
physics for a column, and a vine the ball passes through and strikes still
reads. `points 60`, `killPoints 500`.

**The per-hit payment is flat, not per segment cut.** `Creatures.strike()`
returns `species.points` and has no way to vary it, and there is no reason to
teach it one here: aiming low already pays, because a low hit is the hit that
kills and collects the 500 — and stops the column. A per-segment tariff would
buy the same incentive for a framework change.

### WISP — the laser's alone

Drifts through the wall as though it were not there, and the ball drifts
through the wisp the same way — no bounce, no strike, nothing. Only a shot
touches it. It pays the most in the bestiary because on most levels you cannot
touch it at all.

*Needs* gap 2: a ball-proof flag on `Species`, distinct from `solid`. Named for
what it is rather than for `solid`'s opposite, since `solid: false` already
means something else and has four users.

*Held cue* it thins and thickens as it drifts, so an untouchable thing still
looks alive rather than looking like a bug.

Solid: no, and ball-proof. `hitPoints 1`, `points 250`, `killPoints 800`.

### FIREFLY — the light you need

A blinking point of light. A hit flashes the whole field lit for about a
second. Kill every one on a dark level and the level stays dark: they are the
lamps, and the score is the bait.

The dark it answers is the one the game already has — BLACKOUT's pools and THE
MOTH MOTHER's dust both run through `blackoutBlend`. A firefly is another pool
in that system, so this needs no new level property and no "dark level" flag: a
firefly on a lit level is a small pretty creature, and the same firefly under a
blackout is the only thing you can see by.

*Needs* `glow(ticks)` — the inverse of `dust`, holding the blend down. The
light pool itself is presentational and reads live FIREFLY positions off the
view, exactly as the deck torch reads the deck.

Solid: no. `hitPoints 1`, `points 60`, `killPoints 200`.

### CRAB — it takes your capsules

Walks the band sideways and takes falling capsules out of the air. It carries
them: one mark on its back per capsule stolen, so **what killing it is worth is
written on it**. Hit it and it drops the lot at once.

That makes it the one creature you may want to leave alive for a while, which
is a decision the bestiary does not otherwise offer.

*Needs* `snatch(x, y, width, height): number` — every capsule in this box is
taken, and how many is returned. Shaped exactly like `kick`, which is the
existing precedent for a box query that acts. On the strike it pays them back
through `dropCapsule`, once each.

Solid: no. A solid thing loitering in the band re-routes the rally far more
than a crab is worth, and three of them would wreck it. `hitPoints 2`,
`points 100`, `killPoints 250` — and the capsules come back as capsules, which
is the payday, not as score.

### JELLYFISH — it goes for the deck

Pulses upward and sinks between pulses, so it travels **down** on balance, out
of the wall and toward the rail. Reaching the deck it stings: the deck goes
numb — half speed, not frozen — for about a second. Pop it on the way.

*The one-liner in the placements spec reads "floats up through gaps · reaching
the rail stings the deck", which cannot both be literal, since the rail is at
the bottom. Read here as the pulse going up and the travel going down, which is
how a jellyfish actually moves and which is what makes "pop it on the way" a
window rather than a formality.*

*Needs* `stingDeck(ticks)`. Deliberately not `petrifyDeck`: petrified is stone
and cannot move at all, which is THE IRIS's sting and should stay hers. Numb is
slow. It borrows `petrifyBlend`'s six-in, twelve-out ramp (gap 5).

Solid: no. `hitPoints 1`, `points 130`, `killPoints 300`.

### SLUG — it takes the rail

Crawls the rail laying slime behind it. Over a slimed stretch the deck skids:
it carries past where you point instead of stopping there, ramping in at the
patch's edge and out at the far one. Pop the slug and the slime it has already
laid stays until it dries on its own clock.

The slowest and the cheapest thing in the bestiary per hit, and like the snail
the answer is to kill it early — every second it lives is another stretch of
rail you have to play around for the rest of the level.

*Needs* `slime(x, width, ticks)` and the skid in `Paddle`: `moveCenterTo` eases
toward its target over slime instead of snapping to it, and `moveByDelta`
carries. Both ramp (gap 5) — a skid that switched on at a patch edge would feel
like a dropped frame rather than like slime.

Solid: no. `hitPoints 3`, `points 70`, `killPoints 400`.

## The re-deal

The nine are only half the fix. Nine species that each appear on one level
would leave the moth at fifty. The last ticket deals all 125 pins again across
thirteen species, to the placements spec's own rules:

- Three to four creatures a level.
- No species shared by two consecutive levels, **including across the wrap** —
  the run loops back to level 1, exactly as the background adjacency rule
  already accounts for.
- The gentle ones early. The three that take the deck away from you — SLUG,
  JELLYFISH, CRAB — are held to the later series, as the placements spec says.
- No species over ~20 of the 125. The cap is the point of the exercise.
- The named slots honoured: FIREFLY on 6 HEART, WISP on 7 VORTEX, BAT on 8
  BOLT.
- The five veils keep their brood; the eight boss levels keep their fights.

A guard script in the shape of `check:backgrounds` verifies the adjacency and
the cap, so the rule is machine-checked rather than eyeballed over 43 levels.

## Out of scope

- **Bosses for the nine.** The rule since 2026-09-20 is that every boss is a
  bestiary species grown huge; 5, 15, 25 and 35 are built, and 10, 20, 30 and
  40 are the veils' own phases, still proposals. Nothing here adds a boss.
- **Species sounds.** Still the brood's, still their own ticket, still judged
  by ear.
- **The chamber's four** — PHOTON, ELECTRON, NUCLEUS, ANTIBALL — which belong
  to SHA-179 and are a different object.

## The build order

Framework weight climbs monotonically, and the three that take the deck away
from the player come last, when the idiom is settled.

| Ticket | Species | Gap it closes |
| --- | --- | --- |
| SHA-237 | _this spec_ | — |
| SHA-238 | BAT | — |
| SHA-239 | BEETLE | `armour?` in the creature path |
| SHA-240 | WOODPECKER | `peck` |
| SHA-241 | VINE | hit point in `struck`; `box?` |
| SHA-242 | WISP | ball-proof flag |
| SHA-243 | FIREFLY | `glow`; the light pool |
| SHA-244 | CRAB | `snatch` |
| SHA-245 | JELLYFISH | `stingDeck` |
| SHA-246 | SLUG | `slime`; the deck skid |
| SHA-247 | THE RE-DEAL | the guard script |

Each species ticket adds its name to `CREATURE`, its file under
`species/`, its entry in the registry, its block in `gameConfig.creatures`, and
its pins on the level or two that want it first — so every ticket is playable
on its own, and the re-deal at the end is a distribution pass rather than a
first appearance.
