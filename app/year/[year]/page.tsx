import { notFound } from "next/navigation";
import Link from "next/link";
import { getSongsByYear, getYearThemes, getYearMoods } from "@/lib/db/queries";
import { initDb } from "@/lib/db";
import { DEMO_YEARS } from "@/data/chart-seed";
import { ThemeCloud } from "@/components/lens/theme-cloud";
import { Pill, SectionTitle, ConfidenceBar } from "@/components/ui/primitives";
import { THEME_LABELS, THEME_COLORS } from "@/lib/nlp/theme-scoring";
import { YearInsightPlayer } from "@/components/lens/year-insight-player";
import type { Theme, Mood } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { year: string };
}

export default function YearPage({ params }: PageProps) {
  initDb();
  const year = parseInt(params.year, 10);
  if (!DEMO_YEARS.includes(year)) notFound();
  const songs = getSongsByYear(year, "US");
  const themes = getYearThemes(year, "US", 8);
  const moods = getYearMoods(year, "US", 6);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</Link>
      <header className="mt-4 mb-10">
        <div className="flex items-center gap-3">
          <Pill variant="signal">YEAR LENS</Pill>
          <Pill variant="mute">U.S. Billboard Hot 100 · top 25</Pill>
        </div>
        <h1 className="h-display mt-4 text-6xl font-semibold tracking-tight md:text-7xl">
          {year}
        </h1>
        <p className="mt-3 max-w-2xl text-ink-300 text-pretty">
          {songs.length} charting songs, scored against a 19-theme lexicon and a 384-dim semantic
          embedding. Click a theme to see which songs drove it.
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
                      href={`/graph?rootType=theme&rootId=versesignal:n:theme:${t.theme}`}
                      className="text-sm font-medium text-ink-100 hover:text-signal-300"
                    >
                      {THEME_LABELS[t.theme as Theme] ?? t.theme}
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
          href={`/graph?rootType=year&rootId=versesignal:year:${year}`}
          className="inline-block rounded-lg bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
        >
          Open {year} graph →
        </Link>
      </div>
    </section>
  );
}
