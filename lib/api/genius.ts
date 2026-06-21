// Genius API fallback for lyric ingestion.
// This module intentionally remains best-effort:
// - if credentials are missing, it returns null quickly
// - if scraping fails, it falls back to null without breaking the main pipeline
//
// Per docs/findings/2026-06-20-genius-integration-failed.md, this module
// was found to ingest wrong-page data. The 3 fixes below (URL filter,
// hit verification, parser scoping) prevent that regression.

import { URL } from "node:url";
import { isProtectedArtist } from "../db/protected-artists";

interface GeniusSearchResponse {
  response: {
    hits: {
      result: {
        id: number;
        title: string;
        primary_artist: { name: string };
        url: string;
      };
    }[];
  };
}

const BASE = "https://api.genius.com";

function accessToken(): string | null {
  return process.env.GENIUS_ACCESS_TOKEN?.trim() || null;
}

function sanitize(value: string): string {
  return value
    .replace(/\s*\(.*?\)\s*$/g, "")
    .replace(/\s+&\s+/g, " and ")
    .replace(/[‘’“”]/g, "'")
    .trim()
    .toLowerCase();
}

function artistMatches(foundArtist: string, expected: string): boolean {
  const found = sanitize(foundArtist);
  const wanted = sanitize(expected);
  if (!found || !wanted) return false;
  if (found === wanted) return true;
  // Strip collaborator suffixes from both sides for token comparison
  const stripSuffix = (s: string) =>
    s
      .replace(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b.*$/i, "")
      .replace(/,.*$/, "")
      .trim();
  const fPrim = stripSuffix(found);
  const wPrim = stripSuffix(wanted);
  if (fPrim === wPrim) return true;
  // Token-level: every primary token of `found` must be a primary
  // token of `wanted` (handles "G-Eazy" vs "G-Eazy, Halsey"). We
  // also accept a 50% overlap for short-artist edge cases.
  const fTokens = fPrim.split(/\s+/).filter((s) => s.length >= 2);
  const wTokens = new Set(wPrim.split(/\s+/).filter((s) => s.length >= 2));
  if (fTokens.length === 0) return false;
  let overlap = 0;
  for (const t of fTokens) if (wTokens.has(t)) overlap++;
  return overlap / fTokens.length >= 0.5;
}

function titleMatches(foundTitle: string, expected: string): boolean {
  const f = sanitize(foundTitle);
  const e = sanitize(expected);
  if (!f || !e) return false;
  // Strip trailing parentheticals and punctuation for comparison
  const norm = (s: string) => s
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/[.!?]+\s*$/g, "")
    .replace(/['']/g, "")
    // Normalize "&" to "and" so "Him & I" matches "Him and I"
    .replace(/\s+&\s+/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
  const fn = norm(f);
  const en = norm(e);
  if (fn === en) return true;
  // Substring match with a length floor — but ONLY if neither
  // title contains remix/version/feat indicators that signal a
  // different recording.
  const remixMarkers = /\b(remix|remaster|version|edit|mix|remake|rework|live|acoustic|remastered|tribute|cover|feat\.?|featuring|ft\.?)\b/i;
  const fHasRemix = remixMarkers.test(fn);
  const eHasRemix = remixMarkers.test(en);
  if (fHasRemix !== eHasRemix) return false;
  if (fn.includes(en) || en.includes(fn)) {
    return Math.min(fn.length, en.length) >= 4;
  }
  // Token-level: most tokens must overlap. Filter out tokens that
  // are single-char or pure punctuation to handle "&" / "&" etc.
  const tokens = (s: string) =>
    new Set(s.split(/\s+/).filter((t) => t.length >= 2 && /[a-z0-9]/i.test(t)));
  const fTokens = tokens(fn);
  const eTokens = tokens(en);
  let overlap = 0;
  for (const t of fTokens) if (eTokens.has(t)) overlap++;
  const smaller = Math.min(fTokens.size, eTokens.size);
  return smaller > 0 && overlap / smaller >= 0.7;
}

// Genius song-page URLs end in `-lyrics` (e.g.
// "https://genius.com/The-weeknd-blinding-lights-lyrics"). Calendar
// pages, list pages, and blog posts end in `-annotated` or other
// suffixes. Per the post-mortem, calendar pages were the dominant
// wrong-page type — they often mention song titles in body text.
function isLikelySongPage(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.hostname !== "genius.com") return false;
    // Song pages: .../{artist-slug}-{song-slug}-lyrics
    // Non-song pages: .../{slug}-annotated, .../anything-else
    return /\/[\w-]+-[\w-]+-lyrics$/.test(u.pathname);
  } catch {
    return false;
  }
}

async function call<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
  const token = accessToken();
  if (!token) throw new Error("GENIUS_ACCESS_TOKEN not set");

  const url = new URL(`${BASE}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  // Per Genius API docs (https://docs.genius.com/), the recommended
  // auth header is `Authorization: Bearer <token>`. The legacy
  // `?access_token=` query param still works but is documented as
  // "use only when the Authorization header isn't possible." Modern
  // fetch implementations support the header on the same-origin and
  // cross-origin requests, so we use Bearer auth.
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "VerseSignal/0.1 (Musicathon 2026)",
    },
  });

  if (!res.ok) {
    throw new Error(`Genius ${method} failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

function decodeHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Per the post-mortem, the original parser used `[...html.matchAll(...)]`
// which captured EVERY `<div data-lyrics-container="true">` on the
// page — including the "Related Songs" / "You might also like" footer.
//
// The fix has 3 layers:
//   1. Pick the LONGEST match (the actual lyrics are ~3000+ chars
//      while the translations bar is shorter and the empty divs are
//      0 chars).
//   2. Reject matches that start with the translations/header
//      chrome patterns ("ContributorsTranslations", "X Contributors",
//      "Lyrics", etc.) — those are page metadata, not lyrics.
//   3. Fall back to the `Lyrics__Root` CSS class which Genius uses
//      for the actual song lyrics container.
const PAGE_CHROME_RE = /^(?:\d+\s*Contributors|Translations|Lyrics|Reader Comments|Related Songs|Embed)/i;

function pickLyricsFromHtml(html: string): string | null {
  const matches = [...html.matchAll(/<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g)];
  if (matches.length === 0) {
    // Fallback to Lyrics__Root class
    const m2 = html.match(/<div[^>]+class="[^"]*Lyrics__Root[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (m2) {
      const decoded = decodeHtml(m2[1] ?? "");
      if (decoded.length > 0 && !PAGE_CHROME_RE.test(decoded.substring(0, 100))) {
        return decoded;
      }
    }
    return null;
  }
  // Pick the longest decoded match that doesn't start with page chrome.
  let best: string | null = null;
  for (const m of matches) {
    const decoded = decodeHtml(m[1] ?? "");
    if (decoded.length === 0) continue;
    if (PAGE_CHROME_RE.test(decoded.substring(0, 100))) continue;
    if (!best || decoded.length > best.length) {
      best = decoded;
    }
  }
  if (best) return best;
  // Fallback: if every match was page chrome, return null rather
  // than ingesting garbage.
  return null;
}

export async function fetchLyricsFromGenius(title: string, artist: string): Promise<{ plainLyrics: string } | null> {
  const token = accessToken();
  if (!token) return null;

  const cleanedTitle = title
    .replace(/\s*\/\s*[^/]+$/, "") // strip "Candle in the Wind 1997 / Something About..."
    .replace(/\s+\(.*?\)\s*$/g, "")
    .trim();
  const cleanedArtist = isProtectedArtist(artist) ? artist : artist.replace(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b.*$/i, "").trim();

  try {
    const search = await call<GeniusSearchResponse>("search", {
      q: `${cleanedTitle} ${cleanedArtist}`,
      per_page: 8,
    });

    const hits = search.response.hits.map((h) => ({
      id: h.result.id,
      title: h.result.title,
      artistName: h.result.primary_artist.name,
      url: h.result.url,
    }));

    // Per the post-mortem, the original code took the first hit
    // (calendar pages, list pages, etc.). The fix is to verify:
    //   1. URL is a song page (`-lyrics` suffix, no `-annotated`)
    //   2. Title matches the expected song title
    //   3. Artist matches the expected artist
    // If NO hit passes all 3 checks, return null. Don't fall back
    // to the first hit — silent fallback is what caused the bug.
    const verified = hits.find((h) =>
      isLikelySongPage(h.url) &&
      titleMatches(h.title, cleanedTitle) &&
      artistMatches(h.artistName, cleanedArtist)
    );
    if (!verified) return null;

    const page = await fetch(verified.url, {
      headers: {
        "User-Agent": "VerseSignal/0.1 (Musicathon 2026)",
      },
    });
    if (!page.ok) return null;
    const html = await page.text();
    const plainLyrics = pickLyricsFromHtml(html);
    return plainLyrics ? { plainLyrics } : null;
  } catch {
    return null;
  }
}

export function isGeniusAvailable(): boolean {
  return !!accessToken();
}
