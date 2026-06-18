import Link from "next/link";
import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { getAllYears, REGION_LABELS, getYearSignals } from "@/lib/db/queries";
import { TimelineScrubber } from "@/components/lens/timeline-scrubber";
import { Pill } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Timeline scrubber",
  description:
    "Scrub through years quickly and jump into regional lenses from a temporal heat-strip style control.",
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
  searchParams: { region?: string; year?: string };
}) {
  initDb();

  const region = resolveRegion(searchParams.region);
  const allYears = getAllYears(region);
  const currentYear = resolveYear(searchParams.year, allYears);
  const yearSignals = getYearSignals(currentYear, region, 5);
  const themes = yearSignals.filter((s) => s.signalType === "theme").map((s) => s.signal);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">
        ← VerseSignal home
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="signal">TIMELINE SCRUBBER</Pill>
          <Pill variant="mute">{REGION_LABELS[region]}</Pill>
        </div>
        <h1 className="h-display mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
          Jump by year · {region}
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-ink-300">
          Use the scrubber to move across time in the current region and jump into lens pages where
          signals, events, and songs are already precomputed.
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
            href="/scrub?region=US"
            className="ml-auto rounded-lg border border-ink-700 px-3 py-1.5 text-xs hover:border-ink-600"
          >
            Reset
          </Link>
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
            <Link href={`/lens/${currentYear}?region=${region}`} className="text-xs text-signal-300 hover:text-signal-200">
              Open full lens
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
