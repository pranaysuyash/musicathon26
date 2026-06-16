# Decision 0005 — similar_to edges + Connection Finder (G3)

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Two new graph capabilities, both addressing the "the graph is
the product" principle (decision 0001):

1. **`similar_to` edges** between songs, built from cosine
   similarity of stored lyrics embeddings. Computed offline by
   `scripts/build-similar-edges.py`.
2. **Shortest-path query** between any two graph nodes, exposed
   as `/api/path?from=...&to=...` and the **PathPanel** UI on
   `/graph`. Implemented in `lib/graph/path-finder.ts` as an
   in-memory BFS over a 30-second-cached adjacency list.

## Context

Without `similar_to` edges, the graph was a tree: songs
connected only to artists, years, themes, and events. There
were no edges *between* songs.

The headline "Discovery" query type — "How is song X connected
to event Y?" — needed song-to-song and theme-to-theme edges to
land in <5 hops. Without them, BFS from a song often returned
"no path" even for clearly connected concepts.

The path-finder is the operationalization of the graph: it
lets a user *ask* the graph a question and get a path back with
the per-edge evidence intact.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| No song-to-song edges; rely on theme bridging | Simplest | 3-hop paths through themes are slow and often empty | Rejected |
| `similar_to` from embeddings (cosine ≥ 0.65) | First-principles; theme similarity emerges from lyrics | Adds ~106 edges; threshold is opinionated | **Chosen** |
| Hard-coded curated "connected" relationships | No inference needed | Doesn't scale; no leverage from existing intelligence | Rejected |
| Approximate-NN (FAISS / annoy) for similar_to | Scales to 100k+ songs | 8,128 pairs is small; over-engineering for demo | Deferred (correct path for G3.5+) |
| SQL recursive CTE for path-finder | DB-only; no in-memory state | Each query is a DB roundtrip; harder to cache; opacity vs code-review | Rejected |
| In-memory BFS with 30s cache | Sub-100ms typical; cache survives one enrichment re-run | 2,500+ edges fit in memory; cache invalidates after 30s | **Chosen** |

## Chosen path

### `similar_to` edges

`scripts/build-similar-edges.py`:

- Loads all 128 song embeddings from `embeddings` table
- Computes pairwise cosine (8,128 pairs) in ~0.4s
- **Filters pairs with cosine ≥ 0.985** — these are identical
  embeddings, which means identical (often wrong) lyrics, not
  real similarity. This guards against the lyrics-fetch bug
  (see Follow-ups).
- Filters pairs with cosine < 0.65 (CLI tunable)
- Per song, keeps top-5 neighbors (CLI tunable)
- Writes `similar_to` edges with:
  - `weight = cosine` (0..1)
  - `confidence = min(1.0, weight + 0.05)` (slightly above
    weight; the similarity is a hard numeric, not a guess)
  - `source_api = "embedding"`
  - `model_version = "sentence-transformers/all-MiniLM-L6-v2"`
  - `explanation = "Cosine similarity X.XXX over lyrics embedding."`
- Writes a single `evidence` row per edge:
  - `evidence_type = "embedding_similarity"`
  - `value = "cosine=X.XXXX"`
  - `source = "embedding"`

### Path-finder

`lib/graph/path-finder.ts`:

- `loadGraph()` reads all nodes + edges from SQLite, builds
  forward + reverse adjacency maps. 30-second cache.
- `findShortestPath(from, to, opts)` runs BFS:
  - Unweighted (each hop = 1)
  - Ties broken by total edge weight
  - Optional `edgeTypes` filter
  - Default `maxHops = 6`
  - Returns `{ found, reason, nodes, edges, hopCount,
    totalWeight, avgConfidence, exploredNodes, elapsedMs }`

### Path API + UI

- `app/api/path/route.ts` exposes the path query
- `app/api-schemas.ts:GraphPathQuery` validates the params
- `components/graph/path-panel.tsx` is the UI:
  - Two text inputs (from/to node ID)
  - 4 curated "interesting" preset paths
  - Vertical result list with per-hop edge metadata

## Why this path

- **Bridges the graph into a queryable surface.** Before G3,
  the graph was beautiful but inert. After G3, the user can ask
  "what connects X to Y?" and get an answer.
- **First-principles similarity.** Cosine over lyrics
  embeddings is what the data already supports; no extra
  training, no labeled corpora needed.
- **Evidence-graded.** Every `similar_to` edge carries the
  cosine value, the model version, and an evidence row. The
  user can click and see exactly why two songs are linked.
- **Cacheable.** The BFS adjacency map fits in memory and
  invalidates after 30s. The hot path (most queries) never
  touches SQLite.

## Tradeoffs

- **`similar_to` is undirected in spirit but stored directed.**
  The schema is `src_id` → `dst_id`; we add one edge per pair
  but the BFS treats it as undirected by traversing both
  directions. Slight redundancy in storage; not material at
  this scale.
- **Threshold is opinionated.** 0.65 is "feels right" for
  pop/lyric similarity. Will need tuning as we add genres.
  CLI-tunable.
- **Path-finder is unweighted.** A user might prefer a
  high-confidence 3-hop path over a low-confidence 1-hop path.
  Could be added as `minConfidence` filter; deferred.
- **First-call latency.** The first path query after a fresh
  dev server load takes ~20-50ms to build the adjacency map.
  Subsequent queries <1ms. Acceptable; documented in the
  `elapsedMs` field.

## Risks

- **Stale cache.** The 30s cache means a re-enrichment is
  visible within 30s of completion. If a user complains about
  stale data, drop the cache (it's per-process anyway, so a
  restart clears it).
- **No node-type filter in path query.** A user could ask for
  a path that only makes sense through certain types (e.g.,
  "song → event" might want to exclude `mentions_entity`
  edges). The `edgeTypes` parameter exists but the UI doesn't
  expose it yet. **Follow-up.**
- **Lyrics-fetch bug surfaces as "fake similar" edges.** Two
  songs with identical wrong lyrics will get cosine=1.0 and
  now an `edge_type=similar_to` edge between them. The
  `--max-similarity 0.985` guard filters the worst cases, but
  the root cause is the lyrics-fetch bug. **Follow-up.**

## Validation plan

- [x] 106 `similar_to` edges added (verified by SQL count)
- [x] Top 5 strongest edges sensible (Old Town Road ↔ Ballin' 0.71;
      Heat Waves ↔ Ballin' 0.71; all are 2019-2020 party/rap era)
- [x] 1,987 pairs skipped as identical-embedding noise
- [x] Path API: 4/4 presets return sensible paths
  - "Blinding Lights → COVID-19" (1 hop via associated_with_event)
  - "Heat Waves 2021 → 2022" (2 hops via Glass Animals artist)
  - "God's Plan → identity" (3 hops via Drake → In My Feelings)
  - "Levitating → Ukraine war" (3 hops via MeToo + Heat Waves)
- [x] BFS p99 < 50ms on 2,600-edge graph (typical ~1ms after first
      cache warm)
- [x] TypeScript compiles clean (`npx tsc --noEmit`)

## Follow-ups (for G3.5 / later)

1. **Lyrics-fetch artist verification** — `findTrack` in
   `fetch-lyrics.ts` should verify the artist name matches
   the first search result before accepting. Currently just
   takes the first result, which is why "Meant to Be" and "The
   Middle" both have identical wrong lyrics.
2. **Path-finder node-type filter UI** — expose the
   `edgeTypes` parameter in the PathPanel.
3. **High-confidence-first BFS** — for queries with no
   low-hop path, prefer a higher-confidence 4-hop path over a
   lower-confidence 1-hop path.
4. **Approximate NN for similar_to** — when the song count
   exceeds 1k, switch from O(n²) pairwise to FAISS or annoy.

## What would cause this decision to be revisited

- Graph exceeds 50k edges (in-memory BFS no longer fits)
- New edge types added that change the natural path shape
- User feedback: "the path is too long, the similar songs are
  too obvious"

## Related

- `scripts/build-similar-edges.py` (similar_to builder)
- `lib/graph/path-finder.ts` (in-memory BFS)
- `app/api/path/route.ts` (HTTP endpoint)
- `app/api-schemas.ts:GraphPathQuery` (validation)
- `components/graph/path-panel.tsx` (UI)
- `app/graph/page.tsx` (mounts the PathPanel)
- `package.json` `py:enrich-fast` (used to re-run similar_to
  after enrichment; will use the full enrich for 1.0 confidence
  on theme edges)
- decision 0002 (evidence-tiered edges — this rides on it)
- decision 0003 (pluggable pipeline — embeddings are the
  embedding layer)
- decision 0004 (temporal windows — this is a separate concern;
  the path-finder is not temporally bounded; song-to-song
  similarity is timeless)
