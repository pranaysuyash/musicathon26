// Cyanite.ai API client (audio mood / genre / energy / BPM / key).
//
// Per motto_v3 §0.9 (routing rule) and §0.15 (third-layer rule),
// Cyanite is the "audio" half of the intelligence pipeline —
// separate from the lyric-half (themes, NER, embeddings). The
// schema columns (source_api, model_version) accommodate both
// halves without per-source special cases.
//
// Not invoked in the current build (no CYANITE_API_KEY configured).
// The client and the enrich.py integration hook are present so the
// pipeline can swap in Cyanite audio mood when a key is available,
// without code surgery.

import "server-only";

const BASE = "https://api.cyanite.ai/v1";

function apiKey(): string {
  const k = process.env.CYANITE_API_KEY;
  if (!k) throw new Error("CYANITE_API_KEY not set");
  return k;
}

async function call<T>(path: string, body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        "User-Agent": "VerseSignal/0.1 (Musicathon 2026)",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Cyanite ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export interface CyaniteMoodVector {
  // Cyanite returns mood scores in a fixed 7-mood space (their
  // proprietary "Mood Matrix"). We surface the names they use
  // and let consumers map to our own 10-mood schema as needed.
  moods: Record<string, number>;
  energy?: number;
  valence?: number;
  arousal?: number;
  bpm?: number;
  key?: string;
  genre?: { primary: string; sub?: string[]; confidence?: number };
  // Cyanite's recommendation id, useful for caching/dedup.
  recordingId?: string;
  // Per 0.9, the model version returned by Cyanite.
  modelVersion?: string;
}

/**
 * Get Cyanite's audio analysis for a track. Accepts a Spotify
 * track ID (Cyanite's primary input) or a file URL.
 *
 * Returns null on any failure: the per-0.9 fallback chain should
 * log a warning and continue with the lexicon-proxy mood.
 */
export async function getAudioAnalysis(opts: { spotifyTrackId?: string; audioUrl?: string }): Promise<CyaniteMoodVector | null> {
  if (!opts.spotifyTrackId && !opts.audioUrl) {
    throw new Error("Cyanite: need spotifyTrackId or audioUrl");
  }
  try {
    const body: Record<string, unknown> = {};
    if (opts.spotifyTrackId) body.spotifyTrackId = opts.spotifyTrackId;
    if (opts.audioUrl) body.audioUrl = opts.audioUrl;
    const result = await call<{ recordingId: string; analysis?: Partial<CyaniteMoodVector> }>(
      "/analyze",
      body
    );
    return {
      ...(result.analysis ?? {}),
      recordingId: result.recordingId,
      modelVersion: "cyanite-v1",
    } as CyaniteMoodVector;
  } catch (err) {
    console.warn(`Cyanite analysis failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Map Cyanite's Mood Matrix to our 10-mood schema.
 * Each output mood takes the max score from the most-similar
 * Cyanite moods, so an "aggressive" Cyanite score of 0.8 surfaces
 * as our "angry" mood with 0.8.
 */
const CYANITE_TO_OURS: Array<[string, string]> = [
  ["aggressive", "angry"],
  ["aggressive", "tense"],
  ["energetic", "energetic"],
  ["happy", "celebratory"],
  ["happy", "romantic"],
  ["sad", "melancholic"],
  ["sad", "somber"],
  ["sad", "grief"],
  ["relaxed", "dreamy"],
  ["romantic", "romantic"],
  ["peaceful", "dreamy"],
];

export function mapCyaniteToOurMoods(c: CyaniteMoodVector): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cy, ours] of CYANITE_TO_OURS) {
    const v = c.moods[cy] ?? 0;
    out[ours] = Math.max(out[ours] ?? 0, v);
  }
  return out;
}
