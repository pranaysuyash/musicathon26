import type { DataHealth } from "@/lib/db/queries";

function Bar({ pct }: { pct: number }) {
  return (
    <span className="relative inline-block h-2 w-16 overflow-hidden rounded-full bg-ink-800 align-middle">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-signal-500/60"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

export function DataHealthCard({ health }: { health: DataHealth }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/20 p-4 text-xs text-ink-500">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        Data health
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <span>Songs</span>
        <span className="tabular-nums text-ink-300">{health.totalSongs}</span>
        <span>Themes scored</span>
        <span className="tabular-nums text-ink-300">
          {health.songsWithThemes}/{health.totalSongs} <Bar pct={(health.songsWithThemes / health.totalSongs) * 100} />
        </span>
        <span>Moods scored</span>
        <span className="tabular-nums text-ink-300">
          {health.songsWithMoods}/{health.totalSongs} <Bar pct={(health.songsWithMoods / health.totalSongs) * 100} />
        </span>
        <span>Entity mentions</span>
        <span className="tabular-nums text-ink-300">{health.entityMentions}</span>
        <span>Years</span>
        <span className="tabular-nums text-ink-300">{health.years}</span>
        <span>Events</span>
        <span className="tabular-nums text-ink-300">{health.events}</span>
        <span>Graph nodes</span>
        <span className="tabular-nums text-ink-300">{health.graphNodes}</span>
        <span>Graph edges</span>
        <span className="tabular-nums text-ink-300">{health.graphEdges}</span>
        <span>Evidence rows</span>
        <span className="tabular-nums text-ink-300">{health.evidenceRows}</span>
      </div>
    </div>
  );
}
