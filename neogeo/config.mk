# ngdevkit configuration for this Mac (Homebrew, Apple Silicon).
# Written by hand instead of ./configure, which needs autoconf: the values are
# what configure would find with `brew install ngdevkit ngdevkit-gngeo`.

BREW=/opt/homebrew

PKGCONFIG=pkg-config
PYTHON=$(BREW)/opt/python@3.14/bin/python3.14
ZIP=zip
TRUNCATE=truncate

M68KAR=m68k-neogeo-elf-ar
M68KAS=m68k-neogeo-elf-as
M68KGCC=m68k-neogeo-elf-gcc
M68KGXX=m68k-neogeo-elf-g++
M68KLD=m68k-neogeo-elf-ld
M68KOBJCOPY=m68k-neogeo-elf-objcopy
M68KRANLIB=m68k-neogeo-elf-ranlib
Z80SDAR=z80-neogeo-ihx-sdar
Z80SDAS=z80-neogeo-ihx-sdasz80
Z80SDCC=z80-neogeo-ihx-sdcc
Z80SDLD=z80-neogeo-ihx-sdldz80
Z80SDOBJCOPY=z80-neogeo-ihx-sdobjcopy
Z80SDRANLIB=z80-neogeo-ihx-sdranlib

PALTOOL=paltool.py
TILETOOL=tiletool.py
ADPCMTOOL=adpcmtool.py
VROMTOOL=vromtool.py
FURTOOL=furtool.py
NSSTOOL=nsstool.py
SOUNDTOOL=soundtool.py
ROMTOOL=romtool.py

NGCFLAGS=`$(PKGCONFIG) --cflags ngdevkit`
NGLDFLAGS=`$(PKGCONFIG) --libs ngdevkit`
NGLIBDIR=`$(PKGCONFIG) --variable=libdir ngdevkit`
NGZ80INCLUDEDIR=`$(PKGCONFIG) --variable=z80includedir ngdevkit`
NGZ80LIBDIR=`$(PKGCONFIG) --variable=z80libdir ngdevkit`
NGSHAREDIR=$(shell $(PKGCONFIG) --variable=sharedir ngdevkit)

AES_BIOS=$(NGSHAREDIR)/aes.zip
MVS_BIOS=$(NGSHAREDIR)/neogeo.zip

CONVERT=convert
SOX=sox
RSYNC=rsync
GNGEO=ngdevkit-gngeo
GNGEO_DATA=$(BREW)/opt/ngdevkit-gngeo/share/ngdevkit-gngeo/gngeo_data.zip
GNGEO_GLSL=no

# The ngdevkit tools run on `python3` from PATH and need 3.11+ with Pillow;
# Xcode's 3.9 comes first otherwise.
export PATH := $(BREW)/opt/python@3.14/libexec/bin:$(PATH)
