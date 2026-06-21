# Worklog — 2026-06-21 — Prize polish pass

## What changed

- Rebuilt the home page as a playable launchpad instead of a dense research dashboard.
- Added a first-paint search prompt, four entry modes, a more cinematic signal console, and a cleaner era mosaic.
- Reframed event pages as signal trials with direct evidence, resonance, persistence, and explicit truth-tier language.
- Reworked the Ask surface to lead with feeling-first exploration and path finding instead of a plain utility panel.
- Updated the globe page copy so it reads as cultural weather, not implementation tiers.
- Switched the globe rendering surface to a reliable 2D atlas fallback in this browser/CSP environment so the page stays usable and visually complete.
- Added a server-streamed semantic-search path for `/ask?q=...` and kept the client panel for manual follow-up searches.

## Verification

- `npm run typecheck`
- `SMOKE_BASE_URL=http://localhost:3001 npm run test -- tests/page-content.test.ts`
- Browser inspection on:
  - `/`
  - `/ask`
  - `/event/versesignal:ev:covid_19`
  - `/globe?year=2020&region=US`

## Notes

- The home page now feels much more like a jury/demo surface: one dramatic hero, one signal console, one exploration grid, one era mosaic, one trial rail.
- The globe browser path currently defaults to the atlas fallback because the WebGL component trips the browser CSP in this environment.
- The semantic-search cold start is still expensive on first use, so the streamed server slot keeps the shell responsive while results load.
