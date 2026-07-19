// Server-only — oracle tag index stored alongside cards.db
import path from "path";
import { ScryfallCard } from "@/types/mtg";

const CARDS_DB_PATH = path.join(process.cwd(), "data", "cards.db");

function withinColorIdentity(card: ScryfallCard, ciStr: string): boolean {
  if (ciStr === "c") return card.color_identity.length === 0;
  const allowed = new Set(ciStr.toUpperCase().split(""));
  return card.color_identity.every((c) => allowed.has(c.toUpperCase()));
}

/** True if the oracle_tag_index table has been imported into cards.db */
export function hasOracleTagData(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  if (!fs.existsSync(CARDS_DB_PATH)) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(CARDS_DB_PATH, { readonly: true });
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oracle_tag_index'")
      .get();
    db.close();
    return Boolean(row);
  } catch {
    return false;
  }
}

/** Return up to `limit` ScryfallCards that carry the given oracle tag slug,
 *  filtered to the commander's color identity, commander-legal, and not already in deck. */
export function getLocalCardsByTag(
  slug: string,
  ciStr: string,
  deckNames: Set<string>,
  limit = 12
): ScryfallCard[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  if (!fs.existsSync(CARDS_DB_PATH)) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(CARDS_DB_PATH, { readonly: true });
    try {
      const rows = db
        .prepare(
          `SELECT DISTINCT c.data
           FROM oracle_tag_index oti
           JOIN cards c ON c.oracle_id = oti.oracle_id
           WHERE oti.slug = ?
           LIMIT 300`
        )
        .all(slug) as { data: string }[];

      const results: ScryfallCard[] = [];
      for (const row of rows) {
        if (results.length >= limit) break;
        try {
          const card = JSON.parse(row.data) as ScryfallCard;
          const key = card.name.toLowerCase();
          if (deckNames.has(key)) continue;
          if (card.legalities?.commander !== "legal") continue;
          if (!withinColorIdentity(card, ciStr)) continue;
          results.push(card);
        } catch {}
      }
      return results;
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export function getOracleTagStats(): { tagCount: number; assignmentCount: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  if (!fs.existsSync(CARDS_DB_PATH)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(CARDS_DB_PATH, { readonly: true });
    try {
      const { n: tagCount } = db
        .prepare("SELECT COUNT(DISTINCT slug) as n FROM oracle_tag_index")
        .get() as { n: number };
      const { n: assignmentCount } = db
        .prepare("SELECT COUNT(*) as n FROM oracle_tag_index")
        .get() as { n: number };
      return { tagCount, assignmentCount };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
