import Link from "next/link";
import { Share2 } from "lucide-react";

export function EventGraphPreview({ eventId }: { eventId: string }) {
  return (
    <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.26em] text-ink-500">Graph preview</p>
          <p className="mt-1 text-sm text-ink-300">See the event node and its evidence-backed neighborhood.</p>
        </div>
        <Link
          href={`/graph?rootType=event&rootId=versesignal:n:event:${eventId}`}
          className="inline-flex items-center gap-2 rounded-full bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
        >
          <Share2 className="h-4 w-4" />
          Open in graph
        </Link>
      </div>

      <div className="relative mt-4 aspect-[16/7] overflow-hidden rounded-[1.6rem] border border-ink-800 bg-ink-900/40">
        <svg viewBox="0 0 100 45" className="absolute inset-0 h-full w-full">
          <line x1="18" y1="22" x2="40" y2="12" stroke="rgba(125,211,252,0.4)" strokeWidth="0.8" />
          <line x1="18" y1="22" x2="40" y2="32" stroke="rgba(125,211,252,0.4)" strokeWidth="0.8" />
          <line x1="40" y1="12" x2="62" y2="22" stroke="rgba(196,123,244,0.4)" strokeWidth="0.8" />
          <line x1="40" y1="32" x2="62" y2="22" stroke="rgba(196,123,244,0.4)" strokeWidth="0.8" />
          <line x1="62" y1="22" x2="82" y2="14" stroke="rgba(251,191,36,0.4)" strokeWidth="0.8" />
          <line x1="62" y1="22" x2="82" y2="30" stroke="rgba(251,191,36,0.4)" strokeWidth="0.8" />

          <circle cx="18" cy="22" r="3.2" fill="#fbbf24" />
          <circle cx="40" cy="12" r="2.8" fill="#38bdf8" />
          <circle cx="40" cy="32" r="2.8" fill="#38bdf8" />
          <circle cx="62" cy="22" r="3.2" fill="#c084fc" />
          <circle cx="82" cy="14" r="2.4" fill="#34d399" />
          <circle cx="82" cy="30" r="2.4" fill="#34d399" />

          <text x="18" y="30" textAnchor="middle" className="fill-ink-300" style={{ fontSize: "3px", letterSpacing: "0.18em", textTransform: "uppercase" }}>event</text>
          <text x="40" y="8" textAnchor="middle" className="fill-ink-300" style={{ fontSize: "3px" }}>songs</text>
          <text x="62" y="30" textAnchor="middle" className="fill-ink-300" style={{ fontSize: "3px" }}>themes</text>
          <text x="82" y="38" textAnchor="middle" className="fill-ink-300" style={{ fontSize: "3px" }}>evidence</text>
        </svg>
      </div>
    </div>
  );
}
