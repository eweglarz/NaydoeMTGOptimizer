import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import readline from "readline";
import { getOracleTagStats } from "@/lib/oracleTagDb";

const CARDS_DB_PATH = path.join(process.cwd(), "data", "cards.db");

interface TagEntry {
  slug: string;
  type: string;
  taggings: Array<{ oracle_id: string }>;
}

/** Find a file whose name starts with prefix and ends with suffix, searching dir (default: project root) */
function findAtRoot(prefix: string, suffix: string, dir = process.cwd()): string | null {
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(suffix));
  return match ? path.join(dir, match) : null;
}

/** Recursively find the first file in ScryfallBulk/ whose name starts with prefix */
function findInBulk(prefix: string): string | null {
  const bulkDir = path.join(process.cwd(), "ScryfallBulk");
  if (!fs.existsSync(bulkDir)) return null;
  for (const entry of fs.readdirSync(bulkDir)) {
    if (!entry.startsWith(prefix)) continue;
    const entryPath = path.join(bulkDir, entry);
    if (fs.statSync(entryPath).isFile()) return entryPath;
    // Files are nested inside same-name subdirectories
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

export async function GET() {
  if (!fs.existsSync(CARDS_DB_PATH)) {
    return NextResponse.json({ synced: false, error: "cards.db not found — sync cards first" });
  }
  const stats = getOracleTagStats();
  if (!stats) return NextResponse.json({ synced: false, tagCount: 0, assignmentCount: 0 });
  return NextResponse.json({ synced: true, ...stats });
}

export async function POST() {
  if (!fs.existsSync(CARDS_DB_PATH)) {
    return NextResponse.json(
      { success: false, error: "cards.db not found — run /api/admin/sync-cards first" },
      { status: 400 }
    );
  }

  // Find oracle-tags data — priority: root .jsonl > ScryfallBulk .jsonl > root/data .gz
  const rootJsonl = findAtRoot("oracle-tags", ".jsonl");
  const bulkJsonl = rootJsonl ? null : findInBulk("oracle-tags");
  const gzPath = (rootJsonl || bulkJsonl)
    ? null
    : (findAtRoot("oracle-tags", ".jsonl.gz") ?? findAtRoot("oracle-tags", ".jsonl.gz", path.join(process.cwd(), "data")));

  if (!rootJsonl && !bulkJsonl && !gzPath) {
    return NextResponse.json(
      { success: false, error: "oracle-tags file not found. Add oracle-tags.jsonl to the project root." },
      { status: 404 }
    );
  }

  try {
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
    const tags = jsonlFile
      ? await parseJsonl(jsonlFile)
      : await parseJsonlGz(gzPath!);

    const source = jsonlFile ? path.basename(jsonlFile) : path.basename(gzPath!);

    db.exec("DELETE FROM oracle_tag_index");
    const insert = db.prepare("INSERT OR IGNORE INTO oracle_tag_index (slug, oracle_id) VALUES (?, ?)");
    db.transaction((entries: TagEntry[]) => {
      for (const tag of entries) {
        for (const tagging of tag.taggings) {
          if (tagging.oracle_id) insert.run(tag.slug, tagging.oracle_id);
        }
      }
    })(tags);

    const { n: tagCount } = db.prepare("SELECT COUNT(DISTINCT slug) as n FROM oracle_tag_index").get() as { n: number };
    const { n: assignmentCount } = db.prepare("SELECT COUNT(*) as n FROM oracle_tag_index").get() as { n: number };
    db.close();

    return NextResponse.json({
      success: true,
      tagCount,
      assignmentCount,
      source,
      message: `Imported ${tagCount} tags with ${assignmentCount.toLocaleString()} card assignments from ${source}`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
