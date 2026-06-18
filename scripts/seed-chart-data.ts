// Seed the songs table from data/chart-seed.ts.
// Inserts one row per (year, rank) using a stable slug ID.

import { closeDb, getDb, initDb } from "../lib/db";
import { CHART_SEED, DEMO_YEARS } from "../data/chart-seed";

function slug(title: string, artist: string): string {
  return `${title}-${artist}`
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function songId(year: number, rank: number, title: string, artist: string): string {
  return `versesignal:${year}:${String(rank).padStart(2, "0")}:${slug(title, artist)}`;
}

function artistNodeId(artist: string): string {
  return `versesignal:artist:${artist.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function yearNodeId(year: number): string {
  return `versesignal:year:${year}`;
}

function main() {
  initDb();
  const db = getDb();

  const insertSong = db.prepare(`
    INSERT OR REPLACE INTO songs
      (id, title, artist, year, chart_source, chart_rank, region, ingested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertGraphNode = db.prepare(`
    INSERT OR IGNORE INTO graph_nodes (id, node_type, label, properties_json)
    VALUES (?, ?, ?, ?)
  `);

  const insertEdge = db.prepare(`
    INSERT OR IGNORE INTO graph_edges
      (id, src_id, dst_id, edge_type, weight, confidence, source_api, model_version, explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedYear = db.transaction((year: number, entries: typeof CHART_SEED[number]) => {
    for (const e of entries) {
      const id = songId(year, e.rank, e.title, e.artist);
      // Split multi-artist names properly so all collaborators are preserved.
      // Handles: "X, Y and Z" → ["X", "Y", "Z"], "X featuring Y" → ["X", "Y"]
      const parts = e.artist.split(/\s+(?:feat\.?|featuring|ft\.?|&|and|with)\s+/i).flatMap((p) => p.split(/,\s*/).map((s) => s.trim()).filter(Boolean));
      // Deduplicate case-insensitively, preserving first-encountered casing
      const seenArtists = new Set<string>();
      const allArtists: string[] = [];
      for (const a of parts) {
        const key = a.toLowerCase();
        if (!seenArtists.has(key)) { seenArtists.add(key); allArtists.push(a); }
      }
      const primaryArtist = allArtists[0]!;
      const artistStr = allArtists.join(", ");
      insertSong.run(id, e.title, artistStr, year, "billboard_hot100_ye", e.rank, "US");

      const songNode = `versesignal:n:song:${id}`;
      const yearNode = yearNodeId(year);
      insertGraphNode.run(songNode, "song", `${e.title} — ${primaryArtist} (${year})`, null);
      insertGraphNode.run(yearNode, "year", String(year), null);

      const allArtistNames = [...new Set([primaryArtist, ...allArtists])];
      const artistCount = allArtistNames.length;
      for (const artistName of allArtistNames) {
        const aNode = artistNodeId(artistName);
        insertGraphNode.run(aNode, "artist", artistName, null);
        insertEdge.run(
          `versesignal:e:${id}:${artistNodeId(artistName).replace("versesignal:artist:", "")}`,
          songNode,
          aNode,
          "performed_by",
          1.0 / artistCount,
          1.0,
          "manual",
          null,
          "Artist credit from chart entry."
        );
      }
      insertEdge.run(
        `versesignal:e:${id}:charted_in`,
        songNode,
        yearNode,
        "charted_in",
        1.0,
        1.0,
        "billboard",
        null,
        `Year-end rank #${e.rank} on Billboard Hot 100.`
      );
    }
  });

  let totalSongs = 0;
  for (const year of DEMO_YEARS) {
    const entries = CHART_SEED[year];
    if (!entries) continue;
    seedYear(year, entries);
    totalSongs += entries.length;
  }

  console.log(`✓ Seeded ${totalSongs} songs across ${DEMO_YEARS.length} years (${DEMO_YEARS.join(", ")}).`);
  closeDb();
}

main();
