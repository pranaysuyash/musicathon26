import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { all } from "@/lib/db/sql";
import { getAllEvents, getAllYears, getEraOverview, getYearSignals } from "@/lib/db/queries";
import { HomeHero } from "@/components/home/home-hero";
import { ExplorationLensGrid } from "@/components/home/exploration-lens-grid";
import { FeaturedSignalStory } from "@/components/home/featured-signal-story";
import { EvidenceQualityPreview } from "@/components/home/evidence-quality-preview";
import { CompactEraTimeline } from "@/components/home/compact-era-timeline";
import { resolveLocale } from "@/lib/i18n/strings";
import { CulturalWeatherGlobe, type WeatherRegionPoint } from "@/components/globe/cultural-weather-globe";
import { PathPanel } from "@/components/graph/path-panel";
import { REGION_LABELS } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Songs, signals, and cultural context",
  description:
    "Explore how popular songs, lyrics, artists, moods, entities, and cultural contexts connect across 1960–2023.",
  openGraph: {
    images: [{ url: "/api/og?type=default", width: 1200, height: 630 }],
  },
};

export const dynamic = "force-dynamic";

interface RegionRow {
  region: string;
  year: number;
  song_count: number;
}

interface EventRegionRow {
  id: string;
  value: string;
  start_date: string;
  end_date: string | null;
}

const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  GLOBAL: { lat: 18, lng: 6 },
  US: { lat: 39, lng: -98 },
  IN: { lat: 22, lng: 79 },
  UK: { lat: 54, lng: -2 },
};

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
  const globeYear = 2020;
  const regionRows = all<RegionRow>(
    `SELECT region, year, COUNT(*) AS song_count
       FROM songs
      WHERE region IS NOT NULL
      GROUP BY region, year
      ORDER BY region ASC, year DESC`
  );
  const eventRows = all<EventRegionRow>(
    `SELECT e.id, je.value, e.start_date, e.end_date
       FROM events e,
            json_each(e.regions_json) AS je`
  );
  const regionRowsByCode = regionRows.reduce<Record<string, RegionRow[]>>((acc, row) => {
    const bucket = (acc[row.region] ??= []);
    bucket.push(row);
    return acc;
  }, {});
  const homeGlobePoints: WeatherRegionPoint[] = Object.entries(REGION_LABELS)
    .filter(([code]) => ["GLOBAL", "US", "IN", "UK"].includes(code))
    .map(([code, label]) => {
      const coords = REGION_COORDS[code] ?? REGION_COORDS.GLOBAL;
      const rows = (regionRowsByCode[code] ?? []).sort((a, b) => b.year - a.year);
      const selected = rows.find((row) => row.year === globeYear) ?? rows[0] ?? { region: code, year: globeYear, song_count: 0 };
      const previous = rows.find((row) => row.year < selected.year) ?? null;
      const selectedSignals = getYearSignals(selected.year, code, 5).filter(
        (s) => s.signalType === "theme" || s.signalType === "mood" || s.signalType === "entity"
      );
      const eventCount = new Set(
        eventRows
          .filter((event) => {
            const eventRegionsMatch = event.value === code || event.value === "GLOBAL";
            if (!eventRegionsMatch) return false;
            const startYear = Number(String(event.start_date).slice(0, 4));
            if (!Number.isFinite(startYear)) return false;
            const endYear = event.end_date ? Number(String(event.end_date).slice(0, 4)) : startYear;
            return globeYear >= startYear && globeYear <= (Number.isFinite(endYear) ? endYear : startYear);
          })
          .map((r) => r.id)
      ).size;

      return {
        code,
        label,
        lat: coords.lat,
        lng: coords.lng,
        year: selected.year,
        songCount: selected.song_count,
        prevSongCount: previous?.song_count ?? 0,
        delta: selected.song_count - (previous?.song_count ?? 0),
        eventCount,
        topTheme: selectedSignals.find((s) => s.signalType === "theme")?.signal ?? null,
        topSignal:
          selectedSignals.length > 0 ? `${selectedSignals[0].signalType}: ${selectedSignals[0].signal}` : null,
        intensity: selected.song_count > 0 ? 1 : 0,
        completeness: Math.min(1, Math.max(0.2, (selected.song_count + eventCount * 0.5) / 18)),
      };
    });
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

      <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <CulturalWeatherGlobe
          locale={locale}
          year={globeYear}
          points={homeGlobePoints}
          initialRegionCode="US"
        />
        <PathPanel
          initialFromId="versesignal:n:song:versesignal:2020:01:blinding-lights-the-weeknd"
          initialToId="versesignal:n:event:versesignal:ev:covid_19"
          initialAsk="Find a path from Blinding Lights to COVID-19"
        />
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
