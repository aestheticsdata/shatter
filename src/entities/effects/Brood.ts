import { gameConfig } from "@core/config/GameConfig";

import type { ObserverDefinition } from "@interfaces/types";

/** Which of the three shapes a beast is wearing. */
export type BroodForm = 0 | 1 | 2;

export interface Beast {
  alive: boolean;
  x: number;
  y: number;
  form: BroodForm;
  /** +1 walking right, -1 walking left. */
  direction: number;
  /** Its own phase on the bob, so no two in a row rise and fall together. */
  bob: number;
  /** Ticks of white left from the last strike. */
  flashTicks: number;
}

/**
 * THE OBSERVER's brood (SHA-170): eggs it laid on the band, which hatch and
 * take wing when you hit them.
 *
 * **Struck, a beast does not lose a hit point — it changes into something
 * worse.** An egg drifts at a third of a pixel a tick; a hatchling trots at
 * more than twice that; a wyvern flies at nearly five times, and is wider than
 * either, so the third form is both harder to avoid and harder to miss. That is
 * the whole of the Devil's Crush inheritance the counter-spec asked for: a
 * table that changes when it is hit, rather than one that merely wears down.
 *
 * The geometry and the clock live here. What a hit is *worth*, and what a kill
 * lights, are the game's — the same division `Critter` and `Detonation` keep.
 */
export class Brood {
  readonly beasts: Beast[] = [];
  /** How many may be on the band at once — higher on THE TEAR, which makes them. */
  private cap: number = gameConfig.observer.brood.cap;

  get live(): boolean {
    return this.beasts.some((beast) => beast.alive);
  }

  /** How many are walking, against the ceiling for this veil. */
  get crowded(): boolean {
    return this.beasts.filter((beast) => beast.alive).length >= this.cap;
  }

  /**
   * The veil's pins, up to the cap.
   *
   * Directions alternate rather than being drawn: two beasts put down side by
   * side and sent the same way would walk the band in convoy for the whole
   * level, which is one moving target dressed as two.
   */
  load(definition: ObserverDefinition | undefined): void {
    this.beasts.length = 0;
    const { cap, tearCap } = gameConfig.observer.brood;
    // THE TEAR's ceiling is higher because that veil *makes* eggs rather than
    // being built with them: the cap there is a limit on a tap, not a count.
    this.cap = definition?.mode === "tear" ? tearCap : cap;
    const pins = definition?.brood ?? [];
    for (const [index, pin] of pins.slice(0, this.cap).entries()) {
      this.beasts.push({
        alive: true,
        x: pin.x,
        y: pin.y,
        form: pin.form,
        direction: index % 2 === 0 ? 1 : -1,
        bob: Math.random() * Math.PI * 2,
        flashTicks: 0,
      });
    }
  }

  reset(): void {
    this.beasts.length = 0;
  }

  /** The band walk: forward at this form's pace, turning at the frame. */
  step(): void {
    const { left, right } = gameConfig.field;
    for (const beast of this.beasts) {
      if (!beast.alive) {
        continue;
      }
      const form = gameConfig.observer.brood.forms[beast.form];
      beast.x += beast.direction * form.speed;
      beast.bob += form.bobRate;
      if (beast.flashTicks > 0) {
        beast.flashTicks -= 1;
      }
      // Turned at the frame's inside edge rather than at the field's, so a
      // wyvern's wingtip never disappears under the side bar the walls are
      // painted with.
      if (beast.x <= left + 1) {
        beast.x = left + 1;
        beast.direction = 1;
      }
      if (beast.x + form.width >= right - 1) {
        beast.x = right - 1 - form.width;
        beast.direction = -1;
      }
    }
  }

  /**
   * A tear has landed (SHA-174): an egg where it fell, if the band has room.
   *
   * Born at the bottom of the band rather than at the pin heights, because that
   * is where the tear *reached* — a creature that appeared halfway up the field
   * would be one the player had watched fall past its own birthplace. It arrives
   * flashing, in the same white a struck beast wears: one idiom for "this thing
   * just changed".
   *
   * `false` when the band is full, which is not a failure — it is the cap doing
   * its job, and the tear is spent either way.
   */
  hatch(x: number): boolean {
    if (this.crowded) {
      return false;
    }
    const { forms, flashTicks } = gameConfig.observer.brood;
    const egg = forms[0];
    const { left, right } = gameConfig.field;
    this.beasts.push({
      alive: true,
      x: Math.max(left + 1, Math.min(right - 1 - egg.width, x - egg.width / 2)),
      y: gameConfig.observer.tears.floorY - egg.height,
      form: 0,
      direction: Math.random() < 0.5 ? -1 : 1,
      bob: Math.random() * Math.PI * 2,
      flashTicks: flashTicks + 2,
    });
    return true;
  }

  /** The first live beast whose box overlaps this one, or null. */
  at(x: number, y: number, width: number, height: number): Beast | null {
    for (const beast of this.beasts) {
      if (!beast.alive) {
        continue;
      }
      const form = gameConfig.observer.brood.forms[beast.form];
      if (x < beast.x + form.width && x + width > beast.x && y < beast.y + form.height && y + height > beast.y) {
        return beast;
      }
    }
    return null;
  }

  /**
   * One strike: the next form, or the kill.
   *
   * `points` is what *this hit* was worth and is paid whichever it was — a
   * wyvern's last hit pays its own 250 and the kill's 1000 on top, which is the
   * mockup's arithmetic and the right one: the hit is a hit before it is a
   * death. Nothing else changes here. The points, the chain link, the star and
   * the sounds are the game's.
   *
   * **The new form is centred on the old one's centre**, so a beast that grows
   * does not appear to jump sideways; then it is clamped back inside the frame,
   * because a wyvern that came out of an egg against the wall is 12 px wider
   * than the egg was and would otherwise be born half outside the field.
   */
  strike(beast: Beast): { points: number; killed: boolean } {
    const { forms, flashTicks } = gameConfig.observer.brood;
    const form = forms[beast.form];
    if (beast.form >= forms.length - 1) {
      beast.alive = false;
      return { points: form.points, killed: true };
    }
    const next = forms[beast.form + 1];
    beast.x += (form.width - next.width) / 2;
    beast.y += (form.height - next.height) / 2;
    const { left, right } = gameConfig.field;
    beast.x = Math.max(left + 1, Math.min(right - 1 - next.width, beast.x));
    beast.form = (beast.form + 1) as BroodForm;
    beast.flashTicks = flashTicks;
    return { points: form.points, killed: false };
  }
}
