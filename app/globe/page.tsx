import Link from "next/link";
import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { all } from "@/lib/db/sql";
import { REGION_LABELS, getAllYears, getYearSignals } from "@/lib/db/queries";
import { Pill } from "@/components/ui/primitives";
import { t, resolveLocale, localePairs, type Locale } from "@/lib/i18n/strings";

function buildLangPath(path: string, locale: Locale, query?: Record<string, string>) {
  const params = new URLSearchParams();
  if (locale !== "en") {
    params.set("lang", locale);
  }
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      params.set(key, value);
    });
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function resolveYear(raw?: string, fallback?: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback ?? new Date().getFullYear();
}

function closestOrFallback(rows: RegionRow[], targetYear: number): RegionRow | null {
  if (rows.length === 0) return null;
  const exact = rows.find((r) => r.year === targetYear);
  if (exact) return exact;
  const before = rows.filter((r) => r.year < targetYear).at(-1);
  if (before) return before;
  return rows[0] ?? null;
}

function intensityStyle(value: number, maxValue: number) {
  if (maxValue <= 0) {
    return {
      backgroundColor: "rgba(15, 23, 42, 0.35)",
      borderColor: "rgba(71, 85, 105, 0.5)",
    };
  }
  const ratio = Math.max(0, Math.min(1, value / maxValue));
  const alpha = Number((0.18 + ratio * 0.72).toFixed(2));
  const heat = Math.round(38 + ratio * 40);
  return {
    backgroundColor: `rgba(34, 211, 238, ${alpha})`,
    borderColor: `rgba(56, 189, 248, ${alpha + 0.08})`,
    backgroundImage: `linear-gradient(120deg, hsla(198, 85%, ${heat}%, ${alpha}) 0%, hsla(262, 85%, ${Math.max(
      20,
      heat - 10
    )}%, ${Math.max(0.2, alpha - 0.05)}) 100%)`,
  };
}

interface YearSignal {
  signal: string;
  signalType: string;
  score: number;
}

interface RegionCard {
  code: string;
  label: string;
  latestYear: number | null;
  songCount: number;
  prevSongCount: number;
  delta: number;
  eventCount: number;
  topTheme: string | null;
  topSignal: string | null;
}

interface EventRegionRow {
  id: string;
  value: string;
  start_date: string;
  end_date: string | null;
}

interface RegionRow {
  region: string;
  year: number;
  song_count: number;
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

export default function GlobePage({
  searchParams,
}: {
  searchParams: { lang?: string; year?: string };
}) {
  initDb();
  const locale = resolveLocale(searchParams.lang);
  const allYears = getAllYears("GLOBAL");
  const fallbackYear = allYears.at(-1)?.year ?? new Date().getFullYear();
  const currentYear = resolveYear(searchParams.year, fallbackYear);
  const yearSet = new Set(allYears.map((r) => r.year));
  const resolvedYear = yearSet.has(currentYear)
    ? currentYear
    : fallbackYear;
  const yearList = allYears.filter((r) => yearSet.has(r.year)).map((r) => r.year);

  const rows = all<RegionRow>(
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

  const regionRowsByCode = rows.reduce<Record<string, RegionRow[]>>((acc, row) => {
    const bucket = (acc[row.region] ??= []);
    bucket.push(row);
    return acc;
  }, {});
  Object.values(regionRowsByCode).forEach((regionRows) => {
    regionRows.sort((a, b) => b.year - a.year);
  });

  const regionCards: RegionCard[] = Object.entries(REGION_LABELS).map(([code, label]) => {
    const regionRows = regionRowsByCode[code] ?? [];
    const selectedRow = closestOrFallback(regionRows, resolvedYear) ?? { region: code, year: resolvedYear, song_count: 0 };
    const previousRow = selectedRow
      ? closestOrFallback(
          regionRows.filter((r) => r.year < selectedRow.year),
          selectedRow.year - 1
        )
      : null;
    const selectedSignals = selectedRow?.year
      ? (getYearSignals(selectedRow.year, code, 5) as YearSignal[])
      : [];
    const songCount = selectedRow?.song_count ?? 0;
    const prevSongCount = previousRow?.song_count ?? 0;
    const eventCount = new Set(
      eventRows.filter((event) => {
        const eventRegionsMatch = event.value === code || event.value === "GLOBAL";
        if (!eventRegionsMatch) return false;
        if (!resolvedYear) return false;
        const startYear = Number(String(event.start_date).slice(0, 4));
        if (!Number.isFinite(startYear)) return false;
        const endYear = event.end_date ? Number(String(event.end_date).slice(0, 4)) : startYear;
        return resolvedYear >= startYear && resolvedYear <= (Number.isFinite(endYear) ? endYear : startYear);
      }).map((r) => r.id)
    ).size;

    return {
      code,
      label,
      latestYear: selectedRow?.year ?? null,
      songCount,
      prevSongCount,
      delta: songCount - prevSongCount,
      eventCount,
      topTheme:
        selectedSignals.find((s) => s.signalType === "theme")?.signal ?? null,
      topSignal:
        selectedSignals.length > 0 ? `${selectedSignals[0].signalType}: ${selectedSignals[0].signal}` : null,
    };
  });

  const hottestFirst = [...regionCards].sort((a, b) => b.songCount - a.songCount);
  const maxSongCount = hottestFirst[0]?.songCount ?? 0;
  const currentYearIndex = yearList.indexOf(resolvedYear);
  const prevYear = currentYearIndex > 0 ? yearList[currentYearIndex - 1] : null;
  const nextYear = currentYearIndex >= 0 && currentYearIndex < yearList.length - 1 ? yearList[currentYearIndex + 1] : null;
  const resolvedYearLabel = String(resolvedYear);
  const yearNavQuery = (year: number) => ({ year: String(year) });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => (
          <a
            key={code}
            href={
              code === "en"
                ? `/globe${searchParams.year ? `?year=${resolvedYearLabel}` : ""}`
                : buildLangPath("/globe", code, { year: resolvedYearLabel })
            }
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
        Baseline year: {resolvedYear}.
      </p>

      <section className="mt-6 flex flex-wrap items-center gap-2">
        {prevYear ? (
          <Link
            href={buildLangPath("/globe", locale, yearNavQuery(prevYear))}
            className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs hover:border-signal-300 hover:text-signal-200"
          >
            ← {prevYear}
          </Link>
        ) : null}
        <span className="rounded-full border border-ink-800 px-3 py-1 text-xs text-ink-200">
          Year {resolvedYear}
        </span>
        {nextYear ? (
          <Link
            href={buildLangPath("/globe", locale, yearNavQuery(nextYear))}
            className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs hover:border-signal-300 hover:text-signal-200"
          >
            {nextYear} →
          </Link>
        ) : null}
        <span className="ml-2 text-xs text-ink-500">Global timeline anchor has {allYears.length} active years</span>
      </section>

      <section className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-ink-800 px-2.5 py-1 text-ink-500">Intensity key</span>
        {["Low", "Mid", "High"].map((label) => (
          <span key={label} className="rounded-full border border-ink-800 px-2.5 py-1 text-ink-500">
            {label}
          </span>
        ))}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {regionCards
          .sort((a, b) => b.songCount - a.songCount || a.label.localeCompare(b.label))
          .map((item) => {
            const yearUrl = item.latestYear ? `/lens/${item.latestYear}?region=${item.code}` : null;
            const style = intensityStyle(item.songCount, maxSongCount);
            const isRising = item.delta > 0;
            const isFlat = item.delta === 0;
            return (
              <article
                key={item.code}
                className="card p-5 transition hover:border-signal-500/80"
                style={style}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-ink-100">{item.label}</h2>
                  <Pill variant="mute">{item.code}</Pill>
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  {t(locale, "common.songs")} this slice:
                  {" "}
                  <span className="text-ink-200">{item.songCount}</span>
                  {item.latestYear ? <span> ({item.latestYear})</span> : null}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {t(locale, "common.events")}: <span className="text-ink-200">{item.eventCount}</span>
                  {" "}
                  active in {resolvedYear}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  top theme: <span className="text-ink-200">{item.topTheme ?? "not enough data"}</span>
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  top signal: <span className="text-ink-200">{item.topSignal ?? "n/a"}</span>
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  year drift:
                  <span
                    className={`ml-1 ${isRising ? "text-emerald-300" : isFlat ? "text-ink-300" : "text-amber-300"}`}
                  >
                    {isRising ? `+${item.delta}` : item.delta}
                  </span>
                  {" "}vs {item.prevSongCount} prior
                </p>
                <div className="mt-4">
                  {yearUrl ? (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={buildLangPath(yearUrl, locale, { year: resolvedYearLabel })}
                        className="text-xs font-medium text-signal-300 hover:text-signal-200"
                      >
                        Open regional lens
                      </Link>
                      <Link
                        href={buildLangPath(
                          `/graph?rootType=region&rootId=versesignal:n:region:${item.code}&hops=2`,
                          locale
                        )}
                        className="text-xs font-medium text-echo-300 hover:text-echo-200"
                      >
                        Open region graph
                      </Link>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-500">No regional data yet</span>
                  )}
                </div>
              </article>
            );
          })}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Hottest regions</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {hottestFirst.slice(0, 4).map((item, idx) => (
            <p key={item.code} className="rounded-lg border border-ink-800 bg-ink-900/20 px-4 py-2 text-xs text-ink-300">
              {idx + 1}. {item.label} · {item.songCount} songs · {item.topTheme ?? "no theme signal"}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
