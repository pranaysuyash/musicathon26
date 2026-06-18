// Genius API fallback for lyric ingestion.
// This module intentionally remains best-effort:
// - if credentials are missing, it returns null quickly
// - if scraping fails, it falls back to null without breaking the main pipeline

import { URL } from "node:url";

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
    .trim()
    .toLowerCase();
}

function artistMatches(foundArtist: string, expected: string): boolean {
  const found = sanitize(foundArtist);
  const wanted = sanitize(expected);
  if (!found || !wanted) return false;
  if (found === wanted) return true;
  if (found.includes(wanted) || wanted.includes(found)) return found.length >= 3 && wanted.length >= 3;
  return false;
}

async function call<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
  const token = accessToken();
  if (!token) throw new Error("GENIUS_ACCESS_TOKEN not set");

  const url = new URL(`${BASE}/${method}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
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

function pickLyricsFromHtml(html: string): string | null {
  const matches = [...html.matchAll(/<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g)];
  if (matches.length === 0) return null;
  const lyricBlocks = matches
    .map((m) => decodeHtml(m[1] ?? ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return lyricBlocks.length > 0 ? lyricBlocks : null;
}

export async function fetchLyricsFromGenius(title: string, artist: string): Promise<{ plainLyrics: string } | null> {
  const token = accessToken();
  if (!token) return null;

  const cleanedTitle = title.replace(/\s+\(.*?\)\s*$/g, "").trim();
  const cleanedArtist = artist.replace(/\s+(?:feat\.?|featuring|ft\.?|&|and|with)\b.*$/i, "").trim();

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

    const exact = hits.find((h) => {
      return h.title.toLowerCase().includes(cleanedTitle.toLowerCase()) && artistMatches(h.artistName, cleanedArtist);
    });
    const fallback = exact ?? hits[0];
    if (!fallback) return null;

    const page = await fetch(fallback.url, {
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
