import {
  getLyrics,
  searchTrack,
  searchTrackByFields,
  type MXMTrack,
} from "@/lib/api/musixmatch";
import { fetchLyricsFromGenius, isGeniusAvailable } from "@/lib/api/genius";
import { isProtectedArtist } from "@/lib/db/protected-artists";

type LyricSource = "musixmatch" | "genius";

interface LyricFetchResult {
  source: LyricSource;
  plainLyrics: string;
  musixmatchTrackId?: number;
}

interface SplittedLyricLine {
  text: string;
  section: string | null;
}

function cleanArtist(rawArtist: string): string {
  if (isProtectedArtist(rawArtist)) return rawArtist;
  return rawArtist
    .replace(/\s+(?:feat\.?|featuring|ft\.?|&|and|with)\b.*$/i, "")
    .trim();
}

function cleanTitle(rawTitle: string): string {
  return rawTitle.replace(/\s+\(.*?\)\s*$/, "").trim();
}

function artistMatches(foundArtist: string, expectedArtist: string): boolean {
  const f = foundArtist.toLowerCase().trim();
  const e = expectedArtist.toLowerCase().trim();
  if (!f || !e) return false;
  if (f === e) return true;
  const fPrimary = f.split(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b/i)[0]?.trim();
  const ePrimary = e.split(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b/i)[0]?.trim();
  if (!fPrimary || !ePrimary) return false;
  if (fPrimary === ePrimary) return true;
  return (fPrimary.includes(ePrimary) || ePrimary.includes(fPrimary)) && fPrimary.length >= 2 && ePrimary.length >= 2;
}

function titleMatches(foundTitle: string, expectedTitle: string): boolean {
  const f = foundTitle.toLowerCase().replace(/\s+\(.*?\)\s*/g, "").trim();
  const e = expectedTitle.toLowerCase().replace(/\s+\(.*?\)\s*/g, "").trim();
  if (!f || !e) return false;
  if (f === e) return true;
  return f.length >= 4 && e.length >= 4 && (f.includes(e) || e.includes(f));
}

function trackMatches(track: MXMTrack, title: string, artist: string): boolean {
  return titleMatches(track.track_name, title) && artistMatches(track.artist_name, artist);
}

async function findTrack(title: string, artist: string): Promise<MXMTrack | null> {
  const cleanedArtist = cleanArtist(artist);
  const cleanedTitle = cleanTitle(title);
  try {
    const byField = await searchTrackByFields(cleanedTitle, cleanedArtist, 8);
    const trackedByField = byField.find((t) => trackMatches(t, cleanedTitle, cleanedArtist));
    if (trackedByField) return trackedByField;

    const byCombined = await searchTrack(`${cleanedTitle} ${cleanedArtist}`, 8);
    const trackedCombined = byCombined.find((t) => trackMatches(t, cleanedTitle, cleanedArtist));
    if (trackedCombined) return trackedCombined;

    const byTitle = await searchTrack(cleanedTitle, 8);
    const trackedByTitle = byTitle.find((t) => trackMatches(t, cleanedTitle, cleanedArtist));
    if (trackedByTitle) return trackedByTitle;

    console.warn(`  ! no verified track match for "${title}" — ${cleanedArtist}`);
    return null;
  } catch (err) {
    console.warn(`  search failed for "${title}" — ${cleanedArtist}: ${(err as Error).message}`);
    return null;
  }
}

export async function fetchLyricsWithFallback(title: string, artist: string): Promise<LyricFetchResult | null> {
  const track = await findTrack(title, artist);
  if (track) {
    try {
      const plainLyrics = await getLyrics(track.track_id);
      if (plainLyrics) {
        return {
          source: "musixmatch",
          musixmatchTrackId: track.track_id,
          plainLyrics,
        };
      }
    } catch (err) {
      console.warn(`  musixmatch fallback ingest failed for "${title}": ${(err as Error).message}`);
    }
  }

  if (!isGeniusAvailable()) return null;
  const genius = await fetchLyricsFromGenius(title, artist);
  if (!genius?.plainLyrics) return null;
  return {
    source: "genius",
    plainLyrics: genius.plainLyrics,
  };
}

export function splitLyricsToLines(lyrics: string): SplittedLyricLine[] {
  const lines = lyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const out: SplittedLyricLine[] = [];
  let section: string | null = null;
  for (const line of lines) {
    const sectionMatch = line.match(/^\[(.*?)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]!.toLowerCase();
      continue;
    }
    out.push({ text: line, section });
  }
  return out;
}

export type { LyricFetchResult, SplittedLyricLine };
