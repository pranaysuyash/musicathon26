// Lightweight SQLite wrapper around better-sqlite3.
// Schema-typed queries stay in lib/db/queries.ts.

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const DB_PATH = process.env.VERSESIGNAL_DB ?? join(process.cwd(), "data", "versesignal.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const db = new Database(DB_PATH);
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
