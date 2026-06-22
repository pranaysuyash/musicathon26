import Link from "next/link";
import { Share2 } from "lucide-react";

export function GraphEntry({ songId, entityCount, eventCount }: { songId: string; entityCount: number; eventCount: number }) {
  return (
    <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.26em] text-ink-500">Graph entry</p>
          <p className="mt-1 text-sm text-ink-300">Explore the song node and its evidence-backed neighborhood.</p>
        </div>
        <Link
          href={`/graph?rootType=song&rootId=versesignal:n:song:${songId}`}
          className="inline-flex items-center gap-2 rounded-full bg-signal-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
        >
          <Share2 className="h-4 w-4" />
          Open graph
        </Link>
      </div>
      <p className="mt-3 text-xs text-ink-500">{entityCount} entities, {eventCount} event hops</p>
    </div>
  );
}
