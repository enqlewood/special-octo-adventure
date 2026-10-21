import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

// A single SQLite file next to the server. Uses Node's built-in SQLite
// (Node 22.5+), so there's nothing extra to install.
const db = new DatabaseSync(
  process.env.DATABASE_PATH || fileURLToPath(new URL("./data.db", import.meta.url))
);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Only a hash of each login token is stored, so a leaked database
  -- can't be used to sign in as anyone.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  -- history: the raw Claude message list, sent back to Claude each turn.
  -- display: what the app shows (user/assistant bubbles and result cards).
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    history TEXT NOT NULL,
    display TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS conversations_by_user
    ON conversations (user_id, updated_at);

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    restaurant TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, place_id)
  );
`);

export default db;
