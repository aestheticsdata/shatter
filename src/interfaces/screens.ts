/**
 * The screens the stage can be showing, as constants (SHA-253), so the game,
 * the overlay and the film spell them the same way and a typo is a type error
 * rather than a screen that never shows.
 *
 * The three paged menus off the title — LEVELS, CAPSULES and BESTIARY — are
 * screens like the rest: the game only ever shows one of these at a time.
 */
export const SCREEN = {
  TITLE: "title",
  SERVE: "serve",
  PLAY: "play",
  PAUSE: "pause",
  CLEAR: "clear",
  OVER: "over",
  SCORES: "scores",
  ENTRY: "entry",
  LEVELS: "levels",
  CAPSULES: "capsules",
  BESTIARY: "bestiary",
} as const;

export type ScreenName = (typeof SCREEN)[keyof typeof SCREEN];
