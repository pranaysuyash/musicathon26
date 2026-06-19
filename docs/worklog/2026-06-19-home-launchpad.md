# Worklog — 2026-06-19 — Editorial home launchpad

## What changed

- Reworked the home page from a list/grid catalog into an editorial launchpad.
- Prioritized the strongest exploration routes up front:
  - 2020 lens
  - graph evidence trail
  - natural-language graph asking
  - cultural weather map
- Reframed the guided story as a mosaic instead of a numbered list.
- Swapped the global typography shell to `Fraunces` + `Manrope` + `IBM Plex Mono` for a more distinctive, magazine-like voice.
- Added a stronger ambient background treatment and grid texture so the app no longer reads as a default SaaS surface.

## Verification

- `npm run typecheck`
- `npm run build`
- `SMOKE_BASE_URL=http://localhost:3001 npm run test -- tests/page-content.test.ts`

## Notes

- The home page now carries the “start with 2020” narrative and the “signal seismograph” preview above the fold.
- The globe page still uses a data-heavy region matrix; that remains the clearest next place to bring the same editorial treatment.
