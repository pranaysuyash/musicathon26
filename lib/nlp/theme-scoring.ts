// Theme scoring: hybrid of lexicon hits + (optional) embedding similarity.
// This is the cheap, fast, deterministic spine of the theme layer.
// LLM is used only for hard metaphor / indirect cases.

import lexicon from "./theme-lexicon.json";
import type { Theme } from "../types";

export const THEME_LABELS: Record<Theme, string> = Object.fromEntries(
  Object.entries(lexicon.themes).map(([k, v]) => [k as Theme, v.label])
) as Record<Theme, string>;

export const THEME_COLORS: Record<Theme, string> = Object.fromEntries(
  Object.entries(lexicon.themes).map(([k, v]) => [k as Theme, v.color])
) as Record<Theme, string>;

export const THEME_DESCRIPTIONS: Record<Theme, string> = Object.fromEntries(
  Object.entries(lexicon.themes).map(([k, v]) => [k as Theme, v.description])
) as Record<Theme, string>;

const LEMMAS = new Map<string, Set<Theme>>();
for (const [theme, def] of Object.entries(lexicon.themes) as [Theme, typeof lexicon.themes[Theme]][]) {
  for (const term of def.terms) {
    const key = term.toLowerCase();
    if (!LEMMAS.has(key)) LEMMAS.set(key, new Set());
    LEMMAS.get(key)!.add(theme);
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

export interface LexiconHit {
  term: string;
  themes: Theme[];
  count: number;
}

export function lexiconScore(lyrics: string): {
  perTheme: Record<Theme, { score: number; hits: LexiconHit[] }>;
  totalTokens: number;
} {
  const tokens = tokenize(lyrics);
  const totalTokens = tokens.length || 1;
  const bigrams = ngrams(tokens, 2);
  const trigrams = ngrams(tokens, 3);
  const candidates = [...tokens, ...bigrams, ...trigrams];

  const perTheme = {} as Record<Theme, { score: number; hits: LexiconHit[] }>;
  for (const theme of Object.keys(lexicon.themes) as Theme[]) {
    perTheme[theme] = { score: 0, hits: [] };
  }

  for (const cand of candidates) {
    const themes = LEMMAS.get(cand);
    if (!themes) continue;
    for (const theme of themes) {
      const bucket = perTheme[theme];
      bucket.score += 1;
      const existing = bucket.hits.find((h) => h.term === cand);
      if (existing) {
        existing.count += 1;
      } else {
        bucket.hits.push({ term: cand, themes: [theme], count: 1 });
      }
    }
  }

  // Normalize: hits per 1000 tokens (so longer songs aren't unfairly boosted).
  for (const theme of Object.keys(perTheme) as Theme[]) {
    perTheme[theme].score = (perTheme[theme].score / totalTokens) * 1000;
  }

  return { perTheme, totalTokens };
}

export function topThemes(
  lyrics: string,
  n: number = 5
): { theme: Theme; score: number; evidenceTerms: string[] }[] {
  const { perTheme } = lexiconScore(lyrics);
  return (Object.entries(perTheme) as [Theme, { score: number; hits: LexiconHit[] }][])
    .map(([theme, { score, hits }]) => ({
      theme,
      score,
      evidenceTerms: hits.sort((a, b) => b.count - a.count).slice(0, 8).map((h) => h.term),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
