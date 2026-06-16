// Year profile: songs, themes, moods, entities, events, and song-event links.

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { all, get } from "@/lib/db/sql";
import { parse, YearQuery } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

interface SongLite { id: string; title: string; artist: string; chart_rank: number }
interface ThemeRow { theme: string; avg_score: number; song_ids: string | null }
interface MoodRow { mood: string; avg_score: number }
interface EntityRow { entity_id: string; canonical_name: string; entity_type: string; mention_count: number; avg_conf: number }
interface EventRow { id: string; name: string; start_date: string; end_date: string | null; category: string; description: string | null }
interface LinkRow { song_id: string; event_id: string; event_name: string; weight: number; link_type: string }

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const parsed = parse(YearQuery, {
    year: url.searchParams.get("year"),
    region: url.searchParams.get("region") ?? "US",
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { year, region } = parsed.data;

  const songs = all<SongLite>(
    `SELECT id, title, artist, chart_rank FROM songs WHERE year = ? AND region = ? ORDER BY chart_rank`,
    year,
    region
  );

  const themeRows = all<ThemeRow>(
    `SELECT ts.theme, AVG(ts.score) AS avg_score,
            GROUP_CONCAT(DISTINCT ts.song_id) AS song_ids
       FROM theme_scores ts
       JOIN songs s ON s.id = ts.song_id
      WHERE s.year = ? AND s.region = ?
      GROUP BY ts.theme
      ORDER BY avg_score DESC
      LIMIT 8`,
    year,
    region
  );
  const themes = themeRows.map((r) => ({
    theme: r.theme,
    avgScore: r.avg_score,
    evidenceSongIds: r.song_ids ? r.song_ids.split(",") : [],
  }));

  const moodRows = all<MoodRow>(
    `SELECT ms.mood, AVG(ms.score) AS avg_score
       FROM mood_scores ms
       JOIN songs s ON s.id = ms.song_id
      WHERE s.year = ? AND s.region = ?
      GROUP BY ms.mood
      ORDER BY avg_score DESC
      LIMIT 6`,
    year,
    region
  );
  const moods = moodRows.map((r) => ({ mood: r.mood, avgScore: r.avg_score }));

  const topEntities = all<EntityRow>(
    `SELECT em.entity_id, e.canonical_name, e.entity_type,
            COUNT(*) AS mention_count, AVG(em.confidence) AS avg_conf
       FROM entity_mentions em
       JOIN songs s ON s.id = em.song_id
       JOIN entities e ON e.id = em.entity_id
      WHERE s.year = ? AND s.region = ?
        AND e.entity_type IN ('person', 'place', 'city', 'country', 'artist', 'brand', 'religious_figure', 'political_figure', 'song_title', 'album_title', 'event_reference', 'technology', 'sports_reference', 'mythological_reference', 'drug_or_substance', 'vehicle', 'weapon', 'money_object')
      GROUP BY em.entity_id
      ORDER BY mention_count DESC, avg_conf DESC
      LIMIT 20`,
    year,
    region
  );

  const events = all<EventRow>(
    `SELECT id, name, start_date, end_date, category, description FROM events
      WHERE CAST(substr(start_date,1,4) AS INT) <= ?
        AND CAST(substr(COALESCE(end_date, start_date),1,4) AS INT) >= ?
      ORDER BY start_date`,
    year,
    year
  );

  const songEventLinks = all<LinkRow>(
    `SELECT ge.src_id AS song_id, ge.dst_id AS event_id, ev.name AS event_name,
            ge.weight, ge.edge_type AS link_type
       FROM graph_edges ge
       JOIN events ev ON ev.id = SUBSTR(ge.dst_id, LENGTH('versesignal:n:event:') + 1)
       JOIN songs s ON s.id = SUBSTR(ge.src_id, LENGTH('versesignal:n:song:') + 1)
      WHERE s.year = ? AND s.region = ?
        AND ge.edge_type = 'associated_with_event'
      ORDER BY ge.weight DESC`,
    year,
    region
  );

  return NextResponse.json({
    year,
    region,
    songs,
    themes,
    moods,
    topEntities,
    events,
    songEventLinks,
    generatedAt: new Date().toISOString(),
  });
}
