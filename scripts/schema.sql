-- VerseSignal graph schema
-- All edges carry (type, weight, confidence, evidence_json)
-- All evidence traces back to (source_api, snippet, model_version, ts)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- Core entities
-- ============================================================

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,                    -- versesignal:<slug>
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  year INTEGER NOT NULL,
  chart_source TEXT NOT NULL,             -- billboard_hot100_ye | billboard_global200 | songstats
  chart_rank INTEGER,                     -- 1..25 (or peak position)
  region TEXT DEFAULT 'US',               -- US | GLOBAL | IN | UK | ...
  spotify_id TEXT,
  musicbrainz_id TEXT,
  musixmatch_track_id INTEGER,
  duration_ms INTEGER,
  release_date TEXT,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT                      -- flexible bag
);

CREATE INDEX IF NOT EXISTS idx_songs_year ON songs(year);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);

-- ============================================================
-- Lyrics (line-level, optionally time-synced from richsync)
-- ============================================================

CREATE TABLE IF NOT EXISTS lyric_lines (
  id TEXT PRIMARY KEY,                     -- versesignal:ll:<songId>:<idx>
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  line_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_ms INTEGER,                        -- from richsync when available
  end_ms INTEGER,
  section TEXT,                            -- verse|chorus|bridge|intro|outro
  has_named_entity INTEGER DEFAULT 0,      -- precomputed hint
  UNIQUE(song_id, line_index)
);

CREATE INDEX IF NOT EXISTS idx_lyric_lines_song ON lyric_lines(song_id);

-- ============================================================
-- Embeddings (lyric line + song + theme + event vectors)
-- Stored as float32 blobs; we keep the model version for traceability.
-- ============================================================

CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,                     -- versesignal:emb:<type>:<key>
  target_type TEXT NOT NULL,               -- lyric_line | song | theme | event | artist | year
  target_id TEXT NOT NULL,
  model TEXT NOT NULL,                     -- all-MiniLM-L6-v2 | EmbeddingGemma-308M | ...
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL,                    -- packed float32 little-endian
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_type, target_id, model)
);

CREATE INDEX IF NOT EXISTS idx_emb_target ON embeddings(target_type, target_id);

-- ============================================================
-- NER entities (people, places, artists, brands, religious figures, etc.)
-- Multi-source: spaCy, GLiNER, LLM; linked to MusicBrainz / Wikidata where possible.
-- ============================================================

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,                     -- versesignal:ent:<slug>
  canonical_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,               -- person | artist | place | city | country | brand | religious_figure | political_figure | song_title | album_title | event_reference | drug_or_substance | technology | sports_reference | mythological_reference
  wikidata_id TEXT,
  musicbrainz_id TEXT,
  musicbrainz_artist_type TEXT,            -- person | group | orchestra | ...
  aliases_json TEXT,                       -- JSON array
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);

-- Mentions of entities in lyric lines (with confidence + source)
CREATE TABLE IF NOT EXISTS entity_mentions (
  id TEXT PRIMARY KEY,                     -- versesignal:em:<songId>:<lineIdx>:<entId>:<source>
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  lyric_line_id TEXT NOT NULL REFERENCES lyric_lines(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  surface_form TEXT,                       -- the literal text span detected
  start_char INTEGER,
  end_char INTEGER,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL,                    -- spacy | gliner | llm | lexicon
  model_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_em_song ON entity_mentions(song_id);
CREATE INDEX IF NOT EXISTS idx_em_entity ON entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_em_line ON entity_mentions(lyric_line_id);

-- ============================================================
-- Themes / moods (lexicon + embedding + LLM + Cyanite)
-- ============================================================

CREATE TABLE IF NOT EXISTS theme_scores (
  id TEXT PRIMARY KEY,                     -- versesignal:ts:<songId>:<theme>
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,                     -- love | heartbreak | war_conflict | protest | money_status | faith | home | loneliness | escape_party | violence | migration | technology | fame | identity | grief | hope | national_pride | social_unrest | nostalgia
  score REAL NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.7,
  evidence_terms_json TEXT,                -- JSON array of detected terms
  source TEXT NOT NULL,                    -- lexicon | embedding | llm | cyanite | hybrid
  model_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_ts_song ON theme_scores(song_id);
CREATE INDEX IF NOT EXISTS idx_ts_theme ON theme_scores(theme);

CREATE TABLE IF NOT EXISTS mood_scores (
  id TEXT PRIMARY KEY,                     -- versesignal:ms:<songId>:<mood>
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  mood TEXT NOT NULL,                      -- melancholic | energetic | tense | hopeful | angry | dreamy | celebratory | somber | romantic
  score REAL NOT NULL,
  source TEXT NOT NULL,                    -- cyanite | llm | hybrid
  model_version TEXT,
  energy_curve_json TEXT                   -- optional time-series from Cyanite
);

-- ============================================================
-- World events (curated seed; expand later)
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,                     -- versesignal:ev:<slug>
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  regions_json TEXT NOT NULL,              -- JSON array of region codes
  category TEXT NOT NULL,                  -- war | pandemic | economic | social | political | sports | tech | natural_disaster | cultural
  keywords_json TEXT,                      -- JSON array of seed keywords
  description TEXT,
  related_themes_json TEXT,                -- JSON array of theme tags
  severity REAL DEFAULT 1.0                -- 0..1 visibility/impact
);

-- ============================================================
-- Graph edges (the product's core abstraction)
-- Every edge has type, weight, confidence, source, and references evidence.
-- ============================================================

CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY,                     -- versesignal:n:<type>:<key>
  node_type TEXT NOT NULL,                 -- song | artist | year | event | theme | mood | entity | word | chart | region
  label TEXT NOT NULL,
  properties_json TEXT                     -- flexible bag
);

CREATE INDEX IF NOT EXISTS idx_gn_type ON graph_nodes(node_type);

CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY,                     -- versesignal:e:<src>:<type>:<dst>
  src_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  dst_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,                 -- performed_by | charted_in | contains_theme | has_mood | mentions_entity | similar_to | associated_with_event | same_event_window | collaboration | shared_songwriter | same_mood_cluster | same_place_reference | emotional_alignment | escapist_contrast
  weight REAL NOT NULL DEFAULT 1.0,
  confidence REAL NOT NULL DEFAULT 0.7,
  evidence_ids_json TEXT,                  -- JSON array of evidence IDs
  source_api TEXT NOT NULL,                -- musixmatch | songstats | gliner | embedding | llm | cyanite | lexic
  model_version TEXT,
  explanation TEXT,                        -- human-readable "why"
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ge_src ON graph_edges(src_id);
CREATE INDEX IF NOT EXISTS idx_ge_dst ON graph_edges(dst_id);
CREATE INDEX IF NOT EXISTS idx_ge_type ON graph_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_ge_event ON graph_edges(edge_type, dst_id) WHERE edge_type = 'associated_with_event';

-- ============================================================
-- Evidence (the trust layer — every edge points here)
-- ============================================================

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,                     -- versesignal:ev:<edgeId>:<idx>
  edge_id TEXT NOT NULL REFERENCES graph_edges(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,             -- lyric_term | lyric_line | chart_entry | metadata_credit | mood_score | event_date_overlap | entity_match | embedding_similarity
  value TEXT NOT NULL,
  source TEXT NOT NULL,                    -- musixmatch | songstats | cyanite | gliner | embedding | llm
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ev_edge ON evidence(edge_id);

-- ============================================================
-- Inserts (curated event seed for the demo window 2018–2023)
-- ============================================================

INSERT OR IGNORE INTO events (id, name, start_date, end_date, regions_json, category, keywords_json, description, related_themes_json, severity) VALUES
  ('versesignal:ev:covid_19', 'COVID-19 lockdowns', '2020-03-15', '2021-06-01',
   '["GLOBAL"]', 'pandemic',
   '["lockdown", "isolation", "quarantine", "pandemic", "stay home", "social distance", "mask", "zoom", "remote"]',
   'Global pandemic response with widespread lockdowns, isolation, and remote work/school.',
   '["loneliness", "home", "escape_party", "hope", "grief", "technology"]', 0.95),
  ('versesignal:ev:blm_2020', 'Black Lives Matter protests', '2020-05-26', '2020-09-01',
   '["US", "GLOBAL"]', 'social',
   '["blm", "black lives matter", "racism", "police", "justice", "george floyd", "breonna taylor", "protest", "say their names"]',
   'Global protests following the murder of George Floyd, focused on racial justice and policing.',
   '["protest", "social_unrest", "violence", "identity", "hope"]', 0.85),
  ('versesignal:ev:us_election_2020', 'US 2020 Presidential Election', '2020-11-03', '2021-01-20',
   '["US"]', 'political',
   '["election", "vote", "biden", "trump", "democracy", "capitol"]',
   'Highly contested US presidential election culminating in the January 6 Capitol events.',
   '["protest", "social_unrest", "identity", "national_pride", "hope"]', 0.7),
  ('versesignal:ev:ukraine_war', 'Russia-Ukraine War', '2022-02-24', NULL,
   '["GLOBAL", "UA", "RU"]', 'war',
   '["ukraine", "russia", "war", "invasion", "kyiv", "zelensky", "putin", "refugee", "freedom", "soldier", "border"]',
   'Full-scale invasion of Ukraine by Russia; major humanitarian and geopolitical crisis.',
   '["war_conflict", "migration", "hope", "violence", "national_pride", "protest"]', 0.9),
  ('versesignal:ev:recession_covid', 'COVID economic recession', '2020-03-01', '2021-12-31',
   '["GLOBAL"]', 'economic',
   '["recession", "unemployment", "eviction", "broke", "rent", "bills", "lost job", "stimulus"]',
   'Sharp global economic contraction from pandemic shutdowns and supply chain disruption.',
   '["money_status", "grief", "loneliness", "hope"]', 0.8),
  ('versesignal:ev:roevwade', 'US Supreme Court overturns Roe v. Wade', '2022-06-24', NULL,
   '["US"]', 'political',
   '["roe", "wade", "abortion", "choice", "rights", "women", "supreme court", "reproductive"]',
   'Dobbs v. Jackson decision overturning federal abortion rights protections.',
   '["identity", "protest", "social_unrest", "hope", "grief"]', 0.7),
  ('versesignal:ev:queen_elizabeth', 'Death of Queen Elizabeth II', '2022-09-08', '2022-09-19',
   '["UK", "GLOBAL"]', 'cultural',
   '["queen", "elizabeth", "royal", "monarchy", "london", "king charles"]',
   'Death of Queen Elizabeth II after 70 years on the throne; period of national mourning.',
   '["grief", "national_pride", "identity", "nostalgia"]', 0.6),
  ('versesignal:ev:covid_vaccine', 'COVID vaccine rollout', '2020-12-14', '2022-06-30',
   '["GLOBAL"]', 'pandemic',
   '["vaccine", "pfizer", "moderna", "shot", "booster", "mandate"]',
   'Mass vaccination campaigns against COVID-19, including mandates and booster waves.',
   '["hope", "technology", "identity"]', 0.6),
  ('versesignal:ev:climate_crisis', 'Climate crisis visibility', '2018-01-01', NULL,
   '["GLOBAL"]', 'natural_disaster',
   '["climate", "wildfire", "flood", "hurricane", "warming", "earth", "fire", "extinction"]',
   'Increasing visibility of climate-driven disasters: Australian fires 2019-20, European heatwaves, North American wildfires.',
   '["grief", "hope", "protest", "social_unrest", "national_pride"]', 0.7),
  ('versesignal:ev:metoo', 'MeToo movement', '2017-10-15', '2020-12-31',
   '["US", "GLOBAL"]', 'social',
   '["metoo", "harassment", "assault", "consent", "survivor", "silence", "speak"]',
   'Continued reverberations of the MeToo movement; industry reckonings and survivor accounts.',
   '["identity", "protest", "hope", "violence", "grief"]', 0.7);
