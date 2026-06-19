// One-off migration: clean up graph_nodes that reference deleted
// songs. The dedupe script deleted old slug-form song rows; their
// song nodes (and their graph neighbors) need to be removed too.

import { closeDb, getDb, initDb } from "../lib/db";

function main() {
  initDb();
  const db = getDb();

  // Find song node IDs whose embedded song-id no longer exists in songs.
  const orphanSongNodes = db.prepare(`
    SELECT gn.id FROM graph_nodes gn
    WHERE gn.node_type = 'song'
      AND SUBSTR(gn.id, 20) NOT IN (SELECT id FROM songs)
  `).all() as { id: string }[];

  if (orphanSongNodes.length === 0) {
    console.log("✓ No orphan song nodes.");
    closeDb();
    return;
  }

  // Also find their incident edges + evidence so the graph is internally consistent.
  const orphanEdges = db.prepare(`
    SELECT id FROM graph_edges
    WHERE src_id IN (${orphanSongNodes.map(() => "?").join(",")})
       OR dst_id IN (${orphanSongNodes.map(() => "?").join(",")})
  `).all(...[...orphanSongNodes.map((n) => n.id), ...orphanSongNodes.map((n) => n.id)]) as { id: string }[];

  const orphanEvidence = db.prepare(`
    SELECT id FROM evidence
    WHERE edge_id IN (${orphanEdges.map(() => "?").join(",") || "''"})
  `).all(...orphanEdges.map((e) => e.id)) as { id: string }[];

  const tx = db.transaction(() => {
    if (orphanEvidence.length) {
      db.prepare(`DELETE FROM evidence WHERE id IN (${orphanEvidence.map(() => "?").join(",")})`)
        .run(...orphanEvidence.map((e) => e.id));
    }
    if (orphanEdges.length) {
      db.prepare(`DELETE FROM graph_edges WHERE id IN (${orphanEdges.map(() => "?").join(",")})`)
        .run(...orphanEdges.map((e) => e.id));
    }
    db.prepare(`DELETE FROM graph_nodes WHERE id IN (${orphanSongNodes.map(() => "?").join(",")})`)
      .run(...orphanSongNodes.map((n) => n.id));
  });
  tx();
  console.log(
    `✓ Cleaned ${orphanSongNodes.length} orphan song nodes, ` +
    `${orphanEdges.length} incident edges, ` +
    `${orphanEvidence.length} evidence rows.`
  );
  closeDb();
}

main();
