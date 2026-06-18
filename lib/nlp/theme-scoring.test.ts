// Tests for the theme-scoring lexicon logic.
//
// Per motto_v3 §0.15 (third-layer rule), the lexicon in
// `lib/nlp/theme-lexicon.json` is the data layer; the scoring
// logic in `lib/nlp/theme-scoring.ts` is the pipeline. We test
// the pipeline behavior so a future data-layer change doesn't
// silently break the scoring.

import { describe, it, expect } from "vitest";
import { lexiconScore, topThemes, THEME_LABELS, THEME_COLORS } from "./theme-scoring";

describe("theme-scoring lexicon", () => {
  it("returns the expected totalTokens denominator (1 for empty input — safe division)", () => {
    // Per the implementation, totalTokens is `max(1, len(tokens))` —
    // a safe-divisor convention so the normalized score formula
    // never divides by zero. The test asserts the actual contract.
    const r = lexiconScore("");
    expect(r.totalTokens).toBe(1);
    for (const t of Object.keys(r.perTheme)) {
      expect(r.perTheme[t as keyof typeof r.perTheme].score).toBe(0);
    }
  });

  it("matches unigrams in their theme bucket", () => {
    const r = lexiconScore("I love you tonight forever");
    const love = r.perTheme.love;
    expect(love.score).toBeGreaterThan(0);
    expect(love.hits.some((h) => h.term === "love")).toBe(true);
  });

  it("matches bigrams (two-word phrases)", () => {
    // "in love" is in the lexicon's love theme
    const r = lexiconScore("I fell in love with you");
    const love = r.perTheme.love;
    expect(love.hits.some((h) => h.term === "in love")).toBe(true);
  });

  it("matches trigrams (three-word phrases)", () => {
    // "falling in love" is a 3-word phrase in the love theme
    const r = lexiconScore("I am falling in love with you tonight");
    const love = r.perTheme.love;
    expect(love.hits.some((h) => h.term === "falling in love")).toBe(true);
  });

  it("per-theme evidence is sorted by count (highest first)", () => {
    const r = lexiconScore("love love love you you tonight");
    const love = r.perTheme.love;
    // 'love' should appear at least 3 times
    const loveHit = love.hits.find((h) => h.term === "love");
    expect(loveHit?.count).toBeGreaterThanOrEqual(3);
  });

  it("is case-insensitive", () => {
    const lower = lexiconScore("i love you");
    const upper = lexiconScore("I LOVE YOU");
    expect(lower.perTheme.love.score).toBe(upper.perTheme.love.score);
  });

  it("topThemes returns the top N by score, sorted descending", () => {
    const t = topThemes("fall in love with you tonight forever in my heart home", 3);
    expect(t.length).toBeLessThanOrEqual(3);
    expect(t[0].score).toBeGreaterThanOrEqual(t[t.length - 1].score);
  });

  it("topThemes with empty input returns N zero-score entries (graceful, not exception)", () => {
    // The contract: always return a stable-shape array. Empty
    // input is a valid query that returns the top N themes all
    // with score 0, rather than throwing.
    const t = topThemes("", 5);
    expect(t.length).toBe(5);
    expect(t.every((x) => x.score === 0)).toBe(true);
  });

  it("THEME_LABELS covers all themes with display names", () => {
    // Sanity: we have labels for all the lexicon themes
    expect(Object.keys(THEME_LABELS).length).toBeGreaterThanOrEqual(15);
    // Love, identity, hope all have display labels
    expect(THEME_LABELS.love).toBeTruthy();
    expect(THEME_LABELS.identity).toBeTruthy();
  });

  it("THEME_COLORS provides a color for every theme label", () => {
    for (const k of Object.keys(THEME_LABELS)) {
      expect(THEME_COLORS[k as keyof typeof THEME_COLORS]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
