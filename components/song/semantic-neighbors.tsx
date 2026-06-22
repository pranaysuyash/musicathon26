import Link from "next/link";
import { SectionTitle } from "@/components/ui/primitives";

export function SemanticNeighbors({
  similarSongs,
}: {
  similarSongs: { song_id: string; title: string; artist: string; year: number; weight: number }[];
}) {
  return (
    <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
      <SectionTitle>Semantic neighbors</SectionTitle>
      <div className="mt-4 space-y-2">
        {similarSongs.length === 0 ? (
          <p className="text-sm text-ink-500">No similar songs above the 0.65 cosine threshold.</p>
        ) : (
          similarSongs.slice(0, 6).map((s) => (
            <Link
              key={s.song_id}
              href={`/song/${encodeURIComponent(s.song_id)}`}
              className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 p-3 transition hover:border-signal-400/40"
            >
              <span className="w-12 text-right text-base font-semibold tabular-nums text-ink-500">{(s.weight * 100).toFixed(0)}%</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink-100">{s.title}</div>
                <div className="truncate text-xs text-ink-500">{s.artist}</div>
              </div>
              <span className="text-xs text-ink-500">{s.year}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
