import { notFound } from "next/navigation";
import Link from "next/link";
import { getEventById, getSongsForEvent, getAllEvents } from "@/lib/db/queries";
import { initDb } from "@/lib/db";
import { ConfidenceBar, Pill, SectionTitle } from "@/components/ui/primitives";
import { THEME_LABELS, THEME_COLORS } from "@/lib/nlp/theme-scoring";
import type { Theme } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default function EventPage({ params }: PageProps) {
  initDb();
  const id = decodeURIComponent(params.id);
  const event = getEventById(id);
  if (!event) {
    const all = getAllEvents();
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Event not found</h1>
        <p className="mt-2 text-sm text-ink-400">id: {id}</p>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {all.map((ev) => (
            <Link key={ev.id} href={`/event/${encodeURIComponent(ev.id)}`} className="card p-4 hover:border-ink-600">
              <div className="text-sm font-medium text-ink-100">{ev.name}</div>
              <div className="text-xs text-ink-400">{ev.startDate} → {ev.endDate ?? "present"}</div>
            </Link>
          ))}
        </div>
      </main>
    );
  }

  const linked = getSongsForEvent(event.id, 0.1);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</Link>
      <header className="mt-4 mb-10">
        <div className="flex items-center gap-2">
          <Pill variant="echo">EVENT LENS</Pill>
          <Pill variant="mute">{event.category}</Pill>
          <Pill variant="mute">{event.startDate} → {event.endDate ?? "present"}</Pill>
        </div>
        <h1 className="h-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl text-balance">
          {event.name}
        </h1>
        <p className="mt-3 max-w-2xl text-ink-300 text-pretty">{event.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {event.relatedThemes.map((t) => (
            <span
              key={t}
              className="pill"
              style={{
                borderColor: `${THEME_COLORS[t as Theme] ?? "#94a3b8"}55`,
                background: `${THEME_COLORS[t as Theme] ?? "#94a3b8"}11`,
                color: THEME_COLORS[t as Theme] ?? "#94a3b8",
              }}
            >
              {THEME_LABELS[t as Theme] ?? t}
            </span>
          ))}
        </div>
      </header>

      <section className="mb-10">
        <SectionTitle subtitle="Sorted by composite link strength. Click for evidence.">
          Songs connected to this event ({linked.length})
        </SectionTitle>
        <ul className="card divide-y divide-ink-800/60">
          {linked.length === 0 ? (
            <li className="p-5 text-sm text-ink-500">
              No songs linked yet. Run <code className="font-mono">npm run py:enrich</code>.
            </li>
          ) : (
            linked.map((row) => (
              <li key={row.edge.id} className="p-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 text-xl font-semibold tabular-nums text-ink-500">
                    {row.chartRank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/song/${encodeURIComponent(row.songId)}`}
                      className="block truncate text-sm font-medium text-ink-100 hover:text-signal-300"
                    >
                      {row.title}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-ink-400">
                      <span>{row.artist}</span>
                      <span>·</span>
                      <span>{row.year}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Pill variant="warn">{row.edge.edgeType.replace(/_/g, " ")}</Pill>
                    <ConfidenceBar value={row.edge.weight} />
                  </div>
                </div>
                {row.edge.explanation ? (
                  <p className="mt-2 ml-11 text-xs text-ink-400 italic">{row.edge.explanation}</p>
                ) : null}
                {row.evidence.length > 0 ? (
                  <details className="ml-11 mt-2">
                    <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-300">
                      {row.evidence.length} evidence {row.evidence.length === 1 ? "row" : "rows"}
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {row.evidence.map((e) => (
                        <li key={e.id} className="rounded border border-ink-800 bg-ink-900/60 p-2 text-xs">
                          <div className="mb-1 flex items-center gap-2">
                            <Pill variant="mute">{e.evidenceType.replace(/_/g, " ")}</Pill>
                            <Pill variant="mute">{e.source}</Pill>
                            <span className="ml-auto text-ink-500">{(e.confidence * 100).toFixed(0)}%</span>
                          </div>
                          <p className="text-ink-200 italic">&ldquo;{e.value}&rdquo;</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <SectionTitle>Try the event in the graph explorer</SectionTitle>
        <div className="card p-6">
          <p className="mb-4 text-sm text-ink-300">
            The graph view will center on this event node, show all songs linked to it, and reveal
            the themes and entities that drove each connection.
          </p>
          <Link
            href={`/graph?rootType=event&rootId=versesignal:n:event:${event.id}`}
            className="inline-block rounded-lg bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
          >
            Open in Graph Explorer →
          </Link>
        </div>
      </section>
    </main>
  );
}
