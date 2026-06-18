# VerseSignal

> **A music-cultural knowledge graph.** How popular songs, lyrics, artists, themes, named entities, moods, collaborators, and world events connect across time.

```
"When the world was going through something, what was it singing?"
```

## What this is

A navigable graph of charting pop music from **2018 to today**, where
every node is a song / artist / year / event / theme / mood / entity, and
every edge carries **weight + confidence + source API + model version +
explanation + evidence rows**. Click any edge in the graph explorer to
see the lyric line and matched terms that produced it. Ask the PathPanel
*"How is song X connected to event Y?"* to get a shortest-path traversal
with per-hop evidence. Listen to a year-long narrated summary of
themes and moods in ElevenLabs' Rachel voice.

## Quick start (60 seconds)

```bash
git clone https://github.com/pranaysuyash/musicathon26
cd musicathon26
npm install

# 1. Initialize the database (schema + 10 curated events)
npm run db:init
npm run db:seed-chart

# 2. Fetch lyrics from Musixmatch (150 songs, recovers up to 131
#    in ~90s; the rest are Musixmatch-restricted)
npm run db:fetch-lyrics

# 3. Run the enrichment pipeline (embeddings + GLiNER + themes + events)
npm run py:enrich       # full: 12-15 min with GLiNER
# OR
npm run py:enrich-fast  # skips embeddings + GLiNER: ~1s

# 4. Build similar_to edges
npm run py:similar

# 5. Dev server
npm run dev
# Open http://localhost:3000

# 6. (Optional) Run the artist-match smoke test
npx tsx tools/test-artist-match.ts
```

## The three product flows

1. **"What was the world singing in 2020?"** — `/year/2020`
   Shows the year insight (ElevenLabs narration), theme cloud,
   top songs. Click any song → `/song/[id]` with full lyrics,
   themes, entities, event links.

2. **"How is 'Blinding Lights' connected to COVID-19?"** —
   `/graph` → PathPanel preset "Blinding Lights → COVID-19"
   Returns 1-hop path with full evidence.

3. **"Show me the COVID-19 lockdown graph"** — `/graph?rootType=event&rootId=versesignal:n:event:versesignal:ev:covid_19&hops=1`
   86 nodes, 85 edges in 1 hop. Click any edge for evidence.

## Chart-data framing

- **2018–2019**: U.S. chart-memory mode (Billboard Hot 100 year-end proxies)
- **2020+**: Global streaming mode (Billboard Global 200 / Songstats)
- The 150-song spine is **2018–2023, top 25 per year** from
  Wikipedia year-end lists (curated in `data/chart-seed.ts`)

## Partner API ownership

| Partner | Layer | What it powers |
|---|---|---|
| **Musixmatch** | Lyrics | Foundation: lyrics, richsync (line timestamps), translations |
| **Songstats** | Cultural weight | Chart rank, recent streams, playlist presence → edge weights |
| **ElevenLabs** | Narration | One MP3 per year, voice: Rachel, cached in `data/exports/insights/` |
| **Hugging Face** | Embeddings + NER | `sentence-transformers/all-MiniLM-L6-v2` + `urchade/gliner_medium-v2.1` |
| **Cyanite** | Audio mood (planned) | Client present in `lib/api/cyanite.ts`; needs a key to wire in |
| **JamBase** | Tours/venues (planned) | Client present in `lib/api/jambase.ts`; future tours layer |
| **LALAL.AI** | Stem split (planned) | For user-uploaded audio mode |
| **n8n** | Pipeline orchestration (planned) | Local; can be wired for nightly ingestion |
| **Replit** | Deploy (deferred) | `replit.nix.toml` exists, unverified per user |

## Stack

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind,
  `react-force-graph-2d` for graph viz, ElevenLabs SDK future
- **Data:** SQLite (WAL mode) via `better-sqlite3`
- **NLP:** Python 3.13 (via `uv`) with `sentence-transformers`,
  `gliner`, `spaCy`. See `pyproject.toml`.
- **Intelligence pipeline:** pluggable chain (per decision 0003):
  - Themes: 19-lexicon hybrid with embedding similarity
  - NER: GLiNER (default) with spaCy fallback
  - Mood: lexicon proxy (Cyanite when key present)
  - Events: temporal bucket × thematic overlap × embedding sim
- **Narrative:** ElevenLabs SDK, one TTS per year, voice Rachel
  (`21m00Tcm4TlvDq8ikWAM`)

## Project structure

```
.
├── app/                    Next.js 14 App Router
│   ├── api/                JSON endpoints (year, event, song, graph, path, insight, events, lyrics, edge-evidence)
│   ├── event/[id]/         Event lens
│   ├── graph/              Knowledge graph explorer + PathPanel
│   ├── song/[id]/          Song detail
│   ├── year/[year]/        Year lens
│   └── page.tsx            Landing
├── components/
│   ├── evidence/           Evidence drawer
│   ├── graph/              GraphView + PathPanel
│   ├── lens/               Theme cloud + Year insight player
│   └── ui/                 Primitives
├── lib/
│   ├── api/                Musixmatch, Songstats, ElevenLabs, JamBase, Cyanite clients
│   ├── db/                 SQLite + typed queries
│   ├── graph/              path-finder.ts (in-memory BFS)
│   └── nlp/                theme-lexicon, theme-scoring, ner_labels (Python + TS mirror)
├── scripts/
│   ├── schema.sql          DDL (source of truth for the graph schema)
│   ├── db-init.ts          Run schema.sql
│   ├── seed-chart-data.ts  Hand-curated 150-song Billboard year-end 2018-2023
│   ├── fetch-lyrics.ts     Musixmatch → SQLite
│   ├── enrich.py           sentence-transformers + GLiNER + theme + event linking
│   └── build-similar-edges.py  pairwise cosine → similar_to edges
├── tools/
│   ├── README.md           Tool conventions
│   └── test-artist-match.ts  Smoke test for lyrics-fetch artist verification
├── docs/
│   ├── worklog/            Session logs
│   ├── decisions/          NNNN-title.md, the durable memory (0001-0008)
│   ├── audit/              11-dim audit
│   └── handoff/            Onboarding doc for next agent / judges
├── data/
│   ├── chart-seed.ts       Hand-curated (file whitelisted in .gitignore)
│   ├── versesignal.db      SQLite (gitignored)
│   ├── exports/insights/   ElevenLabs MP3s (gitignored)
│   ├── cache/hf/           HuggingFace model cache (gitignored)
│   └── logs/               Runtime logs (gitignored, kept locally for debug)
├── pyproject.toml          Python deps (uv-managed)
├── .env / .env.example     API keys (gitignored)
├── replit.nix.toml         Replit deploy config (deferred per user)
└── tools/                  Reusable project-local tools
```

## Key design decisions (read these before changing code)

1. **0001 graph-first, not 3D-Earth-first** — the graph is the
   product. 3D Earth (if it ships later) is a reward screen.
2. **0002 evidence-tiered graph edges** — every edge has
   weight, confidence, source API, model version, explanation,
   and ≥1 evidence row. The trust layer is the product.
3. **0003 pluggable intelligence pipeline** — themes via
   lexicon + embedding hybrid; NER via GLiNER (fallback
   spaCy); moods via Cyanite (fallback lexicon). Each layer
   has a documented model + version + fallback.
4. **0004 per-event-category temporal windows** — elections
   are tight (3mo lead-in / 6mo echo); pandemics echo for 2
   years; social movements have 36mo echo.
5. **0005 similar_to edges + Connection Finder** — pairwise
   cosine over lyrics embeddings; BFS shortest path with 30s
   cache.
6. **0006 GLiNER over spaCy for lyric NER** — custom
   music-cultural labels, per-label thresholds, versioned.
7. **0007 Python 3.13 via uv** — `.venv/` is uv-managed;
   `pyproject.toml` is the source of truth.
8. **0008 Cyanite as future audio-mood source** — present as
   `lib/api/cyanite.ts` client but not yet invoked (no key).

## What NOT to do

- **Don't commit `.env`.** It's gitignored. Keep it that way.
- **Don't commit `data/versesignal.db`.** It contains
  Musixmatch-licensed content + ElevenLabs-generated audio.
- **Don't commit `data/exports/insights/*.mp3`.** ElevenLabs
  audio belongs to the Pro plan quota; re-generate per call.
- **Don't add an `any` to the public API surface.** The
  SQLite helpers (`lib/db/sql.ts`) use one; it's contained.
- **Don't use `python3` directly.** Use `uv run --no-sync python`.
- **Don't add a 3D Earth as the front door.** See 0001.
- **Don't add a new top-level route file.** The Next.js
  App Router convention is `app/<resource>/route.ts` (we use
  `app/api/<resource>/route.ts` for JSON). Don't fork this.
- **Don't modify `EVENT_TEMPORAL_WINDOWS` without a
  decision record.** It's a per-event-category tuning table;
  changes have a documented blast radius.
- **Don't modify the GLiNER labels in `lib/nlp/ner_labels.py`
  without bumping `LABELS_VERSION`.** Old rows still
  reference the old version; bumping forces a fresh re-enrich
  and a new `model_version` on every row.

## Final state (VerseSignal)

- **150 songs** (6 years × 25, Billboard Hot 100 year-end 2018–2023)
- **131 songs with Musixmatch lyrics** (87%; 19 restricted upstream)
- **15 curated world events** (10 in P0 + 5 in P9.1: Spotify IPO,
  Capitol Riot, AI Boom/ChatGPT, Taylor Swift Eras Tour, Barbenheimer)
- **6,711 lyric lines**, 984 theme scores, 390 mood scores,
  2,092 entity mentions (1,241 GLiNER, 838 spaCy + GLiNER's
  per-label mix)
- **853 graph nodes**, **3,574 graph edges**, **6,524 evidence rows**
- **15 artists** linked to MusicBrainz (P8.3)
- **83 artists** linked to JamBase MCP (decision 0013) — real
  artist IDs + genres, song page renders them
- **35 artists** linked to Wikidata (decision 0016 — 9 in
  first run + 26 from the multi-artist split re-run; rate
  limit still blocks ~50 more from this IP)
- **33 tests pass** (20 vitest + 13 pytest, `npm run test:all`)
- **4/4 path presets** return valid results; 4-hop path
  p99 = 4.45ms (1000 runs, cached)
- **9/9 surface routes** return 200; path API returns clean 4xx
  with `path_queries` audit log
- **Song page** shows: themes, entities, event connections,
  similar songs, artist (genres + JamBase + MusicBrainz + Wikidata)
- **Path panel** has 5-pill edge-type filter
- **Cyanite webhook receiver** ready (HMAC-verified, awaits key)
- **6 ElevenLabs MP3s** cached for year narration
- **16 decision records** (0001-0016) in `docs/decisions/`

## Verdicts (per 11-dim audit)

- **Merge-ready**: ✅ Yes (TS clean, 33 tests, 12 decisions)
- **Feature-ready**: ✅ Yes (5/5 pages OK, similar-songs
  section, edge-type filter, 15 events, 15 MB-linked artists)
- **Launch-ready**: 🟡 Not yet (paid JamBase/Cyanite keys
  not acquired; mobile visual audit not exhaustive; 4-hop
  path not sample-verified at <100ms)

See `docs/audit/0001-verseignal-11dim-audit.md` for the full 11-dim
review and `docs/handoff/2026-06-16-handoff.md` for next-agent
onboarding.
