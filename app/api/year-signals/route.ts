// Year signals API.
//
// Per 1st principles + decision 0019 P1.1, this endpoint
// returns the top signals for a year + region. The signals
// are the lyrics-first discovery layer; the Cultural Lens
// page consumes them.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const Query = z.object({
  year: z.coerce.number().int().min(1960).max(2100),
  region: z.string().min(1).max(8).default("US"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = Query.safeParse({
    year: sp.get("year") ?? undefined,
    region: sp.get("region") ?? undefined,
    limit: sp.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_input", reason: parsed.error.issues },
      { status: 400 }
    );
  }
  const { year, region, limit } = parsed.data;
  const db = getDb();
  const rows = db.prepare(
    `SELECT signal_type, signal, score, song_count,
            delta_vs_prev_year, delta_vs_baseline,
            evidence_song_ids_json, source_api
       FROM year_signal_profiles
      WHERE year = ? AND region = ?
      ORDER BY score DESC
      LIMIT ?`
  ).all(year, region, limit) as Array<{
    signal_type: string;
    signal: string;
    score: number;
    song_count: number;
    delta_vs_prev_year: number | null;
    delta_vs_baseline: number | null;
    evidence_song_ids_json: string;
    source_api: string;
  }>;
  // Group by type for the UI
  const byType: Record<string, typeof rows> = {};
  for (const r of rows) {
    (byType[r.signal_type] ??= []).push(r);
  }
  return NextResponse.json({
    year,
    region,
    signals: rows.map((r) => ({
      signalType: r.signal_type,
      signal: r.signal,
      score: r.score,
      songCount: r.song_count,
      deltaVsPrevYear: r.delta_vs_prev_year,
      deltaVsBaseline: r.delta_vs_baseline,
      evidenceSongIds: r.evidence_song_ids_json ? JSON.parse(r.evidence_song_ids_json) : [],
      sourceApi: r.source_api,
    })),
    byType,
  });
}
