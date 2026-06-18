import Link from "next/link";
import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { all } from "@/lib/db/sql";
import { REGION_LABELS, getAllYears, getYearSignals } from "@/lib/db/queries";
import { Pill } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Cultural weather map",
  description:
    "A regional view of VerseSignal&apos;s current music-culture intensity, by song volume and top signals.",
};

interface RegionRow {
  region: string;
  year: number;
  song_count: number;
}

interface EventRegionRow {
  value: string;
}

export default function GlobePage() {
  initDb();

  const rows = all<RegionRow>(
    `SELECT region, year, COUNT(*) AS song_count
       FROM songs
      WHERE region IS NOT NULL
      GROUP BY region, year
      ORDER BY region ASC, year DESC`
  );

  const eventRows = all<EventRegionRow>(
    `SELECT value FROM events, json_each(events.regions_json)`
  );

  const regionCards = Object.entries(REGION_LABELS).map(([code, label]) => {
    const regionRows = rows.filter((r) => r.region === code);
    const latestYear = regionRows[0]?.year ?? null;
    const latestSongRow = latestYear
      ? regionRows.find((r) => r.year === latestYear)
      : undefined;
    const songCount = latestSongRow?.song_count ?? 0;
    const eventCount = eventRows.filter((r) => r.value === code || r.value === "GLOBAL").length;
    const topTheme = latestYear
      ? getYearSignals(latestYear, code, 1)
          .find((s) => s.signalType === "theme")
          ?.signal ?? null
      : null;

    return {
      code,
      label,
      songCount,
      latestYear,
      eventCount,
      topTheme,
    };
  });

  const yearCounts = getAllYears();
  const latestDemoYear = yearCounts.at(-1)?.year ?? 2023;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">
          ← VerseSignal home
        </Link>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <Pill variant="signal">CULTURAL WEATHER</Pill>
          <span>Regions: {Object.keys(REGION_LABELS).length}</span>
        </div>
      </div>

      <h1 className="h-display mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
        Cultural weather map (regional atlas)
      </h1>
      <p className="mt-3 max-w-3xl text-sm text-ink-300">
        This is a regional pulse surface for the current seeded demo corpus. It shows recent regional
        volume, event overlap, and the top theme in the most recent available year for each region.
      </p>
      <p className="mt-2 text-xs text-ink-500">
        Baseline demo epoch anchor: {latestDemoYear}.
      </p>

      <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {regionCards.map((item) => {
          const yearUrl = item.latestYear ? `/lens/${item.latestYear}?region=${item.code}` : null;
          return (
            <article key={item.code} className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink-100">{item.label}</h2>
                <Pill variant="mute">{item.code}</Pill>
              </div>
              <p className="mt-2 text-xs text-ink-400">
                songs this slice: <span className="text-ink-200">{item.songCount}</span>
                {item.latestYear ? <span> ({item.latestYear})</span> : null}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                active events: <span className="text-ink-200">{item.eventCount}</span>
              </p>
              <p className="mt-1 text-xs text-ink-400">
                top theme: <span className="text-ink-200">{item.topTheme ?? "not enough data"}</span>
              </p>
              <div className="mt-4">
                {yearUrl ? (
                  <Link
                    href={yearUrl}
                    className="text-xs font-medium text-signal-300 hover:text-signal-200"
                  >
                    Open regional lens
                  </Link>
                ) : (
                  <span className="text-xs text-ink-500">No regional data yet</span>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
