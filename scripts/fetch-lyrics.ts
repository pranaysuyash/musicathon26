// Fetch lyrics from Musixmatch for every song in the DB that doesn't have any yet.
// Idempotent: re-runs only on rows with no lyric_lines entries.
//
// Rate: Musixmatch free tier is ~2/sec; we run sequentially with a small delay
// and log a friendly warning if a track isn't found (covers rare API gaps).

import "dotenv/config";
import { closeDb, getDb, initDb } from "../lib/db";
import { all, get } from "../lib/db/sql";
import { searchTrack, ingestTrack, type MXMTrack } from "../lib/api/musixmatch";

const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SongRow {
  id: string;
  title: string;
  artist: string;
  year: number;
}

interface SongIdRow { song_id: string }

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
    const direct = await searchTrack(`${cleanedTitle} ${cleanedArtist}`, 5);
    if (direct.length > 0) return direct[0]!;
    // Fallback: title only
    const loose = await searchTrack(cleanedTitle, 5);
    const match = loose.find(
      (t) => t.artist_name.toLowerCase().includes(cleanedArtist.toLowerCase()) ||
             cleanedArtist.toLowerCase().includes(t.artist_name.toLowerCase())
    );
    return match ?? loose[0] ?? null;
  } catch (err) {
    console.warn(`  search failed for "${title}" — ${cleanedArtist}: ${(err as Error).message}`);
    return null;
  }
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
    const track = await findTrack(s.title, s.artist);
    if (!track) {
      fail++;
      await sleep(DELAY_MS);
      continue;
    }
    if (!track.has_lyrics) {
      process.stdout.write(`  · no lyrics available\n`);
      restricted++;
      await sleep(DELAY_MS);
      continue;
    }
    try {
      const ingested = await ingestTrack(track.track_id);
      if (!ingested.plainLyrics) {
        restricted++;
        await sleep(DELAY_MS);
        continue;
      }
      insertTrackId.run(track.track_id, s.id);
      const lines = splitLines(ingested.plainLyrics);
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
      ok++;
      process.stdout.write(`  · ${lines.length} lines\n`);
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
