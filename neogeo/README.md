# SHATTER — Neo-Geo port (proof of concept, SHA-263)

One level of Shatter as a real Neo-Geo cartridge, built with
[ngdevkit](https://github.com/dciabrin/ngdevkit) and run in GnGeo on ngdevkit's
open-source BIOS — no copyrighted ROM needed.

- `main.c`: the game. Bricks and walls are fix-layer tiles; background, paddle,
  ball and shards are sprites. 8.8 fixed point, 60 Hz.
- `tools/gen_assets.py`: draws every tile and writes the palettes, reading the
  level rows from `src/core/levels/levels.ts` and the brick tones from
  `src/core/config/bricks.ts`.
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

`play` runs MAME (`brew install mame`), synced to the display. At boot MAME
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

Controls: ← → move, Space or ↑ serves. Esc quits. In GnGeo the key map is
passed by the Makefile (`EXTRAOPTS`): its built-in one uses SDL 1 key codes
and no key reaches the game. No mouse: the Neo-Geo never had one.

The cartridge is `build/rom/shatter.zip`; MAME runs it with
`build/rom/neogeo.xml` as the hash file.
