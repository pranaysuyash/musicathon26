import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Compass, FileSearch, Globe, Search, Sparkles } from "lucide-react";
import { getAllEvents, getAllYears, getEraOverview, getYearSignals } from "@/lib/db/queries";
import { initDb } from "@/lib/db";
import { Pill } from "@/components/ui/primitives";
import { SignalSeismograph } from "@/components/home/signal-seismograph";
import { CompareErasWidget } from "@/components/home/compare-eras-widget";
import { t, resolveLocale, localePairs, type Locale } from "@/lib/i18n/strings";

function buildLangPath(path: string, locale: Locale, query?: Record<string, string>) {
  const params = new URLSearchParams(query);
  if (locale !== "en") {
    params.set("lang", locale);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function buildLangEventPath(id: string, locale: Locale) {
  return buildLangPath(`/event/${encodeURIComponent(id)}`, locale);
}

export const metadata: Metadata = {
  title: "Songs, signals, and cultural context",
  description:
    "Browse the current 2018–2023 seeded demo slice of the long-term VerseSignal corpus (1960s–2023) through the lens of lyrics, themes, artists, moods, entities, and cultural context.",
  openGraph: {
    images: [{ url: "/api/og?type=default", width: 1200, height: 630 }],
  },
};
export const dynamic = "force-dynamic";

export default function Home({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  initDb();
  const locale = resolveLocale(searchParams.lang);
  const events = getAllEvents();
  const yearCounts = getAllYears("US");
  const totalSongs = yearCounts.reduce((a, b) => a + b.songCount, 0);
  const eraOverview = getEraOverview("US");
  const erasWithSongs = eraOverview.filter((e) => e.songCount > 0);
  const seismographSignals = getYearSignals(2020, "US", 12)
    .filter((s) => s.signalType === "theme" || s.signalType === "mood" || s.signalType === "entity")
    .sort((a, b) => b.songCount - a.songCount)
    .slice(0, 6)
    .map((s) => ({
      signal: s.signal,
      score: s.score,
      songCount: s.songCount,
      signalType: s.signalType as "theme" | "mood" | "entity",
    }));

  const entryModes = [
    {
      eyebrow: "Feeling first",
      title: "Search a mood, lyric, or half-remembered phrase",
      description:
        "Start with a feeling and let the corpus return songs, years, and contexts that rhyme with it instead of matching it literally.",
      href: buildLangPath("/ask", locale, { q: "lonely city nights" }),
      cta: "Search by feel",
      accent: "from-signal-500/25 via-signal-500/10 to-transparent",
      chips: ["lonely city nights", "rage after injustice", "party through collapse"],
      icon: Search,
    },
    {
      eyebrow: "Year first",
      title: "Drop into 2020 and read the signal before the explanation",
      description:
        "Open the clearest anomaly window in the demo corpus and watch the year lens separate direct evidence from cultural echo.",
      href: buildLangPath("/lens/2020", locale),
      cta: "Open 2020",
      accent: "from-echo-500/20 via-echo-500/10 to-transparent",
      chips: ["signal-led", "lyrics first", "context later"],
      icon: Compass,
    },
    {
      eyebrow: "Context first",
      title: "Test COVID, Ukraine, or another candidate explanation",
      description:
        "Event pages now behave like a signal trial: direct lyric evidence, pre-event resonance, and the weaker echoes stay separated.",
      href: buildLangEventPath("versesignal:ev:covid_19", locale),
      cta: "Inspect a trial",
      accent: "from-strength-high/20 via-signal-500/10 to-transparent",
      chips: ["direct evidence", "temporal shift", "weak echoes"],
      icon: Sparkles,
    },
    {
      eyebrow: "Atlas first",
      title: "Read the cultural weather map",
      description:
        "Use the globe when you want to see where the corpus is hot, thin, or still ambiguous across regions.",
      href: buildLangPath("/globe", locale),
      cta: "Open the atlas",
      accent: "from-warn-500/20 via-echo-500/10 to-transparent",
      chips: ["regional pulse", "uncertainty", "signal weather"],
      icon: Globe,
    },
  ];

  const featuredEvents = [
    "versesignal:ev:covid_19",
    "versesignal:ev:blm_2020",
    "versesignal:ev:ukraine_war",
    "versesignal:ev:spotify_ipo",
  ]
    .map((id) => events.find((event) => event.id === id))
    .filter(Boolean);

  const heroNodes = [
    { label: "feeling", value: "lonely city nights", x: 18, y: 28, tone: "signal" },
    { label: "year", value: "2020", x: 56, y: 14, tone: "echo" },
    { label: "context", value: "COVID-19", x: 76, y: 41, tone: "warn" },
    { label: "region", value: "US", x: 42, y: 68, tone: "signal" },
    { label: "proof", value: "direct lyric evidence", x: 24, y: 82, tone: "strength" },
  ] as const;

  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <section className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => (
          <a
            key={code}
            href={buildLangPath("/", code)}
            className={`rounded-full border px-2.5 py-1 transition ${
              locale === code
                ? "border-signal-300 bg-signal-300/10 text-signal-200"
                : "border-ink-700 text-ink-400 hover:border-signal-300/70 hover:text-signal-200"
            }`}
          >
            {t(locale, key)}
          </a>
        ))}
        <span className="ml-auto rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-ink-500">
          playable cultural signal room
        </span>
      </section>

      <section className="relative isolate overflow-hidden rounded-[2.5rem] border border-ink-800 bg-[linear-gradient(145deg,rgba(9,11,18,0.98),rgba(7,8,14,0.92))] px-5 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_42px_120px_-60px_rgba(14,165,233,0.45)] sm:px-6 lg:px-8 lg:py-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-28 top-0 h-80 w-80 rounded-full bg-signal-500/16 blur-3xl" />
          <div className="absolute right-[-5rem] top-12 h-96 w-96 rounded-full bg-echo-500/14 blur-3xl" />
          <div className="absolute left-1/2 top-24 h-56 w-56 -translate-x-1/2 rounded-full bg-warn-500/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
        </div>

        <div className="relative grid gap-8 xl:grid-cols-[1.02fr_0.98fr] xl:items-stretch">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-ink-400">
              <Pill variant="signal" className="border-signal-500/40 bg-signal-900/20">
                VerseSignal
              </Pill>
              <span>music as cultural evidence</span>
            </div>

            <h1 className="h-display mt-6 max-w-3xl text-5xl leading-[0.94] text-balance text-ink-50 md:text-7xl lg:text-8xl">
              {t(locale, "home.hero-subtitle")}
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-pretty text-ink-300">
              Start with a feeling, a year, an event, or a region. VerseSignal turns it into a cultural signal
              and then asks the songs to justify the story.
            </p>

            <form action={buildLangPath("/ask", locale)} method="GET" className="mt-8">
              <label className="text-xs uppercase tracking-[0.26em] text-ink-500">
                Search a feeling, lyric, event, or year
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-ink-800 bg-ink-950/70 px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                  <Search className="h-4 w-4 shrink-0 text-ink-500" />
                  <input
                    type="text"
                    name="q"
                    placeholder='e.g. "lonely city nights"'
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-signal-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-signal-400"
                >
                  Search by feel
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-2 rounded-[1.5rem] border border-ink-800 bg-ink-950/45 px-4 py-3">
              {[
                { label: "search", value: "feeling first" },
                { label: "graph", value: "routes with evidence" },
                { label: "globe", value: "regional weather" },
              ].map((item) => (
                <div key={item.label} className="rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1.5">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-500">{item.label}</p>
                  <p className="text-xs text-ink-200">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {entryModes.slice(0, 2).map((mode) => (
                <Link
                  key={mode.title}
                  href={mode.href}
                  className="rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-signal-400/40 hover:text-signal-100"
                >
                  {mode.chips[0]}
                </Link>
              ))}
              <Link
                href={buildLangPath("/ask", locale, { q: "pandemic isolation" })}
                className="rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-echo-400/40 hover:text-echo-100"
              >
                pandemic isolation
              </Link>
              <Link
                href={buildLangPath("/ask", locale, { q: "rage after injustice" })}
                className="rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-echo-400/40 hover:text-echo-100"
              >
                rage after injustice
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <MetricChip value={totalSongs.toString()} label="songs indexed" />
              <MetricChip value={yearCounts.length.toString()} label="years in view" />
              <MetricChip value={events.length.toString()} label="candidate contexts" />
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-ink-700/80 bg-ink-950/80 shadow-[0_24px_80px_-40px_rgba(14,165,233,0.45)]">
            <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="relative min-h-[340px] overflow-hidden border-b border-ink-800 xl:border-b-0 xl:border-r">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.18),transparent_32%),radial-gradient(circle_at_78%_24%,rgba(217,70,239,0.16),transparent_28%),linear-gradient(180deg,rgba(8,10,16,0.96),rgba(7,9,14,0.9))]" />
                <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:100%_56px,56px_100%] [mask-image:radial-gradient(circle_at_center,black_58%,transparent_100%)]" />
                <div className="relative flex h-full flex-col p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Signal core</p>
                      <p className="mt-1 text-sm text-ink-300">A visual map of how the app wants to be used.</p>
                    </div>
                    <Pill variant="mute" className="border-ink-700 bg-ink-900/80 text-ink-200">
                      Live data
                    </Pill>
                  </div>
                  <div className="relative mt-5 flex flex-1 items-center justify-center rounded-[1.6rem] border border-ink-800 bg-ink-950/35 p-4">
                    <SignalOrbitalMap nodes={heroNodes} />
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      { label: "Direct", value: "lyrics that name a context" },
                      { label: "Shift", value: "moods moving before the event" },
                      { label: "Echo", value: "signals that rhyme without overclaiming" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-ink-800 bg-ink-950/65 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-ink-300">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col">
                <div className="border-b border-ink-800 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Signal seismograph</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-ink-300">
                    2020 is the clearest anomaly window in the seeded corpus. The seismograph previews the year
                    lens without hiding the edge cases.
                  </p>
                  <div className="mt-4">
                    <SignalSeismograph year={2020} signals={seismographSignals} maxSignals={6} />
                  </div>
                </div>
                <div className="grid flex-1 gap-3 p-5 sm:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-ink-800 bg-ink-950/65 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink-500">What to ask</p>
                    <p className="mt-3 text-sm leading-6 text-ink-300">
                      Type a feeling first, then compare it with a year or a context. That order keeps the
                      discovery playful and keeps the claim honest.
                    </p>
                  </div>
                  <div className="rounded-[1.5rem] border border-ink-800 bg-ink-950/65 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink-500">What to trust</p>
                    <p className="mt-3 text-sm leading-6 text-ink-300">
                      Direct lyric evidence, pre-event resonance, and graph edges stay separated so the app can
                      say “maybe,” “likely,” or “not enough” without blurring them together.
                    </p>
                  </div>
                  <div className="sm:col-span-2 rounded-[1.5rem] border border-ink-800 bg-ink-950/65 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Interpretation rule</p>
                    <p className="mt-3 text-sm leading-6 text-ink-300">
                      Every surface keeps the evidence visible. The UI should feel lush, but the underlying proof
                      still has to be auditable.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Entry modes</p>
            <h2 className="h-display mt-2 text-3xl md:text-4xl">
              Choose the kind of curiosity you want to reward
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-400">
              Each doorway starts from a different move: sensation, chronology, verification, or region.
            </p>
          </div>
          <Link
            href={buildLangPath("/graph", locale)}
            className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
          >
            Open the raw graph
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {entryModes.map((mode, index) => {
            const Icon = mode.icon;
            return (
              <Link
                key={mode.title}
                href={mode.href}
                className="group relative overflow-hidden rounded-[1.9rem] border border-ink-800 bg-[linear-gradient(160deg,rgba(11,12,18,0.96),rgba(8,10,16,0.9))] p-5 transition duration-300 hover:-translate-y-1 hover:border-signal-400/40"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${mode.accent}`} />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-ink-800 bg-ink-950/65 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-ink-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xs uppercase tracking-[0.22em] text-ink-500">{mode.eyebrow}</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-800 bg-ink-950/80">
                      <Icon className="h-4 w-4 text-ink-300" />
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-ink-50 text-balance">
                    {mode.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ink-300">{mode.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {mode.chips.map((chip) => (
                      <span key={chip} className="rounded-full border border-ink-800 bg-ink-950/65 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-ink-400">
                        {chip}
                      </span>
                    ))}
                  </div>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-signal-200 transition group-hover:text-signal-100">
                    {mode.cta}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] border border-ink-800 bg-ink-900/55 p-5 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Era mosaic</p>
            <h2 className="h-display mt-2 text-2xl md:text-3xl">
              {erasWithSongs.length} cultural eras across 64 years, not a wall of year tiles
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-400">
              Each era card summarizes its song count, top mood, top theme, top named entity, and context
              coverage so you can pick a starting point by feel instead of scrolling through identical year tiles.
            </p>
          </div>
          <Link
            href={buildLangPath("/scrub", locale)}
            className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
          >
            Scrub the timeline
            <FileSearch className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {erasWithSongs.map((era, index) => (
            <Link
              key={era.eraId}
              href={buildLangPath(`/lens/${era.eraStart}`, locale)}
              className="group relative flex flex-col overflow-hidden rounded-[1.55rem] border border-ink-800 bg-ink-950/60 p-5 transition hover:-translate-y-0.5 hover:border-signal-400/40"
            >
              <div
                className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${
                  index % 3 === 0
                    ? "from-signal-500/80 via-signal-300/80 to-transparent"
                    : index % 3 === 1
                      ? "from-echo-500/80 via-echo-300/80 to-transparent"
                      : "from-warn-500/80 via-amber-300/80 to-transparent"
                }`}
              />
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold tracking-tight text-ink-50">{era.eraLabel}</span>
                <span className="text-xs uppercase tracking-[0.22em] text-ink-500">
                  {era.eraStart}–{era.eraEnd}
                </span>
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.22em] text-ink-500">
                {era.comparability} comparability
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-ink-500">Songs</p>
                  <p className="mt-0.5 text-base font-semibold text-ink-100">{era.songCount}</p>
                </div>
                <div>
                  <p className="text-ink-500">Events</p>
                  <p className="mt-0.5 text-base font-semibold text-ink-100">{era.eventCount}</p>
                </div>
                <div>
                  <p className="text-ink-500">Top mood</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-200">{era.topMood ?? "no signal yet"}</p>
                </div>
                <div>
                  <p className="text-ink-500">Top theme</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-200">{era.topTheme ?? "no signal yet"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-ink-500">Top entity</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-200">{era.topEntity ?? "no signal yet"}</p>
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-signal-200 transition group-hover:text-signal-100">
                Open {era.eraStart}
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Compare any two eras</p>
              <p className="mt-1 text-sm text-ink-400">
                Different chart machines, not just different dates. Pick two eras and see what stayed and what changed.
              </p>
            </div>
          </div>
          <CompareErasWidget
            eras={eraOverview.map((era) => ({
              id: era.eraId,
              start: era.eraStart,
              end: era.eraEnd,
              label: era.eraLabel,
            }))}
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Signal trial</p>
            <h2 className="h-display mt-2 text-2xl md:text-3xl">Candidate contexts to verify against the anomaly</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-400">
              These pages are not assumptions. They are hypotheses that only become credible if the songs,
              signal shifts, and graph edges can support them.
            </p>
          </div>
          <Link
            href={buildLangPath("/graph", locale, {
              rootType: "event",
              rootId: "versesignal:n:event:versesignal:ev:covid_19",
              hops: "2",
            })}
            className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
          >
            See verification graph
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {featuredEvents.map((event, index) => {
            if (!event) return null;
            return (
              <Link
                key={event.id}
                href={buildLangEventPath(event.id, locale)}
                className="group relative min-h-[15rem] overflow-hidden rounded-[1.75rem] border border-ink-800 bg-[linear-gradient(170deg,rgba(11,12,18,0.96),rgba(8,10,16,0.9))] p-5 transition hover:-translate-y-0.5 hover:border-echo-400/40"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${
                    index === 0
                      ? "from-echo-500/16 via-transparent to-signal-500/10"
                      : index === 1
                        ? "from-signal-500/16 via-transparent to-echo-500/10"
                        : index === 2
                          ? "from-strength-high/16 via-transparent to-signal-500/10"
                          : "from-warn-500/16 via-transparent to-echo-500/10"
                  }`}
                />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <Pill variant="echo" className="border-echo-500/40 bg-echo-900/20">
                      {event.category}
                    </Pill>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
                      {event.startDate} → {event.endDate ?? "present"}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink-50 text-balance">
                    {event.name}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ink-300">{event.description}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    <span className="rounded-full border border-ink-800 bg-ink-950/65 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-ink-400">
                      hypothesis
                    </span>
                    <span className="rounded-full border border-ink-800 bg-ink-950/65 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-ink-400">
                      evidence-backed
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-ink-800 bg-ink-900/55 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="text-3xl font-semibold tracking-tight text-ink-50">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-ink-500">{label}</div>
    </div>
  );
}

function SignalOrbitalMap({
  nodes,
}: {
  nodes: ReadonlyArray<{
    label: string;
    value: string;
    x: number;
    y: number;
    tone: "signal" | "echo" | "warn" | "strength";
  }>;
}) {
  const toneStyles: Record<(typeof nodes)[number]["tone"], string> = {
    signal: "stroke-signal-400 fill-signal-400",
    echo: "stroke-echo-400 fill-echo-400",
    warn: "stroke-amber-300 fill-amber-300",
    strength: "stroke-emerald-300 fill-emerald-300",
  };

  return (
    <svg viewBox="0 0 100 100" className="h-[280px] w-full max-w-[520px] overflow-visible">
      <defs>
        <radialGradient id="signal-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(56,189,248,0.95)" />
          <stop offset="55%" stopColor="rgba(14,165,233,0.42)" />
          <stop offset="100%" stopColor="rgba(14,165,233,0)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="30" fill="url(#signal-core)" opacity="0.88" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 2" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.07)" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" />

      <path d="M18 28 L56 14 L76 42" fill="none" stroke="rgba(125,211,252,0.35)" strokeWidth="0.9" />
      <path d="M56 14 L42 68 L18 82" fill="none" stroke="rgba(196,123,244,0.34)" strokeWidth="0.9" />
      <path d="M76 42 L42 68 L18 28" fill="none" stroke="rgba(251,191,36,0.24)" strokeWidth="0.9" />

      {nodes.map((node) => {
        const cx = node.x;
        const cy = node.y;
        return (
          <g key={node.label}>
            <circle cx={cx} cy={cy} r="3.8" className={toneStyles[node.tone]} strokeWidth="0.8" opacity="0.95" />
            <circle cx={cx} cy={cy} r="7" fill="none" className={toneStyles[node.tone]} opacity="0.22" />
            <text
              x={cx}
              y={cy - 7}
              textAnchor="middle"
              className="fill-ink-300"
              style={{ fontSize: "3px", letterSpacing: "0.18em", textTransform: "uppercase" }}
            >
              {node.label}
            </text>
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              className="fill-ink-50"
              style={{ fontSize: "4px", fontWeight: 600 }}
            >
              {node.value}
            </text>
          </g>
        );
      })}

      <circle cx="50" cy="50" r="3.4" fill="#e2f5ff" opacity="0.95" />
      <circle cx="50" cy="50" r="10" fill="none" stroke="rgba(255,255,255,0.16)" strokeDasharray="1.5 1.5" />
    </svg>
  );
}
