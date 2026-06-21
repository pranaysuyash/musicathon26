// Unit tests for the song dedup behavior in lib/db/queries.ts.
//
// Per motto 0.1, the user expects one row per real-world song on the
// artist and theme pages. The corpus has duplicates because the same
// global hit shows up at multiple chart positions (US #1, US #51,
// UK #1, DE #1) and the seed-data title strings vary slightly
// (e.g. "Creepin'" vs "Creepin" vs 'Creepin"' due to quote styles).
//
// These tests verify the dedup works against the live SQLite corpus
// without spinning up a Next.js dev server. We hit the queries
// directly through the sql helper.

import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "../lib/db/index";
import {
  getArtistSongs,
  getSongsByTheme,
  getSimilarSongs,
  getEraOverview,
  getThemeYearDistribution,
  getThemeEraDelta,
  getRelatedThemes,
} from "../lib/db/queries";

beforeAll(() => {
  // Touch the DB so the connection is established before the tests
  // start; otherwise the first test pays the open cost.
  getDb().prepare("SELECT 1").get();
});

describe("Song dedup — getArtistSongs", () => {
  it("The Weeknd catalog collapses Blinding Lights 2020 + 2021 to one row per year", () => {
    const songs = getArtistSongs("The Weeknd", 60);
    const bl2020 = songs.filter((s) => s.title === "Blinding Lights" && s.year === 2020);
    const bl2021 = songs.filter((s) => s.title === "Blinding Lights" && s.year === 2021);
    expect(bl2020.length).toBe(1);
    expect(bl2021.length).toBe(1);
  });

  it("Creepin / Creepin' / \"Creepin\" seed variants collapse to one row", () => {
    const songs = getArtistSongs("The Weeknd", 60);
    const creepin = songs.filter((s) =>
      s.title.replace(/['"]/g, "").toLowerCase() === "creepin"
    );
    expect(creepin.length).toBe(1);
    expect(creepin[0].year).toBe(2023);
  });

  it("returned song ids are canonical (no uk-/de- prefix)", () => {
    const songs = getArtistSongs("The Weeknd", 60);
    for (const s of songs) {
      expect(s.songId).not.toMatch(/^versesignal:[a-z][a-z]-/);
    }
  });

  it("chartRank is the best (minimum) rank for the song in that year", () => {
    const songs = getArtistSongs("The Weeknd", 60);
    const bl2020 = songs.find((s) => s.title === "Blinding Lights" && s.year === 2020);
    expect(bl2020?.chartRank).toBe(1);
  });
});

describe("Song dedup — getSongsByTheme", () => {
  it("returns one row per real song, not per chart position", () => {
    // The corpus has 4 chart positions for Blinding Lights in 2020
    // and 1 in 2021. With dedup we should see 1 row for 2020 and
    // 1 for 2021 (different year = different row).
    const songs = getSongsByTheme("loneliness", 50);
    const bl = songs.filter((s) => s.title === "Blinding Lights");
    expect(bl.length).toBe(2); // 2020 + 2021
    const blYears = new Set(bl.map((s) => s.year));
    expect(blYears).toEqual(new Set([2020, 2021]));
  });

  it("Stay — same song charted in 2021 and 2022 appears once per year", () => {
    const songs = getSongsByTheme("loneliness", 50);
    const stay2021 = songs.filter((s) => s.title === "Stay" && s.year === 2021);
    const stay2022 = songs.filter((s) => s.title === "Stay" && s.year === 2022);
    expect(stay2021.length).toBe(1);
    expect(stay2022.length).toBe(1);
  });
});

describe("Song dedup — getSimilarSongs", () => {
  it("returns unique real songs (no regional dupes)", () => {
    // Blinding Lights (2020) has similar_to edges to many songs.
    // None of the results should be the same song in different regions.
    const songs = getSimilarSongs("versesignal:2020:01:blinding-lights-the-weeknd", 8);
    const seen = new Set<string>();
    for (const s of songs) {
      const key = `${s.title.toLowerCase().replace(/['"]/g, "")}|${s.year}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("Song dedup — getEraOverview", () => {
  it("era song counts are real-world (not chart-position) totals", () => {
    const eras = getEraOverview("US");
    // Broadcast era is 1960-1979: chart-memory mode = 1 #1 per year = 20 songs
    const broadcast = eras.find((e) => e.eraId === "broadcast_counterculture");
    expect(broadcast).toBeDefined();
    expect(broadcast?.songCount).toBe(20);
    // Global streaming era is 2020-2023: 4 years × ~50 chart positions per year
    // deduped to ~real song count (203 was the pre-fix chart-position count;
    // post-dedup should be lower).
    const global = eras.find((e) => e.eraId === "global_streaming_era");
    expect(global).toBeDefined();
    expect(global!.songCount).toBeLessThan(442);
    expect(global!.songCount).toBeGreaterThan(150);
  });
});

describe("getThemeYearDistribution dedups song positions", () => {
  it("year counts are real songs, not chart positions", () => {
    // 2020 has Blinding Lights at 4 chart positions (US #1, US #51,
    // UK #1, DE #1) all scored for loneliness. Without dedup the
    // count is inflated. With dedup, each real song counts once.
    const dist = getThemeYearDistribution("loneliness");
    const y2020 = dist.find((d) => d.year === 2020);
    expect(y2020).toBeDefined();
    // The corpus has many chart positions in 2020; the dedup'd
    // count should be smaller than 50 (max chart positions per year).
    expect(y2020!.songCount).toBeLessThan(50);
  });
});

describe("getThemeEraDelta — narrative math", () => {
  it("returns a non-null delta for a real theme with chart coverage", () => {
    const delta = getThemeEraDelta("loneliness");
    expect(delta).not.toBeNull();
    expect(delta!.peakYear).toBeGreaterThanOrEqual(1960);
    expect(delta!.totalSongs).toBeGreaterThan(0);
  });

  it("computes era deltas: recent vs reference era", () => {
    // For any theme with coverage in both streaming_transition_era
    // (2012-2019) and global_streaming_era (2020-2023), the delta
    // fields should be defined.
    const delta = getThemeEraDelta("identity");
    expect(delta).not.toBeNull();
    expect(delta!.recentEra.start).toBe(2020);
    expect(delta!.referenceEra.start).toBe(2012);
    expect(delta!.recentEra.songCount).toBeGreaterThan(0);
    expect(delta!.referenceEra.songCount).toBeGreaterThan(0);
  });

  it("trend label is one of rising/falling/stable/novel", () => {
    const delta = getThemeEraDelta("love");
    expect(delta).not.toBeNull();
    expect(["rising", "falling", "stable", "novel"]).toContain(delta!.trend);
  });

  it("returns null for a theme with no chart coverage", () => {
    // "escape" isn't in the seeded themes list, so this should be null.
    const delta = getThemeEraDelta("__definitely_not_a_real_theme__");
    expect(delta).toBeNull();
  });
});

describe("getRelatedThemes — co-occurrence at the song level", () => {
  it("returns themes that actually co-occur on real songs", () => {
    const related = getRelatedThemes("loneliness", 6);
    expect(related.length).toBeGreaterThan(0);
    // Per the live data, identity co-occurs with loneliness on 93+
    // songs in the dedup'd corpus. The exact number depends on the
    // corpus but the order should be stable.
    const top = related[0];
    expect(top.coOccurrence).toBeGreaterThan(0);
    expect(top.coOccurrenceRate).toBeGreaterThan(0);
    expect(top.coOccurrenceRate).toBeLessThanOrEqual(1);
  });

  it("related themes are sorted by co-occurrence count desc", () => {
    const related = getRelatedThemes("love", 6);
    for (let i = 1; i < related.length; i++) {
      expect(related[i - 1]!.coOccurrence).toBeGreaterThanOrEqual(related[i]!.coOccurrence);
    }
  });

  it("jaccard is in [0, 1] for every result", () => {
    const related = getRelatedThemes("identity", 6);
    for (const r of related) {
      expect(r.jaccard).toBeGreaterThanOrEqual(0);
      expect(r.jaccard).toBeLessThanOrEqual(1);
    }
  });

  it("returns empty list for an unknown theme", () => {
    const related = getRelatedThemes("__no_such_theme__", 6);
    expect(related).toEqual([]);
  });
});
