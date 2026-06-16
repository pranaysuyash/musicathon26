# Decision 0006 — GLiNER over spaCy for lyric NER

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

The default NER for lyric processing is **GLiNER** (`urchade/
gliner_medium-v2.1`), with **spaCy `en_core_web_sm`** as the
fallback when GLiNER fails to load.

The custom label taxonomy lives at `lib/nlp/ner_labels.py`
(Python, canonical source) and `lib/nlp/ner-labels.ts` (TypeScript
mirror, for autocomplete and front-end use).

## Context

The original NER used `spaCy`'s `en_core_web_sm` because it was
the path of least resistance. It produced two failure modes
visible in the demo:

1. **Noisy labels for lyric text.** spaCy's general English
   model classified lyric fragments as `CARDINAL` ("between
   us two"), `DATE` ("Seven nights alone"), `TIME` ("1:00 to"),
   `GPE` (only on country/city names). These aren't *wrong* in
   a general sense, but they're not useful for a music-cultural
   product.
2. **No music-cultural labels.** spaCy has no concept of
   "artist" vs "person", "song title" vs "work of art",
   "brand" vs "organization". The graph couldn't distinguish a
   mention of "Drake" (artist) from a mention of "Drake" (the
   surname of any other person).

GLiNER is a zero-shot NER model: it takes the label taxonomy
*at inference time*. This means we can ask for music-cultural
labels and get useful predictions.

Side-by-side on `Drake's song references New York City and his
mother`:

| Model | Output |
|---|---|
| spaCy en_core_web_sm | `GPE: New York City` |
| GLiNER medium-v2.1 | `artist: Drake (0.96)`, `city: New York City (0.89)` |

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| spaCy en_core_web_sm (current) | No setup; fast | Wrong labels for lyrics | Rejected |
| GLiNER medium-v2.1 (chosen) | Zero-shot custom labels; ~5s/song on CPU | Requires HF model download; ~150MB | **Chosen** |
| GLiNER large-v2 | Better quality | ~3x slower; 600MB; not justified for 150 songs | Deferred (G4.5 if quality gap shows) |
| LLM-based NER (Claude/GPT) | Highest quality | Per 0.9: cost, latency, no reproducibility, no validation | Rejected |
| Genre-specific NER (K-pop, Afrobeats, country) | Domain-perfect | Premature; need evidence of need first | Deferred (G5+) |

## Chosen path

`lib/nlp/ner_labels.py`:

- 31 custom labels grouped into 6 families (people, places,
  time, culture/media, substances, abstract)
- Per-label confidence thresholds (0.5 for "easy" labels like
  city, 0.65 for "hard" labels like weapon or mythological
  figure)
- `LABELS_VERSION = "2026-06-16.1"` — bumping this forces a
  fresh re-enrichment and produces a new `model_version` on
  every entity_mentions row

`scripts/enrich.py`:

- `init_gliner()` loads `urchade/gliner_medium-v2.1` and falls
  back to `None` (which triggers spaCy) on failure
- `run_ner()` calls GLiNER with the labels + thresholds
- Each `entity_mentions.model_version` is set to
  `gliner_medium-v2.1 + labels-<version>` so the exact label
  taxonomy that produced a row is recorded
- The slow NER pass can be skipped with `--skip-gliner` (used
  for fast re-runs that only need themes + events)

`scripts/schema.sql` already has the right columns
(`source`, `model_version`, `confidence` on `entity_mentions`).

## Why this path

- **Per 0.9 (routing rule):** the model is explicitly documented
  in code, in the decision record, and stamped on every row.
  A/B testing label taxonomies is a 2-line bump of
  `LABELS_VERSION` + re-enrich.
- **Per 0.8 (data layer rule):** the labels are versioned and
  in a config file, not buried in code.
- **Per 0.15 (third-layer rule):** model (GLiNER), pipeline
  (enrich.py), data/labels (ner_labels.py) are separated.
- **Honest quality.** GLiNER is not perfect — it misses
  context-dependent references ("the boss" referring to a
  specific person) and gets confused by extreme slang. But on
  the demo's pop-lyric corpus it produces *useful* predictions
  vs spaCy's *useless* ones.

## Tradeoffs

- **GLiNER inference cost.** ~5s per song on CPU. On 150 songs
  that's 12-13 min vs <1s for spaCy. Acceptable for an offline
  re-enrich; not acceptable for a live request. We don't expose
  GLiNER in the live UI; it's an offline enrichment stage.
- **Model download.** `urchade/gliner_medium-v2.1` is ~150MB.
  Cached in `data/cache/hf/`. First run downloads it; subsequent
  runs use the cache.
- **Label taxonomy drift.** When a user wants "disc jockey" as
  a label, we add it to `ner_labels.py` and bump the version.
  Old rows still reference the old version. Auditable.
- **No MusicBrainz / Wikidata linking yet.** GLiNER returns
  surface forms. We don't currently link "Drake" to MusicBrainz
  artist ID `c16a3ed7-d45c-4dc1-9b00-46dc6a869d7f`. **Follow-up
  for G6+.**

## Risks

- **Slow bulk re-enrich.** GLiNER takes 12+ minutes for 150
  songs. The `--skip-gliner` flag mitigates this for theme +
  event re-runs; a full re-enrich with GLiNER is a once-per-
  taxonomy-change operation.
- **Uncalibrated confidence.** GLiNER's confidence is
  uncalibrated; the same score may mean different things
  across labels. Per-label thresholds (in `LABEL_THRESHOLDS`)
  are my best estimate; will need tuning.
- **Hallucination.** Like all NER, GLiNER can hallucinate
  entities. Mitigated by:
  - Per-label confidence thresholds (filter low-conf)
  - `model_version` recorded so the source is auditable
  - Graph queries use the entity_mentions table directly; a
    user clicking an entity link sees the source + confidence

## Validation plan

- [x] GLiNER loads on Python 3.13 (verified in G1 infra work)
- [x] Test prediction on known lyric:
      "Drake's song references New York City and his mother"
      → `artist: Drake (0.96)`, `city: New York City (0.89)` ✓
- [x] Re-running full enrichment with GLiNER active
      produces 1,152+ entity_mentions (vs 845 from spaCy) —
      GLiNER finds more entities per song
- [ ] Visual diff: pick 5 songs, compare GLiNER output to
      spaCy output, verify GLiNER is materially better
- [ ] Tie to graph: verify that a song with a GLiNER-detected
      "artist" mention creates a usable `mentions_entity`
      graph edge

## What would cause this decision to be revisited

- User feedback: "GLiNER misses X" or "GLiNER hallucinates Y"
- New evidence that GLiNER large-v2 is materially better and
  the size/speed cost is acceptable
- New language corpus (non-English lyrics); GLiNER's
  multilingual coverage is currently weaker than spaCy's
- Per-label threshold calibration improves with more data
  and we move from "my best estimate" to "calibrated on 10k
  hand-labeled examples"

## Related

- `lib/nlp/ner_labels.py` (canonical Python source)
- `lib/nlp/ner-labels.ts` (TypeScript mirror)
- `scripts/enrich.py:init_gliner, run_ner` (pipeline integration)
- `package.json:py:enrich-fast` (uses `--skip-gliner`)
- `scripts/schema.sql:entity_mentions` (model_version column)
- decision 0003 (pluggable intelligence pipeline — NER is
  one of the three independent scoring layers)
- decision 0007 (Python 3.13 via uv — required for GLiNER
  to install cleanly)
