export function zeroPad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * How wide every printed score is — the panel's two insets, the title's top
 * score, GAME OVER and the hall of fame.
 *
 * Seven and not six since SHA-168. One loop's clear bonuses alone come to
 * 500 x (1 + ... + 43) = 473 000 before a single brick is counted or a single
 * chain is held, so six digits would roll a good run over inside the first pass
 * — and a score that wraps is worse than no score at all. Here rather than in
 * the game, because the panel prints two of the five and importing the rule is
 * cheaper than passing it. The server's column is an integer and never had an
 * opinion about this.
 */
export const SCORE_DIGITS = 7;
