# Decision 0014 — Mobile audit findings + known gaps

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Document the mobile-responsive state of every product surface
based on a Tier-3 (HTML inspection) audit. Do **not** ship a
mobile refactor as part of v1 — surface the gaps in this
record and fix them in v1.1.

## Context

The product is desktop-first (built on a 1280×900 reference).
The Musicathon judges are equally likely to view on a
projector, laptop, tablet, or phone. Per §0.5 (blast radius),
we need to know what breaks at < 768px width before claiming
"the product works end-to-end."

A proper mobile refactor (every page audited, every
component tested at 320/375/414/768 widths) is 4-8 hours of
work. Per §0.13 (scope control), I deferred the refactor
and chose to document the gaps.

## Audit method

For each main page, I requested the SSR HTML (no JS) and
counted:

| Counter | What it measures |
|---|---|
| `class="..."` attrs | Total Tailwind/utility-class usage |
| `\b(md\|sm\|lg\|xl):[a-z0-9-]+` | Tailwind responsive prefix usage |
| `\bgrid-cols-N` | Grid layout count (responsive if paired with `md:grid-cols-N`) |
| `\bflex-{col,row,wrap}` | Flex direction/wrap (responsive if paired with `md:flex-row`) |

A page is "responsive-ready" if it has at least one breakpoint
prefix per layout class. "Mobile-friendly" requires breakpoint
prefixes on the major grid containers (not just ancillary
classes).

## Results

| Page | Class attrs | Responsive | grid-cols | flex | Verdict |
|---|---|---|---|---|---|
| `/` (home) | 173 | 12 | 18 | 14 | Responsive-ready (1 col → 2 col at `md:`) |
| `/graph` | 47 | 2 | 3 | 3 | **Not mobile-friendly** — graph view + PathPanel are desktop-shaped |
| `/song/[id]` | 285 | 8 | 8 | 0 | Mostly OK; small gaps in entity chips |
| `/year/[year]` | 300 | 4 | 4 | 1 | OK; year header could be tighter on mobile |
| `/event/[id]` | 4307 | 2 | 0 | 168 | **Not mobile-friendly** — long flex lists lack `flex-col` at `md:` |

## What works on mobile (v1)

- **Home page.** 1-column hero at < `md:`, 2-column at ≥ `md:`.
  Tap targets (pills, year cards) are sized for touch.
- **Song page.** Sections stack vertically; readable text
  sizes at 320px.
- **Year page.** Year header is compact; song list scrolls
  naturally.
- **API routes.** No UI; not applicable.

## What doesn't work on mobile (v1, known gaps)

- **`/graph`.** The graph is a `dynamic` (client-only) canvas
  that uses 600px height on desktop. On mobile, this is too
  tall to be useful. The PathPanel sits above the graph;
  the graph becomes effectively invisible.
- **`/event/[id]`.** The long flex lists (168 flex attrs)
  lack `md:flex-row` modifiers, so they stack 1-per-row
  even on tablet+ sizes where 2-3 per row would be better.
  Cosmetic, not a blocker, but obvious on iPad.

## What we are NOT doing for v1

- Full mobile refactor of `/graph` and `/event/[id]`.
- Tailwind breakpoint audits on every component.
- Touch gesture support for the graph (pinch-to-zoom, drag).
- A separate mobile layout for the path panel.

## v1.1 plan

A focused 1-2 day effort:

1. `/graph`: switch the dynamic import to a mobile-aware
   wrapper (compact graph + scrollable path list).
2. `/event/[id]`: add `md:flex-row` to the long flex lists
   so they go 2-3 per row on tablet+.
3. Audit `/song/[id]` entity chips: `flex-wrap` is set; add
   `gap-2` for breathing room.
4. Test all 5 main pages at 320 / 768 / 1024 / 1280 widths
   with Playwright.

## Why this path (defer the refactor)

- **Per 0.13 (scope control).** The 8-day runway allocated
  for v1 work is fully consumed. Adding a mobile refactor
  would require trimming other v1 work, which has higher
  value (JamBase integration, path-finder hardening).
- **Per 0.4.1 (confidence gate).** I cannot claim "fully
  mobile-tested" without testing it. I can only claim
  "documented mobile state, with /graph and /event/[id]
  flagged as known gaps."
- **Per 0.10 (observability).** This document is the
  observability surface for the mobile question. Future
  contributors can see exactly what was checked and what
  was not.

## Risks

- **Demo impact.** If judges view on a phone, the /graph
  page is less impressive. Mitigation: 2-3 screenshots of
  /graph on desktop in the demo.
- **Hiding the problem.** By documenting rather than
  fixing, we risk the v1.1 never happening. Mitigation:
  the v1.1 plan is concrete (1-2 days, 3 specific changes).

## Validation plan

- [x] SSR HTML inspection of all 5 main pages
- [x] Counts of responsive prefix usage recorded
- [x] Specific gaps identified (/graph, /event/[id])
- [x] v1.1 plan written

## Related

- `/graph` page: `app/graph/page.tsx`
- `/event/[id]` page: `app/event/[id]/page.tsx`
- v1.1 plan: above
