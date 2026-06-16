// Songstats API client (https://api.songstats.com).
// Auth: apikey query param.
// Endpoints we use:
//   - /artist/lookup        resolve by name
//   - /track/lookup         resolve by name + artist
//   - /track/currentstats   current streaming / playlist metrics
//   - /artist/currentstats  current audience / platform metrics
//   - /track/historical     historical chart / streaming data
//
// Songstats is the cultural-weight layer: chart rank, playlist presence,
// platform momentum feed into edge weights and confidence.

const BASE = "https://api.songstats.com/v1";

function apiKey(): string {
  const k = process.env.SONGSTATS_API_KEY;
  if (!k) throw new Error("SONGSTATS_API_KEY not set");
  return k;
}

async function call<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("apikey", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "VerseSignal/0.1 (Musicathon 2026)" },
  });
  if (!res.ok) {
    throw new Error(`Songstats ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface SongstatsTrackStats {
  track_id: string;
  name: string;
  artists: { id: string; name: string }[];
  current_stats?: {
    spotify?: { popularity?: number; streams_total?: number; streams_recent?: number };
    apple_music?: { chart_positions?: { country: string; position: number }[] };
    youtube?: { views?: number };
    shazams?: number;
    tiktok_creates?: number;
  };
  historical_stats?: { date: string; streams: number; position?: number }[];
  playlists?: { playlist_id: string; name: string; platform: string; added_at?: string }[];
}

export async function lookupTrack(trackName: string, artistName: string): Promise<SongstatsTrackStats | null> {
  try {
    const body = await call<{ tracks: SongstatsTrackStats[] }>("/track/lookup", {
      track_name: trackName,
      artist_name: artistName,
    });
    return body.tracks?.[0] ?? null;
  } catch (err) {
    // Track not found is not a fatal pipeline error.
    if (err instanceof Error && (err.message.includes("404") || err.message.includes("400"))) return null;
    throw err;
  }
}

export async function getCurrentStats(trackId: string): Promise<SongstatsTrackStats | null> {
  try {
    return await call<SongstatsTrackStats>("/track/currentstats", { track_id: trackId });
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

export function culturalWeight(stats: SongstatsTrackStats | null): number {
  // 0..1 mapping combining popularity, recent streams, and playlist presence.
  if (!stats?.current_stats) return 0.3;
  const pop = stats.current_stats.spotify?.popularity ?? 0;
  const streams = stats.current_stats.spotify?.streams_recent ?? 0;
  const playlists = stats.playlists?.length ?? 0;
  const popW = pop / 100;
  const streamsW = Math.min(1, Math.log10(streams + 1) / 7);
  const playW = Math.min(1, playlists / 20);
  return Math.min(1, popW * 0.5 + streamsW * 0.3 + playW * 0.2);
}
