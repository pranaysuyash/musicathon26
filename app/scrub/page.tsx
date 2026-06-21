import Link from "next/link";
import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { REGION_LABELS, getYearTimeline } from "@/lib/db/queries";
import { YearTimeline } from "@/components/scrub/year-timeline";
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

export default function ScrubPage({
  searchParams,
}: {
  searchParams: { region?: string; year?: string; lang?: string };
}) {
  initDb();

  const locale = resolveLocale(searchParams.lang);
  const region = resolveRegion(searchParams.region);
  const allYears = getYearTimeline(region);
  // Pick a default year — last available, or 2020 if none
  const lastYear = allYears[allYears.length - 1]?.year ?? 2020;
  const currentYear = (() => {
    const candidate = Number(searchParams.year);
    if (Number.isFinite(candidate) && allYears.some((y) => y.year === candidate)) {
      return candidate;
    }
    return lastYear;
  })();

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
          {/* Region picker — uses a form submit so it works in
              server-rendered output. The auto-submit on change would
              require a client component; form submit keeps the page
              server-only and avoids 500 errors. */}
          <form action="/scrub" className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <span>Region</span>
              <select
                name="region"
                defaultValue={region}
                className="rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200"
              >
                {Object.entries(REGION_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-signal-500 px-3 py-1.5 text-xs font-medium text-ink-950"
            >
              Switch region
            </button>
          </form>
          <Link
            href={buildLangPath("/scrub?region=US", locale)}
            className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs hover:border-ink-600"
          >
            Reset
          </Link>
        </div>

        {/* Era quick-jumps */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-500">Jump to era:</span>
          {[
            { label: "1960s Broadcast", start: 1960, end: 1969 },
            { label: "1970s Broadcast", start: 1970, end: 1979 },
            { label: "1980s MTV", start: 1980, end: 1989 },
            { label: "1990s MTV", start: 1990, end: 1999 },
            { label: "2000s Digital", start: 2000, end: 2009 },
            { label: "2010s Streaming", start: 2010, end: 2019 },
            { label: "2020s Global", start: 2020, end: 2023 },
          ].map((era) => (
            <Link
              key={era.label}
              href={buildLangPath(`/lens/${era.start}?region=${region}`, locale)}
              className="rounded-full border border-ink-700 px-2.5 py-0.5 text-ink-200 hover:border-signal-300/70 hover:text-signal-200"
            >
              {era.label}
            </Link>
          ))}
        </div>

        {allYears.length > 0 ? (
          <YearTimeline years={allYears} currentYear={currentYear} region={region} />
        ) : (
          <p className="text-sm text-amber-300">No timeline data for this region yet.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          What to do next
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link
            href={buildLangPath(`/lens/${currentYear}?region=${region}`, locale)}
            className="card p-4 text-sm transition hover:border-signal-500/40"
          >
            <p className="font-medium text-ink-100">Open the {currentYear} lens</p>
            <p className="mt-1 text-xs text-ink-400">
              Lyrics-first surface: what the chart was saying that year.
            </p>
          </Link>
          <Link
            href={buildLangPath(`/graph?rootType=year&rootId=versesignal:n:year:${currentYear}&hops=2`, locale)}
            className="card p-4 text-sm transition hover:border-signal-500/40"
          >
            <p className="font-medium text-ink-100">Open {currentYear} in the graph</p>
            <p className="mt-1 text-xs text-ink-400">
              Force-directed neighborhood. Verify any claim you saw.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
