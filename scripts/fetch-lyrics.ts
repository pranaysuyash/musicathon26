// Fetch lyrics from Musixmatch for every song in the DB that doesn't have any yet.
// Idempotent: re-runs only on rows with no lyric_lines entries.
//
// Rate: Musixmatch free tier is ~2/sec; we run sequentially with a small delay
// and log a friendly warning if a track isn't found (covers rare API gaps).

import "dotenv/config";
import { closeDb, getDb, initDb } from "../lib/db";
import { all } from "../lib/db/sql";
import { searchTrack, ingestTrack, type MXMTrack } from "../lib/api/musixmatch";
import { fetchLyricsFromGenius, isGeniusAvailable } from "../lib/api/genius";

const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SongRow {
  id: string;
  title: string;
  artist: string;
  year: number;
}

interface SongIdRow { song_id: string }

type LyricSource = "musixmatch" | "genius";

interface LyricFetchResult {
  source: LyricSource;
  plainLyrics: string;
  musixmatchTrackId?: number;
}

function cleanArtist(s: string): string {
  return s.replace(/\s+(?:feat\.?|featuring|ft\.?|&|and|with)\b.*$/i, "").trim();
}

function cleanTitle(s: string): string {
  return s.replace(/\s+\(.*?\)\s*$/, "").trim();
}

async function findTrack(title: string, artist: string): Promise<MXMTrack | null> {
  const cleanedArtist = cleanArtist(artist);
  const cleanedTitle = cleanTitle(title);
  try {
    // First try title + artist
    const direct = await searchTrack(`${cleanedTitle} ${cleanedArtist}`, 5);
    // Per 0.6 blast-radius + 0.10 observability: verify the artist
    // name actually matches the result before accepting. Previously
    // this script took `direct[0]` blindly, which is why songs like
    // "Meant to Be" (Bebe Rexha) and "The Middle" (Zedd) ended up
    // with identical wrong lyrics.
    const verified = direct.find((t) => artistMatches(t.artist_name, cleanedArtist));
    if (verified) return verified;
    // Fallback: title only, but also with artist verification
    const loose = await searchTrack(cleanedTitle, 5);
    const match = loose.find((t) => artistMatches(t.artist_name, cleanedArtist));
    if (match) return match;
    // Last resort: take the top result with a warning so the
    // data-quality guard in build-similar-edges.py can catch it.
    console.warn(`  ! no artist match for "${title}" — ${cleanedArtist}; using top result (${direct[0]?.artist_name ?? loose[0]?.artist_name ?? "?"})`);
    return direct[0] ?? loose[0] ?? null;
  } catch (err) {
    console.warn(`  search failed for "${title}" — ${cleanedArtist}: ${(err as Error).message}`);
    return null;
  }
}

async function fetchLyricsWithFallback(title: string, artist: string): Promise<LyricFetchResult | null> {
  const track = await findTrack(title, artist);
  if (track) {
    try {
      const ingested = await ingestTrack(track.track_id);
      if (ingested.plainLyrics) {
        return {
          source: "musixmatch",
          musixmatchTrackId: track.track_id,
          plainLyrics: ingested.plainLyrics,
        };
      }
    } catch (err) {
      console.warn(`  musixmatch ingest failed: ${(err as Error).message}`);
    }
  }

  if (!isGeniusAvailable()) return null;
  const fallback = await fetchLyricsFromGenius(title, artist);
  if (!fallback?.plainLyrics) return null;

  return {
    source: "genius",
    plainLyrics: fallback.plainLyrics,
  };
}

// True if the Musixmatch result's artist name matches the
// cleanedArtist we expected. Uses bidirectional substring match
// so "Drake" matches "Drake" or "Aubrey Drake Graham", and
// "Bebe Rexha" matches "Bebe Rexha featuring Florida Georgia Line"
// (we accept the prefix).
function artistMatches(foundArtist: string, expected: string): boolean {
  const f = foundArtist.toLowerCase().trim();
  const e = expected.toLowerCase().trim();
  if (!f || !e) return false;
  if (f === e) return true;
  // Split on "feat./ft./&/and/with" so "Drake" matches "Drake feat. X"
  const fPrimary = f.split(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b/i)[0]!.trim();
  const ePrimary = e.split(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b/i)[0]!.trim();
  if (!fPrimary || !ePrimary) return false;
  if (fPrimary === ePrimary) return true;
  // Allow prefix if one is fully contained in the other
  if (fPrimary.includes(ePrimary) || ePrimary.includes(fPrimary)) {
    return fPrimary.length >= 2 && ePrimary.length >= 2;
  }
  return false;
}

function splitLines(lyrics: string): { text: string; section: string | null }[] {
  const lines = lyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const out: { text: string; section: string | null }[] = [];
  let currentSection: string | null = null;
  for (const line of lines) {
    const bracket = line.match(/^\[(.*?)\]$/);
    if (bracket) {
      currentSection = bracket[1]!.toLowerCase();
      continue;
    }
    out.push({ text: line, section: currentSection });
  }
  return out;
}

async function main() {
  initDb();
  const db = getDb();

  const songRows = all<SongRow>(
    `SELECT id, title, artist, year FROM songs ORDER BY year, chart_rank`
  );

  const alreadyRows = all<SongIdRow>(`SELECT DISTINCT song_id FROM lyric_lines`);
  const already = new Set(alreadyRows.map((r) => r.song_id));

  const targets = songRows.filter((s) => !already.has(s.id));
  console.log(`→ ${songRows.length} songs total, ${already.size} already ingested, ${targets.length} to fetch.`);

  const insertTrackId = db.prepare(`UPDATE songs SET musixmatch_track_id = ? WHERE id = ?`);
  const insertLine = db.prepare(
    `INSERT OR REPLACE INTO lyric_lines (id, song_id, line_index, text, section)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertEntityHint = db.prepare(
    `UPDATE lyric_lines SET has_named_entity = 1 WHERE id = ? AND text LIKE ?`
  );

  let ok = 0, fail = 0, restricted = 0;
  for (let i = 0; i < targets.length; i++) {
    const s = targets[i]!;
    process.stdout.write(`[${i + 1}/${targets.length}] ${s.year} · ${s.artist} — ${s.title}\n`);
    const fetched = await fetchLyricsWithFallback(s.title, s.artist);
    if (!fetched) {
      fail++;
      await sleep(DELAY_MS);
      continue;
    }
    if (fetched.source === "musixmatch") {
      const trackId = fetched.musixmatchTrackId;
      if (!trackId) {
        fail++;
        await sleep(DELAY_MS);
        continue;
      }
      insertTrackId.run(trackId, s.id);
    }

    if (!fetched.plainLyrics) {
      process.stdout.write(`  · no lyrics available\n`);
      restricted++;
      await sleep(DELAY_MS);
      continue;
    }
    try {
      const lines = splitLines(fetched.plainLyrics);
      for (let li = 0; li < lines.length; li++) {
        const id = `versesignal:ll:${s.id}:${li}`;
        insertLine.run(id, s.id, li, lines[li]!.text, lines[li]!.section);
      }
      // Quick entity hint: lines containing capitalized tokens (rough).
      for (let li = 0; li < lines.length; li++) {
        const text = lines[li]!.text;
        if (/\b[A-Z][a-z]+\b/.test(text) && /[A-Z][a-z]+/.test(text.slice(1))) {
          insertEntityHint.run(
            `versesignal:ll:${s.id}:${li}`,
            `%${text.split(/\s+/).find((w) => /^[A-Z]/.test(w)) ?? ""}%`
          );
        }
      }
      process.stdout.write(`  · ${fetched.source} · ${lines.length} lines\n`);
      ok++;
    } catch (err) {
      fail++;
      console.warn(`  ✗ ingest failed: ${(err as Error).message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n✓ Done. ok=${ok}  fail=${fail}  restricted=${restricted}`);
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
