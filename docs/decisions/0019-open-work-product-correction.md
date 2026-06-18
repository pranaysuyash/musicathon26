# Decision 0019 — Open work: product correction (lyrics-first) + foundational contracts + "wow" surfaces

**Date:** 2026-06-17
**Status:** Active (catalog)
**Owner:** VerseSignal agent

## Context

External review identified that VerseSignal's current
implementation is more "data pipeline prototype" than
"long-term product," and proposed a major product
correction. This record catalogs the open work as
prioritized backlog. The first 4 items are the highest-
leverage (they unlock everything else); the rest is
sequenced by value + effort.

## Priority 0 — Foundational contracts (block everything)

These are pre-requisites for any of the new product work.
Per the feedback, they are causing real bugs and weakening
type truth.

### P0.1 — SourceApi union alignment

`lib/types.ts:SourceApi` currently allows
`musixmatch | songstats | spacy | gliner | embedding | llm
| lexicon` but seed data writes `manual` and `billboard`,
and enrichment writes `hybrid`. SQLite doesn't fail on
unknown values, but the type system stops being the source
of truth.

**Fix:** extend the union to the full set and validate
every write site.

```
manual | billboard | musixmatch | songstats | elevenlabs
| cyanite | gliner | spacy | embedding | llm | lexicon
| hybrid | human
```

### P0.2 — Graph ID canonicalization

Current state: `versesignal:artist:<slug>` is the artist
node ID in some places; `versesignal:n:artist:<slug>` in
others. Song nodes use `versesignal:n:song:`; event nodes
use `versesignal:n:event:`. The mismatch causes
messy traversal, filtering, and UI assumptions.

**Fix:** introduce `lib/graph/ids.ts` with helper
functions (`nodeIds.song(songId)`, `nodeIds.artist(slug)`,
`nodeIds.event(eventId)`, `nodeIds.theme(slug)`,
`edgeIds.songTheme(songId, theme)`,
`edgeIds.songEvent(songId, eventId, linkType)`).
Replace all hand-built IDs with the helpers.

### P0.3 — Graph integrity tests

The app is fragile without integrity tests. At minimum:

- every graph edge `src_id` and `dst_id` exists in
  `graph_nodes`
- every edge has at least 1 evidence row
- every evidence row points to a real edge
- every `song_id` in a song node maps to a real song
- every `event_id` in an event node maps to a real event
- every `SourceApi` value is in the union
- no edge has empty/invalid `confidence`
- no event association above threshold without evidence

**Fix:** add `tests/test_graph_integrity.py` (pytest).
Runs against the live DB. 1st-principles invariant
checks; not unit tests of mocked logic.

### P0.4 — Naming drift resolution

`README` says Lyric Atlas, `package.json` says
versesignal, UI says VerseSignal, repo is musicathon26.
For a long-term product, identity must settle.

**Proposed:** `VerseSignal` is the product name.
`Lyric Atlas` is a visual mode (the graph view) or
tagline. The repo name `musicathon26` is incidental
(hackathon slug) and can stay for now (not user-visible).

**Fix:** update README + docs to consistently use
"VerseSignal" as the product name. Add a tagline:
"A cultural seismograph of popular music."

## Priority 1 — Lyrics-first product correction (the major shift)

The biggest change: re-orient the product from
"event-first" to "lyrics-first."

**Old flow (current):**
World event → find related songs → explain connections

**New flow:**
Songs/Lyrics → signals → year profiles → candidate
contexts → evidence-backed cultural lens

### P1.1 — year_signal_profiles table

```
year_signal_profiles:
  id TEXT PRIMARY KEY
  year INTEGER NOT NULL
  region TEXT NOT NULL DEFAULT 'US'  -- US / global / region-code
  signal_type TEXT NOT NULL  -- theme | mood | entity | phrase | metaphor | place | brand
  signal TEXT NOT NULL  -- e.g., 'love', 'loneliness', 'Benz', 'Henny'
  score REAL NOT NULL  -- aggregate score
  delta_vs_prev_year REAL  -- % change vs prior year
  delta_vs_baseline REAL  -- % change vs 3-year baseline
  evidence_song_ids_json TEXT  -- JSON array
  evidence_line_ids_json TEXT  -- JSON array
  source_api TEXT  -- 'theme_scores' | 'mood_scores' | 'entity_mentions' | 'hybrid'
  computed_at TEXT NOT NULL
  UNIQUE(year, region, signal_type, signal)
```

Initial extraction script: `scripts/build-year-signal-profiles.py`
aggregates existing `theme_scores`, `mood_scores`,
`entity_mentions` by year + signal_type. Re-runnable.

### P1.2 — signal_clusters table

Groups of co-occurring signals (e.g., "loneliness + home +
phone + night + touch" cluster in 2020).

```
signal_clusters:
  id TEXT PRIMARY KEY
  year INTEGER NOT NULL
  region TEXT NOT NULL
  label TEXT  -- human-readable cluster name
  description TEXT
  signals_json TEXT  -- {signal_type, signal, weight}
  song_ids_json TEXT
  confidence REAL
  interpretation TEXT  -- empty until P1.5
  computed_at TEXT NOT NULL
```

### P1.3 — candidate_contexts table

LLM-derived or rule-derived candidate cultural contexts
that might explain a signal cluster.

```
candidate_contexts:
  id TEXT PRIMARY KEY
  signal_cluster_id TEXT
  context_type TEXT  -- 'event' | 'trend' | 'platform' | 'social_behavior' | 'economic_condition'
  name TEXT
  date_range_start TEXT
  date_range_end TEXT
  geography TEXT  -- 'US' | 'global' | region codes
  explanation TEXT
  confidence REAL
  evidence_json TEXT  -- linked events, songs, line ids
  source TEXT  -- 'rule' | 'llm' | 'human'
  computed_at TEXT NOT NULL
```

### P1.4 — Cultural posture classifier

Classifies how each song relates to its cultural context.
Six postures (per the feedback):

- **Reflection**: song mirrors the world context
- **Shadow**: song carries similar emotional weight
  without mentioning the event
- **Escape**: song emotionally runs away from the context
- **Contradiction**: song's tone clashes with the event
- **Processing**: later song that metabolizes an earlier
  event
- **Amplification**: song directly reinforces a trend

A seventh category for low evidence:
- **Coincidence**: weak temporal overlap, not enough
  evidence

Implementation: rule-based first (using existing
edge_type + theme), LLM-derived second for ambiguous
cases.

### P1.5 — Cultural Lens page (the "wow")

`/lens/[year]` — a guided story page that:
1. "What was happening in the world" (events)
2. "What the chart sounded like" (signal profile)
3. "What the lyrics kept returning to" (top signals)
4. "Songs that reflected the moment" (reflection)
5. "Songs that escaped the moment" (escape)
6. "Unexpected entities/places/brands" (entity spikes)
7. "Surprise contradictions" (escape + reflection in
   same year)
8. "The cultural takeaway" (narrated text + optional
   ElevenLabs MP3)

This is the headline feature per the feedback. The
graph explorer is the secondary surface; the lens is
the first wow.

## Priority 2 — Region-aware + tone-context correlation

### P2.1 — Region-aware context model

`events` table currently has no geography. Add:
```
ALTER TABLE events ADD COLUMN countries_json TEXT;
ALTER TABLE events ADD COLUMN regions_json TEXT;
```

Re-curate the 15 events with country/region codes. This
unlocks the "different countries, different crises" insight.

### P2.2 — Tone-context correlation engine

For each event, compute:
- baseline period: 3 years before
- event period: event start_date to end_date
- for each signal (theme, mood, entity):
  - baseline score (mean)
  - event-period score
  - delta
  - z-score
  - confidence

Output: `context_signal_correlations` table with the
deltas. The lens page reads from this.

### P2.3 — Event lead/lag analysis

For each (event, signal) pair, compute:
- `first_signal_rise_date`: when the signal first rose
  above baseline
- `event_visibility_date`: when the event became
  mainstream (approximated by event start_date for now)
- `lead_lag_days`: positive = signal before event
- `confidence`
- `evidence_song_ids`

A new metric: **Lead Signal Rate** = % of (event, signal)
pairs where the signal rose before the event. Per the
feedback, this is the "70% cases" idea — but as evidence,
not as deterministic prediction.

## Priority 3 — Surfaces + intelligence

### P3.1 — Data quality dashboard

`/ops` or `/data-health` page:
- songs seeded / lyrics fetched / enriched counts
- graph nodes/edges/evidence
- source distribution (SourceApi counts)
- confidence distribution
- edges without evidence
- songs without lyrics
- songs without theme scores
- songs without mood scores
- events without songs

This is a 1st-principles operational surface. Per 0.10
(observability), the operator-facing dashboard is required.

### P3.2 — Timeline + spatial scrubber

`/scrub` page with:
- year/month slider
- signal layer toggles (theme, mood, entity, phrase)
- region selector (US / global / by-country)

### P3.3 — Historical analogue search

For a current signal cluster, find past periods with
similar cluster shape. Output: "Your current 'escape +
nightlife' cluster resembles 2020 COVID-era (similarity
0.71)."

### P3.4 — NL "ask the graph" interface

`/ask?q=...` with natural language queries. Returns:
- short cultural insight
- mini graph
- song cards
- evidence
- confidence

Out of scope for the long-term full app initially, but
the data model should support it (everything is a
searchable signal).

## Priority 4 — Globe + advanced surfaces

### P4.1 — Globe as cultural weather map

The globe shows "parallel cultural weather" — different
regions with different local events having different
lyric signals. NOT a 3D gimmick; a real product surface
that requires P2.1 (region-aware contexts) first.

### P4.2 — Voice narration

ElevenLabs MP3s already exist for year narrations. Wire
them to the /lens pages for an "Insight" play button.

## Priority 5 — Inventory + custom model

### P5.1 — Inventory expansion (tiered)

- **Tier 1**: top 25/yr 2018–2023 (current, 150 songs)
- **Tier 2**: top 50/yr 2018–2023 (300 songs)
- **Tier 3**: top 100/yr 2018–2023 (600 songs)
- **Tier 4**: 1960–2017 US chart-memory mode (Billboard
  year-end, ~1,450 songs)
- **Tier 5**: 2020+ global streaming mode (Billboard
  Global 200 + Songstats)
- **Tier 6**: regional (India, UK, Korea, Brazil, LatAm)

Each tier is a confidence multiplier, not a content
expansion. Per 1st principles, signal quality > corpus
size.

### P5.2 — Custom MusicNER model

Three layers (per the feedback):

1. **GLiNER zero-shot with richer labels**: not just
   "brand" but "brand or luxury fashion brand";
   "social media platform or app"; "drug, alcohol, or
   substance"; "vehicle used as status symbol"
2. **Gazetteers** for music-specific aliases:
   "Henny" → Hennessy, "the gram" → Instagram, "Benz" →
   Mercedes-Benz, "Ye" → Kanye West, "the six" → Toronto,
   "the A" → Atlanta
3. **Fine-tuned model** (later): train on 500 songs ×
   20 lines = 10,000 annotated lines. Use DeBERTa or
   GLiNER-domain-adapted.

Human-in-the-loop annotation UI accepts/rejects spans;
exported JSONL feeds fine-tuning.

## Priority 6 — Naming + identity

### P6.1 — Naming drift resolution

(P0.4 above) Settle on "VerseSignal" as product name;
"Lyric Atlas" stays as a tagline or visual mode.

## What's NOT in scope (per 0.13)

- **Auth + user accounts** — no users in the surface
- **Real-time streaming data** — defer
- **PWA / offline mode** — defer
- **Pinterest/Instagram integration** — out
- **3D Earth as primary surface** — P4.1 makes it
  meaningful only after P2.1 lands; the globe is not
  the first wow

## Sequencing

Per 1st principles, the highest-leverage work first:

1. **P0.1 + P0.2 + P0.3** (foundational contracts) —
   unblocks everything
2. **P1.1 + P1.2** (year_signal_profiles + clusters) —
   lyrics-first data model
3. **P1.4** (cultural posture classifier) — first lens
   data
4. **P1.5** (Cultural Lens page) — the wow
5. **P2.1 + P2.2** (region-aware contexts + tone-
   context correlation) — second wave
6. **P3.1** (data quality dashboard) — operational
7. **P3.2 + P3.3** (timeline scrubber + historical
   analogues) — interaction depth
8. **P4.x** — globe + voice
9. **P5.x** — inventory + model
10. **P6.x** — naming

This sequencing is the long-term product roadmap.

## Why this decision

Per 0.7 (AI output boundary), I cannot claim the current
product is "complete" or "wow" until the lyrics-first
correction is in. The graph exists, but the discovery flow
starts from the wrong end.

Per 0.13 (scope control), I'm not committing to doing
all of this in one round. The first round is P0.1–P0.4
(foundational). The lens page is the next big push.

Per 0.4.1 (confidence gate), I cannot claim a "cultural
seismograph" exists until the lens page actually delivers
the experience. Until then, the product is "graph viewer."

## Related

- This is a meta-record for the open work. Subsequent
  decisions 0020+ will document each priority bucket as
  it ships.
- `docs/audit/0001-verseignal-11dim-audit.md` will need
  a re-verdict after P1.5 (lens page) lands.
