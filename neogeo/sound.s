;;; Shatter's sound commands for ngdevkit's nullsound driver (SHA-266).
;;;
;;; The 68k writes a command number to REG_SOUND; nullsound jumps through this
;;; table. Commands 0-3 are nullsound's own. The numbers must match SND_* in
;;; main.c.
;;;
;;; Effects are ADPCM-A samples, one channel per kind so a brick never cuts
;;; off a paddle bounce: 0 wall, 1 paddle, 2 brick, 3 launch, 4 lost ball,
;;; 5 jingles. The two tracks are ADPCM-B, looping, at 22.05 kHz.

        .include "helpers.inc"
        .area   CODE

cmd_jmptable::
        jp      snd_command_unused
        jp      snd_command_01_prepare_for_rom_switch
        jp      music_ngdevkit_eye_catcher
        jp      snd_command_03_reset_driver
        jp      play_theme              ; 4
        jp      play_over               ; 5
        jp      stop_music              ; 6
        jp      play_wall               ; 7
        jp      play_paddle             ; 8
        jp      play_launch             ; 9
        jp      play_lost               ; 10
        jp      play_clear              ; 11
        jp      play_gameover           ; 12
        jp      play_brick0             ; 13, the top row
        jp      play_brick1             ; 14
        jp      play_brick2             ; 15
        jp      play_brick3             ; 16
        jp      play_brick4             ; 17
        init_unused_cmd_jmptable


play_theme:
        call    snd_adpcm_b_stop
        ld      ix, #adpcm_b_theme
        call    snd_adpcm_b_play_loop
        ret

play_over:
        call    snd_adpcm_b_stop
        ld      ix, #adpcm_b_over
        call    snd_adpcm_b_play_loop
        ret

stop_music:
        call    snd_adpcm_b_stop
        ret

        .macro  effect name
play_'name:
        ld      ix, #adpcm_a_'name
        call    snd_adpcm_a_play_exclusive
        ret
        .endm

        effect  wall
        effect  paddle
        effect  launch
        effect  lost
        effect  clear
        effect  gameover
        effect  brick0
        effect  brick1
        effect  brick2
        effect  brick3
        effect  brick4


        ;; offsets of the samples in V-ROM, from vromtool
        .include "assets/samples.inc"

        ;; ADPCM-A: start, stop (>> 8), channel, pan + volume, channel bit
        .macro  sample name, upper, channel
adpcm_a_'name:
        .db     upper'_START_LSB
        .db     upper'_START_MSB
        .db     upper'_STOP_LSB
        .db     upper'_STOP_MSB
        .db     channel
        .db     0xdf
        .db     1 << channel
        .endm

        sample  wall, WALL, 0
        sample  paddle, PADDLE, 1
        sample  brick0, BRICK0, 2
        sample  brick1, BRICK1, 2
        sample  brick2, BRICK2, 2
        sample  brick3, BRICK3, 2
        sample  brick4, BRICK4, 2
        sample  launch, LAUNCH, 3
        sample  lost, LOST, 4
        sample  clear, CLEAR, 5
        sample  gameover, GAMEOVER, 5

        ;; ADPCM-B: start, stop (>> 8), delta-N for 22.05 kHz, pan, volume
        .macro  track name, upper
adpcm_b_'name:
        .db     upper'_START_LSB
        .db     upper'_START_MSB
        .db     upper'_STOP_LSB
        .db     upper'_STOP_MSB
        .dw     0x65b5
        .db     0xc0
        .db     MUSIC_VOLUME
        .endm

        ;; The web game mixes the music at 0.12 under effects at 0.05-0.1.
MUSIC_VOLUME = 0x90
        track   theme, THEME
        track   over, OVER
