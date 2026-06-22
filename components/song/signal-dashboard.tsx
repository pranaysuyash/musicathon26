import { cn } from "@/components/ui/primitives";

export function SignalDashboard({
  entityCount,
  highlightCount,
  eventCount,
  similarCount,
  lyricLineCount,
  topTheme,
  topMood,
  className,
}: {
  entityCount: number;
  highlightCount: number;
  eventCount: number;
  similarCount: number;
  lyricLineCount: number;
  topTheme?: string;
  topMood?: string;
  className?: string;
}) {
  const stats = [
    { label: "entities", value: entityCount, tone: "signal" },
    { label: "lyric highlights", value: highlightCount, tone: "echo" },
    { label: "event candidates", value: eventCount, tone: "warn" },
    { label: "similar songs", value: similarCount, tone: "purple" },
  ];

  const toneClasses: Record<string, string> = {
    signal: "bg-signal-400",
    echo: "bg-echo-400",
    warn: "bg-amber-400",
    purple: "bg-purple-400",
  };

  return (
    <div className={cn("rounded-[2rem] border border-ink-800 bg-ink-950/65 p-5", className)}>
      <p className="text-[10px] uppercase tracking-[0.26em] text-ink-500">Signal dashboard</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-50">{stat.value}</p>
            <div className="mt-3 h-1 rounded-full bg-ink-900">
              <div
                className={`h-full rounded-full ${toneClasses[stat.tone]}`}
                style={{ width: `${Math.max(20, Math.min(100, stat.value * 18))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-ink-800 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),rgba(9,11,18,0.45))] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-signal-300">Top theme</p>
          <p className="mt-2 text-2xl font-semibold text-ink-50">{topTheme ?? "none"}</p>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-[linear-gradient(180deg,rgba(52,211,153,0.08),rgba(9,11,18,0.45))] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Top mood</p>
          <p className="mt-2 text-2xl font-semibold text-ink-50">{topMood ?? "none"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
        <div className="flex items-center justify-between gap-3 text-xs text-ink-400">
          <span>lyric heat map</span>
          <span>{lyricLineCount} lines</span>
        </div>
        <div className="mt-3 grid grid-cols-12 gap-1">
          {Array.from({ length: Math.min(lyricLineCount, 18) }).map((_, i) => (
            <span
              key={i}
              className={`h-8 rounded-md ${i < highlightCount ? "bg-signal-400/70" : "bg-ink-700/70"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
