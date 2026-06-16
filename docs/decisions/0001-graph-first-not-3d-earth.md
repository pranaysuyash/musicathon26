# Decision 0001 — Graph-first, not 3D-Earth-first

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

The graph is the primary product surface. The 3D Earth (globe.gl)
is **out of scope** for the v1 demo. If shipped later, it is a
**reward screen** that appears *after* a graph query resolves, not a
navigation front door.

## Context

Two competing directions were on the table:

1. **Song-as-3D-world** — every song becomes a navigable 3D scene
   built from lyrics, themes, entities, mood; the camera moves
   through the song's emotional "rooms."
2. **Song-as-node-in-graph** — every song is a node in a knowledge
   graph; themes, entities, artists, events, and time are also
   nodes; edges carry evidence and confidence; the UI is a graph
   explorer with year/event lenses.

Both are valid. Both have been sketched in earlier planning
documents. We have 8 days of build time and a 150-song demo window.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| 3D-Earth first | Visually arresting; novel; demo-friendly | 3+ days for globe.gl polish; not the product's differentiator; world-class lyrics sites already do this poorly | Rejected |
| Graph first, Earth second | Graph is the actual differentiator (lyrics-as-cultural-signal is novel); Earth becomes polish when graph is solid | Graph UI is less "wow" out of the box | **Chosen** |
| Graph only, no Earth | Ship faster | Earth adds optional polish; doesn't block | Folded into chosen |

## Chosen path

`app/graph/page.tsx` is the primary product surface. It uses
`react-force-graph-2d` for the visual layer. Every edge click
opens an evidence drawer (lyric line + model + confidence).

If shipped later, `app/earth/[...]/page.tsx` would be a *second*
visualization of the same data, not a separate product. Same
queries, different renderer.

## Why this path

- The product's actual moat is the **edge quality** (per 0.11
  customer-facing claims rule — don't overclaim; 3D is overclaim,
  graph is honest).
- 3D Earth as front door would compete with Spotify's actual
  canvas, YouTube's immersive, etc. — we lose that race.
- The graph can be re-skinned, re-rendered, re-exported
  (CSV, GraphML, paper figures) without touching the data layer.
  A 3D Earth is a single visual; less leverage.
- Evidence drawer is the trust layer (per 0.14 operator workflow
  rule — the user must be able to explain what they see). A 3D
  Earth hides provenance; a graph exposes it.

## Tradeoffs

- **Visual impact:** 3D Earth would have hit harder in a 30-second
  demo. We compensate with the **named-event link** — "Show me
  2020 as a graph" lands the same emotional beat.
- **Reusability:** graph is renderer-agnostic; Earth is not.
- **Effort saved:** ~2–3 days. Reinvested in G2/G3/G4 (edge quality,
  Connection Finder, GLiNER).

## Risks

- A judge expecting 3D Earth may mark the demo as "less ambitious."
  Mitigated by the long-term architecture argument: the graph
  enables Earth, the inverse is not true.
- The graph needs to actually deliver insight at first glance.
  If it doesn't, the visual deficit compounds. Mitigated by the
  Year/Event/Graph three-surface handoff.

## Validation plan

- [x] `/graph?rootType=event&rootId=...covid_19&hops=1` renders 86 nodes / 85 edges (Tier 5)
- [x] Click any edge → evidence drawer opens with lyric line, model, confidence (Tier 4)
- [x] `/year/2020` page shows dominant themes (identity, grief, love) with sensible scores (Tier 4)
- [x] ElevenLabs narrated insight cached for each year (Tier 5)

## Rollback

If graph demo fails, Earth can be added in 1 day by plugging
globe.gl into `/graph` page as a "view mode" toggle. Schema
already has lat/long placeholder fields on events
(`event.properties_json` → could add `venue_lat`, `venue_lng`).

## What would cause this decision to be revisited

- User explicitly requests Earth
- 5+ days of runway after graph is solid
- Earth becomes a JamBase-fed concert/tour visualization, not a
  chart-song visualization

## Related

- `app/graph/page.tsx`
- `components/graph/graph-view.tsx`
- `components/evidence/evidence-drawer.tsx`
- `lib/db/queries.ts` (recursive-CTE `getNodeNeighborhood`)
- motto_v3 §0.11 (don't overclaim)
