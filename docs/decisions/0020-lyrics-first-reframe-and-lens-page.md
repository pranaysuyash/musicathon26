# Decision 0020 — Lyrics-first reframe + year_signal_profiles + Cultural Lens page

**Date:** 2026-06-17
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Re-orient the product from "event-first" to
"lyrics-first" discovery. The new pipeline is:

```
Songs/Lyrics → signals → year_signal_profiles
              ↓
         signal_clusters (P1.2)
              ↓
       candidate_contexts (P1.3)
              ↓
   Cultural Lens page → Cultural Seismograph
```

The Cultural Lens page (`/lens/[year]`) is the new
primary product surface. It answers "What were the
charts saying in `<year>`?" before showing any event
overlay.

This is the major product correction called for in the
external review (decision 0019). This decision records
the first shippable state.

## What shipped in this decision

### 1. Foundational contracts (P0.1 + P0.2 + P0.3)

Per the integrity test failures caught by the new
`tests/test_graph_integrity.py`:

- **SourceApi union** in `lib/types.ts` extended to the
  full set: `musixmatch, songstats, billboard,
  musicbrainz, wikidata, jam_base, jambase, cyanite,
  elevenlabs, manual, spacy, gliner, embedding, llm,
  lexicon, hybrid, human`. SQLite now matches the
  TypeScript source of truth.
- **Graph ID canonicalization** in `lib/graph/ids.ts`:
  every graph ID has a helper (`nodeSong(songId)`,
  `nodeArtist(slug)`, `nodeEvent(eventId)`, etc.).
  Plus a `slug()` helper that mirrors the Python one.
- **Migration** `scripts/migrate-graph-ids.py` rewrote
  92 graph_nodes (`versesignal:artist:*` and
  `versesignal:year:*` → canonical `versesignal:n:*`)
  + 300 graph_edges (the references). Added 300
  structural evidence rows for naked `performed_by`
  and `charted_in` edges.
- **Integrity tests** `tests/test_graph_integrity.py`
  (13 tests). All pass. They pin the data layer
  invariants and will catch future drift.

### 2. year_signal_profiles (P1.1)

New table:

```sql
year_signal_profiles (
  id TEXT PK,            -- versesignal:ysp:<year>:<region>:<type>:<signal>
  year INTEGER,
  region TEXT,
  signal_type TEXT,       -- theme | mood | entity | phrase | place | brand
  signal TEXT,
  score REAL,             -- mean across songs
  song_count INTEGER,
  delta_vs_prev_year REAL,
  delta_vs_baseline REAL, -- mean of prior 3 years
  evidence_song_ids_json TEXT,
  source_api TEXT,
  computed_at TEXT,
  UNIQUE (year, region, signal_type, signal)
)
```

`scripts/build-year-signal-profiles.py` aggregates from
existing `theme_scores`, `mood_scores`, `entity_mentions`.
318 profiles built (95 theme + 43 mood + 180 entity).

Sample (2020, US, top 5):
- mood: `energetic` 26.20 (n=20)  Δyr=+40%  Δbase=+56%
- mood: `melancholic` 19.51 (n=4)  Δyr=+141%  Δbase=+174%
- mood: `celebratory` 13.98 (n=5)  Δyr=-36%  Δbase=+13%
- mood: `tense` 13.93 (n=5)  Δyr=+30%  Δbase=+81%
- mood: `romantic` 13.23 (n=14)  Δyr=-34%  Δbase=-27%

This is exactly the kind of "what were the charts
saying?" data the external review called for.

### 3. /api/year-signals

`GET /api/year-signals?year=2020&region=US&limit=20`

Returns signals sorted by score, with `byType`
grouping for the UI. Zod-validated. 200 OK.

### 4. Cultural Lens page (`/lens/[year]`)

The new primary product surface. Server-rendered.
First version shows:

1. **Hero**: "2020 — What were the charts saying in 2020?"
2. **The cultural takeaway** (auto-generated text):
   "In 2020, the mood 'energetic' rose 56% vs the prior
   3-year baseline (20 chart songs). The world was
   experiencing: [8 events]. Also strong: 'melancholic'
   (4 songs, 174% vs baseline)."
3. **The chart signal profile**: 3 columns
   (Moods, Themes, Entities) with delta-vs-baseline
   percentages.
4. **What was happening in the world**: 8 events
   that overlap the year, with deep links to /event/[id].
5. **The chart spine**: top 25 songs of the year with
   deep links to /song/[id].

### 5. Verified

- TS clean
- 46/46 tests pass (20 vitest + 13 temporal +
  13 graph integrity)
- `/lens/2020` returns 200, /lens/2021 returns 200
- `/api/year-signals?year=2020` returns 200
- Screenshot saved: `data/exports/screenshots/lens-2020.png`
  (617KB, real content)

## What this changes for the product

**Before:** the homepage asks "Explore the graph" or
"Pick a year." The user lands on raw lists.

**After:** the user picks a year, the app tells them
what the charts were saying, why it mattered, and
which events were happening. The graph is the
**secondary** surface; the lens is the **primary**.

This is what the external review meant by:
> "VerseSignal could have recurring lenses: War → grimness
> vs escape. Pandemic → isolation vs hope. Recession →
> scarcity vs flex. Protest → rage vs coded resistance."

The lens page is the surface that makes those
questions answerable.

## What's not yet done (next round)

Per decision 0019:

- **P1.2 signal_clusters** — co-occurrence groups
  (e.g., "loneliness + home + phone + night + touch" cluster)
- **P1.3 candidate_contexts** — LLM- or rule-derived
  candidate explanations
- **P1.4 cultural_posture** — reflection/shadow/escape/
  contradiction/processing/amplification/coincidence
- **P1.6 lens page evolution** — add the
  contradiction finder, the auto-generated full takeaway
  (multiple paragraphs), the "Songs that reflected"
  vs "Songs that escaped" split
- **P2.1 region-aware events** — add `countries_json`,
  `regions_json` to events; the globe becomes a
  cultural weather map
- **P2.2 tone-context correlation** — for each
  (event, signal) pair, compute baseline-vs-event delta
- **P2.3 lead/lag analysis** — `Lead Signal Rate`:
  % of (event, signal) pairs where the signal rose
  before the event
- **P3.1 data quality dashboard** — `/api/data-health`
  page
- **P3.2 timeline scrubber** — `?year=2020&month=3`
- **P3.3 historical analogue search** — current cluster
  resembles which past period?
- **P4.1 globe** — wait until P2.1 is in
- **P4.2 voice narration** — wire existing ElevenLabs MP3s
- **P5.1 inventory expansion** — top 50/100 per year,
  1960-2017 US chart-memory mode
- **P5.2 custom MusicNER** — fine-tune after annotation
  dataset is built
- **P0.4 naming drift** — README + docs already
  consistent with "VerseSignal" after the earlier
  reframe; no action needed

## Why this path

Per the external review:
> "The wow is when the user feels: 'Wait… I can actually
> see what society was emotionally processing through
> songs.'"

The Cultural Lens page delivers this for one year
right now. Scaling it to all years + adding the
posture classifier + region overlays is the path
to the full cultural seismograph.

Per motto_v3 0.13 (scope control), I did not try to
ship the full lens in one round. The first version
shows signals + events + auto-generated takeaway.
That's enough to test the discovery flow with real
users; the rest is incremental.

## Related

- `tests/test_graph_integrity.py` (13 tests, all pass)
- `lib/graph/ids.ts` (canonical ID helpers)
- `lib/types.ts:SourceApi` (extended union)
- `scripts/migrate-graph-ids.py` (idempotent migration)
- `scripts/build-year-signal-profiles.py` (signal aggregator)
- `app/lens/[year]/page.tsx` (the new primary surface)
- `app/api/year-signals/route.ts` (signals API)
- `docs/decisions/0019-open-work-product-correction.md`
  (the catalog this decision ships from)
- `docs/audit/0001-verseignal-11dim-audit.md` (will need
  re-verdict after the lens page is exercised)
