// Fetch lyrics from a song id (with line indices for citation).

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { all } from "@/lib/db/sql";

export const dynamic = "force-dynamic";

interface LyricRow { line_index: number; text: string; section: string | null }

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const songId = url.searchParams.get("songId");
  if (!songId) return NextResponse.json({ error: "songId required" }, { status: 400 });
  const rows = all<LyricRow>(
    `SELECT line_index, text, section FROM lyric_lines WHERE song_id = ? ORDER BY line_index`,
    songId
  );
  return NextResponse.json({ songId, lines: rows });
}
