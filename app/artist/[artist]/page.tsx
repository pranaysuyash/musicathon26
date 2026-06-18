import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { nodeArtist } from "@/lib/graph/ids";
import {
  getArtistProfile,
  getArtistSongs,
  getArtistThemeSignals,
  getArtistEventLinks,
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

export async function generateMetadata({ params }: { params: { artist: string } }): Promise<Metadata> {
  const artist = getArtistProfile(decodeRouteParam(params.artist));
  if (!artist) return { title: "Artist not found" };
  return {
    title: `${artist.canonicalName} — Artist profile`,
    description: `Songs, themes, and event links for ${artist.canonicalName} in VerseSignal.`,
  };
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function ArtistPage({ params }: { params: { artist: string } }) {
  const artist = getArtistProfile(decodeRouteParam(params.artist));
  if (!artist) notFound();

  const songs = getArtistSongs(artist.canonicalName, 80);
  const themes = getArtistThemeSignals(artist.canonicalName, 16);
  const events = getArtistEventLinks(artist.canonicalName, 16);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</Link>

      <header className="mt-4 mb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="signal">ARTIST</Pill>
          <Pill variant="mute">{artist.role}</Pill>
          {artist.musicbrainzArtistType ? <Pill variant="mute">{artist.musicbrainzArtistType}</Pill> : null}
        </div>
        <h1 className="h-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl text-balance">
          {artist.canonicalName}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-400 text-pretty">
          Artist-level lens: what this artist brought into the chart corpus and how those songs connect to cultural signals.
        </p>
        {artist.aliases.length > 0 ? (
          <p className="mt-2 text-xs text-ink-500">
            Known aliases: {artist.aliases.join(", ")}
          </p>
        ) : null}
      </header>

      <section className="mb-10">
        <SectionTitle>Catalog in this dataset ({songs.length})</SectionTitle>
        <ul className="card divide-y divide-ink-800/60">
          {songs.length === 0 ? (
            <li className="p-4 text-sm text-ink-500">No dataset songs found for this artist yet.</li>
          ) : (
            songs.slice(0, 50).map((song) => (
              <li key={song.songId} className="flex items-center gap-3 p-3 text-sm">
                <span className="w-10 text-right text-base font-semibold tabular-nums text-ink-500">
                  {song.chartRank ? song.chartRank : "—"}
                </span>
                <Link
                  href={`/song/${encodeURIComponent(song.songId)}`}
                  className="flex-1 truncate text-ink-100 hover:text-signal-300"
                >
                  {song.title}
                </Link>
                <span className="text-xs text-ink-500">{song.artist}</span>
                <span className="text-xs text-ink-500">{song.year}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mb-10">
        <SectionTitle>Top themes this artist&apos;s songs carry</SectionTitle>
        <div className="card space-y-2">
          {themes.length === 0 ? (
            <p className="p-4 text-sm text-ink-500">No theme enrichment for this artist yet.</p>
          ) : (
            themes.map((t) => (
              <Link
                key={t.theme}
                href={`/theme/${t.theme}`}
                className="flex items-center justify-between rounded border border-ink-800 px-3 py-2 text-sm text-ink-100 transition hover:border-signal-600"
              >
                <span>{t.theme}</span>
                <span className="text-xs text-ink-400">{t.songCount} songs</span>
                <span className="text-xs tabular-nums text-ink-300">{t.avgScore.toFixed(0)} score</span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>World events linked through this artist&apos;s tracks</SectionTitle>
        <ul className="card divide-y divide-ink-800/60">
          {events.length === 0 ? (
            <li className="p-4 text-sm text-ink-500">No linked events yet.</li>
          ) : (
            events.map((ev) => (
              <li key={ev.id} className="flex items-center gap-2 p-3 text-sm">
                <Pill variant="echo">{ev.category}</Pill>
                <Link href={`/event/${encodeURIComponent(ev.id)}`} className="truncate text-ink-100 hover:text-signal-300">
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
        <SectionTitle>External metadata</SectionTitle>
        <div className="card divide-y divide-ink-800/60 p-2">
          <div className="flex items-center justify-between px-2 py-2 text-sm">
            <span className="text-ink-500">Wikidata</span>
            <span className="text-ink-100">{artist.wikidataId ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between px-2 py-2 text-sm">
            <span className="text-ink-500">MusicBrainz</span>
            <span className="text-ink-100">{artist.musicbrainzId ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between px-2 py-2 text-sm">
            <span className="text-ink-500">JamBase</span>
            <span className="text-ink-100">{artist.jambaseId ?? "—"}</span>
          </div>
          {Object.keys(artist.metadata).length > 0 ? (
            <div className="px-2 py-2 text-sm">
              <div className="text-ink-500">Metadata</div>
              {Object.entries(artist.metadata).map(([k, v]) => (
                <div key={k} className="mt-1 flex items-start gap-2 text-ink-200">
                  <span className="w-32 shrink-0 text-xs text-ink-500">{k}</span>
                  <span className="text-sm">{formatMetadataValue(v)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Open in graph</SectionTitle>
        <a
          href={`/graph?rootType=artist&rootId=${encodeURIComponent(nodeArtist(artist.canonicalName))}&hops=2`}
          className="inline-flex items-center rounded-lg border border-ink-700 bg-ink-800/60 px-5 py-2.5 text-sm font-medium text-ink-100 transition hover:border-ink-600 hover:bg-ink-800"
        >
          Explore in Graph Explorer →
        </a>
      </section>

      <StoryNextStep />
    </main>
  );
}
