# Decision 0032 — UX polish pass: dedup, normalized scores, honest empty states

**Date:** 2026-06-19
**Status:** Active
**Owner:** VerseSignal agent

## Decision

A second-pass audit caught several smaller UX/data-quality issues
that didn't rise to the P0 trust-reality level of Decision 0030/0031
but matter for the user-facing surface:

1. **Artist catalog duplicates** — `getArtistSongs` used
   `LOWER(artist) = ? OR LIKE ?` which double-counted songs when
   the artist name contained the pattern. Fixed via
   `GROUP BY (title, year)` so Drake's 8 chart entries in 2018
   appear once, not as duplicates.

2. **Similar songs duplicates** — `getSimilarSongs` returned
   duplicates because each chart entry (US 2020:01, UK-2020:01,
   DE-2020:01) had its own similar_to edge to the same target.
   Fixed via `GROUP BY (title, year)` + `MIN(other.id)`.

3. **Lens page representative songs dedup** — The brief
   generator picked Careless Whisper three times for 1985 because
   it was the only song in the corpus. Fixed at three layers:
   - `lib/db/queries.ts:getCulturalSignalBrief` — dedup
     `topMoods/topThemes/topEntities.evidenceSongIds` with
     `Array.from(new Set(...))` before slice.
   - `app/lens/[year]/page.tsx` — Map-based dedup on
     `(year, title)` for the page-level representative songs.

4. **Year scrub page "Top themes" was always empty** —
   `getYearSignals` sorted by raw score DESC, but mood scores
   are 0-25 while theme/entity scores are 0-1. A top-15 sort
   returned only moods and entities, never themes. Fixed:
   ORDER BY signal_type, song_count DESC, then slice top N per
   type independently. song_count is comparable across types.

5. **Year signal orphan cleanup** — 146 `year_signal_profiles`
   rows referenced entities that no longer existed in the
   `entities` table (e.g. pronouns "I", "you", "she" that
   survived from before the stoplist fix). Deleted.

6. **Theme cloud raw scores → percentages** — was showing
   `Migration 0.5` while the lens page shows `Identity 58%`.
   Normalized to `(item.avgScore * 100).toFixed(0)}%` for
   consistency across surfaces.

7. **Mood score units clarification** — was showing `energetic
   91.48` (raw per-1000-tokens score). Now shows `91.5/100`
   with a confidence bar normalized to /100 so the bar
   visualization is accurate (was always full because the divisor
   was 10 instead of 100).

8. **Evidence-demo honesty** — The static test page hardcoded
   "Blinding Lights → COVID-19" as the demo edge, which no longer
   exists after Decision 0030 tightened the linker. Replaced
   with "Straightenin (Migos) → COVID-19" — a real
   keyword-anchored edge supported by the lyric
   "Turn a pandemic into a bandemic".

9. **Event-page empty state** — When no songs link to an event
   (the common case for events the chart corpus doesn't reference
   by name like Ukraine, BLM, AI Boom), the page used to say
   "No songs linked yet. Run npm run py:enrich" — which is
   misleading because re-running enrich won't find new links.
   New copy explains why and points users at the pre-event signal
   resonance data that DOES exist.

10. **Stale-cache fix on dev server** — `.next` cache from
    previous parallel-agent work caused 500s on /homepage.
    Fixed by adding `rm -rf .next` to dev restart steps.

## Files touched

- `lib/db/queries.ts` — `getArtistSongs`, `getArtistThemeSignals`,
  `getArtistEventLinks`, `getSimilarSongs`, `getYearSignals`,
  `getEraOverview`, `getCulturalSignalBrief`
- `components/lens/theme-cloud.tsx` — percentage display
- `app/year/[year]/page.tsx` — mood score display
- `app/lens/[year]/page.tsx` — representative song dedup
- `app/event/[id]/page.tsx` — empty state copy
- `app/evidence-demo/page.tsx` — Straightenin demo
- `scripts/enrich.py` — column order fix, statement count fix
- `scripts/migrate-clean-bogus-entities.py` — stoplist cleanup
- `scripts/migrate-clean-stale-gazetteer.py` — re-validate gazetteer
- `scripts/migrate-expand-event-keywords.py` — lyric-friendly syns
- `scripts/migrate-relink-songs-to-events.py` — re-link with gate
- `scripts/embed-query.py` — Python bridge for /api/semantic-search
- `lib/nlp/stoplist.json` + `lib/nlp/stoplist.py` — entity stoplist
- `lib/nlp/embedder.ts`, `lib/math/vector.ts` — semantic search
- `app/api/semantic-search/route.ts` — cosine-ranked search
- `components/graph/semantic-search-panel.tsx` — UI panel
- `tests/page-content.test.ts`, `tests/smoke-routes.test.ts`,
  `tests/test_graph_integrity.py`, `tests/test_signal_classifiers.py`

## Test results

- TS: **61/61** (was 55)
- Python: **36/36** (was 36)
- All 12 user-facing routes return 200
- All homepage sections (Routes 01–04, Era mosaic, Candidate
  contexts, Why this is different, Method layer, Guided route)
  render correctly

## Trust metrics after

| Metric | Before 0030 | After 0032 |
|---|---|---|
| Careless Whisper entities (bogus) | 4 | 0 |
| COVID-19 song links | 222 | 4 (real) |
| Blinding Lights → COVID vaccine | false-positive | no event links |
| Artist catalog duplicates | 14 → 8 (Drake) | each song appears once |
| Lens brief duplicates | 3x same song | each song appears once |
| Scrub "Top themes" empty | always | real themes per year |
| Year signals orphan rows | 146 | 0 |
| `I`, `you`, `she` as entities | 271, 162, 93 mentions | 0 mentions |
| All routes 200 | partial | all 12 |
| Tests pass | 91 | 97 |
