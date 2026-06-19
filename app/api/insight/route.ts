import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { getYearThemes, getYearMoods, REGION_LABELS } from "@/lib/db/queries";
import { all } from "@/lib/db/sql";
import { buildInsightNarration, synthesizeSpeech } from "@/lib/api/elevenlabs";
import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const dynamic = "force-dynamic";

interface TopEvent { event_id: string; name: string; song_count: number }
interface InsightCacheManifest {
  textSignature: string;
  textHash: string;
  generatedAt: string;
}

const INSIGHT_CACHE_DIR = join(process.cwd(), "data", "exports", "insights");

function buildInsightSignature(args: {
  year: number;
  region: string;
  topThemes: { theme: string; avgScore: number }[];
  topMoods: { mood: string; avgScore: number }[];
  topEvent?: { name: string; songCount: number };
}): string {
  const payload = {
    year: args.year,
    region: args.region,
    themes: args.topThemes.slice(0, 3).map((theme) => theme.theme.replace(/_/g, " ").trim().toLowerCase()),
    moods: args.topMoods.slice(0, 2).map((mood) => mood.mood.trim().toLowerCase()),
    event: args.topEvent ? `${args.topEvent.name}|${args.topEvent.songCount}` : "",
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildInsightTextHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function buildCacheManifestPath(year: number, region: string) {
  const base = `insight-${year}-${region}`;
  return {
    audioPath: join(INSIGHT_CACHE_DIR, `${base}.mp3`),
    metaPath: join(INSIGHT_CACHE_DIR, `${base}.json`),
  };
}

async function readManifest(path: string): Promise<InsightCacheManifest | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as InsightCacheManifest;
    if (
      typeof parsed.textSignature !== "string" ||
      typeof parsed.textHash !== "string" ||
      typeof parsed.generatedAt !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function hasCachedAudio(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const requestedRegion = url.searchParams.get("region") ?? "US";
  const region = Object.prototype.hasOwnProperty.call(REGION_LABELS, requestedRegion)
    ? requestedRegion
    : "US";
  if (!Number.isFinite(year)) return NextResponse.json({ error: "year required" }, { status: 400 });
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
    region,
  )[0];

  const text = buildInsightNarration({
    query: `In ${year}, in ${REGION_LABELS[region] ?? region}, the charting songs spoke in a particular voice.`,
    topThemes: themes.map((t) => ({ theme: t.theme, avgScore: t.avgScore })),
    topMoods: moods.map((m) => ({ mood: m.mood, avgScore: m.avgScore })),
    topEvent: topEvent ? { name: topEvent.name, songCount: topEvent.song_count } : undefined,
  });

  const textSignature = buildInsightSignature({
    year,
    region,
    topThemes: themes.map((t) => ({ theme: t.theme, avgScore: t.avgScore })),
    topMoods: moods.map((m) => ({ mood: m.mood, avgScore: m.avgScore })),
    topEvent: topEvent ? { name: topEvent.name, songCount: topEvent.song_count } : undefined,
  });

  const { audioPath, metaPath } = buildCacheManifestPath(year, region);
  const cachedManifest = await readManifest(metaPath);
  const currentAudioExists = await hasCachedAudio(audioPath);
  const shouldGenerate = !currentAudioExists || !cachedManifest || cachedManifest.textSignature !== textSignature;

  if (shouldGenerate && process.env.ELEVENLABS_API_KEY) {
    try {
      const buf = await synthesizeSpeech(text);
      await mkdir(INSIGHT_CACHE_DIR, { recursive: true });
      await writeFile(audioPath, buf);
      await writeFile(
        metaPath,
        JSON.stringify(
          {
            textSignature,
            textHash: buildInsightTextHash(text),
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } catch (err) {
      console.warn("ElevenLabs synthesis failed:", (err as Error).message);
    }
  }

  let audioUrl: string | null = null;
  if (await hasCachedAudio(audioPath)) {
    audioUrl = `/api/insight/audio?year=${year}&region=${encodeURIComponent(region)}`;
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
