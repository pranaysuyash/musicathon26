import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSongsByYear, getYearAvailability, getYearThemes, getYearMoods, getAllYears, getChartEraForYear, REGION_LABELS } from "@/lib/db/queries";
import { t, resolveLocale, localePairs, type Locale } from "@/lib/i18n/strings";
import { RegionPicker } from "@/components/lens/region-picker";

function buildLangPath(path: string, locale: Locale, region = "US") {
  const params = new URLSearchParams();
  if (region !== "US") params.set("region", region);
  if (locale !== "en") params.set("lang", locale);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function closestAvailableYear(years: number[], target: number): number | null {
  if (years.length === 0) return null;
  if (years.includes(target)) return target;
  let best: number | null = null;
  let bestGap = Infinity;
  for (const y of years) {
    const gap = Math.abs(y - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = y;
    }
  }
  return best;
}

export async function generateMetadata({
  params,
}: {
  params: { year: string };
}): Promise<Metadata> {
  const year = Number(params.year);
  if (!Number.isFinite(year)) return { title: "Year not found" };
  return {
    title: `${year} — Top songs, themes, and moods`,
    description: `Top songs from ${year}, with themes, moods, and cultural context surfaces.`,
    openGraph: {
      images: [{ url: `/api/og?type=year&title=${encodeURIComponent(`${year} Top Songs`)}&subtitle=${encodeURIComponent(`The year ${year} in music: themes, moods, and cultural context`)}`, width: 1200, height: 630 }],
    },
  };
}
import { initDb } from "@/lib/db";
import { ThemeCloud } from "@/components/lens/theme-cloud";
import { Pill, SectionTitle, ConfidenceBar } from "@/components/ui/primitives";
import { THEME_LABELS, THEME_COLORS } from "@/lib/nlp/theme-scoring";
import { YearInsightPlayer } from "@/components/lens/year-insight-player";
import type { Theme, Mood } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { year: string };
  searchParams: { region?: string; lang?: string };
}

export default function YearPage({ params, searchParams }: PageProps) {
  initDb();
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year)) notFound();
  const locale = resolveLocale(searchParams.lang);
  const region = (searchParams.region ?? "US") in REGION_LABELS ? (searchParams.region ?? "US") : "US";
  const availability = getYearAvailability(year, region);
  const allYears = getAllYears(region).map((r) => r.year);
  const targetEra = getChartEraForYear(year);

  if (!availability) {
    const nearest = closestAvailableYear(allYears, year);
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {localePairs.map(({ code, key }) => (
            <a
              key={code}
              href={buildLangPath(`/year/${year}`, code, region)}
              className={`rounded-full border px-2.5 py-1 transition ${
                locale === code
                  ? "border-signal-300 bg-signal-300/10 text-signal-200"
                  : "border-ink-700 text-ink-400 hover:border-signal-300/70 hover:text-signal-200"
              }`}
            >
              {t(locale, key)}
            </a>
          ))}
          <RegionPicker
            currentRegion={region}
            currentYear={year}
            basePath={`/year/${year}`}
            locale={locale}
          />
        </div>

        <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</Link>
        <header className="mt-4 mb-10">
          <div className="flex flex-wrap items-center gap-2">
            <Pill variant="signal">{t(locale, "lens.title")}</Pill>
            <Pill variant="mute">{REGION_LABELS[region]}</Pill>
            <Pill variant="mute">{targetEra.label}</Pill>
          </div>
          <h1 className="h-display mt-4 text-6xl font-semibold tracking-tight md:text-7xl">
            {year}
          </h1>
          <p className="mt-3 max-w-2xl text-ink-300 text-pretty">
            No chart data is available for this year in {REGION_LABELS[region] ?? region} yet.
            The target product spine is {targetEra.label}, with the shipped demo slice focused first on
            the 2020–2023 seeded years.
          </p>
        </header>
        <section className="card p-5">
          <p className="text-sm text-ink-300">
            {nearest !== null ? (
              <>
                Try nearby data first:
                {" "}
                <Link
                  href={buildLangPath(`/year/${nearest}`, locale, region)}
                  className="font-medium text-signal-300 hover:text-signal-200 underline decoration-dotted"
                >
                  /year/{nearest}
                </Link>
                .
              </>
            ) : (
              "Backfill data for this region to unlock this year."
            )}
          </p>
        </section>
      </main>
    );
  }

  const songs = getSongsByYear(year, region, 100);
  const themes = getYearThemes(year, region, 8);
  const moods = getYearMoods(year, region, 6);
  const chartEra = availability.chartEra;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => (
          <a
            key={code}
            href={buildLangPath(`/year/${year}`, code, region)}
            className={`rounded-full border px-2.5 py-1 transition ${
              locale === code
                ? "border-signal-300 bg-signal-300/10 text-signal-200"
                : "border-ink-700 text-ink-400 hover:border-signal-300/70 hover:text-signal-200"
            }`}
          >
            {t(locale, key)}
          </a>
        ))}
        <RegionPicker
          currentRegion={region}
          currentYear={year}
          basePath={`/year/${year}`}
          locale={locale}
        />
      </div>

      <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</Link>
      <header className="mt-4 mb-10">
        <div className="flex items-center gap-3">
          <Pill variant="signal">{t(locale, "lens.title")}</Pill>
          <Pill variant="mute">{chartEra.label} · source: {chartEra.sourceMode}</Pill>
        </div>
        <h1 className="h-display mt-4 text-6xl font-semibold tracking-tight md:text-7xl">
          {year}
        </h1>
        <p className="mt-3 max-w-2xl text-ink-300 text-pretty">
          {songs.length} charting songs in a {chartEra.label.toLowerCase()} context.
          Scores come from the 19-theme lexicon and 384-dim semantic embedding.
          This page is data-first; for discovery-first context, start from <Link href={buildLangPath(`/lens/${year}`, locale, region)} className="underline decoration-dotted">/lens/{year}</Link>.
        </p>
      </header>

      <section className="mb-10">
        <SectionTitle subtitle="A short narrated summary (ElevenLabs, voice: Rachel).">
          The year in one paragraph
        </SectionTitle>
        <YearInsightPlayer year={year} />
      </section>

      <section className="mb-10">
        <SectionTitle subtitle="Weighted by chart rank and embedding match.">Theme cloud</SectionTitle>
        <ThemeCloud items={themes} />
      </section>

      <section className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Top themes</SectionTitle>
          <ul className="card divide-y divide-ink-800/60">
            {themes.length === 0 ? (
              <li className="p-5 text-sm text-ink-500">No theme data — run the enrichment pipeline.</li>
            ) : (
              themes.map((t) => (
                <li key={t.theme} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: THEME_COLORS[t.theme as Theme] ?? "#7dd3fc" }}
                    />
                    <Link
                      href={`/theme/${t.theme}`}
                      className="text-sm font-medium text-ink-100 hover:text-signal-300"
                    >
                      {THEME_LABELS[t.theme as Theme] ?? t.theme}
                    </Link>
                    <Link
                      href={`/graph?rootType=theme&rootId=versesignal:n:theme:${t.theme}`}
                      className="text-[10px] text-ink-500 hover:text-signal-300"
                      title="View in graph explorer"
                    >
                      graph
                    </Link>
                    <span className="text-xs text-ink-500">
                      {t.evidenceSongIds.length} song{t.evidenceSongIds.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="text-xs tabular-nums text-ink-300">{t.avgScore.toFixed(2)}</div>
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <SectionTitle>Dominant moods</SectionTitle>
          <ul className="card divide-y divide-ink-800/60">
            {moods.length === 0 ? (
              <li className="p-5 text-sm text-ink-500">No mood data — run the enrichment pipeline.</li>
            ) : (
              moods.map((m) => (
                <li key={m.mood} className="flex items-center justify-between p-4">
                  <span className="text-sm font-medium text-ink-100 capitalize">{m.mood}</span>
                  <div className="flex items-center gap-3">
                    <ConfidenceBar value={Math.min(1, m.avgScore / 10)} />
                    <span className="text-xs tabular-nums text-ink-300">{m.avgScore.toFixed(2)}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="mb-10">
        <SectionTitle>Top songs</SectionTitle>
        <ul className="card divide-y divide-ink-800/60">
          {songs.map((s) => (
            <li key={s.id} className="flex items-center gap-4 p-4">
              <div className="w-8 text-2xl font-semibold tabular-nums text-ink-500">
                {s.chartRank}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/song/${encodeURIComponent(s.id)}`}
                  className="block truncate text-sm font-medium text-ink-100 hover:text-signal-300"
                >
                  {s.title}
                </Link>
                <div className="truncate text-xs text-ink-400">{s.artist}</div>
              </div>
              <Link
                href={`/graph?rootType=song&rootId=versesignal:n:song:${s.id}`}
                className="rounded border border-ink-800 px-2.5 py-1 text-xs text-ink-300 transition hover:border-signal-700 hover:text-signal-200"
              >
                graph →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <YearGraphPeek year={year} />
    </main>
  );
}

function YearGraphPeek({ year }: { year: number }) {
  return (
    <section className="mb-10">
      <SectionTitle>Open the full graph for this year</SectionTitle>
      <div className="card p-6">
        <p className="mb-4 text-sm text-ink-300">
          The graph explorer will load all songs in {year}, the events whose windows overlap it,
          the dominant themes and moods, and the named entities detected in lyrics. Click any
          edge to see the lyric line and the model that produced the connection.
        </p>
      <Link
        href={`/graph?rootType=year&rootId=versesignal:n:year:${year}`}
        className="inline-block rounded-lg bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
      >
        Open {year} graph →
      </Link>
      </div>
    </section>
  );
}
