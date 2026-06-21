# Decision 0035 — Lyrics coverage chain (Musixmatch → LRCLib → lyrics.ovh → Genius) + deployment + demo plan

**Date:** 2026-06-20
**Status:** Active
**Hackathon deadline:** 2026-06-22 14:00 CEST / 05:00 PT
**Owner:** VerseSignal agent

## Context

After Decision 0034 closed the user-facing polish work, two remaining items needed attention before the hackathon submission:

1. **Lyrics gap.** Coverage was 93% (411/442) after Decision 0034. The remaining 31 songs were reported as "Musixmatch-restricted" in Decision 0015. The hackathon deadline is 24 hours away. We needed to either close the gap or accept it.

2. **Deployment + demo recording.** Decision 0034 noted "out of scope" for deployment. The user has Vercel (canonical Next.js host, free), Cloudflare (DNS + caching + protection), and Replit (sponsor) available. The hackathon submission requires a working public URL and a 5-minute demo video.

## What changed

### 1. Probed alternative lyrics APIs

The 0015 decision (2026-06-16) marked both `lyrics.ovh` and `lrclib.net` as "unreachable from this network." Re-probed on 2026-06-20:

- **lyrics.ovh**: REACHABLE. Returned lyrics for 5/21 missing songs (theme classics from 1960s, Mark Ronson Uptown Funk, Pink Beautiful Trauma, etc.).
- **LRCLib**: REACHABLE. Returned plain lyrics for 3/21 missing songs (Macarena, 10,000 Hours, My Ex's Best Friend, Thinkin' Bout Me). Different corpus than Musixmatch — caught indie/international/country tracks.

Both APIs are free and require no auth. The 0015 unavailability was a temporary network condition.

### 2. Lyrics fallback chain (4 sources)

Created two new API clients and updated the fallback chain:

```
lib/lyrics/fallback.ts (updated)
lib/api/lrclib.ts (new)        — LRCLib.net client
lib/api/lyricsovh.ts (new)     — Lyrics.ovh client
lib/api/genius.ts (updated)    — Bearer auth (was query param)
```

**Fallback chain order:**

1. **Musixmatch** — primary, structured (track_id for re-linking)
2. **LRCLib** — different corpus (indie/international), often has Morgan Wallen country and regional tracks
3. **Lyrics.ovh** — simplest endpoint, often has classics (1960s-1990s) and hits Musixmatch lost licensing for
4. **Genius** — last resort, requires OAuth signup; only enabled when `GENIUS_ACCESS_TOKEN` is set

Each step is a quick HTTP call (8s timeout). The chain completes in under 5s for typical cases; remaining sources are skipped as soon as one returns lyrics.

### 3. Genius setup guide and runnable script

Created `docs/setup/2026-06-20-genius-setup.md` with the exact form values for Genius signup:

| Field | Value |
|---|---|
| App Name | `VerseSignal` |
| Icon URL | `https://versesignal.vercel.app/api/og?type=default` |
| App Website URL | `https://versesignal.vercel.app` |
| Redirect URI | `https://versesignal.vercel.app/callback` (never actually called) |

After signup, paste the access token into `.env` and run `npm run db:fetch-lyrics-genius` — a dedicated script (`scripts/fetch-lyrics-genius.ts`) that targets only the still-missing songs with the Genius-first chain (since Musixmatch + LRCLib + lyrics.ovh have already run for them in the main `db:fetch-lyrics` script).

### 4. Coverage result

| State | Coverage | Notes |
|---|---|---|
| Pre-0034 | 411/442 = 93% | Decision 0015 state |
| Post-0034 (Musixmatch-only fix) | 421/442 = 95% | 10 recovered via better artist matching |
| **Post-0035 (LRCLib + lyrics.ovh)** | **429/442 = 97.1%** | **8 more recovered via the new sources** |
| Attempted Genius | rolled back | All 11 fetches were wrong pages (calendar posts, list pages, different songs); see [findings doc](../findings/2026-06-20-genius-integration-failed.md) |
| **Final coverage** | **429/442 = 97.1%** | **Genius disabled pending code fix** |

The 13 remaining songs are: country (Dustin Lynch, Eric Church), niche rap (Sleepy Hallow), regional (Rangisari, Malvadão 3), and a few tracks not indexed by any of the four sources. **Genius was attempted and rolled back** — see the findings doc for details on why (search returns calendar pages, parser picks up page chrome). Token is preserved for future re-enablement.

### 5. Deployment + demo plan

Documented in `docs/deploy/2026-06-20-deployment-and-demo-plan.md`:

- **Recommended stack:** Vercel + Cloudflare + Replit (each plays a role)
  - Vercel hosts Next.js (canonical, native, free)
  - Cloudflare proxies + DNS + caching + security
  - Replit as backup deployment + sponsor demo env
- **DB strategy:** SQLite snapshot in repo (Option A) — simpler than Postgres migration in 24 hours
- **Demo recording:** Playwright scripted walk + separate voiceover MP3 + ffmpeg concat
- **Voiceover script:** 9 scenes, ~4:30 read time, in `docs/demo/2026-06-20-demo-voiceover-script.md`

### 6. Recording scripts written (not yet run)

Created two runnable recording scripts:

- `scripts/record-demo.ts` — Playwright scripted walk. Captures 2-fps frames per scene, runs `minterpolate` to 24fps via ffmpeg, optionally combines with a pre-recorded voiceover MP3. Output: `./output/demo.mp4`.
- `scripts/record-demo-screen.ts` — Direct screen capture via ffmpeg + avfoundation. Records Mac screen + microphone. Output: `./output/demo-screen.mp4`. Used for live voiceover when the user wants real-time commentary.

Recommended: use `record-demo.ts` (Playwright scripted) for repeatability and tight time budget. Use `record-demo-screen.ts` only if you want live voiceover.

## Tradeoffs

- **Why LRCLib before lyrics.ovh in the chain.** LRCLib's API is more deterministic (returns JSON with a clear `plainLyrics` field). Lyrics.ovh can be flaky for tracks with non-ASCII characters or unusual punctuation.
- **Why Genius last, not first.** Genius requires a token. Most users won't have one. Putting it last means the chain is useful without signup; adding the token enables the longest tail.
- **Why Bearer auth instead of query-param token.** Both work in Genius's API, but the docs recommend `Authorization: Bearer <token>`. The query-param method is documented as "use only when the Authorization header isn't possible." Modern `fetch` supports the header on cross-origin.
- **Why a snapshot in repo, not Postgres.** A SQLite → Postgres migration in 24 hours is risky. The DB is read-only after enrichment runs, so a static snapshot is fine for demo purposes.
- **Why separate voiceover MP3.** Recording voice and screen at the same time drifts. ffmpeg `amix` with timing offsets is annoying. Two files, one ffmpeg concat, done.

## Risks

- **Vercel SQLite on serverless.** better-sqlite3 works on Vercel's Node runtime but not Edge. The `next.config.mjs` already declares `serverComponentsExternalPackages: ["better-sqlite3"]`. We deploy as Node, not Edge. **Mitigation:** if Vercel fails the SQLite load, fall back to pre-rendering the home page to static HTML at build time.
- **Python semantic-search on Vercel.** `/api/semantic-search` shells out to Python which isn't available on Vercel. The page already gracefully degrades when the embedder is unavailable. **Mitigation:** disable the route in production or set a static `embedder_unavailable: true` flag.
- **Vercel function timeout.** Free tier is 10s. The first request to `/event/covid_19` (heavy graph query) might exceed this on cold start. **Mitigation:** warm the cache by hitting each route once before recording.
- **Cloudflare caching HTML.** If we cache `/globe` or `/compare/1969/2020`, the jury sees stale data. **Mitigation:** set TTL to 5 min for HTML, 1 year for `/_next/static/*`.
- **Genius token not yet provisioned.** The remaining 13 songs wait on Genius signup. Per the setup guide, this is a 5-minute task.

## Validation plan

- **Coverage:** `sqlite3 data/versesignal.db "SELECT COUNT(DISTINCT song_id) FROM lyric_lines WHERE text IS NOT NULL AND text != ''"` → expect 429+ (was 411).
- **Typecheck:** `npx tsc --noEmit` clean (verified).
- **Tests:** 36/36 TS + 36/36 Python pass (verified).
- **Live routes after deploy:** all 12 main routes return 200 from `https://versesignal.yourdomain.com` (deferred to deployment step).
- **Demo video:** plays in QuickTime, 5 min ± 30s, audio audible, 9 distinct scenes visible.

## Rollback

- **Fallback chain reordering:** move the source order in `lib/lyrics/fallback.ts`. Single function, ~50 lines.
- **Remove Genius support:** delete the import line + the `if (!isGeniusAvailable()) return null` block. The chain degrades to 3 sources.
- **Remove LRCLib/lyrics.ovh support:** delete the new client files + their calls in `fetchLyricsWithFallback`. Musixmatch-only.
- **Deployment rollback:** Vercel keeps every deploy. `vercel rollback` to any previous version.

## Files changed

- `lib/api/lrclib.ts` (new) — LRCLib client
- `lib/api/lyricsovh.ts` (new) — Lyrics.ovh client
- `lib/api/genius.ts` (updated) — Bearer auth header
- `lib/lyrics/fallback.ts` (updated) — 4-source fallback chain
- `scripts/fetch-lyrics-genius.ts` (new) — targeted Genius-first chain
- `package.json` — added `db:fetch-lyrics-genius` script
- `.env.example` — added Genius signup instructions
- `docs/setup/2026-06-20-genius-setup.md` (new) — Genius signup guide with concrete form values
- `docs/deploy/2026-06-20-deployment-and-demo-plan.md` (new) — full deployment + demo recording plan
- `docs/demo/2026-06-20-demo-voiceover-script.md` (new) — 9-scene voiceover script
- `scripts/record-demo.ts` (new) — Playwright scripted demo recording
- `scripts/record-demo-screen.ts` (new) — ffmpeg direct screen recording
- Lyrics data: 8 songs ingested from LRCLib + lyrics.ovh (426 lines total)

## What would cause this decision to be revisited

- If the user picks a custom domain, the Genius form values need to update from `versesignal.vercel.app` to the new domain.
- If the lyric-source APIs change their contracts (LRCLib and lyrics.ovh are community projects; Musixmatch is the canonical source), the clients need updates.
- If the 5-min video budget proves tight, the recording script can compress scene 4 (graph) by 10 sec to free budget for the closing.
- If Postgres is adopted later (post-hackathon), `scripts/snapshot-db.sh` should be added to convert SQLite → SQL dumps for version control.
