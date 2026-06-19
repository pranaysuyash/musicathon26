# Decision 0030 — Song-led event confirmation, truth-tier linker, era mosaic, semantic search

**Date:** 2026-06-19
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Three concrete trust-reality fixes:

1. **The song→event linker no longer accepts any shared-theme
   overlap as evidence.** It now requires at least 2 distinct event
   keywords to appear in the song's lyrics (whole-word match) before
   claiming an event connection.
2. **Bogus GLiNER entities are filtered at extraction time** via a
   stoplist (pronouns, articles, exclamations, generic nouns).
3. **The home page replaces 64 identical year tiles with a 5-era
   mosaic** that surfaces top mood / theme / entity / event count
   per era.
4. **A new `/api/semantic-search` endpoint exposes the stored
   sentence-transformer embeddings** so users can search by feel.

## Context

A user audit of the live product surfaced four credibility problems:

- `/event/covid_19` listed **222 songs** as "evidence" of COVID,
  including "34+35" (Ariana Grande), "Knife Talk" (Drake), and
  "Goosebumps" (Travis Scott). The "matched terms" shown to the user
  were common English words like `ai`, `ooh`, `city`, `street`, `mama`,
  `numb` — not actual COVID content.
- `/song/blinding-lights` claimed an event link to COVID vaccine
  rollout because the song contains `i'm`, `phone`, `ai` — three
  of the most common English words.
- The top entity list (ranked by mention count) started with `I` (271
  mentions), `you` (162), `she` (93), `He` (48), `ooh` (42) — GLiNER
  was tagging pronouns and exclamations as named entities.
- The home page rendered **64 year tiles** as a wall (`1960 1 songs
  in focus`, `1961 1 songs in focus`, …) — a catalog anti-pattern
  on a page that promises "song-led anomaly detection, candidate
  contexts, verification."

Per motto_v3 §0.11 (Customer-Facing Claims), every claim on a
user-facing surface must be backed by real evidence. The original
linker made claims the data could not support.

## What was done

### 1. Truth-tier linker (P0-2, P0-1)

- **`lib/nlp/stoplist.json` + `lib/nlp/stoplist.py`** — new
  stoplist of ~190 surface forms that GLiNER and spaCy mis-tag
  (pronouns, articles, exclamations, generic nouns, common
  adjectives, interjections, title words, number-words).
- **`scripts/enrich.py:run_ner`** — drops mentions whose surface
  form is in STOPWORDS, length < 3 chars, or all-numeric.
- **`scripts/enrich.py:link_song_to_event`** — new gate:
  - At least 2 distinct event keywords (whole-word match) appear
    in the song's lyrics.
  - Matched terms shown as evidence are the actual keywords found,
    not theme-overlap vocabulary.
  - Composite weight: 0.6 × keyword-count + 0.25 × theme + 0.15 ×
    embedding similarity × temporal scope.
- **`scripts/migrate-clean-bogus-entities.py`** — drops 965
  existing bogus entity mentions, prunes 281 graph edges whose
  matched_terms were entirely bogus, removes 1498 partial-match
  bogus terms from edges, drops 776 supporting evidence rows, and
  prunes 95 orphan entity rows.
- **`scripts/migrate-expand-event-keywords.py`** — adds 117
  lyric-friendly keywords across all 15 events (e.g., COVID
  gains `stuck`, `alone`, `pandemic`, `essential`, `frontline`,
  `remote`, `wfh`, `brave`).
- **`scripts/migrate-relink-songs-to-events.py`** — clears 154
  legacy song-event edges (NULL inference_type from a prior
  schema) and 7,840 noisy `theme_overlap` / `emotional_shadow` /
  `emotional_alignment` edges, then re-links with the tightened
  gate.
- **`scripts/migrate-clean-orphan-cultural-posture.py`** — drops
  1,942 orphan cultural_posture rows whose song-event pair no
  longer has a graph edge. The data-health "Cultural posture
  classifications" target stays at 700+ but the actual count
  drops from 1,948 (inflated) to 7 (honest) — the gap between
  claim and reality closes.

Result:
- COVID-19 page: **222 → 4 songs** with real evidence (Migos'
  "Straightenin" literally says "Turn a pandemic into a bandemic").
- Cultural posture matches: **1,948 → 7** (the data-health claim
  of 278% no longer overstates).
- Blinding Lights: no longer falsely linked to any event.

### 2. Homepage era mosaic (P1-1)

- **`lib/db/queries.ts:getEraOverview`** — new function that
  aggregates songs, events, top mood, top theme, top entity, and
  evidence density per chart era.
- **`app/page.tsx`** — the "Year runway" section (64 year tiles)
  is replaced with a "Era mosaic" section (5 era cards: 1960–79
  broadcast, 1980–99 MTV, 2000–11 digital, 2012–19 streaming,
  2020–23 global). Each card shows songs, events, top mood, top
  theme, top entity, comparability rating.

### 3. Semantic search (P1-2)

- **`scripts/embed-query.py`** — Python bridge to the same
  sentence-transformers model used at ingest. Reads a query,
  prints a base64-encoded L2-normalized 384-dim float32 vector.
- **`app/api/semantic-search/route.ts`** — Node endpoint that
  invokes the bridge, then ranks every stored song embedding by
  cosine similarity. Sub-100ms for the 415-song demo corpus.
- **`lib/math/vector.ts`** — shared cosine helper.
- **`components/graph/semantic-search-panel.tsx`** — UI panel
  on the `/ask` page with a search box, 5 preset queries, and
  ranked results with similarity scores.
- **Wired into `app/ask/page.tsx`** — sits above the existing
  PathPanel so the user has two complementary tools: semantic
  search (find songs by feel) and path finding (resolve two
  named nodes).

### 4. Misc cleanups

- **TDZ fix** in `components/graph/path-panel.tsx` —
  `runAsk` was referenced in a `useEffect` before its
  `useCallback` declaration. Wrapped in a `queueMicrotask` and
  removed the early useEffect's `runAsk` dependency. (The dev
  log shows the fix as line ~161.)
- **Vitest `testTimeout` bumped** from 5s → 30s so the
  semantic-search cold start (Python model load ~7s) doesn't
  flake the smoke test.

## Test results

- TS: **58/58** ✓ (was 55; +1 era-mosaic page-content test, +1
  semantic-search smoke test, +1 fixed Blinding Lights test)
- Python: **36/36** ✓ (signal classifier test updated to assert
  honest count > 0 instead of the inflated > 100)

## Trust metrics after

| Metric | Before | After |
|---|---|---|
| Entity mentions | 3,069 | 2,104 |
| Bogus GLiNER mentions (I/you/He/baby/ooh/oh/…) | 965 | 0 |
| Graph edges | 11,499 | 9,290 |
| COVID-19 song evidence | 222 | 4 (real lyrics) |
| Cultural posture rows | 1,948 | 7 (all with graph edges) |
| Year tiles on home page | 64 | 5 (eras) |
| Semantic search endpoints | 0 | 1 |

## Honest product copy

- Event pages now show "moderate — directionally consistent"
  instead of "very high — strong evidence" for honest
  connections.
- The home page no longer claims "you can see how chart music
  related to 8 events" with no actual data — the era mosaic
  surfaces real, per-era event coverage.
- The `/ask` page now offers both semantic search (find songs
  by feel) and path finding (resolve two named nodes), with
  semantic-search ranking backed by the same embeddings the
  graph uses internally.

## What's left

- Cultural-posture counts are now honest but low (7 for the
  current 411-song demo corpus). The data-health page claims
  "target: 700+". The target should be revised downward to
  reflect the tightened linker (~30 expected for a full
  curated 411-song run), or more event keywords should be
  added. Decision deferred — the *honesty* of the count is
  more important than the count itself.
- Semantic search requires the Python embedder; the first
  call after server boot takes ~7s (model load). Pre-warming
  is out of scope until deployment.
- Path-finder caching is still 30s — fine for the demo, worth
  revisiting at scale.
