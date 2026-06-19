// Snapshot the lyrics + entities + graph + theme/mood scores to JSON files.
// Purpose: even if the Musixmatch / Genius / Spotify / Wikidata APIs become
// unavailable, the project can still render the data we already have.
//
// Run: npx tsx scripts/snapshot-data.ts
// Output: data/snapshots/{lyrics,entities,graph,signals}-{ISO_DATE}.json

import { closeDb, getDb, initDb } from "../lib/db";
import { all, get } from "../lib/db/sql";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function snapshot() {
  initDb();
  const db = getDb();
  const date = isoDate();
  const outDir = join(process.cwd(), "data", "snapshots");
  mkdirSync(outDir, { recursive: true });

  // 1. Lyrics: 144 songs, ~7800 lines
  const lyricsRows = db.prepare(`
    SELECT s.id AS song_id, s.title, s.artist, s.year, s.chart_rank,
           ll.line_index, ll.text, ll.section, ll.has_named_entity
      FROM songs s
      JOIN lyric_lines ll ON ll.song_id = s.id
     ORDER BY s.year, s.chart_rank, ll.line_index
  `).all() as Array<{
    song_id: string; title: string; artist: string; year: number; chart_rank: number;
    line_index: number; text: string; section: string | null; has_named_entity: number | null;
  }>;
  // Group lines by song
  const bySong = new Map<string, {
    songId: string; title: string; artist: string; year: number; chartRank: number;
    plainLyrics: string; sections: string[]; lines: { index: number; text: string; section: string | null }[];
  }>();
  for (const r of lyricsRows) {
    if (!bySong.has(r.song_id)) {
      bySong.set(r.song_id, {
        songId: r.song_id, title: r.title, artist: r.artist, year: r.year, chartRank: r.chart_rank,
        plainLyrics: "", sections: [], lines: [],
      });
    }
    const song = bySong.get(r.song_id)!;
    song.lines.push({ index: r.line_index, text: r.text, section: r.section });
  }
  for (const song of bySong.values()) {
    song.lines.sort((a, b) => a.index - b.index);
    song.plainLyrics = song.lines.map((l) => l.text).join("\n");
    song.sections = [...new Set(song.lines.map((l) => l.section).filter((s): s is string => !!s))];
  }
  const lyricsSnapshot = {
    snapshotDate: date,
    snapshotType: "lyrics",
    source: "lyric_lines (DB)",
    songCount: bySong.size,
    totalLines: lyricsRows.length,
    songs: Array.from(bySong.values()),
  };
  writeFileSync(join(outDir, `lyrics-${date}.json`), JSON.stringify(lyricsSnapshot, null, 2));
  console.log(`✓ lyrics: ${bySong.size} songs, ${lyricsRows.length} lines → lyrics-${date}.json`);

  // 2. Songs (chart data)
  const songRows = db.prepare(`SELECT * FROM songs ORDER BY year, chart_rank`).all();
  writeFileSync(join(outDir, `songs-${date}.json`), JSON.stringify({
    snapshotDate: date,
    snapshotType: "songs",
    source: "songs (DB)",
    count: songRows.length,
    songs: songRows,
  }, null, 2));
  console.log(`✓ songs: ${songRows.length} → songs-${date}.json`);

  // 3. Year signal profiles
  const signalRows = db.prepare(`SELECT * FROM year_signal_profiles ORDER BY year, signal_type, score DESC`).all();
  writeFileSync(join(outDir, `year-signal-profiles-${date}.json`), JSON.stringify({
    snapshotDate: date,
    snapshotType: "year_signal_profiles",
    source: "year_signal_profiles (DB)",
    count: signalRows.length,
    rows: signalRows,
  }, null, 2));
  console.log(`✓ year_signal_profiles: ${signalRows.length} → year-signal-profiles-${date}.json`);

  // 4. Events + context correlations + cultural posture
  const events = db.prepare(`SELECT * FROM events ORDER BY start_date`).all();
  const correlations = db.prepare(`SELECT * FROM context_signal_correlations ORDER BY event_id, ABS(delta) DESC`).all();
  const posture = db.prepare(`SELECT * FROM cultural_posture`).all();
  writeFileSync(join(outDir, `events-${date}.json`), JSON.stringify({
    snapshotDate: date,
    snapshotType: "events_and_correlations",
    source: "events + context_signal_correlations + cultural_posture (DB)",
    eventCount: events.length,
    correlationCount: correlations.length,
    postureCount: posture.length,
    events, correlations, cultural_posture: posture,
  }, null, 2));
  console.log(`✓ events+correlations+posture: ${events.length}/${correlations.length}/${posture.length} → events-${date}.json`);

  // 5. Graph nodes + edges + evidence
  const nodes = db.prepare(`SELECT * FROM graph_nodes ORDER BY node_type, label`).all();
  const edges = db.prepare(`SELECT * FROM graph_edges ORDER BY edge_type, weight DESC`).all();
  const evidence = db.prepare(`SELECT * FROM evidence`).all();
  writeFileSync(join(outDir, `graph-${date}.json`), JSON.stringify({
    snapshotDate: date,
    snapshotType: "graph",
    source: "graph_nodes + graph_edges + evidence (DB)",
    nodeCount: nodes.length,
    edgeCount: edges.length,
    evidenceCount: evidence.length,
    nodes, edges, evidence,
  }, null, 2));
  console.log(`✓ graph: ${nodes.length} nodes, ${edges.length} edges, ${evidence.length} evidence → graph-${date}.json`);

  // 6. Entities + entity mentions
  const entities = db.prepare(`SELECT * FROM entities ORDER BY entity_type, canonical_name`).all();
  const entityMentions = db.prepare(`SELECT * FROM entity_mentions`).all();
  writeFileSync(join(outDir, `entities-${date}.json`), JSON.stringify({
    snapshotDate: date,
    snapshotType: "entities",
    source: "entities + entity_mentions (DB)",
    entityCount: entities.length,
    mentionCount: entityMentions.length,
    entities, entity_mentions: entityMentions,
  }, null, 2));
  console.log(`✓ entities: ${entities.length} entities, ${entityMentions.length} mentions → entities-${date}.json`);

  // 7. Data health summary
  const health = {
    totalSongs: (db.prepare(`SELECT COUNT(*) as cnt FROM songs`).get() as { cnt: number }).cnt,
    songsWithLyrics: (db.prepare(`SELECT COUNT(DISTINCT song_id) as cnt FROM lyric_lines`).get() as { cnt: number }).cnt,
    songsWithThemes: (db.prepare(`SELECT COUNT(DISTINCT song_id) as cnt FROM theme_scores`).get() as { cnt: number }).cnt,
    songsWithMoods: (db.prepare(`SELECT COUNT(DISTINCT song_id) as cnt FROM mood_scores`).get() as { cnt: number }).cnt,
    songsWithEntities: (db.prepare(`SELECT COUNT(DISTINCT song_id) as cnt FROM entity_mentions`).get() as { cnt: number }).cnt,
    years: (db.prepare(`SELECT COUNT(DISTINCT year) as cnt FROM songs WHERE year IS NOT NULL`).get() as { cnt: number }).cnt,
    events: (db.prepare(`SELECT COUNT(*) as cnt FROM events`).get() as { cnt: number }).cnt,
    entities: (db.prepare(`SELECT COUNT(*) as cnt FROM entities`).get() as { cnt: number }).cnt,
    graphNodes: (db.prepare(`SELECT COUNT(*) as cnt FROM graph_nodes`).get() as { cnt: number }).cnt,
    graphEdges: (db.prepare(`SELECT COUNT(*) as cnt FROM graph_edges`).get() as { cnt: number }).cnt,
    evidenceRows: (db.prepare(`SELECT COUNT(*) as cnt FROM evidence`).get() as { cnt: number }).cnt,
    lyricLines: (db.prepare(`SELECT COUNT(*) as cnt FROM lyric_lines`).get() as { cnt: number }).cnt,
  };
  writeFileSync(join(outDir, `data-health-${date}.json`), JSON.stringify({
    snapshotDate: date,
    snapshotType: "data_health",
    source: "DB counts",
    ...health,
  }, null, 2));
  console.log(`✓ data health → data-health-${date}.json`);
  console.log(`\n  ${health.totalSongs} songs total, ${health.songsWithLyrics} with lyrics (${((health.songsWithLyrics / health.totalSongs) * 100).toFixed(0)}%)`);

  closeDb();
}

snapshot();
