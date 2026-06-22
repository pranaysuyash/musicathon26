import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { GraphPreviewPanel } from "@/components/home/graph-preview-panel";
import { WorldLensPreview } from "@/components/home/world-lens-preview";
import { SignalSeismograph, type SeismographSignal } from "@/components/home/signal-seismograph";

function buildLangPath(path: string, locale: string, query?: Record<string, string>) {
  const params = new URLSearchParams();
  if (locale !== "en") params.set("lang", locale);
  if (query) Object.entries(query).forEach(([k, v]) => params.set(k, v));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function HomeHero({
  locale,
  totalSongs,
  yearCount,
  eventCount,
  signals,
}: {
  locale: string;
  totalSongs: number;
  yearCount: number;
  eventCount: number;
  signals: SeismographSignal[];
}) {
  const promptChips = [
    { q: "What did the world sing during COVID?", label: "COVID soundtrack" },
    { q: "Songs that felt like lockdown but did not mention COVID", label: "lockdown mood" },
    { q: "Compare 2019 and 2020", label: "2019 vs 2020" },
    { q: "Show protest songs around 2020", label: "protest + anger" },
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-[2.5rem] border border-ink-800 bg-[linear-gradient(145deg,rgba(9,11,18,0.98),rgba(7,8,14,0.92))] px-5 py-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_42px_120px_-60px_rgba(14,165,233,0.45)] sm:px-8 lg:px-10 lg:py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-0 h-96 w-96 rounded-full bg-signal-500/14 blur-3xl" />
        <div className="absolute right-[-6rem] top-12 h-[28rem] w-[28rem] rounded-full bg-echo-500/12 blur-3xl" />
        <div className="absolute left-1/2 top-32 h-64 w-64 -translate-x-1/2 rounded-full bg-warn-500/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
      </div>

      <div className="relative grid gap-8 xl:grid-cols-[0.9fr_1.1fr] xl:items-center">
        <div className="mx-auto w-full max-w-2xl text-center xl:text-left">
          <p className="text-xs uppercase tracking-[0.28em] text-ink-500">Song-led cultural observatory</p>
          <h1 className="h-display mt-4 text-5xl leading-[0.95] text-balance text-ink-50 md:text-6xl lg:text-7xl">
            What was the world singing?
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-pretty text-ink-300 xl:mx-0">
            Search a song, event, feeling, year, or place. The app turns it into a cultural signal and asks the songs to justify the story.
          </p>

          <form action={buildLangPath("/ask", locale)} method="GET" className="mx-auto mt-7 max-w-2xl xl:mx-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-ink-700 bg-ink-950/70 px-5 py-3.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                <Search className="h-5 w-5 shrink-0 text-ink-500" />
                <input
                  type="text"
                  name="q"
                  placeholder='e.g. "lonely city nights"'
                  className="min-w-0 flex-1 bg-transparent text-base text-ink-100 placeholder:text-ink-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-signal-500 px-6 py-3.5 text-base font-semibold text-ink-950 transition hover:bg-signal-400"
              >
                Search by feel
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2 xl:justify-start">
            {promptChips.map((chip) => (
              <Link
                key={chip.label}
                href={buildLangPath("/ask", locale, { q: chip.q })}
                className="rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-signal-400/40 hover:text-signal-100"
              >
                {chip.label}
              </Link>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-3 xl:justify-start">
            <Metric value={totalSongs.toString()} label="songs indexed" />
            <Metric value={yearCount.toString()} label="years in view" />
            <Metric value={eventCount.toString()} label="candidate contexts" />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr] xl:gap-5">
          <section className="relative overflow-hidden rounded-[2rem] border border-ink-800 bg-[linear-gradient(180deg,rgba(9,11,18,0.98),rgba(7,8,14,0.94))] p-5 shadow-[0_22px_80px_-48px_rgba(14,165,233,0.55)] lg:p-6">
            <div className="absolute inset-0">
              <div className="absolute -left-20 top-0 h-56 w-56 rounded-full bg-signal-500/12 blur-3xl" />
              <div className="absolute right-[-4rem] top-16 h-56 w-56 rounded-full bg-echo-500/10 blur-3xl" />
            </div>
            <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Signal room</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-50">2020 signal seismograph</h2>
              </div>
              <Link
                href={buildLangPath("/graph", locale)}
                className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
              >
                Open graph
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="relative rounded-[1.6rem] border border-ink-800 bg-ink-950/45 p-4">
              <SignalSeismograph year={2020} signals={signals} maxSignals={6} cycleMs={3200} />
            </div>
          </section>

          <div className="grid gap-4">
            <GraphPreviewPanel />
            <WorldLensPreview locale={locale} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[1.5rem] border border-ink-800 bg-ink-900/55 p-4 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="text-3xl font-semibold tracking-tight text-ink-50">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-ink-500">{label}</div>
    </div>
  );
}
