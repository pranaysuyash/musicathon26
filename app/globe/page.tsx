import Link from "next/link";
import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { all } from "@/lib/db/sql";
import { REGION_LABELS, getAllYears, getYearSignals } from "@/lib/db/queries";
import { Pill } from "@/components/ui/primitives";
import { CulturalWeatherGlobe, type WeatherRegionPoint } from "@/components/globe/cultural-weather-globe";
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

const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  GLOBAL: { lat: 18, lng: 6 },
  US: { lat: 39, lng: -98 },
  IN: { lat: 22, lng: 79 },
  UK: { lat: 54, lng: -2 },
  JP: { lat: 36, lng: 138 },
  KR: { lat: 36, lng: 128 },
  DE: { lat: 51, lng: 10 },
  BR: { lat: -10, lng: -55 },
  NG: { lat: 9, lng: 8 },
  MX: { lat: 23, lng: -102 },
  UA: { lat: 49, lng: 32 },
  RU: { lat: 61, lng: 100 },
};

export const metadata: Metadata = {
  title: "Cultural weather map",
  description:
    "An interactive cultural weather surface for VerseSignal's regional music signals, candidate contexts, and uncertainty.",
  openGraph: {
    images: [
      {
        url: "/api/og?type=globe&title=Cultural%20Weather%20Map&subtitle=Song-led+regional+signal+intensity+and+candidate+context+layers",
        width: 1200,
        height: 630,
      },
    ],
  },
};

export default function GlobePage({
  searchParams,
}: {
  searchParams: { lang?: string; year?: string; region?: string };
}) {
  initDb();
  const locale = resolveLocale(searchParams.lang);
  const allYears = getAllYears("GLOBAL");
  const fallbackYear = allYears.at(-1)?.year ?? new Date().getFullYear();
  const currentYear = resolveYear(searchParams.year, fallbackYear);
  const yearSet = new Set(allYears.map((r) => r.year));
  const resolvedYear = yearSet.has(currentYear) ? currentYear : fallbackYear;
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
    const selectedRow = closestOrFallback(regionRows, resolvedYear) ?? {
      region: code,
      year: resolvedYear,
      song_count: 0,
    };
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
      eventRows
        .filter((event) => {
          const eventRegionsMatch = event.value === code || event.value === "GLOBAL";
          if (!eventRegionsMatch) return false;
          const startYear = Number(String(event.start_date).slice(0, 4));
          if (!Number.isFinite(startYear)) return false;
          const endYear = event.end_date ? Number(String(event.end_date).slice(0, 4)) : startYear;
          return resolvedYear >= startYear && resolvedYear <= (Number.isFinite(endYear) ? endYear : startYear);
        })
        .map((r) => r.id)
    ).size;

    return {
      code,
      label,
      latestYear: selectedRow?.year ?? null,
      songCount,
      prevSongCount,
      delta: songCount - prevSongCount,
      eventCount,
      topTheme: selectedSignals.find((s) => s.signalType === "theme")?.signal ?? null,
      topSignal:
        selectedSignals.length > 0 ? `${selectedSignals[0].signalType}: ${selectedSignals[0].signal}` : null,
    };
  });

  const hottestFirst = [...regionCards].sort((a, b) => b.songCount - a.songCount);
  const maxSongCount = hottestFirst[0]?.songCount ?? 0;
  const selectedRegionCode =
    (searchParams.region && regionCards.some((card) => card.code === searchParams.region)
      ? searchParams.region
      : hottestFirst[0]?.code) ?? "GLOBAL";
  const selectedCard = regionCards.find((card) => card.code === selectedRegionCode) ?? hottestFirst[0] ?? null;
  const currentYearIndex = yearList.indexOf(resolvedYear);
  const prevYear = currentYearIndex > 0 ? yearList[currentYearIndex - 1] : null;
  const nextYear = currentYearIndex >= 0 && currentYearIndex < yearList.length - 1 ? yearList[currentYearIndex + 1] : null;
  const resolvedYearLabel = String(resolvedYear);
  const globeQuery: Record<string, string> = {};
  if (searchParams.year) {
    globeQuery.year = resolvedYearLabel;
  }
  if (searchParams.region) {
    globeQuery.region = searchParams.region;
  }

  const weatherPoints: WeatherRegionPoint[] = regionCards.map((item) => {
    const coords = REGION_COORDS[item.code] ?? REGION_COORDS.GLOBAL;
    const intensity = maxSongCount > 0 ? item.songCount / maxSongCount : 0;
    const completeness = Math.min(1, Math.max(0.2, (item.songCount + item.eventCount * 0.5) / 18));
    return {
      code: item.code,
      label: item.label,
      lat: coords.lat,
      lng: coords.lng,
      year: item.latestYear ?? resolvedYear,
      songCount: item.songCount,
      prevSongCount: item.prevSongCount,
      delta: item.delta,
      eventCount: item.eventCount,
      topTheme: item.topTheme,
      topSignal: item.topSignal,
      intensity,
      completeness,
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-10">
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => (
          <a
            key={code}
            href={buildLangPath("/globe", code, globeQuery)}
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

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={buildLangPath("/", locale)} className="text-xs text-ink-400 hover:text-ink-200">
          ← VerseSignal home
        </Link>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <Pill variant="signal">{t(locale, "globe.title")}</Pill>
          <span>{t(locale, "globe.region-title")}: {Object.keys(REGION_LABELS).length}</span>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div className="max-w-3xl">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-ink-800 bg-ink-950/55 px-4 py-2 text-[11px] uppercase tracking-[0.26em] text-ink-500">
            <span>World Lens</span>
            <span className="text-ink-700">·</span>
            <span>Signal field</span>
            <span className="text-ink-700">·</span>
            <span>Context weather</span>
            <span className="text-ink-700">·</span>
            <span>Uncertainty map</span>
          </div>
          <h1 className="h-display mt-5 text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Was the world singing the same thing?
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-300 md:text-base">
            Compare signal intensity, top themes, and active contexts across regions. The same event can sound different in different places — or the same mood can show up everywhere at once.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-ink-800 bg-ink-950/55 p-5">
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Reading guide</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <ReadingChip title="Signal" value="Where songs get louder, stranger, or more concentrated." />
            <ReadingChip title="Context" value="Candidate explanations that may fit the anomaly." />
            <ReadingChip title="Uncertainty" value="Where the corpus is thin or the link is speculative." />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <CulturalWeatherGlobe
          locale={locale}
          year={resolvedYear}
          points={weatherPoints}
          initialRegionCode={selectedRegionCode}
        />
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.6rem] border border-ink-800 bg-ink-950/55 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Selected region</p>
          <h2 className="mt-2 text-xl font-semibold text-ink-100">{selectedCard?.label ?? "Regional slice"}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-400">
            {selectedCard ? `${selectedCard.songCount} songs in ${selectedCard.latestYear ?? resolvedYear}.` : "No region selected yet."}
          </p>
          {selectedCard ? (
            <>
              <p className="mt-3 text-sm text-ink-300">
                Top mood: <span className="text-ink-100">{selectedCard.topSignal ?? "n/a"}</span>
              </p>
              <p className="mt-1 text-sm text-ink-300">
                Top theme: <span className="text-ink-100">{selectedCard.topTheme ?? "n/a"}</span>
              </p>
              <p className="mt-1 text-sm text-ink-300">
                Year drift: <span className={selectedCard.delta > 0 ? "text-emerald-300" : selectedCard.delta === 0 ? "text-ink-300" : "text-amber-300"}>{selectedCard.delta > 0 ? `+${selectedCard.delta}` : selectedCard.delta}</span> vs prior year
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={buildLangPath(`/lens/${selectedCard.latestYear ?? resolvedYear}`, locale, { region: selectedCard.code })}
                  className="text-xs font-medium text-signal-300 hover:text-signal-200"
                >
                  Open regional lens
                </Link>
                <Link
                  href={buildLangPath(`/graph?rootType=region&rootId=versesignal:n:region:${selectedCard.code}&hops=2`, locale)}
                  className="text-xs font-medium text-echo-300 hover:text-echo-200"
                >
                  Open region graph
                </Link>
              </div>
            </>
          ) : null}
        </div>
        <div className="rounded-[1.6rem] border border-ink-800 bg-ink-950/55 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Same event, different sound</p>
          <p className="mt-2 text-sm leading-6 text-ink-300">
            A global shock like COVID-19 or the 2020 protests appears in many regions, but the musical response varies — some regions lean into protest, others into isolation, others into escapism.
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-300">
            Compare two regions below to test whether the world was harmonizing or fragmenting.
          </p>
        </div>
        <div className="rounded-[1.6rem] border border-ink-800 bg-ink-950/55 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Next move</p>
          <p className="mt-2 text-sm leading-6 text-ink-300">
            Open the regional lens to see candidate events, or jump to the graph to inspect cross-region edges and evidence strength.
          </p>
        </div>
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-ink-800 px-2.5 py-1 text-xs text-ink-500">Year anchor: {resolvedYear}</span>
        {prevYear ? (
          <Link
            href={buildLangPath("/globe", locale, { year: String(prevYear), ...(searchParams.region ? { region: searchParams.region } : {}) })}
            className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs hover:border-signal-300 hover:text-signal-200"
          >
            ← {prevYear}
          </Link>
        ) : null}
        <span className="rounded-full border border-ink-800 px-3 py-1 text-xs text-ink-200">Year {resolvedYear}</span>
        {nextYear ? (
          <Link
            href={buildLangPath("/globe", locale, { year: String(nextYear), ...(searchParams.region ? { region: searchParams.region } : {}) })}
            className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs hover:border-signal-300 hover:text-signal-200"
          >
            {nextYear} →
          </Link>
        ) : null}
        <span className="ml-2 text-xs text-ink-500">Global timeline anchor has {allYears.length} active years</span>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Regional comparison grid</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-300">
          Each card shows what a region was sounding like in the selected year. Compare mood, theme, and event context side-by-side.
        </p>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {regionCards
          .sort((a, b) => b.songCount - a.songCount || a.label.localeCompare(b.label))
          .map((item) => {
            const yearUrl = item.latestYear ? `/lens/${item.latestYear}?region=${item.code}` : null;
            const intensity = maxSongCount > 0 ? item.songCount / maxSongCount : 0;
            const base = Math.max(0.22, intensity);
            const style = {
              backgroundColor: `rgba(14, 165, 233, ${0.08 + base * 0.16})`,
              borderColor: `rgba(56, 189, 248, ${0.18 + base * 0.35})`,
              boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 24px 70px -50px rgba(14, 165, 233, ${0.45 + base * 0.18})`,
            } as const;
            const isRising = item.delta > 0;
            const isFlat = item.delta === 0;
            return (
              <article key={item.code} className="card p-5 transition hover:border-signal-500/80" style={style}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-ink-100">{item.label}</h2>
                  <Pill variant="mute">{item.code}</Pill>
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  {t(locale, "common.songs")}:{" "}
                  <span className="text-ink-200">{item.songCount}</span>
                  {item.latestYear ? <span> ({item.latestYear})</span> : null}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {t(locale, "common.events")}: <span className="text-ink-200">{item.eventCount}</span> active in {resolvedYear}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  top mood: <span className="text-ink-200">{item.topSignal ?? "not enough data"}</span>
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  top theme: <span className="text-ink-200">{item.topTheme ?? "n/a"}</span>
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
                        href={buildLangPath(`/lens/${item.latestYear}`, locale, { region: item.code })}
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

function ReadingChip({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-950/55 p-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-ink-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-ink-300">{value}</p>
    </div>
  );
}
