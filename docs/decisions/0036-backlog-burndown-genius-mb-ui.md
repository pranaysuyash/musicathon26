# Decision 0036 — Backlog burndown: Genius fix + MusicBrainz retry + UI gaps

**Date:** 2026-06-20
**Status:** Active
**Hackathon deadline:** 2026-06-22 14:00 CEST / 05:00 PT
**Owner:** VerseSignal agent

## Context

After Decision 0035 documented the failed Genius integration and the deployment/demo plan, the user asked to continue burning down deferred/backlog items per motto_v3. This decision closes the items I picked up in this round.

## What changed

### 1. Genius fixed per findings doc (3 bugs)

Per the post-mortem in `docs/findings/2026-06-20-genius-integration-failed.md`, three bugs in `lib/api/genius.ts`:

**Bug 1: URL pattern filter (Fix 1 in findings doc)**
- Added `isLikelySongPage(url)` that rejects non-song-page URLs (`-annotated`, etc.)
- Calendar pages, list pages, blog posts now fail the URL check

**Bug 2: Hit verification (Fix 2)**
- `titleMatches` now requires no remix-marker mismatch (e.g., expected="Him and I" rejects hit="Him & I (G-Eazy & Halsey Remix)")
- `artistMatches` now requires every primary token of the hit's artist to be a primary token of the expected artist (no more "Fred E. Fox matches G-Eazy, Halsey")
- Token-level matching with weighted overlap replaces loose substring includes
- "&" is normalized to "and" before tokenization so "Him & I" matches "Him and I"

**Bug 3: Parser scoping (Fix 3)**
- `pickLyricsFromHtml` now picks the LONGEST `data-lyrics-container="true"` match whose first 100 chars don't match page-chrome patterns (`^\d+ Contributors`, `^Translations`, `^Lyrics`, etc.)
- Falls back to the `Lyrics__Root` CSS class
- Title cleaning strips the "/" separator for double-A-side titles ("Candle in the Wind 1997 / Something About the Way You Look Tonight" → "Candle in the Wind 1997")

**Result:** Coverage went from 97.1% → **97.5%** (2 songs recovered: "Candle in the Wind 1997 / Something About the Way You Look Tonight" by Elton John, 24 lines; "Him and I" by G-Eazy & Halsey, 32 lines of real lyrics). The 11 remaining songs are genuinely not indexed by Genius/LRCLib/lyrics.ovh — documented as the natural limit.

### 2. MusicBrainz retry with exponential backoff (mirror Wikidata fix)

`scripts/enrich-musicbrainz.py` previously had retry logic for 503 only. Per the Wikidata 0035 finding (HTTP 429 from rate-limited endpoints), added 429 handling:

```python
if e.code in (429, 503) and attempt < 2:
    time.sleep(2 ** attempt)
    continue
```

**Result:** MusicBrainz linked entities went from **0 → 197 of 1969 (10%)**. Major artists now linked: Harry Styles, Lil Wayne, J. Cole, Meek Mill, Maroon 5, Mick Jagger. Per the script's `disambigulate` policy, the unlinked 90% are mostly nicknames ("The Weeknd" vs "Abel Tesfaye"), common words ("Bach"), and false-positive entities from the gazetteer — same finding as the Wikidata 0034 result.

### 3. Year page top-line takeaway rendered

`buildTakeaway(year, top, events)` was already computing the answer to "What was the charts saying in 2020?" but it was never rendered. Per the audit, the year page lacked visual hierarchy. The fix: render the takeaway as a gradient card right after the year heading, BEFORE the per-signal breakdown. The user sees:

> **The takeaway** — In 2020, the mood "energetic" rose 54% vs the prior 3-year baseline (53 chart songs). Candidate contexts to test include: MeToo movement; Climate crisis visibility; Spotify IPO / Streaming Era; COVID economic recession; COVID-19 lockdowns; Black Lives Matter protests; US 2020 Presidential Election; COVID vaccine rollout. Also strong: "angry" (27 songs, 50% vs baseline).

### 4. Event articles embedded in song page world-context

`lib/db/queries.ts` got `getEventArticlesBatch(eventIds)` (one query, top article per event). `app/song/[id]/page.tsx` now renders a curated background article under each event in the "What was the world doing" section. Verified live on Blinding Lights: 4 background articles rendered (MeToo movement · Wikipedia, Climate change · Wikipedia, Spotify's 2018 IPO · Billboard, We Face a Recession Like No Other · IMF). The user now sees the song's cultural context as headlines, not just event titles.

### 5. Compare-eras widget on home

The audit said `/compare/[from]/[to]` is the best page in the app but nobody knows it exists. Added `components/home/compare-eras-widget.tsx` — a client-side widget with two era pickers and a single CTA. Wired into the home page right after the era mosaic. The user can now pick any two eras (e.g., "Broadcast 1960-79" + "Global streaming 2020-23") and go straight to `/compare/1960/2023`.

### 6. Song-to-event linker re-run (already strict)

Per Decision 0030, the linker was tightened to require 2+ distinct event-specific keywords. Re-running `scripts/migrate-relink-songs-to-events.py` confirmed the linker is doing what it should: 7 honest song-event edges (4 COVID, 2 Queen Elizabeth, 1 Climate), 6458 no-match (correctly rejected). The Eras Tour / Spotify IPO events have weak lyrical evidence — that's the truth. Per motto 0.11, we don't relax the linker just because the count is low.

## Tradeoffs

- **MusicBrainz 10% is not 80%.** The remaining 90% are mostly nicknames/duplicate-entries — exactly the same finding as the Wikidata pass. Pushing further would require entity canonicalization (a separate, multi-day task). For the hackathon, 10% is honest and the major artists are linked.
- **The linker stayed strict.** Relaxing to 1 keyword would re-introduce the 100+ bogus COVID links that Decision 0030 fixed. The 7 edges are the honest count after the tightening — better than 100 noisy edges.
- **Compare widget takes 2 era picks.** A user might want to compare years directly (not eras). The widget routes to `/compare/[fromYear]/[toYear]`, so picking "Global streaming 2020-23" goes to 2020 (its start year). A future iteration could allow year-level picks.

## Risks

- **MusicBrainz 1 req/sec rate limit.** Unauthenticated. The script enforces 1s sleep between requests. For 1969 entities this is ~33 minutes worst case. The 429 retry handles transient bursts.
- **Compare widget default state.** The default is "From: Broadcast (1960-79), To: Global streaming (2020-23)" which routes to `/compare/1960/2020`. That's not the most dramatic comparison — `/compare/1969/2020` (what the home button uses) is. We could change the default; the audit recommendation was "any two eras" so the flexibility is the win.
- **Event articles in song page might be cached at SSR.** Currently the query runs on every request. For 431 songs × 4 events per song × 1 article each = 1724 article renders. Acceptable.

## Validation

- **Typecheck:** `npx tsc --noEmit` clean (verified)
- **TS tests:** 36/36 pass (verified)
- **Python tests:** 36/36 pass (verified)
- **Total: 72/72**
- **Coverage:** 431/442 = 97.5% (verified, +2 from Genius fix)
- **Live pages verified:**
  - `/lens/2020` shows the new "The takeaway" card
  - `/song/.../blinding-lights-the-weeknd` shows event articles under the world-context section
  - `/` (home) shows the "Compare any two eras" widget with two era pickers

## Files changed

- `lib/api/genius.ts` — fixed 3 bugs (URL filter, hit verification, parser scoping, title cleaning)
- `lib/db/queries.ts` — added `getEventArticlesBatch(eventIds)` with row_number per-event filter
- `app/song/[id]/page.tsx` — embedded event articles in the world-context section
- `app/lens/[year]/page.tsx` — rendered the existing `takeaway` variable as a gradient card after the heading
- `app/page.tsx` — added the CompareErasWidget after the era mosaic
- `components/home/compare-eras-widget.tsx` (new) — client-side era picker
- `scripts/enrich-musicbrainz.py` — added 429 to the existing retry-on-HTTP-error block
- `docs/findings/2026-06-20-genius-integration-failed.md` — rewritten as the fix resolution post-mortem
- `docs/setup/2026-06-20-genius-setup.md` — updated status header from "disabled" to "fixed and re-enabled"

## What was NOT done (intentionally, per scope discipline)

- **Re-running the full `py:enrich` pipeline** (GLiNER + sentence-transformers). Takes 30+ minutes. The 7-edge song-to-event linker is correct; no need to rerun unless we're changing the linker itself.
- **Spotify IPO + Eras Tour song-to-event edges.** These events have weak lyrical evidence (no song says "streaming" or "Eras tour" in a way the linker accepts). The events are real; the song-to-event lyric matches just aren't there. Documented as a known gap.
- **MusicBrainz entity canonicalization** (e.g., "Abel Tesfaye (The Weeknd)" → "The Weeknd"). Multi-day task. Not in 24-hour window.
- **CI / GitHub Actions.** Doesn't fix user-facing bugs.
- **Deployment to Vercel.** Plan is in `docs/deploy/...`; user does this.

## What would cause this decision to be revisited

- If a user reports a specific Genius song has wrong lyrics, the verification regex (page-chrome detection) needs extending. Add new patterns to `PAGE_CHROME_RE`.
- If MusicBrainz entities get canonicalized in the future, the script should re-run to fill the remaining 90%.
- If the year-page takeaway is wrong (e.g., "energetic rose 54%" but the user expected "themes"), the `buildTakeaway` function needs tuning.
- If the compare widget defaults to less interesting pairs (e.g., 1960 + 2020), adjust the `useState` defaults.

## Hackathon submission status

- **Lyrics coverage:** 97.5% (431/442) — up from 93% pre-Decision-0034
- **MusicBrainz:** 10% (197/1969) — up from 0%
- **Wikidata:** 5.3% (104/1969) — up from 0% pre-Decision-0034
- **Tests:** 72/72 pass
- **Typecheck:** clean
- **Live routes:** all 12 return 200
- **Documents:** 36 decisions + audit + setup + deploy + demo
- **Code ready for:** Vercel deploy (plan in `docs/deploy/...`), demo recording (scripts in `scripts/record-demo*.ts`, voiceover in `docs/demo/...`)

The product is in a defensible state. The user can ship with confidence that the jury sees real data, real evidence, and a long-term cultural-atlas story.
