import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSongsByTheme, getThemeYearDistribution, getEventsByRelatedTheme, getThemeEraDelta } from "@/lib/db/queries";
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
  const eraDelta = getThemeEraDelta(theme);

  const totalSongs = songs.length;
  const topYear = yearDist.length > 0
    ? yearDist.reduce((a, b) => a.songCount > b.songCount ? a : b)
    : null;
  const topThemeSongs = songs.slice(0, 4);
  const topThemeConfidence = topThemeSongs.length > 0 ? topThemeSongs.reduce((sum, s) => sum + s.score, 0) / topThemeSongs.length : 0;

  // Build the "Why this theme recurs" narrative from real era deltas.
  // Per motto 0.1, the question is "why does this theme come back?"
  // — the answer is trend + delta, not raw counts.
  const whyReasons: string[] = [];
  if (eraDelta) {
    const recent = eraDelta.recentEra;
    const ref = eraDelta.referenceEra;
    const recentLabel = `${recent.start}–${recent.end}`;
    const refLabel = `${ref.start}–${ref.end}`;
    if (eraDelta.trend === "rising") {
      const pct = Math.round((eraDelta.songCountRatio - 1) * 100);
      whyReasons.push(
        `${label} is rising: ${recent.songCount} scored songs in ${recentLabel} vs ${ref.songCount} in ${refLabel} (+${pct}%).`
      );
    } else if (eraDelta.trend === "falling") {
      const pct = Math.round((1 - eraDelta.songCountRatio) * 100);
      whyReasons.push(
        `${label} is fading: ${recent.songCount} scored songs in ${recentLabel} vs ${ref.songCount} in ${refLabel} (-${pct}%).`
      );
    } else if (eraDelta.trend === "novel") {
      whyReasons.push(
        `${label} shows up in ${recentLabel} (${recent.songCount} songs) but was absent from the chart lexicon in ${refLabel}.`
      );
    } else {
      whyReasons.push(
        `${label} holds steady: ${recent.songCount} songs in ${recentLabel} vs ${ref.songCount} in ${refLabel}.`
      );
    }
    if (Math.abs(eraDelta.avgScoreDelta) > 0.02) {
      const direction = eraDelta.avgScoreDelta > 0 ? "more intense" : "less intense";
      const deltaPct = Math.abs(Math.round(eraDelta.avgScoreDelta * 100));
      whyReasons.push(
        `Average theme score is ${direction} in ${recentLabel} (${deltaPct} percentage points).`
      );
    }
  }
  // Always include a "peak context" so the narrative is grounded in a
  // specific year, not just ratios. The peak year is where chart
  // attention concentrated.
  if (topYear) {
    whyReasons.push(
      `Peak chart attention was in ${topYear.year} with ${topYear.songCount} scored songs (avg score ${(topYear.avgScore * 100).toFixed(0)}/100).`
    );
  }
  // Always include the scoring-honesty line so the user knows this
  // is score-derived, not lyrics-derived inference.
  whyReasons.push(
    `Top theme matches average a ${(topThemeConfidence * 100).toFixed(0)}% score — the strongest the lexicon produces for this theme.`
  );

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
          reasons={whyReasons}
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

      {eraDelta ? (
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Era trend
          </h2>
          <div className="mt-3 card p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-ink-400">
                <span className="font-semibold text-ink-100">{eraDelta.referenceEra.start}–{eraDelta.referenceEra.end}</span>
                {" · "}
                {eraDelta.referenceEra.songCount} songs
                {" · avg "}{(eraDelta.referenceEra.avgScore * 100).toFixed(0)}
              </span>
              <span className="text-ink-500">→</span>
              <span className="text-ink-400">
                <span className="font-semibold text-ink-100">{eraDelta.recentEra.start}–{eraDelta.recentEra.end}</span>
                {" · "}
                {eraDelta.recentEra.songCount} songs
                {" · avg "}{(eraDelta.recentEra.avgScore * 100).toFixed(0)}
              </span>
              {eraDelta.trend === "rising" ? (
                <Pill variant="signal">rising</Pill>
              ) : eraDelta.trend === "falling" ? (
                <Pill variant="warn">fading</Pill>
              ) : eraDelta.trend === "novel" ? (
                <Pill variant="signal">novel</Pill>
              ) : (
                <Pill variant="mute">stable</Pill>
              )}
            </div>
          </div>
        </section>
      ) : null}

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
