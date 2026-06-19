import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSongById, getSimilarSongs, getArtistMeta, getEvidenceForEdges } from "@/lib/db/queries";
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
import { all } from "@/lib/db/sql";
import { Pill, SectionTitle, ConfidenceBar } from "@/components/ui/primitives";
import { BecauseCard } from "@/components/evidence/because-card";
import { THEME_LABELS, THEME_COLORS } from "@/lib/nlp/theme-scoring";
import type { Theme } from "@/lib/types";
import type { EvidencePreviewItem } from "@/components/evidence/evidence-preview";

export const dynamic = "force-dynamic";

function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

export default function SongPage({ params }: PageProps) {
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

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={`/year/${song.year}`} className="text-xs text-ink-400 hover:text-ink-200">← {song.year}</Link>
      <header className="mt-4 mb-10">
        <Pill variant="signal">SONG</Pill>
        <h1 className="h-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl text-balance">
          {song.title}
        </h1>
        <p className="mt-2 text-ink-300">
          {song.artist} · {song.year} · Billboard Hot 100 year-end #{song.chartRank}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <SectionTitle>Lyrics ({lyrics.length} lines)</SectionTitle>
            <div className="card max-h-[600px] overflow-y-auto p-5 scrollbar-thin">
              {lyrics.length === 0 ? (
                <p className="text-sm text-ink-500">
                  No lyrics ingested yet. Run <code className="font-mono">npm run db:fetch-lyrics</code>.
                </p>
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-200">
                  {lyrics.map((l) => {
                    const entOnLine = entitiesByLine.get(l.line_index) ?? [];
                    return (
                      <span key={l.line_index} className="block">
                        <span className="mr-3 inline-block w-8 text-right text-[10px] tabular-nums text-ink-500">
                          {l.line_index}
                        </span>
                        <span className={entOnLine.length > 0 ? "bg-echo-900/20" : ""}>{l.text}</span>
                      </span>
                    );
                  })}
                </pre>
              )}
            </div>
          </section>

          <section>
            <SectionTitle>Themes</SectionTitle>
            <div className="card p-5">
              {themes.length === 0 ? (
                <p className="text-sm text-ink-500">No theme scores yet. Run <code className="font-mono">npm run py:enrich</code>.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {themes.map((t) => (
                    <li key={t.theme} className="flex items-center justify-between rounded border border-ink-800 bg-ink-900/40 p-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: THEME_COLORS[t.theme as Theme] ?? "#7dd3fc" }} />
                        <Link href={`/theme/${t.theme}`} className="text-sm text-ink-100 hover:text-signal-300">
                          {THEME_LABELS[t.theme as Theme] ?? t.theme}
                        </Link>
                        <Pill variant="mute">{t.source}</Pill>
                      </div>
                      <span className="text-xs tabular-nums text-ink-300">{(t.score * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section>
            <SectionTitle>Moods</SectionTitle>
            <ul className="card divide-y divide-ink-800/60">
              {moods.length === 0 ? (
                <li className="p-4 text-sm text-ink-500">No mood data.</li>
              ) : (
                moods.map((m) => (
                  <li key={m.mood} className="flex items-center justify-between p-3 text-sm">
                    <span className="capitalize text-ink-100">{m.mood}</span>
                    <span className="text-xs tabular-nums text-ink-400">{m.score.toFixed(2)}</span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section>
            <SectionTitle>Similar songs ({similarSongs.length})</SectionTitle>
            {similarSongs.length === 0 ? (
              <p className="text-sm text-ink-500">No similar songs above the 0.65 cosine threshold in our corpus.</p>
            ) : (
              <ul className="card divide-y divide-ink-800/60">
                {similarSongs.map((s) => (
                  <li key={s.song_id} className="flex items-center gap-3 p-3 text-sm">
                    <span className="w-10 text-right text-base font-semibold tabular-nums text-ink-500">
                      {(s.weight * 100).toFixed(0)}%
                    </span>
                    <Link
                      href={`/song/${encodeURIComponent(s.song_id)}`}
                      className="flex-1 truncate text-ink-100 hover:text-signal-300"
                    >
                      {s.title} <span className="text-ink-500">— {s.artist}</span>
                    </Link>
                    <span className="text-xs text-ink-500">{s.year}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionTitle>Artist ({primaryArtist})</SectionTitle>
            <Link
              href={`/artist/${encodeURIComponent(primaryArtist)}`}
              className="mb-2 inline-block text-sm text-signal-300 hover:underline"
            >
              Open artist profile →
            </Link>
            {artistMeta ? (
              <div className="card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {artistMeta.jambase_genres.map((g) => (
                    <Pill key={g} variant="mute">{g}</Pill>
                  ))}
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
                  <dt className="text-ink-500">JamBase ID</dt>
                  <dd className="sm:col-span-2">
                    {artistMeta.jambase_id ? (
                      <a
                        href={`https://www.jambase.com/band/${artistMeta.jambase_id.replace("jambase:", "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-signal-300 hover:underline"
                      >
                        {artistMeta.jambase_id} ↗
                      </a>
                    ) : (
                      <span className="text-ink-500">not linked</span>
                    )}
                  </dd>
                  {artistMeta.musicbrainz_id ? (
                    <>
                      <dt className="text-ink-500">MusicBrainz</dt>
                      <dd className="sm:col-span-2">
                        <a
                          href={`https://musicbrainz.org/artist/${artistMeta.musicbrainz_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-signal-300 hover:underline"
                        >
                          {artistMeta.musicbrainz_id.slice(0, 8)}… ↗
                        </a>
                      </dd>
                    </>
                  ) : null}
                  {artistMeta.wikidata_id ? (
                    <>
                      <dt className="text-ink-500">Wikidata</dt>
                      <dd className="sm:col-span-2">
                        <a
                          href={`https://www.wikidata.org/wiki/${artistMeta.wikidata_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-signal-300 hover:underline"
                        >
                          {artistMeta.wikidata_id} ↗
                        </a>
                      </dd>
                    </>
                  ) : null}
                </dl>
              </div>
            ) : (
              <p className="text-sm text-ink-500">
                No external metadata for <code className="text-ink-300">{primaryArtist}</code> yet. Re-run
                <code className="ml-1 text-ink-300">scripts/enrich-jambase.py</code> to fetch.
              </p>
            )}
          </section>

          <section>
            <SectionTitle>Entities mentioned ({entities.length})</SectionTitle>
            <ul className="card divide-y divide-ink-800/60">
              {entities.length === 0 ? (
                <li className="p-4 text-sm text-ink-500">No entities detected.</li>
              ) : (
                entities.slice(0, 30).map((e) => (
                  <li key={e.entity_id} className="flex items-center gap-2 p-3 text-xs">
                    <Pill variant="echo">{e.entity_type.replace(/_/g, " ")}</Pill>
                    <Link
                      href={`/entity/${encodeURIComponent(e.entity_id)}`}
                      className="flex-1 truncate text-ink-100 underline-offset-2 hover:underline"
                    >
                      {e.canonical_name}
                    </Link>
                    <span className="text-ink-500">{(e.confidence * 100).toFixed(0)}%</span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section>
            <SectionTitle>Event connections</SectionTitle>
            <ul className="card divide-y divide-ink-800/60">
              {eventLinks.length === 0 ? (
                <li className="p-4 text-sm text-ink-500">No event links yet.</li>
              ) : (
                eventLinks.map((e) => {
                  const edgeEvidence = eventEvidenceByEdge[e.edge_id] ?? [];
                  const evidenceRows = edgeEvidence.map<EvidencePreviewItem>((ev) => ({
                    id: ev.id,
                    title: ev.evidenceType.replace(/_/g, " "),
                    text: ev.value,
                    source: ev.source,
                    confidence: ev.confidence,
                    matchedTerms: [],
                  }));
                  return (
                  <li key={e.event_id} className="p-3 text-xs">
                    <Link
                      href={`/event/${encodeURIComponent(e.event_id)}`}
                      className="text-sm font-medium text-ink-100 hover:text-signal-300"
                    >
                      {e.event_name}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <ConfidenceBar value={e.weight} />
                      <span className="text-xs text-ink-500">{(e.confidence * 100).toFixed(0)}% conf</span>
                      <Pill variant={e.evidence_count > 0 ? "signal" : "warn"}>
                        {e.evidence_count} evidence {e.evidence_count === 1 ? "row" : "rows"}
                      </Pill>
                    </div>
                    {e.explanation ? <p className="mt-1 text-ink-500 italic">{e.explanation}</p> : null}
                    <div className="mt-2">
                      <BecauseCard
                        claim={`${song.title} ↔ ${e.event_name}`}
                        reasons={[
                          e.explanation ?? "Connection is inferred from song-event linkage.",
                          `Weight ${(e.weight * 100).toFixed(0)}%.`,
                          `Confidence ${(e.confidence * 100).toFixed(0)}%.`,
                        ]}
                        confidence={e.confidence}
                        provenanceSources={e.evidence_sources ? ["billboard", ...e.evidence_sources.split(",")] : Array.from(eventEvidenceSources)}
                        evidenceRows={evidenceRows}
                        evidencePreviewTitle="Representative evidence"
                        caveat={e.evidence_count > 0
                          ? "Evidence is assembled directly from the linked edge evidence rows."
                          : "No expanded evidence rows are stored for this edge yet."}
                      />
                    </div>
                  </li>
                  );
                })
              )}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ink-400">
              {Array.from(eventEvidenceSources).map((source) => (
                <span key={source} className="rounded border border-ink-700 px-2 py-1">
                  {source}
                </span>
              ))}
            </div>
          </section>
         </aside>
       </div>
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
