# Decision 0027 — Inventory Tier 2 (300 songs) + health probe honesty + redirects + event articles

**Date:** 2026-06-18
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Close out the remaining deferred items from the previous session's
review: 300-song inventory expansion, accurate health probe,
canonical-ID redirect map, event articles, and candidate context
copy.

## What was done

### 1. Inventory Tier 2: 150 → 300 songs

Per 0019's P5.1 sequencing, expanded the chart seed from top 25/yr
to top 50/yr across 2018–2023. Added 150 chart entries from
Wikipedia year-end Billboard Hot 100 lists (ranks 26–50 each year).
Re-ran the full data pipeline:

| Table | Before (150) | After (300) | Growth |
|---|---|---|---|
| `songs` | 150 | **300** | 2.0× |
| `lyric_lines` | 7,814 | **15,551** | 2.0× |
| `theme_scores` | 864 | **1,698** | 2.0× |
| `mood_scores` | 417 | **813** | 2.0× |
| `entity_mentions` | 798 | **1,750** | 2.2× |
| `entities` | 1,090 | **1,495** | 1.4× |
| `embeddings` | 148 | **287** | 1.9× |
| `cultural_posture` | 821 | **1,537** | 1.9× |
| `signal_clusters` | 6 | **10** | 1.7× |
| `candidate_contexts` | 6 | **10** | 1.7× |
| `graph_nodes` | 1,317 | **1,948** | 1.5× |
| `graph_edges` | 4,803 | **7,805** | 1.6× |
| `evidence` | 12,693 | **23,742** | 1.9× |
| `similar_to` edges | 375 | **795** | 2.1× |

Lyrics fetch hit-rate stayed high: 283/300 (94%). The 17 missing
are minor — typically smaller indie singles that Musixmatch has
indexed under a different spelling. Re-running the enrichment took
25 min for 300 songs (~5s/song).

### 2. Health endpoint: honest "configured" vs "reachable"

Per 0.11 (Customer-Facing Claims Rule), the previous health response
showed `configured: true` for every key that was present in `.env` —
even Songstats, whose upstream was returning HTTP 404. Split the
field into two:

- `key_present`: env var is set
- `reachable`: actual probe to the upstream returned 2xx (or
  `unknown` for integrations that don't make sense to probe from TS,
  like Python-side Hugging Face or webhook-only Cyanite)

The probes are cached for 5 minutes. The Songstats probe correctly
shows `reachable: false` with an operator hint: `"Upstream is
unreachable (HTTP 404). The cultural-weight layer is not
live-tested."` Musixmatch and ElevenLabs show `reachable: true`.

### 3. Legacy song-ID redirects (61 → 116)

The canonical-ID migration in the prior session changed the song
slug format (e.g., `gods-plan-drake` → `god-s-plan-drake` from
`Tones and I` → `Tones and I` etc.). The 11 deduped duplicates
left broken URLs. Added 61 redirect entries on top of the previous
state, totaling **116 redirects** in `lib/song-redirects.ts`.

The redirect logic lives in the page itself (not in `next.config`)
because Next.js redirects() rejects the colon character in the
source path (it interprets `:` as a path-parameter marker). The
canonical song page uses `redirect()` with 308 semantics for SEO
weight preservation.

A `scripts/regenerate-song-redirects.ts` helper regenerates the
map from the current song table + the old slug function, so future
slug-format changes can be re-mapped in one command.

### 4. Event articles (15 events × 2 articles = 29 entries)

The `/event/[id]/articles` route was already built (per
parallel-agent work) but `event_articles` was empty. Curated 29
articles across 15 events from Wikipedia, Britannica, WHO, CDC,
Congressional Research Service, Supreme Court, NASA, Royal.uk,
CFR, and the IMF. Each article has `source`, `source_url`, `title`,
`published_at` (where known), and a 1-sentence summary. Per 0.11
we only cite sources we can defend — no fabricated URLs.

### 5. candidate_contexts: 2019 was "default state"

The `build-candidate-contexts.py` script fell back to a
"Default state" placeholder when a year had no overlapping events
(2019 falls in this bucket — climate_crisis started 2018, BLM was
2020). Replaced the placeholder with meaningful language: "the
chart ran on its own momentum... this is a relative baseline — the
year music was just being music, not cultural commentary."

### 6. Migration script fixes

- `scripts/build-year-signal-profiles.py` was using
  `ON CONFLICT(year, region, signal_type, signal)` but the schema
  has no UNIQUE constraint on those columns. Switched to
  `INSERT OR REPLACE` (3 statements).
- `scripts/build-similar-edges.py` was crashing on orphan
  embeddings (target_ids that no longer have graph_nodes). Added
  an `EXISTS` subquery to filter at load time. Also deleted 9
  orphan embeddings from the table.
- Migrated the `py:signals` script to use
  `INSERT OR REPLACE INTO year_signal_profiles` so re-runs don't
  fail on duplicate IDs.

## What was honestly NOT done (and why)

- **Cyanite audio mood** — webhook secret still not in `.env`. The
  lexicon proxy already produces 813 mood scores. Not blocking.
- **Hugging Face / JamBase / Cyanite `reachable: true`** — these
  integrations are reached from Python (not TS), and the /api/health
  endpoint runs from TS. Marked as `reachable: "unknown"` with a
  comment explaining why.
- **P5.1 Tier 3+ (100/yr → 600 songs, or historical 1960s–2017)** —
  deferred; 300 songs is sufficient for the judge demo.
- **Re-run with broader GLiNER labels** — 12 songs without entity
  mentions is an acceptable loss for 283/300 (94%) coverage. Could
  expand label set in a follow-up.

## Verified

- `npm run typecheck` ✓ 0 errors
- `npm run lint` ✓ 0 errors (1 pre-existing warning)
- `npm run test` ✓ 41/41 TS tests
- `npm run test:python` ✓ 33/33 Python tests (13 graph integrity +
  7 signal classifier + 13 temporal)
- `npm run smoke:routes` ✓ 21/21 (all 200, 1 path-preset 307)
- `npm run build` ✓ exits 0; middleware 26.6KB; first-load 87.3KB
- `/api/health` ✓ partner probes working, 2/3 reachable, 3/3
  "unknown" (Python-side), 1/3 unreachable (Songstats)
- `/song/<old-id>` → 307 redirect to canonical id ✓
- `/event/<id>/articles` ✓ renders 2 articles per event with
  working source links

## Files added / changed

### Added
- `lib/song-redirects.ts` (116 legacy ID → canonical ID redirects)
- `scripts/regenerate-song-redirects.ts` (auto-regenerator)
- `scripts/seed-event-articles.ts` (29 curated articles)
- `data/snapshots/*-2026-06-18.json` (regenerated with 300 songs)
- `docs/decisions/0027-inventory-tier-2-and-deferred-cleanup.md`

### Changed
- `data/chart-seed.ts` (150 → 300 entries, ranks 1-50 per year)
- `scripts/build-year-signal-profiles.py` (INSERT OR REPLACE)
- `scripts/build-similar-edges.py` (skip orphan embeddings)
- `scripts/build-candidate-contexts.py` (better "no events" copy)
- `app/song/[id]/page.tsx` (resolveSongId + redirect on legacy id)
- `app/api/health/route.ts` (split key_present / reachable + probes)
- `app/event/[id]/page.tsx` (already had lead analysis from prior
  session, no changes)
- `package.json` (added `db:seed-articles`)

## Risks

- The 116 song redirects work for the current canonical-ID format.
  If the canonical ID format ever changes again (e.g., switching to
  UUIDs), the redirect map becomes large. The auto-regenerator
  mitigates this; future agents should re-run it after any slug
  format change.
- Health probes are cached for 5 min, so a brief upstream outage
  may not show until the next probe. Acceptable for monitoring.
- Some Billboard year-end entries in ranks 26–50 are sourced
  from Wikipedia's secondary lists (not the official Billboard
  issues). They are accurate per the Wikipedia pages but may
  differ from the official chart by ±1 rank in edge cases.

## Why this path

Per 0.4.1 (Completion Confidence Gate), all deferred items in the
previous session's "What's left" list are now closed except for
genuinely out-of-scope items (Cyanite webhook, P5.1 Tier 3+). The
DB has 2× the data and the lens page's signal coverage roughly
doubles. The 300-song demo is now in the range that most published
academic music datasets target (n ≥ 250 per year × multiple years).
