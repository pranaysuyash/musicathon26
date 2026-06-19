// Content-level tests for the lens, song, and event pages.
//
// Per 0019, the user-facing surfaces (lens, song, event, year,
// graph) are the product. This test asserts that the actual
// HTML rendered contains the expected data — not just a 200
// status. Per motto_v3 §0.6 (risk-based verification), the
// user-facing surface is the highest-risk area (a judge/visitor
// sees it first), so verifying its content is the highest-value
// test we can run.
//
// Run: requires the dev server to be running
//       npx vitest run tests/page-content.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let serverUp = false;

beforeAll(async () => {
  try {
    const res = await fetch(BASE + "/", { signal: AbortSignal.timeout(5000) });
    serverUp = res.status === 200;
  } catch {
    serverUp = false;
  }
}, 8000);

interface PageCheck {
  name: string;
  path: string;
  expectInBody: string[];
  /** Status code to expect. Default 200. */
  expectStatus?: number;
}

const PAGES: PageCheck[] = [
  // === HOME PAGE: the launch surface should feel exploratory, not like a catalog
  {
    name: "/ contains the new exploration launchpad copy",
    path: "/",
    expectInBody: [
      "Start with 2020",
      "Start with a song anomaly, then test candidate explanations",
      "Context layers",
    ],
  },
  // === ERA MOSAIC: the home page surfaces a small mosaic of eras
  // (5 max), not 64 identical year tiles. Per Decision 0030 the
  // wall of tiles was a catalog anti-pattern.
  {
    name: "/ shows the era mosaic instead of a wall of year tiles",
    path: "/",
    expectInBody: ["Era mosaic", "cultural eras across", "Top mood"],
  },
  // === LENS PAGE: the headline surface. The narrative must mention
  // 2020's actual top signals (mood:energetic, mood:romantic, etc.)
  {
    name: "/lens/2020 contains energetic mood",
    path: "/lens/2020",
    expectInBody: ["energetic", "romantic", "2020"],
  },
  {
    name: "/lens/2018 contains Drake",
    path: "/lens/2018",
    expectInBody: ["2018", "God", "Plan"],
  },
  {
    name: "/lens/1985 historical year renders",
    path: "/lens/1985",
    expectInBody: ["1985", "Careless"],
  },
  {
    name: "/lens/1969 historical year renders",
    path: "/lens/1969",
    expectInBody: ["1969", "Aquarius"],
  },
  {
    name: "/compare/1969/2020 shows the era comparison",
    path: "/compare/1969/2020",
    expectInBody: ["1969 vs 2020", "Broadcast / counterculture era", "Global streaming era"],
  },
  // === SONG PAGE: the per-song evidence surface.
  // Per Decision 0030, the linker requires SPECIFIC event keywords
  // in the song's lyrics before claiming an event link. Blinding
  // Lights doesn't mention any COVID keywords, so it correctly
  // shows NO event connections — that's the honest behavior we
  // want. The test pins themes + entities + similar songs instead.
  {
    name: "/song/2020:#1 has themes, entities, and similar songs (no false event link)",
    path: "/song/versesignal:2020:01:blinding-lights-the-weeknd",
    expectInBody: ["Blinding Lights", "The Weeknd", "Themes", "Similar songs"],
  },
  {
    name: "/song/1985:#1 has care about Careless Whisper",
    path: "/song/versesignal:1985:01:careless-whisper-wham-featuring-george-michael",
    expectInBody: ["Careless", "Wham"],
  },
  // === EVENT PAGE: the per-event lens
  {
    name: "/event/covid_19 has the context name",
    path: "/event/versesignal:ev:covid_19",
    expectInBody: ["COVID-19", "2020", "Context articles"],
  },
  {
    name: "/event/ukraine_war shows the war",
    path: "/event/versesignal:ev:ukraine_war",
    expectInBody: ["Ukraine"],
  },
  // === GLOBE PAGE: the cultural weather surface
  {
    name: "/globe shows the cultural weather map",
    path: "/globe?year=2020&region=US",
    expectInBody: ["Cultural weather map", "react-globe.gl", "Tier 1: react-globe.gl"],
  },
  // === YEAR PAGE: the year overview
  {
    name: "/year/2020 shows 2020",
    path: "/year/2020",
    expectInBody: ["2020"],
  },
  {
    name: "/year/1985 historical year renders",
    path: "/year/1985",
    expectInBody: ["1985"],
  },
  // === GRAPH EXPLORER: the /graph surface should render the
  // explorer shell. The data loads client-side after mount; we
  // assert the shell + the era quick-jump chips are present, plus
  // the API response (which IS server-rendered) for the era root.
  {
    name: "/graph renders the explorer shell with era quick-jumps",
    path: "/graph",
    expectInBody: ["Knowledge graph", "Jump to:", "era", "Discovery Meter"],
  },
  {
    name: "/api/graph returns an era neighborhood",
    path: "/api/graph?nodeId=versesignal:n:era:global_streaming_era&rootType=era&hops=2",
    expectInBody: ["Global streaming era", "belongs_to_era"],
  },
  // === ASK API: the NL→graph resolver
  {
    name: "/api/graph-ask finds Blinding Lights → COVID",
    path: "/api/graph-ask?q=path+from+Blinding+Lights+to+COVID",
    expectInBody: ["Blinding Lights", "COVID", "found"],
  },
  {
    name: "/api/graph-ask reports unresolved for nonsense",
    path: "/api/graph-ask?q=path+from+asdfasdf+to+qwerqwer",
    expectStatus: 404,
    expectInBody: ["error"],
  },
  // === DATA HEALTH
  {
    name: "/data-health shows corpus summary",
    path: "/data-health",
    expectInBody: ["Data health", "Songs"],
  },
];

describe("Page content verification", () => {
  for (const p of PAGES) {
    it(p.name, async () => {
      if (!serverUp) {
        // Per motto_v3 §0.6 (risk-based verification), a high-risk
        // surface (lens, song, event) is too important to skip
        // silently. We fail loudly so the operator knows the
        // server isn't running.
        throw new Error(`Dev server not reachable on ${BASE}. Start with \`npm run dev\` first.`);
      }
      const res = await fetch(BASE + p.path, { signal: AbortSignal.timeout(8000) });
      expect(res.status).toBe(p.expectStatus ?? 200);
      const body = await res.text();
      for (const needle of p.expectInBody) {
        expect(body).toContain(needle);
      }
    }, 15000);
  }
});
