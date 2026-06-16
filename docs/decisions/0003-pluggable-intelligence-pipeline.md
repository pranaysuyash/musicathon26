# Decision 0003 — Pluggable intelligence pipeline (lexicon / embedding / LLM fallback chain)

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

The enrichment pipeline is structured as **three independent
scoring layers** with explicit fallbacks. Every layer produces
the same schema (`{score, confidence, source, model_version,
evidence}`) so the consumer doesn't care which layer won.

| Layer | Purpose | Primary | Fallback | When used |
|---|---|---|---|---|
| Theme | "What is this song *about*?" | Lexicon (19 themes, hand-curated) + sentence-transformers (cosine to theme centroids) | LLM structured extraction (only for metaphors GLiNER misses) | Always |
| NER | "What *entities* does this song name?" | GLiNER medium-v2.1 (zero-shot custom labels) | spaCy en_core_web_sm | Always (GLiNER is now default; spaCy is G4 fallback path) |
| Mood | "How does this song *feel*?" | Lexicon proxy (10 moods) | Cyanite audio mood (when key present) | Lexicon now; Cyanite in G5 |
| Event | "Which *world events* did this song overlap?" | Temporal bucket × thematic overlap × embedding similarity | LLM structured extraction (only for metaphor-heavy events) | Always |

## Context

The temptation in a hackathon is to throw one LLM at everything
and call it done. That fails for three reasons (motto_v3 §0.9
prompt/model/routing rule, §0.15 third-layer rule):

1. **Cost & latency:** an LLM call per song is ~10–30s and
   non-trivial $. We have 150 songs; we'd burn 30 minutes and
   $$ for ingest.
2. **Reproducibility:** LLM outputs drift. A graph built
   yesterday may not be reproducible today without prompt
   versioning. Lexicons are stable.
3. **Confidence calibration:** LLMs are over-confident on
   ambiguous inputs. A lexicon+embedding hybrid score is
   calibrated against an explicit evidence count.

Per §0.9, every model-backed feature must document:
task type, expected reasoning pattern, selected model, model
provider, temperature, input contract, output schema, validation
rule, fallback behavior, retry behavior, cost sensitivity,
latency sensitivity, failure mode, escalation path,
observability.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| One LLM for everything | Simple, single API | Cost, latency, drift, no validation | Rejected |
| One deterministic model (e.g., GLiNER only) | Reproducible, fast | Misses themes, no audio mood | Rejected |
| Pluggable chain with documented fallbacks | Best of each; future-swappable; cost-aware; tiered confidence | More code; more places for drift | **Chosen** |

## Chosen path

**Per the 0.15 third-layer rule:**

- **Model layer** — sentence-transformers, GLiNER, spaCy,
  Cyanite (future), LLM (future for hard cases only)
- **Pipeline layer** — `scripts/enrich.py` orchestrates the
  layers, writes to SQLite with provenance
- **Data/configuration layer** — `lib/nlp/theme-lexicon.json`
  (themes + terms), `lib/nlp/ner-labels.ts` (GLiNER custom
  labels, G4), `lib/nlp/theme-scoring.ts` (lexicon scoring
  logic), `lib/nlp/THEME_SEEDS` (in `scripts/enrich.py` for
  embedding centroids)

**Per the 0.9 routing rule:** every model call carries
`model_version` into the DB. If we re-run with a different
GLiNER model, we can A/B against the old version via SQL.

**Per the 0.9 fallback rule:**
- GLiNER fails to load → fall back to spaCy, log a warning,
  mark `source_api='spacy'` on all entity rows. The system
  still works; quality is lower.
- sentence-transformers fails to load → no theme embedding
  component; theme scores fall back to lexicon-only
  (multiplied by 0.7 in the formula). Documented in
  `enrich.py:theme_scoring`.
- ElevenLabs fails to synthesize → no MP3; the insight page
  renders the text only with a warning.
- LLM call (when used for hard cases) fails → log, drop the
  evidence row, continue.

## Why this path

- **Cost-aware:** lexicon scoring is free; embeddings are
  ~2s/song on CPU; GLiNER is ~5s/song; LLM is ~10–30s. We
  spend the expensive models only where the cheap ones are
  insufficient.
- **Reproducible:** the lexicon is committed. Re-running
  `enrich.py` with the same lexicon + same model versions
  produces the same scores (modulo embedding floating-point
  non-determinism, which is bounded).
- **Upgradable:** swapping GLiNER medium → GLiNER large in
  G4 is a one-line change in `init_gliner()`. The schema
  already records the version.
- **Explainable:** every score has a `source` field. Users
  can see "this theme score came from the lexicon" vs.
  "this came from semantic similarity."

## Tradeoffs

- **More code than one-LLM-fits-all:** ~200 lines of
  `theme_scoring.ts` + ~150 lines of `enrich.py` theme
  section. Worth it.
- **Lexicon maintenance:** the 19-theme lexicon is
  hand-curated. As we add genres (K-pop, country, Afrobeats),
  we'll need to extend. Documented as a follow-up.
- **Theme centroids in code, not data:** the
  `THEME_SEEDS` dict lives in `enrich.py`. Per 0.8, this
  should move to a JSON file once it stabilises. G4 follow-up.

## Risks

- **Lexicon bias:** the 19 themes are English-language and
  pop-music-centric. Lyrics in other languages will under-score.
  Not in scope for the demo (data is English) but documented
  for future expansion.
- **GLiNER model deprecation:** `urchade/gliner_medium-v2.1`
  may be superseded. Model version recorded in every row.
- **Embedding drift:** `all-MiniLM-L6-v2` may be re-trained.
  Re-running produces a different graph; old edges stay
  stamped with the old model version.

## Validation plan

- [x] Lexicon scoring runs in <1s per song (Tier 5)
- [x] GLiNER loads on Python 3.13 and predicts
      "Drake" → artist (0.96), "New York City" → city (0.89)
      (Tier 4)
- [x] Embedding cosine + lexicon hybrid runs in ~7s/song
      (Tier 5 on 150-song corpus = ~8.3s with both loaders warm)
- [ ] Cyanite audio mood — pending (G5)

## What would cause this decision to be revisited

- Lexicon is too coarse for non-pop genres
- LLMs become cheap enough to dominate (revisit the lexicon
  share of the score)
- New event type emerges (e.g., scientific discovery) that
  has no lexicon term

## Related

- `lib/nlp/theme-scoring.ts`
- `lib/nlp/theme-lexicon.json`
- `scripts/enrich.py` (orchestration + fallback chains)
- motto_v3 §0.8, §0.9, §0.15
- Follow-up: G4 (GLiNER labels file), G5 (Cyanite)
