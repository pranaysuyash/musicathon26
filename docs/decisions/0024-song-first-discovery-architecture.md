# Decision 0024 — Song-first discovery + chart-era capability as core product architecture

**Date:** 2026-06-18  
**Status:** Active  
**Owner:** VerseSignal agent

## Decision

The product thesis is now explicitly:

> **Songs identify cultural moments first; curated events contextualize and validate them second.**

and

> **Corpus target is 1960s–2023, staged by chart era and chart semantics.**

The current shipped flow remains demo-first (2018–2023), but the system behavior should no longer hard-code that window as the product boundary.

## Implementation now (landed in this cycle)

### 1) DB-driven year availability in year routing
- Replaced `DEMO_YEARS` hard-gating on `/year/[year]` with DB-driven availability.
- `/year/[year]` now resolves from `getYearAvailability(year, region)` and returns 404 only when the year has no indexed content.
- This keeps the current demo operational while allowing future range expansion without route rewrites.

### 2) Home timeline from DB availability
- Homepage now reads displayed years via `getAllYears("US")` instead of static demo seed constants.
- Keeps the displayed year cards aligned with actual indexed coverage.

### 3) Chart-era contract surfaced in query layer
- Added `ChartEra` model and `getChartEraForYear(year)` in `lib/db/queries.ts`.
- Added `getYearAvailability(year, region)` with song/theme/mood/event coverage flags and assigned chart-era metadata.
- Homepage and year page can now surface era-aware labeling/caveats.

### 4) `/year/[year]` now era-aware
- The year page now shows chart-era label/source metadata and points users to `/lens/[year]` for discovery-first interpretation.

## Why this preserves first principles

- Removes the false finality of the 2018–2023 demo window in product routes.
- Moves from “slice-based routing truth” to “indexed-data truth.”
- Supports staged expansion (1960s–1979, 1980s–1999, 2000s–2011, 2012–2019, 2020–2023) without breaking core UX.

## Next stage (not yet landed)

- Add persistent chart-era-aware song metadata (`chart_era`, `rank_type`, `source_url`, confidence) either as song fields or a `chart_entries` table.
- Build candidate-moment-first discovery outputs (signal spikes/clusters/pulse moments) as first-class outputs before curated event matching.
- Add chart-era nodes/edges (`chart_era`, `belongs_to_era`) and a dedicated era timeline surface.
