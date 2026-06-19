import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { initDb } from "@/lib/db";
import {
  getYearAvailability,
  getYearSignals,
  getSongsByYear,
  getEventsForYear,
  REGION_LABELS,
  getChartEraForYear,
} from "@/lib/db/queries";
import { nodeEra } from "@/lib/graph/ids";
import { BecauseCard } from "@/components/evidence/because-card";
import type { EvidencePreviewItem } from "@/components/evidence/evidence-preview";
import { Pill, SectionTitle } from "@/components/ui/primitives";
import { resolveLocale, localePairs, t, type Locale } from "@/lib/i18n/strings";

function buildLangPath(path: string, locale: Locale, region: string) {
  const params = new URLSearchParams();
  if (locale !== "en") params.set("lang", locale);
  if (region !== "US") params.set("region", region);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function signalKey(signalType: string, signal: string) {
  return `${signalType}:${signal}`;
}

function topSignalsByType(signals: ReturnType<typeof getYearSignals>) {
  return {
    themes: signals.filter((s) => s.signalType === "theme").slice(0, 5),
    moods: signals.filter((s) => s.signalType === "mood").slice(0, 5),
    entities: signals.filter((s) => s.signalType === "entity").slice(0, 5),
  };
}

function sharedSignals(
  left: ReturnType<typeof getYearSignals>,
  right: ReturnType<typeof getYearSignals>,
) {
  type YearSignal = ReturnType<typeof getYearSignals>[number];
  type SharedSignal = {
    signalType: YearSignal["signalType"];
    signal: string;
    leftScore: number;
    rightScore: number;
    score: number;
  };
  const rightMap = new Map<string, YearSignal>(right.map((s) => [signalKey(s.signalType, s.signal), s] as const));
  const mapped: Array<SharedSignal | null> = left
    .map((s) => {
      const match = rightMap.get(signalKey(s.signalType, s.signal));
      if (!match) return null;
      return {
        signalType: s.signalType,
        signal: s.signal,
        leftScore: s.score,
        rightScore: match.score,
        score: Math.max(s.score, match.score),
      };
    });
  return mapped
    .filter((s): s is SharedSignal => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function distinctSignals(
  source: ReturnType<typeof getYearSignals>,
  other: ReturnType<typeof getYearSignals>,
) {
  const otherKeys = new Set(other.map((s) => signalKey(s.signalType, s.signal)));
  return source.filter((s) => !otherKeys.has(signalKey(s.signalType, s.signal))).slice(0, 6);
}

export async function generateMetadata({
  params,
}: {
  params: { from: string; to: string };
}): Promise<Metadata> {
  const from = Number(params.from);
  const to = Number(params.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { title: "Compare years" };
  return {
    title: `${from} vs ${to} — VerseSignal comparison`,
    description: `Compare ${from} and ${to} across themes, moods, artists, events, and chart-era context.`,
  };
}

export default function ComparePage({
  params,
  searchParams,
}: {
  params: { from: string; to: string };
  searchParams: { region?: string; lang?: string };
}) {
  initDb();
  const fromYear = Number(params.from);
  const toYear = Number(params.to);
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) notFound();

  const locale = resolveLocale(searchParams.lang);
  const region = (searchParams.region ?? "US") in REGION_LABELS ? (searchParams.region ?? "US") : "US";
  const fromAvailability = getYearAvailability(fromYear, region);
  const toAvailability = getYearAvailability(toYear, region);
  if (!fromAvailability || !toAvailability) notFound();

  const fromEra = getChartEraForYear(fromYear);
  const toEra = getChartEraForYear(toYear);
  const fromSignals = getYearSignals(fromYear, region, 24);
  const toSignals = getYearSignals(toYear, region, 24);
  const fromSongs = getSongsByYear(fromYear, region, 8);
  const toSongs = getSongsByYear(toYear, region, 8);
  const fromEvents = getEventsForYear(fromYear, region);
  const toEvents = getEventsForYear(toYear, region);
  const fromTop = topSignalsByType(fromSignals);
  const toTop = topSignalsByType(toSignals);
  const shared = sharedSignals(fromSignals, toSignals);
  const fromOnly = distinctSignals(fromSignals, toSignals);
  const toOnly = distinctSignals(toSignals, fromSignals);
  const presets = [
    { label: "1969 vs 2020", href: buildLangPath("/compare/1969/2020", locale, region) },
    { label: "1985 vs 2020", href: buildLangPath("/compare/1985/2020", locale, region) },
    { label: "2020 vs 2023", href: buildLangPath("/compare/2020/2023", locale, region) },
  ];

  const leftGraphHref = `/graph?rootType=era&rootId=${encodeURIComponent(nodeEra(fromEra.id))}&hops=2`;
  const rightGraphHref = `/graph?rootType=era&rootId=${encodeURIComponent(nodeEra(toEra.id))}&hops=2`;

  const sharedSummary = shared.length > 0
    ? `Shared signal vocabulary: ${shared.slice(0, 4).map((s) => s.signal).join(", ")}.`
    : "No strong signal vocabulary overlap in the top 24 signals.";

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => (
          <a
            key={code}
            href={buildLangPath(`/compare/${fromYear}/${toYear}`, code, region)}
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

      <Link href={buildLangPath("/", locale, region)} className="text-xs text-ink-400 hover:text-ink-200">
        ← VerseSignal home
      </Link>

      <header className="mt-4 mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="signal">COMPARE</Pill>
          <Pill variant="mute">{REGION_LABELS[region]}</Pill>
          <Pill variant="mute">{fromEra.label}</Pill>
          <Pill variant="mute">{toEra.label}</Pill>
        </div>
        <h1 className="h-display mt-4 text-5xl font-semibold tracking-tight md:text-7xl">
          {fromYear} vs {toYear}
        </h1>
        <p className="mt-3 max-w-4xl text-lg text-ink-300">
          Compare two chart moments as different cultural machines, not just different dates.
          The era labels matter because Billboard, radio, downloads, and streaming do not measure the same thing.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="text-ink-500">Quick comparisons:</span>
          {presets.map((preset) => (
            <Link
              key={preset.label}
              href={preset.href}
              className="rounded-full border border-ink-700 px-2.5 py-1 text-ink-300 transition hover:border-signal-400/60 hover:text-signal-100"
            >
              {preset.label}
            </Link>
          ))}
        </div>
      </header>

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <CompareCard
          year={fromYear}
          era={fromEra}
          availability={fromAvailability}
          signals={fromSignals}
          songs={fromSongs}
          events={fromEvents}
          locale={locale}
          region={region}
          graphHref={leftGraphHref}
        />
        <CompareCard
          year={toYear}
          era={toEra}
          availability={toAvailability}
          signals={toSignals}
          songs={toSongs}
          events={toEvents}
          locale={locale}
          region={region}
          graphHref={rightGraphHref}
        />
      </section>

      <section className="mb-8 rounded-[2rem] border border-ink-800 bg-gradient-to-br from-signal-900/10 via-ink-900/40 to-echo-900/10 p-6">
        <SectionTitle subtitle="Shared and distinct signals make the comparison legible.">
          What overlaps, what diverges
        </SectionTitle>
        <BecauseCard
          claim={`Why ${fromYear} and ${toYear} are not the same cultural instrument`}
          reasons={[
            `${fromYear} lives in ${fromEra.label} with ${fromAvailability.songCount} indexed songs; ${toYear} lives in ${toEra.label} with ${toAvailability.songCount} indexed songs.`,
            `Top signals start at ${fromTop.themes[0]?.signal ?? "n/a"} for ${fromYear} and ${toTop.themes[0]?.signal ?? "n/a"} for ${toYear}.`,
            sharedSummary,
            fromOnly.length > 0 ? `Distinct ${fromYear} signals: ${fromOnly.slice(0, 3).map((s) => s.signal).join(", ")}.` : `No unique high-signal items remained for ${fromYear} after overlap filtering.`,
            toOnly.length > 0 ? `Distinct ${toYear} signals: ${toOnly.slice(0, 3).map((s) => s.signal).join(", ")}.` : `No unique high-signal items remained for ${toYear} after overlap filtering.`,
          ]}
          confidence={Math.min(0.92, 0.42 + Math.min(0.48, shared.length / 12))}
          provenanceSources={["billboard", "chart_era_context", "theme_scores", "mood_scores", "entity_mentions"]}
          evidenceRows={[
            ...fromSongs.slice(0, 2).map<EvidencePreviewItem>((song) => ({
              id: song.id,
              title: `${fromYear} representative song`,
              text: `${song.title} — ${song.artist}`,
              source: "chart_entry",
              matchedTerms: [],
            })),
            ...toSongs.slice(0, 2).map<EvidencePreviewItem>((song) => ({
              id: song.id,
              title: `${toYear} representative song`,
              text: `${song.title} — ${song.artist}`,
              source: "chart_entry",
              matchedTerms: [],
            })),
          ]}
          evidencePreviewTitle="Representative songs"
          caveat="This is a signal comparison, not a claim that both years measure the same cultural system."
        />
      </section>
    </main>
  );
}

function CompareCard({
  year,
  era,
  availability,
  signals,
  songs,
  events,
  locale,
  region,
  graphHref,
}: {
  year: number;
  era: ReturnType<typeof getChartEraForYear>;
  availability: NonNullable<ReturnType<typeof getYearAvailability>>;
  signals: ReturnType<typeof getYearSignals>;
  songs: ReturnType<typeof getSongsByYear>;
  events: ReturnType<typeof getEventsForYear>;
  locale: Locale;
  region: string;
  graphHref: string;
}) {
  const topThemes = signals.filter((s) => s.signalType === "theme").slice(0, 4);
  const topMoods = signals.filter((s) => s.signalType === "mood").slice(0, 4);
  const topEntities = signals.filter((s) => s.signalType === "entity").slice(0, 4);

  return (
    <article className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-6 shadow-[0_24px_80px_-60px_rgba(14,165,233,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="signal">{year}</Pill>
          <Pill variant="mute">{era.label}</Pill>
        </div>
        <Link href={buildLangPath(`/lens/${year}`, locale, region)} className="text-sm font-medium text-signal-200 hover:text-signal-100">
          Open lens
        </Link>
      </div>

      <p className="mt-3 text-sm text-ink-300">
        {availability.songCount} songs indexed · {availability.chartSource} · {era.sourceMode}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
        <Metric label="songs" value={String(availability.songCount)} />
        <Metric label="themes" value={String(topThemes.length)} />
        <Metric label="events" value={String(events.length)} />
      </div>

      <div className="mt-5 space-y-4">
        <SignalBlock title="Top themes" items={topThemes} />
        <SignalBlock title="Top moods" items={topMoods} />
        <SignalBlock title="Top entities" items={topEntities} />
      </div>

      <div className="mt-5 rounded-2xl border border-ink-800 bg-ink-900/40 p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-ink-500">Top songs</p>
        <ol className="mt-3 space-y-2">
          {songs.slice(0, 4).map((song) => (
            <li key={song.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/song/${encodeURIComponent(song.id)}`} className="block truncate text-sm font-medium text-ink-100 hover:text-signal-300">
                  {song.title}
                </Link>
                <p className="truncate text-xs text-ink-500">{song.artist}</p>
              </div>
              <span className="text-xs tabular-nums text-ink-400">#{song.chartRank}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={graphHref} className="rounded-full border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 hover:border-signal-400/60 hover:text-signal-100">
          Open era graph
        </Link>
        <Link href={buildLangPath(`/year/${year}`, locale, region)} className="rounded-full border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-200 hover:border-signal-400/60 hover:text-signal-100">
          Open year view
        </Link>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-100">{value}</p>
    </div>
  );
}

function SignalBlock({
  title,
  items,
}: {
  title: string;
  items: ReturnType<typeof getYearSignals>;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.22em] text-ink-500">{title}</p>
      <ul className="mt-2 space-y-2">
        {items.length > 0 ? items.map((item) => (
          <li key={`${item.signalType}:${item.signal}`} className="rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-100">{item.signal}</span>
              <span className="text-xs tabular-nums text-ink-400">{item.score.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink-500">{item.signalType}</p>
          </li>
        )) : (
          <li className="rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2 text-sm text-ink-500">No signal yet.</li>
        )}
      </ul>
    </div>
  );
}
