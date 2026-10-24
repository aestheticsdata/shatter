// The 68k's side of the sound driver (SHA-266).
//
// A command written to REG_SOUND before the Z80 has read the last one replaces
// it, so a brick and a bounce in the same frame would lose one: they queue,
// and one leaves per frame. A full queue drops the newest.

#include "game.h"

#define SOUND_QUEUE 8
static u8 sound_queue[SOUND_QUEUE];
static u8 sound_head, sound_tail;

void sound(u8 command) {
  u8 next = (sound_tail + 1) % SOUND_QUEUE;
  if (next != sound_head) {
    sound_queue[sound_tail] = command;
    sound_tail = next;
  }
}

void flush_sound(void) {
  if (sound_head != sound_tail) {
    *REG_SOUND = sound_queue[sound_head];
    sound_head = (sound_head + 1) % SOUND_QUEUE;
  }
}
