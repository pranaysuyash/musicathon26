import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { getAllEvents, getAllYears, getEraOverview, getYearSignals } from "@/lib/db/queries";
import { HomeHero } from "@/components/home/home-hero";
import { ExplorationLensGrid } from "@/components/home/exploration-lens-grid";
import { FeaturedSignalStory } from "@/components/home/featured-signal-story";
import { EvidenceQualityPreview } from "@/components/home/evidence-quality-preview";
import { CompactEraTimeline } from "@/components/home/compact-era-timeline";
import { WorldLensPreview } from "@/components/home/world-lens-preview";
import { resolveLocale } from "@/lib/i18n/strings";
import { PathPanel } from "@/components/graph/path-panel";

export const metadata: Metadata = {
  title: "Songs, signals, and cultural context",
  description:
    "Explore how popular songs, lyrics, artists, moods, entities, and cultural contexts connect across 1960–2023.",
  openGraph: {
    images: [{ url: "/api/og?type=default", width: 1200, height: 630 }],
  },
};

export const dynamic = "force-dynamic";

export default function Home({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  initDb();
  const locale = resolveLocale(searchParams.lang);
  const events = getAllEvents();
  const yearCounts = getAllYears("US");
  const totalSongs = yearCounts.reduce((a, b) => a + b.songCount, 0);
  const eraOverview = getEraOverview("US");
  const seismographSignals = getYearSignals(2020, "US", 12)
    .filter((s) => s.signalType === "theme" || s.signalType === "mood" || s.signalType === "entity")
    .sort((a, b) => b.songCount - a.songCount)
    .slice(0, 6)
    .map((s) => ({
      signal: s.signal,
      score: s.score,
      songCount: s.songCount,
      signalType: s.signalType as "theme" | "mood" | "entity",
    }));

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <HomeHero
        locale={locale}
        totalSongs={totalSongs}
        yearCount={yearCounts.length}
        eventCount={events.length}
        signals={seismographSignals}
      />

      <section className="rounded-[2.25rem] border border-ink-800 bg-ink-950/45 p-5 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Live discovery</p>
            <h2 className="h-display mt-2 text-2xl md:text-3xl">Graph and globe, live</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-400">
              The app now exposes the real graph pathfinder and a world-lens preview, not a static description of them.
            </p>
          </div>
          <div className="rounded-full border border-ink-800 bg-ink-950/65 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-ink-500">
            interactive
          </div>
        </div>
        <div className="mt-5 grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <WorldLensPreview locale={locale} />
          <PathPanel
            initialFromId="versesignal:n:song:versesignal:2020:01:blinding-lights-the-weeknd"
            initialToId="versesignal:n:event:versesignal:ev:covid_19"
            initialAsk="Find a path from Blinding Lights to COVID-19"
          />
        </div>
      </section>

      <ExplorationLensGrid locale={locale} />

      <div className="grid gap-8 lg:grid-cols-2">
        <FeaturedSignalStory locale={locale} />
        <EvidenceQualityPreview />
      </div>

      <CompactEraTimeline eras={eraOverview} locale={locale} />
    </main>
  );
}
