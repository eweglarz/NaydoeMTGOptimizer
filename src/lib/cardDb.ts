import path from "path";
import type { Database as DatabaseType } from "better-sqlite3";
import { ScryfallCard } from "@/types/mtg";

const DB_PATH = path.join(process.cwd(), "data", "cards.db");

let _db: DatabaseType | null = null;
let _attempted = false;

function getDb(): DatabaseType | null {
  if (_attempted) return _db;
  _attempted = true;
  try {
    const fs = require("fs") as typeof import("fs");
    if (!fs.existsSync(DB_PATH)) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    _db = new Database(DB_PATH, { readonly: true });
    return _db;
  } catch {
    return null;
  }
}

/** Look up a single card by name. Returns null if not found or DB unavailable. */
export function getCardByNameLocal(name: string): ScryfallCard | null {
  const db = getDb();
  if (!db) return null;
  try {
    const lower = name.toLowerCase();
    // Exact name match
    const row = db.prepare("SELECT data FROM cards WHERE lower_name = ?").get(lower) as
      | { data: string }
      | undefined;
    if (row) return JSON.parse(row.data) as ScryfallCard;
    // DFC front-face match: "Needleverge Pathway" → "needleverge pathway // pillarverge pathway"
    const dfcRow = db
      .prepare("SELECT data FROM cards WHERE lower_name LIKE ? ESCAPE '\\'")
      .get(`${lower} //%`) as { data: string } | undefined;
    if (dfcRow) return JSON.parse(dfcRow.data) as ScryfallCard;
    return null;
  } catch {
    return null;
  }
}

/** Look up multiple cards by name. Returns a map keyed by lowercase name. */
export function getCardsByNamesLocal(names: string[]): Map<string, ScryfallCard> {
  const result = new Map<string, ScryfallCard>();
  const db = getDb();
  if (!db || names.length === 0) return result;
  try {
    const stmt = db.prepare("SELECT data FROM cards WHERE lower_name = ?");
    for (const name of names) {
      const row = stmt.get(name.toLowerCase()) as { data: string } | undefined;
      if (!row) continue;
      const card = JSON.parse(row.data) as ScryfallCard;
      const canonical = card.name.toLowerCase();
      result.set(canonical, card);
      if (name.toLowerCase() !== canonical) result.set(name.toLowerCase(), card);
      const front = canonical.split(" // ")[0].trim();
      if (front !== canonical) result.set(front, card);
    }
  } catch {}
  return result;
}

/** Returns sync status for the admin UI, or null if DB doesn't exist yet. */
export function getDbStatus(): { cardCount: number; lastSync: string } | null {
  const db = getDb();
  if (!db) return null;
  try {
    const { n } = db.prepare("SELECT COUNT(*) as n FROM cards").get() as { n: number };
    const meta = db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("last_sync") as { value: string } | undefined;
    return { cardCount: n, lastSync: meta?.value ?? "unknown" };
  } catch {
    return null;
  }
}
