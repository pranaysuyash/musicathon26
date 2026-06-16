# Decision 0008 — Cyanite as future audio-mood source (not yet wired)

**Date:** 2026-06-16
**Status:** Deferred (no key in this build)
**Owner:** VerseSignal agent

## Decision

Cyanite.ai is the planned source of **audio mood** (mood from
the audio signal, not the lyrics). When a `CYANITE_API_KEY` is
configured, the enrichment pipeline will:

1. For each song with a Spotify track ID (or a fetched audio
   URL), call Cyanite's `/analyze` endpoint
2. Store the result in `mood_scores` with `source = "cyanite"`
   and `model_version = "cyanite-v1"`
3. Map Cyanite's Mood Matrix to our 10-mood schema and average
   with the existing lexicon-proxy scores

The `lib/api/cyanite.ts` client is present but **not yet
called** — no key was provided for this build.

## Context

The current mood pipeline (`enrich.py:mood_scoring`) is a
**lexicon proxy**: 10 mood labels × ~10 hand-picked terms each.
It works for the demo but is not real audio analysis.

Cyanite is the partner-listed audio-mood provider. Their
schema is "mood + energy + valence + arousal + genre + BPM + key
+ confidence." Mapping to our 10-mood schema is non-trivial
(see `mapCyaniteToOurMoods`).

Per motto_v3 §0.9 (routing rule), the model choice is product
architecture. Per §0.15 (third-layer rule), the audio layer
(model = Cyanite) is separate from the lyrics layer (lexicon,
embeddings, GLiNER). The schema accommodates both.

Per §0.6 (risk-based verification), the lexicon proxy is the
**fallback** for the audio mood — not a permanent replacement.
The fallback path must remain correct.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Lexicon proxy only (current) | Free; fast; works offline | Not real audio mood | Fallback only |
| Cyanite when key present (chosen) | First-partner audio mood; real signal | Cost per call; key required | **Chosen** |
| Spotify audio features (valence, energy) | Free with Spotify token | Limited to Spotify-tracked songs; lower quality | Deferred (G5+) |
| Self-host an audio model (Essentia, MusicNN) | No key; reproducible | Heavy compute; not in scope | Rejected for hackathon |
| LLM listening to audio (Gemini, Claude) | Highest quality | Cost; not reproducible; not appropriate | Rejected |

## Chosen path

`lib/api/cyanite.ts`:

- `getAudioAnalysis({ spotifyTrackId, audioUrl })` — single
  Cyanite call with a 15s timeout; returns null on failure
- `mapCyaniteToOurMoods(c)` — Cyanite Mood Matrix → our
  10-mood schema (max-pool across semantic neighbors)
- Not yet called from `enrich.py`; the integration is the
  next batch of work when a key is available

`scripts/enrich.py`:

- The current `mood_scoring` continues to populate
  `mood_scores` with `source = "lexicon"`. When Cyanite is
  wired in, the new source will be `"cyanite"`. Multiple
  sources can coexist; queries average or pick the highest-
  confidence source per song.

`scripts/schema.sql`:

- `mood_scores.source` already accepts any string; no
  migration needed.
- `mood_scores.model_version` already exists.

## Why this path

- **No schema change.** The Cyanite integration is a pure
  additive — new rows with `source = "cyanite"`, never
  overwriting the lexicon rows.
- **Per-0.9 fallback chain:** when Cyanite fails (key missing,
  rate limit, network), the lexicon proxy is still in the
  table. The graph view doesn't care which source it reads.
- **Per-0.10 observability:** if Cyanite starts returning
  high-confidence audio mood, the change is visible in the
  per-source breakdown.

## Tradeoffs

- **Cost.** Cyanite's free tier is limited; the partner
  likely gives hackathon credits. We don't know the quota yet.
- **Latency.** ~500-1500ms per call, plus polling if
  Cyanite is async. Bulk re-enrich for 150 songs could take
  5-10 min just for audio. **Acceptable for offline
  enrichment; would be unacceptable for a live request.**
- **Mapping quality.** The `CYANITE_TO_OURS` table is
  my best guess. May need adjustment after seeing real
  Cyanite outputs.

## Risks

- **Key not yet configured.** No CYANITE_API_KEY in `.env`.
  Build is currently running on the lexicon proxy. **No
  user-visible degradation**; mood scores still populate.
- **Cyanite schema drift.** If Cyanite changes their Mood
  Matrix, our mapping breaks. The `model_version` recorded on
  every row makes the breakage auditable.
- **Cost overrun.** If the Cyanite call is unpriced, we
  could burn through credits. **Mitigation:** add a
  `--max-cyanite-calls N` flag to `enrich.py` and a
  per-song cache by `spotify_track_id`.

## Validation plan

- [ ] When CYANITE_API_KEY is configured, run `py:enrich`
      on a 3-song subset, verify Cyanite rows land in
      `mood_scores` with `source = "cyanite"`
- [ ] Verify lexicon rows are NOT overwritten
- [ ] Verify `mapCyaniteToOurMoods` produces sensible values
      on a real Cyanite response

## What would cause this decision to be revisited

- Cyanite pricing or terms change
- A cheaper / better audio-mood source becomes available
- We add a real Spotify token and can use Spotify audio
  features for free
- User feedback: "the mood labels don't match what I hear"

## Related

- `lib/api/cyanite.ts` (client + mapping)
- `scripts/enrich.py:mood_scoring` (lexicon proxy, the
  fallback)
- `scripts/schema.sql:mood_scores` (schema, already
  supports multi-source)
- decision 0003 (pluggable intelligence pipeline — audio mood
  is a future layer, alongside lexicon/embeddings/GLiNER/LLM)
- decision 0008 (companion: this is the audio side; 0003 is
  the lyrics side; both feed the same `mood_scores` table)
