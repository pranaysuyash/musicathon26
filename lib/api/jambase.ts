// JamBase API client (https://data.jambase.com).
// Auth: Authorization: Bearer <api_key> header.
// Endpoints we use:
//   - /v1/artists          search/lookup artists
//   - /v1/events           search concerts, tours, festivals
//   - /v1/venues           venue/geo lookup
//
// Used for the optional Earth view + tour-concert geography.

const BASE = "https://data.jambase.com/v1";

function apiKey(): string {
  const k = process.env.JAMBASE_API_KEY;
  if (!k) throw new Error("JAMBASE_API_KEY not set");
  return k;
}

async function call<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey()}`, "User-Agent": "VerseSignal/0.1 (Musicathon 2026)" },
  });
  if (!res.ok) {
    throw new Error(`JamBase ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface JamBaseEvent {
  id: string;
  name: string;
  date: string;
  venue?: { id: string; name: string; city?: string; country?: string; latitude?: number; longitude?: number };
  artists?: { id: string; name: string }[];
  tour?: { id: string; name: string };
  url?: string;
}

export async function searchEvents(
  artistName: string,
  opts: { startDate?: string; endDate?: string; limit?: number } = {}
): Promise<JamBaseEvent[]> {
  const body = await call<{ events: JamBaseEvent[] }>("/events", {
    artistName,
    startDate: opts.startDate ?? "",
    endDate: opts.endDate ?? "",
    pageSize: opts.limit ?? 25,
  });
  return body.events ?? [];
}

export async function lookupArtist(name: string): Promise<{ id: string; name: string; mb_id?: string } | null> {
  try {
    const body = await call<{ artists: { id: string; name: string; mb_id?: string }[] }>("/artists", { name, pageSize: 1 });
    return body.artists?.[0] ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}
