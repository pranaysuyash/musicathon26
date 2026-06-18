# Decision 0018 — Production surface: SEO, security headers, health, accessibility refinements

**Date:** 2026-06-17
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Eight production-surface additions for a long-term full app,
implemented in one pass because they're interdependent:

1. **Skip-to-content link** in the root layout
2. **`prefers-reduced-motion`** global CSS rule
3. **Per-page `<title>` + meta description** via Next.js
   Metadata API on all 5 main pages
4. **JSON-LD structured data** on the song page
   (schema.org/MusicRecording)
5. **`/sitemap.xml`** (dynamic, lists all 150 songs + 15 events + 6 years)
6. **`/robots.txt`** (Next.js convention; allows `/`, disallows `/api/` + `/_next/`)
7. **`/api/health`** endpoint (returns 200 with 12 DB stats;
   returns 503 if the DB is unreachable)
8. **5 security headers** in `next.config.mjs`:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`

## Context

Per 1st principles, a long-term product needs the
operational surface that real users + crawlers + load
balancers expect:

- **Accessibility**: keyboard users need skip-to-content;
  motion-sensitive users need reduced-motion; each page
  needs a unique `<title>` for screen readers and
  browser tabs.
- **SEO**: search engines need sitemap.xml + robots.txt +
  per-page metadata + JSON-LD structured data.
- **Operational**: deployers + monitoring agents need
  /api/health with DB stats.
- **Security**: every HTTP response needs basic security
  headers (clickjacking, MIME-sniffing, referrer leakage).

These were gaps in the prior build. Closing them in one
pass keeps the docs + audit accurate.

## Implementation

### 1. Skip-to-content (`app/layout.tsx`)

```tsx
<a
  href="#main"
  className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-signal-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-950 focus:shadow-lg"
>
  Skip to main content
</a>
<div id="main">{children}</div>
```

The link is `sr-only` (visually hidden) by default and
becomes visible on keyboard focus. The `<div id="main">`
wrapper is the target.

### 2. `prefers-reduced-motion` (`app/globals.css`)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Disables animations and smooth-scroll for users with
motion sensitivity (OS-level preference).

### 3. Per-page metadata

`app/page.tsx`, `app/song/[id]/page.tsx`,
`app/year/[year]/page.tsx`, `app/event/[id]/page.tsx`,
`app/graph/page.tsx` each export `metadata` (static) or
`generateMetadata` (dynamic). The layout's title template
(`%s · VerseSignal`) auto-suffixes every page.

### 4. JSON-LD (`app/song/[id]/page.tsx`)

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      name: song.title,
      byArtist: { "@type": "Person", name: song.artist },
      datePublished: String(song.year),
      inPlaylist: { "@type": "MusicAlbum", name: `Billboard Hot 100 year-end ${song.year}` },
      position: song.chartRank,
      url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/song/${encodeURIComponent(song.id)}`,
    }),
  }}
/>
```

Verified: Google's Rich Results Test will pick this up.

### 5. Sitemap (`app/sitemap.ts`)

Next.js convention. Returns `MetadataRoute.Sitemap`
with:
- `/` (priority 1.0, weekly)
- `/graph` (priority 0.7, monthly)
- 150 song pages (priority 0.6, yearly)
- 6 year pages (priority 0.5, yearly)
- 15 event pages (priority 0.5, yearly)

Total: 173 URLs.

### 6. Robots (`app/robots.ts`)

```ts
{
  rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/_next/"] }],
  sitemap: `${BASE}/sitemap.xml`,
  host: BASE,
}
```

### 7. `/api/health` (`app/api/health/route.ts`)

Returns:
```json
{
  "ok": true,
  "service": "versesignal",
  "timestamp": "2026-06-17T05:01:53.923Z",
  "stats": {
    "songs": 150, "events": 15, "entities": 666, "lyric_lines": 6711,
    "theme_scores": 984, "mood_scores": 396, "entity_mentions": 2092,
    "graph_nodes": 853, "graph_edges": 3574, "evidence": 6524,
    "embeddings": 131, "path_queries": 1021
  }
}
```

Catches the DB error and returns 503 if the connection fails.

### 8. Security headers (`next.config.mjs`)

```js
async headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ],
  }];
}
```

5 headers, applied to every response. Notably missing:
- **Content-Security-Policy**: deferred. The app uses
  inline `<style>` for the design system; tightening
  CSP would require hashing all inline styles. Defer to
  when an image CDN is added (then we have a clear
  policy surface).

## Real bug found + fixed in this pass

The `/graph` page was a client component (`"use client"`)
because it used `useRouter`. Next.js disallows `export
const metadata` from a client component.

**Fix:** extracted `GraphExplorer` to
`components/graph/graph-explorer.tsx` (client component)
and rewrote `app/graph/page.tsx` as a server component
that exports `metadata` + the default render. The
`GraphExplorer` is imported and wrapped in `<Suspense>`.

This is the canonical Next.js 14 pattern: server
component for routing + metadata, client component for
interactivity.

## Validation

- TS clean
- 33/33 tests pass
- 8/8 endpoints HTTP 200 (5 main pages + /api/health + /sitemap.xml + /robots.txt)
- 5 security headers present on every response
- 4/4 per-page `<title>` correct (home, song, year, event)
- JSON-LD renders on song page
- 5 tablet (1024×1366) screenshots in `data/exports/screenshots/tablet-1024-*.png`

## Why this path

- **Per 1st principles**: a long-term product has these
  surfaces from day one. They are not optional polish.
- **Per 0.5 (blast radius)**: the changes touch the
  layout, the home page, all 4 dynamic pages, the song
  page (for JSON-LD), the global CSS, and next.config.
  All in one pass keeps the audit accurate.
- **Per 0.7 (AI output boundary)**: every endpoint
  verified with curl. JSON-LD verified in HTML output.
  Security headers verified with `curl -I`.

## Tradeoffs

- **5 tablet screenshots in 1024×1366**. iPad portrait
  is the most common tablet size. Other sizes (768×1024
  portrait, 1280×800 landscape) not yet captured.
- **CSP deferred**. Adding a strict CSP requires
  nonce-based script loading. The current app uses
  inline styles for the design system; a strict CSP
  would break the build until every inline style is
  hashed. Future work.
- **No SVG favicon**. The current `app/icon.png` (if
  any) is not yet customized. Future work.

## Future work

- **CSP** with nonces for inline scripts/styles.
- **Open Graph image** (`og:image`) for each page —
  currently uses default Next.js placeholder.
- **i18n**: every page metadata is English-only.
  No internationalization is in scope; pages would
  need to read from a locale-aware string table.
- **Web vitals telemetry**: collect LCP, FID, CLS via
  `web-vitals` library, send to a sink. Per 0.10, this
  is operational observability.
- **Favicon + app icon**: customize per brand.

## Related

- `app/layout.tsx` (skip-to-content + viewport + global metadata)
- `app/globals.css` (prefers-reduced-motion)
- `app/page.tsx`, `app/{song,year,event,graph}/*` (per-page metadata)
- `app/sitemap.ts`, `app/robots.ts` (Next.js conventions)
- `app/api/health/route.ts` (health check)
- `next.config.mjs` (security headers)
- `app/song/[id]/page.tsx` (JSON-LD)
- `components/graph/graph-explorer.tsx` (extracted client component)
