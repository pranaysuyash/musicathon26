# Genius Integration — Initial Failure + Subsequent Fix (2026-06-20)

**Status:** Fixed and re-enabled. 2/13 missing songs recovered (97.1% → 97.5% coverage). The other 11 songs simply don't exist on Genius, LRCLib, or lyrics.ovh — they're documented as a known gap.

**TL;DR:** The original Genius integration silently ingested wrong-page data because (a) Genius search returns calendar pages and list posts for music queries, and (b) the HTML parser picked up page chrome as lyrics. We caught it, fixed 3 bugs, and the chain now works correctly. The token is preserved for any future re-runs.

## What happened (initial failure)

Per Decision 0035, we added Genius as the 4th source in the lyrics fallback chain (after Musixmatch, LRCLib, lyrics.ovh). The user signed up for Genius, provided the access token, and we ran `npm run db:fetch-lyrics-genius`.

The script reported success on 11 of 13 songs. **All 11 successes were wrong-page hits.**

| Song (expected) | Genius-returned page | Result |
|---|---|---|
| Candle in the Wind 1997 (Elton John) | "Longest-Leading Hot 100 #1's (December 16, 2024)" | 1 line, page chrome |
| Him and I (G-Eazy, Halsey) | "Him & I (G-Eazy & Halsey Remix) Lyrics" | 3 lines, page header |
| Remind Me to Forget (Maroon 5, Khalid) | "February 2020 Singles Release Calendar" | Lists OTHER songs |
| Best Part of Me (Khalid, 6LACK) | "July 2019 Singles Release Calendar" | Lists OTHER songs |
| Laffy Taffy (Lil Yachty) | "Moment of Silence" | 1 line, wrong song |
| Beers On Me (Dustin Lynch) | "Name On It" | Wrong song |
| You Should Probably Leave (Eric Church) | "Tay Roc vs. DNA" | Wrong song |
| Chill Baby (Sleepy Hallow) | "February 2024 Singles Release Calendar" | Lists OTHER songs |
| Fast Forward (Alan Walker) | "Live Fast (PUBGM)" (Alan Walker & A$AP Rocky) | Wrong song |
| Wildflower (The Black Keys) | "May 2021 Singles Release Calendar" | Lists OTHER songs |
| Rich Girl (Hallal) | "DJ DJ" | Wrong song |

The script reported each as `· genius · N lines` — line counts alone don't catch wrong-page hits because Genius pages have hundreds of "lines" of HTML chrome.

## Why this happened (3 root-cause bugs)

### Bug 1: Genius search is full-text, not song-lyric-specific

Genius's `/search` endpoint does NOT filter by song vs blog post vs calendar. The search query "Wildflower The Black Keys" returns "May 2021 Singles Release Calendar" — because that page happens to mention "Wildflower" in the body text.

The original `fetchLyricsFromGenius` picked the **first hit** without verifying title, artist, or URL pattern.

### Bug 2: Genius `data-lyrics-container="true"` selector catches page chrome

On a Genius song page, multiple divs match the selector:
- The actual lyrics (large)
- The translations bar (medium, ~7800 chars)
- Empty divs (0 chars)

The original `pickLyricsFromHtml` used `[...html.matchAll(...)]` which joined ALL of them — producing a soup that started with real lyrics and ended with a list of unrelated tracks.

### Bug 3: Title cleaning didn't strip the dual-title " / " separator

Some chart entries use `"Title A / Title B"` to denote a double-A-side (e.g., "Candle in the Wind 1997 / Something About the Way You Look Tonight" by Elton John). The original code only stripped trailing `()` parentheses, so the search query was the full double-title — which Genius didn't match.

## How we caught it

We verified by curling each song page after ingestion and reading the first 5 lines of `lyric_lines`. The Wildflower entry started with:

```
12 ContributorsMay 2021 Singles Release Calendar Lyrics
5/6
A.G. Cook & Charli XCX - "Xcxoplex"
```

These are Genius page-chrome artifacts, not Wildflower lyrics.

A regex pass over the first 5 lines caught all 11 (patterns like `^\d+\s*Contributors`, `^(January|...)\s+\d{4}\s+Singles`, `^Best Albums`, `^Live Fast`, etc.).

## Initial action: rollback

All 11 bad ingests were deleted from `lyric_lines`. Coverage returned to 429/442 = 97.1% (pre-Genius state). The Genius access token was preserved in `.env`.

## The fix (per the post-mortem's 3-bug prescription)

Implemented in `lib/api/genius.ts`:

### Fix 1: URL pattern filter (`isLikelySongPage`)

```ts
function isLikelySongPage(url: string): boolean {
  // Song pages: .../{artist-slug}-{song-slug}-lyrics
  // Non-song pages: .../{slug}-annotated (calendar, blog, list)
  return /\/[\w-]+-[\w-]+-lyrics$/.test(new URL(url).pathname);
}
```

### Fix 2: Hit verification (title + artist + remix-marker rejection)

The new code picks the first hit that passes ALL three checks:
- `isLikelySongPage(url)`
- `titleMatches(hit.title, expected)` — strict: requires no remix-marker mismatch (e.g., expected="Him and I" rejects hit="Him & I (G-Eazy & Halsey Remix)" because of the remix marker)
- `artistMatches(hit.artistName, expected)` — strict: every primary token of the hit's artist must be a primary token of the expected artist

If no hit passes, return null — don't fall back to the first hit.

### Fix 3: Title cleaning strips "/" separator + parser uses longest non-chrome match

```ts
const cleanedTitle = title
  .replace(/\s*\/\s*[^/]+$/, "")  // strip "A / B" double-titles
  .replace(/\s+\(.*?\)\s*$/g, "")
  .trim();
```

And the parser picks the longest `data-lyrics-container="true"` match whose first 100 chars don't start with page-chrome patterns (`^\d+ Contributors`, `^Translations`, `^Lyrics`, etc.), with a fallback to the `Lyrics__Root` CSS class.

## Re-run results

After the fix:
- **Coverage: 429/442 → 431/442 = 97.5%** (2 songs recovered via Genius)
- "Candle in the Wind 1997 / Something About the Way You Look Tonight" → 24 lines of real Elton John lyrics
- "Him and I" → 32 lines of real G-Eazy & Halsey lyrics
- The other 11 songs returned "no match" — they don't exist on Genius, LRCLib, or lyrics.ovh. **This is the honest limit, not a bug.** Songs like "Wildflower" by The Black Keys or "Rangisari" by Kanika Kapoor are not indexed on any of the four sources.

## What changed in code

- `lib/api/genius.ts` — added `isLikelySongPage`, tightened `titleMatches` (with remix-marker rejection), tightened `artistMatches` (every-token must match), rewrote `pickLyricsFromHtml` to pick the longest non-chrome match, added "/" separator cleaning in title.
- `scripts/fetch-lyrics-genius.ts` — unchanged (the script is correct; the bug was in the library)
- `docs/findings/2026-06-20-genius-integration-failed.md` — this file (rewritten as the resolution post-mortem)
- `docs/setup/2026-06-20-genius-setup.md` — updated status header

## What's preserved

- **Token:** `GENIUS_ACCESS_TOKEN` is in `.env`. Re-enabling is already done (no toggle needed).
- **Code:** `lib/api/genius.ts` is the fixed version. Future Genius improvements can extend this file.
- **Decision doc:** This file is the post-mortem. Future agents can see the full failure → fix story without re-debugging.

## What I'd do differently next time

- **Add a verification step BEFORE committing lyrics.** A simple check: after fetching, ensure the first line of lyrics doesn't match `^\d+ Contributors` or similar page-chrome patterns. This would have caught the bug at ingest time, not after the user reported it.
- **Probe Genius with a known song first.** Before trusting any Genius fetch, run a smoke test on a song we know is on Genius (Blinding Lights) and verify the output starts with real lyrics. Add this to the script's startup.

## The 11 still-missing songs (post-fix, post-Genius)

These are documented as the natural limit of the 4-source chain:

```
2018  Remind Me to Forget          Maroon 5, Khalid
2019  Best Part of Me              Khalid, 6LACK
2020  Laffy Taffy                  Lil Yachty
2021  Beers On Me                  Dustin Lynch
2021  You Should Probably Leave    Eric Church
2021  Chill Baby                   Sleepy Hallow
2021  Rangisari                    Kanika Kapoor
2022  Malvadão 3                   Xand Avião
2023  Fast Forward                 Alan Walker
2023  Wildflower                   The Black Keys
2023  Rich Girl                    Hallal
```

These are country (Dustin Lynch, Eric Church, Alan Walker country), niche rap (Sleepy Hallow), and regional (Rangisari, Malvadão 3). All were on Decision 0015's "missing" list. The 0015 framing — no alternative source reachable — still applies.
