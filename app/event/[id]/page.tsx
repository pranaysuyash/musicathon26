import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getEventById, getSongsForEvent, getAllEvents, getEventSignalDecay, getEventLeadAnalysis, getEventArticles, REGION_LABELS } from "@/lib/db/queries";
import { t, resolveLocale } from "@/lib/i18n/strings";
import { BecauseCard } from "@/components/evidence/because-card";
import type { EvidencePreviewItem } from "@/components/evidence/evidence-preview";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { lang?: string };
}): Promise<Metadata> {
  const locale = resolveLocale(searchParams.lang);
  const event = getEventById(decodeRouteParam(params.id));
  if (!event) return { title: "Event not found" };
  return {
    title: `${event.name} — ${t(locale, "event.title")}`,
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
  searchParams: { lang?: string };
}

export default function EventPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale(searchParams.lang);
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
  const articles = getEventArticles(event.id);
  const linkedSources = Array.from(
    new Set(["billboard", ...linked.flatMap((row) => [row.edge.sourceApi, ...row.evidence.map((e) => e.source)])])
  );
  const linkedConfidence = linked.length > 0
    ? linked.reduce((sum, row) => sum + row.edge.confidence, 0) / linked.length
    : 0;
  const linkedEvidenceRows = linked
    .flatMap((row) =>
      row.evidence.slice(0, 1).map((e) => ({
        id: `${row.songId}:${e.id}`,
        title: e.evidenceType.replace(/_/g, " "),
        text: e.value,
        source: e.source,
        confidence: e.confidence,
        matchedTerms: row.edge.matchedTerms,
      } as EvidencePreviewItem))
    )
    .slice(0, 4);
  const leadRate = lead ? Math.round(lead.leadSignalRate * 100) : null;
  const directEvidenceCount = linked.length;

  // Per motto 0.1, an event page should answer "is this event
  // backed by chart evidence, and how did the chart react?" — not
  // just "how many songs linked?" We compose the narrative from
  // linked count, decay, and pre-event lead so the card has the
  // same shape as the theme page.
  const eventWhyReasons: string[] = [
    `${linked.length} song${linked.length === 1 ? "" : "s"} cleared the direct lyric threshold for this event.`,
  ];
  if (linked.length > 0) {
    eventWhyReasons.push(
      `Average edge confidence: ${(linkedConfidence * 100).toFixed(0)}%.`
    );
  } else {
    eventWhyReasons.push(
      "No direct lyric links are currently above the threshold — the event is not named in the chart songs."
    );
  }
  eventWhyReasons.push(
    `Temporal window: ${event.startDate} to ${event.endDate ?? "present"}.`
  );
  // Pre-event resonance: the most interesting story
  if (lead && lead.totalCorrelatedSignals > 0) {
    if ((leadRate ?? 0) >= 30) {
      eventWhyReasons.push(
        `Pre-event resonance: ${leadRate}% of the signals correlated with this event were already elevated in ${lead.preEventYear}.`
      );
    } else if (lead.preElevatedSignals > 0) {
      eventWhyReasons.push(
        `Pre-event shift was mixed: ${lead.preElevatedSignals} signal(s) elevated in ${lead.preEventYear} but moved in the opposite direction during the event.`
      );
    } else {
      eventWhyReasons.push(
        `No pre-event signal shift detected in ${lead.preEventYear} — the chart reacted synchronously with the event.`
      );
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/" className="text-xs uppercase tracking-[0.26em] text-ink-400 hover:text-ink-200">
        ← VerseSignal
      </Link>

      <section className="mt-4 overflow-hidden rounded-[2.5rem] border border-ink-800 bg-[linear-gradient(145deg,rgba(9,11,18,0.98),rgba(7,8,14,0.92))] px-5 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_42px_120px_-60px_rgba(14,165,233,0.45)] sm:px-6 lg:px-8 lg:py-8">
        <div className="grid gap-8 xl:grid-cols-[1.03fr_0.97fr] xl:items-start">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Pill variant="echo">{t(locale, "event.title")}</Pill>
              <Pill variant="mute">{event.category}</Pill>
              <Pill variant="mute">{event.startDate} → {event.endDate ?? "present"}</Pill>
              <Pill variant="warn">signal trial</Pill>
            </div>
            <h1 className="h-display mt-5 text-4xl leading-[0.95] text-balance text-ink-50 md:text-5xl lg:text-6xl">
              {event.name}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-pretty text-ink-300 md:text-base">
              {event.description} This page tests the context instead of assuming it. Direct lyrics, temporal
              resonance, and weaker echoes stay separated.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {event.regions.map((r) => (
                <Pill key={r} variant="mute">
                  {REGION_LABELS[r] ?? r}
                </Pill>
              ))}
              {event.relatedThemes.map((theme) => (
                <Link
                  key={theme}
                  href={`/theme/${theme}`}
                  className="pill hover:opacity-80"
                  style={{
                    borderColor: `${THEME_COLORS[theme as Theme] ?? "#94a3b8"}55`,
                    background: `${THEME_COLORS[theme as Theme] ?? "#94a3b8"}11`,
                    color: THEME_COLORS[theme as Theme] ?? "#94a3b8",
                  }}
                >
                  {THEME_LABELS[theme as Theme] ?? theme}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                label: "Direct lyric matches",
                value: String(directEvidenceCount),
                note: directEvidenceCount > 0 ? "Names the context in song text" : "No direct mention in this corpus slice",
              },
              {
                label: "Pre-event resonance",
                value: leadRate !== null ? `${leadRate}%` : "n/a",
                note: lead ? `Signals before ${lead.preEventYear}` : "No pre-event signal window",
              },
              {
                label: "Signal persistence",
                value: `${decay.length}`,
                note: `${decay.length} year${decay.length === 1 ? "" : "s"} tracked after the event`,
              },
              {
                label: "Context coverage",
                value: String(articles.length),
                note: "Curated articles attached to this event",
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[1.5rem] border border-ink-800 bg-ink-950/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-50">{stat.value}</p>
                <p className="mt-2 text-sm leading-6 text-ink-400">{stat.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Direct", value: "named in the lyrics" },
            { label: "Shift", value: "moved before the event" },
            { label: "Echo", value: "rhyme without overclaiming" },
            { label: "Reject", value: "too weak to call a connection" },
          ].map((tier) => (
            <div key={tier.label} className="rounded-2xl border border-ink-800 bg-ink-950/55 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{tier.label}</p>
              <p className="mt-1 text-xs leading-5 text-ink-300">{tier.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10 mt-10">
        <BecauseCard
          claim={`${event.name} signal trial`}
          reasons={eventWhyReasons}
          confidence={linked.length > 0 ? linkedConfidence : 0.35}
          provenanceSources={linkedSources}
          evidenceRows={linkedEvidenceRows}
          evidencePreviewTitle="Representative evidence"
          caveat="This page surfaces stored edge-level evidence. It is the same evidence used in the graph edge trail, inline here."
          inferenceType={linked.length > 0 ? linked[0].edge.inferenceType : "hybrid"}
        />
      </section>

      <section className="mb-10">
        <SectionTitle subtitle="Sorted by composite link strength. Click a song to inspect the evidence trail.">
          Direct lyric evidence ({linked.length})
        </SectionTitle>
        <ul className="card divide-y divide-ink-800/60 overflow-hidden">
          {linked.length === 0 ? (
            <li className="p-5 text-sm text-ink-500">
              No songs in this corpus mention the event by name. The pre-event signal resonance section below
              shows how chart mood drifted before the event, even without direct links.
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
                <div className="mt-2 ml-11">
                  <BecauseCard
                    claim={`${row.title} → ${event.name}`}
                    reasons={[
                      row.edge.explanation
                        ? row.edge.explanation
                        : "This link is inferred from temporal overlap and lyric/signal alignment as verification evidence.",
                      `${row.edge.edgeType.replace(/_/g, " ")} with ${(row.edge.weight * 100).toFixed(0)}% link weight.`,
                      `Confidence ${(row.edge.confidence * 100).toFixed(0)}%.`,
                    ]}
                    confidence={row.edge.confidence}
                    provenanceSources={Array.from(new Set([row.edge.sourceApi, ...row.evidence.map((e) => e.source)]))}
                    evidenceRows={row.evidence.map((e) => ({
                      id: e.id,
                      title: e.evidenceType.replace(/_/g, " "),
                      text: e.value,
                      source: e.source,
                      confidence: e.confidence,
                      matchedTerms: row.edge.matchedTerms,
                    }))}
                    evidencePreviewTitle="Why this song connects"
                    inferenceType={row.edge.inferenceType}
                    caveat={row.evidence.length > 0
                      ? "Direct lyric snippets can be seen in each evidence row and matched terms are highlighted when present."
                      : "This edge has no expanded evidence rows yet; the verification remains graph-derived and source-backed."}
                  />
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Event lead analysis (P2.3) — signals that were already shifting before the event */}
      {lead && lead.leadSignals.length > 0 ? (
        <section className="mb-10">
          <SectionTitle
            subtitle={
              `Signals already elevated in the chart year before this event (${lead.preEventYear}). ` +
              `lead = same direction during event, drift = opposite direction, ambient = pre-event only.`
            }
          >
            What the chart was already saying
            {lead.totalCorrelatedSignals > 1 ? (
              <span className="ml-2 text-xs font-normal text-ink-400">
                · {(lead.leadSignalRate * 100).toFixed(0)}% resonance rate
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
              Of {lead.totalCorrelatedSignals} signals correlated with this event,
              {" "}{lead.preElevatedSignals} were already elevated in {lead.preEventYear} and
              moved in the same direction during the event itself. This is a
              pre-event <em>resonance</em>, not a prediction — chart signals were
              shifting in the same direction the year before the event.
            </p>
          ) : lead.preElevatedSignals > 0 ? (
            <p className="mt-3 text-xs text-ink-500">
              <span className="text-ink-300 font-medium">Partial pre-event shift.</span>{" "}
              {lead.preElevatedSignals} signal{lead.preElevatedSignals === 1 ? " was" : "s were"}
              {" "}elevated in {lead.preEventYear} but moved in the opposite direction
              during the event (labelled &quot;drift&quot;). The chart shifted, but not in
              a way that anticipated this event.
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-500">
              <span className="text-ink-300 font-medium">No pre-event shift.</span>{" "}
              None of the {lead.totalCorrelatedSignals || "signals"} correlated
              with this event were elevated in {lead.preEventYear}. The chart&apos;s
              shift was synchronous with the event itself.
            </p>
          )}
          {lead.leadSignals.length > 0 ? (
            <p className="mt-1 text-xs text-ink-600">
              Caveat: this is computed on {lead.totalCorrelatedSignals} signal{lead.totalCorrelatedSignals === 1 ? "" : "s"} in a
              single pre-event year window — small samples, exploratory only.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Event signal decay (P2.3) — how long the event's signal persisted */}
      {decay.length > 1 ? (
        <section className="mb-10">
          <SectionTitle subtitle="How the post-event signal changed over subsequent chart years.">
            How long the echo lasted
          </SectionTitle>
          <div className="card divide-y divide-ink-800/60 overflow-hidden">
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

      {articles.length > 0 ? (
        <section className="mb-10">
          <SectionTitle subtitle="Curated background articles that explain the context.">
            Context articles ({articles.length})
          </SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {articles.slice(0, 2).map((article) => (
              <article key={article.id} className="card p-4">
                <p className="text-xs uppercase tracking-wider text-ink-500">{article.source}</p>
                <a
                  href={article.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-sm font-medium text-ink-100 hover:text-signal-300"
                >
                  {article.title}
                </a>
                {article.publishedAt ? (
                  <p className="mt-1 text-xs text-ink-500">{article.publishedAt}</p>
                ) : null}
                {article.summary ? (
                  <p className="mt-2 text-sm leading-6 text-ink-300">{article.summary}</p>
                ) : null}
              </article>
            ))}
          </div>
          {articles.length > 2 ? (
            <div className="mt-3">
              <Link
                href={`/event/${encodeURIComponent(event.id)}/articles${locale !== "en" ? `?lang=${locale}` : ""}`}
                className="text-sm font-medium text-signal-200 hover:text-signal-100"
              >
                View all {articles.length} articles
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <SectionTitle>Try this context in the graph explorer</SectionTitle>
        <div className="card p-6">
          <p className="mb-4 text-sm text-ink-300">
            The graph view will center on this context node, show all songs linked to it, and reveal
            the themes and entities that drove each connection.
          </p>
          <Link
            href={`/graph?rootType=event&rootId=versesignal:n:event:${event.id}`}
            className="inline-block rounded-lg bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
          >
            Open in meaning graph →
          </Link>
        <Link
          href={`/event/${encodeURIComponent(event.id)}/articles${locale !== "en" ? `?lang=${locale}` : ""}`}
          className="ml-3 inline-block rounded-lg border border-ink-700 bg-ink-800/60 px-5 py-2.5 text-sm font-medium text-ink-100 transition hover:border-ink-600 hover:bg-ink-800"
        >
            {t(locale, "event.articles")}
          </Link>
        </div>
      </section>
    
      <StoryNextStep />
    </main>
  );
}
