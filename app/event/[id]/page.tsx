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
  const linkedSpotlight = linked.slice(0, 6);
  const decayMini = decay.slice(0, 6);

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
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-6rem] top-0 h-72 w-72 rounded-full bg-signal-500/12 blur-3xl" />
          <div className="absolute right-[-6rem] top-20 h-80 w-80 rounded-full bg-echo-500/12 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
        </div>
        <div className="relative grid gap-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-start">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Pill variant="echo">Event Lens</Pill>
              <Pill variant="mute">{event.category}</Pill>
              <Pill variant="mute">{event.startDate} → {event.endDate ?? "present"}</Pill>
              <Pill variant="warn">evidence trial</Pill>
            </div>
            <h1 className="h-display mt-5 text-4xl leading-[0.95] text-balance text-ink-50 md:text-5xl lg:text-6xl">
              {event.name}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-pretty text-ink-300 md:text-base">
              {event.description} Start by checking the strongest direct songs, then compare them against the weaker signal classes so the page stays skeptical.
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
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "direct", value: String(directEvidenceCount), color: "bg-signal-400" },
                { label: "lead rate", value: leadRate !== null ? `${leadRate}%` : "n/a", color: "bg-emerald-400" },
                { label: "decay", value: `${decay.length}`, color: "bg-amber-400" },
                { label: "articles", value: String(articles.length), color: "bg-ink-400" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-[1.4rem] border border-ink-800 bg-ink-950/55 p-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{stat.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-50">{stat.value}</p>
                  <div className="mt-3 h-1 rounded-full bg-ink-900">
                    <div className={`h-full rounded-full ${stat.color}`} style={{ width: stat.label === "lead rate" && leadRate !== null ? `${leadRate}%` : stat.label === "decay" ? `${Math.min(100, decay.length * 18)}%` : `${Math.min(100, Math.max(20, directEvidenceCount * 18))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[2rem] border border-ink-800 bg-ink-950/65 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.26em] text-ink-500">evidence taxonomy</p>
                <Pill variant={linked.length > 0 ? "signal" : "warn"}>{linked.length > 0 ? "live" : "empty"}</Pill>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Direct", value: "named in lyrics", tone: "signal" },
                  { label: "Temporal", value: "same-year resonance", tone: "echo" },
                  { label: "Echo", value: "theme or mood alignment", tone: "mute" },
                  { label: "Reject", value: "too weak to call", tone: "warn" },
                ].map((tier) => (
                  <div key={tier.label} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{tier.label}</p>
                    <p className="mt-2 text-sm leading-6 text-ink-300">{tier.value}</p>
                    <div className="mt-3 h-1 rounded-full bg-ink-900">
                      <div className={`h-full rounded-full ${tier.tone === "signal" ? "bg-signal-400" : tier.tone === "echo" ? "bg-emerald-400" : tier.tone === "warn" ? "bg-amber-400" : "bg-ink-500"}`} style={{ width: tier.label === "Reject" ? "28%" : tier.label === "Temporal" ? "68%" : "84%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5">
              <p className="text-[10px] uppercase tracking-[0.26em] text-ink-500">timeline strip</p>
              <div className="mt-4 flex items-end gap-2">
                {decayMini.length > 0 ? (
                  decayMini.map((d) => (
                    <div key={d.year} className="flex-1">
                      <div className="flex h-28 items-end gap-1 rounded-2xl border border-ink-800 bg-ink-900/50 px-2 py-2">
                        {Object.entries(d.postureCounts)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 4)
                          .map(([posture, count]) => (
                            <div
                              key={posture}
                              className="flex-1 rounded-t-md bg-signal-400/70"
                              style={{ height: `${Math.max(18, count * 18)}%` }}
                              title={`${posture}: ${count}`}
                            />
                          ))}
                      </div>
                      <p className="mt-2 text-center text-[10px] text-ink-500">{d.year}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-ink-800 bg-ink-900/30 p-4 text-sm text-ink-500">
                    No decay data yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
          <SectionTitle subtitle="The strongest songs rise first, then the edge evidence tells you why.">Song matches</SectionTitle>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {linkedSpotlight.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-ink-800 bg-ink-900/30 p-5 text-sm text-ink-500">
                No songs in this corpus mention the event by name. That absence is still useful signal.
              </div>
            ) : (
              linkedSpotlight.map((row) => (
                <div key={row.edge.id} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/55 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/song/${encodeURIComponent(row.songId)}`} className="block truncate text-sm font-medium text-ink-100 hover:text-signal-300">
                        {row.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
                        <span>{row.artist}</span>
                        <span>·</span>
                        <span>{row.year}</span>
                      </div>
                    </div>
                    <Pill variant={row.evidence.length > 0 ? "signal" : "warn"}>{row.evidence.length} rows</Pill>
                  </div>
                  <div className="mt-3">
                    <ConfidenceBar value={row.edge.weight} />
                    <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
                      <span>{(row.edge.confidence * 100).toFixed(0)}% confidence</span>
                      <span>{(row.edge.weight * 100).toFixed(0)}% weight</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink-300">
                    {row.edge.explanation ?? "Graph-derived relationship with stored evidence."}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
          <SectionTitle subtitle="This is the part that should feel like discovery, not documentation.">Why it connects</SectionTitle>
          <div className="mt-4 space-y-3">
            {linkedSpotlight.length === 0 ? (
              <p className="text-sm text-ink-500">No edge evidence is available yet.</p>
            ) : (
              linkedSpotlight.map((row) => {
                const evidenceRows = row.evidence.map<EvidencePreviewItem>((ev) => ({
                  id: ev.id,
                  title: ev.evidenceType.replace(/_/g, " "),
                  text: ev.value,
                  source: ev.source,
                  confidence: ev.confidence,
                  matchedTerms: ev.evidenceType === "matched_term" ? [ev.value] : [],
                }));
                return (
                  <div key={row.edge.id} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/55 p-4">
                    <BecauseCard
                      claim={`${row.title} → ${event.name}`}
                      reasons={[
                        row.edge.explanation ?? "Connection is inferred from song-event linkage.",
                        `Weight ${(row.edge.weight * 100).toFixed(0)}%.`,
                        `Confidence ${(row.edge.confidence * 100).toFixed(0)}%.`,
                      ]}
                      confidence={row.edge.confidence}
                      provenanceSources={Array.from(new Set([row.edge.sourceApi, ...row.evidence.map((e) => e.source)]))}
                      evidenceRows={evidenceRows}
                      evidencePreviewTitle="Representative evidence"
                      caveat={row.evidence.length > 0
                        ? "This is the edge trail, not a claim of intent."
                        : "No expanded evidence rows are stored for this edge yet."}
                      inferenceType={row.edge.inferenceType}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
          <SectionTitle subtitle="Signals already elevated before the event stay visible.">Before / during / after</SectionTitle>
          {lead && lead.leadSignals.length > 0 ? (
            <div className="mt-4 space-y-2">
              {lead.leadSignals.slice(0, 8).map((s, i) => (
                <div key={`${s.signalType}:${s.signal}`} className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 p-3 text-sm">
                  <span className="w-6 text-xs text-ink-500">{i + 1}.</span>
                  {s.directionallyConsistent ? <Pill variant="echo">lead</Pill> : s.correlatedDuringEvent ? <Pill variant="warn">drift</Pill> : <Pill variant="mute">ambient</Pill>}
                  <span className="flex-1 truncate text-ink-100">{s.signal}</span>
                  <span className="text-xs text-ink-500">pre{s.delta > 0 ? "+" : ""}{s.delta.toFixed(1)}</span>
                </div>
              ))}
              <p className="mt-3 text-xs text-ink-500">
                {leadRate !== null ? `${leadRate}% of correlated signals were already elevated before ${event.name}.` : "No pre-event signal window was available."}
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-[1.4rem] border border-dashed border-ink-800 bg-ink-900/30 p-5 text-sm text-ink-500">
              No pre-event shift detected.
            </div>
          )}
        </div>

        <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
          <SectionTitle subtitle="Curated background material for the event.">Context articles</SectionTitle>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {articles.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-ink-800 bg-ink-900/30 p-5 text-sm text-ink-500">
                No context articles are attached yet.
              </div>
            ) : (
              articles.slice(0, 4).map((article) => (
                <article key={article.id} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{article.source}</p>
                  <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-medium text-ink-100 hover:text-signal-300">
                    {article.title}
                  </a>
                  {article.summary ? <p className="mt-2 text-sm leading-6 text-ink-400 line-clamp-3">{article.summary}</p> : null}
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-8">
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
      <section>
        <SectionTitle subtitle="The event lens should feel like a control room, not a paper trail.">
          Graph / articles / next step
        </SectionTitle>
        <div className="grid gap-4 lg:grid-cols-[1fr_0.92fr]">
          <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/graph?rootType=event&rootId=versesignal:n:event:${event.id}`}
                className="rounded-full bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
              >
                Open in meaning graph →
              </Link>
              <Link
                href={`/event/${encodeURIComponent(event.id)}/articles${locale !== "en" ? `?lang=${locale}` : ""}`}
                className="rounded-full border border-ink-700 bg-ink-900/60 px-5 py-2.5 text-sm font-medium text-ink-100 transition hover:border-ink-600 hover:bg-ink-800"
              >
                {t(locale, "event.articles")}
              </Link>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink-400">
              The graph centers this event node and shows the song, theme, and evidence bridges around it.
            </p>
          </div>
          <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
            <p className="text-[10px] uppercase tracking-[0.26em] text-ink-500">signal caveat</p>
            <p className="mt-3 text-sm leading-6 text-ink-300">
              Direct lyric matches, pre-event lead, and post-event decay are separated on purpose. Weak matches stay in the taxonomy instead of being sold as proof.
            </p>
          </div>
        </div>
      </section>

      <StoryNextStep />
    </main>
  );
}
