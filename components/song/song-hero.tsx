import { Pill } from "@/components/ui/primitives";

export function SongHero({
  title,
  artist,
  year,
  chartRank,
  topMood,
  topTheme,
}: {
  title: string;
  artist: string;
  year: number;
  chartRank: number;
  topMood?: string;
  topTheme?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-[2.5rem] border border-ink-800 bg-[linear-gradient(145deg,rgba(9,11,18,0.98),rgba(7,8,14,0.92))] px-5 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_42px_120px_-60px_rgba(14,165,233,0.45)] sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-0 h-72 w-72 rounded-full bg-signal-500/12 blur-3xl" />
        <div className="absolute right-[-6rem] top-20 h-80 w-80 rounded-full bg-echo-500/12 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
      </div>

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <Pill variant="signal">Song Lens</Pill>
          <Pill variant="mute">{year}</Pill>
          <Pill variant="mute">#{chartRank} year-end</Pill>
          {topMood ? <Pill variant="warn">{topMood}</Pill> : null}
          {topTheme ? <Pill variant="echo">{topTheme}</Pill> : null}
        </div>

        <h1 className="h-display mt-5 max-w-4xl text-4xl leading-[0.95] text-balance text-ink-50 md:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-pretty text-ink-300">{artist}</p>
      </div>
    </section>
  );
}
