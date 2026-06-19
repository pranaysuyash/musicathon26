import Link from "next/link";
import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { getAllYears, REGION_LABELS, getYearSignals } from "@/lib/db/queries";
import { TimelineScrubber } from "@/components/lens/timeline-scrubber";
import { Pill } from "@/components/ui/primitives";
import { t, resolveLocale, localePairs, type Locale } from "@/lib/i18n/strings";

function buildLangPath(path: string, locale: Locale, query?: Record<string, string>) {
  if (locale === "en") return path;
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    params.set(key, value);
  });
  return `${path}?lang=${locale}${params.toString() ? `&${params}` : ""}`;
}

export const metadata: Metadata = {
  title: "Timeline scrubber",
  description:
    "Scrub through years quickly and jump into regional lenses from a temporal heat-strip style control.",
  openGraph: {
    images: [
      {
        url: "/api/og?type=scrub&title=Timeline%20Scrubber&subtitle=Move%20across%20years%20and%20enter%20the%20lens%20for%20each%20era",
        width: 1200,
        height: 630,
      },
    ],
  },
};

function resolveRegion(region: string | undefined): string {
  if (!region) return "US";
  return region in REGION_LABELS ? region : "US";
}

function resolveYear(yearRaw: string | undefined, allYears: { year: number; songCount: number }[]): number {
  const candidate = Number(yearRaw);
  if (Number.isFinite(candidate) && allYears.some((y) => y.year === candidate)) {
    return candidate;
  }
  return allYears[allYears.length - 1]?.year ?? new Date().getFullYear();
}

export default function ScrubPage({
  searchParams,
}: {
  searchParams: { region?: string; year?: string; lang?: string };
}) {
  initDb();

  const locale = resolveLocale(searchParams.lang);
  const region = resolveRegion(searchParams.region);
  const allYears = getAllYears(region);
  const currentYear = resolveYear(searchParams.year, allYears);
  const yearSignals = getYearSignals(currentYear, region, 5);
  const themes = yearSignals.filter((s) => s.signalType === "theme").map((s) => s.signal);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => {
          const href = buildLangPath("/scrub", code, { region, year: String(currentYear) });
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

      <Link href={buildLangPath("/", locale)} className="text-xs text-ink-400 hover:text-ink-200">
        ← VerseSignal home
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="signal">{t(locale, "scrub.title")}</Pill>
          <Pill variant="mute">{REGION_LABELS[region]}</Pill>
        </div>
        <h1 className="h-display mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
          Jump by year · {region}
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-ink-300">
          {t(locale, "scrub.description")}
        </p>
      </header>

      <section className="mt-8 rounded-2xl border border-ink-800 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-ink-400">
          <form action="/scrub" className="flex items-center gap-2">
            <label>
              <span className="mr-2">Region</span>
              <select
                name="region"
                defaultValue={region}
                className="rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200"
              >
                {Object.entries(REGION_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
                ))}
              </select>
            </label>
            <label>
              <span className="ml-2 mr-2">Year</span>
              <select
                name="year"
                defaultValue={String(currentYear)}
                className="rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200"
              >
                {allYears.map((y) => (
                  <option key={y.year} value={String(y.year)}>
                    {y.year} ({y.songCount})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-lg bg-signal-500 px-3 py-1.5 text-xs font-medium text-ink-950">
              Go
            </button>
          </form>
            <Link
              href={buildLangPath("/scrub?region=US", locale)}
              className="ml-auto rounded-lg border border-ink-700 px-3 py-1.5 text-xs hover:border-ink-600"
            >
            Reset
          </Link>
        </div>

        {/* Era quick-jumps: 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-500">Era:</span>
          {[
            { label: "1960s", years: [1960, 1969] },
            { label: "1970s", years: [1970, 1979] },
            { label: "1980s (MTV)", years: [1980, 1989] },
            { label: "1990s", years: [1990, 1999] },
            { label: "2000s (digital)", years: [2000, 2009] },
            { label: "2010s (streaming)", years: [2010, 2019] },
            { label: "2020s (global)", years: [2020, 2023] },
          ].map((era) => (
            <Link
              key={era.label}
              href={buildLangPath(`/lens/${era.years[0]}?region=${region}`, locale)}
              className="rounded-full border border-ink-700 px-2.5 py-0.5 text-ink-200 hover:border-signal-300/70 hover:text-signal-200"
            >
              {era.label}
            </Link>
          ))}
        </div>

        {allYears.length > 0 ? (
          <TimelineScrubber years={allYears} currentYear={currentYear} />
        ) : (
          <p className="text-sm text-amber-300">No timeline data for this region yet.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          Snapshot for {currentYear}
        </h2>
        <div className="mt-3 rounded-xl border border-ink-800 p-4">
          <p className="text-sm text-ink-300">Top themes: {themes.join(", ") || "No signal yet"}</p>
          <p className="mt-2 text-xs text-ink-500">
            Songs indexed in this slice: {allYears.find((y) => y.year === currentYear)?.songCount ?? 0}
          </p>
          <div className="mt-4">
            <Link
              href={buildLangPath(`/lens/${currentYear}?region=${region}`, locale)}
              className="text-xs text-signal-300 hover:text-signal-200"
            >
              Open full lens
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
