// THE VEIL's furniture on the fine grid (SHA-234): the two clocks, with none
// of the painting.
//
// The plaques, the diadem and the gate are one step because they are one
// question — all three are already the geometry the handoff drew, and what the
// fine grid gives them is not size but *time*. A twinkle that had two lengths
// gets four; a march that jumped a whole cell a frame gets twelve places to be
// inside one. Both are arithmetic, and arithmetic is what `check:pix` can hold,
// so it lives here rather than inside a draw call.
//
// See the spec: `docs/superpowers/specs/2026-09-21-observer-hd-design.md`.

import { FINE } from "@interfaces/art";

/**
 * Where a star is in its own twinkle, as 0 at the troughs and 1 at the peak.
 *
 * A triangle rather than the square wave the coarse grid draws. With two
 * lengths to choose from there was nothing a smooth clock could say that a
 * boolean could not, so the star blinked; with four there is, and the star
 * breathes. `stagger` is what keeps six of them from breathing as one block,
 * and it is the same offset the tone swap already uses.
 */
export function twinkleSwell(frame: number, index: number, stagger: number, period: number): number {
  const phase = ((frame + index * stagger) % period) / period;
  return 1 - Math.abs(phase * 2 - 1);
}

/**
 * A star's arm at that point in the breath, in fine pixels.
 *
 * Both ends are fine pixels, so a caller says what the arm may run between in
 * the grid it is drawing on rather than in the one the number was authored on:
 * the tube's star runs `2 * FINE` to `3 * FINE`, which is the two game pixels
 * it already swaps between plus the two lengths it never had; the colour star
 * runs from its shipped three game pixels to two thirds of a pixel beyond,
 * because the twinkle may add to the star and may not take from it.
 */
export function twinkleArm(swell: number, shortest: number, longest: number): number {
  return Math.round(shortest + (longest - shortest) * swell);
}

/**
 * How far the gate's march has slid, in game pixels, at this frame.
 *
 * **The coarse march does not move.** Its cells are pinned to the gap and what
 * travels is which tone each one wears, so the light arrives a whole cell at a
 * time — a flicker with a direction rather than something running. A cell is
 * `cell` game pixels and `cell * FINE` fine ones, so on the fine grid the
 * pattern itself can slide a pixel a frame and the cells run through the gap.
 *
 * The period is three cells, because the march is three tones. It comes back
 * in fractions of a game pixel, which is what the renderer's brush wants — a
 * third of a pixel is exactly one fine one at its scale.
 */
export function gateSlide(frame: number, cell: number): number {
  const period = cell * 3;
  return (frame % (period * FINE)) / FINE;
}
