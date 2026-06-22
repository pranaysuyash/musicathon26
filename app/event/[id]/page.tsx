import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getEventById, getAllEvents, getSongsForEvent, getEventSignalDecay, getEventLeadAnalysis, getEventArticles, REGION_LABELS } from "@/lib/db/queries";
import { t, resolveLocale } from "@/lib/i18n/strings";
import { initDb } from "@/lib/db";
import { Pill, SectionTitle } from "@/components/ui/primitives";
import { StoryNextStep } from "@/components/story/story-next-step";
import { THEME_LABELS, THEME_COLORS } from "@/lib/nlp/theme-scoring";
import type { Theme } from "@/lib/types";
import { EventHero } from "@/components/event/event-hero";
import { EvidenceTabs } from "@/components/event/evidence-tabs";
import { EvidenceRankedSongList } from "@/components/event/evidence-ranked-song-list";
import { CovidSkepticismPanel } from "@/components/evidence/weak-match-warning";
import { EventGraphPreview } from "@/components/event/event-graph-preview";
import { WorldResponsePanel } from "@/components/event/world-response";
import { EventVerdictPanel } from "@/components/event/event-verdict-panel";
import {
  normalizeEvidence,
  deriveUiEvidenceType,
  deriveUiConfidence,
  buildCaveat,
} from "@/lib/evidence/classifyEvidence";
import { UI_EVIDENCE_LABELS, type SongEventConnection, type UiEvidenceType } from "@/lib/evidence/types";

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

export const dynamic = "force-dynamic";

export default function EventPage({ params, searchParams }: { params: { id: string }; searchParams: { lang?: string; tab?: UiEvidenceType } }) {
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
  const isCovid = event.name.toLowerCase().includes("covid");

  const connections: SongEventConnection[] = linked.map((row) => {
    const evidence = row.evidence.map((ev) =>
      normalizeEvidence(
        {
          id: ev.id,
          edgeId: ev.edgeId,
          evidenceType: ev.evidenceType,
          value: ev.value,
          source: ev.source,
          confidence: ev.confidence,
        },
        event.id
      )
    );
    const matchedTerms = row.edge.matchedTerms ?? evidence.flatMap((e) => e.matchedTerms ?? []);
    const uiEvidenceType = deriveUiEvidenceType(
      {
        inferenceType: row.edge.inferenceType,
        edgeType: row.edge.edgeType,
        matchedTerms,
      },
      evidence,
      event.id
    );
    const uiConfidence = deriveUiConfidence(uiEvidenceType, row.edge.confidence, evidence);
    const caveat = buildCaveat(uiEvidenceType, uiConfidence, matchedTerms, event.id);

    return {
      songId: row.songId,
      songTitle: row.title,
      songArtist: row.artist,
      songYear: row.year,
      eventId: event.id,
      eventName: event.name,
      edgeId: row.edge.id,
      edgeWeight: row.edge.weight,
      edgeConfidence: row.edge.confidence,
      inferenceType: row.edge.inferenceType,
      uiEvidenceType,
      uiConfidence,
      explanation: row.edge.explanation ?? "Graph-derived song-event relationship.",
      caveat,
      evidence,
      matchedTerms,
    };
  });

  const activeTab: UiEvidenceType | "all" = searchParams.tab ?? "all";
  const filteredConnections =
    activeTab === "all"
      ? connections
      : connections.filter((c) => c.uiEvidenceType === activeTab);

  const counts: Record<UiEvidenceType | "all", number> = {
    all: connections.length,
    direct_lyric: 0,
    event_entity: 0,
    semantic_theme: 0,
    temporal_only: 0,
    external_confirmation: 0,
    weak_noisy: 0,
    rejected: 0,
  };
  for (const c of connections) {
    counts[c.uiEvidenceType]++;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <EventHero
        name={event.name}
        category={event.category}
        startDate={event.startDate}
        endDate={event.endDate}
        regions={event.regions.map((r) => REGION_LABELS[r] ?? r)}
        description={event.description}
        relatedThemes={event.relatedThemes.map((theme) => ({
          label: THEME_LABELS[theme as Theme] ?? theme,
          color: THEME_COLORS[theme as Theme] ?? "#94a3b8",
        }))}
      />

      {isCovid ? <CovidSkepticismPanel /> : null}

      <EventVerdictPanel
        eventName={event.name}
        counts={counts}
        directSongs={connections
          .filter((c) => c.uiEvidenceType === "direct_lyric" || c.uiEvidenceType === "external_confirmation")
          .slice(0, 5)
          .map((c) => ({ songId: c.songId, title: c.songTitle, artist: c.songArtist }))}
        weakSongs={connections
          .filter((c) => c.uiEvidenceType === "weak_noisy" || c.uiEvidenceType === "rejected")
          .slice(0, 3)
          .map((c) => ({ songId: c.songId, title: c.songTitle, artist: c.songArtist }))}
        isCovid={isCovid}
      />

      <section className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Song matches by evidence class</p>
            <h2 className="h-display mt-2 text-2xl md:text-3xl">
              {activeTab === "all" ? "All connections" : `${UI_EVIDENCE_LABELS[activeTab].label} matches`}
            </h2>
            <p className="mt-2 text-sm text-ink-400">
              {counts.direct_lyric} direct lyric · {counts.event_entity} entity · {counts.semantic_theme} semantic · {counts.temporal_only} temporal · {counts.weak_noisy} weak/noisy · {counts.rejected} rejected
            </p>
          </div>
        </div>
        <EvidenceTabs active={activeTab} counts={counts} eventId={event.id} />
        <div className="mt-5">
          <EvidenceRankedSongList connections={filteredConnections} eventName={event.name} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <EventGraphPreview eventId={event.id} />
        <WorldResponsePanel regions={event.regions.map((r) => REGION_LABELS[r] ?? r)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
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
            </div>
          ) : (
            <div className="mt-4 rounded-[1.4rem] border border-dashed border-ink-800 bg-ink-900/30 p-5 text-sm text-ink-500">No pre-event shift detected.</div>
          )}
        </div>

        <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
          <SectionTitle subtitle="Curated background material for the event.">Context articles</SectionTitle>
          <div className="mt-4 grid gap-3">
            {articles.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-ink-800 bg-ink-900/30 p-5 text-sm text-ink-500">No context articles are attached yet.</div>
            ) : (
              articles.slice(0, 4).map((article) => (
                <article key={article.id} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{article.source}</p>
                  <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-medium text-ink-100 hover:text-signal-300">{article.title}</a>
                  {article.summary ? <p className="mt-2 text-sm leading-6 text-ink-400 line-clamp-3">{article.summary}</p> : null}
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <StoryNextStep />
    </main>
  );
}
