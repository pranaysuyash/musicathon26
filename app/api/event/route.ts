// Event lens: event metadata + connected songs with full evidence.

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { all, get } from "@/lib/db/sql";
import { getEventById, getSongsForEvent } from "@/lib/db/queries";
import { parse, EventQuery } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

interface AggregateRow { theme?: string; mood?: string; avg_score: number }

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const parsed = parse(EventQuery, { id: url.searchParams.get("id") });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const event = getEventById(parsed.data.id);
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });
  const songs = getSongsForEvent(parsed.data.id, 0.1);
  const linkedSongIds = songs.map((s) => s.songId);
  let themes: { theme: string; avgScore: number }[] = [];
  let moods: { mood: string; avgScore: number }[] = [];
  if (linkedSongIds.length) {
    const placeholders = linkedSongIds.map(() => "?").join(",");
    const themeRows = all<AggregateRow>(
      `SELECT theme, AVG(score) AS avg_score FROM theme_scores WHERE song_id IN (${placeholders}) GROUP BY theme ORDER BY avg_score DESC LIMIT 6`,
      ...linkedSongIds
    );
    themes = themeRows.map((r) => ({ theme: r.theme!, avgScore: r.avg_score }));
    const moodRows = all<AggregateRow>(
      `SELECT mood, AVG(score) AS avg_score FROM mood_scores WHERE song_id IN (${placeholders}) GROUP BY mood ORDER BY avg_score DESC LIMIT 6`,
      ...linkedSongIds
    );
    moods = moodRows.map((r) => ({ mood: r.mood!, avgScore: r.avg_score }));
  }
  return NextResponse.json({
    event,
    linkedSongs: songs,
    themes,
    moods,
    generatedAt: new Date().toISOString(),
  });
}
