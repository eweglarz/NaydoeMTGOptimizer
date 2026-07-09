/**
 * sync-cards.mjs — Download Scryfall oracle-cards bulk data and store in local SQLite.
 *
 * Usage:
 *   npm run sync-cards
 *
 * The resulting database is stored at data/cards.db and is used as an offline
 * fallback when Scryfall's API is unavailable.
 *
 * Requires Node.js 18+ and better-sqlite3 (installed as a project dependency).
 * Run this once initially, then re-run whenever you want to refresh card data.
 */

import { createWriteStream, mkdirSync, unlinkSync, existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "cards.db");
const TMP_PATH = path.join(DATA_DIR, "cards_tmp.json");
const UA = "NaydoeMTGOptimizer/1.0 (contact: elias666wegs@gmail.com)";

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // --- 1. Fetch bulk-data metadata ---
  console.log("Fetching Scryfall bulk-data info...");
  const metaRes = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": UA },
  });
  if (!metaRes.ok) throw new Error(`Bulk-data metadata request failed: ${metaRes.status}`);
  const meta = await metaRes.json();
  const entry = meta.data.find((d) => d.type === "oracle_cards");
  if (!entry) throw new Error("oracle_cards entry not found in Scryfall bulk-data response");

  const sizeMB = (entry.compressed_size / 1024 / 1024).toFixed(1);
  console.log(`Downloading oracle-cards (${sizeMB} MB compressed, ~30k cards)...`);
  console.log(`Source: ${entry.download_uri}`);

  // --- 2. Stream download to temp file ---
  const dlRes = await fetch(entry.download_uri, { headers: { "User-Agent": UA } });
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);

  await new Promise((resolve, reject) => {
    const writer = createWriteStream(TMP_PATH);
    const reader = dlRes.body.getReader();
    let downloaded = 0;
    function pump() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) { writer.end(resolve); return; }
          downloaded += value.length;
          process.stdout.write(`\r  ${(downloaded / 1024 / 1024).toFixed(1)} MB downloaded...`);
          writer.write(value, pump);
        })
        .catch(reject);
    }
    pump();
  });
  console.log("\nDownload complete. Parsing JSON...");

  // --- 3. Parse cards ---
  const raw = readFileSync(TMP_PATH, "utf-8");
  const cards = JSON.parse(raw);
  console.log(`Parsed ${cards.length} cards. Importing into SQLite...`);

  // --- 4. Import into SQLite ---
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      lower_name TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lower_name ON cards(lower_name);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insert = db.prepare("INSERT OR REPLACE INTO cards (id, lower_name, data) VALUES (?, ?, ?)");
  const upsertMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");

  const importAll = db.transaction((rows) => {
    db.prepare("DELETE FROM cards").run();
    let i = 0;
    for (const card of rows) {
      insert.run(card.id, card.name.toLowerCase(), JSON.stringify(card));
      i++;
      if (i % 5000 === 0) process.stdout.write(`\r  ${i}/${rows.length} cards imported...`);
    }
  });

  importAll(cards);
  upsertMeta.run("last_sync", new Date().toISOString());
  upsertMeta.run("card_count", String(cards.length));
  db.close();

  // --- 5. Cleanup ---
  unlinkSync(TMP_PATH);

  console.log(`\nDone! ${cards.length} cards stored at data/cards.db`);
  console.log("The app will now use this as a fallback when Scryfall is unavailable.");
}

main().catch((err) => {
  console.error("Sync failed:", err);
  try { unlinkSync(TMP_PATH); } catch {}
  process.exit(1);
});
