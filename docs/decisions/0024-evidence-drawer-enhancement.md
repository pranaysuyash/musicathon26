# Decision 0024 — Enhanced evidence drawer (signal provenance + "because" cards + confidence-as-explanation)

**Date:** 2026-06-17
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Per external review P1.2 + P2.2, the evidence drawer
is the trust layer of the product. A judge should be
able to say **"I understand why this connection exists"**
by clicking an edge in the graph. The previous version
showed evidence as a flat list with a confidence bar.

The new version is a properly layered trust panel:

1. **Why this connection exists** — the connection
   details with confidence as plain English
   ("very high — strong evidence" instead of just a
   bar)
2. **Signal provenance** — surfaces the partner APIs
   that provided the evidence (Musixmatch, Songstats,
   ElevenLabs, GLiNER, etc.) so judges see the
   multi-sponsor integration
3. **Grouped evidence** — by type (Lyric, Mood,
   Embedding, Entity, Chart, Event-window, Metadata),
   with "why it matters" captions per group
4. **Matched-term highlighting** — lyric evidence
   rendered as blockquotes with subtle accent border
5. **Sponsor pill on each card** — every evidence card
   shows which API produced it (M, S, E, H, G, N, R, V
   emoji + full name)

## What shipped

### 1. `components/evidence/evidence-drawer.tsx` (rewritten)

The full component, ~280 lines. Key changes:

- **Source provenance section** with 19 partner API
  labels (Musixmatch, Songstats, GLiNER, sentence-
  transformers, ElevenLabs, spaCy, etc.)
- **Grouped evidence** by `evidenceType` — 10 groups
  with "why it matters" captions:
  - Lyric evidence ("Specific lyric lines that drove
    this connection")
  - Mood evidence ("Audio/emotional mood scores
    supporting this connection")
  - Embedding similarity ("Vector-space proximity to
    the target node")
  - Entity match ("Named-entity overlap")
  - Chart evidence ("The song's chart position or
    year-over-year movement")
  - Event-window overlap ("Temporal alignment with
    the event's date range")
  - Metadata credit ("Artist/label attribution")
  - Lyric terms matched
  - Collaboration credit
  - Other evidence
- **`ExplainLevel` component** — translates confidence
  into plain English:
  - ≥ 0.85: "very high — strong evidence"
  - ≥ 0.65: "high — confident"
  - ≥ 0.45: "moderate — could go either way"
  - ≥ 0.25: "low — speculative"
  - < 0.25: "very low — coincidence"
- **Match-term highlighting** in lyric_line / lyric_term
  evidence: rendered as `<Quote>` icon + serif italic
  + signal-color border-left + dark background
- **Per-card sponsor pill** — every evidence card
  has a small badge showing the source API (emoji +
  full name), e.g. "M Musixmatch 95% conf"

### 2. `/evidence-demo` (dev-only route)

A test page that mounts the `EvidenceDrawer` with
realistic sample data (Blinding Lights → COVID-19)
so the drawer can be screenshotted and verified
visually without needing graph-edge click flow. Renders
at HTTP 200, 372KB screenshot of the full drawer.

## Why this path

Per the external review:
> "Show evidence as 'because' cards. Highlight matched
> lyric terms. Separate 'lyric evidence,' 'event-window
> evidence,' 'embedding/theme evidence,' and 'entity
> evidence.' Show confidence as explanation, not just
> a bar."

This decision implements all four points. The drawer
goes from "list of strings with bars" to "trust panel
that explains the connection in plain English with
sponsor provenance."

Per 0.5 (blast radius), the change is scoped to
`components/evidence/evidence-drawer.tsx`. The shape
of the `Evidence` type doesn't change; only the
rendering. No DB migration; no API change.

## Verified

- TS clean
- 70/70 tests pass (37 vitest + 33 pytest)
- Evidence drawer renders with all 9 evidence groups
- Source badges present (Musixmatch, GLiNER,
  sentence-transformers, Billboard, Lexicon, Manual)
- Confidence levels rendered as plain English
- Screenshot saved: `data/exports/screenshots/evidence-drawer.png`
  (372KB, real content)

## What's next (per the 5-day plan)

- **P2.1 Cultural Signal Brief** — LLM-templated insight
  card for year/event/song
- **P3.1 Data quality dashboard** — `/data-health` page
- **P2.3 Lead/lag analysis** — Lead Signal Rate
- **P1.3 candidate_contexts** — rule-derived
  explanations for each cluster

## Related

- `components/evidence/evidence-drawer.tsx` (rewritten)
- `app/evidence-demo/page.tsx` (dev test page)
- `data/exports/screenshots/evidence-drawer.png`
- `docs/decisions/0022-p0-fixes-and-lens-evolution.md`
- `docs/decisions/0023-guided-story-journey.md`
