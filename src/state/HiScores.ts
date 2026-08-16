import type { HiScoreEntry } from "@interfaces/types";

const STORAGE_KEY = "shatter.hiscores.v1";
const TABLE_SIZE = 5;

const DEFAULT_ENTRIES: readonly HiScoreEntry[] = [
  { name: "AMI", score: 12500 },
  { name: "CBM", score: 9800 },
  { name: "PAL", score: 7400 },
  { name: "FDD", score: 5200 },
  { name: "KIK", score: 3000 },
];

interface StoredEntry {
  n: string;
  s: number;
}

function isStoredEntry(value: unknown): value is StoredEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredEntry).n === "string" &&
    typeof (value as StoredEntry).s === "number"
  );
}

export class HiScores {
  private list: HiScoreEntry[] = [...DEFAULT_ENTRIES];

  constructor() {
    this.load();
  }

  get entries(): readonly HiScoreEntry[] {
    return this.list;
  }

  get top(): HiScoreEntry {
    return this.list[0] ?? DEFAULT_ENTRIES[0];
  }

  qualifies(score: number): boolean {
    const lowest = this.list.length < TABLE_SIZE ? 0 : this.list[this.list.length - 1].score;
    return score > lowest;
  }

  commit(name: string, score: number): void {
    this.list = [...this.list, { name, score }].toSorted((a, b) => b.score - a.score).slice(0, TABLE_SIZE);
    try {
      const stored: StoredEntry[] = this.list.map((entry) => ({ n: entry.name, s: entry.score }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Persistence is best-effort (private mode, quota); the in-memory table still works.
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isStoredEntry)) {
        this.list = parsed.slice(0, TABLE_SIZE).map((entry) => ({ name: entry.n, score: entry.s }));
      }
    } catch {
      // Corrupt or unavailable storage falls back to the default table.
    }
  }
}
