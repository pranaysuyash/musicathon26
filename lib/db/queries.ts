// Typed query helpers. The graph query APIs here are the brain of the UI:
// - getYearProfile(year)
// - getEventLens(eventId, beforeDays, afterDays)
// - getSongGraph(songId, depth)
// - getConnectionPath(fromId, toId, maxHops)
// - getEvidenceForEdge(edgeId)

import { getDb } from "./index";
import { all, get } from "./sql";
import type { Song, WorldEvent, GraphNode, GraphEdge, Evidence } from "../types";

interface SongRow {
  id: string;
  title: string;
  artist: string;
  year: number;
  chart_source: string;
  chart_rank: number;
  region: string;
  spotify_id: string | null;
  musicbrainz_id: string | null;
  musixmatch_track_id: number | null;
  duration_ms: number | null;
  release_date: string | null;
  ingested_at: string;
  metadata_json: string | null;
}

interface EventRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  regions_json: string;
  category: string;
  keywords_json: string | null;
  description: string | null;
  related_themes_json: string | null;
  severity: number;
}

interface GraphNodeRow {
  id: string;
  node_type: string;
  label: string;
  properties_json: string | null;
}

interface GraphEdgeRow {
  id: string;
  src_id: string;
  dst_id: string;
  edge_type: string;
  weight: number;
  confidence: number;
  evidence_ids_json: string | null;
  source_api: string;
  model_version: string | null;
  explanation: string | null;
  created_at: string;
}

interface EvidenceRow {
  id: string;
  edge_id: string;
  evidence_type: string;
  value: string;
  source: string;
  confidence: number;
  created_at: string;
}

function rowToSong(r: SongRow): Song {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    year: r.year,
    chartSource: r.chart_source as Song["chartSource"],
    chartRank: r.chart_rank,
    region: r.region as Song["region"],
    spotifyId: r.spotify_id ?? undefined,
    musicbrainzId: r.musicbrainz_id ?? undefined,
    musixmatchTrackId: r.musixmatch_track_id ?? undefined,
    durationMs: r.duration_ms ?? undefined,
    releaseDate: r.release_date ?? undefined,
    ingestedAt: r.ingested_at,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
  };
}

function rowToEvent(r: EventRow): WorldEvent {
  return {
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date ?? undefined,
    regions: JSON.parse(r.regions_json),
    category: r.category as WorldEvent["category"],
    keywords: r.keywords_json ? JSON.parse(r.keywords_json) : [],
    description: r.description ?? "",
    relatedThemes: r.related_themes_json ? JSON.parse(r.related_themes_json) : [],
    severity: r.severity,
  };
}

function rowToNode(r: GraphNodeRow): GraphNode {
  return {
    id: r.id,
    nodeType: r.node_type as GraphNode["nodeType"],
    label: r.label,
    properties: r.properties_json ? JSON.parse(r.properties_json) : undefined,
  };
}

function rowToEdge(r: GraphEdgeRow): GraphEdge {
  return {
    id: r.id,
    srcId: r.src_id,
    dstId: r.dst_id,
    edgeType: r.edge_type as GraphEdge["edgeType"],
    weight: r.weight,
    confidence: r.confidence,
    evidenceIds: r.evidence_ids_json ? JSON.parse(r.evidence_ids_json) : [],
    sourceApi: r.source_api as GraphEdge["sourceApi"],
    modelVersion: r.model_version ?? undefined,
    explanation: r.explanation ?? undefined,
    createdAt: r.created_at,
  };
}

function rowToEvidence(r: EvidenceRow): Evidence {
  return {
    id: r.id,
    edgeId: r.edge_id,
    evidenceType: r.evidence_type as Evidence["evidenceType"],
    value: r.value,
    source: r.source as Evidence["source"],
    confidence: r.confidence,
    createdAt: r.created_at,
  };
}

export function getSongsByYear(year: number, region: string = "US"): Song[] {
  const rows = all<SongRow>(
    `SELECT * FROM songs WHERE year = ? AND region = ? ORDER BY chart_rank ASC`,
    year,
    region
  );
  return rows.map(rowToSong);
}

export function getSongById(id: string): Song | null {
  const r = get<SongRow>(`SELECT * FROM songs WHERE id = ?`, id);
  return r ? rowToSong(r) : null;
}

export function getAllEvents(): WorldEvent[] {
  return all<EventRow>(`SELECT * FROM events ORDER BY start_date ASC`).map(rowToEvent);
}

export function getEventById(id: string): WorldEvent | null {
  const r = get<EventRow>(`SELECT * FROM events WHERE id = ?`, id);
  return r ? rowToEvent(r) : null;
}

export function getGraphNode(id: string): GraphNode | null {
  const r = get<GraphNodeRow>(`SELECT * FROM graph_nodes WHERE id = ?`, id);
  return r ? rowToNode(r) : null;
}

export function getNodeNeighborhood(nodeId: string, hops: number = 2, limit: number = 250): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const edgeRows = all<GraphEdgeRow>(
    `
    WITH RECURSIVE walk(src, dst, depth) AS (
      SELECT src_id, dst_id, 1 FROM graph_edges
        WHERE src_id = ? OR dst_id = ?
      UNION
      SELECT e.src_id, e.dst_id, w.depth + 1
        FROM graph_edges e
        JOIN walk w ON (e.src_id = w.dst OR e.dst_id = w.src)
        WHERE w.depth < ?
    )
    SELECT DISTINCT ge.* FROM graph_edges ge
      WHERE (ge.src_id, ge.dst_id) IN (
        SELECT src, dst FROM walk
      )
      LIMIT ?
    `,
    nodeId,
    nodeId,
    hops,
    limit
  );

  const edges = edgeRows.map(rowToEdge);
  const nodeIds = new Set<string>();
  for (const e of edges) {
    nodeIds.add(e.srcId);
    nodeIds.add(e.dstId);
  }
  if (nodeIds.size === 0) return { nodes: [], edges: [] };

  const placeholders = Array.from(nodeIds).map(() => "?").join(",");
  const nodeRows = all<GraphNodeRow>(
    `SELECT * FROM graph_nodes WHERE id IN (${placeholders})`,
    ...Array.from(nodeIds)
  );
  return { nodes: nodeRows.map(rowToNode), edges };
}

export function getEvidenceForEdge(edgeId: string): Evidence[] {
  return all<EvidenceRow>(
    `SELECT * FROM evidence WHERE edge_id = ? ORDER BY confidence DESC`,
    edgeId
  ).map(rowToEvidence);
}

export function getYearThemes(year: number, region: string = "US", topN: number = 5): {
  theme: string;
  avgScore: number;
  evidenceSongIds: string[];
}[] {
  interface Row { theme: string; avg_score: number; song_ids: string | null }
  return all<Row>(
    `
    SELECT ts.theme, AVG(ts.score) AS avg_score,
           GROUP_CONCAT(DISTINCT ts.song_id) AS song_ids
      FROM theme_scores ts
      JOIN songs s ON s.id = ts.song_id
     WHERE s.year = ? AND s.region = ?
     GROUP BY ts.theme
     ORDER BY avg_score DESC
     LIMIT ?
    `,
    year,
    region,
    topN
  ).map((r) => ({
    theme: r.theme,
    avgScore: r.avg_score,
    evidenceSongIds: r.song_ids ? r.song_ids.split(",") : [],
  }));
}

export function getYearMoods(year: number, region: string = "US", topN: number = 5): {
  mood: string;
  avgScore: number;
}[] {
  interface Row { mood: string; avg_score: number }
  return all<Row>(
    `
    SELECT ms.mood, AVG(ms.score) AS avg_score
      FROM mood_scores ms
      JOIN songs s ON s.id = ms.song_id
     WHERE s.year = ? AND s.region = ?
     GROUP BY ms.mood
     ORDER BY avg_score DESC
     LIMIT ?
    `,
    year,
    region,
    topN
  ).map((r) => ({ mood: r.mood, avgScore: r.avg_score }));
}

export function getSongsForEvent(
  eventId: string,
  minStrength: number = 0.4
): {
  songId: string;
  title: string;
  artist: string;
  year: number;
  chartRank: number;
  edge: GraphEdge;
  evidence: Evidence[];
}[] {
  // graph_nodes use the canonical "versesignal:n:event:<event_id>" form.
  const graphEventId = `versesignal:n:event:${eventId}`;
  const edgeRows = all<GraphEdgeRow>(
    `
    SELECT ge.* FROM graph_edges ge
      WHERE ge.dst_id = ?
        AND ge.edge_type = 'associated_with_event'
        AND ge.weight >= ?
      ORDER BY ge.weight DESC
    `,
    graphEventId,
    minStrength
  );

  return edgeRows.map((row) => {
    // graph_nodes use the canonical "versesignal:n:song:<song_id>" form,
    // but the songs table stores the bare id like "versesignal:2019:19:...".
    const rawSongId = row.src_id.startsWith("versesignal:n:song:")
      ? row.src_id.slice("versesignal:n:song:".length)
      : row.src_id;
    const songRow = get<SongRow & { chart_rank: number }>(
      `SELECT id, title, artist, year, chart_rank FROM songs WHERE id = ?`,
      rawSongId
    );
    const evidenceIds: string[] = row.evidence_ids_json ? JSON.parse(row.evidence_ids_json) : [];
    let evidence: Evidence[] = [];
    if (evidenceIds.length) {
      const placeholders = evidenceIds.map(() => "?").join(",");
      evidence = all<EvidenceRow>(
        `SELECT * FROM evidence WHERE id IN (${placeholders})`,
        ...evidenceIds
      ).map(rowToEvidence);
    }
    return {
      songId: songRow?.id ?? rawSongId,
      title: songRow?.title ?? "?",
      artist: songRow?.artist ?? "?",
      year: songRow?.year ?? 0,
      chartRank: songRow?.chart_rank ?? 0,
      edge: rowToEdge(row),
      evidence,
    };
  });
}

export function getSongsMentioningEntity(entityId: string, limit: number = 50): {
  songId: string;
  title: string;
  artist: string;
  year: number;
  surfaceForm: string;
  confidence: number;
  source: string;
}[] {
  interface Row {
    song_id: string;
    title: string;
    artist: string;
    year: number;
    surface_form: string | null;
    confidence: number;
    source: string;
  }
  return all<Row>(
    `
    SELECT em.song_id, s.title, s.artist, s.year, em.surface_form, em.confidence, em.source
      FROM entity_mentions em
      JOIN songs s ON s.id = em.song_id
     WHERE em.entity_id = ?
     ORDER BY em.confidence DESC, s.chart_rank ASC
     LIMIT ?
    `,
    entityId,
    limit
  ).map((r) => ({
    songId: r.song_id,
    title: r.title,
    artist: r.artist,
    year: r.year,
    surfaceForm: r.surface_form ?? "",
    confidence: r.confidence,
    source: r.source,
  }));
}
