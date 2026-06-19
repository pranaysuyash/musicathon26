import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { nodeEntity, slug as slugify } from "@/lib/graph/ids";
import {
  getEntityProfile,
  getSongsMentioningEntity,
  getEntityThemeSignals,
  getEntityEventLinks,
} from "@/lib/db/queries";
import { Pill, SectionTitle } from "@/components/ui/primitives";
import { StoryNextStep } from "@/components/story/story-next-step";

function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: { params: { entity: string } }): Promise<Metadata> {
  const entity = getEntityProfile(decodeRouteParam(params.entity));
  if (!entity) return { title: "Entity not found" };
  return {
    title: `${entity.canonicalName} — Entity`,
    description: `Entity-level lens for ${entity.canonicalName} across themes, events, and song mentions.`,
    openGraph: {
      images: [
        {
          url: `/api/og?type=entity&title=${encodeURIComponent(entity.canonicalName)}&subtitle=${encodeURIComponent(`Where ${entity.canonicalName} appears in chart culture`)}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default function EntityPage({ params }: { params: { entity: string } }) {
  const entity = getEntityProfile(decodeRouteParam(params.entity));
  if (!entity) notFound();

  const songs = getSongsMentioningEntity(entity.id, 100);
  const themes = getEntityThemeSignals(entity.id, 12);
  const events = getEntityEventLinks(entity.id, 12);

  const uniqueSongsMap = new Map<string, (typeof songs)[number]>();
  for (const song of songs) {
    if (!uniqueSongsMap.has(song.songId)) uniqueSongsMap.set(song.songId, song);
  }
  const uniqueSongs = Array.from(uniqueSongsMap.values());

  const rootId = `${nodeEntity(entity.entityType, slugify(entity.canonicalName))}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</Link>

      <header className="mt-4 mb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="signal">ENTITY</Pill>
          <Pill variant="mute">{entity.entityType}</Pill>
        </div>
        <h1 className="h-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl text-balance">
          {entity.canonicalName}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-400 text-pretty">
          Entity-level lens: where this entity appears in lyrics, themes, and events across the chart corpus.
        </p>
        {entity.aliases.length > 0 ? (
          <p className="mt-2 text-xs text-ink-500">Aliases: {entity.aliases.join(", ")}</p>
        ) : null}
      </header>

      <section className="mb-10">
        <SectionTitle>Songs mentioning {entity.canonicalName} ({uniqueSongs.length})</SectionTitle>
        <ul className="card divide-y divide-ink-800/60">
          {uniqueSongs.length === 0 ? (
            <li className="p-4 text-sm text-ink-500">No explicit song mentions yet.</li>
          ) : (
            uniqueSongs.slice(0, 100).map((song) => (
              <li key={song.songId} className="flex items-center gap-3 p-3 text-sm">
                <Pill variant="echo">{song.source}</Pill>
                <Link
                  href={`/song/${encodeURIComponent(song.songId)}`}
                  className="flex-1 truncate text-ink-100 hover:text-signal-300"
                >
                  {song.title}
                </Link>
                <span className="text-xs text-ink-500">{song.artist}</span>
                <span className="text-xs text-ink-500">{song.year}</span>
                <span className="text-xs text-ink-500">{song.surfaceForm}</span>
                <span className="text-xs text-ink-500">{(song.confidence * 100).toFixed(0)}%</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mb-10">
        <SectionTitle>Most associated themes</SectionTitle>
        <div className="card space-y-2">
          {themes.length === 0 ? (
            <p className="p-4 text-sm text-ink-500">No theme evidence yet.</p>
          ) : (
            themes.map((theme) => (
              <Link
                key={theme.theme}
                href={`/theme/${theme.theme}`}
                className="flex items-center justify-between rounded border border-ink-800 px-3 py-2 text-sm text-ink-100 transition hover:border-signal-600"
              >
                <span>{theme.theme}</span>
                <span className="text-xs text-ink-400">{theme.songCount} songs</span>
                <span className="text-xs tabular-nums text-ink-300">{theme.avgScore.toFixed(0)} score</span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Event links from mentions</SectionTitle>
        <ul className="card divide-y divide-ink-800/60">
          {events.length === 0 ? (
            <li className="p-4 text-sm text-ink-500">No linked events yet.</li>
          ) : (
            events.map((ev) => (
              <li key={ev.id} className="flex items-center gap-2 p-3 text-sm">
                <Pill variant="echo">{ev.category}</Pill>
                <Link href={`/event/${encodeURIComponent(ev.id)}`} className="text-ink-100 hover:text-signal-300">
                  {ev.name}
                </Link>
                <span className="ml-auto text-xs text-ink-500">{ev.startDate}</span>
                <span className="text-xs text-ink-500">{ev.songCount} songs</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mb-10">
        <SectionTitle>External IDs</SectionTitle>
        <div className="card grid grid-cols-1 gap-2 p-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-ink-500">Wikidata</div>
            <div className="text-ink-100">{entity.wikidataId ?? "—"}</div>
          </div>
          <div>
            <div className="text-ink-500">MusicBrainz</div>
            <div className="text-ink-100">{entity.musicbrainzId ?? "—"}</div>
          </div>
          <div>
            <div className="text-ink-500">Graph node</div>
            <div className="break-all text-ink-100">{rootId}</div>
          </div>
          <div>
            <div className="text-ink-500">Entity metadata</div>
            <div className="text-ink-100">{JSON.stringify(entity.metadata) ?? "—"}</div>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Open in graph</SectionTitle>
        <a
          href={`/graph?rootType=entity&rootId=${encodeURIComponent(rootId)}&hops=2`}
          className="inline-flex items-center rounded-lg border border-ink-700 bg-ink-800/60 px-5 py-2.5 text-sm font-medium text-ink-100 transition hover:border-ink-600 hover:bg-ink-800"
        >
          Explore in Graph Explorer →
        </a>
      </section>

      <StoryNextStep />
    </main>
  );
}
