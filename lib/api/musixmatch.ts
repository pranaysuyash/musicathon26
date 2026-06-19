// Musixmatch Pro API client.
// Auth: api_key as query param.
// Endpoints we use:
//   - /track.search        find a track by title/artist
//   - /track.get           get rich metadata
//   - /track.lyrics.get    get plain lyrics
//   - /track.richsync.get  get time-synced line segments
//   - /track.subtitle.get  get synced subtitle (richsync legacy)
//   - /matcher.subtitle.get fingerprint matcher (used later for uploads)

import { URL } from "node:url";

const BASE = "https://api.musixmatch.com/ws/1.1";

interface MusixmatchEnvelope<T> {
  message: {
    header: {
      status_code: number;
      execute_time: number;
    };
    body: T;
  };
}

function apiKey(): string {
  const k = process.env.MUSIXMATCH_API_KEY;
  if (!k) throw new Error("MUSIXMATCH_API_KEY not set");
  return k;
}

async function call<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE}/${method}`);
  url.searchParams.set("apikey", apiKey());
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "VerseSignal/0.1 (Musicathon 2026)" },
  });
  if (!res.ok) {
    throw new Error(`Musixmatch ${method} failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as MusixmatchEnvelope<T>;
  const code = json.message.header.status_code;
  if (code !== 200) {
    throw new Error(`Musixmatch ${method} returned status_code=${code}`);
  }
  return json.message.body;
}

export interface MXMTrack {
  track_id: number;
  track_name: string;
  artist_id: number;
  artist_name: string;
  album_name?: string;
  album_id?: number;
  track_length?: number;
  has_lyrics: 0 | 1;
  has_richsync: 0 | 1;
  has_subtitles: 0 | 1;
  release_date?: string;
  first_release_date?: string;
}

export interface MXMSearchResult {
  track_list: { track: MXMTrack }[];
}

export interface MXMLyrics {
  lyrics_id: number;
  lyrics_body: string;
  lyrics_language?: string;
  lyrics_copyright?: string;
  restricted?: number;
  instrumental?: number;
}

export interface MXMRichsyncLine {
  ts: string;     // "12.34"
  te: string;     // "13.45"
  l: { line: string; reftag?: { tag: string; ref?: string }[] };
}

export interface MXMRichsyncBody {
  richsync_id: number;
  lang?: string;
  restricted?: number;
  lines: MXMRichsyncLine[];
}

export async function searchTrack(query: string, limit: number = 10): Promise<MXMTrack[]> {
  const body = await call<MXMSearchResult>("track.search", { q: query, page_size: limit, s_track_rating: "desc" });
  return body.track_list.map((t) => t.track);
}

export async function searchTrackByFields(
  trackTitle: string,
  artistName: string,
  limit: number = 10
): Promise<MXMTrack[]> {
  const body = await call<MXMSearchResult>("track.search", {
    q_track: trackTitle,
    q_artist: artistName,
    page_size: limit,
    s_track_rating: "desc",
  });
  return body.track_list.map((t) => t.track);
}

export async function searchByCombined(
  title: string,
  artist: string,
  limit: number = 10
): Promise<MXMTrack[]> {
  const cleanedTitle = title.replace(/\s+\(.*?\)\s*$/g, "").trim();
  const cleanedArtist = artist.replace(/\s+(?:feat\.?|featuring|ft\.?|&|and|with)\b.*$/i, "").trim();
  const body = await call<MXMSearchResult>("track.search", {
    q: `${cleanedTitle} ${cleanedArtist}`,
    page_size: limit,
    s_track_rating: "desc",
  });
  return body.track_list.map((t) => t.track);
}

export async function getTrack(trackId: number): Promise<MXMTrack> {
  const body = await call<{ track: MXMTrack }>("track.get", { track_id: trackId });
  return body.track;
}

export async function getLyrics(trackId: number): Promise<string | null> {
  try {
    const body = await call<{ lyrics: MXMLyrics }>("track.lyrics.get", { track_id: trackId });
    if (body.lyrics.restricted || body.lyrics.instrumental) return null;
    // Strip the "...lyrics are property and copyright of..." footer Musixmatch appends.
    return body.lyrics.lyrics_body.replace(/\*{3,}[\s\S]*$/g, "").trim();
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

export async function getRichsync(trackId: number): Promise<MXMRichsyncLine[] | null> {
  try {
    const body = await call<{ richsync: MXMRichsyncBody }>("track.richsync.get", { track_id: trackId });
    if (body.richsync.restricted) return null;
    return body.richsync.lines;
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

export interface IngestedLyrics {
  track: MXMTrack;
  plainLyrics: string | null;
  richsync: MXMRichsyncLine[] | null;
}

export async function ingestTrack(trackId: number): Promise<IngestedLyrics> {
  const [track, plainLyrics, richsync] = await Promise.all([
    getTrack(trackId),
    getLyrics(trackId).catch(() => null),
    getRichsync(trackId).catch(() => null),
  ]);
  return { track, plainLyrics, richsync };
}
