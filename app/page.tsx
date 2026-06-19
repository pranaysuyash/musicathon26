import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Compass, FileSearch, Globe } from "lucide-react";
import { getAllEvents, getAllYears, getEraOverview } from "@/lib/db/queries";
import { initDb } from "@/lib/db";
import { StoryJourney } from "@/components/story/story-journey";
import { Pill } from "@/components/ui/primitives";
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
  title: "Songs by year, themes, and world events",
  description:
    "Browse the current 2018–2023 seeded demo slice of the long-term VerseSignal corpus (1960s–2023) through the lens of lyrics, themes, artists, moods, and world events.",
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

  const discoveryRoutes = [
    {
      eyebrow: "Route 01",
      title: "Start with 2020, then let the signals argue back",
      description:
        "Open the lyric-first lens and watch the song mood arrive before the event story catches up.",
      href: buildLangPath("/lens/2020", locale),
      cta: "Open the 2020 lens",
      meta: ["song-led", "signal-first", "event-confirmed"],
      accent: "from-signal-500/20 via-signal-500/10 to-transparent",
    },
    {
      eyebrow: "Route 02",
      title: "Jump from a song into the evidence trail",
      description:
        "Go from a track into the graph, then inspect the edge proof line by line instead of trusting a summary card.",
      href: buildLangPath("/graph", locale, {
        rootType: "year",
        rootId: "versesignal:n:year:2020",
        hops: "3",
      }),
      cta: "Explore the graph",
      meta: ["graph mode", "evidence drawer", "path search"],
      accent: "from-echo-500/20 via-echo-500/10 to-transparent",
    },
    {
      eyebrow: "Route 03",
      title: "Ask the graph like a curious human",
      description:
        "Use a plain-language question to resolve nodes, edges, and the shortest path between cultural moments.",
      href: buildLangPath("/ask", locale),
      cta: "Ask a question",
      meta: ["natural language", "shortest path", "searchable"],
      accent: "from-strength-high/20 via-signal-500/10 to-transparent",
    },
    {
      eyebrow: "Route 04",
      title: "Read the regional weather map",
      description:
        "See where chart pressure spikes, where themes cluster, and where the corpus still has room to grow.",
      href: buildLangPath("/globe", locale),
      cta: "Open the weather map",
      meta: ["regional pulse", "mood bands", "atlas view"],
      accent: "from-warn-500/20 via-echo-500/10 to-transparent",
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

  return (
    <main className="mx-auto max-w-7xl px-6 py-6 lg:px-8 lg:py-8">
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
      </section>

      <section className="relative isolate overflow-hidden rounded-[2rem] border border-ink-800 bg-[linear-gradient(135deg,rgba(8,10,16,0.94),rgba(12,12,20,0.84))] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_40px_120px_-60px_rgba(14,165,233,0.4)] lg:p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-signal-500/10 blur-3xl" />
          <div className="absolute right-[-4rem] top-12 h-72 w-72 rounded-full bg-echo-500/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
        </div>

        <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-ink-400">
              <Pill variant="signal" className="border-signal-500/40 bg-signal-900/20">
                VerseSignal
              </Pill>
              <span>music as cultural evidence</span>
            </div>

            <h1 className="h-display mt-6 max-w-3xl text-5xl leading-[0.95] text-balance md:text-7xl lg:text-8xl">
              {t(locale, "home.hero-subtitle")}
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-300 text-pretty">
              VerseSignal is built like an investigation, not a catalog: songs surface the signal,
              events confirm it, and the graph keeps the proof visible.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={buildLangPath("/lens/2020", locale)}
                className="inline-flex items-center gap-2 rounded-full bg-signal-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-signal-400"
              >
                Start with 2020
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={buildLangPath("/ask", locale)}
                className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-5 py-3 text-sm font-semibold text-ink-100 transition hover:border-signal-400/60 hover:bg-ink-800"
              >
                Ask the graph
                <Compass className="h-4 w-4" />
              </Link>
              <Link
                href={buildLangPath("/globe", locale)}
                className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-5 py-3 text-sm font-semibold text-ink-100 transition hover:border-echo-400/60 hover:bg-ink-800"
              >
                Open the weather map
                <Globe className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <MetricChip value={totalSongs.toString()} label="songs indexed" />
              <MetricChip value={yearCounts.length.toString()} label="years in view" />
              <MetricChip value={events.length.toString()} label="curated events" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-6 top-6 h-40 w-40 rounded-full bg-signal-500/15 blur-3xl" />
            <div className="absolute right-0 top-24 h-28 w-28 rounded-full bg-echo-500/15 blur-3xl" />

            <div className="relative overflow-hidden rounded-[1.75rem] border border-ink-700/80 bg-ink-950/75 p-5 shadow-[0_24px_80px_-40px_rgba(14,165,233,0.45)]">
              <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Signal seismograph</p>
                <p className="mt-1 text-sm text-ink-300">
                    Song-led anomaly detection, candidate contexts, verification.
                </p>
              </div>
                <Pill variant="mute" className="border-ink-700 bg-ink-900/80 text-ink-200">
                  2020
                </Pill>
              </div>

              <div className="mt-6 space-y-3">
                {[
                  {
                    label: "songs",
                    value: "Signals appear in the charts first",
                    width: "84%",
                    tone: "bg-gradient-to-r from-signal-500 to-signal-300",
                  },
                  {
                    label: "contexts",
                    value: "COVID / BLM / Ukraine are candidate explanations, not assumptions",
                    width: "70%",
                    tone: "bg-gradient-to-r from-echo-500 to-echo-300",
                  },
                  {
                    label: "proof",
                    value: "Edges stay inspectable through evidence rows",
                    width: "92%",
                    tone: "bg-gradient-to-r from-strength-high to-signal-300",
                  },
                ].map((row) => (
                  <div key={row.label} className="rounded-2xl border border-ink-800/80 bg-ink-900/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.22em] text-ink-500">{row.label}</span>
                      <span className="text-xs text-ink-400">{row.value}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-800">
                      <div className={`h-full rounded-full ${row.tone}`} style={{ width: row.width }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-signal-700/30 bg-signal-950/20 p-4">
                <p className="text-sm font-semibold text-signal-100">
                  The right question is not “which event should we pick?” but “what was the music already telling us?”
                </p>
                <p className="mt-2 text-sm leading-6 text-ink-300">
                  The interface now opens with song-led anomalies, then offers candidate contexts,
                  verification surfaces, and the graph when users want to test a hypothesis.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Choreographed routes</p>
            <h2 className="h-display mt-2 text-3xl md:text-4xl">Start with a song anomaly, then test candidate explanations</h2>
          </div>
          <Link
            href={buildLangPath("/graph", locale)}
            className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
          >
            Open the raw graph
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Link
            href={discoveryRoutes[0].href}
            className={`group relative overflow-hidden rounded-[2rem] border border-ink-800 bg-[linear-gradient(160deg,rgba(11,12,18,0.96),rgba(9,11,17,0.84))] p-6 transition hover:-translate-y-0.5 hover:border-signal-400/40`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${discoveryRoutes[0].accent}`} />
            <div className="relative flex h-full flex-col gap-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs uppercase tracking-[0.24em] text-ink-500">
                  {discoveryRoutes[0].eyebrow}
                </span>
                <Pill variant="signal">{discoveryRoutes[0].cta}</Pill>
              </div>
              <div className="max-w-xl">
                <h3 className="h-display text-3xl md:text-4xl">{discoveryRoutes[0].title}</h3>
                <p className="mt-3 max-w-lg text-sm leading-6 text-ink-300">
                  {discoveryRoutes[0].description}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {discoveryRoutes[0].meta.map((meta) => (
                  <span key={meta} className="pill pill-mute bg-ink-950/70">
                    {meta}
                  </span>
                ))}
              </div>
            </div>
          </Link>

          <div className="grid gap-4 sm:grid-cols-2">
            {discoveryRoutes.slice(1).map((route, index) => (
              <Link
                key={route.title}
                href={route.href}
                className="group relative overflow-hidden rounded-[1.75rem] border border-ink-800 bg-ink-900/70 p-5 transition hover:-translate-y-0.5 hover:border-signal-500/40"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${route.accent}`} />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.22em] text-ink-500">
                      {route.eyebrow}
                    </span>
                    <span className="text-xs text-ink-400">0{index + 2}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-ink-50 text-balance">
                    {route.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ink-300">{route.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {route.meta.map((meta) => (
                      <span key={meta} className="pill pill-mute bg-ink-950/70">
                        {meta}
                      </span>
                    ))}
                  </div>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-signal-200">
                    {route.cta}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
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
              Each era card summarizes its song count, top mood, top theme, top named
              entity, and event coverage so you can pick a starting point by feel instead
              of scrolling through identical year tiles.
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
          {erasWithSongs.map((era) => (
            <Link
              key={era.eraId}
              href={buildLangPath(`/lens/${era.eraStart}`, locale)}
              className="group flex flex-col rounded-[1.5rem] border border-ink-800 bg-ink-950/60 p-5 transition hover:-translate-y-0.5 hover:border-signal-400/40"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold tracking-tight text-ink-50">
                  {era.eraLabel}
                </span>
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
                  <p className="mt-0.5 text-sm font-medium text-ink-200">
                    {era.topMood ?? "no signal yet"}
                  </p>
                </div>
                <div>
                  <p className="text-ink-500">Top theme</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-200">
                    {era.topTheme ?? "no signal yet"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-ink-500">Top entity</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-200">
                    {era.topEntity ?? "no signal yet"}
                  </p>
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-signal-200 transition group-hover:text-signal-100">
                Open {era.eraStart}
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Candidate contexts</p>
            <h2 className="h-display mt-2 text-2xl md:text-3xl">Possible explanations to verify against the anomaly</h2>
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

        <div className="mt-5 grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2 pr-2 scrollbar-thin">
          {featuredEvents.map((event) => {
            if (!event) return null;
            return (
              <Link
                key={event.id}
                href={buildLangEventPath(event.id, locale)}
                className="group min-h-[13rem] rounded-[1.75rem] border border-ink-800 bg-ink-900/65 p-5 transition hover:-translate-y-0.5 hover:border-echo-400/40"
              >
                <div className="flex items-center gap-2">
                  <Pill variant="echo" className="border-echo-500/40 bg-echo-900/20">
                    {event.category}
                  </Pill>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink-50 text-balance">
                  {event.name}
                </h3>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-ink-300">{event.description}</p>
                <div className="mt-5 text-xs uppercase tracking-[0.22em] text-ink-500">
                  {event.startDate} → {event.endDate ?? "present"}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-ink-800 bg-ink-900/55 p-6">
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Why this is different</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "Not a catalog",
                text: "The first screen is an editorial launchpad, not a row of same-sized cards.",
              },
              {
                title: "Not a black box",
                text: "Every strong claim can still be drilled into via graph evidence and edge drawers.",
              },
              {
                title: "Not a static demo",
                text: "The timeline, event rail, and journey all push users into active exploration.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-[1.5rem] border border-ink-800 bg-ink-950/50 p-4">
                <h3 className="text-sm font-semibold text-ink-100">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-400">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

          <div className="rounded-[2rem] border border-ink-800 bg-ink-900/55 p-6">
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Method layer</p>
          <div className="mt-3 grid gap-3">
            {[
              "Lyrics, themes, and moods surface the unusual signal",
              "Candidate contexts rank possible explanations for that signal",
              "Graph edges keep the evidence visible instead of hiding the hypothesis trail",
            ].map((line) => (
              <div key={line} className="rounded-[1.35rem] border border-ink-800 bg-ink-950/50 px-4 py-3 text-sm leading-6 text-ink-300">
                {line}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <StoryJourney />
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
