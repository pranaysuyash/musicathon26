// LRCLib API client (https://lrclib.net).
//
// Per Decision 0035, LRCLib is the second fallback in the lyrics
// chain. It's free, no auth, and serves a different corpus from
// Musixmatch — many indie and international tracks that Musixmatch
// doesn't have (e.g., Morgan Wallen country, regional artists).
//
// The API returns:
//   - plainLyrics: lyrics without time-sync (what we ingest)
//   - syncedLyrics: same with LRC timestamps (we ignore these;
//     the song page renders lyrics by index, not timestamp)
//
// Endpoint: GET https://lrclib.net/api/get?artist_name=X&track_name=Y
// Response: 200 with JSON, or 404 when not found.

const BASE = "https://lrclib.net/api";

export interface LRCLibResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

export async function searchLRCLib(artist: string, track: string): Promise<LRCLibResponse | null> {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: track,
  });
  const url = `${BASE}/get?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "VerseSignal/0.1 (https://github.com/pranaysuyash/musicathon)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LRCLibResponse;
    return data?.plainLyrics ? data : null;
  } catch {
    return null;
  }
}
