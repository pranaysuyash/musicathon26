import Link from "next/link";
import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { all } from "@/lib/db/sql";
import { REGION_LABELS, getAllYears, getYearSignals } from "@/lib/db/queries";
import { Pill } from "@/components/ui/primitives";
import { t, resolveLocale, localePairs, type Locale } from "@/lib/i18n/strings";

function buildLangPath(path: string, locale: Locale) {
  if (locale === "en") return path;
  return `${path}?lang=${locale}`;
}

export const metadata: Metadata = {
  title: "Cultural weather map",
  description:
    "A regional view of VerseSignal&apos;s current music-culture intensity, by song volume and top signals.",
  openGraph: {
    images: [
      {
        url: "/api/og?type=globe&title=Cultural%20Weather%20Map&subtitle=Regional+music+culture+intensity+by+era+and+chart+signals",
        width: 1200,
        height: 630,
      },
    ],
  },
};

interface RegionRow {
  region: string;
  year: number;
  song_count: number;
}

interface EventRegionRow {
  value: string;
}

export default function GlobePage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  initDb();
  const locale = resolveLocale(searchParams.lang);

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
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => (
          <a
            key={code}
            href={`/globe${code === "en" ? "" : `?lang=${code}`}`}
            className={`rounded-full border px-2.5 py-1 transition ${
              locale === code
                ? "border-signal-300 bg-signal-300/10 text-signal-200"
                : "border-ink-700 text-ink-400 hover:border-signal-300/70 hover:text-signal-200"
            }`}
          >
            {t(locale, key)}
          </a>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
          <Link
            href={buildLangPath("/", locale)}
            className="text-xs text-ink-400 hover:text-ink-200"
          >
            ← VerseSignal home
        </Link>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <Pill variant="signal">{t(locale, "globe.title")}</Pill>
          <span>{t(locale, "globe.region-title")}: {Object.keys(REGION_LABELS).length}</span>
        </div>
      </div>

      <h1 className="h-display mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
        {t(locale, "globe.title")}
      </h1>
      <p className="mt-3 max-w-3xl text-sm text-ink-300">
        {t(locale, "globe.description")}
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
                {t(locale, "common.songs")} this slice: <span className="text-ink-200">{item.songCount}</span>
                {item.latestYear ? <span> ({item.latestYear})</span> : null}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                {t(locale, "common.events")}: <span className="text-ink-200">{item.eventCount}</span>
              </p>
              <p className="mt-1 text-xs text-ink-400">
                top theme: <span className="text-ink-200">{item.topTheme ?? "not enough data"}</span>
              </p>
              <div className="mt-4">
                {yearUrl ? (
                  <Link
                    href={buildLangPath(yearUrl, locale)}
                    className="text-xs font-medium text-signal-300 hover:text-signal-200"
                  >
                    {t(locale, "globe.region-title")}
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
