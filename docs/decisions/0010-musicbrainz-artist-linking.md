# Decision 0010 — MusicBrainz artist linking (P8.3)

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Artist-typed entities (`entity_type IN ('artist', 'musician',
'band')`) are linked to MusicBrainz IDs (MBIDs) via the
public MusicBrainz API. The `entities.musicbrainz_id` column
already exists; we just populate it.

The lookup is a one-shot offline operation in
`scripts/enrich-musicbrainz.py`. It is **idempotent** (re-runs
skip already-linked entities) and **rate-limited** (1
request/second for unauthenticated use).

## Context

GLiNER detects "Drake", "Billie Jean", "Bob Marley" etc. as
artist mentions. But the graph can't yet link these to a
canonical external identifier. MusicBrainz is the canonical
open-source music metadata project; an MBID is the
machine-readable link.

Linking makes the graph queryable from outside ("show me
songs in our DB that mention artist X with MBID Y") and
opens the door to cross-corpus joins (e.g., "which of
MusicBrainz's chart-topping artists do we have lyrics for?").

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| No linking | Zero work | Can't cross-corpus | Rejected |
| Manual linking | High quality | Doesn't scale; doesn't help new artists | Rejected |
| Auto-link via MusicBrainz search (chosen) | First-principles; covers all known artists; reproducible | Subject to API rate limits; disambiguation is imperfect | **Chosen** |
| LLM-based linking | High quality; handles context | Cost; not reproducible; no validation | Rejected |

## Chosen path

`scripts/enrich-musicbrainz.py`:

- Iterates all artist-typed entities with `musicbrainz_id IS NULL`
- For each name, calls MusicBrainz `artist` search with
  `query=<name>&limit=5`
- **Disambiguation**:
  - Pick the highest-scoring result that has an exact
    case-insensitive name match against the input
  - If no exact name match, check the result's `aliases`
    array for a match
  - If entity name contains a type hint (e.g., "Band",
    "Group"), pick the highest-scoring result of that
    type
  - Otherwise: **skip** (no false positives)
- Records in `entities` table:
  - `musicbrainz_id` = the MBID (e.g., `9fff2f8a-21e6-47de-...`)
  - `musicbrainz_artist_type` = "Person" / "Group" / etc.
  - `metadata_json.mb_lookup` = score + disambiguation path

Rate limiting: 1 second between requests (MusicBrainz
unauthenticated limit). For 36 candidates this takes ~40s.

## Why this path

- **Per 0.7 (AI output boundary):** we verify against the
  actual MusicBrainz API, not against an LLM's belief.
- **Per 0.11 (customer-facing claims):** we don't promise
  "100% artist linking"; we surface the actual coverage.
- **Per 0.10 (observability):** the lookup is logged (score,
  disambiguation method, type) so a future agent can audit.

## Tradeoffs

- **Rate limit.** 1 req/sec means 36 artists = ~40s. For the
  150-song demo spine, total artist entities are bounded
  (GLiNER finds ~5-10 artist mentions per song on average),
  so the total is in the low hundreds at most.
- **Disambiguation is heuristic.** "Bryson" matched
  "Bryson Tiller" via the alias array, which is correct
  but fragile. For ambiguous names (e.g., "Drake" the
  rapper vs. "Drake" the bell-pattern), the highest-scoring
  result may not be the right one.
- **Missed names.** Names that don't exist in MusicBrainz
  (local artists, fictional, slang) are correctly skipped.
  The current run: 15/36 matched, 21/36 skipped.

## Risks

- **Wrong link.** If the disambiguation picks the wrong
  artist, the entity is permanently linked to the wrong
  MBID. Per 0.7, the exact-name-match rule minimizes this.
  Per 0.10, the score + disambiguation method is recorded
  so a future agent can find and correct any wrong links.
- **MusicBrainz schema drift.** The API is stable but
  fields like `aliases` could change shape. Currently
  defensive: if `aliases` is missing, fall back to name
  match only.
- **Rate limit on production use.** If we ever run this
  in a live request path, 1 req/sec is too slow. The
  current design is offline-only.

## Validation plan

- [x] End-to-end smoke test: 3 entities, 3/3 matched
      correctly (Billie Jean, Bob Marley, Bryson)
- [x] Full run: 36 candidates, 15 matched, 21 skipped, 0
      errors. Verified output via SQL.
- [ ] Visual audit: spot-check 5 of the 15 matches against
      MusicBrainz manually (e.g., is "Drake" → correct MBID?)

## What would cause this decision to be revisited

- Mass-ambiguous names start causing wrong links (would
  surface as a graph-quality bug)
- MusicBrainz rate limits drop below 1 req/sec (would
  require authentication or caching)
- A new external authority becomes canonical (e.g.,
  Spotify's artist graph)

## Related

- `scripts/enrich-musicbrainz.py` (the linker)
- `lib/types.ts` (entity types)
- `scripts/schema.sql:entities` (musicbrainz_id column)
- `docs/decisions/0009-jambase-trial-key-blocked.md`
  (sister story: same data-layer pattern, blocked)
- motto_v3 §0.7, §0.10, §0.11
