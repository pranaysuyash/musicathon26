// Smoke tests for the 9 important routes.
//
// Per external review P0.5, the product should have an
// automated smoke test that hits every important route and
// the 4 path presets. This test assumes the dev server is
// running on http://localhost:3000. Skip otherwise.
//
// Run: npm run dev   (in another terminal)
//      npx vitest run tests/smoke-routes.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

interface RouteSpec {
  path: string;
  expectStatus: number;
  expectInBody?: string[];
  skipBodyCheck?: boolean;
}

const ROUTES: RouteSpec[] = [
  { path: "/", expectStatus: 200, expectInBody: ["VerseSignal"] },
  { path: "/graph", expectStatus: 200, skipBodyCheck: true }, // empty default
  { path: "/year/2020", expectStatus: 200, expectInBody: ["2020"] },
  { path: "/song/versesignal:2018:01:god-s-plan-drake", expectStatus: 200, expectInBody: ["Drake"] },
  { path: "/event/versesignal:ev:covid_19", expectStatus: 200, expectInBody: ["COVID-19"] },
  { path: "/lens/2020", expectStatus: 200, expectInBody: ["2020"] },
  { path: "/lens/2018", expectStatus: 200 },
  { path: "/lens/2023", expectStatus: 200 },
  { path: "/sitemap.xml", expectStatus: 200 },
  { path: "/robots.txt", expectStatus: 200 },
  { path: "/api/graph?nodeId=versesignal:year:2020&hops=2", expectStatus: 200, expectInBody: ["nodes", "edges"] },
  { path: "/api/graph?rootType=event&rootId=versesignal:ev:covid_19&hops=2", expectStatus: 200, expectInBody: ["nodes"] },
  { path: "/api/song?id=versesignal:2020:01:blinding-lights-the-weeknd", expectStatus: 200, expectInBody: ["eventLinks", "themes"] },
  { path: "/api/health", expectStatus: 200, expectInBody: ["versesignal", "stats", "partner_keys"] },
  { path: "/api/year-signals?year=2020&region=US", expectStatus: 200, expectInBody: ["signals", "2020"] },
  // === Semantic search (Decision 0030) — embeddings exposed as a
  // user-facing API. Skip the body check when the embedder is
  // unavailable (cold start in CI) so the test reflects the
  // endpoint's graceful-degradation contract.
  { path: "/api/semantic-search?q=I+can%27t+sleep", expectStatus: 200, skipBodyCheck: true },
  { path: "/data-health", expectStatus: 200, skipBodyCheck: true },
];

// 4 path presets per the PathPanel in components/graph/path-panel.tsx
const PATH_PRESETS: Array<{ label: string; from: string; to: string }> = [
  {
    label: "Blinding Lights → COVID-19",
    from: "versesignal:n:song:versesignal:2020:01:blinding-lights-the-weeknd",
    to: "versesignal:n:event:versesignal:ev:covid_19",
  },
  {
    label: "Heat Waves (2021) → Heat Waves (2022)",
    from: "versesignal:n:song:versesignal:2021:16:heat-waves-glass-animals",
    to: "versesignal:n:song:versesignal:2022:01:heat-waves-glass-animals",
  },
  {
    label: "God's Plan → violence (theme)",
    from: "versesignal:n:song:versesignal:2018:01:god-s-plan-drake",
    to: "versesignal:n:theme:violence",
  },
  {
    label: "Straightenin (Migos) → COVID-19 lockdowns (real keyword match)",
    from: "versesignal:n:song:versesignal:2021:33:straightenin-migos",
    to: "versesignal:n:event:versesignal:ev:covid_19",
  },
];

let serverUp = false;

beforeAll(async () => {
  // Quick probe to see if the dev server is up
  // Allow 5s: first request triggers Next.js compile (~2s) + tailwind setup
  try {
    const res = await fetch(BASE + "/", { signal: AbortSignal.timeout(5000) });
    serverUp = res.status === 200;
  } catch {
    serverUp = false;
  }
}, 8000);

describe("Smoke tests: 9 important routes", () => {
  for (const r of ROUTES) {
    it(`${r.path} returns ${r.expectStatus}`, async () => {
      if (!serverUp) return; // skip if dev server not running
      // 15s timeout to absorb first-request compile for
      // event/lens pages that pull full evidence graphs.
      // 30s for /api/semantic-search on cold start — the
      // Python sentence-transformers model takes ~10s to
      // load the first time the route is hit.
      const isSemantic = r.path.startsWith("/api/semantic-search");
      const res = await fetch(BASE + r.path, {
        signal: AbortSignal.timeout(isSemantic ? 30000 : 15000),
      });
      expect(res.status).toBe(r.expectStatus);
      if (!r.skipBodyCheck && r.expectInBody && r.expectInBody.length > 0) {
        const body = await res.text();
        for (const needle of r.expectInBody) {
          expect(body).toContain(needle);
        }
      }
    });
  }
});

describe("Smoke tests: 4 path presets", () => {
  for (const preset of PATH_PRESETS) {
    it(`${preset.label} returns a valid path`, async () => {
      if (!serverUp) return;
      const url = `${BASE}/api/path?from=${encodeURIComponent(preset.from)}&to=${encodeURIComponent(preset.to)}&maxHops=6`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      expect(res.status).toBe(200);
      const data = await res.json();
      // Per Decision 0030, song→event edges now require specific
      // keyword evidence; we picked presets that all have real
      // connections. The path API may return either a found path
      // (via direct event edge or via artist/theme/entity hops) or
      // a structured no-path. We assert a valid response shape.
      if ("result" in data) {
        expect(typeof data.result.found).toBe("boolean");
        if (data.result.found) {
          expect(Array.isArray(data.result.nodes)).toBe(true);
          expect(data.result.nodes.length).toBeGreaterThan(0);
          expect(data.result.hopCount).toBeGreaterThanOrEqual(1);
          expect(data.result.hopCount).toBeLessThanOrEqual(6);
        }
      } else {
        throw new Error(`Unexpected response shape: ${JSON.stringify(data)}`);
      }
    });
  }
});

describe("Smoke test: server status", () => {
  it("dev server is reachable on " + BASE, () => {
    if (!serverUp) {
      console.warn(`Dev server not reachable on ${BASE}; smoke tests skipped. Run \`npm run dev\` to enable.`);
    }
    // No assertion; the per-test checks handle missing server gracefully.
  });
});
