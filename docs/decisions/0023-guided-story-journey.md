# Decision 0023 — Guided "Start the story" journey

**Date:** 2026-06-17
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Add a guided "Start the story" journey that
choreographs the strongest paths through the product,
per the external review P1.1:

1. `/lens/2020` — year signal profile
2. `/event/versesignal:ev:covid_19` — COVID event
3. `/graph?root=...covid_19` — COVID graph
4. `/song/...blinding-lights` — strongest COVID song

The journey is rendered on the home page as a
4-step list. Each step page (lens, event) renders a
"Next in the story →" footer pointing at the next
URL.

## What shipped

### 1. `components/story/story-journey.tsx`

- Exports `STORY_JOURNEY` (the 4-step sequence as
  data, so the same list can be reused anywhere)
- Exports `<StoryJourney />` — the home page list
  with step numbers, titles, descriptions, and
  "why it matters" notes

### 2. `components/story/story-next-step.tsx`

- Client component that reads `usePathname()` and
  finds the current story step
- Renders the "Next in the story →" card pointing
  at the next step
- Returns `null` if not on a story step (e.g., on
  /year/[year] which isn't part of the guided flow)

### 3. Home page integration

- Imports `StoryJourney` and renders it at the bottom
  of the page (after the footer)
- The CTA sequence is now:
  - 2020: signal profile (auto-generated takeaway)
  - COVID: per-event signal deltas (5 shifts)
  - COVID graph: 2-hop neighborhood
  - Blinding Lights: the strongest COVID song

### 4. Lens page integration

- Renders `<StoryNextStep />` at the bottom
- Step 1 (lens) → next is COVID event

### 5. Event page integration

- Renders `<StoryNextStep />` at the bottom
- Step 2 (event) → next is COVID graph

## Plus: schema.sql fix

While adding the new tables (signal_clusters,
cultural_posture, context_signal_correlations) to
`scripts/schema.sql` via `c2 + addition`, the new
CREATE statements ended up after the `INSERT INTO
events` block. SQLite's `executescript()` couldn't
parse this; the `initDb()` call on every home-page
load was failing with "near CREATE: syntax error."

**Fix:**
- Reordered so all CREATE statements come before
  the INSERTs
- Found and fixed a missing semicolon in
  `CREATE INDEX idx_path_queries_to ... (to_id)` (line 339)
- Removed a stray `);` at the end of the file

`schema.sql` now applies cleanly via `executescript()`.

## Plus: smoke test fix

The smoke test for "Levitating (Dua Lipa) → Ukraine
war" used the wrong song ID (`2021:24:levitating-dua-lipa`
— chart rank #24 — but Levitating was the #1 song of
2021, so the correct ID is `2021:01:levitating-dua-lipa`).
Fixed. 17/17 smoke tests pass.

## Verified

- TS clean
- 70/70 tests pass (37 vitest + 33 pytest)
- Home page renders `<StoryJourney />` with all 4 steps
- `/lens/2020` renders `<StoryNextStep />` pointing to
  COVID event
- `/event/...covid_19` renders `<StoryNextStep />` pointing
  to COVID graph
- Fresh screenshot: `data/exports/screenshots/home-with-story.png`
  (1.2MB, real content)
- 17/17 smoke tests pass

## Why this path

Per the external review:
> "The current 'three paths that win' are good: 2020
> year lens, Blinding Lights → COVID-19, and COVID
> lockdown graph. But these should become an explicit
> **guided journey** inside the app."
>
> "Do not make the judge discover the app. Choreograph
> the strongest path."

This decision implements that choreography. The
judge lands on the home page, sees "The story" with
4 numbered steps, clicks the first one, and gets a
guided tour of the product's strongest surface.

## What's next (per the 5-day plan)

- **P1.2 Signal provenance panel** on graph edge click
  (the panel that surfaces Musixmatch / Songstats /
  ElevenLabs / Hugging Face as sponsors)
- **P2.1 Cultural Signal Brief** — LLM-templated
  insight card for year/event/song
- **P2.2 Evidence as "because" cards** — match-term
  highlighting in the evidence drawer

## Related

- `components/story/story-journey.tsx` (data + list)
- `components/story/story-next-step.tsx` (per-page footer)
- `app/page.tsx` (home integration)
- `app/lens/[year]/page.tsx` (lens integration)
- `app/event/[id]/page.tsx` (event integration)
- `scripts/schema.sql` (reordered + missing semicolon fix)
- `tests/smoke-routes.test.ts` (wrong song ID fix)
- `docs/decisions/0022-p0-fixes-and-lens-evolution.md`
