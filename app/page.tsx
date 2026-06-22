import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { getAllEvents, getAllYears, getEraOverview, getYearSignals } from "@/lib/db/queries";
import { HomeHero } from "@/components/home/home-hero";
import { ExplorationLensGrid } from "@/components/home/exploration-lens-grid";
import { FeaturedSignalStory } from "@/components/home/featured-signal-story";
import { EvidenceQualityPreview } from "@/components/home/evidence-quality-preview";
import { CompactEraTimeline } from "@/components/home/compact-era-timeline";
import { resolveLocale } from "@/lib/i18n/strings";

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

      <ExplorationLensGrid locale={locale} />

      <div className="grid gap-8 lg:grid-cols-2">
        <FeaturedSignalStory locale={locale} />
        <EvidenceQualityPreview />
      </div>

      <CompactEraTimeline eras={eraOverview} locale={locale} />
    </main>
  );
}
