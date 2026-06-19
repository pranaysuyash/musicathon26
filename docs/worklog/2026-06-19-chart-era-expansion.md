# Worklog — 2026-06-19 — Chart-era expansion and compare surface

## What changed

- Added first-class chart-era graph nodes and `belongs_to_era` edges so eras are navigable objects in the graph instead of only labels.
- Persisted chart-era metadata into song `metadata_json` during seeding so downstream pages can reason about rank type, source mode, and provenance.
- Added `/compare/[from]/[to]` to contrast two years across top signals, songs, and era context.
- Extended the graph explorer chrome with era jump buttons and enabled era nodes in the graph/path/ask layers.

## Verification

- `npm run typecheck`
- `npm run db:seed-chart`
- `npm run test -- tests/page-content.test.ts`
- `npm run test -- lib/graph/path-finder.test.ts`
- `npm run test:python -- tests/test_graph_integrity.py` re-ran as part of the Python suite and passed

## Notes

- Live DB now reports 5 `era` graph nodes and 442 `belongs_to_era` edges.
- `tests/test_gazetteer_quality.py` still has an unrelated failing assertion in the shared corpus snapshot: it found 0 gazetteer canonicals. That predates this chart-era pass and is outside the era workstream.
- The graph page itself remains client-hydrated, so the static HTML only carries the era jump chrome; the new API test covers the era neighborhood directly.
