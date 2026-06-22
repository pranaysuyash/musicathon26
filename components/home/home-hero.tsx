import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

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
}: {
  locale: string;
  totalSongs: number;
  yearCount: number;
  eventCount: number;
}) {
  const promptChips = [
    { q: "What did the world sing during COVID?", label: "COVID soundtrack" },
    { q: "Songs that felt like lockdown but did not mention COVID", label: "lockdown mood" },
    { q: "Compare 2019 and 2020", label: "2019 vs 2020" },
    { q: "Show protest songs around 2020", label: "protest + anger" },
    { q: "What did India sound like during lockdown?", label: "India lockdown" },
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-[2.5rem] border border-ink-800 bg-[linear-gradient(145deg,rgba(9,11,18,0.98),rgba(7,8,14,0.92))] px-5 py-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_42px_120px_-60px_rgba(14,165,233,0.45)] sm:px-8 lg:px-10 lg:py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-0 h-96 w-96 rounded-full bg-signal-500/14 blur-3xl" />
        <div className="absolute right-[-6rem] top-12 h-[28rem] w-[28rem] rounded-full bg-echo-500/12 blur-3xl" />
        <div className="absolute left-1/2 top-32 h-64 w-64 -translate-x-1/2 rounded-full bg-warn-500/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
      </div>

      <div className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="h-display text-5xl leading-[0.94] text-balance text-ink-50 md:text-7xl lg:text-8xl">
            What was the world singing?
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-pretty text-ink-300">
            Search a song, event, feeling, year, or place. VerseSignal turns it into a cultural signal and asks the songs to justify the story.
          </p>

          <form action={buildLangPath("/ask", locale)} method="GET" className="mx-auto mt-8 max-w-2xl">
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

          <div className="mt-6 flex flex-wrap justify-center gap-2">
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
        </div>

        <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
          <Metric value={totalSongs.toString()} label="songs indexed" />
          <Metric value={yearCount.toString()} label="years in view" />
          <Metric value={eventCount.toString()} label="candidate contexts" />
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
