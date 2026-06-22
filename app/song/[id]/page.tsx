import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSongById, getSimilarSongs, getArtistMeta, getEvidenceForEdges } from "@/lib/db/queries";
import { resolveSongId } from "@/lib/song-redirects";
import { initDb } from "@/lib/db";
import { all, run } from "@/lib/db/sql";
import { Pill, SectionTitle } from "@/components/ui/primitives";
import { THEME_LABELS, THEME_COLORS } from "@/lib/nlp/theme-scoring";
import type { Theme } from "@/lib/types";
import { fetchLyricsWithFallback, splitLyricsToLines } from "@/lib/lyrics/fallback";
import { SongHero } from "@/components/song/song-hero";
import { SignalDashboard } from "@/components/song/signal-dashboard";
import { CandidateEventRail } from "@/components/song/candidate-event-rail";
import { GraphEntry } from "@/components/song/graph-entry";
import { LyricSignalPanel } from "@/components/song/lyric-signal-panel";
import { SemanticNeighbors } from "@/components/song/semantic-neighbors";
import {
  normalizeEvidence,
  deriveUiEvidenceType,
  deriveUiConfidence,
  buildCaveat,
} from "@/lib/evidence/classifyEvidence";
import type { SongEventConnection } from "@/lib/evidence/types";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const song = getSongById(decodeRouteParam(resolveSongId(params.id)));
  if (!song) return { title: "Song not found" };
  return {
    title: `${song.title} — ${song.artist} (${song.year})`,
    description: `Lyrics, themes, entities, and event connections for "${song.title}" by ${song.artist} (${song.year}, Billboard Hot 100 year-end #${song.chartRank}).`,
    openGraph: {
      images: [
        {
          url: `/api/og?type=song&title=${encodeURIComponent(`${song.title} — ${song.artist}`)}&subtitle=${encodeURIComponent(`A cultural lens for ${song.year}`)}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export const dynamic = "force-dynamic";

function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface LyricRow { line_index: number; text: string; section: string | null; has_named_entity: number }
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
  inference_type: string | null;
}

async function hydrateMissingLyrics(songId: string, title: string, artist: string): Promise<LyricRow[]> {
  const fetched = await fetchLyricsWithFallback(title, artist);
  if (!fetched) return [];
  const lines = splitLyricsToLines(fetched.plainLyrics);
  if (lines.length === 0) return [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line) continue;
    run(
      `INSERT OR REPLACE INTO lyric_lines (id, song_id, line_index, text, section)
       VALUES (?, ?, ?, ?, ?)`,
      `versesignal:ll:${songId}:${lineIndex}`,
      songId,
      lineIndex,
      line.text,
      line.section
    );
  }

  if (fetched.source === "musixmatch" && fetched.musixmatchTrackId) {
    run(`UPDATE songs SET musixmatch_track_id = ? WHERE id = ?`, fetched.musixmatchTrackId, songId);
  }

  return lines.map((line, lineIndex) => ({
    line_index: lineIndex,
    text: line.text,
    section: line.section,
    has_named_entity: 0,
  }));
}

function annotateWithEntities(
  text: string,
  entities: EntityRow[]
): { text: string; entity: EntityRow | null }[] {
  if (entities.length === 0) return [{ text, entity: null }];

  const matches: { start: number; end: number; entity: EntityRow }[] = [];
  for (const ent of entities) {
    if (!ent.surface_form) continue;
    const sf = ent.surface_form.trim();
    if (!sf) continue;
    const idx = text.toLowerCase().indexOf(sf.toLowerCase());
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + sf.length, entity: ent });
  }
  if (matches.length === 0) return [{ text, entity: null }];

  matches.sort((a, b) => a.start - b.start);
  const nonOverlap: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlap.push(m);
      lastEnd = m.end;
    } else if (m.end - m.start > lastEnd - nonOverlap[nonOverlap.length - 1]!.start) {
      nonOverlap[nonOverlap.length - 1] = m;
      lastEnd = m.end;
    }
  }

  const segments: { text: string; entity: EntityRow | null }[] = [];
  let cursor = 0;
  for (const m of nonOverlap) {
    if (m.start > cursor) {
      segments.push({ text: text.slice(cursor, m.start), entity: null });
    }
    segments.push({ text: text.slice(m.start, m.end), entity: m.entity });
    cursor = m.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), entity: null });
  }
  return segments;
}

export default async function SongPage({ params }: { params: { id: string } }) {
  const cspNonce = headers().get("X-CSP-Nonce") ?? undefined;
  initDb();
  const requestedId = decodeRouteParam(params.id);
  const canonicalId = resolveSongId(requestedId);
  if (canonicalId !== requestedId) {
    redirect(`/song/${encodeURIComponent(canonicalId)}`);
  }
  const song = getSongById(canonicalId);
  if (!song) notFound();

  const themes = all<ThemeRow>(
    `SELECT theme, score, confidence, evidence_terms_json AS evidence_terms, source FROM theme_scores WHERE song_id = ? ORDER BY score DESC`,
    song.id
  );

  const moods = all<MoodRow>(
    `SELECT mood, score, source FROM mood_scores WHERE song_id = ? ORDER BY score DESC`,
    song.id
  );

  const entities = all<EntityRow>(
    `SELECT em.entity_id, e.canonical_name, e.entity_type, em.surface_form, em.confidence, em.source, ll.line_index
       FROM entity_mentions em
       LEFT JOIN lyric_lines ll ON ll.id = em.lyric_line_id
       JOIN entities e ON e.id = em.entity_id
      WHERE em.song_id = ?
      ORDER BY em.confidence DESC, ll.line_index`,
    song.id
  );

  const lyrics = all<LyricRow>(
    `SELECT line_index, text, section, has_named_entity FROM lyric_lines WHERE song_id = ? ORDER BY line_index`,
    song.id
  );
  const hydratedLyrics =
    lyrics.length === 0 ? await hydrateMissingLyrics(song.id, song.title, song.artist) : [];
  const lines = lyrics.length === 0 ? hydratedLyrics : lyrics;

  const similarSongs = getSimilarSongs(song.id, 6);

  const entitiesByLine = new Map<number, EntityRow[]>();
  for (const entity of entities) {
    if (entity.line_index === null) continue;
    const list = entitiesByLine.get(entity.line_index) ?? [];
    list.push(entity);
    entitiesByLine.set(entity.line_index, list);
  }

  const primaryArtist = song.artist
    .split(/\s+(?:featuring|feat\.?|fe\.?|ft\.?|with)\s+/i)[0]
    .split(/,\s*&\s*|\s+&\s+/)[0]
    .trim();
  const artistMeta = getArtistMeta(primaryArtist);

  const eventLinks = all<EventLinkRow>(
    `SELECT SUBSTR(ge.dst_id, 21) AS event_id, ev.name AS event_name,
            ge.weight, ge.explanation, ge.confidence, ge.id AS edge_id,
            ge.inference_type,
            (SELECT COUNT(*) FROM evidence ee WHERE ee.edge_id = ge.id) AS evidence_count
       FROM graph_edges ge JOIN events ev ON ev.id = SUBSTR(ge.dst_id, 21)
     WHERE ge.src_id = ? AND ge.edge_type = 'associated_with_event'
      ORDER BY ge.weight DESC`,
    `versesignal:n:song:${song.id}`
  );

  const eventEvidenceByEdge = getEvidenceForEdges(eventLinks.map((e) => e.edge_id));

  const eventConnections: SongEventConnection[] = eventLinks.map((link) => {
    const evidence = (eventEvidenceByEdge[link.edge_id] ?? []).map((ev) =>
      normalizeEvidence({
        id: ev.id,
        edgeId: ev.edgeId,
        evidenceType: ev.evidenceType,
        value: ev.value,
        source: ev.source,
        confidence: ev.confidence,
        matchedTerms: link.inference_type ? [] : undefined,
      })
    );
    const matchedTerms = evidence.flatMap((e) => e.matchedTerms ?? []);
    const uiEvidenceType = deriveUiEvidenceType(
      {
        inferenceType: link.inference_type as any,
        edgeType: "associated_with_event",
        matchedTerms,
      },
      evidence
    );
    const uiConfidence = deriveUiConfidence(uiEvidenceType, link.confidence, evidence);
    const caveat = buildCaveat(uiEvidenceType, uiConfidence, matchedTerms);

    return {
      songId: song.id,
      songTitle: song.title,
      songArtist: song.artist,
      songYear: song.year,
      eventId: link.event_id,
      eventName: link.event_name,
      edgeId: link.edge_id,
      edgeWeight: link.weight,
      edgeConfidence: link.confidence,
      inferenceType: link.inference_type as any,
      uiEvidenceType,
      uiConfidence,
      explanation: link.explanation ?? "Graph-derived song-event relationship.",
      caveat,
      evidence,
      matchedTerms,
    };
  });

  const annotateWithEntitiesForPanel = (
    text: string,
    entities: { canonical_name: string; entity_type: string; surface_form: string | null; line_index: number | null }[]
  ) => annotateWithEntities(text, entities as EntityRow[]);

  const topTheme = themes[0] ?? null;
  const topMood = moods[0] ?? null;
  const entityCount = entities.length;
  const highlightCount = lines.reduce((count, line) => count + (line.has_named_entity ? 1 : 0), 0);

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex items-center gap-2">
        <Link href={`/year/${song.year}`} className="text-xs uppercase tracking-[0.26em] text-ink-400 hover:text-ink-200">
          ← {song.year}
        </Link>
      </div>

      <SongHero
        title={song.title}
        artist={song.artist}
        year={song.year}
        chartRank={song.chartRank}
        topMood={topMood ? topMood.mood : undefined}
        topTheme={topTheme ? (THEME_LABELS[topTheme.theme as Theme] ?? topTheme.theme) : undefined}
      />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <CandidateEventRail connections={eventConnections} songTitle={song.title} />
        <div className="space-y-4">
          <SignalDashboard
            entityCount={entityCount}
            highlightCount={highlightCount}
            eventCount={eventConnections.length}
            similarCount={similarSongs.length}
            lyricLineCount={lines.length}
            topTheme={topTheme ? (THEME_LABELS[topTheme.theme as Theme] ?? topTheme.theme) : undefined}
            topMood={topMood ? topMood.mood : undefined}
          />
          <GraphEntry songId={song.id} entityCount={entityCount} eventCount={eventConnections.length} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <LyricSignalPanel lines={lines} entitiesByLine={entitiesByLine} annotateWithEntities={annotateWithEntitiesForPanel} />
        <div className="space-y-4">
          <SemanticNeighbors similarSongs={similarSongs} />

          <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <SectionTitle>Themes / moods / entities</SectionTitle>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {themes.slice(0, 4).map((t) => (
                <Link
                  key={t.theme}
                  href={`/theme/${t.theme}`}
                  className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4 transition hover:border-signal-400/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink-100">{THEME_LABELS[t.theme as Theme] ?? t.theme}</span>
                    <span className="text-xs text-ink-400">{(t.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-ink-900">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(t.score * 100)}%`,
                        background: THEME_COLORS[t.theme as Theme] ?? "#7dd3fc",
                      }}
                    />
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {moods.slice(0, 4).map((m) => (
                <div key={m.mood} className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="capitalize text-ink-100">{m.mood}</span>
                    <span className="text-xs text-ink-400">{m.score.toFixed(2)}</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-ink-900">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(m.score * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">entities mentioned</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {entities.slice(0, 18).map((e) => (
                  <Link
                    key={e.entity_id}
                    href={`/entity/${encodeURIComponent(e.entity_id)}`}
                    className="rounded-full border border-ink-700 bg-ink-950/60 px-3 py-1 text-xs text-ink-300 hover:border-signal-400/40 hover:text-signal-100"
                  >
                    {e.canonical_name}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <SectionTitle>Artist context</SectionTitle>
            <Link href={`/artist/${encodeURIComponent(primaryArtist)}`} className="mt-3 inline-flex text-sm font-medium text-signal-200 hover:text-signal-100">
              Open artist profile →
            </Link>
            {artistMeta ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {artistMeta.jambase_genres.map((g) => (
                  <Pill key={g} variant="mute">{g}</Pill>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-500">No external metadata for {primaryArtist} yet.</p>
            )}
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        nonce={cspNonce}
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MusicRecording",
            name: song.title,
            byArtist: { "@type": "Person", name: song.artist },
            datePublished: String(song.year),
            inPlaylist: {
              "@type": "MusicAlbum",
              name: `Billboard Hot 100 year-end ${song.year}`,
            },
            position: song.chartRank,
            url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/song/${encodeURIComponent(song.id)}`,
          }),
        }}
      />
    </main>
  );
}
