# Decision 0023 — Product boundary correction: 1960s–2023 long-term corpus plan

**Date:** 2026-06-18  
**Status:** Active  
**Owner:** VerseSignal agent

## Decision

VerseSignal is a long-term cultural music atlas from **1960s to 2023**.
The current shipped slice is **2018–2023** and is explicitly a demo milestone,
not the full product boundary.

Do not interpret “current slice” as a hard stop. The direction is safe staged
expansion by chart era, with the following product map:

- **1960s–1970s:** Billboard Hot 100 / year-end historical chart memory mode.
- **1980s–1990s:** Billboard + MTV/radio-era cultural context where available.
- **2000s–2010s:** Billboard Hot 100 + digital/download/streaming transition context.
- **2020–2023:** Billboard Global 200 + streaming-era context.

## Rationale

This removes anchor risk from earlier “do not expand” phrasing. It protects demo
stability while forcing every implementation decision to optimize for the eventual
full corpus.

Agents should prioritize:

1. Keep the current demo flow reliable and evidence-first (lens + graph + song/event proof).
2. Expand by era slice, preserving provenance, confidence, and schema contracts.
3. Keep schema and contracts monotonic when possible to avoid migration churn.

## Implementation rules

- The phrase “2018–2023” in copy/docs should be labeled as the **current
  demo slice** unless it is explicitly describing shipped volume.
- Any addition that increases corpus scope must preserve:
  - canonical IDs,
  - confidence tiers,
  - evidence row requirements,
  - source API traceability,
  - and compatibility with existing region/currency/temporal windows.
- “Don't do X” phrasing must not be used as a proxy for strategic boundaries.
  Use:  
  **“Do this in order, preserve the demo path, stage safely.”**

## Current evidence

- `README.md` and home/graph landing metadata now identify 1960s–2023 as the long-term
  product target.
- The existing decision backlog (`0019`, `0020`, `0021`) remains the execution map;
  this decision locks the long-term corpus framing for all of those items.
