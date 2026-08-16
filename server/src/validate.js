export const SCORE_MAX = 10_000_000;

const NAME_PATTERN = /^[A-Z0-9]{3}$/;

// Crude 3-letter combos land on the board as "???" instead of being rejected —
// rejecting would just make trolls iterate until something slips through.
const BLOCKED_NAMES = new Set([
  "ASS",
  "CAC",
  "CUL",
  "FCK",
  "FDP",
  "FUC",
  "FUK",
  "KKK",
  "NIK",
  "NTM",
  "PIS",
  "PUT",
  "SEX",
  "ZOB",
]);

// Returns the canonical uppercase name, "???" for blocked combos, or null when invalid.
export function normalizeName(value) {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.toUpperCase();
  if (!NAME_PATTERN.test(name)) {
    return null;
  }
  return BLOCKED_NAMES.has(name) ? "???" : name;
}

export function isValidScore(value) {
  return Number.isInteger(value) && value >= 0 && value <= SCORE_MAX;
}
