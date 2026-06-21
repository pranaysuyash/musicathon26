// Lightweight SQLite wrapper around better-sqlite3.
// Schema-typed queries stay in lib/db/queries.ts.

import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_DB_PATH = join(process.cwd(), "data", "versesignal.db");
const VERCEL_DB_PATH = "/tmp/versesignal.db";

let _db: Database.Database | null = null;

function resolveDbPath(): string {
  const override = process.env.VERSESIGNAL_DB;
  if (override) return override;

  // Vercel's bundle is read-only, so copy the committed SQLite file into /tmp
  // before opening it. Local dev keeps using the repo copy directly.
  if (process.env.VERCEL) {
    mkdirSync("/tmp", { recursive: true });
    if (!existsSync(VERCEL_DB_PATH) && existsSync(LOCAL_DB_PATH)) {
      copyFileSync(LOCAL_DB_PATH, VERCEL_DB_PATH);
    }
    return VERCEL_DB_PATH;
  }

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
  const schemaPath = join(process.cwd(), "scripts", "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
