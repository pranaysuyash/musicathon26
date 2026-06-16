// Initialize the SQLite database from scripts/schema.sql.
// Idempotent: safe to re-run.

import { initDb, closeDb, getDb } from "../lib/db";
import { execSync } from "node:child_process";

function main() {
  console.log("→ Initializing database...");
  initDb();
  const db = getDb();
  const counts = {
    songs: (db.prepare("SELECT COUNT(*) as c FROM songs").get() as { c: number }).c,
    events: (db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }).c,
    graph_nodes: (db.prepare("SELECT COUNT(*) as c FROM graph_nodes").get() as { c: number }).c,
    graph_edges: (db.prepare("SELECT COUNT(*) as c FROM graph_edges").get() as { c: number }).c,
  };
  console.log("✓ Database ready.");
  console.log("  Tables created; current row counts:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`    ${k}: ${v}`);
  }
  closeDb();
}

main();
