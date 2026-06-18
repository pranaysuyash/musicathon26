# Decision 0025 — Cultural Signal Brief (the analysis engine, not just data viz)

**Date:** 2026-06-17
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Per external review (Day 3 of the 5-day plan), add
the **Cultural Signal Brief** — a 6-paragraph evidence-
backed narrative explaining what the charts were doing
in a given year. This is the feature that turns the
graph from "data viz" into "analysis engine."

The brief is template-first, not LLM-derived. It uses
the existing data (`year_signal_profiles`,
`context_signal_correlations`, `cultural_posture`) to
build a structured narrative. An LLM can be plugged in
later as a refinement layer.

## What shipped

### 1. `getCulturalSignalBrief(year, region)` in `lib/db/queries.ts`

A server-side function that returns 6 sections:

1. **The chart's emotional weather** — top 3 moods with
   deltas vs the prior 3-year baseline
2. **What the lyrics kept returning to** — top 3 themes
   with song counts
3. **The names that kept appearing** — top 3 entities
4. **What the world was going through** — events
   overlapping the year
5. **How chart music related to those events** —
   cultural_posture distribution (escape %, reflection
   %, etc.)
6. **The single biggest shift** — the (event, signal)
   pair with the largest |delta| in the year

Each section includes `evidenceSongIds` (the actual
songs that drove the signal) and `evidenceSignalIds`
(the canonical signal IDs).

### 2. Lens page integration

`app/lens/[year]/page.tsx` is now an async server
component. It calls `await getCulturalSignalBrief(year)`
and renders the brief as the new hero section, replacing
the single-line "cultural takeaway" with a multi-section
narrative.

Each section is rendered with:
- Step number (1–6) in a signal-color badge
- Heading (the section title)
- Body (the narrative paragraph)
- Cited songs (extracted from the IDs)
- "Auto-generated; not human-edited" footer

### 3. Sample brief (2020)

> **The cultural signal brief**
> A 6-paragraph narrative of what the charts were doing in 2020, evidence-backed.
>
> **1. The chart's emotional weather**
> Chart music in 2020 was led by energetic (20 chart songs),
> with melancholic and celebratory close behind. Compared
> to the prior 3-year baseline, the mood profile shifted:
> energetic +56%, melancholic +174%, celebratory +13%
> ...
>
> **5. How chart music related to those events**
> Of 237 (song, event) pair classifications in 2020: escape
> 44%, processing 30%, coincidence 22%, reflection 5%.
> The dominant pattern is the headline of the year.
>
> **6. The single biggest shift**
> During MeToo movement, the mood "celebratory" shifted
> up 669% vs the prior 3-year baseline. This is the
> largest single signal movement in the year.

The **escape 44% vs reflection 5%** finding is the
headline of the year: chart music mostly ran away from
the world in 2020, not reflected it. This is the kind
of insight the lens page is built to surface.

## Why this path

Per the external review:
> "Add one serious intelligence feature: 'Cultural
> Signal Brief'. For any year/event/song, generate a
> concise explanation: dominant emotional themes, which
> lyrics support it, which events overlap, strongest
> graph paths, surprising connection, confidence caveat.
> This can be template-first and optionally LLM-powered.
> It turns the graph from 'data viz' into 'analysis
> engine.'"

This decision implements the template-first version.
The data alone (no LLM) produces a credible narrative.
Adding an LLM later is a refinement, not a replacement.

Per 0.5 (blast radius), the change is scoped to:
- New function in `lib/db/queries.ts`
- New lens page section (replaces the old takeaway)
- No DB migration; no API change

## Tradeoffs

- **Single-section, no paragraphs yet** — the brief is
  six 1-paragraph sections, not a multi-paragraph essay.
  Per 0.13 (scope control), the multi-paragraph version
  is a follow-up.
- **No LLM refinement** — the wording is template-driven.
  An LLM could rewrite the body paragraphs in more
  literary language, but that's a separate iteration.
- **No contradictory / surprise findings** — section 5
  reports the posture distribution but doesn't yet
  call out specific contradictions (e.g., "2020 had
  5 songs with explicit party/celebration themes despite
  lockdowns"). Future: detect "high escape + serious
  event" and call it out.

## Verified

- TS clean
- 70/70 tests pass
- All 6 sections render in the lens page
- Cited songs extracted from evidence IDs
- Sample brief for 2020 reads naturally:
  - "Chart music in 2020 was led by energetic (20 chart songs)"
  - "Of 237 (song, event) pair classifications in 2020: escape 44%, processing 30%, coincidence 22%, reflection 5%"
  - "During MeToo movement, the mood 'celebratory' shifted up 669%"
- Screenshot: `data/exports/screenshots/lens-2020-brief.png` (1.5MB,
  real content)

## What's next (per 0019)

- **P1.3 candidate_contexts** — rule-derived explanations
  for each cluster (L2 follow-up)
- **P2.1 region-aware events** — add geography to events
- **P2.3 lead/lag analysis** — Lead Signal Rate
- **P3.1 data quality dashboard** — `/data-health`

## Related

- `lib/db/queries.ts:getCulturalSignalBrief` (new)
- `app/lens/[year]/page.tsx` (async + brief section)
- `data/exports/screenshots/lens-2020-brief.png` (1.5MB)
- `docs/decisions/0024-evidence-drawer-enhancement.md`
- `docs/decisions/0023-guided-story-journey.md`
- `docs/decisions/0022-p0-fixes-and-lens-evolution.md`
