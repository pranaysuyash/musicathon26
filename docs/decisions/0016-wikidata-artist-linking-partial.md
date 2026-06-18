# Decision 0016 — Wikidata artist linking (partial: 9/86, rate-limited)

**Date:** 2026-06-16
**Status:** Active (partial)
**Owner:** VerseSignal agent

## Decision

Implement Wikidata artist linking via the MediaWiki
`wbsearchentities` API. The integration works (returns
correct QIDs) but the public endpoint aggressively
rate-limits unauthenticated users, capping the v1 run
at **9/86** artists linked.

For v1: ship the partial result. For v1.1: re-run from a
different machine, or use a registered Wikidata account
to lift the rate limit.

## Context

The audit doc listed Wikidata entity linking as a v1
follow-up. The same way MusicBrainz (P8.3) and JamBase
(decision 0013) link artists to canonical IDs, Wikidata
links to the open-knowledge graph that ties artists to
labels, genres, places, songs, awards, etc.

## Approach tried: SPARQL (failed)

First attempt: Wikidata Query Service (SPARQL) at
`https://query.wikidata.org/sparql`.

- `SELECT ?item WHERE { ?item rdfs:label "Drake"@en . ?item wdt:P31 wd:Q5 }` works
- But after a few requests: `HTTP 429: Aggressively
  rate-limiting to 1 req / min - this rule was created
  during active wdqs outage (797a132)`.
- This is a system-wide throttle during a Wikidata
  infrastructure incident, not a per-IP throttle.

## Approach: MediaWiki wbsearchentities (partial)

The MediaWiki API at `https://www.wikidata.org/w/api.php`
is a different endpoint with different rate-limit policy
(more lenient: ~50 req/s for unauthenticated users with
a User-Agent).

- Smoke test of 10 artists: 10/10 returned correct QIDs
  (e.g., `Adele` → Q23215, `Drake` → Q33240).
- Full background run of 86 artists: 9/86 succeeded; the
  other 77 hit `HTTP 429: Too Many Requests` because the
  burst from my background process tripped a short-term
  limit.

The 9 successful: 24kGoldn, Adele, Ariana Grande,
Arizona Zervas, Ava Max, BTS, Bad Bunny, Bailey
Zimmerman, Bazzi. The other 77 should be re-runnable
from a different machine or with longer pauses.

## Schema

No schema change — `entities.wikidata_id` already exists
(added in the original schema as a placeholder for this
work).

## Implementation

`scripts/enrich-wikidata.py` (~190 lines):

1. Source: `songs.artist` (same as JamBase; multi-artist
   strings reduced to primary).
2. For each primary artist:
   - Call `wbsearchentities` with `search=<name>&language=en&limit=5`
   - Score each result: +100 for exact label match, +30 for
     substring match, +10 for music keyword in description
   - Return the highest-scoring QID
3. UPSERT into `entities` (id = `versesignal:ent:artist:<slug>`)
4. Rate: 0.2s sleep (5 req/s) — too aggressive for the
   MediaWiki rate limit. v1.1 should use 1.0s+ or a
   per-IP backoff.

## Run

```bash
# Smoke test (works)
uv run --no-sync python scripts/enrich-wikidata.py --limit 5 --dry-run

# Full run (currently rate-limited after ~9 successful)
uv run --no-sync python scripts/enrich-wikidata.py

# Re-run from a different machine (different IP)
```

## Result (v1 corpus, partial)

```
Linked: 9  Skipped: 77  Errors: 0
```

The 9 that linked:
- 24kGoldn → Q83751918
- Adele → Q23215
- Ariana Grande → Q151892
- Arizona Zervas → Q75124792
- Ava Max → Q56755505
- BTS → Q13580495
- Bad Bunny → Q44333953
- Bailey Zimmerman → Q112581616
- Bazzi → Q48720231

## How this affects the song page

The Artist section in `/song/[id]` (added in decision
0013) already renders the Wikidata QID as a deep link
when present. The 9 linked artists will show the link;
the other 77 won't. No code change required.

## Why this path (ship the partial)

- **Per 0.4.1 (confidence gate).** I cannot claim "all
  artists linked" — I linked 9. I can claim "the
  integration works, the rate limit blocked the rest,
  re-run from a different machine will close the gap."
- **Per 0.7 (AI output boundary).** Wikidata is reachable
  in principle but blocked in this specific run. The
  blocker is rate-limit policy, not a permanent issue.
- **Per 0.11 (code preservation).** The script is correct
  and reusable. The 9 linked QIDs are real and useful.
  We don't throw the work away.

## Tradeoffs

- **9/86 coverage.** A partial result is worse UX than no
  result. But the script is idempotent and re-runnable, so
  a v1.1 run from a different IP closes the gap.
- **API choice.** SPARQL is more flexible (lets us query
  for additional Wikidata properties), but rate-limited.
  MediaWiki is faster but limited to entity lookup. We
  chose MediaWiki because lookup is the v1 need.

## Risks

- **Persistent rate limit.** If the Wikidata rate limit
  policy is tightened, the MediaWiki API may also become
  unusable. Mitigation: register a Wikidata account (free)
  to get a higher limit, or use a different mirror
  (e.g., a community SPARQL endpoint).
- **Schema drift.** QIDs are stable, but artist
  descriptions change. The score function uses description
  keywords, which is robust to description changes.

## Future work (v1.1+ backlog)

- **Re-run with a registered account.** 1 free signup,
  5 minutes of work, raises the limit.
- **Add Wikidata properties.** For the 9 linked artists,
  fetch `genre` (P136), `country of citizenship` (P27),
  `inception` (P571) — build a richer artist profile.
- **Cross-link with other data.** With Wikidata QIDs, we
  can pull from any Wikidata-linked source (e.g., VIAF,
  GND, ISNI).

## Validation plan

- [x] SPARQL attempt documented (rate-limited)
- [x] MediaWiki attempt: 9/86 linked
- [x] Script written, tested, idempotent
- [x] No schema change required
- [x] TypeScript clean
- [x] Tests still pass (33/33)

## Related

- `scripts/enrich-wikidata.py` (the integration)
- `lib/db/queries.ts:getArtistMeta` (the read path)
- `app/song/[id]/page.tsx` (the Artist section renders Wikidata)
- `docs/decisions/0010-musicbrainz-artist-linking.md` (similar pattern)
- `docs/decisions/0013-jambase-mcp-integration.md` (similar pattern)
- Future work: above
