import { getDb } from "@/lib/db";

interface SourceBreakdown {
  source: string;
  count: number;
  pct_of_total: number;
}

interface CoverageRow {
  area: string;
  total: number;
  with: number;
  pct: number;
  description: string;
}

interface YearBreakdown {
  year: number;
  songs: number;
  songs_with_lyrics: number;
  events_overlapping: number;
  top_signal: string;
}

export interface DataHealth {
  ok: boolean;
  timestamp: string;
  corpus_summary: {
    songs: number;
    songs_with_lyrics: number;
    events: number;
    entities: number;
    artists_with_jambase: number;
    artists_with_musicbrainz: number;
    artists_with_wikidata: number;
  };
  source_breakdown: {
    graph_edges: SourceBreakdown[];
    theme_scores: SourceBreakdown[];
    mood_scores: SourceBreakdown[];
    entity_mentions: SourceBreakdown[];
    evidence: SourceBreakdown[];
  };
  coverage: CoverageRow[];
  year_breakdown: YearBreakdown[];
  integrity_issues: {
    check: string;
    severity: "info" | "warn" | "error";
    count: number;
    description: string;
  }[];
  intent_vs_actual: {
    description: string;
    current: number;
    target: number;
  }[];
  confidence_histogram: { bucket: string; count: number }[];
  evidence_per_edge_histogram: { bucket: string; count: number }[];
}

function pct(num: number, denom: number): number {
  return denom > 0 ? (num / denom) * 100 : 0;
}

function sourceBreakdown(db: ReturnType<typeof getDb>, table: string, sourceCol: string): SourceBreakdown[] {
  const rows = db
    .prepare(
      `SELECT ${sourceCol} AS source, COUNT(*) AS c
       FROM ${table}
       WHERE ${sourceCol} IS NOT NULL AND ${sourceCol} != ''
       GROUP BY ${sourceCol} ORDER BY c DESC`
    )
    .all() as { source: string; c: number }[];

  const total = rows.reduce((acc, row) => acc + row.c, 0);
  return rows.map((row) => ({
    source: row.source,
    count: row.c,
    pct_of_total: pct(row.c, total),
  }));
}

export async function getDataHealth(): Promise<DataHealth> {
  const db = getDb();
  const row = (sql: string) =>
    (db.prepare(sql).get() as { c: number } | undefined)?.c ?? 0;

  // === Corpus summary ===
  const songs = row("SELECT COUNT(*) AS c FROM songs");
  const songsWithLyrics = row("SELECT COUNT(DISTINCT song_id) AS c FROM lyric_lines");
  const events = row("SELECT COUNT(*) AS c FROM events");
  const entities = row("SELECT COUNT(*) AS c FROM entities");
  const artistsJambase = row(
    "SELECT COUNT(*) AS c FROM entities WHERE jambase_id IS NOT NULL AND jambase_id != ''"
  );
  const artistsMusicbrainz = row(
    "SELECT COUNT(*) AS c FROM entities WHERE musicbrainz_id IS NOT NULL AND musicbrainz_id != ''"
  );
  const artistsWikidata = row(
    "SELECT COUNT(*) AS c FROM entities WHERE wikidata_id IS NOT NULL AND wikidata_id != ''"
  );

  // === Signal pipeline stats ===
  const signalProfiles = row("SELECT COUNT(*) AS c FROM year_signal_profiles");
  const clusters = row("SELECT COUNT(*) AS c FROM signal_clusters");
  const contexts = row("SELECT COUNT(*) AS c FROM candidate_contexts");
  const postureRows = row("SELECT COUNT(*) AS c FROM cultural_posture");
  const correlations = row("SELECT COUNT(*) AS c FROM context_signal_correlations");

  // === Coverage ===
  const coverage: CoverageRow[] = [
    {
      area: "Songs with lyrics",
      total: songs,
      with: songsWithLyrics,
      pct: 0,
      description:
        "Songs that have at least one lyric line. The 19 missing are upstream-restricted by Musixmatch.",
    },
    {
      area: "Songs with theme scores",
      total: songs,
      with: row("SELECT COUNT(DISTINCT song_id) AS c FROM theme_scores"),
      pct: 0,
      description: "Songs with at least one theme score (lexicon + GLiNER hybrid).",
    },
    {
      area: "Songs with mood scores",
      total: songs,
      with: row("SELECT COUNT(DISTINCT song_id) AS c FROM mood_scores"),
      pct: 0,
      description: "Songs with at least one mood score (lexicon + Cyanite-ready).",
    },
    {
      area: "Songs with entity mentions",
      total: songs,
      with: row("SELECT COUNT(DISTINCT song_id) AS c FROM entity_mentions"),
      pct: 0,
      description: "Songs with at least one named entity (people, places, brands).",
    },
    {
      area: "Songs with embeddings",
      total: songs,
      with: row("SELECT COUNT(*) AS c FROM embeddings WHERE target_type = 'song'"),
      pct: 0,
      description: "Songs with a sentence-transformer embedding (used for similar_to edges).",
    },
    {
      area: "Songs with event connections",
      total: songs,
      with: row(
        "SELECT COUNT(DISTINCT src_id) AS c FROM graph_edges WHERE edge_type = 'associated_with_event' AND src_id LIKE 'versesignal:n:song:%'"
      ),
      pct: 0,
      description: "Songs that have at least one associated_with_event edge to a curated event.",
    },
    {
      area: "Edges with evidence",
      total: row("SELECT COUNT(*) AS c FROM graph_edges"),
      with: row("SELECT COUNT(DISTINCT edge_id) AS c FROM evidence"),
      pct: 0,
      description: "Every graph edge should have at least 1 evidence row (per 1st principles).",
    },
  ];
  for (const entry of coverage) {
    entry.pct = pct(entry.with, entry.total);
  }

  // === Year breakdown ===
  const yearRows = db
    .prepare("SELECT year, COUNT(*) AS c FROM songs GROUP BY year ORDER BY year")
    .all() as { year: number; c: number }[];

  const yearBreakdown: YearBreakdown[] = yearRows.map((yr) => {
    const yearSongsWithLyrics = row(
      `SELECT COUNT(DISTINCT song_id) AS c FROM lyric_lines ll
       JOIN songs s ON s.id = ll.song_id WHERE s.year = ${yr.year}`
    );
    const eventsOverlapping = row(
      `SELECT COUNT(DISTINCT e.id) AS c FROM events e
       WHERE substr(e.start_date, 1, 4) <= '${yr.year}'
         AND (e.end_date IS NULL OR substr(e.end_date, 1, 4) >= '${yr.year}')`
    );
    const topSignalRow = db
      .prepare(
        `SELECT signal_type || ':' || signal AS s, score AS sc
         FROM year_signal_profiles
         WHERE year = ? AND region = 'US'
         ORDER BY sc DESC LIMIT 1`
      )
      .get(yr.year) as { s: string; sc: number } | undefined;

    return {
      year: yr.year,
      songs: yr.c,
      songs_with_lyrics: yearSongsWithLyrics,
      events_overlapping: eventsOverlapping,
      top_signal: topSignalRow?.s ?? "—",
    };
  });

  // === Integrity issues ===
  const integrityIssues: DataHealth["integrity_issues"] = [];
  const nakedEdges = row(
    "SELECT COUNT(*) AS c FROM graph_edges ge LEFT JOIN evidence ev ON ev.edge_id = ge.id WHERE ev.id IS NULL"
  );
  if (nakedEdges > 0) {
    integrityIssues.push({
      check: "Naked edges (no evidence)",
      severity: "error",
      count: nakedEdges,
      description: "Every graph edge should have at least 1 evidence row. These violate the trust layer invariant.",
    });
  }

  const nonCanonicalNodes = row(
    "SELECT COUNT(*) AS c FROM graph_nodes WHERE id NOT LIKE 'versesignal:n:%'"
  );
  if (nonCanonicalNodes > 0) {
    integrityIssues.push({
      check: "Non-canonical node IDs",
      severity: "warn",
      count: nonCanonicalNodes,
      description: "Graph nodes that don't match the versesignal:n:<type>:<id> canonical format.",
    });
  }

  const orphanSongs = row(
    `SELECT COUNT(*) AS c FROM songs s
     LEFT JOIN graph_nodes gn ON gn.id = 'versesignal:n:song:' || s.id
     WHERE gn.id IS NULL`
  );
  if (orphanSongs > 0) {
    integrityIssues.push({
      check: "Songs without graph nodes",
      severity: "warn",
      count: orphanSongs,
      description: "Songs that don't have a corresponding graph_nodes row.",
    });
  }

  const orphanEvents = row(
    `SELECT COUNT(*) AS c FROM events e
     LEFT JOIN graph_nodes gn ON gn.id = 'versesignal:n:event:' || e.id
     WHERE gn.id IS NULL`
  );
  if (orphanEvents > 0) {
    integrityIssues.push({
      check: "Events without graph nodes",
      severity: "warn",
      count: orphanEvents,
      description: "Events that don't have a corresponding graph_nodes row.",
    });
  }

  const orphanEvidence = row(
    "SELECT COUNT(*) AS c FROM evidence ev LEFT JOIN graph_edges ge ON ge.id = ev.edge_id WHERE ge.id IS NULL"
  );
  if (orphanEvidence > 0) {
    integrityIssues.push({
      check: "Orphan evidence rows",
      severity: "error",
      count: orphanEvidence,
      description: "Evidence rows that point to a non-existent edge.",
    });
  }

  // Low-confidence edges: confidence below 0.3 — they may be
  // productively noisy (e.g. a co-credit on a duet) but should
  // be visible in the operator surface.
  const lowConfEdges = row(
    "SELECT COUNT(*) AS c FROM graph_edges WHERE confidence < 0.3"
  );
  if (lowConfEdges > 0) {
    integrityIssues.push({
      check: "Low-confidence edges (<0.3)",
      severity: "info",
      count: lowConfEdges,
      description: "Edges with confidence below 0.3. These are not errors but they may be worth inspecting.",
    });
  }

  // Suspicious artist splits: detect songs where the artist field
  // was over-aggressively split. A genuine 7-collaborator cast like
  // Encanto is fine. We flag when the average artist token is
  // very short (likely a split-by-word error, not a real roster).
  const suspectRows = db
    .prepare(
      `SELECT id, artist FROM songs
       WHERE LENGTH(artist) - LENGTH(REPLACE(artist, ',', '')) >= 4`
    )
    .all() as { id: string; artist: string }[];
  let suspiciousSplits = 0;
  for (const r of suspectRows) {
    const tokens = r.artist.split(",").map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) continue;
    const avgLen = tokens.reduce((acc, t) => acc + t.length, 0) / tokens.length;
    // A genuine cast has tokens like "Carolina Gaitán" (16 chars);
    // a bad split produces tokens like "a" or "the" (≤3 chars).
    if (avgLen < 6) suspiciousSplits++;
  }
  if (suspiciousSplits > 0) {
    integrityIssues.push({
      check: "Suspicious artist splits",
      severity: "warn",
      count: suspiciousSplits,
      description: "Songs with ≥4 commas and average artist token <6 chars — likely over-split. Inspect for false positives.",
    });
  }

  if (integrityIssues.length === 0) {
    integrityIssues.push({
      check: "All integrity checks pass",
      severity: "info",
      count: 0,
      description: "No naked edges, no orphan evidence, all nodes canonical.",
    });
  }

  // === Confidence histogram ===
  // 5 buckets: [0, 0.2), [0.2, 0.4), ..., [0.8, 1.0].
  // We bucket via CASE WHEN so it's a single SQL pass.
  const confBuckets = db
    .prepare(
      `SELECT
         CASE
           WHEN confidence < 0.2 THEN '0.0-0.2'
           WHEN confidence < 0.4 THEN '0.2-0.4'
           WHEN confidence < 0.6 THEN '0.4-0.6'
           WHEN confidence < 0.8 THEN '0.6-0.8'
           ELSE '0.8-1.0'
         END AS bucket,
         COUNT(*) AS c
       FROM graph_edges
       GROUP BY bucket
       ORDER BY bucket`
    )
    .all() as { bucket: string; c: number }[];
  // Ensure all buckets are present (with 0 if missing) for a stable
  // histogram shape on the page.
  const confBucketOrder = ["0.0-0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", "0.8-1.0"];
  const confMap = new Map(confBuckets.map((b) => [b.bucket, b.c]));
  const confidence_histogram = confBucketOrder.map((b) => ({
    bucket: b,
    count: confMap.get(b) ?? 0,
  }));

  // === Evidence-per-edge histogram ===
  // How many edges have 0, 1, 2, 3, 4, 5+ evidence rows.
  const evBuckets = db
    .prepare(
      `SELECT
         CASE
           WHEN ev_count = 0 THEN '0'
           WHEN ev_count = 1 THEN '1'
           WHEN ev_count = 2 THEN '2'
           WHEN ev_count = 3 THEN '3'
           WHEN ev_count = 4 THEN '4'
           ELSE '5+'
         END AS bucket,
         COUNT(*) AS c
       FROM (
         SELECT ge.id, COUNT(ev.id) AS ev_count
         FROM graph_edges ge LEFT JOIN evidence ev ON ev.edge_id = ge.id
         GROUP BY ge.id
       )
       GROUP BY bucket
       ORDER BY bucket`
    )
    .all() as { bucket: string; c: number }[];
  const evBucketOrder = ["0", "1", "2", "3", "4", "5+"];
  const evMap = new Map(evBuckets.map((b) => [b.bucket, b.c]));
  const evidence_per_edge_histogram = evBucketOrder.map((b) => ({
    bucket: b,
    count: evMap.get(b) ?? 0,
  }));

  // === Signal pipeline stats ===
  const pipelineStats: DataHealth["intent_vs_actual"] = [
    {
      description: "Year signal profiles (P1.1)",
      current: signalProfiles,
      target: 500,
    },
    {
      description: "Signal clusters (P1.2)",
      current: clusters,
      target: 10,
    },
    {
      description: "Candidate contexts (P1.3)",
      current: contexts,
      target: 10,
    },
    {
      description: "Cultural posture classifications (P1.4)",
      current: postureRows,
      // Per Decision 0030 the linker requires SPECIFIC event
      // keywords in song lyrics, so the honest baseline is a
      // small number of song-event pairs (7 for the current
      // 411-song corpus). A lower target reflects the tightened
      // linker — we'd rather under-promise and over-deliver than
      // ship a 1948/700 = 278% claim backed by 99.7% orphan
      // rows. Future passes that add more event keywords can
      // raise the target again.
      target: 5,
    },
    {
      description: "Context-signal correlations (P2.2)",
      current: correlations,
      target: 1000,
    },
  ];

  const intentVsActual: DataHealth["intent_vs_actual"] = [
    {
      description: "Songs in spine (target: 300, top 50/yr × 6 years)",
      current: songs,
      target: 300,
    },
    {
      description: "Songs with lyrics (target: 280+)",
      current: songsWithLyrics,
      target: 280,
    },
    {
      description: "Curated world events (target: 15, all with regions_json)",
      current: events,
      target: 15,
    },
    {
      description: "Artist entities (target: 200+ across 300 songs)",
      current: entities,
      target: 200,
    },
    {
      description: "Songs with theme scores (target: 280+)",
      current: row("SELECT COUNT(DISTINCT song_id) AS c FROM theme_scores"),
      target: 280,
    },
    {
      description: "Songs with mood scores (target: 250+)",
      current: row("SELECT COUNT(DISTINCT song_id) AS c FROM mood_scores"),
      target: 250,
    },
    {
      description: "Songs with entity mentions (target: 250+)",
      current: row("SELECT COUNT(DISTINCT song_id) AS c FROM entity_mentions"),
      target: 250,
    },
    {
      description: "Artist cross-linked to JamBase (target: 80+)",
      current: artistsJambase,
      target: 80,
    },
    {
      description: "Artist cross-linked to MusicBrainz (target: 15+)",
      current: artistsMusicbrainz,
      target: 15,
    },
    {
      description: "Artist cross-linked to Wikidata (target: 35+)",
      current: artistsWikidata,
      target: 35,
    },
  ];

  return {
    ok: integrityIssues.every((i) => i.severity !== "error"),
    timestamp: new Date().toISOString(),
    corpus_summary: {
      songs,
      songs_with_lyrics: songsWithLyrics,
      events,
      entities,
      artists_with_jambase: artistsJambase,
      artists_with_musicbrainz: artistsMusicbrainz,
      artists_with_wikidata: artistsWikidata,
    },
    source_breakdown: {
      graph_edges: sourceBreakdown(db, "graph_edges", "source_api"),
      theme_scores: sourceBreakdown(db, "theme_scores", "source"),
      mood_scores: sourceBreakdown(db, "mood_scores", "source"),
      entity_mentions: sourceBreakdown(db, "entity_mentions", "source"),
      evidence: sourceBreakdown(db, "evidence", "source"),
    },
    coverage,
    year_breakdown: yearBreakdown,
    integrity_issues: integrityIssues,
    intent_vs_actual: [...intentVsActual, ...pipelineStats],
    confidence_histogram,
    evidence_per_edge_histogram,
  };
}
