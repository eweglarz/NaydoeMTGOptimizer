/**
 * startup.mjs — Railway bootstrap script
 *
 * Runs before `npm start`. Checks if cards.db is populated; if not, downloads
 * oracle-cards from Scryfall and imports oracle-tags from the committed
 * oracle-tags.jsonl file. On Railway, data/ is a persistent volume so this
 * only runs on first deploy (or after a volume reset).
 *
 * Usage: node scripts/startup.mjs
 */

import { createReadStream, existsSync, mkdirSync, createWriteStream, unlinkSync, readdirSync, statSync } from "fs";
import { createInterface } from "readline";
import { createGunzip } from "zlib";
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

function findAtRoot(prefix, suffix, dir = ROOT) {
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(suffix));
  return match ? path.join(dir, match) : null;
}

function findInBulk(prefix) {
  const bulkDir = path.join(ROOT, "ScryfallBulk");
  if (!existsSync(bulkDir)) return null;
  for (const entry of readdirSync(bulkDir)) {
    if (!entry.startsWith(prefix)) continue;
    const entryPath = path.join(bulkDir, entry);
    if (statSync(entryPath).isFile()) return entryPath;
    const inner = readdirSync(entryPath).find((f) => f.startsWith(prefix));
    if (inner) return path.join(entryPath, inner);
  }
  return null;
}

function isDbPopulated() {
  if (!existsSync(DB_PATH)) return false;
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) as n FROM cards").get();
    db.close();
    return row.n > 0;
  } catch {
    return false;
  }
}

function hasOracleTags() {
  if (!existsSync(DB_PATH)) return false;
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oracle_tag_index'").get();
    if (!tableExists) { db.close(); return false; }
    const { n } = db.prepare("SELECT COUNT(*) as n FROM oracle_tag_index").get();
    db.close();
    return n > 0;
  } catch {
    return false;
  }
}

async function readJsonlCards(filePath) {
  return new Promise((resolve, reject) => {
    const cards = [];
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    rl.on("line", (line) => {
      const t = line.trim();
      if (!t || t === "[" || t === "]") return;
      const clean = t.endsWith(",") ? t.slice(0, -1) : t;
      try {
        const obj = JSON.parse(clean);
        if (obj.id && obj.name) cards.push(obj);
      } catch {}
    });
    rl.on("close", () => resolve(cards));
    rl.on("error", reject);
  });
}

async function readTagsJsonl(filePath) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line);
        if (obj.slug && Array.isArray(obj.taggings)) entries.push(obj);
      } catch {}
    });
    rl.on("close", () => resolve(entries));
    rl.on("error", reject);
  });
}

async function readTagsJsonlGz(filePath) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const rl = createInterface({ input: createReadStream(filePath).pipe(createGunzip()), crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line);
        if (obj.slug && Array.isArray(obj.taggings)) entries.push(obj);
      } catch {}
    });
    rl.on("close", () => resolve(entries));
    rl.on("error", reject);
  });
}

async function syncCards() {
  console.log("[startup] Syncing cards...");

  let cards;
  const localJsonl = findInBulk("oracle-cards") ?? findAtRoot("oracle-cards", ".jsonl");

  if (localJsonl) {
    console.log(`[startup] Reading cards from ${path.basename(localJsonl)}`);
    cards = await readJsonlCards(localJsonl);
  } else {
    console.log("[startup] Downloading oracle-cards from Scryfall API...");
    const metaRes = await fetch("https://api.scryfall.com/bulk-data", { headers: { "User-Agent": UA } });
    if (!metaRes.ok) throw new Error(`Scryfall bulk-data failed: ${metaRes.status}`);
    const meta = await metaRes.json();
    const entry = meta.data.find((d) => d.type === "oracle_cards");
    if (!entry) throw new Error("oracle_cards not found in Scryfall bulk-data");

    console.log(`[startup] Downloading ${(entry.compressed_size / 1024 / 1024).toFixed(1)} MB...`);
    const dlRes = await fetch(entry.download_uri, { headers: { "User-Agent": UA } });
    if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);

    await new Promise((resolve, reject) => {
      const writer = createWriteStream(TMP_PATH);
      const reader = dlRes.body.getReader();
      let mb = 0;
      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) { writer.end(resolve); return; }
          mb += value.length / 1024 / 1024;
          process.stdout.write(`\r[startup]   ${mb.toFixed(1)} MB...`);
          writer.write(value, pump);
        }).catch(reject);
      }
      pump();
    });
    console.log();

    const { readFileSync } = await import("fs");
    cards = JSON.parse(readFileSync(TMP_PATH, "utf-8"));
    try { unlinkSync(TMP_PATH); } catch {}
  }

  console.log(`[startup] Importing ${cards.length} cards into SQLite...`);
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
  try { db.exec("ALTER TABLE cards ADD COLUMN oracle_id TEXT"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_cards_oracle_id ON cards(oracle_id)"); } catch {}

  const insert = db.prepare("INSERT OR REPLACE INTO cards (id, lower_name, oracle_id, data) VALUES (?, ?, ?, ?)");
  db.transaction((rows) => {
    db.prepare("DELETE FROM cards").run();
    for (const card of rows) {
      insert.run(card.id, card.name.toLowerCase(), card.oracle_id ?? null, JSON.stringify(card));
    }
  })(cards);

  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("last_sync", new Date().toISOString());
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("card_count", String(cards.length));
  db.close();
  console.log(`[startup] Cards sync done: ${cards.length} cards`);
}

async function syncOracleTags() {
  console.log("[startup] Syncing oracle tags...");

  const jsonlFile = findAtRoot("oracle-tags", ".jsonl") ?? findInBulk("oracle-tags");
  const gzFile = jsonlFile
    ? null
    : (findAtRoot("oracle-tags", ".jsonl.gz") ?? findAtRoot("oracle-tags", ".jsonl.gz", DATA_DIR));

  if (!jsonlFile && !gzFile) {
    console.warn("[startup] oracle-tags file not found — skipping tag sync");
    return;
  }

  const tags = jsonlFile ? await readTagsJsonl(jsonlFile) : await readTagsJsonlGz(gzFile);
  console.log(`[startup] Loaded ${tags.length} tag entries from ${path.basename(jsonlFile ?? gzFile)}`);

  const db = new Database(DB_PATH);
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
  try { db.exec("ALTER TABLE cards ADD COLUMN oracle_id TEXT"); } catch {}
  db.exec("UPDATE cards SET oracle_id = json_extract(data, '$.oracle_id') WHERE oracle_id IS NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_cards_oracle_id ON cards(oracle_id)");

  db.exec("DELETE FROM oracle_tag_index");
  const insert = db.prepare("INSERT OR IGNORE INTO oracle_tag_index (slug, oracle_id) VALUES (?, ?)");
  db.transaction((entries) => {
    for (const tag of entries) {
      for (const tagging of tag.taggings) {
        if (tagging.oracle_id) insert.run(tag.slug, tagging.oracle_id);
      }
    }
  })(tags);

  const { n: tagCount } = db.prepare("SELECT COUNT(DISTINCT slug) as n FROM oracle_tag_index").get();
  const { n: assignmentCount } = db.prepare("SELECT COUNT(*) as n FROM oracle_tag_index").get();
  db.close();
  console.log(`[startup] Oracle tags done: ${tagCount} tags, ${assignmentCount.toLocaleString()} assignments`);
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  if (!isDbPopulated()) {
    await syncCards();
  } else {
    console.log("[startup] cards.db already populated — skipping card sync");
  }

  if (!hasOracleTags()) {
    await syncOracleTags();
  } else {
    console.log("[startup] oracle_tag_index already exists — skipping tag sync");
  }

  console.log("[startup] Bootstrap complete.");
}

main().catch((err) => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});
