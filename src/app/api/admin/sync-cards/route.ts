import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDbStatus } from "@/lib/cardDb";

const DB_PATH = path.join(process.cwd(), "data", "cards.db");
const TMP_PATH = path.join(process.cwd(), "data", "cards_tmp.json");
const SCRYFALL_UA = "NaydoeMTGOptimizer/1.0 (contact: elias666wegs@gmail.com)";

/** GET /api/admin/sync-cards — return current DB status */
export async function GET() {
  const status = getDbStatus();
  if (!status) {
    return NextResponse.json({ synced: false, cardCount: 0, lastSync: null });
  }
  return NextResponse.json({ synced: true, ...status });
}

/** POST /api/admin/sync-cards — download Scryfall oracle-cards bulk data and store in SQLite */
export async function POST() {
  try {
    // Ensure data/ directory exists
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

    // 1. Find the oracle_cards bulk download URL
    const metaRes = await fetch("https://api.scryfall.com/bulk-data", {
      headers: { "User-Agent": SCRYFALL_UA },
    });
    if (!metaRes.ok) throw new Error(`Scryfall bulk-data metadata failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { data: Array<{ type: string; download_uri: string; compressed_size: number }> };
    const entry = meta.data.find((d) => d.type === "oracle_cards");
    if (!entry) throw new Error("oracle_cards bulk data not found in Scryfall response");

    const sizeMB = (entry.compressed_size / 1024 / 1024).toFixed(1);

    // 2. Download to a temp file (streaming so we don't hold 170 MB in memory)
    const dlRes = await fetch(entry.download_uri, {
      headers: { "User-Agent": SCRYFALL_UA },
    });
    if (!dlRes.ok) throw new Error(`Bulk download failed: ${dlRes.status}`);

    const fileStream = fs.createWriteStream(TMP_PATH);
    const reader = dlRes.body!.getReader();
    await new Promise<void>((resolve, reject) => {
      function pump() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              fileStream.end(resolve);
              return;
            }
            fileStream.write(value, pump);
          })
          .catch(reject);
      }
      pump();
    });

    // 3. Parse JSON and import into SQLite
    const raw = fs.readFileSync(TMP_PATH, "utf-8");
    const cards = JSON.parse(raw) as Array<Record<string, unknown>>;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
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

    const importAll = db.transaction((rows: Array<Record<string, unknown>>) => {
      db.prepare("DELETE FROM cards").run();
      for (const card of rows) {
        insert.run(card.id as string, (card.name as string).toLowerCase(), JSON.stringify(card));
      }
    });

    importAll(cards);
    upsertMeta.run("last_sync", new Date().toISOString());
    upsertMeta.run("card_count", String(cards.length));
    db.close();

    // 4. Clean up temp file
    fs.unlinkSync(TMP_PATH);

    return NextResponse.json({
      success: true,
      cardCount: cards.length,
      lastSync: new Date().toISOString(),
      downloadedMB: sizeMB,
    });
  } catch (err) {
    // Clean up temp file on error
    try { fs.unlinkSync(TMP_PATH); } catch {}
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
