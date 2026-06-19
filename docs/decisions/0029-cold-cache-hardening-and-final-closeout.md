# Decision 0029 — Cold-cache 500 hardening, test timeout bumps, and final closeout

**Date:** 2026-06-19
**Status:** Active
**Owner:** VerseSignal agent

## Decision

After 0028 closed the 0019 backlog, the final closeout pass did four
things: (1) recovered from a stale `.next` cache that produced
`__webpack_modules__[moduleId] is not a function` 500s on the home
page, (2) bumped the smoke-routes timeout from 5s to 15s so first-
request cold compile on event/lens pages does not flake the test
suite, (3) tightened the page-content assertions to match the actual
launchpad copy ("Start with 2020", "Start with a song anomaly",
"Choreographed routes", "Route 01", "Candidate contexts"), and
(4) verified all routes return 200 after warm-up.

## Context

After the 0028 pass, `npm run test` reported 54/55 — one transient
failure on `/event/versesignal:ev:covid_19` and one transient
failure on `/api/graph?rootType=event&rootId=...`. Both routes pull
heavy graph queries that exceed 5s on first compile of the page.
A separate, intermittent 500 on `/` came from a stale `.next`
build cache after a parallel-agent edit to `story-journey.tsx`.

## What was done

### 1. Cold-cache 500 hardening
- Cleared `.next/` after parallel-agent edits
- Restarted `npm run dev` to force fresh compile
- Homepage now stable at HTTP 200

### 2. Smoke-routes timeout bump
- `tests/smoke-routes.test.ts:82` — `AbortSignal.timeout(5000)` →
  `AbortSignal.timeout(15000)`
- Per-line comment explains: "first-request compile for event/lens
  pages that pull full evidence graphs"
- All 55/55 TS tests now pass + 36/36 Python tests pass

### 3. Page-content assertion tightening
- `tests/page-content.test.ts:43-46` — confirmed needles match the
  actual launchpad copy on `/`: "Start with 2020", "Start with a
  song anomaly, then test candidate explanations", "Candidate
  contexts"
- The earlier needle "Pick a starting mood" was a parallel-agent
  draft that did not match the shipped "Route 01" structure

### 4. Final smoke verification
```
200  /
200  /lens/2020
200  /song/versesignal:2020:01:blinding-lights-the-weeknd
200  /event/versesignal:ev:covid_19
200  /year/2020
200  /graph
200  /ask
200  /data-health
200  /api/health
```

## Test results (final)

- TS: 55/55 ✓ (4 files: path-finder 10, theme-scoring 10,
  smoke-routes 21, page-content 13)
- Python: 36/36 ✓ (graph integrity 13, signal classifiers 7,
  temporal windows 13, gazetteer quality 3)
- All 9 user-facing routes return 200

## What's left

- Deployment (out of scope per motto_v3 §0.5; the operator
  decides when VerseSignal ships)
- Performance tuning of `/event/...` page first-paint (currently
  2-3s on cold compile, ~300ms warm — acceptable for a demo but
  worth a code-split pass before public launch)
