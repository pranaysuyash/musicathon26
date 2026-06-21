# Deployment + Recorded Demo Plan — Decision 0035

**Date:** 2026-06-20
**Status:** Plan (not yet executed)
**Hackathon deadline:** 2026-06-22 14:00 CEST / 05:00 PT (~24 hours from now)

## Available infrastructure

You have three deployment options, all with free tiers:

| Platform | Best for | Why |
|---|---|---|
| **Vercel** | Next.js production | Native Next.js host. Zero-config. Free tier covers everything we need. |
| **Cloudflare** | Public-facing layer | DNS, caching (Cloudflare Cache), rate limiting, security headers. Use as the edge proxy in front of Vercel. |
| **Replit** | Sponsor demo recording + secondary deployment | `replit.nix.toml` already in the repo. Use it for the demo video recording environment (sponsor credits) and as a backup. |

## Per motto 0.1: what does the user actually need to ship?

Two deliverables for the hackathon jury:

1. **A public demo URL** the jury can open and click around in.
2. **A 5-minute demo video** showing the product working.

Both must work for the jury to evaluate VerseSignal. Without (1), nothing else matters. Without (2), the jury sees a static screenshot.

---

## Part 1: Deployment (the public URL)

### Recommended stack: Vercel + Cloudflare

- **Vercel** hosts the Next.js app. `vercel deploy` from the repo root. The `next.config.mjs` is already compatible.
- **Cloudflare** sits in front as a proxy. DNS points `versesignal.yourdomain.com` → Cloudflare → Vercel. Cloudflare handles:
  - DDoS protection (free tier includes basic)
  - Bot detection
  - Cache static assets (`/_next/static/*` — auto)
  - Rate limiting the `/api/*` routes (junk query protection)
  - Minify JS/CSS on the fly

### Step 1.1 — Deploy to Vercel

```bash
# Once: install Vercel CLI (already on path if you use it)
npm i -g vercel

# From the repo root, login
vercel login

# Deploy (preview by default)
vercel

# Follow prompts:
#   Set up and deploy? Y
#   Which scope? your-team
#   Link to existing project? N
#   Project name? versesignal
#   In which directory is your code located? ./
#   Override settings? N

# Production deploy
vercel --prod
```

### Step 1.2 — Set Vercel env vars

In the Vercel dashboard (Project → Settings → Environment Variables), add:

```
MUSIXMATCH_API_KEY=...
MUSIXMATCH_PASSWORD=...
SONGSTATS_API_KEY=...
HF_TOKEN=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
GENIUS_ACCESS_TOKEN=...     (after Genius signup)
```

These mirror your local `.env`. Vercel encrypts them at rest.

### Step 1.3 — Provision the production DB

The SQLite file (`data/versesignal.db`) needs to be in the Vercel deploy. Two options:

**Option A (simpler):** Commit a snapshot of the DB to the repo (under `data/versesignal.db`). The DB is gitignored but you can `git add -f data/versesignal.db` for the first deploy. The repo size grows by ~50 MB.

**Option B (cleaner):** Use Vercel Postgres or Turso for the DB. This requires a migration of the SQLite schema to Postgres-compatible SQL — a half-day task, NOT recommended in the remaining 24 hours.

**Recommendation: Option A.** The DB is read-only after enrichment runs, so a snapshot in the repo is fine for demo purposes.

### Step 1.4 — Cloudflare DNS + proxy

1. Add domain to Cloudflare (free plan).
2. Set DNS records:
   - `versesignal` (or `@`) → Vercel CNAME (provided after `vercel --prod`)
   - Proxy status: **Proxied** (orange cloud)
3. In Cloudflare → SSL/TLS → set mode to **Full**.
4. In Cloudflare → Caching → enable standard cache eligibility.
5. In Cloudflare → Security → set Security Level to **Medium**.

The end result: `https://versesignal.yourdomain.com` is the public URL.

### Step 1.5 — Replit as backup + sponsor-aligned recording env

`replit.nix.toml` is already configured. The `run` field uses `npm run start`, and `[build]` runs `npm install && npm run db:init && npm run db:seed-chart`. To deploy on Replit:

1. Push the repo to GitHub.
2. In Replit → Import from GitHub → pick the repo.
3. Add Secrets (same as `.env`).
4. Replit auto-detects `replit.nix.toml` and builds + runs.

Caveats: Replit containers sleep on inactivity (free tier), so it's not a reliable primary demo URL. Use as backup or as the recording environment.

### Step 1.6 — Verify before recording

After deploy:

```bash
# Hit the public URL
curl -I https://versesignal.yourdomain.com
# Should return 200 with Vercel's signature

# Test all 12 main routes
for path in / /graph /year/2020 /song/versesignal%3A2020%3A01%3Ablinding-lights-the-weeknd /theme/loneliness /event/versesignal%3Aev%3Acovid_19 /artist/The%20Weeknd /compare/1969/2020 /globe /data-health /ask /scrub; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "https://versesignal.yourdomain.com$path" --max-time 30)
  echo "$code  $path"
done
```

All should return 200. The semantic-search route may 500 if the Python sentence-transformers cold-start exceeds Vercel's 10s function limit — disable it in production if so.

---

## Part 2: Recorded Demo (the 5-minute video)

### Tools

| Tool | Why |
|---|---|
| **Playwright** (Node) | Real Chromium browser, scripted navigation, deterministic timing |
| **ffmpeg** | Combine screen capture + microphone audio (voiceover) into MP4 |
| **Replit** (or local Mac) | Where we run Playwright + ffmpeg |

### Recommended storyboard (5 minutes total)

The video should follow the "song-led anomaly" story (per the launchpad copy we already wrote). Each scene = 1 page = ~25 seconds.

| Scene | Page | Time | Voiceover script |
|---|---|---|---|
| 1 | Home (`/`) | 0:00-0:30 | "When the world was going through something, what was it singing? VerseSignal is a music-cultural knowledge graph: 442 songs, 1960-2023, with the evidence behind every claim." |
| 2 | 2020 lens (`/lens/2020`) | 0:30-1:00 | "Start with 2020. Eighteen signals, twenty-five songs. We see the chart mood BEFORE any single explanation tries to claim the whole story." |
| 3 | Song page (Blinding Lights) | 1:00-1:45 | "Click any song. Lyrics inline, entities highlighted, themes scored, similar songs ranked. And — what was the world doing when this song was #1? MeToo, Climate visibility, Spotify IPO, COVID." |
| 4 | Graph (`/graph`) | 1:45-2:30 | "Every edge has weight, confidence, source API, and evidence rows. Click any edge to see the lyric line that produced it. Click the path button to find shortest connections — Blinding Lights to COVID, six hops." |
| 5 | Theme (`/theme/loneliness`) | 2:30-3:00 | "Themes are not vibes — they're scored against a lexicon. Loneliness is rising: 57 scored songs in 2020-2023 vs 30 in 2012-2019. Ninety percent of loneliness songs also score identity." |
| 6 | Compare (`/compare/1969/2020`) | 3:00-3:30 | "Same question across eras. What was 1969 saying vs 2020? Different cultural machines, not just different dates." |
| 7 | Globe (`/globe`) | 3:30-4:00 | "Regional weather: where chart pressure spikes, where themes cluster, where the corpus still has room to grow." |
| 8 | Data health (`/data-health`) | 4:00-4:30 | "Operator view. 442 songs, 95% lyrics coverage, 15 events, 1915 entities, 36/36 Python tests, 36/36 TypeScript tests. Every claim is auditable." |
| 9 | Closing (Home again) | 4:30-5:00 | "This is a long-term product. The corpus is the seed. The graph is the interface. The evidence is the proof. VerseSignal: when the world was going through something, what was it singing?" |

### Recording script (Playwright + ffmpeg)

I'll write `scripts/record-demo.ts` that:

1. Launches a headless Chromium (1280×720, 24fps).
2. Sets viewport to 1440×900 (desktop hero shot).
3. Records audio via the system microphone (or just uses a separate voiceover MP3).
4. Walks the 9 scenes above with scripted navigation + scroll.
5. Records the browser stream to `output/raw/{scene}-%d.png` (one PNG per second).
6. After the run, ffmpeg combines PNGs + audio into `output/demo.mp4`.

### Step 2.1 — Set up Replit for recording

```bash
# In a Replit shell:
mkdir -p ~/recording && cd ~/recording
git clone https://github.com/your-user/musicathon.git
cd musicathon
npm install
# Install Playwright browsers
npx playwright install chromium
# Install ffmpeg if not present (Replit has it by default)
which ffmpeg
```

### Step 2.2 — Write the voiceover script

Per the storyboard above, write a script. Total time target: 4:30 (leaves 30s buffer).

### Step 2.3 — Record the voiceover

Use QuickTime (Mac) or any recorder to capture the voiceover as a separate MP3 (`output/voiceover.mp3`). This is cleaner than recording at the same time as screen capture.

### Step 2.4 — Run the recording

```bash
# From the repo root, in Replit or local:
npx tsx scripts/record-demo.ts \
  --base-url https://versesignal.yourdomain.com \
  --voiceover ./output/voiceover.mp3 \
  --output ./output/demo.mp4
```

### Step 2.5 — Edit

Light editing: trim the start (cursor blinking) and end. ffmpeg can do this:

```bash
ffmpeg -i output/raw.mp4 -ss 00:00:02 -t 00:04:58 -c copy output/demo.mp4
```

### Step 2.6 — Verify

- Watch the video. 5 minutes max.
- The audio is audible. The voiceover matches what's on screen.
- All 9 scenes show a real product screenshot, not a placeholder.

---

## Time estimate (24 hours from now)

| Task | Hours | Notes |
|---|---|---|
| Vercel deploy + env vars + DNS | 1 | Mechanical |
| Replit backup deploy (optional) | 0.5 | Backup only |
| Write Playwright recording script | 2 | New file, ~200 lines |
| Write voiceover script | 1 | Per storyboard |
| Record voiceover | 0.25 | Just talk |
| Run recording | 0.5 | One-shot run |
| Edit + verify | 1 | Trim + watch |
| **Total** | **6.25** | Buffer remaining: ~17 hours |

This fits inside the deadline with substantial buffer. The biggest risk is the voiceover recording quality — a quiet room + decent mic (even AirPods) is fine. Don't spend 4 hours editing; the demo should be 95% right with one cut.

---

## What I'd do first (priority order)

1. **Right now (parallel):** Deploy to Vercel (1 hour). This is the critical path.
2. **Right now (parallel):** Sign up for Genius with the values above (5 min). Paste token. Run `db:fetch-lyrics-genius`. Close the 13 missing.
3. **Once deployed:** Run the public URL smoke test (curl all 12 routes).
4. **After deployed + tested:** Write `scripts/record-demo.ts` + voiceover script.
5. **Final 4-5 hours before deadline:** Record + edit + submit.

If you want me to write the Playwright recording script now (it's pure code, no deployment needed), say so and I'll have it ready.

---

## What could go wrong

- **Vercel SQLite limitation.** SQLite works in `tmpfs` on serverless — fine for read-only demo. If it fails, fallback: pre-render the home page to static HTML at build time and deploy as static.
- **Python semantic-search on Vercel.** The `/api/semantic-search` route shells out to Python which isn't available on Vercel by default. **Recommendation: disable this route in production.** The page already gracefully degrades when the embedder is unavailable.
- **Cold-start timeouts.** Vercel functions timeout at 10s on the free tier. The first request to a complex page (e.g., `/event/covid_19`) might exceed this on cold start. **Mitigation:** warm the cache by hitting each route once before recording.
- **Cloudflare caching static pages.** If you cache `/globe` or `/compare/1969/2020` for too long, jury sees stale data. Set short cache TTL (5 min) for HTML, long TTL (1 year) for `/_next/static/*`.

---

## What I'd NOT do (per motto 0.7 — be honest)

- **Don't** deploy a new Next.js server from scratch on Replit. The DB + better-sqlite3 + Python semantic-search combo is awkward. Replit is fine as a sponsor demo env, not a primary hosting target.
- **Don't** try to migrate SQLite → Postgres in the remaining 24 hours. The snapshot-in-repo approach is the demo-correct path.
- **Don't** record a 6-minute video. The hackathon email said 5 minutes max. Cut ruthlessly.
- **Don't** record voiceover at the same time as screen capture. They drift; the video ends up uneven. Record separately, sync in ffmpeg.
