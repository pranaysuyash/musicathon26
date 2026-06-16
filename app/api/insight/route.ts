// Year-level insight: aggregated themes/moods/events, with optional ElevenLabs
// narration as a single TTS moment.

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { all, get } from "@/lib/db/sql";
import { getYearThemes, getYearMoods } from "@/lib/db/queries";
import { buildInsightNarration, synthesizeSpeech } from "@/lib/api/elevenlabs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

interface TopEvent { event_id: string; name: string; song_count: number }

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  const themes = getYearThemes(year, "US", 5);
  const moods = getYearMoods(year, "US", 4);
  const topEvent = all<TopEvent>(
    `SELECT ev.id AS event_id, ev.name, COUNT(*) AS song_count
       FROM graph_edges ge
       JOIN events ev ON ev.id = SUBSTR(ge.dst_id, LENGTH('versesignal:n:event:') + 1)
       JOIN songs s ON s.id = SUBSTR(ge.src_id, LENGTH('versesignal:n:song:') + 1)
      WHERE s.year = ? AND ge.edge_type = 'associated_with_event'
      GROUP BY ev.id
      ORDER BY song_count DESC
      LIMIT 1`,
    year
  )[0];

  const text = buildInsightNarration({
    query: `In ${year}, the charting songs spoke in a particular voice.`,
    topThemes: themes.map((t) => ({ theme: t.theme, avgScore: t.avgScore })),
    topMoods: moods.map((m) => ({ mood: m.mood, avgScore: m.avgScore })),
    topEvent: topEvent ? { name: topEvent.name, songCount: topEvent.song_count } : undefined,
  });

  let audioUrl: string | null = null;
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const buf = await synthesizeSpeech(text);
      const dir = join(process.cwd(), "data", "exports", "insights");
      await mkdir(dir, { recursive: true });
      const file = join(dir, `insight-${year}.mp3`);
      await writeFile(file, buf);
      audioUrl = `/api/insight/audio?year=${year}`;
    } catch (err) {
      console.warn("ElevenLabs synthesis failed:", (err as Error).message);
    }
  }

  return NextResponse.json({
    year,
    text,
    audioUrl,
    themes: themes.slice(0, 5),
    moods: moods.slice(0, 4),
    topEvent: topEvent ?? null,
    generatedAt: new Date().toISOString(),
  });
}
