import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSongsByTheme, getThemeYearDistribution, getEventsByRelatedTheme } from "@/lib/db/queries";
import { THEME_LABELS, THEME_COLORS, THEME_DESCRIPTIONS } from "@/lib/nlp/theme-scoring";
import { Pill } from "@/components/ui/primitives";
import { StoryNextStep } from "@/components/story/story-next-step";
import { BecauseCard } from "@/components/evidence/because-card";
import type { EvidencePreviewItem } from "@/components/evidence/evidence-preview";
import type { Theme } from "@/lib/types";

const VALID_THEMES = new Set(Object.keys(THEME_LABELS));

function primaryArtist(value: string): string {
  return value
    .split(/\s+(?:featuring|feat\.?|ft\.?|with)\s+/i)[0]
    .split(/,\s*&\s*|\s+&\s+/)[0]
    .trim();
}

export async function generateMetadata({ params }: { params: { theme: string } }): Promise<Metadata> {
  const theme = params.theme as Theme;
  if (!VALID_THEMES.has(theme)) return { title: "Theme not found" };
  return {
    title: `${THEME_LABELS[theme]} — VerseSignal`,
    description: THEME_DESCRIPTIONS[theme],
    openGraph: {
      images: [{ url: `/api/og?type=theme&title=${encodeURIComponent(THEME_LABELS[theme])}&subtitle=${encodeURIComponent(THEME_DESCRIPTIONS[theme])}`, width: 1200, height: 630 }],
    },
  };
}

export default function ThemePage({ params }: { params: { theme: string } }) {
  const theme = params.theme as Theme;
  if (!VALID_THEMES.has(theme)) notFound();

  const label = THEME_LABELS[theme];
  const color = THEME_COLORS[theme];
  const description = THEME_DESCRIPTIONS[theme];

  const songs = getSongsByTheme(theme, 100);
  const yearDist = getThemeYearDistribution(theme);
  const events = getEventsByRelatedTheme(theme);

  const totalSongs = songs.length;
  const topYear = yearDist.length > 0
    ? yearDist.reduce((a, b) => a.songCount > b.songCount ? a : b)
    : null;
  const topThemeSongs = songs.slice(0, 4);
  const topThemeConfidence = topThemeSongs.length > 0 ? topThemeSongs.reduce((sum, s) => sum + s.score, 0) / topThemeSongs.length : 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</Link>

      <header className="mt-4 mb-10">
        <div className="flex items-center gap-2">
          <Pill variant="signal">THEME</Pill>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="inline-block h-5 w-5 rounded-full" style={{ backgroundColor: color }} />
          <h1 className="h-display text-4xl font-semibold tracking-tight md:text-5xl text-balance">
            {label}
          </h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300 text-pretty">
          {description}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-500">
          <span>{totalSongs} songs scored</span>
          {topYear ? (
            <span>Peak year: {topYear.year} ({topYear.songCount} songs)</span>
          ) : null}
          {yearDist.length > 0 ? (
            <span>Active across {yearDist.length} year{yearDist.length === 1 ? "" : "s"}</span>
          ) : null}
        </div>
      </header>

      <section className="mb-10">
        <BecauseCard
          claim={`Why ${label} is a recurring chart theme`}
          reasons={[
            `${totalSongs} songs had this theme as a top signal.`,
            topYear
              ? `Peak activity is in ${topYear.year} with ${topYear.songCount} songs.`
              : "Peak year is not currently available.",
            `Signal strength is strongest for top theme matches (${(topThemeConfidence * 100).toFixed(0)}% mean top score).`,
          ]}
          confidence={Math.min(0.98, Math.max(0.2, topThemeConfidence))}
          provenanceSources={["theme_scores", "hybrid"]}
          evidenceRows={topThemeSongs.map<EvidencePreviewItem>((s) => ({
            id: s.songId,
            title: "Representative song",
            text: `${s.title} — ${s.artist} (${s.year})`,
            source: "theme_scores",
            confidence: s.score,
            matchedTerms: [],
          }))}
          evidencePreviewTitle="Representative songs"
          caveat="Theme scoring is model-driven: strong matches suggest affinity, and high counts suggest cultural recurrence."
          inferenceType="theme_overlap"
        />
      </section>

      {yearDist.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Year distribution
          </h2>
          <div className="mt-3 card divide-y divide-ink-800/60">
            {yearDist.map((d) => {
              const maxCount = Math.max(...yearDist.map((y) => y.songCount));
              const barWidth = maxCount > 0 ? (d.songCount / maxCount) * 100 : 0;
              return (
                <Link key={d.year} href={`/lens/${d.year}`} className="flex items-center gap-4 p-3 text-sm hover:bg-ink-800/30">
                  <span className="w-16 font-semibold tabular-nums text-ink-100">
                    {d.year}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                      <span className="tabular-nums text-ink-400">{d.songCount}</span>
                    </div>
                  </div>
                  <span className="text-xs text-ink-500">
                    avg {(d.avgScore * 100).toFixed(0)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Events connected to this theme
          </h2>
          <div className="mt-3 space-y-2">
            {events.map((ev) => (
              <Link key={ev.id} href={`/event/${encodeURIComponent(ev.id)}`} className="card flex items-center gap-3 p-3 text-sm hover:border-ink-600">
                <Pill variant="echo">{ev.category}</Pill>
                <span className="text-ink-100">{ev.name}</span>
                <span className="ml-auto text-xs text-ink-500">{ev.startDate}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Songs scored for this theme ({songs.length})
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-400">
          Sorted by theme score. The score reflects how strongly the song&apos;s lyrics match the theme lexicon.
        </p>
        <ol className="card divide-y divide-ink-800/60">
          {songs.length === 0 ? (
            <li className="p-5 text-sm text-ink-500">
              No songs scored for this theme yet. Run the enrichment pipeline.
            </li>
          ) : (
            songs.slice(0, 100).map((s, i) => (
              <li key={s.songId} className="flex items-center gap-2 p-3 text-sm md:gap-3">
                <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-500 md:w-6">
                  {i + 1}
                </span>
                <Link
                  href={`/song/${encodeURIComponent(s.songId)}`}
                  className="min-w-0 flex-1 truncate text-ink-100 hover:text-signal-300"
                >
                  {s.title}
                </Link>
                <span className="text-ink-500">
                  <Link href={`/artist/${encodeURIComponent(primaryArtist(s.artist))}`} className="hover:text-signal-300">
                    — {primaryArtist(s.artist)}
                  </Link>
                </span>
                <span className="hidden shrink-0 text-xs text-ink-500 md:inline">{s.year}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-400 md:w-16">
                  {(s.score * 100).toFixed(0)}
                </span>
                <div className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink-800 md:block">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, s.score * 200)}%`, backgroundColor: color }} />
                </div>
              </li>
            ))
          )}
        </ol>
        {songs.length > 100 ? (
          <p className="mt-3 text-xs text-ink-500">
            Showing top 100 of {songs.length} songs.
          </p>
        ) : null}
      </section>

      <StoryNextStep />
    </main>
  );
}
