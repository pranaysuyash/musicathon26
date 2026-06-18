// Year-level insight: aggregated themes/moods/events, with optional ElevenLabs
// narration as a single TTS moment.

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { getYearThemes, getYearMoods, REGION_LABELS } from "@/lib/db/queries";
import { all } from "@/lib/db/sql";
import { buildInsightNarration, synthesizeSpeech } from "@/lib/api/elevenlabs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

interface TopEvent { event_id: string; name: string; song_count: number }

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const requestedRegion = url.searchParams.get("region") ?? "US";
  const region = Object.prototype.hasOwnProperty.call(REGION_LABELS, requestedRegion)
    ? requestedRegion
    : "US";
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  const themes = getYearThemes(year, region, 5);
  const moods = getYearMoods(year, region, 4);
  const topEvent = all<TopEvent>(
    `SELECT ev.id AS event_id, ev.name, COUNT(*) AS song_count
       FROM graph_edges ge
       JOIN events ev ON ev.id = SUBSTR(ge.dst_id, LENGTH('versesignal:n:event:') + 1)
       JOIN songs s ON s.id = SUBSTR(ge.src_id, LENGTH('versesignal:n:song:') + 1)
      WHERE s.year = ? AND s.region = ? AND ge.edge_type = 'associated_with_event'
      GROUP BY ev.id
      ORDER BY song_count DESC
      LIMIT 1`,
    year,
    region
  )[0];

  const text = buildInsightNarration({
    query: `In ${year}, in ${REGION_LABELS[region] ?? region}, the charting songs spoke in a particular voice.`,
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
      const file = join(dir, `insight-${year}-${region}.mp3`);
      await writeFile(file, buf);
      audioUrl = `/api/insight/audio?year=${year}&region=${encodeURIComponent(region)}`;
    } catch (err) {
      console.warn("ElevenLabs synthesis failed:", (err as Error).message);
    }
  }

  return NextResponse.json({
    year,
    text,
    region,
    audioUrl,
    themes: themes.slice(0, 5),
    moods: moods.slice(0, 4),
    topEvent: topEvent ?? null,
    generatedAt: new Date().toISOString(),
  });
}
