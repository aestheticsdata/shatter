# SHATTER — Neo-Geo port (SHA-264)

One level of Shatter as a real Neo-Geo cartridge, built with
[ngdevkit](https://github.com/dciabrin/ngdevkit) and run in GnGeo on ngdevkit's
open-source BIOS — no copyrighted ROM needed.

- `main.c`: the run — frame, HUD, states, the shake, the loop. Beside it
  `wall.c` (bricks as sprites: damage stages, hit flash, the burst, the
  diagonal shine, debris), `deck.c` (the paddle's flash, squash, trail and
  telescope; the balls), `eye.c` (the Observer, its iris clipped to the almond by
  pre-drawn pictures), `sky.c` (the dial turning, the stars twinkling),
  `capsule.c` (WIDE and MULTI, dropped from a bag as on the web), `hud.c`
  (the lettering), `video.c` (sprite and palette verbs), `sound.c`.
  `gmake -B … CFLAGS+=-DPERF` counts frames that overrun vblank, on the HUD's
  top row.
- `tools/neo_art.py`: the web game's HD brick, paddle and ball recipes
  redrawn at Neo-Geo size; `tools/neo_sky.py` SUNRISE's sky and its zodiac
  dial; `tools/neo_font.py` the panel's Silkscreen and the cards' Press Start
  2P as fix tiles. `tools/gen_assets.py` draws every other tile and writes the
  palettes, reading the level rows from `src/core/levels/levels.ts` and the
  brick roster from `src/core/config/bricks.ts`.
- `sound.s`: the Z80 sound commands (nullsound). `tools/gen_sounds.py` renders
  the web game's synthesised effects (`src/audio/SoundBank.ts`) to ADPCM-A
  samples; the theme and game-over tracks are its MP3s, looped on ADPCM-B.
- `config.mk`: Homebrew paths, written by hand (ngdevkit's `./configure` needs
  autoconf).

## Setup (once)

```bash
brew tap dciabrin/ngdevkit && brew install ngdevkit ngdevkit-gngeo make mame sox
```

## Build and play

macOS's own `make` is too old — use Homebrew's `gmake`.

```bash
gmake && gmake play
```

`play` runs MAME (`brew install mame`) at the machine's own 59.19 Hz —
`-syncrefresh` would lock it to the display and make the sound crackle. At boot MAME
shows a red "ROMs are incorrect" box — that is ngdevkit's open BIOS failing
MAME's checksum; press any key and it runs fine. `gmake gngeo` still works but
GnGeo paces frames badly on macOS (about 28 distinct frames a second
measured), so the ball judders there.

The ball's speeds are whole-pixel pairs per axis (`fans` in
`tools/gen_assets.py`): drawn in whole pixels, any fractional speed steps
unevenly and reads as judder.

`gmake LEVEL=PYRAMID` builds another level from `levels.ts`.
`gmake -B build/main.o CFLAGS="-Ibuild -std=c99 -O2 -DAUTOPLAY" && gmake`
builds a version that plays itself.

Controls: ← → move, Space or ↑ serves and continues. Esc quits. In GnGeo the key map is
passed by the Makefile (`EXTRAOPTS`): its built-in one uses SDL 1 key codes
and no key reaches the game. No mouse: the Neo-Geo never had one.

The cartridge is `build/rom/shatter.zip`; MAME runs it with
`build/rom/neogeo.xml` as the hash file.
