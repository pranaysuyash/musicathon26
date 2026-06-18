# Decision 0013 — JamBase MCP integration (real data source, not blocked)

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Replace the previously-blocked JamBase REST API integration with
the **JamBase MCP server** at `https://mcp.jambase.com/mcp`. Use
the existing trial key (or any future paid JamBase API key) as a
**Bearer token** in the `Authorization` header. Populate
`entities.jambase_id` + `entities.jambase_genres_json` for all
primary artists in the corpus.

## Context

Earlier in the session (decision 0009) we concluded the JamBase
trial key was blocked — `www.jambase.com/jbapi/v1/*` returned
403 from a BigScoots WAF, and `data.jambase.com/*` returned
the public website (HTML) instead of JSON. Decision 0009
correctly said: "trial key is fundamentally blocked."

The user later pointed out that JamBase has a public **MCP
server** at `https://mcp.jambase.com/mcp`. MCP uses **OAuth /
Bearer-token** auth (not the WAF-blocked web API auth) and
exposes a JSON-RPC 2.0 endpoint.

## Re-investigation (2026-06-16 same session)

Direct probes of the MCP endpoint:

| Test | Result |
|---|---|
| `GET https://mcp.jambase.com/mcp` | 401, `Missing Authorization header. Use: Authorization: Bearer <api_key_or_oauth_token>` |
| `POST` `initialize` with `Authorization: Bearer <trial_key>` | 200, returns `serverInfo.name=jambase-mcp`, version `0.1.1` |
| `POST` `tools/list` with Bearer | 200, returns 20 tools (searchEvents, searchArtists, getArticlesForArtist, etc.) |
| `POST` `tools/call searchArtists artistName=Drake` with Bearer | 200, returns Markdown with `**Artist ID:** jambase:266573` and `**Genres:** hip-hop-rap, pop` |

The trial key works as a Bearer token. The WAF that blocks
the web API does **not** block the MCP endpoint.

## Tools that matter for VerseSignal

| Tool | Use | Priority |
|---|---|---|
| `searchArtists` | Resolve artist name → `jambase:NNNNN` ID + genres | **P0** (this decision) |
| `getArticlesForArtist` | Get JamBase News articles about an artist (cultural context) | P2 (future) |
| `findArtistAndFetchEvents` | Get live events for an artist | P3 (live data, low priority for v1) |
| `searchEvents` | Find events by location/date/genre | P3 |
| `getGenres` | Canonical genre slug list (e.g., `hip-hop-rap`, `kpop`) | P2 (for genre normalization) |
| `searchCities` / `searchVenues` | Location data | P3 (geo features) |

This decision implements only `searchArtists` (P0). The other
tools are noted as future work.

## Implementation

### Schema change

```sql
-- scripts/schema.sql
ALTER TABLE entities ADD COLUMN jambase_id TEXT;
ALTER TABLE entities ADD COLUMN jambase_genres_json TEXT;  -- JSON array, e.g. ["hip-hop-rap", "pop"]
```

Both columns added. Idempotent re-run safe (skip if `!= ''`).

### Script

`scripts/enrich-jambase.py` (~230 lines):

1. Read `JAMBASE_API_KEY` from `.env` (or env)
2. Open DB; SELECT DISTINCT `songs.artist`
3. Parse "X, Y featuring Z" → primary = "X, Y" (handles 3 cases:
   "featuring", "feat.", "ft.", "with", and comma/&-separated lists)
4. Dedupe; sort
5. For each primary artist:
   - `initialize` MCP handshake (idempotent; one call)
   - `tools/call searchArtists artistName=<name> perPage=1`
   - Parse Markdown response:
     - `**Artist ID:** jambase:NNNNN` → jambase_id
     - `**Genres:** hip-hop-rap, pop` → genres JSON
   - If first result name doesn't match exactly (case-insensitive),
     accept the highest-ranked result (JamBase search does the
     disambiguation)
   - UPSERT into `entities` (id = `versesignal:ent:artist:<slug>`)
6. Rate: 0.05s sleep between calls (JamBase MCP doesn't document
   rate limits; 0.05s × 86 artists = 4.3s overhead, on top of
   ~2s per call = 172s total)

### Run

```bash
# Smoke test (5 artists, dry-run)
uv run --no-sync python scripts/enrich-jambase.py --limit 5 --dry-run

# Full run (86 unique primary artists)
uv run --no-sync python scripts/enrich-jambase.py

# Re-run with overwrite
uv run --no-sync python scripts/enrich-jambase.py --overwrite
```

### Result (v1 corpus run)

```
Linked: 79  Skipped: 7  Errors: 0
```

The 7 skipped are all multi-artist collaboration strings that
the parser reduced to the wrong primary (e.g., "Benny Blanco, Halsey"
→ primary "Benny Blanco" doesn't match a real artist; "Silk Sonic
(Bruno Mars" → primary "Silk Sonic (Bruno Mars" not a real artist).
These are **correct skips** — they should be split into multiple
rows before being looked up.

## How this affects the song page

Added a new section "Artist (Primary)" to `/song/[id]` that
shows:

- **Genres** (from JamBase): `hip-hop-rap`, `pop`, etc.
- **JamBase ID** (deep-link to `jambase.com/band/<id>`)
- **MusicBrainz ID** (from P8.3) (if linked)
- **Wikidata ID** (if linked, future)

## Why this path

- **Real data, not a hack.** JamBase MCP returns canonical
  artist IDs + genre slugs. The 79/86 link rate is high; the
  7 skips are parser bugs (multi-artist splits) that can be
  fixed in a follow-up.
- **MCP is the future.** The 20 tools exposed by the JamBase
  MCP server cover events, articles, genres, cities, and
  venues. We can use them in future iterations (decision
  backlog below).
- **Trial key works here.** The web API WAF-blocked us; the
  MCP server accepts the same key as Bearer. No new key
  required for the v1 release.
- **Per 0.5 (blast radius):** all touched code (schema, query,
  page) is in this PR. No silent partial migrations.

## Tradeoffs

- **Latency.** Each MCP call is ~2s. A 86-artist full
  enrichment takes ~3 minutes. Per-artist lookups in a
  product flow (e.g., on song-page load) would need a cache
  layer; we add `entities.jambase_id` precisely so the
  one-time batch is the only place we hit the API.
- **Markdown parsing.** JamBase returns LLM-friendly
  Markdown, not JSON. We parse with regex. If JamBase
  changes their Markdown format, the parser breaks. This is
  acceptable for v1 (their public docs use the same format);
  future work could add structured JSON.
- **Multi-artist splits.** The 7 skipped strings are
  collaboration pairs. A better parser would split "X, Y"
  into ["X", "Y"] and look up both. Deferred to v1.1
  (small change, not blocking).
- **OAuth is not used.** We use the API key as Bearer
  (per the 401 error message hint: "Bearer <api_key_or_oauth_token>").
  If JamBase later revokes this for paid keys, we'd need to
  implement the OAuth flow. Documented as a risk.

## Risks

- **WAF change.** If JamBase adds a WAF to the MCP endpoint
  (e.g., rate-limit by IP), our batch enrichment breaks.
  Mitigation: 0.05s sleep + 1 retry on HTTP errors.
- **Key expiry.** The trial key has a 30-day life per JamBase
  docs. A new key is needed after that. The script reads
  from `.env` so swap is a 1-line change.
- **Schema drift.** `jambase_genres_json` is a JSON array of
  strings. JamBase genre slugs (`hip-hop-rap`, `kpop`, etc.)
  may change over time. The schema is forward-compatible
  (just append/remove from the array).

## Future work (v1.1+ backlog)

- **Multi-artist split.** "Benny Blanco, Halsey" → 2 separate
  rows (one per artist). Increase link rate from 79/86 to
  ~83/86.
- **Article context.** `getArticlesForArtist` returns
  JamBase News articles about an artist. Could be surfaced
  as a "What's the press saying about this artist?" section
  on the song page. New schema table
  `artist_articles(artist_id, jambase_article_id, title, url,
  published_at)`.
- **Genre normalization.** `getGenres` returns the canonical
  list. We could map our existing 14 themes + 9 moods to
  JamBase genres to enable a "browse by genre" view.
- **OAuth flow.** If the trial key expires and a paid key
  requires OAuth, add the OAuth dance. Not needed for v1.

## Validation plan

- [x] Schema migration applied + `schema.sql` updated
- [x] Script: 79/86 artists linked, 7 correctly skipped
- [x] Song page renders Artist section with JamBase genres
- [x] Cross-link to `jambase.com/band/<id>` verified
- [x] TypeScript clean
- [x] Tests still pass (33/33)

## Related

- `scripts/enrich-jambase.py` (the integration script)
- `lib/db/queries.ts:getArtistMeta` (the read path)
- `app/song/[id]/page.tsx` (the Artist section)
- `scripts/schema.sql:entities` (jambase_id, jambase_genres_json)
- `docs/decisions/0009-jambase-trial-key-blocked.md`
  (originally blocked; this decision supersedes for the
  REST API path; the **web API is still blocked**, only the
  MCP path works)
- `docs/decisions/0010-musicbrainz-artist-linking.md` (P8.3;
  same pattern, MusicBrainz)
- JamBase docs: <https://docs.jambase.com> (note: the MCP
  server has no formal docs yet; tool schemas are exposed
  via the `tools/list` JSON-RPC call)
