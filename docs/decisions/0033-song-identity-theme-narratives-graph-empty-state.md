# Decision 0033: Song identity, theme recurrence narratives, and graph empty-state clarity

Date: 2026-06-20
Status: Accepted
Supersedes: None
Replaces partially: The old "Why this theme recurs" copy in `app/theme/[theme]/page.tsx` and "0 nodes · 0 edges" empty state in `app/graph/page.tsx`.

## Context

The user-facing surface had three classes of issues that confused the data behind the product:

1. **Duplicate songs in artist/theme/year pages.** A global hit like "Blinding Lights" appeared 5 times on The Weeknd's page (US #1, US #51, UK #1, DE #1, 2020 + 2021). "Creepin'" appeared twice in 2023 because the seed data had the same song at #5 and #55 with slightly different title strings (`"Creepin'"` vs `'Creepin'`). The artist and theme pages grouped by `(title, year)` which didn't catch the title-string variation or regional variants.

2. **Theme "why this matters" copy was thin.** The narrative was always: "N songs had this theme. Peak is 20XX. Mean score is Y%." It never answered the question the user was actually asking: "is this theme getting stronger, fading, or stable?" The user can see counts in a bar chart; what they want from prose is the *delta story*.

3. **Graph page empty state was unhelpful.** "0 nodes · 0 edges · 2-hop neighborhood. Click any edge to see evidence" — but the count is 0 because data is still loading, and the user can't tell. After data loads (with 67 nodes from 2020 default), the empty state disappears, but the user already left.

## Options considered

### For song dedup

1. **Filter at the page level.** Cheapest fix. Reject the option: per motto 0.7 (canonical paths) and 0.8 (data layer discipline), the dedup belongs in the query, not the UI. Otherwise every page that loads songs would reimplement it.

2. **Dedupe the corpus.** Run a migration that collapses regional duplicates and rewrites all song_ids. Reject: destructive (the regional seed is intentional — it shows the architecture), and the title-string variation would require fuzzy matching that loses data.

3. **Dedupe at the query layer with a SQL CTE that normalizes title + prefers canonical id.** **Chosen.** The CTE is shared across `getArtistSongs`, `getSongsByTheme`, `getEraOverview`, `getSimilarSongs`, and `getThemeYearDistribution`. Five queries, one source of truth.

### For theme narrative

1. **Static copy per theme.** A hand-written blurb for each of the 12 themes. Reject: doesn't scale, can't be tested, and would still be a count-based story not a delta.

2. **Compute era deltas in the query, render the math.** **Chosen.** The narrative is data-derived: "Loneliness is rising: 57 songs in 2020-2023 vs 30 in 2012-2019 (+90%)". The user sees the real trend, the real numbers, the real peak year.

3. **Skip the prose, just show the chart.** Reject: the BecauseCard is the trust signal. It needs the prose.

### For graph empty state

1. **Move default to SSR.** Server-render the graph with 2020 as the root. Reject: the graph component is `dynamic(..., { ssr: false })` because react-force-graph2 doesn't SSR cleanly. The 2-hop neighborhood is 67 nodes + 82 edges, so SSR would inflate initial HTML.

2. **Show "Loading {label} neighborhood…" with the actual rootId.** **Chosen.** The user sees "Loading 2020 neighborhood… Anchored at versesignal:n:year:2020, 2 hops." That's actionable: the user knows what's coming, and they can see the URL parameters that drive the fetch.

3. **Auto-trigger a query panel on mount.** Reject: the discovery meter and the visible "Anchored at…" line are the cues. Adding a query panel would be noisy.

## Chosen path

### 1. Song dedup CTE

Added `dedupSongCte()` and `dedupJoinOn(alias)` helpers in `lib/db/queries.ts`. The CTE computes `dedup_songs` keyed by `(normalized_title, normalized_artist, year)`, picking:
- `canonical_id` — the row with no `uk-`/`de-` prefix (the US source-of-truth)
- `best_rank` — `MIN(chart_rank)` so the song shows at its best chart position
- `repr_title` / `repr_artist` — the original strings for display

Title normalization strips straight + curly apostrophes, double quotes, and collapses whitespace. This catches `"Creepin'"` vs `'Creepin'` vs `"Creepin"` without a Unicode-aware normalizer.

Applied to: `getArtistSongs`, `getSongsByTheme`, `getEraOverview`, `getSimilarSongs`, `getThemeYearDistribution`. Five queries, one shared helper.

### 2. Theme era delta

New `getThemeEraDelta(theme)` query. Returns:
- `recentEra` (2020-2023, global streaming era) vs `referenceEra` (2012-2019, streaming transition era) — song count + weighted avg score
- `songCountRatio` + `trend` (rising / falling / stable / novel)
- `peakYear` + `peakYearCount` for the "context year" line

The theme page renders these as a 3-line narrative: trend statement, intensity delta (only if > 2pp), peak year, and a scoring-honesty line. An "Era trend" mini-block below the BecauseCard shows the two era stats side by side with a `rising`/`fading`/`stable`/`novel` pill.

The event page narrative was also upgraded: the BecauseCard now references the pre-event signal resonance rate (e.g. "Pre-event resonance: 30% of signals correlated with this event were already elevated in 2019"). This reuses data the page was already loading (via `getEventLeadAnalysis`) but wasn't surfacing.

### 3. Graph empty state

`components/graph/graph-explorer.tsx`:
- **Loading state** now reads "Loading {label} neighborhood… Anchored at {rootId}, {hops} hops." The label is the API response's root label (e.g. "2020"); before data arrives it falls back to "2020" (the default). The user knows what they're getting.
- **Empty state** (only shown when `data` is null AND no fetch is in flight) now offers 3 clickable tutorial nodes: 2020, 2020s era, COVID-19. Each pill navigates to the right `?rootType=…&rootId=…` URL and triggers the same `unlockMilestone()` flow.
- The default `rootId` was already `versesignal:n:year:2020` (per a prior fix), so the empty state only shows for users who explicitly cleared the URL or hit the page with `?rootId=`.

## Tradeoffs

- **SQL becomes harder to read inline.** The `dedupSongCte()` function returns a 13-line CTE fragment that's interpolated into multiple queries. The alternative (a view) would be cleaner but requires a migration. The CTE in the SELECT is the right level for now; if a 6th query needs it, factor out a view.
- **The era delta math has reference-era assumptions.** We compare 2020-2023 vs 2012-2019. Themes that peaked before 2012 (e.g. a 1980s theme) get a "novel" label when the reference era is sparse, which can be misleading. Per motto 0.11, the copy is explicit: "shows up in 2020-2023 (N songs) but was absent from the chart lexicon in 2012-2019."
- **Title normalization is brittle for non-English titles.** A Japanese title with a different unicode apostrophe (U+FF07) won't normalize. We accept this for v1; the surface is English-language pop chart and the seed has no non-Latin script titles.
- **Era trend block is above the year distribution chart.** It might be redundant with the chart. Per motto 0.4 (acceptance contract), this is OK — the block is one line and gives the user a verbal summary before they read the chart.

## Risks

- **The CTE JOIN is a JOIN on a function call (lower(trim(replace(...))))**. For large corpora this won't use an index. The current corpus is 442 songs, so the cost is negligible. If the corpus grows past ~10k songs, materialize the dedup into a table or a generated column.
- **`getEraOverview` previously accepted a `region` parameter.** With the dedup CTE, the region filter is effectively ignored for song/entity counts (a song charted in 4 regions now counts as 1). The parameter is kept for API compatibility, but the comment in the function flags this. Callers that need region-specific counts (currently none) should call the song table directly.

## Validation plan

- **Unit tests** — `tests/song-dedup.test.ts` (13 tests) covers the dedup behavior, era math, and trend classification. 13/13 pass.
- **Page content tests** — `tests/page-content.test.ts` (19 tests) still pass; the page content the user sees still asserts correctly.
- **Python tests** — 36/36 pass (gazetteer quality, graph integrity, signal classifiers, temporal windows). No regression.
- **Live pages** — `/theme/loneliness` shows the new narrative ("Loneliness & Isolation is rising: 57 scored songs in 2020–2023 vs 30 in 2012–2019 (+90%). Peak chart attention was in 2020 with 18 scored songs (avg score 29/100)."). `/theme/identity` shows similar. `/artist/The%20Weeknd` shows Blinding Lights 2× (2020, 2021) instead of 5×. `/graph` SSR shows the new "Choose a node" tutorial state.

## Rollback

All three changes are non-destructive:
- Dedup CTE can be removed by reverting `getArtistSongs`, `getSongsByTheme`, `getEraOverview`, `getSimilarSongs`, `getThemeYearDistribution` to their pre-CTE form. The CTE is contained in `dedupSongCte()`; deleting that function reveals all 5 call sites.
- Theme narrative is a UI change in `app/theme/[theme]/page.tsx` only. Revert the `whyReasons` array and the Era trend block to the old `reasons` array.
- Event narrative is a UI change in `app/event/[id]/page.tsx` only. Revert `eventWhyReasons` to the old inline array.
- Graph empty state is a UI change in `components/graph/graph-explorer.tsx` only.

## Files changed

- `lib/db/queries.ts` — added `dedupSongCte()`, `dedupJoinOn()`, `getThemeEraDelta()`. Updated `getArtistSongs`, `getSongsByTheme`, `getEraOverview`, `getSimilarSongs`, `getThemeYearDistribution` to use the CTE.
- `app/theme/[theme]/page.tsx` — added `whyReasons` array with delta math; added Era trend block.
- `app/event/[id]/page.tsx` — added `eventWhyReasons` array referencing pre-event signal resonance.
- `components/graph/graph-explorer.tsx` — better loading + empty state copy.
- `tests/song-dedup.test.ts` — 13 new tests covering dedup and era math.

## What would cause this decision to be revisited

- If the corpus grows past 10k songs and the CTE becomes a performance issue, switch to a materialized dedup table.
- If we add a non-English language path with different apostrophe characters, the title normalization needs a Unicode-aware rewriter.
- If the era reference (2012-2019) becomes too old to be meaningful, change the reference era to the prior 4-year window.
