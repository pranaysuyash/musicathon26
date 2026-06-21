import {
  getLyrics,
  searchTrack,
  searchTrackByFields,
  type MXMTrack,
} from "@/lib/api/musixmatch";
import { searchLRCLib } from "@/lib/api/lrclib";
import { searchLyricsOvh } from "@/lib/api/lyricsovh";
import { fetchLyricsFromGenius, isGeniusAvailable } from "@/lib/api/genius";
import { isProtectedArtist } from "@/lib/db/protected-artists";

type LyricSource = "musixmatch" | "lrclib" | "lyrics.ovh" | "genius";

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
  // Per Decision 0010, Musixmatch's q_artist field matches the
  // primary artist best. Strip everything after the first collaborator
  // delimiter so the API gets "Mark Ronson" instead of
  // "Mark Ronson, Bruno Mars" (which would return 0 results).
  return rawArtist
    .replace(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b.*$/i, "")
    .replace(/,.*$/, "")
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
  // Per motto 0.1, the question is "did we find this artist's
  // song?" — not "is the artist string byte-identical?" We split on
  // common collaborator delimiters (feat., &, and, with, comma)
  // and check if any of the resulting tokens overlap. This catches:
  //   "Mark Ronson" == "Mark Ronson, Bruno Mars"
  //   "Post Malone" == "Post Malone Zombie" (the album context)
  //   "Mark Ronson" == "Mark Ronson & Bruno Mars"
  const splitOn = /\s*(?:,|feat\.?|featuring|ft\.?|&|\band\b|\bwith\b|\bx\b)\s*/i;
  const fTokens = f.split(splitOn).map((s) => s.trim()).filter((s) => s.length >= 2);
  const eTokens = e.split(splitOn).map((s) => s.trim()).filter((s) => s.length >= 2);
  if (fTokens.length === 0 || eTokens.length === 0) return false;
  // Per Decision 0010, an exact-token match counts. We also accept
  // a substring match if one token starts with the other (catches
  // "Post Malone" vs "Post Malone Swae Lee").
  for (const ft of fTokens) {
    for (const et of eTokens) {
      if (ft === et) return true;
      if (ft.includes(et) || et.includes(ft)) {
        if (ft.length >= 4 && et.length >= 4) return true;
      }
    }
  }
  return false;
}

function titleMatches(foundTitle: string, expectedTitle: string): boolean {
  const f = foundTitle.toLowerCase().replace(/\s+\(.*?\)\s*/g, "").trim();
  const e = expectedTitle.toLowerCase().replace(/\s+\(.*?\)\s*/g, "").trim();
  if (!f || !e) return false;
  if (f === e) return true;
  // Per Decision 0015, we accept matches where the *cleaned* title
  // is a prefix or substring of the other, after stripping the
  // parenthetical disambiguators (e.g., "Wow" matches "Wow. (Remix)").
  // We also strip trailing punctuation so "Wow." == "Wow".
  const norm = (s: string) => s.replace(/[.!?]+\s*$/g, "").replace(/\s+/g, " ").trim();
  const fn = norm(f);
  const en = norm(e);
  if (fn === en) return true;
  if (fn.length >= 4 && en.length >= 4 && (fn.includes(en) || en.includes(fn))) return true;
  return false;
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
  // Fallback chain per Decision 0035:
  //   1. Musixmatch — primary source, structured (track_id for re-linking)
  //   2. LRCLib     — different corpus (indie/international), often has
  //                  Morgan Wallen country and regional tracks Musixmatch ignores
  //   3. Lyrics.ovh — simplest endpoint, often has classics (1960s-1990s)
  //                  and hits Musixmatch has lost licensing for
  //   4. Genius     — last resort, requires OAuth signup; only enabled
  //                  when GENIUS_ACCESS_TOKEN is set
  //
  // Each step is a quick HTTP call (timeout 8s). The chain completes
  // in under 5s for typical cases; we skip remaining sources as soon
  // as one returns lyrics.

  // Source 1: Musixmatch
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

  // Sources 2 & 3 use the same artist cleaning: strip comma-separated
  // collaborators so the query hits the primary artist.
  const cleanArtistForLookup = isProtectedArtist(artist)
    ? artist
    : artist
        .replace(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b.*$/i, "")
        .replace(/,.*$/, "")
        .trim();

  // Source 2: LRCLib
  try {
    const lrclib = await searchLRCLib(cleanArtistForLookup, title);
    if (lrclib?.plainLyrics) {
      return {
        source: "lrclib",
        plainLyrics: lrclib.plainLyrics,
      };
    }
  } catch (err) {
    console.warn(`  lrclib fallback failed for "${title}": ${(err as Error).message}`);
  }

  // Source 3: Lyrics.ovh
  try {
    const lyricsovh = await searchLyricsOvh(cleanArtistForLookup, title);
    if (lyricsovh) {
      return {
        source: "lyrics.ovh",
        plainLyrics: lyricsovh,
      };
    }
  } catch (err) {
    console.warn(`  lyrics.ovh fallback failed for "${title}": ${(err as Error).message}`);
  }

  // Source 4: Genius (only when GENIUS_ACCESS_TOKEN is set)
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
