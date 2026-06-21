// Lyrics.ovh API client (https://lyrics.ovh).
//
// Per Decision 0035, lyrics.ovh is the third fallback in the
// lyrics chain. It's free, no auth, and the URL is just
// `https://api.lyrics.ovh/v1/{artist}/{title}` — the simplest
// endpoint of any lyrics source we have.
//
// The API returns plain text lyrics wrapped in JSON:
//   { "lyrics": "..." }
// Status code 404 means "not found" (no lyrics indexed for this
// combination). We treat any non-2xx response as "no result."

const BASE = "https://api.lyrics.ovh/v1";

export interface LyricsOvhResponse {
  lyrics: string;
}

export async function searchLyricsOvh(artist: string, title: string): Promise<string | null> {
  const url = `${BASE}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "VerseSignal/0.1" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LyricsOvhResponse;
    const lyrics = data?.lyrics?.trim();
    return lyrics && lyrics.length > 0 ? lyrics : null;
  } catch {
    return null;
  }
}
