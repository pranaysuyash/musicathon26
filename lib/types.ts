// Core domain types shared across the pipeline and UI.
// These mirror the SQLite schema but stay language-agnostic.

export type Region = "US" | "GLOBAL" | "IN" | "UK" | "JP" | "KR" | "DE" | "BR" | "NG" | "MX";

export type ChartSource =
  | "billboard_hot100_ye" // Billboard Hot 100 year-end (1960–2019 spine)
  | "billboard_global200" // Billboard Global 200 (2020+ spine)
  | "songstats"           // Songstats-derived top tracks
  | "manual";

export interface Song {
  id: string;                  // versesignal:<slug>
  title: string;
  artist: string;
  year: number;
  chartSource: ChartSource;
  chartRank: number;           // 1..25 (or peak position)
  region: Region;
  spotifyId?: string;
  musicbrainzId?: string;
  musixmatchTrackId?: number;
  durationMs?: number;
  releaseDate?: string;
  ingestedAt: string;
  metadata?: Record<string, unknown>;
}

export interface LyricLine {
  id: string;
  songId: string;
  lineIndex: number;
  text: string;
  startMs?: number;
  endMs?: number;
  section?: "intro" | "verse" | "pre_chorus" | "chorus" | "post_chorus" | "bridge" | "outro" | "hook";
  hasNamedEntity?: boolean;
}

export type EntityType =
  | "person"
  | "artist"
  | "place"
  | "city"
  | "country"
  | "brand"
  | "religious_figure"
  | "political_figure"
  | "song_title"
  | "album_title"
  | "event_reference"
  | "drug_or_substance"
  | "technology"
  | "sports_reference"
  | "mythological_reference"
  | "vehicle"
  | "weapon"
  | "money_object";

export interface Entity {
  id: string;
  canonicalName: string;
  entityType: EntityType;
  wikidataId?: string;
  musicbrainzId?: string;
  musicbrainzArtistType?: "person" | "group" | "orchestra" | "other";
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

export type Theme =
  | "love"
  | "heartbreak"
  | "war_conflict"
  | "protest"
  | "money_status"
  | "faith"
  | "home"
  | "loneliness"
  | "escape_party"
  | "violence"
  | "migration"
  | "technology"
  | "fame"
  | "identity"
  | "grief"
  | "hope"
  | "national_pride"
  | "social_unrest"
  | "nostalgia";

export type Mood =
  | "melancholic"
  | "energetic"
  | "tense"
  | "hopeful"
  | "angry"
  | "dreamy"
  | "celebratory"
  | "somber"
  | "romantic"
  | "anxious";

export type EventCategory =
  | "war"
  | "pandemic"
  | "economic"
  | "social"
  | "political"
  | "sports"
  | "tech"
  | "natural_disaster"
  | "cultural";

export interface WorldEvent {
  id: string;
  name: string;
  startDate: string;
  endDate?: string;
  regions: Region[];
  category: EventCategory;
  keywords: string[];
  description: string;
  relatedThemes: Theme[];
  severity: number;
}

export type NodeType =
  | "song"
  | "artist"
  | "year"
  | "event"
  | "theme"
  | "mood"
  | "entity"
  | "word"
  | "chart"
  | "region";

export type EdgeType =
  | "performed_by"
  | "featured_on"
  | "charted_in"
  | "contains_theme"
  | "has_mood"
  | "mentions_entity"
  | "similar_to"
  | "associated_with_event"
  | "same_event_window"
  | "collaboration"
  | "shared_songwriter"
  | "shared_producer"
  | "same_mood_cluster"
  | "same_place_reference"
  | "emotional_alignment"
  | "escapist_contrast"
  | "thematic_bridge"
  | "contains_word";

// SourceApi: every value the DB actually contains, plus
// the values declared in the union but not yet seeded.
// Per 1st principles, this is the single source of truth:
// every write site must use a value in this list, and the
// DB integrity test (tests/test_graph_integrity.py) checks
// no other values are present.
export type SourceApi =
  // Data sources (provenance)
  | "musixmatch"
  | "songstats"
  | "billboard"
  | "musicbrainz"
  | "wikidata"
  | "jam_base"
  | "jambase"
  | "cyanite"
  | "elevenlabs"
  | "manual"
  | "gazetteer"
  // Analysis / extraction
  | "spacy"
  | "gliner"
  | "embedding"
  | "llm"
  | "lexicon"
  // Aggregation
  | "hybrid"
  | "human";

export type EvidenceType =
  | "lyric_term"
  | "lyric_line"
  | "chart_entry"
  | "metadata_credit"
  | "mood_score"
  | "event_date_overlap"
  | "entity_match"
  | "embedding_similarity"
  | "collaboration_credit"
  | "chart_delta"
  | "signal_delta"
  | "candidate_moment_match"
  | "known_event_match"
  | "song_cluster_membership"
  | "chart_era_context"
  | "temporal_overlap"
  | "matched_term"
  | "gazetteer_alias";

export type InferenceType =
  | "direct_lyric_reference"
  | "theme_overlap"
  | "temporal_alignment"
  | "emotional_alignment"
  | "emotional_shadow"
  | "embedding_similarity"
  | "song_cluster_inference"
  | "curated_event_alignment"
  | "manual_curation"
  | "entity_match"
  | "auto_curation"
  | "hybrid";

export interface GraphNode {
  id: string;
  nodeType: NodeType;
  label: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  srcId: string;
  dstId: string;
  edgeType: EdgeType;
  weight: number;       // 0..1+ strength
  confidence: number;   // 0..1 certainty
  evidenceIds: string[];
  sourceApi: SourceApi;
  modelVersion?: string;
  explanation?: string;
  createdAt?: string;
  inferenceType?: InferenceType;
  matchedTerms?: string[];
}

export interface Evidence {
  id: string;
  edgeId: string;
  evidenceType: EvidenceType;
  value: string;
  source: SourceApi;
  confidence: number;
  createdAt: string;
}

// Demo-window event connections (curated, evidence-first)
export interface SongEventLink {
  songId: string;
  eventId: string;
  linkType: "direct_reference" | "named_entity" | "theme_overlap" | "emotional_shadow" | "escapist_contrast" | "mood_alignment";
  strength: number;
  evidence: {
    chartedInWindow: boolean;
    matchedTerms: string[];
    evidenceLines: { lineText: string; lineIndex: number }[];
    moodAlignment?: Mood[];
    chartRank?: number;
  };
  explanation: string;
  confidence: number;
}
