// One-off migration: clean up the bad gazetteer entity mentions
// where the surface form is <= 2 characters. The old gazetteer
// matcher in enrich.py did substring matching without word
// boundaries, producing false positives like "ar" → AR-15 rifle
// matched in "around". The fix in enrich.py uses \b regex; this
// migration removes the bad historical data.
//
// What gets removed:
// - entity_mentions rows where source='gazetteer' AND
//   LENGTH(surface_form) <= 2
// - graph_edges that are associated_with_entity (mentions_entity)
//   pointing to a node whose only entity_mention is a short
//   gazetteer hit
// - evidence rows attached to those edges
// - graph_nodes that have no remaining edges

import { closeDb, getDb, initDb } from "../lib/db";

function main() {
  initDb();
  const db = getDb();

  // Find edges whose only entity_mention is a short gazetteer hit
  const shortEntityMentions = db.prepare(`
    SELECT id, song_id, lyric_line_id, surface_form, entity_id
    FROM entity_mentions
    WHERE source = 'gazetteer' AND LENGTH(surface_form) <= 2
  `).all() as Array<{ id: string; song_id: string; entity_id: string }>;

  console.log(`Found ${shortEntityMentions.length} short gazetteer entity_mentions to clean`);

  // Group by edge_id derived from the entity
  const edgeIdsToDelete = new Set<string>();
  for (const em of shortEntityMentions) {
    // The edge_id format from enrich.py: versesignal:e:<song_id>:mentions:<entity_id>:gazetteer
    const edgeId = `versesignal:e:${em.song_id}:mentions:${em.entity_id}:gazetteer`;
    edgeIdsToDelete.add(edgeId);
  }
  console.log(`Identified ${edgeIdsToDelete.size} associated graph edges`);

  // Get the related evidence IDs
  const evidenceIds = db.prepare(`
    SELECT id FROM evidence WHERE edge_id IN (${[...edgeIdsToDelete].map(() => "?").join(",") || "''"})
  `).all(...[...edgeIdsToDelete]) as Array<{ id: string }>;
  console.log(`Identified ${evidenceIds.length} evidence rows`);

  // Get related graph_nodes that would be orphan
  const entityNodeIds = db.prepare(`
    SELECT DISTINCT ge.dst_id FROM graph_edges ge
    WHERE ge.edge_type = 'mentions_entity' AND ge.dst_id IN (
      SELECT DISTINCT em.entity_id FROM entity_mentions em
      WHERE em.source = 'gazetteer' AND LENGTH(em.surface_form) <= 2
    )
  `).all() as Array<{ dst_id: string }>;

  // Delete in transaction
  const tx = db.transaction(() => {
    if (evidenceIds.length) {
      db.prepare(`DELETE FROM evidence WHERE id IN (${evidenceIds.map(() => "?").join(",")})`)
        .run(...evidenceIds.map((e) => e.id));
    }
    if (edgeIdsToDelete.size) {
      db.prepare(`DELETE FROM graph_edges WHERE id IN (${[...edgeIdsToDelete].map(() => "?").join(",")})`)
        .run(...[...edgeIdsToDelete]);
    }
    // Delete the entity_mentions rows
    db.prepare(`DELETE FROM entity_mentions WHERE source = 'gazetteer' AND LENGTH(surface_form) <= 2`).run();
    // Delete orphan entity nodes (no remaining edges)
    if (entityNodeIds.length) {
      db.prepare(`DELETE FROM graph_nodes WHERE id IN (${entityNodeIds.map(() => "?").join(",")}) AND node_type = 'entity' AND id NOT IN (SELECT DISTINCT dst_id FROM graph_edges)`)
        .run(...entityNodeIds.map((e) => e.dst_id));
    }
  });
  tx();

  console.log("✓ Cleaned:");
  console.log(`  - ${shortEntityMentions.length} entity_mentions`);
  console.log(`  - ${edgeIdsToDelete.size} graph_edges`);
  console.log(`  - ${evidenceIds.length} evidence rows`);

  closeDb();
}

main();
