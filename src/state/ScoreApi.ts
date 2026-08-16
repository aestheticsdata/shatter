import type { HiScoreEntry } from "@interfaces/types";

const REQUEST_TIMEOUT_MS = 4000;

function isEntry(value: unknown): value is HiScoreEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HiScoreEntry).name === "string" &&
    typeof (value as HiScoreEntry).score === "number"
  );
}

function parseScores(payload: unknown): HiScoreEntry[] | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const scores = (payload as { scores?: unknown }).scores;
  if (!Array.isArray(scores) || !scores.every(isEntry)) {
    return null;
  }
  return scores.map((entry) => ({ name: entry.name, score: entry.score }));
}

// Thin client for the shatter-api score service. Every failure — network, timeout,
// non-2xx, malformed payload — resolves to null so callers fall back to localStorage.
export class ScoreApi {
  constructor(private readonly baseUrl = "/api") {}

  async fetchTop(): Promise<HiScoreEntry[] | null> {
    try {
      const response = await fetch(`${this.baseUrl}/scores`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        return null;
      }
      return parseScores(await response.json());
    } catch {
      return null;
    }
  }

  async submit(name: string, score: number): Promise<HiScoreEntry[] | null> {
    try {
      const response = await fetch(`${this.baseUrl}/scores`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, score }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        return null;
      }
      return parseScores(await response.json());
    } catch {
      return null;
    }
  }
}
