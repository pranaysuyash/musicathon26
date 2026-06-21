// Genius-only lyrics fetch for the remaining 13 songs after
// Musixmatch + LRCLib + lyrics.ovh have done their part.
//
// Per Decision 0035, this is the last-resort fallback. It only
// runs if GENIUS_ACCESS_TOKEN is set. Set the token in .env:
//   GENIUS_ACCESS_TOKEN=<paste-from-genius-api-clients>
//
// Register the API client at https://genius.com/api-clients with:
//   App Name:        VerseSignal
//   Icon URL:        your OG image URL
//   App Website URL: your deployed demo URL
//   Redirect URI:    your deployed demo URL/callback
//
// Run: npm run db:fetch-lyrics-genius
//
// Idempotent: re-runs only on rows with no lyric_lines entries.

import "dotenv/config";
import { closeDb, getDb, initDb } from "../lib/db";
import { all } from "../lib/db/sql";
import { fetchLyricsFromGenius, isGeniusAvailable } from "../lib/api/genius";
import { searchLRCLib } from "../lib/api/lrclib";
import { searchLyricsOvh } from "../lib/api/lyricsovh";
import { splitLyricsToLines } from "../lib/lyrics/fallback";

const DELAY_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SongRow {
  id: string;
  title: string;
  artist: string;
}

async function tryGenius(title: string, artist: string): Promise<string | null> {
  if (!isGeniusAvailable()) return null;
  const r = await fetchLyricsFromGenius(title, artist);
  return r?.plainLyrics ?? null;
}

async function tryLRCLib(title: string, artist: string): Promise<string | null> {
  const r = await searchLRCLib(artist, title);
  return r?.plainLyrics ?? null;
}

async function tryLyricsOvh(title: string, artist: string): Promise<string | null> {
  return await searchLyricsOvh(artist, title);
}

async function main() {
  if (!isGeniusAvailable()) {
    console.error("✗ GENIUS_ACCESS_TOKEN is not set in .env");
    console.error("  Register at https://genius.com/api-clients");
    console.error("  Paste the access token into .env and try again.");
    process.exit(1);
  }
  initDb();
  const db = getDb();
  const rows = all<SongRow>(
    `SELECT id, title, artist FROM songs
     WHERE NOT EXISTS (SELECT 1 FROM lyric_lines ll WHERE ll.song_id = songs.id)
     ORDER BY year, chart_rank`
  );
  console.log(`→ ${rows.length} songs still missing lyrics. Trying Genius (with LRCLib/lyrics.ovh fallback)...`);

  const insertLine = db.prepare(
    `INSERT OR REPLACE INTO lyric_lines (id, song_id, line_index, text, section)
     VALUES (?, ?, ?, ?, ?)`
  );

  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i]!;
    process.stdout.write(`[${i + 1}/${rows.length}] ${s.title} — ${s.artist}\n`);
    let plainLyrics: string | null = null;
    let src: "genius" | "lrclib" | "lyrics.ovh" | null = null;

    // Per Decision 0035, the chain order is Genius → LRCLib → lyrics.ovh.
    // (Musixmatch is the primary source but already exhausted in fetch-lyrics.ts.)
    plainLyrics = await tryGenius(s.title, s.artist);
    src = "genius";
    if (!plainLyrics) {
      // LRCLib uses cleaned artist (primary before commas)
      const cleanArtist = s.artist
        .replace(/\s+(?:feat\.?|featuring|ft\.?|&|\band\b|\bwith\b)\b.*$/i, "")
        .replace(/,.*$/, "")
        .trim();
      plainLyrics = await tryLRCLib(cleanArtist, s.title);
      src = "lrclib";
      if (!plainLyrics) {
        plainLyrics = await tryLyricsOvh(cleanArtist, s.title);
        src = "lyrics.ovh";
      }
    }

    if (!plainLyrics) {
      console.log(`  · no lyrics from any source`);
      fail++;
      await sleep(DELAY_MS);
      continue;
    }

    const lines = splitLyricsToLines(plainLyrics);
    for (let li = 0; li < lines.length; li++) {
      insertLine.run(
        `versesignal:ll:${s.id}:${li}`,
        s.id,
        li,
        lines[li]!.text,
        lines[li]!.section
      );
    }
    console.log(`  · ${src} · ${lines.length} lines`);
    ok++;
    await sleep(DELAY_MS);
  }

  console.log(`\n✓ Done. ok=${ok}  fail=${fail}`);
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
