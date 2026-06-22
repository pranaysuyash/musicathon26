import Link from "next/link";
import { ArrowRight, Search, Sparkles, Globe, Compass, FileSearch } from "lucide-react";

function buildLangPath(path: string, locale: string, query?: Record<string, string>) {
  const params = new URLSearchParams();
  if (locale !== "en") params.set("lang", locale);
  if (query) Object.entries(query).forEach(([k, v]) => params.set(k, v));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function ExplorationLensGrid({ locale }: { locale: string }) {
  const modes = [
    {
      eyebrow: "Song Lens",
      title: "Investigate a song",
      description: "Lyrics, themes, entities, candidate events, and evidence trail.",
      href: "/song/versesignal:2020:01:blinding-lights-the-weeknd",
      cta: "Open a song",
      icon: Search,
      color: "from-signal-500/25 via-signal-500/10 to-transparent",
    },
    {
      eyebrow: "Event Lens",
      title: "Test an event",
      description: "Direct mentions, weak signals, mood shifts, and evidence taxonomy.",
      href: "/event/versesignal:ev:covid_19",
      cta: "Inspect COVID-19",
      icon: Sparkles,
      color: "from-echo-500/20 via-echo-500/10 to-transparent",
    },
    {
      eyebrow: "World Lens",
      title: "Explore by region",
      description: "Compare signal intensity, mood, and events across countries.",
      href: "/globe",
      cta: "Open the globe",
      icon: Globe,
      color: "from-warn-500/20 via-echo-500/10 to-transparent",
    },
    {
      eyebrow: "Graph Explorer",
      title: "Walk the network",
      description: "Relationships between songs, events, themes, and evidence.",
      href: "/graph",
      cta: "Open the graph",
      icon: Compass,
      color: "from-purple-500/20 via-signal-500/10 to-transparent",
    },
    {
      eyebrow: "Timeline",
      title: "Scrub years",
      description: "Compact visual shelf. Start here only if you want the chronology.",
      href: "/scrub",
      cta: "Scrub timeline",
      icon: FileSearch,
      color: "from-amber-500/20 via-echo-500/10 to-transparent",
    },
  ];

  return (
    <section>
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Choose your lens</p>
        <h2 className="h-display mt-2 text-3xl md:text-4xl">Five ways to investigate music</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {modes.map((mode, index) => {
          const Icon = mode.icon;
          return (
            <Link
              key={mode.eyebrow}
              href={buildLangPath(mode.href, locale)}
              className="group relative overflow-hidden rounded-[1.9rem] border border-ink-800 bg-[linear-gradient(160deg,rgba(11,12,18,0.96),rgba(8,10,16,0.9))] p-5 transition duration-300 hover:-translate-y-1 hover:border-signal-400/40"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${mode.color}`} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-ink-800 bg-ink-950/65 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-ink-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-800 bg-ink-950/80">
                    <Icon className="h-4 w-4 text-ink-300" />
                  </span>
                </div>
                <p className="mt-4 text-[10px] uppercase tracking-[0.24em] text-ink-500">{mode.eyebrow}</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink-50 text-balance">{mode.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-300">{mode.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-signal-200 transition group-hover:text-signal-100">
                  {mode.cta}
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
