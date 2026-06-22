// Lightweight SQLite wrapper around better-sqlite3.
// Schema-typed queries stay in lib/db/queries.ts.

import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_DB_PATH = join(process.cwd(), "data", "versesignal.db");
const VERCEL_DB_PATH = "/tmp/versesignal.db";

let _db: Database.Database | null = null;

function findBundledDb(): string | null {
  const candidates = [
    // Vercel serverless function root
    "/var/task/data/versesignal.db",
    // Local development
    LOCAL_DB_PATH,
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function resolveDbPath(): string {
  const override = process.env.VERSESIGNAL_DB;
  if (override) return override;

  // Vercel's bundle is read-only, so copy the committed SQLite file into /tmp
  // before opening it. Local dev keeps using the repo copy directly.
  if (process.env.VERCEL) {
    mkdirSync("/tmp", { recursive: true });
    const bundled = findBundledDb();
    if (bundled && !existsSync(VERCEL_DB_PATH)) {
      copyFileSync(bundled, VERCEL_DB_PATH);
    }
    return VERCEL_DB_PATH;
  }

  const bundled = findBundledDb();
  if (bundled) return bundled;

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  return LOCAL_DB_PATH;
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const db = new Database(resolveDbPath());
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  _db = db;
  return db;
}

export function initDb(): void {
  const db = getDb();
  const schemaCandidates = [
    "/var/task/scripts/schema.sql",
    join(process.cwd(), "scripts", "schema.sql"),
  ];
  let schema = "";
  for (const p of schemaCandidates) {
    if (existsSync(p)) {
      schema = readFileSync(p, "utf8");
      break;
    }
  }
  if (schema) db.exec(schema);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
