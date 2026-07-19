import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import readline from "readline";
import { getDbStatus } from "@/lib/cardDb";
import { requireAdminKey } from "@/lib/adminAuth";

const DB_PATH = path.join(process.cwd(), "data", "cards.db");
const SCRYFALL_UA = "NaydoeMTGOptimizer/1.0 (contact: elias666wegs@gmail.com)";

let syncState: { inProgress: boolean; startedAt: string | null; error: string | null } = {
  inProgress: false,
  startedAt: null,
  error: null,
};

function findInBulk(prefix: string): string | null {
  const bulkDir = path.join(process.cwd(), "ScryfallBulk");
  if (!fs.existsSync(bulkDir)) return null;
  for (const entry of fs.readdirSync(bulkDir)) {
    if (!entry.startsWith(prefix)) continue;
    const entryPath = path.join(bulkDir, entry);
    if (fs.statSync(entryPath).isFile()) return entryPath;
    const inner = fs.readdirSync(entryPath).find((f) => f.startsWith(prefix));
    if (inner) return path.join(entryPath, inner);
  }
  return null;
}

function parseOracleCardsJsonl(filePath: string): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const cards: Array<Record<string, unknown>> = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "[" || trimmed === "]") return;
      const clean = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
      try {
        const obj = JSON.parse(clean) as Record<string, unknown>;
        if (obj.id && obj.name) cards.push(obj);
      } catch {}
    });
    rl.on("close", () => resolve(cards));
    rl.on("error", reject);
  });
}

async function runSync() {
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

  let cards: Array<Record<string, unknown>>;

  const localJsonl = findInBulk("oracle-cards");
  if (localJsonl) {
    cards = await parseOracleCardsJsonl(localJsonl);
  } else {
    const metaRes = await fetch("https://api.scryfall.com/bulk-data", { headers: { "User-Agent": SCRYFALL_UA } });
    if (!metaRes.ok) throw new Error(`Scryfall bulk-data failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { data: Array<{ type: string; download_uri: string }> };
    const entry = meta.data.find((d) => d.type === "oracle_cards");
    if (!entry) throw new Error("oracle_cards not found in Scryfall bulk-data");

    const dlRes = await fetch(entry.download_uri, { headers: { "User-Agent": SCRYFALL_UA } });
    if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
    const raw = await dlRes.text();
    cards = JSON.parse(raw) as Array<Record<string, unknown>>;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id         TEXT PRIMARY KEY,
      lower_name TEXT NOT NULL,
      oracle_id  TEXT,
      data       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lower_name ON cards(lower_name);
    CREATE INDEX IF NOT EXISTS idx_cards_oracle_id ON cards(oracle_id);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  try { db.exec("ALTER TABLE cards ADD COLUMN oracle_id TEXT"); } catch { /* already exists */ }
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_cards_oracle_id ON cards(oracle_id)"); } catch { /* already exists */ }

  const insert = db.prepare("INSERT OR REPLACE INTO cards (id, lower_name, oracle_id, data) VALUES (?, ?, ?, ?)");
  const upsertMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");

  db.transaction((rows: Array<Record<string, unknown>>) => {
    db.prepare("DELETE FROM cards").run();
    for (const card of rows) {
      insert.run(
        card.id as string,
        (card.name as string).toLowerCase(),
        (card.oracle_id as string | undefined) ?? null,
        JSON.stringify(card)
      );
    }
  })(cards);

  upsertMeta.run("last_sync", new Date().toISOString());
  upsertMeta.run("card_count", String(cards.length));
  db.close();
}

/** GET /api/admin/sync-cards — return current DB status */
export async function GET(request: NextRequest) {
  const authError = requireAdminKey(request);
  if (authError) return authError;
  const status = getDbStatus();
  return NextResponse.json({
    synced: !!status,
    syncInProgress: syncState.inProgress,
    syncStartedAt: syncState.startedAt,
    lastError: syncState.error,
    ...(status ?? { cardCount: 0, lastSync: null }),
  });
}

/** POST /api/admin/sync-cards — start background sync, returns 202 immediately */
export async function POST(request: NextRequest) {
  const authError = requireAdminKey(request);
  if (authError) return authError;

  if (syncState.inProgress) {
    return NextResponse.json({ started: false, message: "Sync already in progress", startedAt: syncState.startedAt });
  }

  syncState = { inProgress: true, startedAt: new Date().toISOString(), error: null };

  runSync()
    .then(() => { syncState = { inProgress: false, startedAt: null, error: null }; })
    .catch((err: unknown) => { syncState = { inProgress: false, startedAt: null, error: String(err) }; });

  return NextResponse.json(
    { started: true, message: "Card sync started in background. Poll GET /api/admin/sync-cards for completion." },
    { status: 202 }
  );
}
