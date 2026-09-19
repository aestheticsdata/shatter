import { gameConfig } from "@core/config/GameConfig";

/** One line of the chart: the two stars it joins, as tick indices on the dial. */
export type ChartJunction = readonly [number, number];

/**
 * THE CHART (SHA-212): the run's constellation, drawn on the zodiac dial.
 *
 * The dial's twelve ticks are twelve stars, and a junction is a line between two
 * of them — the aspect lines of an astrological chart. Fifty-four of them, in
 * one designed order, so that a run reveals a figure stage by stage rather
 * than scribbling: first the twelve-pointed star (each star to the fifth one
 * on), then the four triangles, the three squares, the two hexagons, and last
 * the six bars straight across the middle. The rim is left out on purpose: a
 * chord between two neighbours lies three pixels inside the circle that is
 * already there and would be fifty-four strokes' worth of nothing to see.
 *
 * **It is the run's, not the level's.** It starts empty with a new game, grows
 * on every level and never resets between them — the one thing on the field
 * that carries what the player has done all the way from level 1. A level
 * cleared draws a stroke, a creature killed draws one, a boss draws three; and a
 * junction takes `strokesPerJunction` of them, drawn from its first star toward
 * its second, so every kill lengthens a line the player can see grow rather
 * than counting toward one they cannot. The figure a run ends with is the
 * record of that run: the clears alone draw the star, the kills fill it in,
 * and only a run that kills nearly everything closes the bars — which is the
 * cage, and the eye on the last veil sits in it.
 *
 * The stroke count is the whole state. Which junctions are whole and which one
 * is half-drawn are both read off it, so nothing here can disagree with itself.
 */
export class Chart {
  private strokesDrawn = 0;
  private revealLeft = 0;

  /** The junctions in the order the run draws them. */
  static readonly junctions: readonly ChartJunction[] = buildJunctions(gameConfig.observer.ring.field.ticks);

  /** Strokes the whole chart takes. */
  static get strokesTotal(): number {
    return Chart.junctions.length * gameConfig.observer.chart.strokesPerJunction;
  }

  reset(): void {
    this.strokesDrawn = 0;
    this.revealLeft = 0;
  }

  /** The reveal fading; nothing else here moves. */
  step(): void {
    if (this.revealLeft > 0) {
      this.revealLeft -= 1;
    }
  }

  /**
   * Draw `count` more strokes. Capped at the whole chart, silently: a kill
   * after the cage has closed keeps its points and the sky simply has no more
   * room, the diadem's rule exactly.
   */
  stroke(count: number): void {
    const before = this.strokesDrawn;
    this.strokesDrawn = Math.min(Chart.strokesTotal, this.strokesDrawn + count);
    if (this.strokesDrawn > before) {
      this.revealLeft = gameConfig.observer.chart.revealTicks;
    }
  }

  /** Set the count outright — the console's word. No reveal: it is not an event. */
  set(strokes: number): void {
    this.strokesDrawn = Math.max(0, Math.min(Chart.strokesTotal, Math.floor(strokes)));
    this.revealLeft = 0;
  }

  get strokes(): number {
    return this.strokesDrawn;
  }

  /** Junctions drawn whole. */
  get complete(): number {
    return Math.floor(this.strokesDrawn / gameConfig.observer.chart.strokesPerJunction);
  }

  /** How much of the next junction is drawn, 0 to just under 1. */
  get pending(): number {
    const per = gameConfig.observer.chart.strokesPerJunction;
    return (this.strokesDrawn % per) / per;
  }

  /** Every junction drawn: the cage is closed. */
  get caged(): boolean {
    return this.strokesDrawn >= Chart.strokesTotal;
  }

  /**
   * The index of the junction the last stroke touched, or -1 with nothing drawn.
   * The renderer lights this one while `reveal` runs.
   */
  get latest(): number {
    if (this.strokesDrawn === 0) {
      return -1;
    }
    return Math.floor((this.strokesDrawn - 1) / gameConfig.observer.chart.strokesPerJunction);
  }

  /** The last stroke's arrival: 1 on the tick it lands, 0 once it has settled. */
  get reveal(): number {
    return this.revealLeft / gameConfig.observer.chart.revealTicks;
  }
}

/**
 * The fifty-four, in drawing order. Each skip is one closed figure over the
 * twelve stars — the widest first, because a chart begun should look like a
 * star and not like a rim — and the diameters are last because they are the
 * bars, and the bars close over the eye at the end.
 */
function buildJunctions(ticks: number): readonly ChartJunction[] {
  const junctions: ChartJunction[] = [];
  for (const skip of gameConfig.observer.chart.skips) {
    // A diameter joins a star to its opposite, and the opposite's own diameter
    // is the same line: half of them is all of them.
    const count = skip * 2 === ticks ? ticks / 2 : ticks;
    for (let index = 0; index < count; index += 1) {
      junctions.push([index, (index + skip) % ticks]);
    }
  }
  return junctions;
}
