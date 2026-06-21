import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSongById, getSimilarSongs, getArtistMeta, getEvidenceForEdges, getEventArticlesBatch } from "@/lib/db/queries";
import { resolveSongId } from "@/lib/song-redirects";

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
import { initDb } from "@/lib/db";
import { all, run } from "@/lib/db/sql";
import { Pill, SectionTitle, ConfidenceBar } from "@/components/ui/primitives";
import { BecauseCard } from "@/components/evidence/because-card";
import { THEME_LABELS, THEME_COLORS } from "@/lib/nlp/theme-scoring";
import type { Theme } from "@/lib/types";
import type { EvidencePreviewItem } from "@/components/evidence/evidence-preview";
import { fetchLyricsWithFallback, splitLyricsToLines } from "@/lib/lyrics/fallback";

export const dynamic = "force-dynamic";

function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Break a line of lyrics into segments, marking where each entity's
 * surface form appears so the UI can highlight it. The match is
 * case-insensitive and finds the first occurrence of each surface form
 * (entities can have multiple surface forms across the lyric line;
 * here we use the one we have for that line_index). */
function annotateWithEntities(
  text: string,
  entities: EntityRow[]
): { text: string; entity: EntityRow | null }[] {
  if (entities.length === 0) return [{ text, entity: null }];

  // Build list of match positions across the line.
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

  // Sort by start position; for overlaps, keep the longer match.
  matches.sort((a, b) => a.start - b.start);
  const nonOverlap: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlap.push(m);
      lastEnd = m.end;
    } else if (m.end - m.start > lastEnd - nonOverlap[nonOverlap.length - 1]!.start) {
      // Replace the previous match with this longer one.
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

interface PageProps {
  params: { id: string };
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
  evidence_sources: string | null;
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

export default async function SongPage({ params }: PageProps) {
  const cspNonce = headers().get("X-CSP-Nonce") ?? undefined;
  initDb();
  // Resolve legacy song IDs (e.g., the pre-canonical-migration "gods-plan-drake"
  // slug form) before looking the song up. "replace" in the redirect type
  // produces a 308 = permanent, so SEO weight is preserved and crawlers see
  // the URL change.
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

  // Look up artist metadata. The songs.artist field may have
  // "X, Y featuring Z"; for the metadata lookup we use the
  // primary artist (everything before the first "featuring/&/").
  const primaryArtist = song.artist
    .split(/\s+(?:featuring|feat\.?|fe\.?|ft\.?|with)\s+/i)[0]
    .split(/,\s*&\s*|\s+&\s+/)[0]
    .trim();
  const artistMeta = getArtistMeta(primaryArtist);

  const eventLinks = all<EventLinkRow>(
    // P0 fix: the enrichment pipeline writes graph edge
    // destinations as `versesignal:n:event:<event-id>`
    // (canonical graph node form), while `events.id` is
    // the bare `<event-id>` (e.g., `versesignal:ev:covid_19`).
    // We strip the `versesignal:n:event:` prefix (20 chars)
    // to match. The `/event/[id]` page already does this
    // correctly; the song page was inconsistent.
    `SELECT SUBSTR(ge.dst_id, 21) AS event_id, ev.name AS event_name,
            ge.weight, ge.explanation, ge.confidence, ge.id AS edge_id,
            (SELECT COUNT(*) FROM evidence ee WHERE ee.edge_id = ge.id) AS evidence_count,
            (SELECT GROUP_CONCAT(DISTINCT ee.source) FROM evidence ee WHERE ee.edge_id = ge.id) AS evidence_sources
       FROM graph_edges ge JOIN events ev ON ev.id = SUBSTR(ge.dst_id, 21)
     WHERE ge.src_id = ? AND ge.edge_type = 'associated_with_event'
      ORDER BY ge.weight DESC`,
    `versesignal:n:song:${song.id}`
  );
  const eventEvidenceByEdge = getEvidenceForEdges(eventLinks.map((e) => e.edge_id));
  const eventEvidenceSources = new Set<string>(["billboard"]);

  for (const edgeEvidence of Object.values(eventEvidenceByEdge)) {
    for (const e of edgeEvidence) eventEvidenceSources.add(e.source);
  }

  // Per motto 0.1, the song page should answer "what was the world
  // doing when this song was #1?" — not just "what themes are in
  // it." This pulls events whose date range overlaps the song's
  // year, excluding ones already linked (which have their own
  // section below) so the user sees a fresh cultural context.
  const worldContext = all<{
    id: string;
    name: string;
    start_date: string;
    end_date: string | null;
    category: string;
  }>(
    `SELECT id, name, start_date, end_date, category
       FROM events
      WHERE substr(start_date, 1, 4) <= ?
        AND (end_date IS NULL OR substr(end_date, 1, 4) >= ?)
        AND id NOT IN (${eventLinks.length > 0
          ? eventLinks.map(() => "?").join(",")
          : "''"})
      ORDER BY start_date ASC`,
    String(song.year),
    String(song.year),
    ...eventLinks.map((e) => e.event_id)
  );
  // Background articles for each world-context event. One article
  // per event is enough on a song page — the user wants the "what
  // was happening" headline, not a reading list.
  const articlesByEvent = getEventArticlesBatch(worldContext.map((e) => e.id));
  const totalArticleCount = Object.values(articlesByEvent).reduce((sum, articles) => sum + articles.length, 0);
  const topEventLink = eventLinks[0] ?? null;
  const topTheme = themes[0] ?? null;
  const topMood = moods[0] ?? null;
  const lyricVisible = lines.slice(0, 18);
  const entityCount = entities.length;
  const highlightCount = lyricVisible.reduce((count, line) => count + (line.has_named_entity ? 1 : 0), 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <Link href={`/year/${song.year}`} className="text-xs uppercase tracking-[0.26em] text-ink-400 hover:text-ink-200">
        ← {song.year}
      </Link>

      <section className="relative isolate mt-4 overflow-hidden rounded-[2.5rem] border border-ink-800 bg-[linear-gradient(145deg,rgba(9,11,18,0.98),rgba(7,8,14,0.92))] px-5 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_42px_120px_-60px_rgba(14,165,233,0.45)] sm:px-6 lg:px-8 lg:py-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-6rem] top-0 h-72 w-72 rounded-full bg-signal-500/12 blur-3xl" />
          <div className="absolute right-[-6rem] top-20 h-80 w-80 rounded-full bg-echo-500/12 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
        </div>
        <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Pill variant="signal">Song Lens</Pill>
              <Pill variant="mute">{song.year}</Pill>
              <Pill variant="mute"># {song.chartRank} year-end</Pill>
              <Pill variant="warn">{lines.length} lyric lines</Pill>
            </div>
            <h1 className="h-display mt-5 text-4xl leading-[0.95] text-balance text-ink-50 md:text-5xl lg:text-6xl">
              {song.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-pretty text-ink-300 md:text-base">
              {song.artist}. Start from the lyric surface, then follow the theme, mood, entity, and event signals
              outward instead of reading the page top-to-bottom like a report.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={`/graph?rootType=song&rootId=versesignal:n:song:${song.id}`} className="rounded-full border border-signal-400/40 bg-signal-500/10 px-4 py-2 text-xs font-medium text-signal-100 transition hover:border-signal-300/80">
                Open in graph
              </Link>
              <Link href={`/year/${song.year}`} className="rounded-full border border-ink-700 bg-ink-950/60 px-4 py-2 text-xs font-medium text-ink-300 transition hover:border-signal-400/40 hover:text-signal-100">
                Explore the year
              </Link>
              {topEventLink ? (
                <Link href={`/event/${encodeURIComponent(topEventLink.event_id)}`} className="rounded-full border border-ink-700 bg-ink-950/60 px-4 py-2 text-xs font-medium text-ink-300 transition hover:border-signal-400/40 hover:text-signal-100">
                  Best event match
                </Link>
              ) : null}
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "entities", value: String(entityCount), tone: "signal" },
                { label: "highlights", value: String(highlightCount), tone: "echo" },
                { label: "events", value: String(eventLinks.length), tone: "mute" },
                { label: "similar", value: String(similarSongs.length), tone: "warn" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-[1.4rem] border border-ink-800 bg-ink-950/55 p-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{stat.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-50">{stat.value}</p>
                  <div className="mt-3 h-1 rounded-full bg-ink-900">
                    <div
                      className={`h-full rounded-full ${stat.tone === "signal" ? "bg-signal-400" : stat.tone === "echo" ? "bg-echo-400" : stat.tone === "warn" ? "bg-amber-400" : "bg-ink-400"}`}
                      style={{ width: `${Math.max(20, Number(stat.value) ? Math.min(100, Number(stat.value) * 18) : 20)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-[2rem] border border-ink-800 bg-ink-950/65 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.26em] text-ink-500">signal console</p>
                <Pill variant={topEventLink ? "signal" : "warn"}>{topEventLink ? "linked" : "searching"}</Pill>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-ink-800 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),rgba(9,11,18,0.45))] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-signal-300">top theme</p>
                  <p className="mt-2 text-2xl font-semibold text-ink-50">{topTheme ? (THEME_LABELS[topTheme.theme as Theme] ?? topTheme.theme) : "none"}</p>
                  <p className="mt-1 text-xs text-ink-400">{topTheme ? `${(topTheme.score * 100).toFixed(0)}% · ${topTheme.source}` : "No theme score yet."}</p>
                </div>
                <div className="rounded-2xl border border-ink-800 bg-[linear-gradient(180deg,rgba(52,211,153,0.08),rgba(9,11,18,0.45))] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">top mood</p>
                  <p className="mt-2 text-2xl font-semibold text-ink-50">{topMood ? topMood.mood : "none"}</p>
                  <p className="mt-1 text-xs text-ink-400">{topMood ? `${topMood.score.toFixed(2)} · ${topMood.source}` : "No mood signal yet."}</p>
                </div>
              </div>
              <div className="mt-4 rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
                <div className="flex items-center justify-between gap-3 text-xs text-ink-400">
                  <span>lyric scan</span>
                  <span>{lyricVisible.length} shown / {lines.length} total</span>
                </div>
                <div className="mt-3 grid grid-cols-12 gap-1">
                  {lyricVisible.map((line) => (
                    <span
                      key={line.line_index}
                      className={`h-8 rounded-md ${line.has_named_entity ? "bg-signal-400/70" : "bg-ink-700/70"}`}
                      title={line.text}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-[2rem] border border-ink-800 bg-ink-950/55 p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">graph readiness</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="relative h-28 w-28 shrink-0">
                  <div className="absolute inset-0 rounded-full border border-signal-500/25 bg-signal-500/5" />
                  <div className="absolute inset-4 rounded-full border border-echo-500/30 bg-echo-500/5" />
                  <div className="absolute inset-8 rounded-full border border-ink-700" />
                  <div className="absolute inset-[42%] rounded-full bg-signal-300 shadow-[0_0_35px_rgba(56,189,248,0.55)]" />
                </div>
                <div className="min-w-0 flex-1 space-y-2 text-sm text-ink-300">
                  <p className="truncate">Event trail, semantic neighbors, and entity matches all fan out from the song node.</p>
                  <p className="text-xs text-ink-500">{entityCount} entities, {eventLinks.length} event hops, {totalArticleCount} contextual articles.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {worldContext.length > 0 ? (
        <section aria-label="World context" className="mt-8 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <SectionTitle subtitle="The year around the song, compressed into event-sized fragments.">World lens</SectionTitle>
            <div className="mt-4 space-y-3">
              {worldContext.slice(0, 4).map((ev, index) => {
                const articles = articlesByEvent[ev.id] ?? [];
                const topArticle = articles[0];
                return (
                  <div key={ev.id} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-signal-400/30 bg-signal-500/10 text-xs text-signal-200">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/event/${encodeURIComponent(ev.id)}`} className="truncate font-medium text-ink-100 hover:text-signal-300">
                            {ev.name}
                          </Link>
                          <Pill variant="mute">{ev.category}</Pill>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-ink-400">
                          Temporal context only. This is what the world was processing in the same year, not a claim that the lyric names it.
                        </p>
                        {topArticle ? (
                          <a
                            href={topArticle.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 block rounded-2xl border border-ink-800 bg-ink-950/60 px-3 py-2 transition hover:border-signal-500/40 hover:bg-ink-950/80"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-ink-200">{topArticle.title}</span>
                              <span className="shrink-0 text-[10px] uppercase tracking-[0.24em] text-ink-500">{topArticle.source}</span>
                            </div>
                            {topArticle.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-400">{topArticle.summary}</p> : null}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-ink-500">Background reading: {totalArticleCount} curated article{totalArticleCount === 1 ? "" : "s"}.</p>
          </div>
          <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <SectionTitle subtitle="This song is a node, not a report. These are the outward paths.">Connections</SectionTitle>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {eventLinks.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-ink-800 bg-ink-900/30 p-5 text-sm text-ink-500">
                  No event links yet.
                </div>
              ) : (
                eventLinks.slice(0, 4).map((e) => {
                  const edgeEvidence = eventEvidenceByEdge[e.edge_id] ?? [];
                  const evidenceRows = edgeEvidence.map<EvidencePreviewItem>((ev) => ({
                    id: ev.id,
                    title: ev.evidenceType.replace(/_/g, " "),
                    text: ev.value,
                    source: ev.source,
                    confidence: ev.confidence,
                    matchedTerms: ev.evidenceType === "matched_term" ? [ev.value] : [],
                  }));
                  return (
                    <div key={e.event_id} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/55 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/event/${encodeURIComponent(e.event_id)}`} className="block truncate font-medium text-ink-100 hover:text-signal-300">
                            {e.event_name}
                          </Link>
                          <p className="mt-1 text-xs text-ink-500">{e.explanation ?? "Graph-derived relationship with edge evidence."}</p>
                        </div>
                        <Pill variant={e.evidence_count > 0 ? "signal" : "warn"}>{e.evidence_count} rows</Pill>
                      </div>
                      <div className="mt-3">
                        <ConfidenceBar value={e.weight} />
                        <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
                          <span>{(e.confidence * 100).toFixed(0)}% confidence</span>
                          <span>{(e.weight * 100).toFixed(0)}% weight</span>
                        </div>
                      </div>
                      <div className="mt-3 rounded-2xl border border-ink-800 bg-ink-950/60 p-3">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">evidence trail</p>
                        <p className="mt-2 text-xs leading-5 text-ink-300">
                          {evidenceRows.length > 0 ? `${evidenceRows.length} stored evidence row${evidenceRows.length === 1 ? "" : "s"}.` : "No expanded evidence rows stored yet."}
                        </p>
                      </div>
                      <div className="mt-3">
                        <BecauseCard
                          claim={`${song.title} → ${e.event_name}`}
                          reasons={[
                            e.explanation ?? "Connection is inferred from song-event linkage.",
                            `Weight ${(e.weight * 100).toFixed(0)}%.`,
                            `Confidence ${(e.confidence * 100).toFixed(0)}%.`,
                          ]}
                          confidence={e.confidence}
                          provenanceSources={e.evidence_sources
                            ? ["billboard", ...e.evidence_sources.split(",").map((s) => s.trim()).filter(Boolean)]
                            : Array.from(eventEvidenceSources)}
                          evidenceRows={evidenceRows}
                          evidencePreviewTitle="Representative evidence"
                          caveat={e.evidence_count > 0
                            ? "This is the graph edge trail, surfaced inline."
                            : "No expanded evidence rows are stored for this edge yet."}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
          <SectionTitle subtitle="Read the lyric surface as a heat map, not as a wall of lines.">Lyric scan</SectionTitle>
          <div className="mt-4 max-h-[560px] overflow-y-auto rounded-[1.4rem] border border-ink-800 bg-ink-900/40 p-4 scrollbar-thin">
            {lines.length === 0 ? (
              <p className="text-sm text-ink-500">
                No lyrics ingested yet. Run <code className="font-mono">npm run db:fetch-lyrics</code>.
              </p>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-200">
                {lines.map((l) => {
                  const entOnLine = entitiesByLine.get(l.line_index) ?? [];
                  const segments = annotateWithEntities(l.text, entOnLine);
                  return (
                    <span key={l.line_index} className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-900/50">
                      <span className="mr-3 inline-block w-8 text-right text-[10px] tabular-nums text-ink-500">
                        {l.line_index}
                      </span>
                      {segments.map((seg, i) =>
                        seg.entity ? (
                          <span
                            key={i}
                            className="rounded bg-echo-500/20 px-0.5 text-echo-200 cursor-help border-b border-dotted border-echo-400/40"
                            title={`${seg.entity.canonical_name} (${seg.entity.entity_type})`}
                          >
                            {seg.text}
                          </span>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        )
                      )}
                    </span>
                  );
                })}
              </pre>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <section className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <SectionTitle>Themes / moods / entities</SectionTitle>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {themes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ink-800 bg-ink-900/30 p-4 text-sm text-ink-500">No theme scores yet.</div>
                ) : (
                  themes.slice(0, 6).map((t) => (
                    <Link key={t.theme} href={`/theme/${t.theme}`} className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4 transition hover:border-signal-400/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-ink-100">{THEME_LABELS[t.theme as Theme] ?? t.theme}</span>
                        <span className="text-xs text-ink-400">{(t.score * 100).toFixed(0)}%</span>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-ink-900">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(t.score * 100)}%`, background: THEME_COLORS[t.theme as Theme] ?? "#7dd3fc" }} />
                      </div>
                    </Link>
                  ))
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {moods.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ink-800 bg-ink-900/30 p-4 text-sm text-ink-500">No mood data.</div>
                ) : (
                  moods.slice(0, 6).map((m) => (
                    <div key={m.mood} className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="capitalize text-ink-100">{m.mood}</span>
                        <span className="text-xs text-ink-400">{m.score.toFixed(2)}</span>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-ink-900">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(m.score * 100)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">entities mentioned</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entities.length === 0 ? (
                    <span className="text-sm text-ink-500">No entities detected.</span>
                  ) : (
                    entities.slice(0, 18).map((e) => (
                      <Link key={e.entity_id} href={`/entity/${encodeURIComponent(e.entity_id)}`} className="rounded-full border border-ink-700 bg-ink-950/60 px-3 py-1 text-xs text-ink-300 hover:border-signal-400/40 hover:text-signal-100">
                        {e.canonical_name}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <SectionTitle>Similar songs</SectionTitle>
            <div className="mt-4 space-y-2">
              {similarSongs.length === 0 ? (
                <p className="text-sm text-ink-500">No similar songs above the 0.65 cosine threshold in our corpus.</p>
              ) : (
                similarSongs.slice(0, 6).map((s) => (
                  <Link key={s.song_id} href={`/song/${encodeURIComponent(s.song_id)}`} className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 p-3 transition hover:border-signal-400/40">
                    <span className="w-12 text-right text-base font-semibold tabular-nums text-ink-500">{(s.weight * 100).toFixed(0)}%</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink-100">{s.title}</div>
                      <div className="truncate text-xs text-ink-500">{s.artist}</div>
                    </div>
                    <span className="text-xs text-ink-500">{s.year}</span>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <SectionTitle>Artist context</SectionTitle>
            <Link href={`/artist/${encodeURIComponent(primaryArtist)}`} className="mt-3 inline-flex text-sm font-medium text-signal-200 hover:text-signal-100">
              Open artist profile →
            </Link>
            {artistMeta ? (
              <div className="mt-4 grid gap-3">
                <div className="flex flex-wrap gap-2">
                  {artistMeta.jambase_genres.map((g) => (
                    <Pill key={g} variant="mute">{g}</Pill>
                  ))}
                </div>
                <div className="grid gap-2 text-sm text-ink-300 sm:grid-cols-2">
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-3">JamBase: {artistMeta.jambase_id ?? "not linked"}</div>
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-3">MusicBrainz: {artistMeta.musicbrainz_id ? artistMeta.musicbrainz_id.slice(0, 8) : "not linked"}</div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-500">No external metadata for <code className="text-ink-300">{primaryArtist}</code> yet.</p>
            )}
          </section>
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
