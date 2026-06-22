import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EvidenceBadgeRow } from "@/components/evidence/evidence-badge";
import { EvidenceTrail } from "@/components/evidence/evidence-trail";
import { CaveatPanel } from "@/components/evidence/caveat-panel";
import { WeakMatchWarning } from "@/components/evidence/weak-match-warning";
import type { SongEventConnection } from "@/lib/evidence/types";

export function CandidateEventRail({
  connections,
  songTitle,
}: {
  connections: SongEventConnection[];
  songTitle: string;
}) {
  if (connections.length === 0) {
    return (
      <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
        <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Event candidates</p>
        <h2 className="h-display mt-2 text-2xl">No event candidates yet</h2>
        <p className="mt-2 text-sm leading-6 text-ink-400">
          This song has no graph edges to events in the current corpus. That absence is also signal — not every chart hit references a world event.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Event candidates</p>
        <h2 className="h-display mt-2 text-2xl md:text-3xl">What events might this song echo?</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {connections.map((connection) => (
          <div
            key={connection.edgeId}
            className="rounded-[1.4rem] border border-ink-800 bg-ink-900/55 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/event/${encodeURIComponent(connection.eventId)}`}
                  className="block truncate text-base font-medium text-ink-100 hover:text-signal-300"
                >
                  {connection.eventName}
                </Link>
                <p className="mt-1 text-xs text-ink-500">{connection.explanation}</p>
              </div>
              <EvidenceBadgeRow
                type={connection.uiEvidenceType}
                confidence={connection.uiConfidence}
              />
            </div>

            {connection.caveat ? (
              <CaveatPanel variant={connection.uiEvidenceType === "weak_noisy" ? "weak" : "warn"} className="mt-3">
                {connection.caveat}
              </CaveatPanel>
            ) : null}

            <WeakMatchWarning
              matchedTerms={connection.matchedTerms}
              eventName={connection.eventName}
              className="mt-3"
            />

            <EvidenceTrail evidence={connection.evidence} maxItems={2} className="mt-3" />

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/graph?rootType=song&rootId=versesignal:n:song:${connection.songId}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-signal-400/40 bg-signal-500/10 px-3 py-1.5 text-xs font-medium text-signal-100 transition hover:border-signal-300/80"
              >
                Open in graph
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
