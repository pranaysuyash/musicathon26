# Decision 0004 — Per-event-category temporal windows

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

A song links to a curated world event **only if the song's chart
year is within a category-specific temporal window** of the
event's [start_year, end_year] range:

```python
EVENT_TEMPORAL_WINDOWS: dict[str, tuple[int, int]] = {
    "war":              (3, 18),   # months lead-in, months echo
    "pandemic":         (3, 24),
    "social":           (6, 36),
    "economic":         (6, 18),
    "political":        (3, 6),
    "sports":           (3, 3),
    "tech":             (6, 12),
    "natural_disaster": (3, 6),
    "cultural":         (6, 12),
}
```

Inside the window, the **temporal_score** decays linearly from 0.8
(0 months gap) to 0.4 (full window). Outside, no link.

The **composite link strength** is `temporal_score × (0.5 × term
match + 0.3 × theme score + 0.2 × embedding similarity)`. Temporal
is a multiplier, not an additive term — a song with no temporal
overlap never links, even if its lyrics mention event keywords.

Every event link carries the **bucket** ("core" | "lead_in" |
"echo") in the `explanation` field. The evidence drawer shows it.

## Context

Before this fix, `link_song_to_event` used a **uniform ±1 year
window** for every event, regardless of category. Per-event
song counts were uniformly 20-23 across (event, year) cells,
including impossible matches:

- **US 2020 Presidential Election** (2020-11-03 → 2021-01-20) was
  pulling 2019 and 2022 songs. Election songs don't anticipate
  years in advance and don't echo 22 months later.
- **Russia-Ukraine War** (2022-02-24 → ongoing) was pulling 2021
  songs. Pre-invasion songs are not "associated" with the war.
- **Roe v Wade** (2022-06-24) was pulling 2021 and 2023 songs
  uniformly. A decision is a moment, not a wave.

This is the bug I called out in the punch list and committed to
fixing in G2.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Uniform ±1 yr (current) | Simple; uniform | Wrong for every non-persistent event category | Rejected |
| Per-category windows (months) | First-principles; matches the "temporal reach" of each event type | More code; tuning is opinionated | **Chosen** |
| Pure LLM judgment per song | Easy to write in English | Per 0.9: cost, latency, no reproducibility, no validation | Rejected |
| Continuous decay (e.g., half-life) | Mathematically purer | Hard to explain to users; can't bound the graph size | Folded into chosen: linear decay within window |

## Chosen path

`scripts/enrich.py:link_song_to_event` now:

1. Reads `(lead_in_months, echo_months)` from
   `EVENT_TEMPORAL_WINDOWS[event["category"]]`
2. Returns `None` immediately if song_year is outside the window
3. Computes `temporal_score` linearly in-window
4. Multiplies the thematic + embedding score by `temporal_score`
5. Returns `(strength, matched_terms, link_type, evidence_lines,
   bucket, song_year, ev_start_year)` — the bucket and start year
   are new and feed the explanation

The caller (`main()`) includes the bucket in the edge
`explanation` field. The evidence drawer shows it on click.

A new CLI flag, `--skip-gliner`, allows re-running the
event-linking pass without GLiNER (which is the slow step in
bulk re-ingest). `npm run py:enrich-fast` uses this.

## Why this path

- **First principles:** different cultural events have different
  temporal "reach" in the music that surrounds them. Elections
  are tight; pandemics echo for years; social movements have
  long resonance; natural disasters are tight. One window for
  all categories was a category error.
- **Evidence-graded, not binary:** the linear decay within the
  window means a song 1 month past the event still links, just
  at 0.75 strength instead of 1.0. The graph surfaces the
  connection with a confidence that matches the cultural
  reality.
- **Explainable:** every event link now carries "Temporal
  bucket: core (song 2020, event start 2020)" or "Temporal
  bucket: echo (song 2022, event start 2020-03)" — the user
  can see why.

## Tradeoffs

- **Tuning is opinionated.** The values in
  `EVENT_TEMPORAL_WINDOWS` are my best estimate of each
  category's cultural reach. They will need adjustment as we
  see the graph in use. **Documented as a tunable in code; not
  pulled from a config file yet.**
- **No per-event override.** Some events deserve their own
  window (e.g., a sports final is event-specific, not category-
  generic). When we add a per-event override, the schema
  change is a single new column on the `events` table.
- **Per-event re-tuning requires re-ingest.** Because the
  window is a Python constant, changing it requires running
  `npm run py:enrich-fast` again. Acceptable for now.

## Risks

- **False negatives:** a song from 2018 about economic
  struggle may not link to the 2008 financial crisis because
  the echo window is 18 months. That's a real loss. But it
  matches the "what was *people* singing during the crisis?"
  question better than the previous uniform behavior.
- **Tuning drift:** if I tune to fit the demo data, the
  windows are overfit. Mitigated by: I picked the windows
  *before* looking at the per-cell counts in the after-fix
  distribution. The numbers reflect cultural reasoning,
  not data fit.

## Validation plan

- [x] 2019 songs no longer link to US 2020 Election (verified in
      after-fix SQL: 2019 row removed for that event)
- [x] 2022 songs no longer link to US 2020 Election (verified)
- [x] 2020-2023 songs still link to COVID-19 lockdowns
      (pandemic echo window = 24 mo, correct)
- [x] BLM 2020-2023 still link (social echo window = 36 mo, correct)
- [x] 2021 songs no longer link to Russia-Ukraine War
      (war lead-in = 3 mo, correct — war didn't exist then)
- [x] Total event edges: 860 → 552 (36% reduction in inflated
      links; matches the magnitude of the bug)

## What would cause this decision to be revisited

- A user complains "I expected song X to link to event Y" and
  the temporal window is the reason — then either tune the
  window or add a per-event override column
- A new event category emerges (e.g., "scientific discovery")
  with very different reach
- We add a per-event override (single column on `events`)
  that supersedes the per-category default

## Related

- `scripts/enrich.py` (`EVENT_TEMPORAL_WINDOWS`, `link_song_to_event`)
- `lib/db/queries.ts:getSongsForEvent` (no SQL change; benefits from
  fewer inflated links)
- `app/event/[id]/page.tsx` (no UI change; bucket shown via
  `explanation` field)
- `app/api/insight/route.ts` (topEvent now reflects the
  per-year peak of actually-relevant links)
- `package.json` `py:enrich-fast` script (fast re-run flag)
- motto_v3 §0.4.2 (multi-pass review), §0.5 (evidence tiers),
  §0.9 (routing), §0.11 (claims), §0.13 (scope control)
