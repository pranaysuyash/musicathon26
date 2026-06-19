// One-off migration: clean up duplicate songs that exist due to
// slug-format change. Keeps the most-recently-ingested row, deletes
// the rest (cascades through lyrics + graph via foreign keys).
//
// Run: npx tsx scripts/migrate-clean-duplicates.ts

import { closeDb, getDb, initDb } from "../lib/db";

function main() {
  initDb();
  const db = getDb();

  // For each (year, title, artist) group, keep only the row with the
  // latest ingested_at. Delete the rest.
  const dupes = db.prepare(`
    SELECT id, ingested_at FROM (
      SELECT id, ingested_at,
             ROW_NUMBER() OVER (
               PARTITION BY year, LOWER(title), LOWER(artist)
               ORDER BY ingested_at DESC
             ) AS rn
      FROM songs
    )
    WHERE rn > 1
  `).all() as { id: string; ingested_at: string }[];

  if (dupes.length === 0) {
    console.log("✓ No duplicate songs found.");
    closeDb();
    return;
  }

  const del = db.prepare("DELETE FROM songs WHERE id = ?");
  const tx = db.transaction(() => {
    for (const r of dupes) del.run(r.id);
  });
  tx();
  console.log(`✓ Removed ${dupes.length} duplicate song rows (and their lyrics + graph refs via FK cascade).`);
  closeDb();
}

main();
