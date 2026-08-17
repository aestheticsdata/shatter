// Hands-on debug switches, shipped values = no cheating.
//
// Unlike the `?level=` / `?droprate=` / `?power=` URL params, these are compiled
// into every build, dev and production alike — they exist so a deployed build can
// be debugged on the real site. That is exactly why they must never ship flipped:
// `pnpm run check:debug` fails on any non-shipped value here, and `deploy.sh`
// runs it before the production build, so a forgotten switch blocks the deploy
// instead of reaching players.
//
// Flip a value, reload the page, put it back when done.
export const debugConfig = {
  // Capsule drop chance per destroyed brick, 0..1, replacing the shipped
  // `gameConfig.rules.dropRate` (0.15 — one brick in seven). Set it to 1 to make
  // every brick drop a capsule, 0 to test a run with no power-ups at all.
  // null = shipped rate. The dev-only `?droprate=` param still wins over this.
  dropRate: null as number | null,
} as const;

// What `check:debug` compares against: the values a public build must have.
export const SHIPPED_DEBUG_CONFIG = {
  dropRate: null,
} as const;
