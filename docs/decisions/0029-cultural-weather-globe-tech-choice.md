# Decision 0029 - Cultural weather globe tech choice

**Date:** 2026-06-19
**Status:** Active
**Owner:** VerseSignal agent

## Decision

The `/globe` surface should be implemented as a cultural-weather exploration layer, not as a raw region list. For the first real prototype, use `react-globe.gl` with a strict 2D fallback. Treat a full geospatial engine as the last resort.

## Evaluation tiers

1. **Fast product surface**
   - Goal: beautiful, interactive, easy to ship
   - Chosen prototype path: `react-globe.gl`
   - Why: React-first, layers for points/arcs/rings/labels, and a fast fit for VerseSignal's signal-intensity story

2. **Custom cinematic surface**
   - Goal: highly stylized, WebGL/Three.js, more control
   - Candidate only if the first prototype hits styling limits
   - Why not first: higher implementation and maintenance cost, more lifecycle risk

3. **Real geospatial engine**
   - Goal: accurate globe/map, heavy analytical tooling
   - Deferred
   - Why not now: VerseSignal needs cultural exploration and uncertainty handling more than terrain infrastructure

## Why this is the right fit

- The product needs to show where cultural signal appears, not merely present an atlas of cards.
- `react-globe.gl` supports the exact storytelling layers we want first: points, rings, labels, and later arcs or polygons.
- A 2D fallback preserves the experience on lower-capability devices and avoids false precision when the corpus is sparse.
- This keeps the implementation aligned with motto_v3: durable, legible, and honest about what the data can prove.

## Implementation shape

- `/globe` becomes a cultural weather surface.
- The globe visual is the primary surface.
- The side rail explains the selected region, the reading model, and the chosen tech tier.
- Region cards remain secondary exploration affordances, not the main page structure.

## Validation plan

- Confirm the globe loads with WebGL and renders region points, labels, and ring cues.
- Confirm the non-WebGL fallback renders a usable atlas view.
- Confirm region clicks still flow into lens and graph routes.
- Keep the copy aligned with song-led discovery and candidate-context verification.

## Related

- `app/globe/page.tsx`
- `components/globe/cultural-weather-globe.tsx`
- `lib/i18n/strings.ts`
- `docs/decisions/0019-open-work-product-correction.md`
- `docs/decisions/0020-lyrics-first-reframe-and-lens-page.md`
