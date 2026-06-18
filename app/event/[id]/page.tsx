import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getEventById, getSongsForEvent, getAllEvents, getEventSignalDecay, getEventLeadAnalysis, REGION_LABELS } from "@/lib/db/queries";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const event = getEventById(decodeRouteParam(params.id));
  if (!event) return { title: "Event not found" };
  return {
    title: event.name,
    description: `Songs linked to ${event.name} (${event.startDate}–${event.endDate ?? "ongoing"}). ${event.category}.`,
    openGraph: {
      images: [{ url: `/api/og?type=event&title=${encodeURIComponent(event.name)}&subtitle=${encodeURIComponent(`Songs linked to ${event.name} (${event.category})`)}`, width: 1200, height: 630 }],
    },
  };
}
function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

import { initDb } from "@/lib/db";
import { ConfidenceBar, Pill, SectionTitle } from "@/components/ui/primitives";
import { StoryNextStep } from "@/components/story/story-next-step";
import { THEME_LABELS, THEME_COLORS } from "@/lib/nlp/theme-scoring";
import type { Theme } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default function EventPage({ params }: PageProps) {
  initDb();
  const id = decodeRouteParam(params.id);
  const event = getEventById(id);
  if (!event) {
    const all = getAllEvents();
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-2xl font-semibold">Event not found</h2>
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
  const decay = getEventSignalDecay(event.id);
  const lead = getEventLeadAnalysis(event.id);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</Link>
      <header className="mt-4 mb-10">
        <div className="flex items-center gap-2">
          <Pill variant="echo">EVENT LENS</Pill>
          <Pill variant="mute">{event.category}</Pill>
          <Pill variant="mute">{event.startDate} → {event.endDate ?? "present"}</Pill>
          {event.regions.length > 0 ? event.regions.map((r) => (
            <Pill key={r} variant="mute">{REGION_LABELS[r] ?? r}</Pill>
          )) : null}
        </div>
        <h1 className="h-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl text-balance">
          {event.name}
        </h1>
        <p className="mt-3 max-w-2xl text-ink-300 text-pretty">{event.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {event.relatedThemes.map((t) => (
            <Link
              key={t}
              href={`/theme/${t}`}
              className="pill hover:opacity-80"
              style={{
                borderColor: `${THEME_COLORS[t as Theme] ?? "#94a3b8"}55`,
                background: `${THEME_COLORS[t as Theme] ?? "#94a3b8"}11`,
                color: THEME_COLORS[t as Theme] ?? "#94a3b8",
              }}
            >
              {THEME_LABELS[t as Theme] ?? t}
            </Link>
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

      {/* Event lead analysis (P2.3) — signals that were already shifting before the event */}
      {lead && lead.leadSignals.length > 0 ? (
        <section className="mb-10">
          <SectionTitle subtitle={`Signal changes visible in the chart year before this event (${lead.preEventYear}).`}>
            Lead signals
            {lead.totalCorrelatedSignals > 1 ? (
              <span className="ml-2 text-xs font-normal text-ink-400">
                · {(lead.leadSignalRate * 100).toFixed(0)}% lead rate
                ({lead.preElevatedSignals}/{lead.totalCorrelatedSignals} directionally consistent)
              </span>
            ) : null}
          </SectionTitle>
          <div className="card divide-y divide-ink-800/60">
            {lead.leadSignals.map((s, i) => (
              <div key={`${s.signalType}:${s.signal}`} className="flex items-center gap-3 p-3 text-sm">
                <span className="w-6 text-xs text-ink-500">{i + 1}.</span>
                <span title={s.directionallyConsistent ? "Directionally consistent (true lead)" : "Pre-event drift (opposite direction during event)"}>
                  {s.directionallyConsistent ? (
                    <Pill variant="echo">lead</Pill>
                  ) : s.correlatedDuringEvent ? (
                    <Pill variant="warn">drift</Pill>
                  ) : (
                    <Pill variant="mute">ambient</Pill>
                  )}
                </span>
                <Pill variant="mute">{s.signalType}</Pill>
                <span className="flex-1 truncate font-medium text-ink-100">
                  {s.signal}
                </span>
                <div className="flex items-center gap-2 text-xs">
                  {s.correlatedDuringEvent ? (
                    <span className="text-signal-400" title="Correlated during event">
                      Δ{s.eventCorrelationDelta !== null ? (s.eventCorrelationDelta > 0 ? "+" : "") + s.eventCorrelationDelta.toFixed(1) : "?"}
                    </span>
                  ) : null}
                  <span className={s.delta > 0 ? "text-green-400" : "text-ink-500"}
                    title="Pre-event delta vs baseline">
                    pre{s.delta > 0 ? "+" : ""}{s.delta.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {lead.leadSignalRate > 0.3 ? (
            <p className="mt-3 text-xs text-ink-500">
              <span className="text-signal-400 font-medium">High lead rate.</span>{" "}
              Over {lead.leadSignalRate > 0.5 ? "half" : "a third"} of signals correlated
              with this event were already shifting in the same direction in {lead.preEventYear}
              — the music was anticipating this moment.
            </p>
          ) : lead.preElevatedSignals > 0 ? (
            <p className="mt-3 text-xs text-ink-500">
              <span className="text-ink-300 font-medium">Partial anticipation.</span>{" "}
              Some signals in this event&apos;s correlation set were elevated in {lead.preEventYear}
              , but moved in the opposite direction during the event (labelled &quot;drift&quot;).
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-500">
              <span className="text-ink-300 font-medium">No lead.</span>{" "}
              None of the signals correlated with this event were elevated in {lead.preEventYear}.
              The musical shift was synchronous with the event itself.
            </p>
          )}
        </section>
      ) : null}

      {/* Event signal decay (P2.3) — how long the event's signal persisted */}
      {decay.length > 1 ? (
        <section className="mb-10">
          <SectionTitle subtitle="How the signal to this event changed over subsequent chart years.">
            Signal decay over time
          </SectionTitle>
          <div className="card divide-y divide-ink-800/60">
            {decay.map((d) => (
              <div key={d.year} className="flex items-center gap-4 p-3 text-sm">
                <span className="w-16 font-semibold tabular-nums text-ink-100">
                  {d.year}
                </span>
                <span className="w-20 text-xs text-ink-500">
                  {d.yearsSinceEvent >= 0 ? `+${d.yearsSinceEvent}yr` : `${d.yearsSinceEvent}yr`}
                </span>
                <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                  {Object.entries(d.postureCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([posture, count]) => (
                      <span key={posture} className="flex items-center gap-1">
                        <span className="capitalize text-ink-300">{posture}</span>
                        <span className="text-ink-500">×{count}</span>
                      </span>
                    ))}
                </div>
                <Pill variant="echo">{d.dominantPosture}</Pill>
              </div>
            ))}
          </div>
          {decay.length >= 2 ? (
            <p className="mt-3 text-xs text-ink-500">
              The first year was {decay[0].dominantPosture}; by year {decay[decay.length - 1].year}, 
              the posture shifted to {decay[decay.length - 1].dominantPosture}.
            </p>
          ) : null}
        </section>
      ) : null}

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
    
      <StoryNextStep />
    </main>
  );
}
