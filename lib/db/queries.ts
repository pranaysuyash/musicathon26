// Typed query helpers. The graph query APIs here are the brain of the UI:
// - getYearProfile(year)
// - getEventLens(eventId, beforeDays, afterDays)
// - getSongGraph(songId, depth)
// - getConnectionPath(fromId, toId, maxHops)
// - getEvidenceForEdge(edgeId)

import { getDb } from "./index";
import { all, get } from "./sql";
import type { Song, WorldEvent, GraphNode, GraphEdge, Evidence } from "../types";
import { slug as slugify } from "../graph/ids";

/** Human-readable labels for region codes. */
export const REGION_LABELS: Record<string, string> = {
  US: "United States",
  GLOBAL: "Global",
  IN: "India",
  UK: "United Kingdom",
  JP: "Japan",
  KR: "South Korea",
  DE: "Germany",
  BR: "Brazil",
  NG: "Nigeria",
  MX: "Mexico",
  UA: "Ukraine",
  RU: "Russia",
};

/** Build a WHERE clause + params for filtering events by region.
 *  When region is provided, matches events whose regions_json contains
 *  the region code OR "GLOBAL". */
function regionFilterClause(region: string | undefined): { clause: string; params: string[] } {
  if (!region) return { clause: "", params: [] };
  return {
    clause: `AND EXISTS (SELECT 1 FROM json_each(e.regions_json) WHERE value IN (?, 'GLOBAL'))`,
    params: [region],
  };
}

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

export interface ChartEra {
  id: string;
  label: string;
  dateRange: string;
  sourceMode: string;
  caveat: string;
  comparability: "high" | "medium" | "low";
}

interface EntityMetaRow {
  id: string;
  canonical_name: string;
  entity_type: string;
  wikidata_id: string | null;
  musicbrainz_id: string | null;
  musicbrainz_artist_type: string | null;
  jambase_id: string | null;
  jambase_genres_json: string | null;
  aliases_json: string | null;
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

interface EventArticleRow {
  id: string;
  event_id: string;
  source: string;
  source_url: string;
  title: string;
  published_at: string | null;
  summary: string | null;
}

export interface EventArticle {
  id: string;
  eventId: string;
  source: string;
  sourceUrl: string;
  title: string;
  publishedAt: string | null;
  summary: string | null;
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
  inference_type: string | null;
  matched_terms_json: string | null;
}

function parseJsonField<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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

const CHART_ERAS: Array<{
  start: number;
  end: number;
  id: ChartEra["id"];
  label: ChartEra["label"];
  sourceMode: ChartEra["sourceMode"];
  caveat: string;
  comparability: ChartEra["comparability"];
}> = [
  {
    start: 1960,
    end: 1979,
    id: "broadcast_counterculture",
    label: "Broadcast / counterculture era",
    sourceMode: "Billboard Hot 100 year-end (historical)",
    caveat: "US broadcast-era charting; less global comparability.",
    comparability: "medium",
  },
  {
    start: 1980,
    end: 1999,
    id: "mtv_radio_era",
    label: "MTV / radio / superstar era",
    sourceMode: "Billboard Hot 100 + metadata context",
    caveat: "US commercial pop visibility with TV/image dynamics.",
    comparability: "medium",
  },
  {
    start: 2000,
    end: 2011,
    id: "digital_transition_era",
    label: "Digital transition era",
    sourceMode: "Billboard Hot 100 + digital influence",
    caveat: "Downloading/early-platform mechanics changed chart semantics.",
    comparability: "medium",
  },
  {
    start: 2012,
    end: 2019,
    id: "streaming_transition_era",
    label: "Streaming transition era",
    sourceMode: "Billboard Hot 100 + streaming effects",
    caveat: "Algorithmic amplification is increasing but still mixed with traditional ranking.",
    comparability: "high",
  },
  {
    start: 2020,
    end: 2023,
    id: "global_streaming_era",
    label: "Global streaming era",
    sourceMode: "Billboard Global 200 + Songstats-contextual",
    caveat: "Global chart comparability is strongest here.",
    comparability: "high",
  },
];

export function getChartEraForYear(year: number): ChartEra {
  const era = CHART_ERAS.find((item) => year >= item.start && year <= item.end);
  if (era) {
    return {
      id: era.id,
      label: era.label,
      dateRange: `${era.start}s–${era.end}`,
      sourceMode: era.sourceMode,
      caveat: era.caveat,
      comparability: era.comparability,
    };
  }
  return {
    id: "custom_era",
    label: "Custom era",
    dateRange: `${year}`,
    sourceMode: "Manual/experimental ingestion",
    caveat: "No standardized chart-era contract is assigned yet.",
    comparability: "low",
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
    inferenceType: r.inference_type ? (r.inference_type as GraphEdge["inferenceType"]) : undefined,
    matchedTerms: parseJsonField<string[]>(r.matched_terms_json, []),
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

export function getSongsByYear(year: number, region: string = "US", limit?: number): Song[] {
  const rows = limit
    ? all<SongRow>(
      `SELECT * FROM songs WHERE year = ? AND region = ? ORDER BY chart_rank ASC LIMIT ?`,
      year,
      region,
      limit
    )
    : all<SongRow>(`SELECT * FROM songs WHERE year = ? AND region = ? ORDER BY chart_rank ASC`, year, region);
  return rows.map(rowToSong);
}

export function getAllSongs(): Song[] {
  const rows = all<SongRow>(
    `SELECT * FROM songs ORDER BY year ASC, chart_rank ASC`
  );
  return rows.map(rowToSong);
}

export function getSongsByIds(ids: string[]): Song[] {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(",");
  const rows = all<SongRow>(
    `SELECT * FROM songs WHERE id IN (${placeholders})`,
    ...unique
  );
  const byId = new Map(rows.map((r) => [r.id, rowToSong(r)]));
  return unique.map((id) => byId.get(id)).filter((s): s is Song => Boolean(s));
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

export function getEventArticles(eventId: string): EventArticle[] {
  const rows = all<EventArticleRow>(
    `SELECT id, event_id, source, source_url, title, published_at, summary
       FROM event_articles
      WHERE event_id = ?
      ORDER BY COALESCE(published_at, '') DESC, title ASC`,
    eventId
  );
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    source: r.source,
    sourceUrl: r.source_url,
    title: r.title,
    publishedAt: r.published_at,
    summary: r.summary,
  }));
}

export function getGraphNode(id: string): GraphNode | null {
  const r = get<GraphNodeRow>(`SELECT * FROM graph_nodes WHERE id = ?`, id);
  return r ? rowToNode(r) : null;
}

export function searchGraphNodes(
  q: string,
  opts: { limit?: number; nodeType?: GraphNode["nodeType"] } = {}
): GraphNode[] {
  const normalized = q.trim().toLowerCase();
  if (!normalized) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 30));
  const like = `%${normalized}%`;
  const nodeType = opts.nodeType;
  const rows = nodeType
    ? all<GraphNodeRow>(
        `
        SELECT id, node_type, label, properties_json FROM graph_nodes
        WHERE (LOWER(label) LIKE ? OR LOWER(id) LIKE ?) AND node_type = ?
        ORDER BY
          CASE
            WHEN LOWER(label) = ? THEN 0
            WHEN LOWER(label) LIKE ? THEN 1
            ELSE 2
          END,
          LENGTH(label) ASC
        LIMIT ?`,
        like,
        like,
        nodeType,
        normalized,
        `${normalized}%`,
        limit
      )
    : all<GraphNodeRow>(
        `
        SELECT id, node_type, label, properties_json FROM graph_nodes
        WHERE LOWER(label) LIKE ? OR LOWER(id) LIKE ?
        ORDER BY
          CASE
            WHEN LOWER(label) = ? THEN 0
            WHEN LOWER(label) LIKE ? THEN 1
            ELSE 2
          END,
          LENGTH(label) ASC
        LIMIT ?`,
        like,
        like,
        normalized,
        `${normalized}%`,
        limit
      );
  return rows.map(rowToNode);
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

export function getEvidenceForEdges(edgeIds: string[]): Record<string, Evidence[]> {
  if (edgeIds.length === 0) return {};
  const unique = Array.from(new Set(edgeIds.filter(Boolean)));
  const placeholders = unique.map(() => "?").join(",");
  const rows = all<EvidenceRow>(
    `SELECT * FROM evidence WHERE edge_id IN (${placeholders}) ORDER BY edge_id, confidence DESC`,
    ...unique
  );
  const out: Record<string, Evidence[]> = {};
  for (const row of rows.map(rowToEvidence)) {
    if (!out[row.edgeId]) out[row.edgeId] = [];
    out[row.edgeId].push(row);
  }
  return out;
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

/** Get songs scored for a theme, sorted by score descending. */
export function getSongsByTheme(theme: string, limit: number = 50): Array<{
  songId: string;
  title: string;
  artist: string;
  year: number;
  chartRank: number;
  score: number;
}> {
  interface Row {
    song_id: string;
    title: string;
    artist: string;
    year: number;
    chart_rank: number;
    score: number;
  }
  const rows = all<Row>(
    `SELECT ts.song_id, s.title, s.artist, s.year, s.chart_rank, ts.score
     FROM theme_scores ts
     JOIN songs s ON s.id = ts.song_id
     WHERE ts.theme = ?
     ORDER BY ts.score DESC
     LIMIT ?`,
    theme,
    limit
  );
  return rows.map((r) => ({
    songId: r.song_id,
    title: r.title,
    artist: r.artist,
    year: r.year,
    chartRank: r.chart_rank,
    score: r.score,
  }));
}

/** Get year-by-year distribution of a theme: song count + avg score. */
export function getThemeYearDistribution(theme: string): Array<{
  year: number;
  songCount: number;
  avgScore: number;
}> {
  interface Row { year: number; song_count: number; avg_score: number }
  return all<Row>(
    `SELECT s.year, COUNT(*) AS song_count, AVG(ts.score) AS avg_score
     FROM theme_scores ts
     JOIN songs s ON s.id = ts.song_id
     WHERE ts.theme = ?
     GROUP BY s.year
     ORDER BY s.year`,
    theme
  ).map((r) => ({
    year: r.year,
    songCount: r.song_count,
    avgScore: r.avg_score,
  }));
}

/** Get events whose related themes or keywords overlap with a given theme. */
export function getEventsByRelatedTheme(theme: string): Array<{
  id: string;
  name: string;
  startDate: string;
  category: string;
}> {
  interface Row { id: string; name: string; start_date: string; category: string }
  return all<Row>(
    `SELECT id, name, start_date, category
     FROM events
     WHERE (related_themes_json IS NOT NULL AND related_themes_json LIKE ?)
        OR (keywords_json IS NOT NULL AND keywords_json LIKE ?)
     ORDER BY start_date ASC`,
    `%"${theme}"%`,
    `%"${theme}"%`
  ).map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    category: r.category,
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

export interface SimilarSong {
  song_id: string;
  title: string;
  artist: string;
  year: number;
  weight: number;
}

export interface ArtistMeta {
  canonical_name: string;
  jambase_id: string | null;
  jambase_genres: string[];
  musicbrainz_id: string | null;
  wikidata_id: string | null;
}

export function getArtistMeta(artistName: string): ArtistMeta | null {
  // Look up artist metadata from the entities table.
  // Try exact match first, then lowercased.
  const exact = get<{
    canonical_name: string;
    jambase_id: string | null;
    jambase_genres_json: string;
    musicbrainz_id: string;
    wikidata_id: string;
  }>(
    `SELECT canonical_name, jambase_id, jambase_genres_json, musicbrainz_id, wikidata_id
       FROM entities
      WHERE entity_type = 'artist'
        AND LOWER(canonical_name) = LOWER(?)
      LIMIT 1`,
    artistName
  );
  if (!exact) return null;
  return {
    canonical_name: exact.canonical_name,
    jambase_id: exact.jambase_id,
    jambase_genres: parseJsonField<string[]>(exact.jambase_genres_json, []),
    musicbrainz_id: exact.musicbrainz_id || null,
    wikidata_id: exact.wikidata_id || null,
  };
}

function normalizeEntityRef(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

export interface EntityProfile {
  id: string;
  canonicalName: string;
  entityType: string;
  wikidataId: string | null;
  musicbrainzId: string | null;
  musicbrainzArtistType: string | null;
  jambaseId: string | null;
  jambaseGenres: string[];
  aliases: string[];
  metadata: Record<string, unknown>;
}

function getEntityByRef(entityRef: string, entityType?: string): EntityMetaRow | null {
  const direct = get<EntityMetaRow>(
    `SELECT * FROM entities
      WHERE id = ?
      ${entityType ? "AND entity_type = ?" : ""}
      LIMIT 1`,
    ...(entityType ? [entityRef, entityType] : [entityRef])
  );
  if (direct) return direct;

  const canonical = get<EntityMetaRow>(
    `SELECT * FROM entities
      WHERE LOWER(canonical_name) = LOWER(?)
        ${entityType ? "AND entity_type = ?" : ""}
      LIMIT 1`,
    ...(entityType ? [entityRef, entityType] : [entityRef])
  );
  if (canonical) return canonical;

  const aliasMatch = get<EntityMetaRow>(
    `SELECT * FROM entities
      WHERE EXISTS (
        SELECT 1 FROM json_each(aliases_json)
        WHERE LOWER(json_each.value) = LOWER(?)
      )
      ${entityType ? "AND entity_type = ?" : ""}
      LIMIT 1`,
    ...(entityType ? [entityRef, entityType] : [entityRef])
  );
  if (aliasMatch) return aliasMatch;

  const candidates = all<EntityMetaRow>(
    `SELECT * FROM entities ${entityType ? "WHERE entity_type = ?" : ""}`,
    ...(entityType ? [entityType] : [])
  );
  const target = slugify(entityRef);
  const fallback = candidates.find((row) => {
    if (slugify(row.canonical_name) === target) return true;
    const aliases = parseJsonField<string[]>(row.aliases_json, []);
    return aliases.some((alias) => slugify(alias) === target);
  });
  return fallback ?? null;
}

function mapEntityRow(row: EntityMetaRow): EntityProfile {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    entityType: row.entity_type,
    wikidataId: row.wikidata_id,
    musicbrainzId: row.musicbrainz_id,
    musicbrainzArtistType: row.musicbrainz_artist_type,
    jambaseId: row.jambase_id,
    jambaseGenres: parseJsonField<string[]>(row.jambase_genres_json, []),
    aliases: parseJsonField<string[]>(row.aliases_json, []),
    metadata: parseJsonField<Record<string, unknown>>(row.metadata_json, {}),
  };
}

export function getEntityProfile(entityRef: string): EntityProfile | null {
  const row = getEntityByRef(normalizeEntityRef(entityRef));
  if (!row) return null;
  return mapEntityRow(row);
}

export interface ArtistProfile extends EntityProfile {
  role: string;
}

export function getArtistProfile(artistRef: string): ArtistProfile | null {
  const row = getEntityByRef(normalizeEntityRef(artistRef), "artist");
  if (!row) return null;
  return {
    ...mapEntityRow(row),
    role: "artist",
  };
}

export function getSimilarSongs(songId: string, limit: number = 8): SimilarSong[] {
  // Get top similar_to neighbors. We query both src and dst to
  // catch the undirected relationship. The schema stores both
  // directions in build-similar-edges.py, so a single query
  // on src returns one direction; we OR with dst to get both.
  const direct = all<SimilarSong>(
    `
    SELECT
        other.id AS song_id,
        other.title,
        other.artist,
        other.year,
        ge.weight
      FROM graph_edges ge
      JOIN songs other ON other.id = SUBSTR(ge.dst_id, 20)
     WHERE ge.src_id = ?
       AND ge.edge_type = 'similar_to'
     ORDER BY ge.weight DESC
     LIMIT ?
    `,
    `versesignal:n:song:${songId}`,
    limit
  );
  // If we got fewer than `limit` results, the song is the SOURCE
  // for some pairs and we should also look at the BACK direction.
  if (direct.length >= limit) return direct;
  const back = all<SimilarSong>(
    `
    SELECT
        other.id AS song_id,
        other.title,
        other.artist,
        other.year,
        ge.weight
      FROM graph_edges ge
      JOIN songs other ON other.id = SUBSTR(ge.src_id, 20)
     WHERE ge.dst_id = ?
       AND ge.edge_type = 'similar_to'
     ORDER BY ge.weight DESC
     LIMIT ?
    `,
    `versesignal:n:song:${songId}`,
    limit
  );
  // Merge, dedup, sort by weight desc
  const seen = new Set(direct.map((d: SimilarSong) => d.song_id));
  return [...direct, ...back.filter((b: SimilarSong) => !seen.has(b.song_id))].slice(0, limit);
}

export interface EntityThemeSignal {
  theme: string;
  songCount: number;
  avgScore: number;
}

export interface EntityEventLink {
  id: string;
  name: string;
  startDate: string;
  category: string;
  songCount: number;
}

export interface SongMention {
  songId: string;
  title: string;
  artist: string;
  year: number;
  surfaceForm: string;
  confidence: number;
  source: string;
}

export function getSongsMentioningEntity(entityId: string, limit: number = 50): SongMention[] {
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

export function getEntityThemeSignals(entityId: string, limit: number = 12): EntityThemeSignal[] {
  interface Row {
    theme: string;
    song_count: number;
    avg_score: number;
  }
  return all<Row>(
    `
    SELECT ts.theme, COUNT(*) AS song_count, AVG(ts.score) AS avg_score
      FROM theme_scores ts
      JOIN entity_mentions em ON em.song_id = ts.song_id
     WHERE em.entity_id = ?
     GROUP BY ts.theme
     ORDER BY avg_score DESC, song_count DESC
     LIMIT ?
    `,
    entityId,
    limit
  ).map((r) => ({
    theme: r.theme,
    songCount: r.song_count,
    avgScore: r.avg_score,
  }));
}

export function getEntityEventLinks(entityId: string, limit: number = 20): EntityEventLink[] {
  interface Row {
    id: string;
    name: string;
    start_date: string;
    category: string;
    song_count: number;
  }
  return all<Row>(
    `
    SELECT ev.id, ev.name, ev.start_date, ev.category, COUNT(DISTINCT em.song_id) AS song_count
      FROM entity_mentions em
      JOIN songs s ON em.song_id = s.id
      JOIN graph_edges ge
        ON ge.src_id = 'versesignal:n:song:' || s.id
       AND ge.edge_type = 'associated_with_event'
      JOIN events ev ON ev.id = SUBSTR(ge.dst_id, 21)
     WHERE em.entity_id = ?
     GROUP BY ev.id, ev.name, ev.start_date, ev.category
     ORDER BY song_count DESC
     LIMIT ?
    `,
    entityId,
    limit
  ).map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    category: r.category,
    songCount: r.song_count,
  }));
}

export interface ArtistSong {
  songId: string;
  title: string;
  artist: string;
  year: number;
  chartRank: number;
}

export interface ArtistThemeSignal {
  theme: string;
  songCount: number;
  avgScore: number;
}

export interface ArtistEventLink {
  id: string;
  name: string;
  startDate: string;
  category: string;
  songCount: number;
}

export function getArtistSongs(artistName: string, limit: number = 60): ArtistSong[] {
  interface Row {
    id: string;
    title: string;
    artist: string;
    year: number;
    chart_rank: number;
  }
  const normalized = artistName.trim().toLowerCase();
  const pattern = `%${normalized}%`;
  return all<Row>(
    `
    SELECT id, title, artist, year, chart_rank
      FROM songs
     WHERE LOWER(artist) = LOWER(?)
        OR LOWER(artist) LIKE ?
     ORDER BY year DESC, chart_rank ASC
     LIMIT ?
    `,
    artistName,
    pattern,
    limit
  ).map((r) => ({
    songId: r.id,
    title: r.title,
    artist: r.artist,
    year: r.year,
    chartRank: r.chart_rank,
  }));
}

export function getArtistThemeSignals(artistName: string, limit: number = 12): ArtistThemeSignal[] {
  interface Row {
    theme: string;
    song_count: number;
    avg_score: number;
  }
  const normalized = artistName.trim().toLowerCase();
  const pattern = `%${normalized}%`;
  return all<Row>(
    `
    SELECT ts.theme, COUNT(*) AS song_count, AVG(ts.score) AS avg_score
      FROM theme_scores ts
      JOIN songs s ON s.id = ts.song_id
     WHERE LOWER(s.artist) = LOWER(?)
        OR LOWER(s.artist) LIKE ?
     GROUP BY ts.theme
     ORDER BY avg_score DESC, song_count DESC
     LIMIT ?
    `,
    artistName,
    pattern,
    limit
  ).map((r) => ({
    theme: r.theme,
    songCount: r.song_count,
    avgScore: r.avg_score,
  }));
}

export function getArtistEventLinks(artistName: string, limit: number = 20): ArtistEventLink[] {
  interface Row {
    id: string;
    name: string;
    start_date: string;
    category: string;
    song_count: number;
  }
  const normalized = artistName.trim().toLowerCase();
  const pattern = `%${normalized}%`;
  return all<Row>(
    `
    SELECT ev.id, ev.name, ev.start_date, ev.category, COUNT(DISTINCT s.id) AS song_count
      FROM songs s
      JOIN graph_edges ge
        ON ge.src_id = 'versesignal:n:song:' || s.id
       AND ge.edge_type = 'associated_with_event'
      JOIN events ev ON ev.id = SUBSTR(ge.dst_id, 21)
     WHERE LOWER(s.artist) = LOWER(?)
        OR LOWER(s.artist) LIKE ?
     GROUP BY ev.id, ev.name, ev.start_date, ev.category
     ORDER BY song_count DESC
     LIMIT ?
    `,
    artistName,
    pattern,
    limit
  ).map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    category: r.category,
    songCount: r.song_count,
  }));
}
// === Year Signal Profiles (P1.1, lyrics-first signal engine) ===

export interface YearSignalProfile {
  id: string;
  year: number;
  region: string;
  signalType: "theme" | "mood" | "entity" | "phrase" | "place" | "brand";
  signal: string;
  score: number;
  songCount: number;
  deltaVsPrevYear: number | null;
  deltaVsBaseline: number | null;
  evidenceSongIds: string[];
  sourceApi: "theme_scores" | "mood_scores" | "entity_mentions" | "hybrid";
  computedAt: string;
}

/** Get the top N signals for a year + region, grouped by type. */
export function getYearSignals(
  year: number,
  region: string = "US",
  limitPerType: number = 20
): YearSignalProfile[] {
  interface Row {
    id: string;
    year: number;
    region: string;
    signal_type: string;
    signal: string;
    score: number;
    song_count: number;
    delta_vs_prev_year: number | null;
    delta_vs_baseline: number | null;
    evidence_song_ids_json: string;
    source_api: string;
    computed_at: string;
  }
  const rows = all<Row>(
    `
    SELECT * FROM year_signal_profiles
    WHERE year = ? AND region = ?
    ORDER BY score DESC
    LIMIT ?
    `,
    year,
    region,
    limitPerType * 3  // fetch enough to cover each type
  );
  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    region: r.region,
    signalType: r.signal_type as YearSignalProfile["signalType"],
    signal: r.signal,
    score: r.score,
    songCount: r.song_count,
    deltaVsPrevYear: r.delta_vs_prev_year,
    deltaVsBaseline: r.delta_vs_baseline,
    evidenceSongIds: r.evidence_song_ids_json ? JSON.parse(r.evidence_song_ids_json) : [],
    sourceApi: r.source_api as YearSignalProfile["sourceApi"],
    computedAt: r.computed_at,
  }));
}
// === Cultural Lens (P1.5) ===

/** Get the top N signals for a year across all signal types. */
export function getYearSignalTop(
  year: number,
  region: string = "US",
  limit: number = 5
): ReturnType<typeof getYearSignals> {
  // getYearSignals returns the top 3*limit signals sorted by score
  return getYearSignals(year, region, limit * 3).slice(0, limit);
}

/** Get all events whose date range overlaps with a given year.
 *  Optionally filter by region. */
export function getEventsForYear(year: number, region?: string): Array<{
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  category: string;
  regions: string[];
}> {
  interface Row {
    id: string;
    name: string;
    start_date: string;
    end_date: string | null;
    category: string;
    regions_json: string;
  }
  const rf = regionFilterClause(region);
  const rows = all<Row>(
    `
    SELECT id, name, start_date, end_date, category, regions_json
    FROM events e
    WHERE substr(start_date, 1, 4) <= ?
      AND (end_date IS NULL OR substr(end_date, 1, 4) >= ?)
      ${rf.clause}
    ORDER BY start_date ASC
    `,
    String(year),
    String(year),
    ...rf.params,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    category: r.category,
    regions: JSON.parse(r.regions_json),
  }));
}
// === Signal Clusters (P1.2) ===

export interface SignalCluster {
  id: string;
  year: number;
  region: string;
  label: string;
  signalCount: number;
  songCount: number;
  signals: { type: string; signal: string; weight: number }[];
  songIds: string[];
  confidence: number;
  computedAt: string;
}

/** Get the top N signal clusters for a year + region. */
export function getSignalClusters(
  year: number,
  region: string = "US",
  limit: number = 5
): SignalCluster[] {
  interface Row {
    id: string;
    year: number;
    region: string;
    label: string;
    signal_count: number;
    song_count: number;
    signals_json: string;
    song_ids_json: string | null;
    confidence: number;
    computed_at: string;
  }
  const rows = all<Row>(
    `
    SELECT * FROM signal_clusters
    WHERE year = ? AND region = ?
    ORDER BY song_count DESC
    LIMIT ?
    `,
    year,
    region,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    region: r.region,
    label: r.label,
    signalCount: r.signal_count,
    songCount: r.song_count,
    signals: r.signals_json ? JSON.parse(r.signals_json) : [],
    songIds: r.song_ids_json ? JSON.parse(r.song_ids_json) : [],
    confidence: r.confidence,
    computedAt: r.computed_at,
  }));
}

// === Candidate Contexts (P1.3) ===

export interface CandidateContext {
  id: string;
  clusterId: string;
  year: number;
  region: string;
  explanation: string;
  explanationShort: string | null;
  dominantPosture: string | null;
  postureDistribution: Record<string, number> | null;
  triggerEventIds: string[] | null;
  crossYearType: string | null;
  crossYearEvidence: string | null;
  comparativeSignals: Array<{
    type: string;
    signal: string;
    clusterWeight: number;
    yearBaseline: number | null;
    lift: number | null;
  }> | null;
  evidence: string;
  confidence: number;
  computedAt: string;
}

/** Get candidate contexts for a year + region (top N). */
export function getCandidateContexts(
  year: number,
  region: string = "US",
  limit: number = 5
): CandidateContext[] {
  interface Row {
    id: string;
    cluster_id: string;
    year: number;
    region: string;
    explanation: string;
    explanation_short: string | null;
    dominant_posture: string | null;
    posture_distribution_json: string | null;
    trigger_event_ids_json: string | null;
    cross_year_type: string | null;
    cross_year_evidence: string | null;
    comparative_signals_json: string | null;
    evidence: string;
    confidence: number;
    computed_at: string;
  }
  const rows = all<Row>(
    `
    SELECT * FROM candidate_contexts
    WHERE year = ? AND region = ?
    ORDER BY confidence DESC, id
    LIMIT ?
    `,
    year,
    region,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    clusterId: r.cluster_id,
    year: r.year,
    region: r.region,
    explanation: r.explanation,
    explanationShort: r.explanation_short,
    dominantPosture: r.dominant_posture,
    postureDistribution: r.posture_distribution_json ? JSON.parse(r.posture_distribution_json) : null,
    triggerEventIds: r.trigger_event_ids_json ? JSON.parse(r.trigger_event_ids_json) : null,
    crossYearType: r.cross_year_type,
    crossYearEvidence: r.cross_year_evidence,
    comparativeSignals: r.comparative_signals_json ? JSON.parse(r.comparative_signals_json) : null,
    evidence: r.evidence,
    confidence: r.confidence,
    computedAt: r.computed_at,
  }));
}

// === Contradiction Finder (songs that stood against the current) ===

export interface Contradiction {
  songId: string;
  songTitle: string;
  artist: string;
  eventId: string;
  eventName: string;
  eventCategory: string;
  posture: string;
  score: number;
  /** Why this is a contradiction (human-readable) */
  description: string;
}

const CONTRADICTION_MAP: Record<string, string[]> = {
  escape: ["reflection", "shadow", "contradiction"],
  reflection: ["escape", "coincidence"],
  processing: ["escape", "coincidence"],
  coincidence: ["reflection", "escape", "shadow", "contradiction"],
};

/** Find songs whose posture goes against the year's dominant cultural current. */
export function getContradictions(year: number, limit: number = 10, region?: string): Contradiction[] {
  const rf = regionFilterClause(region);
  // Step 1: determine dominant posture for the year
  interface PostureRow {
    posture: string;
    cnt: number;
  }
  const postures = all<PostureRow>(
    `
    SELECT cp.posture, COUNT(*) as cnt
    FROM cultural_posture cp
    JOIN events e ON e.id = cp.event_id
    WHERE substr(e.start_date, 1, 4) <= ?
      AND (e.end_date IS NULL OR substr(e.end_date, 1, 4) >= ?)
      ${rf.clause}
    GROUP BY cp.posture
    ORDER BY cnt DESC
    `,
    String(year), String(year),
    ...rf.params,
  );

  if (postures.length === 0) return [];

  const dominant = postures[0].posture;
  const counterPostures = CONTRADICTION_MAP[dominant];
  if (!counterPostures || counterPostures.length === 0) return [];

  // Step 2: find songs with counter postures
  interface Row {
    song_id: string;
    song_title: string;
    artist: string;
    event_id: string;
    event_name: string;
    event_category: string;
    posture: string;
    score: number;
  }

  const placeholders = counterPostures.map(() => "?").join(",");
  const rows = all<Row>(
    `
    SELECT cp.song_id, s.title AS song_title, s.artist,
           cp.event_id, e.name AS event_name, e.category AS event_category,
           cp.posture, cp.score
    FROM cultural_posture cp
    JOIN songs s ON cp.song_id = s.id
    JOIN events e ON e.id = cp.event_id
    WHERE substr(e.start_date, 1, 4) <= ?
      AND (e.end_date IS NULL OR substr(e.end_date, 1, 4) >= ?)
      ${rf.clause}
      AND cp.posture IN (${placeholders})
    ORDER BY cp.score DESC
    LIMIT ?
    `,
    String(year), String(year),
    ...rf.params,
    ...counterPostures,
    limit,
  );

  const descriptionTemplates: Record<string, string> = {
    escape: "While most songs reflected the cultural moment, this one offered an escape — a deliberate turn away from {event}.",
    reflection: "While most songs escaped the news cycle, this one engaged with {event} — refusing to look away from the cultural moment.",
    processing: "Unlike the chart consensus, this song didn't look away from {event}. It worked through the feelings instead of escaping them.",
    coincidence: "While other songs flowed with the cultural current of {event}, this one ran on its own independent momentum.",
    contradiction: "This song actively contradicts the spirit of {event} — instead of echoing the moment, it pushed against it.",
    shadow: "Rather than reflecting or escaping {event}, this song cast a shadow — a darker, more complex response to the cultural moment.",
  };

  return rows.map((r) => {
    const template = descriptionTemplates[r.posture] ?? `This song took a different path during {event}.`;
    return {
      songId: r.song_id,
      songTitle: r.song_title,
      artist: r.artist,
      eventId: r.event_id,
      eventName: r.event_name,
      eventCategory: r.event_category,
      posture: r.posture,
      score: r.score,
      description: template.replace("{event}", r.event_name),
    };
  });
}

// === Cultural Posture (P1.4) ===

export interface PostureSummary {
  posture: string;
  songCount: number;
  exampleSongIds: string[];
}

/** Summarize cultural posture counts for a year (across all events). */
export function getPostureSummary(year: number, region?: string): PostureSummary[] {
  const rf = regionFilterClause(region);
  interface Row {
    posture: string;
    song_count: number;
    song_ids: string;
  }
  // Aggregate across all events that overlap with the year.
  // Use cultural_posture joined with events (filter by year overlap).
  const rows = all<Row>(
    `
    SELECT cp.posture AS posture,
           COUNT(DISTINCT cp.song_id) AS song_count,
           GROUP_CONCAT(DISTINCT cp.song_id) AS song_ids
    FROM cultural_posture cp
    JOIN events e ON e.id = cp.event_id
    WHERE substr(e.start_date, 1, 4) <= ?
      AND (e.end_date IS NULL OR substr(e.end_date, 1, 4) >= ?)
      ${rf.clause}
    GROUP BY cp.posture
    ORDER BY song_count DESC
    `,
    String(year),
    String(year),
    ...rf.params,
  );
  return rows.map((r) => ({
    posture: r.posture,
    songCount: r.song_count,
    exampleSongIds: r.song_ids ? r.song_ids.split(",").slice(0, 5) : [],
  }));
}
// === Context Signal Correlations (P2.2) ===

export interface ContextSignalCorrelation {
  id: string;
  eventId: string;
  year: number;
  signalType: string;
  signal: string;
  baselineMean: number;
  eventPeriodScore: number;
  delta: number;
  confidence: number;
  evidenceSongIds: string[];
  computedAt: string;
}

/** Get the top correlations for an event, sorted by |delta|. */
export function getEventCorrelations(
  eventId: string,
  year?: number,
  limit: number = 20
): ContextSignalCorrelation[] {
  interface Row {
    id: string;
    event_id: string;
    year: number;
    signal_type: string;
    signal: string;
    baseline_mean: number;
    event_period_score: number;
    delta: number;
    confidence: number;
    evidence_song_ids_json: string;
    computed_at: string;
  }
  const whereYear = year !== undefined ? "AND year = ?" : "";
  const params: Array<string | number> = year !== undefined
    ? [eventId, year, limit]
    : [eventId, limit];
  const rows = all<Row>(
    `
    SELECT * FROM context_signal_correlations
    WHERE event_id = ? ${whereYear}
    ORDER BY ABS(delta) DESC
    LIMIT ?
    `,
    ...params
  );
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    year: r.year,
    signalType: r.signal_type,
    signal: r.signal,
    baselineMean: r.baseline_mean,
    eventPeriodScore: r.event_period_score,
    delta: r.delta,
    confidence: r.confidence,
    evidenceSongIds: r.evidence_song_ids_json ? JSON.parse(r.evidence_song_ids_json) : [],
    computedAt: r.computed_at,
  }));
}
// === Cultural Signal Brief (P2.1) ===

export interface BriefSection {
  heading: string;
  body: string;
  evidenceSongIds: string[];  // example songs cited
  evidenceSignalIds: string[]; // example signals cited
}

export interface CulturalSignalBrief {
  year: number;
  region: string;
  sections: BriefSection[];
  generatedAt: string;
  methodNote: string; // "auto-generated; not human-edited"
}

/** Get the cultural signal brief for a year + region.
 *
 * This is a template-first narrative generator. It produces
 * 4-6 evidence-backed sections explaining what the charts
 * were saying, what shifted during events, and how songs
 * related to the events. Optionally an LLM could be
 * plugged in here later; for v1 the data alone makes the
 * case compelling.
 *
 * Sections:
 *   1. The emotional weather (top moods with deltas)
 *   2. What the lyrics kept returning to (top themes)
 *   3. The names that kept appearing (top entities)
 *   4. What the world was going through (events)
 *   5. How songs related to those events (posture breakdown)
 *   6. The single biggest shift (peak correlation)
 */
export async function getCulturalSignalBrief(
  year: number,
  region: string = "US"
): Promise<CulturalSignalBrief> {
  // Pull the data
  const allSignals = getYearSignals(year, region, 200);

  // Categorize by signal_type
  const moods = allSignals.filter((s) => s.signalType === "mood");
  const themes = allSignals.filter((s) => s.signalType === "theme");
  const entities = allSignals.filter((s) => s.signalType === "entity");

  // Section 1: emotional weather
  const topMoods = moods
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const moodDeltas = topMoods
    .map((m) => {
      const d = m.deltaVsBaseline;
      const dStr = d == null ? "" : d >= 0 ? `+${(d * 100).toFixed(0)}%` : `${(d * 100).toFixed(0)}%`;
      return `${m.signal} ${dStr} (${m.songCount} songs)`;
    })
    .join(", ");
  const section1: BriefSection = {
    heading: "The chart's emotional weather",
    body: `Chart music in ${year} was led by ${topMoods[0]?.signal ?? "unknown"} (${topMoods[0]?.songCount ?? 0} chart songs), with ${topMoods[1]?.signal ?? "—"} and ${topMoods[2]?.signal ?? "—"} close behind. Compared to the prior 3-year baseline, the mood profile shifted: ${moodDeltas || "no deltas available"}.`,
    evidenceSongIds: topMoods.flatMap((m) => m.evidenceSongIds).slice(0, 5),
    evidenceSignalIds: topMoods.map((m) => `versesignal:ysp:${year}:US:mood:${m.signal.replace(/\s+/g, "-")}`),
  };

  // Section 2: themes
  const topThemes = themes
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const section2: BriefSection = {
    heading: "What the lyrics kept returning to",
    body:
      topThemes.length > 0
        ? `The themes most present in the year's chart were: ${topThemes.map((t) => `${t.signal.replace(/_/g, " ")} (${t.songCount} songs)`).join(", ")}.`
        : `Chart theme data is sparse for ${year}.`,
    evidenceSongIds: topThemes.flatMap((t) => t.evidenceSongIds).slice(0, 5),
    evidenceSignalIds: topThemes.map((t) => `versesignal:ysp:${year}:US:theme:${t.signal}`),
  };

  // Section 3: entities
  const topEntities = entities
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const section3: BriefSection = {
    heading: "The names that kept appearing",
    body:
      topEntities.length > 0
        ? `Mentioned across the chart: ${topEntities.map((e) => `${e.signal} (${e.songCount} songs)`).join(", ")}.`
        : "",
    evidenceSongIds: topEntities.flatMap((e) => e.evidenceSongIds).slice(0, 5),
    evidenceSignalIds: topEntities.map((e) => `versesignal:ysp:${year}:US:entity:${e.signal.replace(/\s+/g, "-")}`),
  };

  // Section 4: events
  const events = getEventsForYear(year);
  const section4: BriefSection = {
    heading: "What the world was going through",
    body:
      events.length > 0
        ? `${events.length} curated world event${events.length === 1 ? "" : "s"} overlap${events.length === 1 ? "s" : ""} ${year}: ${events.slice(0, 3).map((e) => e.name).join("; ")}${events.length > 3 ? `; and ${events.length - 3} more` : ""}.`
        : `No curated world events overlap ${year} in the current corpus.`,
    evidenceSongIds: [],
    evidenceSignalIds: [],
  };

  // Section 5: posture breakdown
  // Inline posture counts via a quick query (server-side only)
  const postureRows: Array<{ posture: string; n: number }> = [];
  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const rs = db
      .prepare(
        `SELECT cp.posture AS posture, COUNT(DISTINCT cp.song_id) AS n
         FROM cultural_posture cp
         JOIN events e ON e.id = cp.event_id
         WHERE substr(e.start_date, 1, 4) <= ?
           AND (e.end_date IS NULL OR substr(e.end_date, 1, 4) >= ?)
         GROUP BY cp.posture ORDER BY n DESC`
      )
      .all(String(year), String(year)) as Array<{ posture: string; n: number }>;
    for (const r of rs) postureRows.push(r);
  } catch {
    // Skip posture section if DB unavailable
  }
  const total = postureRows.reduce((s, r) => s + r.n, 0);
  const section5: BriefSection = {
    heading: "How chart music related to those events",
    body:
      postureRows.length > 0 && total > 0
        ? `Of ${total} (song, event) pair classifications in ${year}: ${postureRows
            .map((p) => `${p.posture} ${((p.n / total) * 100).toFixed(0)}%`)
            .join(", ")}. The dominant pattern is the headline of the year.`
        : "Posture data not available for this year.",
    evidenceSongIds: [],
    evidenceSignalIds: [],
  };

  // Section 6: peak shift
  // Query the top correlation across all events in the year
  const topCorrPerEvent: Array<{
    eventName: string;
    signalType: string;
    signal: string;
    delta: number;
  }> = [];
  for (const ev of events) {
    const cs = getEventCorrelations(ev.id, year, 1);
    if (cs.length > 0) {
      topCorrPerEvent.push({
        eventName: ev.name,
        signalType: cs[0].signalType,
        signal: cs[0].signal,
        delta: cs[0].delta,
      });
    }
  }
  topCorrPerEvent.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const peak = topCorrPerEvent[0];
  const section6: BriefSection | null = peak
    ? {
        heading: "The single biggest shift",
        body: `During ${peak.eventName}, the ${peak.signalType} "${peak.signal}" shifted ${peak.delta >= 0 ? "up" : "down"} ${Math.abs(peak.delta * 100).toFixed(0)}% vs the prior 3-year baseline. This is the largest single signal movement in the year.`,
        evidenceSongIds: [],
        evidenceSignalIds: [`versesignal:csc:${peak.eventName}:${year}:${peak.signalType}:${peak.signal.replace(/\s+/g, "-")}`],
      }
    : null;

  const sections: BriefSection[] = [section1, section2, section3, section4, section5];
  if (section6) sections.push(section6);

  return {
    year,
    region,
    sections,
    generatedAt: new Date().toISOString(),
    methodNote:
      "Auto-generated from year_signal_profiles + context_signal_correlations + cultural_posture. Not human-edited.",
  };
}

// === Event Signal Decay (P2.3) ===

export interface EventSignalDecayYear {
  year: number;
  yearsSinceEvent: number;
  postureCounts: Record<string, number>;
  totalSongs: number;
  dominantPosture: string;
}

/** For a given event, show how signals decayed over subsequent years. */
export function getEventSignalDecay(eventId: string): EventSignalDecayYear[] {
  interface Row {
    song_year: number;
    posture: string;
    cnt: number;
  }
  const rows = all<Row>(
    `
    SELECT s.year AS song_year, cp.posture, COUNT(*) as cnt
    FROM cultural_posture cp
    JOIN songs s ON cp.song_id = s.id
    WHERE cp.event_id = ?
    GROUP BY s.year, cp.posture
    ORDER BY s.year, cp.posture
    `,
    eventId,
  );

  // Group by year
  const byYear: Record<number, { postureCounts: Record<string, number>; total: number }> = {};
  for (const r of rows) {
    if (!byYear[r.song_year]) {
      byYear[r.song_year] = { postureCounts: {}, total: 0 };
    }
    byYear[r.song_year].postureCounts[r.posture] = (byYear[r.song_year].postureCounts[r.posture] ?? 0) + r.cnt;
    byYear[r.song_year].total += r.cnt;
  }

  const event = getEventById(eventId);
  const eventStartYear = event ? parseInt(event.startDate, 10) : 0;

  return Object.entries(byYear)
    .map(([yearStr, data]) => {
      const year = parseInt(yearStr, 10);
      const dominant = Object.entries(data.postureCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      return {
        year,
        yearsSinceEvent: year - eventStartYear,
        postureCounts: data.postureCounts,
        totalSongs: data.total,
        dominantPosture: dominant,
      };
    })
    .sort((a, b) => a.year - b.year);
}

// === Event Lead/Lag Analysis (P2.3) ===

export interface LeadSignal {
  signalType: string;
  signal: string;
  preEventScore: number;
  baselineScore: number;
  delta: number;
  correlatedDuringEvent: boolean;
  eventCorrelationDelta: number | null;
  directionallyConsistent: boolean; // same sign pre-event and during event = true lead
}

export interface EventLeadAnalysis {
  eventId: string;
  eventName: string;
  preEventYear: number;
  leadSignals: LeadSignal[];
  totalCorrelatedSignals: number;
  preElevatedSignals: number;
  leadSignalRate: number; // fraction 0-1
}

/** Compute which signals were already elevated in the year BEFORE an event.
 *
 * For an event starting in year Y, compares year_signal_profiles for Y-1
 * against the 3-year baseline. The lead signal rate measures how much music
 * "sensed" the event coming — signals already deviating from baseline before
 * the event was active.
 */
export function getEventLeadAnalysis(eventId: string, region: string = "US"): EventLeadAnalysis | null {
  const event = getEventById(eventId);
  if (!event) return null;
  const startYear = parseInt(event.startDate, 10);
  const preEventYear = startYear - 1;

  // Get signal profiles for the pre-event year
  interface ProfileRow {
    signal_type: string;
    signal: string;
    score: number;
    delta_vs_baseline: number | null;
  }
  const preEventSignals = all<ProfileRow>(
    `SELECT signal_type, signal, score, delta_vs_baseline
     FROM year_signal_profiles
     WHERE year = ? AND region = ?
     AND signal_type IN ('mood', 'theme', 'entity')
     ORDER BY delta_vs_baseline DESC`,
    preEventYear, region,
  );
  if (preEventSignals.length === 0) return null;

  // Get top correlated signals for this event
  const correlated = all<{ signal_type: string; signal: string; delta: number }>(
    `SELECT DISTINCT csc.signal_type, csc.signal, csc.delta
     FROM context_signal_correlations csc
     WHERE csc.event_id = ?
     ORDER BY ABS(csc.delta) DESC`,
    eventId,
  );
  const correlatedSet = new Set(correlated.map((c) => `${c.signal_type}:${c.signal}`));
  const correlatedMap = new Map(correlated.map((c) => [`${c.signal_type}:${c.signal}`, c.delta]));

  // Build lead signals list.
  // A signal counts as a "lead" only if it was elevated pre-event AND
  // moved in the same direction during the event (consistent sign).
  // This distinguishes anticipation (same direction) from independent drift.
  const leadSignals: LeadSignal[] = [];
  let preElevatedConsistentCount = 0;
  let totalCheckableCorrelated = 0;

  for (const ps of preEventSignals) {
    const key = `${ps.signal_type}:${ps.signal}`;
    const isDuring = correlatedSet.has(key);
    const corrDelta = correlatedMap.get(key) ?? null;
    const isElevated = ps.delta_vs_baseline !== null && ps.delta_vs_baseline > 0;

    // Only show signals that are relevant (elevated pre-event or correlated during)
    if (!isElevated && !isDuring) continue;

    // Direction consistency: same sign => anticipation, opposite => drift
    const consistent = isElevated && isDuring && corrDelta !== null
      ? (ps.delta_vs_baseline! > 0 && corrDelta > 0) || (ps.delta_vs_baseline! < 0 && corrDelta < 0)
      : false;

    if (consistent) preElevatedConsistentCount++;
    if (isDuring) totalCheckableCorrelated++;

    leadSignals.push({
      signalType: ps.signal_type,
      signal: ps.signal,
      preEventScore: ps.score,
      baselineScore: ps.score - (ps.delta_vs_baseline ?? 0),
      delta: ps.delta_vs_baseline ?? 0,
      correlatedDuringEvent: isDuring,
      eventCorrelationDelta: corrDelta,
      directionallyConsistent: consistent,
    });
  }

  leadSignals.sort((a, b) => {
    if (a.correlatedDuringEvent !== b.correlatedDuringEvent) return a.correlatedDuringEvent ? -1 : 1;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });

  const totalCorrelatedSignals = correlated.length;
  return {
    eventId,
    eventName: event.name,
    preEventYear,
    leadSignals: leadSignals.slice(0, 20),
    totalCorrelatedSignals,
    preElevatedSignals: preElevatedConsistentCount,
    leadSignalRate: totalCheckableCorrelated > 0 ? preElevatedConsistentCount / totalCheckableCorrelated : 0,
  };
}

/** Get all events that still have signal echoes in a given year (posture counts from songs of that year). */
export function getEchoingEvents(year: number, region?: string): { eventId: string; eventName: string; eventStartYear: number; songCount: number; dominantPosture: string }[] {
  const rf = regionFilterClause(region);
  interface Row {
    event_id: string;
    event_start: string;
    event_name: string;
    cnt: number;
    dominant: string;
  }
  const rows = all<Row>(
    `
    SELECT cp.event_id, e.start_date AS event_start, e.name AS event_name,
           COUNT(DISTINCT cp.song_id) AS cnt,
           (SELECT cp2.posture FROM cultural_posture cp2
            JOIN songs s2 ON cp2.song_id = s2.id
            WHERE cp2.event_id = cp.event_id AND s2.year = ?
            GROUP BY cp2.posture ORDER BY COUNT(*) DESC LIMIT 1) AS dominant
    FROM cultural_posture cp
    JOIN songs s ON cp.song_id = s.id
    JOIN events e ON cp.event_id = e.id
    WHERE s.year = ?
      ${rf.clause}
    GROUP BY cp.event_id
    ORDER BY cnt DESC
    `,
    year, year,
    ...rf.params,
  );
  return rows.map((r) => ({
    eventId: r.event_id,
    eventName: r.event_name,
    eventStartYear: parseInt(r.event_start, 10),
    songCount: r.cnt,
    dominantPosture: r.dominant ?? "unknown",
  }));
}

export function getAllYears(region: string = "US"): { year: number; songCount: number }[] {
  const rows = all<{ year: number; cnt: number }>(
    region === "GLOBAL"
      ? `SELECT s.year, COUNT(*) AS cnt FROM songs s WHERE s.year IS NOT NULL GROUP BY s.year ORDER BY s.year`
      : `SELECT s.year, COUNT(*) AS cnt FROM songs s WHERE s.year IS NOT NULL AND s.region = ? GROUP BY s.year ORDER BY s.year`,
    ...(region === "GLOBAL" ? [] : [region]),
  );
  return rows.map((r) => ({ year: r.year, songCount: r.cnt }));
}

export interface YearAvailability {
  year: number;
  songCount: number;
  hasLyrics: boolean;
  hasThemes: boolean;
  hasMoods: boolean;
  hasEvents: boolean;
  chartSource: string;
  chartEra: ChartEra;
}

export function getYearAvailability(year: number, region: string = "US"): YearAvailability | null {
  const row = get<{
    year: number;
    song_count: number;
    chart_sources_json: string;
    has_lyrics: number;
    has_themes: number;
    has_moods: number;
    has_events: number;
  }>(
    `
    WITH year_songs AS (
      SELECT DISTINCT s.id AS song_id, s.chart_source
      FROM songs s
      WHERE s.year = ? AND s.region = ?
    ),
    y AS (
      SELECT
        COUNT(*) AS song_count,
        GROUP_CONCAT(DISTINCT chart_source) AS chart_sources_json
      FROM year_songs
    ),
    flags AS (
      SELECT
        EXISTS (SELECT 1 FROM lyric_lines ll JOIN year_songs ys ON ll.song_id = ys.song_id) AS has_lyrics,
        EXISTS (SELECT 1 FROM theme_scores ts JOIN year_songs ys ON ts.song_id = ys.song_id) AS has_themes,
        EXISTS (SELECT 1 FROM mood_scores ms JOIN year_songs ys ON ms.song_id = ys.song_id) AS has_moods,
        EXISTS (SELECT 1 FROM cultural_posture cp JOIN year_songs ys ON cp.song_id = ys.song_id) AS has_events
    )
    SELECT
      ? AS year,
      y.song_count,
      y.chart_sources_json,
      f.has_lyrics AS has_lyrics,
      f.has_themes AS has_themes,
      f.has_moods AS has_moods,
      f.has_events AS has_events
    FROM y, flags f
    `,
    year,
    region,
    year,
  );

  if (!row || row.song_count === 0) return null;
  return {
    year: row.year,
    songCount: row.song_count,
    hasLyrics: Boolean(row.has_lyrics),
    hasThemes: Boolean(row.has_themes),
    hasMoods: Boolean(row.has_moods),
    hasEvents: Boolean(row.has_events),
    chartSource: row.chart_sources_json ? row.chart_sources_json.split(",")[0] : "manual",
    chartEra: getChartEraForYear(row.year),
  };
}

export interface DataHealth {
  totalSongs: number;
  songsWithThemes: number;
  songsWithMoods: number;
  songsWithEntities: number;
  years: number;
  events: number;
  entities: number;
  entityMentions: number;
  graphNodes: number;
  graphEdges: number;
  evidenceRows: number;
}

export function getDataHealth(): DataHealth {
  const totalSongs = get<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM songs")?.cnt ?? 0;
  const songsWithThemes = get<{ cnt: number }>("SELECT COUNT(DISTINCT song_id) AS cnt FROM theme_scores")?.cnt ?? 0;
  const songsWithMoods = get<{ cnt: number }>("SELECT COUNT(DISTINCT song_id) AS cnt FROM mood_scores")?.cnt ?? 0;
  const songsWithEntities = get<{ cnt: number }>("SELECT COUNT(DISTINCT song_id) AS cnt FROM entity_mentions")?.cnt ?? 0;
  const years = get<{ cnt: number }>("SELECT COUNT(DISTINCT year) AS cnt FROM songs WHERE year IS NOT NULL")?.cnt ?? 0;
  const events = get<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM events")?.cnt ?? 0;
  const entities = get<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM entities")?.cnt ?? 0;
  const entityMentions = get<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM entity_mentions")?.cnt ?? 0;
  const graphNodes = get<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM graph_nodes")?.cnt ?? 0;
  const graphEdges = get<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM graph_edges")?.cnt ?? 0;
  const evidenceRows = get<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM evidence")?.cnt ?? 0;
  return { totalSongs, songsWithThemes, songsWithMoods, songsWithEntities, years, events, entities, entityMentions, graphNodes, graphEdges, evidenceRows };
}

export interface AnalogousYear {
  year: number;
  similarity: number;
  overlapSignals: { signal: string; signalType: string; score: number }[];
}

export function getAnalogousYears(year: number, region: string = "US", limit: number = 3): AnalogousYear[] {
  interface Row {
    year: number;
    signal_type: string;
    signal: string;
    score: number;
  }
  const rows = all<Row>(
    `SELECT year, signal_type, signal, score FROM year_signal_profiles WHERE region = ? ORDER BY year, score DESC`,
    region,
  );

  const byYear = new Map<number, Map<string, number>>();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Map());
    byYear.get(r.year)!.set(`${r.signal_type}:${r.signal}`, r.score);
  }

  const target = byYear.get(year);
  if (!target || byYear.size < 2) return [];

  const results: { year: number; sim: number; overlap: { signal: string; signalType: string; score: number }[] }[] = [];

  for (const [otherYear, other] of byYear) {
    if (otherYear === year) continue;

    const allKeys = new Set([...target.keys(), ...other.keys()]);
    let dot = 0, magA = 0, magB = 0;
    const overlap: { key: string; scoreA: number; scoreB: number }[] = [];
    for (const k of allKeys) {
      const a = target.get(k) ?? 0;
      const b = other.get(k) ?? 0;
      dot += a * b;
      magA += a * a;
      magB += b * b;
      if (a > 0 && b > 0) {
        overlap.push({ key: k, scoreA: a, scoreB: b });
      }
    }
    const sim = Math.sqrt(magA) * Math.sqrt(magB) > 0
      ? dot / (Math.sqrt(magA) * Math.sqrt(magB))
      : 0;

    overlap.sort((a, b) => Math.max(b.scoreA, b.scoreB) - Math.max(a.scoreA, a.scoreB));
    results.push({
      year: otherYear,
      sim,
      overlap: overlap.slice(0, 5).map((o) => {
        const colon = o.key.indexOf(":");
        return { signal: o.key.slice(colon + 1), signalType: o.key.slice(0, colon), score: Math.max(o.scoreA, o.scoreB) };
      }),
    });
  }

  return results.sort((a, b) => b.sim - a.sim).slice(0, limit).map((r) => ({
    year: r.year,
    similarity: r.sim,
    overlapSignals: r.overlap,
  }));
}

export function getMoodYearDistribution(mood: string, region: string = "US"): { year: number; score: number; songCount: number }[] {
  const rows = all<{ year: number; score: number; song_count: number }>(
    `SELECT year, score, song_count FROM year_signal_profiles WHERE region = ? AND signal_type = 'mood' AND signal = ? ORDER BY year`,
    region, mood,
  );
  return rows.map((r) => ({ year: r.year, score: r.score, songCount: r.song_count }));
}

export function getSignalYearDistributions(signalType: string, region: string = "US"): Map<string, { year: number; score: number; songCount: number }[]> {
  interface Row {
    signal: string;
    year: number;
    score: number;
    song_count: number;
  }
  const rows = all<Row>(
    `SELECT signal, year, score, song_count FROM year_signal_profiles WHERE region = ? AND signal_type = ? ORDER BY signal, year`,
    region, signalType,
  );
  const map = new Map<string, { year: number; score: number; songCount: number }[]>();
  for (const r of rows) {
    if (!map.has(r.signal)) map.set(r.signal, []);
    map.get(r.signal)!.push({ year: r.year, score: r.score, songCount: r.song_count });
  }
  return map;
}

export interface EraOverviewRow {
  eraId: ChartEra["id"];
  eraLabel: string;
  eraStart: number;
  eraEnd: number;
  comparability: ChartEra["comparability"];
  songCount: number;
  yearCount: number;
  yearSpan: number;
  topMood: string | null;
  topTheme: string | null;
  topEntity: string | null;
  eventCount: number;
  evidenceDensity: number; // evidence rows per song
}

export function getEraOverview(region: string = "US"): EraOverviewRow[] {
  // Aggregate songs, events, and signals per chart era so the home
  // page can present a small mosaic (5 eras) instead of a wall of
  // 64 identical year tiles. Per Decision 0030, the home page
  // surfaces the eras as editorial mosaics — each era card shows
  // its song count, top signal, top entity, and event coverage so
  // the user can pick a starting point instead of scrolling.
  const rows: EraOverviewRow[] = [];
  for (const era of CHART_ERAS) {
    const cnt = (get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM songs s WHERE s.region = ? AND s.year BETWEEN ? AND ?`,
      region,
      era.start,
      era.end,
    )?.c) ?? 0;
    const years = all<{ y: number }>(
      `SELECT DISTINCT s.year AS y FROM songs s WHERE s.region = ? AND s.year BETWEEN ? AND ? ORDER BY s.year`,
      region, era.start, era.end,
    );
    // Top mood: pick the mood signal with the highest song_count
    // for the era's year range.
    const topMood = get<{ signal: string; c: number }>(
      `SELECT ysp.signal, SUM(ysp.song_count) AS c
         FROM year_signal_profiles ysp
         WHERE ysp.region = ? AND ysp.signal_type = 'mood'
           AND ysp.year BETWEEN ? AND ?
         GROUP BY ysp.signal
         ORDER BY c DESC LIMIT 1`,
      region, era.start, era.end,
    );
    const topTheme = get<{ signal: string; c: number }>(
      `SELECT ysp.signal, SUM(ysp.song_count) AS c
         FROM year_signal_profiles ysp
         WHERE ysp.region = ? AND ysp.signal_type = 'theme'
           AND ysp.year BETWEEN ? AND ?
         GROUP BY ysp.signal
         ORDER BY c DESC LIMIT 1`,
      region, era.start, era.end,
    );
    // Top entity: most-mentioned entity in songs whose year falls
    // in the era window.
    const topEntity = get<{ canonical_name: string; c: number }>(
      `SELECT e.canonical_name, COUNT(*) AS c
         FROM entity_mentions em
         JOIN songs s ON s.id = REPLACE(em.song_id, 'versesignal:s:', '')
                       OR s.id = em.song_id
                       OR em.song_id LIKE '%' || s.id
         JOIN entities e ON e.id = em.entity_id
         WHERE s.region = ? AND s.year BETWEEN ? AND ?
         GROUP BY e.id
         ORDER BY c DESC LIMIT 1`,
      region, era.start, era.end,
    );
    // Event count: events whose start_date overlaps the era.
    const eventCount = (get<{ c: number }>(
      `SELECT COUNT(DISTINCT e.id) AS c
         FROM events e
         WHERE CAST(SUBSTR(e.start_date, 1, 4) AS INTEGER) BETWEEN ? AND ?`,
      era.start, era.end,
    )?.c) ?? 0;
    const evidenceDensity = cnt === 0
      ? 0
      : (get<{ c: number }>(
          `SELECT COUNT(*) AS c
             FROM graph_edges ge
             JOIN songs s ON s.id LIKE '%' || REPLACE(ge.src_id, 'versesignal:n:song:versesignal:', '') || '%'
                          AND ge.src_id LIKE 'versesignal:n:song:%'
             WHERE s.region = ? AND s.year BETWEEN ? AND ?`,
          region, era.start, era.end,
        )?.c ?? 0) / cnt;
    rows.push({
      eraId: era.id,
      eraLabel: era.label,
      eraStart: era.start,
      eraEnd: era.end,
      comparability: era.comparability,
      songCount: cnt,
      yearCount: years.length,
      yearSpan: era.end - era.start + 1,
      topMood: topMood?.signal ?? null,
      topTheme: topTheme?.signal ?? null,
      topEntity: topEntity?.canonical_name ?? null,
      eventCount,
      evidenceDensity: Number(evidenceDensity.toFixed(2)),
    });
  }
  return rows;
}
