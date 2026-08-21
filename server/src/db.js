import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

export function openDatabase(filePath) {
  const absolutePath = resolve(filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  const db = new Database(absolutePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(name) = 3),
      score INTEGER NOT NULL CHECK (score >= 0),
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_top ON scores (score DESC, id ASC);
  `);

  // Ties rank by insertion order: the earlier submission keeps the higher row.
  const topStatement = db.prepare("SELECT name, score FROM scores ORDER BY score DESC, id ASC LIMIT ?");
  const insertStatement = db.prepare("INSERT INTO scores (name, score, ip) VALUES (?, ?, ?)");

  // A brand-new table gets the classic arcade board, matching the front-end defaults —
  // an empty global hall of fame would wipe them on the first sync.
  const isEmpty = db.prepare("SELECT COUNT(*) AS count FROM scores").get().count === 0;
  if (isEmpty) {
    const seed = db.transaction((entries) => {
      for (const [name, score] of entries) {
        insertStatement.run(name, score, null);
      }
    });
    seed([
      ["AMI", 12500],
      ["CBM", 9800],
      ["PAL", 7400],
      ["FDD", 5200],
      ["KIK", 3000],
      ["AGA", 2700],
      ["ECS", 2400],
      ["OCS", 2100],
      ["DMA", 1850],
      ["CIA", 1600],
      ["SID", 1350],
      ["C64", 1100],
      ["MOD", 900],
      ["WB1", 700],
      ["RAM", 500],
    ]);
  }

  return {
    top: (limit) => topStatement.all(limit),
    insert: (name, score, ip) => insertStatement.run(name, score, ip),
  };
}
