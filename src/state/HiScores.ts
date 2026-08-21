import type { HiScoreEntry } from "@interfaces/types";
import type { ScoreApi } from "@state/ScoreApi";

const STORAGE_KEY = "shatter.hiscores.v1";

// How many ranks the board holds. Exported because the screen pads itself out to
// this many rows: a table that is short of players must still be a full board.
export const TABLE_SIZE = 15;

// The board a fresh machine ships with. The API seeds an empty database with the
// same fifteen (server/src/db.js) and the two lists must stay identical, or the
// first sync of a fresh install would swap one set of defaults for another.
const DEFAULT_ENTRIES: readonly HiScoreEntry[] = [
  { name: "AMI", score: 12500 },
  { name: "CBM", score: 9800 },
  { name: "PAL", score: 7400 },
  { name: "FDD", score: 5200 },
  { name: "KIK", score: 3000 },
  { name: "AGA", score: 2700 },
  { name: "ECS", score: 2400 },
  { name: "OCS", score: 2100 },
  { name: "DMA", score: 1850 },
  { name: "CIA", score: 1600 },
  { name: "SID", score: 1350 },
  { name: "C64", score: 1100 },
  { name: "MOD", score: 900 },
  { name: "WB1", score: 700 },
  { name: "RAM", score: 500 },
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

// Hall of fame backed by the shatter-api service, with localStorage as both the
// instant-boot cache and the offline fallback: the game never waits on the network.
export class HiScores {
  private list: HiScoreEntry[] = [...DEFAULT_ENTRIES];

  // Fired when the table changes outside the game loop (a remote sync landing).
  onChange: (() => void) | null = null;

  constructor(private readonly api: ScoreApi | null = null) {
    this.load();
  }

  get entries(): readonly HiScoreEntry[] {
    return this.list;
  }

  get top(): HiScoreEntry {
    return this.list[0] ?? DEFAULT_ENTRIES[0];
  }

  // Pull the shared table from the API; the local cache stays when unreachable
  // or when the server table is empty (never wipe the board to nothing).
  sync(): void {
    void this.api?.fetchTop().then((remote) => {
      if (remote && remote.length > 0) {
        this.replace(remote);
      }
    });
  }

  commit(name: string, score: number): void {
    this.replace([...this.list, { name, score }]);
    void this.api?.submit(name, score).then((remote) => {
      if (remote && remote.length > 0) {
        this.replace(remote);
      }
    });
  }

  private replace(entries: readonly HiScoreEntry[]): void {
    this.list = entries.toSorted((a, b) => b.score - a.score).slice(0, TABLE_SIZE);
    this.persist();
    this.onChange?.();
  }

  private persist(): void {
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
