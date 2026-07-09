// Server-only — user accounts and saved decks, stored in data/app.db
import path from "path";
import type { Database as DatabaseType } from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "app.db");

let _db: DatabaseType | null = null;

function getDb(): DatabaseType {
  if (_db) return _db;
  const fs = require("fs") as typeof import("fs");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decks (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      commander_name  TEXT,
      partner_name    TEXT,
      card_names      TEXT NOT NULL DEFAULT '[]',
      sideboard_names TEXT NOT NULL DEFAULT '[]',
      looking_to_add  TEXT NOT NULL DEFAULT '[]',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);
  `);
  return _db;
}

export interface DbUser {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  created_at: string;
}

export interface DbDeck {
  id: string;
  user_id: string;
  name: string;
  commander_name: string | null;
  partner_name: string | null;
  card_names: string;
  sideboard_names: string;
  looking_to_add: string;
  created_at: string;
  updated_at: string;
}

export function createUser(u: Omit<DbUser, "created_at">): DbUser {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(u.id, u.email, u.display_name, u.password_hash, now);
  return { ...u, created_at: now };
}

export function getUserByEmail(email: string): DbUser | null {
  return (getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as DbUser) ?? null;
}

export function getUserById(id: string): DbUser | null {
  return (getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser) ?? null;
}

export function getDecksByUser(userId: string): DbDeck[] {
  return getDb()
    .prepare("SELECT * FROM decks WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId) as DbDeck[];
}

export function getDeckById(id: string, userId: string): DbDeck | null {
  return (
    (getDb()
      .prepare("SELECT * FROM decks WHERE id = ? AND user_id = ?")
      .get(id, userId) as DbDeck) ?? null
  );
}

export function createDeck(d: Omit<DbDeck, "created_at" | "updated_at">): DbDeck {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO decks (id, user_id, name, commander_name, partner_name, card_names, sideboard_names, looking_to_add, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(d.id, d.user_id, d.name, d.commander_name, d.partner_name, d.card_names, d.sideboard_names, d.looking_to_add, now, now);
  return { ...d, created_at: now, updated_at: now };
}

export function upsertDeck(
  id: string,
  userId: string,
  data: {
    name: string;
    commander_name: string | null;
    partner_name: string | null;
    card_names: string;
    sideboard_names: string;
    looking_to_add: string;
  }
): DbDeck {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = getDeckById(id, userId);
  if (existing) {
    db.prepare(`
      UPDATE decks SET name=?, commander_name=?, partner_name=?, card_names=?, sideboard_names=?, looking_to_add=?, updated_at=?
      WHERE id=? AND user_id=?
    `).run(data.name, data.commander_name, data.partner_name, data.card_names, data.sideboard_names, data.looking_to_add, now, id, userId);
    return { ...existing, ...data, updated_at: now };
  } else {
    return createDeck({ id, user_id: userId, ...data });
  }
}

export function deleteDeck(id: string, userId: string): boolean {
  const result = getDb().prepare("DELETE FROM decks WHERE id = ? AND user_id = ?").run(id, userId);
  return (result.changes ?? 0) > 0;
}
