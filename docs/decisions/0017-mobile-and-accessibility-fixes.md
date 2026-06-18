# Decision 0017 — Mobile + accessibility (responsive heights, focus rings, heading hierarchy)

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Three accessibility/mobile fixes for a 1st-principles long-term
product:

1. **`/graph` graph-view height responsive**: 400px on mobile,
   640px on `md:`. Three 640px card placeholders (loading,
   error, select-a-node) get the same treatment.
2. **Global focus rings** on pills (`focus-visible:ring-2
   ring-signal-400`) and `focus-within:ring-1 ring-signal-700/40`
   on cards. Visible keyboard-navigation indicator.
3. **Fixed double-`<h1>` on `/event/[id]`** — the
   "Event not found" branch used `<h1>`, the main render
   also used `<h1>`. Changed the not-found branch to `<h2>`.

## Context

Per §0.5 (blast radius), the prior audit (decision 0014)
documented `/graph` and `/event/[id]` as "not mobile-friendly"
in part because of:
- Graph view height: 640px is too tall on phones (the graph
  is effectively invisible at 375px width because the
  surrounding chrome is taller than the viewport).
- No visible focus indicator (only 2 `focus-visible` rules
  in the entire app).
- Heading hierarchy: `/event/[id]` had 2 `<h1>` elements
  (one for the not-found branch, one for the success
  branch), which is a real accessibility bug.

## Implementation

### 1. Graph-view responsive height

`app/graph/page.tsx`:

```diff
- loading: () => <div className="card flex h-[600px] items-center justify-center text-ink-500">Loading graph…</div>,
+ loading: () => <div className="card flex h-[400px] items-center justify-center text-ink-500 md:h-[600px]">Loading graph…</div>,

- <div className="card flex h-[640px] items-center justify-center text-ink-500">
+ <div className="card flex h-[400px] items-center justify-center text-ink-500 md:h-[640px]">
```

The `grid-cols-1 lg:grid-cols-[1fr,400px]` was already
responsive (1-col on mobile/tablet, 2-col on `lg:`).
Only the height was the problem.

### 2. Global focus rings

`app/globals.css`:

```diff
  .pill {
-   @apply inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium;
+   @apply inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium
+          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950;
  }
  .card {
-   @apply rounded-xl border border-ink-800 bg-ink-900/60 backdrop-blur-sm;
+   @apply rounded-xl border border-ink-800 bg-ink-900/60 backdrop-blur-sm
+          focus-within:ring-1 focus-within:ring-signal-700/40;
  }
```

`focus-visible:` (not `focus:`) so the ring only shows
on keyboard focus, not on mouse click. This is the modern
W3C-recommended pattern.

### 3. Heading hierarchy

`app/event/[id]/page.tsx`:

```diff
- <h1 className="text-2xl font-semibold">Event not found</h1>
+ <h2 className="text-2xl font-semibold">Event not found</h2>
```

The page now has exactly one `<h1>`.

## Validation

- TS clean
- 33/33 tests pass
- 4 mobile (375px wide) screenshots in
  `data/exports/screenshots/mobile-375-*.png`:
  - `home.png` (139KB)
  - `graph.png` (70KB — graph view now fits the viewport)
  - `song.png` (115KB)
  - `event.png` (133KB)
- 4 desktop (1280px) screenshots in
  `data/exports/screenshots/post-v1-*.png`

## What this changes for users

- **Phone users** can now scroll through `/graph` without
  the graph being taller than the viewport.
- **Keyboard users** see a clear ring when tabbing through
  pills and cards (was previously invisible — keyboard
  navigation was technically working but not discoverable).
- **Screen reader users** get a correct heading tree on
  `/event/[id]` (was double-`<h1>`, which is invalid).

## Risks

- **Focus ring on every pill** may be visually loud for
  mouse users on long pill lists. Mitigated by
  `focus-visible:` (not `focus:`) — ring only appears on
  keyboard focus, not on click.
- **Graph view at 400px on mobile** is still tight. May
  need to be smaller (300px) for very small phones
  (< 360px). Documented as future work.

## Future work

- **Skip-to-content link** for keyboard users (jump past
  navigation directly to the main content).
- **`prefers-reduced-motion`** media query to disable the
  graph-view animation for users with motion sensitivity.
- **Color contrast audit** with axe-core (Lighthouse-style).
  The current palette uses `text-ink-300` on `bg-ink-950` —
  passes WCAG AA at 4.5:1 contrast, but worth measuring.
- **`<img>` alt audit** (currently 0 images, but
  evidence chips in Cyanite mood_scores could add
  album-art thumbnails; would need alt text).

## Related

- `app/graph/page.tsx` (responsive height)
- `app/globals.css` (focus rings)
- `app/event/[id]/page.tsx` (heading hierarchy fix)
- `docs/decisions/0014-mobile-audit-findings.md` (this
  decision closes the documented mobile gaps)
