// Song detail: metadata, themes, moods, entities mentioned, event links.

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { all, get } from "@/lib/db/sql";
import { getSongById } from "@/lib/db/queries";
import { parse, SongQuery } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

interface ThemeRow { theme: string; score: number; confidence: number; evidence_terms: string | null; source: string }
interface MoodRow { mood: string; score: number; source: string }
interface EntityRow { entity_id: string; canonical_name: string; entity_type: string; surface_form: string | null; confidence: number; source: string; line_index: number | null }
interface EventLinkRow {
  event_id: string;
  event_name: string;
  weight: number;
  explanation: string | null;
  confidence: number;
  edge_id: string;
  evidence_count: number;
  evidence_sources: string | null;
}
interface CountRow { c: number }

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const parsed = parse(SongQuery, { id: url.searchParams.get("id") });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const song = getSongById(parsed.data.id);
  if (!song) return NextResponse.json({ error: "song not found" }, { status: 404 });

  const themeRows = all<ThemeRow>(
    `SELECT theme, score, confidence, evidence_terms_json AS evidence_terms, source
       FROM theme_scores WHERE song_id = ? ORDER BY score DESC`,
    song.id
  );
  const themes = themeRows.map((r) => ({
    theme: r.theme,
    score: r.score,
    confidence: r.confidence,
    evidenceTerms: r.evidence_terms ? JSON.parse(r.evidence_terms) : [],
    source: r.source,
  }));

  const moods = all<MoodRow>(
    `SELECT mood, score, source FROM mood_scores WHERE song_id = ? ORDER BY score DESC`,
    song.id
  );

  const entities = all<EntityRow>(
    `SELECT em.entity_id, e.canonical_name, e.entity_type,
            em.surface_form, em.confidence, em.source, ll.line_index
       FROM entity_mentions em
       LEFT JOIN lyric_lines ll ON ll.id = em.lyric_line_id
       JOIN entities e ON e.id = em.entity_id
      WHERE em.song_id = ?
      ORDER BY em.confidence DESC`,
    song.id
  );

  const eventLinks = all<EventLinkRow>(
    `SELECT SUBSTR(ge.dst_id, LENGTH('versesignal:n:event:') + 1) AS event_id,
            ev.name AS event_name,
            ge.weight, ge.explanation, ge.confidence, ge.id AS edge_id,
            (SELECT COUNT(*) FROM evidence ee WHERE ee.edge_id = ge.id) AS evidence_count,
            (SELECT GROUP_CONCAT(DISTINCT ee.source) FROM evidence ee WHERE ee.edge_id = ge.id) AS evidence_sources
       FROM graph_edges ge
       JOIN events ev ON ev.id = SUBSTR(ge.dst_id, LENGTH('versesignal:n:event:') + 1)
      WHERE ge.src_id = ? AND ge.edge_type = 'associated_with_event'
      ORDER BY ge.weight DESC`,
    `versesignal:n:song:${song.id}`
  );

  const lyricLineCount = get<CountRow>(`SELECT COUNT(*) AS c FROM lyric_lines WHERE song_id = ?`, song.id)?.c ?? 0;

  return NextResponse.json({
    song,
    themes,
    moods,
    entities,
    eventLinks,
    lyricLineCount,
    generatedAt: new Date().toISOString(),
  });
}
