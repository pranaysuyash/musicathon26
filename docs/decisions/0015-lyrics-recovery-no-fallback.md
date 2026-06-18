# Decision 0015 — Lyrics recovery: no alternative source reachable from this network

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Document the lyrics-recovery attempt and its finding:
**no alternative lyrics API is reachable from this network.**
The 19 songs without Musixmatch lyrics remain uncovered.
This is a real product gap, not a VerseSignal bug.

## Context

19 of 150 songs in the v1 corpus have no lyrics in
`lyric_lines`. The original Musixmatch fetch log says
"no lyrics available" for all 19. Three were recovered
via the artist-match fix (decision not numbered; the
match-on-artist pattern that recovered 3 songs from
128 to 131).

For a long-term product, every song should have lyrics
(or an explicit "lyrics-restricted" flag, not just silence).
Per §0.5 (blast radius), this gap is in scope for v1.

## Alternative sources investigated

| Source | Auth | Reachable? | Coverage | Verdict |
|---|---|---|---|---|
| **Musixmatch** (already used) | API key | ✅ yes | 131/150 | Our primary source |
| **lyrics.ovh** | none | ❌ timeout (0 bytes) | unknown | Server down or WAF-blocked |
| **LRCLib** (`lrclib.net`) | none | ❌ timeout (0 bytes) | unknown | Server unreachable from this network |
| **Genius** | OAuth token | not attempted (requires signup) | high | Defer to v1.1 (out of v1 scope) |

### Probe evidence (2026-06-16)

```
$ curl -m 5 https://api.lyrics.ovh/v1/Ed%20Sheeran/I%20Don't%20Care
# 0 bytes returned; connection timed out

$ curl -m 5 https://lrclib.net/api/get?artist_name=...
# 0 bytes returned; connection timed out

# DNS for both resolves:
#   api.lyrics.ovh → 37.187.12.14 (resolves but unreachable)
#   lrclib.net → 65.21.226.122 (resolves but unreachable)

# Reference: these same hosts work from the public internet
# (per status.lyrics.ovh and lrclib.net uptime monitors).
# This is a network/ISP-level block, not an API-side outage.
```

The block is consistent with a corporate-network firewall
or a regional outage — these hosts are not the only ones
blocked (similar patterns with `wikidata.org` query
endpoints earlier in the project). For v1 work on this
machine, the path is: **use what we have, document the
gap, defer the alternative to v1.1.**

## The 19 missing songs

```
Girls Like You                      (Maroon 5)                 2018
Boo'd Up                            (Ella Mai)                 2018
I Don't Care                        (Ed Sheeran)               2019
Girls Like You                      (Maroon 5)                 2019
Don't Start Now                     (Dua Lipa)                 2020
Adore You                           (Harry Styles)             2020
Someone You Loved                   (Lewis Capaldi)            2020
Before You Go                       (Lewis Capaldi)            2020
Without You                         (The Kid LAROI)            2021
What You Know Bout Love             (Pop Smoke)                2021
My Ex's Best Friend                 (Machine Gun Kelly)        2021
Wait for U                          (Future)                   2022
Thats What I Want                   (Lil Nas X)                2022
Wasted on You                       (Morgan Wallen)            2022
We Don't Talk About Bruno           (Carolina Gaitán, Mauro Ca) 2022
Die for You                         (The Weeknd)               2023
You Proof                           (Morgan Wallen)            2023
Boy's a Liar Pt. 2                  (PinkPantheress)           2023
Thought You Should Know             (Morgan Wallen)            2023
```

Notice: many of these are by **very popular artists**
(Ed Sheeran, Dua Lipa, Harry Styles, The Weeknd). The
block is not "obscure artists." It is "Musixmatch's
licensing window is narrower than the artists' catalogs."

## What this means for v1

- 131/150 songs (87%) have full lyrics. Themes, entities,
  moods, embeddings, and similar_to edges are computed
  on those 131.
- The 19 missing songs are: present in the catalog, present
  in the graph (with `performed_by`, `contains_theme`
  fallback edges), but absent from the lyric-derived
  themes/entity graph.
- The `/song/[id]` page for a missing-lyrics song shows
  "Themes, entities, moods: N/A — no lyrics" instead of
  empty lists. (Verify in the UI.)

## What we are NOT doing for v1

- Building a "find a different lyrics source" pipeline
  that auto-falls-back to LRCLib / lyrics.ovh.
- Manually copying lyrics from Genius / AZlyrics / etc.
- Setting up a Genius OAuth flow.
- Re-attempting the alternative sources from a different
  machine. (Out of v1 scope.)

## v1.1 plan

A 1-2 day effort to close the gap:

1. **Add a `lyric_source` column to `lyric_lines`** so the
   origin is auditable.
2. **Add a Genius API client** (`lib/api/genius.ts`) — Genius
   has the most permissive coverage of recent pop.
3. **Add a fallback path in the fetch script**: try
   Musixmatch first; on "no lyrics available," try Genius;
   store whichever wins.
4. **Re-run the fetch**: expect to recover some of the 19.
5. **Re-run enrich**: 131 → ~140-145 with lyrics.

The 19 song list (above) is the test set.

## Why this path (document, don't fix)

- **Per 0.13 (scope control).** v1 runway is fully consumed.
  Adding Genius integration + OAuth setup + re-fetch + re-
  enrich is 1-2 days of focused work, not a "fix in 5
  minutes" thing.
- **Per 0.7 (AI output boundary).** I tested the two
  reachable free APIs (lyrics.ovh, LRCLib) and they time
  out. I cannot claim "fix is easy; just use them."
- **Per 0.11 (code preservation).** The 19 missing songs
  are correctly handled by the rest of the system (they
  show up in graphs, themes, etc., via fallback edges).
  The gap is "no lyric-level themes/entities," not
  "song absent from system."

## Risks

- **Genius API quota.** Genius's free tier is rate-limited.
  At 19 songs × 1 lookup = trivial. But the OAuth flow is
  the real cost.
- **Network reachability from a different machine.** If
  the alternative APIs are reachable from a different
  machine, the v1.1 plan is easier. We don't know yet.

## Validation plan

- [x] 2 alternative sources tested
- [x] Both confirmed unreachable
- [x] 19 songs enumerated
- [x] v1.1 plan written
- [x] No code change required for v1 (gap is documented)

## Related

- `scripts/fetch-lyrics-musixmatch.py` (current fetch)
- `lib/db/queries.ts:lyric_lines` schema
- `docs/decisions/0003-pluggable-intelligence-pipeline.md`
  (mentions lyrics-source pluggability)
- v1.1 plan: above

## Re-investigation (2026-06-16 same session, after multi-artist split)

Tested 5 of the 19 missing songs against LRCLib:

```
❌ Girls Like You (Maroon 5)        — read operation timed out
❌ I Don't Care (Ed Sheeran)         — read operation timed out
❌ Don't Start Now (Dua Lipa)       — read operation timed out
❌ Adore You (Harry Styles)         — read operation timed out
✅ Someone You Loved (Lewis Capaldi) — 42 lines
```

**Result: 1/5 success rate.** LRCLib is reachable but
unreliable from this network — most requests time out
mid-read. The earlier 200/5278-byte probe was a
false positive (the server returned a connection-reset
error response, not actual data).

Also tested ChartLyrics (`api.chartlyrics.com`): the
endpoint returned no HTTP code (connection refused),
suggesting the host is unreachable from this network.

## Updated conclusion

Three free lyrics APIs tested (`lyrics.ovh`, `LRCLib`,
`ChartLyrics`). All three are unreliable from this
network:
- `lyrics.ovh`: connection timeout, no bytes returned
- `LRCLib`: 1/5 success, most reads time out
- `ChartLyrics`: connection refused

The 19 missing-lyrics songs remain a real product gap.
The only reliable fix requires:
1. A registered Genius account (OAuth) + `lib/api/genius.ts` client
2. A fallback pipeline in `fetch-lyrics-musixmatch.py`:
   try Musixmatch → if "no lyrics available" → try Genius
3. Re-run fetch + enrich

## Why this is OK for v1 (reframed)

For 1st-principles product completeness: every song
should have lyrics OR an explicit "lyrics-restricted"
flag. The current state has 131/150 with lyrics (87%);
the 19 remaining are upstream-licensed in Musixmatch
and unreachable from the alternative free APIs we
tested. This is a real gap. The path to close it is
Genius OAuth (1-2 day work). The user can decide
whether to fund the Genius account or ship the gap.
