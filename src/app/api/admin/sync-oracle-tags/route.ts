import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import readline from "readline";
import { getOracleTagStats } from "@/lib/oracleTagDb";
import { requireAdminKey } from "@/lib/adminAuth";

const CARDS_DB_PATH = path.join(process.cwd(), "data", "cards.db");
const STATUS_PATH = path.join(process.cwd(), "data", "sync-oracle-tags-status.json");

interface SyncStatus {
  inProgress: boolean;
  startedAt: string | null;
  error: string | null;
}

function readStatus(): SyncStatus {
  try {
    if (!fs.existsSync(STATUS_PATH)) return { inProgress: false, startedAt: null, error: null };
    const raw = JSON.parse(fs.readFileSync(STATUS_PATH, "utf-8")) as SyncStatus;
    if (raw.inProgress && raw.startedAt) {
      const age = Date.now() - new Date(raw.startedAt).getTime();
      if (age > 20 * 60 * 1000) return { inProgress: false, startedAt: null, error: "Sync timed out (stale lock cleared)" };
    }
    return raw;
  } catch {
    return { inProgress: false, startedAt: null, error: null };
  }
}

function writeStatus(status: SyncStatus) {
  try {
    fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
    fs.writeFileSync(STATUS_PATH, JSON.stringify(status));
  } catch {}
}

interface TagEntry {
  slug: string;
  type: string;
  taggings: Array<{ oracle_id: string }>;
}

function findAtRoot(prefix: string, suffix: string, dir = process.cwd()): string | null {
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(suffix));
  return match ? path.join(dir, match) : null;
}

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

function parseJsonl(filePath: string): Promise<TagEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: TagEntry[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line) as TagEntry;
        if (obj.slug && Array.isArray(obj.taggings)) entries.push(obj);
      } catch {}
    });
    rl.on("close", () => resolve(entries));
    rl.on("error", reject);
  });
}

function parseJsonlGz(filePath: string): Promise<TagEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: TagEntry[] = [];
    const input = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: input.pipe(zlib.createGunzip()), crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line) as TagEntry;
        if (obj.slug && Array.isArray(obj.taggings)) entries.push(obj);
      } catch {}
    });
    rl.on("close", () => resolve(entries));
    rl.on("error", reject);
    input.on("error", reject);
  });
}

async function runSync() {
  writeStatus({ inProgress: true, startedAt: new Date().toISOString(), error: null });
  try {
    const rootJsonl = findAtRoot("oracle-tags", ".jsonl");
    const bulkJsonl = rootJsonl ? null : findInBulk("oracle-tags");
    const gzPath = (rootJsonl || bulkJsonl)
      ? null
      : (findAtRoot("oracle-tags", ".jsonl.gz") ?? findAtRoot("oracle-tags", ".jsonl.gz", path.join(process.cwd(), "data")));

    if (!rootJsonl && !bulkJsonl && !gzPath) throw new Error("oracle-tags file not found");

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(CARDS_DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS oracle_tag_index (
        slug      TEXT NOT NULL,
        oracle_id TEXT NOT NULL,
        PRIMARY KEY (slug, oracle_id)
      );
      CREATE INDEX IF NOT EXISTS idx_oti_slug ON oracle_tag_index(slug);
    `);
    try { db.exec("ALTER TABLE cards ADD COLUMN oracle_id TEXT"); } catch { /* already exists */ }
    db.exec("UPDATE cards SET oracle_id = json_extract(data, '$.oracle_id') WHERE oracle_id IS NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_cards_oracle_id ON cards(oracle_id)");

    const jsonlFile = rootJsonl ?? bulkJsonl;
    const tags = jsonlFile ? await parseJsonl(jsonlFile) : await parseJsonlGz(gzPath!);

    db.exec("DELETE FROM oracle_tag_index");
    const insert = db.prepare("INSERT OR IGNORE INTO oracle_tag_index (slug, oracle_id) VALUES (?, ?)");
    db.transaction((entries: TagEntry[]) => {
      for (const tag of entries) {
        for (const tagging of tag.taggings) {
          if (tagging.oracle_id) insert.run(tag.slug, tagging.oracle_id);
        }
      }
    })(tags);
    db.close();

    writeStatus({ inProgress: false, startedAt: null, error: null });
  } catch (err: unknown) {
    console.error("[sync-oracle-tags] runSync failed:", err);
    writeStatus({ inProgress: false, startedAt: null, error: String(err) });
    throw err;
  }
}

export async function GET(request: NextRequest) {
  const authError = requireAdminKey(request);
  if (authError) return authError;
  if (!fs.existsSync(CARDS_DB_PATH)) {
    return NextResponse.json({ synced: false, error: "cards.db not found — sync cards first" });
  }
  const stats = getOracleTagStats();
  const syncStatus = readStatus();
  return NextResponse.json({
    synced: !!(stats && stats.assignmentCount > 0),
    syncInProgress: syncStatus.inProgress,
    syncStartedAt: syncStatus.startedAt,
    lastError: syncStatus.error,
    ...(stats ?? { tagCount: 0, assignmentCount: 0 }),
  });
}

export async function POST(request: NextRequest) {
  const authError = requireAdminKey(request);
  if (authError) return authError;

  if (!fs.existsSync(CARDS_DB_PATH)) {
    return NextResponse.json(
      { success: false, error: "cards.db not found — run /api/admin/sync-cards first" },
      { status: 400 }
    );
  }

  const syncStatus = readStatus();
  if (syncStatus.inProgress) {
    return NextResponse.json({ started: false, message: "Sync already in progress", startedAt: syncStatus.startedAt });
  }

  runSync().catch(() => { /* errors written to status file and console */ });

  return NextResponse.json(
    { started: true, message: "Oracle tag sync started in background. Poll GET /api/admin/sync-oracle-tags for completion." },
    { status: 202 }
  );
}
