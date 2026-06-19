// Cultural Lens page (the "wow" surface).
//
// Per 1st principles + decision 0019 P1.5, this page is the
// primary entry point for the lyrics-first discovery flow.
// It answers:
//
//   "What were the charts saying in <year>?"
//
// The page is server-rendered. The first version shows:
//   1. Year signals (themes + moods + entities) with deltas
//   2. Linked events for the year
//   3. Top songs by signal density
//
// Future versions will add: cultural posture classifier,
// contradiction finder, auto-generated takeaway text, and
// region-aware globe overlays.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getYearSignals, getYearSignalTop, getSongsByYear, getEventsForYear, getSignalClusters, getCandidateContexts, getContradictions, getEchoingEvents, getPostureSummary, getEventCorrelations, getCulturalSignalBrief, getAllYears, REGION_LABELS, getDataHealth, getAnalogousYears, getSignalYearDistributions, getSongsByIds } from "@/lib/db/queries";
import { Pill } from "@/components/ui/primitives";
import { BecauseCard } from "@/components/evidence/because-card";
import { EvidencePreview } from "@/components/evidence/evidence-preview";
import { StoryNextStep } from "@/components/story/story-next-step";
import { TimelineScrubber } from "@/components/lens/timeline-scrubber";
import { RegionPicker } from "@/components/lens/region-picker";
import { DataHealthCard } from "@/components/lens/data-health";
import { AnalogousYearsSection } from "@/components/lens/analogous-years";
import { SignalYearDistribution } from "@/components/lens/signal-year-distribution";
import { YearInsightPlayer } from "@/components/lens/year-insight-player";
import { t, resolveLocale, localePairs, type Locale } from "@/lib/i18n/strings";
import type { EvidencePreviewItem } from "@/components/evidence/evidence-preview";
import type { Song } from "@/lib/types";

function buildLangPath(path: string, locale: Locale) {
  const hasQuery = path.includes("?");
  return locale === "en" ? path : `${path}${hasQuery ? "&" : "?"}lang=${locale}`;
}

export async function generateMetadata({
  params,
}: {
  params: { year: string };
}): Promise<Metadata> {
  const year = Number(params.year);
  if (!Number.isFinite(year)) return { title: "Year not found" };
  return {
    title: `${year} — Cultural lens`,
    description: `What the charts were saying in ${year}: top themes, moods, entities, and the events that surrounded them. Evidence-backed.`,
    openGraph: {
      images: [{ url: `/api/og?type=lens&title=${encodeURIComponent(`${year} Cultural Lens`)}&subtitle=${encodeURIComponent(`What the charts were saying in ${year}`)}`, width: 1200, height: 630 }],
    },
  };
}

export default async function LensPage({
  params,
  searchParams,
}: {
  params: { year: string };
  searchParams: { region?: string; lang?: string };
}) {
  const year = Number(params.year);
  if (!Number.isFinite(year)) notFound();

  const locale = resolveLocale(searchParams.lang);
  const region = (searchParams.region ?? "US") in REGION_LABELS ? (searchParams.region ?? "US") : "US";
  const allYears = getAllYears(region);
  const dataHealth = getDataHealth();
  const analogous = getAnalogousYears(year, region, 3);
  const moodDistributions = getSignalYearDistributions("mood", region);
  const entityDistributions = getSignalYearDistributions("entity", region);
  const signals = getYearSignals(year, region, 60);
  const brief = await getCulturalSignalBrief(year, region);
  const songs = getSongsByYear(year, region, 100);
  const events = getEventsForYear(year, region);
  const eventCorrelations: Record<string, ReturnType<typeof getEventCorrelations>> = {};
  for (const ev of events) {
    eventCorrelations[ev.id] = getEventCorrelations(ev.id, year, 8);
  }
  const top = getYearSignalTop(year, region, 5);
  const clusters = getSignalClusters(year, region, 5);
  const contexts = getCandidateContexts(year, region, 5);
  const contradictions = getContradictions(year, 8, region);
  const echoes = getEchoingEvents(year, region);
  const postureSummary = getPostureSummary(year, region);
  const briefEvidenceSongIds = Array.from(new Set(brief.sections.flatMap((s) => s.evidenceSongIds)));
  const briefEvidenceSongs = getSongsByIds(briefEvidenceSongIds);
  const briefEvidenceSongById = new Map(briefEvidenceSongs.map((s) => [s.id, s] as const));
  const briefSourceApi = Array.from(new Set(top.map((s) => s.sourceApi)));

  // Group signals by type
  const themes = signals.filter((s) => s.signalType === "theme").slice(0, 8);
  const moods = signals.filter((s) => s.signalType === "mood").slice(0, 8);
  const entities = signals.filter((s) => s.signalType === "entity").slice(0, 12);

  // "The takeaway" — auto-generated text from the top signals
  const takeaway = buildTakeaway(year, top, events);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => {
          const href = buildLangPath(`/lens/${year}?region=${region}`, code);
          return (
            <a
              key={code}
              href={href}
              className={`rounded-full border px-2.5 py-1 transition ${
                locale === code
                  ? "border-signal-300 bg-signal-300/10 text-signal-200"
                  : "border-ink-700 text-ink-400 hover:border-signal-300/70 hover:text-signal-200"
              }`}
            >
              {t(locale, key)}
            </a>
          );
        })}
      </div>

      <Link
        href={buildLangPath(`/year/${year}`, locale)}
        className="text-xs text-ink-400 hover:text-ink-200"
      >
        ← {t(locale, "common.back")} {year} (raw year view)
      </Link>

      <header className="mt-4 mb-10">
        <div className="flex items-center gap-2">
          <Pill variant="signal">{t(locale, "lens.title")}</Pill>
          <Pill variant="mute">{REGION_LABELS[region] ?? region}</Pill>
          <RegionPicker currentRegion={region} currentYear={year} />
        </div>
        <h1 className="h-display mt-4 text-5xl font-semibold tracking-tight md:text-6xl text-balance">
          {year}
        </h1>
        <p className="mt-3 text-lg text-ink-300">
          {t(locale, "lens.subtitle")} {year}?
        </p>
        <div className="mt-6">
          <TimelineScrubber years={allYears} currentYear={year} />
        </div>
      </header>

      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          {t(locale, "lens.voice-title")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-400">
          {t(locale, "lens.voice-subtitle")} {REGION_LABELS[region] ?? region}.
        </p>
        <YearInsightPlayer year={year} region={region} />
      </section>

      <AnalogousYearsSection analogues={analogous} year={year} />

      {/* The Cultural Signal Brief — multi-section narrative */}
      <section className="mb-10 rounded-2xl border border-signal-700/40 bg-gradient-to-br from-signal-900/10 to-ink-900/40 p-6 md:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-signal-300">
          The cultural signal brief
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          A 6-paragraph narrative of what the charts were doing in {year}, evidence-backed.
        </p>
        <div className="mt-4">
          <BecauseCard
            claim={`Why the ${year} lens is not just a narrative`}
            reasons={[
              top.length > 0
                ? `Primary signal: ${top[0]?.signal ?? "mixed signals"} (${top[0]?.songCount ?? 0} songs, ${((top[0]?.score ?? 0) * 100).toFixed(0)}%).`
                : "Primary signal: data sparse in this year.",
              `${moods.length} mood, ${themes.length} theme, and ${entities.length} entity tracks anchor this claim.`,
              events.length > 0 ? `${events.length} curated event(s) overlap this year.` : "No curated event overlap was detected for this year.",
              postureSummary.length > 0
                ? `${postureSummary.reduce((acc, item) => acc + item.songCount, 0)} song-event classification records are tied to this year's posture model.`
                : "Posture data is not available for this year.",
            ]}
            confidence={top[0]?.score ?? 0.54}
            provenanceSources={briefSourceApi.length > 0 ? briefSourceApi : ["billboard"]}
            evidenceRows={briefEvidenceSongs
              .slice(0, 3)
              .map<EvidencePreviewItem>((song) => ({
                id: song.id,
                title: "Representative song",
                text: `${song.title} — ${song.artist} (${song.year})`,
                source: "chart_entry",
                matchedTerms: [],
              }))}
            evidencePreviewTitle="Representative songs"
            caveat="Inference is aggregate signal inference, not a single direct source quote."
            inferenceType={top.length > 0 ? "hybrid" : undefined}
          />
        </div>
        <ol className="mt-6 space-y-6">
          {brief.sections.map((s, i) => (
            <li key={i} className="border-l-2 border-signal-500/40 pl-5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-signal-500/20 text-[11px] font-semibold text-signal-300">
                  {i + 1}
                </span>
                <h3 className="text-base font-semibold text-ink-100">{s.heading}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-200">
                {s.body}
              </p>
              {s.evidenceSongIds.length > 0 ? (
                <div className="mt-3">
                  <BecauseCard
                    claim={s.heading}
                    reasons={splitReasonsFromBriefBody(s.body)}
                    confidence={Math.min(0.95, 0.3 + Math.min(0.6, s.evidenceSongIds.length / 12))}
                    provenanceSources={[inferSectionEvidenceSource(s.heading), "chart_entry"]}
                    evidenceRows={s.evidenceSongIds
                      .slice(0, 3)
                      .map((songId) => {
                        const song = briefEvidenceSongById.get(songId);
                        if (!song) return null;
                        return {
                          id: song.id,
                          title: "Song evidence",
                          text: `${song.title} — ${song.artist} (${song.year})`,
                          source: inferSectionEvidenceSource(s.heading),
                          confidence: Math.max(0.2, Math.min(0.98, 1 - song.chartRank / 100)),
                          matchedTerms: [],
                        } as EvidencePreviewItem;
                      })
                      .filter((r): r is EvidencePreviewItem => Boolean(r))}
                    evidencePreviewTitle="Representative songs"
                  />
                </div>
              ) : (
                <EvidencePreview
                  title="Evidence"
                  items={[]}
                  maxItems={1}
                />
              )}
              {s.evidenceSongIds.length > 0 ? (
                <p className="mt-1.5 text-[10px] text-ink-500">
                  Songs cited: {s.evidenceSongIds.slice(0, 3).map((id) => id.split(":").pop()?.split("-").slice(0, 2).join(" ")).filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-6 border-t border-signal-700/30 pt-4 text-[10px] text-ink-500">
          {brief.methodNote} Generated at {brief.generatedAt}.
        </p>
      </section>

      {/* Top signals with deltas */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          The chart signal profile
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-400">
          {signals.length} signals, ranked by mean score across {songs.length} chart songs.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SignalColumn title="Moods" signals={moods} kind="mood" currentYear={year} distributions={moodDistributions} />
          <SignalColumn title="Themes" signals={themes} kind="theme" currentYear={year} />
          <SignalColumn title="Entities" signals={entities} kind="entity" currentYear={year} distributions={entityDistributions} />
        </div>
      </section>

      {/* Events for the year */}
      {events.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            What was happening in the world
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-400">
            {events.length} curated world event(s) with a temporal overlap to {year}.
          </p>
          <ul className="space-y-2">
            {events.map((ev) => {
              const corr = eventCorrelations[ev.id] ?? [];
              return (
              <li
                key={ev.id}
                className="card p-4 hover:border-ink-600"
              >
                <Link href={`/event/${encodeURIComponent(ev.id)}`} className="block">
                  <div className="flex items-center gap-2">
                    <Pill variant="echo">{ev.category}</Pill>
                    <h3 className="font-medium text-ink-100">{ev.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {ev.startDate} – {ev.endDate ?? "ongoing"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(ev as { regions?: string[] }).regions?.map((r: string) => (
                      <Pill key={r} variant="mute">{r}</Pill>
                    ))}
                  </div>
                </Link>
                {corr.length > 0 ? (
                  <div className="mt-3 border-t border-ink-800 pt-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-500">
                      What shifted during this event (vs prior 3-yr baseline)
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {corr.slice(0, 5).map((c) => {
                        const pct = c.delta * 100;
                        const positive = c.delta >= 0;
                        return (
                          <li key={c.id} className="flex items-center justify-between text-xs">
                            <span className="truncate text-ink-300">
                              <span className="text-ink-500">{c.signalType}:</span>{" "}
                              {c.signal}
                            </span>
                            <span
                              className={`tabular-nums font-medium ${
                                positive ? "text-signal-300" : "text-warn-400"
                              }`}
                              title={`Baseline ${c.baselineMean.toFixed(2)} → ${c.eventPeriodScore.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`}
                            >
                              {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Echoing events — past events whose signals still resonate (P2.3) */}
      {echoes.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Echoes of the past
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-400">
            Songs from {year} still carry the signal of {echoes.length} past event{echoes.length === 1 ? "" : "s"}.
            The cultural resonance doesn&apos;t stop when the news cycle moves on.
          </p>
          <div className="card divide-y divide-ink-800/60">
            {echoes.map((e) => (
              <div key={e.eventId} className="flex items-center gap-3 p-3 text-sm">
                <Link
                  href={`/event/${encodeURIComponent(e.eventId)}`}
                  className="flex-1 truncate text-ink-100 hover:text-signal-300"
                >
                  {e.eventName}
                </Link>
                <span className="text-xs text-ink-500">
                  {year - e.eventStartYear}yr later
                </span>
                <span className="text-xs text-ink-500">
                  {e.songCount} songs
                </span>
                <Pill variant="echo">{e.dominantPosture}</Pill>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Signal clusters (P1.2) + Candidate contexts (P1.3) */}
      {clusters.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Signal clusters
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-400">
            {clusters.length} co-occurrence cluster{clusters.length === 1 ? "" : "s"} found
            in {year} (Jaccard ≥ 0.20, overlap ≥ 2 songs).
          </p>
          <div className="space-y-3">
            {clusters.map((cl) => {
              const ctx = contexts.find((c) => c.clusterId === cl.id);
              return (
              <div key={cl.id} className="card p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-ink-100">
                    {cl.signalCount}-signal cluster
                  </h3>
                  <Pill variant="mute">
                    {cl.songCount} {cl.songCount === 1 ? "song" : "songs"}
                  </Pill>
                  {ctx?.dominantPosture ? (
                    <Pill variant="echo">{ctx.dominantPosture}</Pill>
                  ) : null}
                  {ctx?.crossYearType ? (
                    <span className="text-[10px] text-ink-500 capitalize">{ctx.crossYearType}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-ink-400 break-words">
                  {cl.signals.map((s) => `${s.type}:${s.signal}`).join(" + ")}
                </p>
                {ctx ? (
                  <div className="mt-3 border-t border-ink-800 pt-3">
                    <p className="text-sm leading-relaxed text-ink-200">
                      {ctx.explanation}
                    </p>
                    {ctx.comparativeSignals && ctx.comparativeSignals.length > 0 ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] text-ink-500 hover:text-ink-300">
                          Signal lift vs year baseline ({ctx.comparativeSignals.length} signals)
                        </summary>
                        <ul className="mt-1.5 space-y-0.5 pl-2">
                          {ctx.comparativeSignals.map((cs, i) => (
                            <li key={i} className="flex items-center gap-2 text-[11px]">
                              <span className="text-ink-400">{cs.type}:</span>
                              <span className="text-ink-200">{cs.signal}</span>
                              {cs.lift != null ? (
                                <span className={`tabular-nums font-medium ${
                                  cs.lift > 1.5 ? "text-signal-300" : cs.lift < 0.5 ? "text-warn-400" : "text-ink-500"
                                }`}>
                                  {cs.lift.toFixed(1)}x vs year baseline
                                </span>
                              ) : (
                                <span className="text-ink-600">no baseline</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Cultural posture (P1.4) */}
      {postureSummary.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            How did chart music relate to the events?
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-400">
            Cultural posture: how each (song, event) pair relates.{" "}
            {postureSummary.reduce((s, p) => s + p.songCount, 0)} classifications across
            {" "}
            {events.length} event{events.length === 1 ? "" : "s"} in {year}.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {postureSummary.map((p) => (
              <div
                key={p.posture}
                className="card flex items-center justify-between p-3"
              >
                <div>
                  <div className="text-sm font-medium capitalize text-ink-100">
                    {p.posture}
                  </div>
                  <div className="text-xs text-ink-500">
                    {p.songCount} {p.songCount === 1 ? "song" : "songs"}
                  </div>
                </div>
                <div className="text-2xl font-semibold tabular-nums text-ink-300">
                  {p.songCount}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Contradiction finder — songs that stood against the cultural current */}
      {contradictions.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Who stood against the current
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-400">
            {contradictions.length} song{contradictions.length === 1 ? "" : "s"} that went against the cultural
            gravity of {year} — refusing the dominant posture of their moment.
          </p>
          <div className="space-y-2">
            {contradictions.map((c) => (
              <div key={`${c.songId}-${c.eventId}`} className="card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/song/${encodeURIComponent(c.songId)}`}
                      className="font-medium text-ink-100 hover:text-signal-300"
                    >
                      {c.songTitle} — {c.artist}
                    </Link>
                    <div className="mt-0.5 text-xs text-ink-500">
                      against <Link href={`/event/${encodeURIComponent(c.eventId)}`}
                        className="text-ink-400 hover:text-signal-300">{c.eventName}</Link>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
                      {c.description}
                    </p>
                  </div>
                  <Pill variant="echo">{c.posture}</Pill>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Open the full graph for this lens year
        </h2>
        <div className="card p-5">
          <p className="mb-3 text-sm text-ink-300">
            Dive from this lens summary into the neighborhood graph: songs, themes, moods, entities, and linked events
            for {year}. Use this as your next step to inspect edge-level evidence.
          </p>
          <Link
            href={`/graph?rootType=year&rootId=versesignal:n:year:${year}`}
            className="inline-block rounded-lg bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
          >
            Open {year} graph →
          </Link>
        </div>
      </section>

      {/* Top songs by chart rank */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          The chart spine
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-400">
          The top {Math.min(100, songs.length)} songs that anchored the year.
        </p>
        <ol className="card divide-y divide-ink-800/60">
          {songs.slice(0, 100).map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="w-6 text-right font-semibold tabular-nums text-ink-500">
                {s.chartRank}
              </span>
              <Link
                href={`/song/${encodeURIComponent(s.id)}`}
                className="flex-1 truncate text-ink-100 hover:text-signal-300"
              >
                {s.title}{" "}
                <span className="text-ink-500">— {s.artist}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <StoryNextStep />
        </div>
        <DataHealthCard health={dataHealth} />
      </div>
    </main>
  );
}

function SignalColumn({
  title,
  signals,
  kind,
  currentYear,
  distributions,
}: {
  title: string;
  signals: ReturnType<typeof getYearSignals>;
  kind: "mood" | "theme" | "entity";
  currentYear: number;
  distributions?: Map<string, { year: number; score: number; songCount: number }[]>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink-200">{title}</h3>
      {signals.length === 0 ? (
        <p className="text-xs text-ink-500">No data.</p>
      ) : (
        <ul className="space-y-1.5">
          {signals.map((s) => {
            const delta = s.deltaVsBaseline;
            const deltaPct =
              delta != null ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(0)}%` : "—";
            const positive = delta != null && delta >= 0;
            const dist = distributions?.get(s.signal);
            return (
              <li
                key={`${s.signalType}-${s.signal}`}
                className="rounded border border-ink-800 bg-ink-900/40 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  {kind === "theme" ? (
                    <Link href={`/theme/${s.signal}`} className="truncate text-ink-100 hover:text-signal-300">
                      {s.signal}
                    </Link>
                  ) : (
                    <span className="truncate text-ink-100">{s.signal}</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className="text-ink-500">
                      {s.songCount} {s.songCount === 1 ? "song" : "songs"}
                    </span>
                    <span
                      className={`tabular-nums ${
                        delta == null
                          ? "text-ink-600"
                          : positive
                          ? "text-signal-300"
                          : "text-warn-400"
                      }`}
                      title={
                        delta == null
                          ? "No baseline yet"
                          : `${(delta * 100).toFixed(1)}% vs 3-yr baseline`
                      }
                    >
                      {deltaPct}
                    </span>
                  </span>
                </div>
                {dist && dist.length > 1 ? (
                  <SignalYearDistribution signal={s.signal} signalType={s.signalType} currentYear={currentYear} years={dist} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function buildTakeaway(
  year: number,
  top: ReturnType<typeof getYearSignalTop>,
  events: ReturnType<typeof getEventsForYear>
): string {
  if (top.length === 0) {
    return `In ${year}, the chart signal profile had no data. Re-run scripts/build-year-signal-profiles.py.`;
  }
  const lines: string[] = [];
  const strongest = top[0];
  const arrow = strongest.deltaVsBaseline != null
    ? strongest.deltaVsBaseline >= 0
      ? "rose"
      : "fell"
    : "shaped";
  lines.push(
    `In ${year}, the mood "${strongest.signal}" ${arrow} ${
      strongest.deltaVsBaseline != null
        ? `${Math.abs(strongest.deltaVsBaseline * 100).toFixed(0)}% vs the prior 3-year baseline`
        : "vs the prior 3-year baseline"
    } (${strongest.songCount} chart songs).`
  );
  if (events.length > 0) {
    lines.push(
      ` The world was experiencing: ${events.map((e) => e.name).join("; ")}.`
    );
  }
  if (top.length >= 2) {
    const second = top[1];
    lines.push(
      ` Also strong: "${second.signal}" (${second.songCount} songs, ${
        second.deltaVsBaseline != null
          ? `${(second.deltaVsBaseline * 100).toFixed(0)}% vs baseline`
          : "no baseline"
      }).`
    );
  }
  return lines.join("");
}

function splitReasonsFromBriefBody(body: string): string[] {
  return body
    .split(/[.!?]\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => `${line}.`);
}

function inferSectionEvidenceSource(heading: string): string {
  const key = heading.toLowerCase();
  if (key.includes("emotional") || key.includes("weather")) return "mood_scores";
  if (key.includes("lyric")) return "lyric_line";
  if (key.includes("theme")) return "theme_scores";
  if (key.includes("name") || key.includes("entity") || key.includes("person") || key.includes("place")) return "gliner";
  if (key.includes("mood")) return "mood_scores";
  if (key.includes("event") || key.includes("posture") || key.includes("shift")) return "hybrid";
  return "chart_entry";
}
