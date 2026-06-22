import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EvidenceBadgeRow } from "@/components/evidence/evidence-badge";
import { EvidenceTrail } from "@/components/evidence/evidence-trail";
import { CaveatPanel } from "@/components/evidence/caveat-panel";
import { WeakMatchWarning } from "@/components/evidence/weak-match-warning";
import type { SongEventConnection } from "@/lib/evidence/types";

export function EvidenceRankedSongList({
  connections,
  eventName,
}: {
  connections: SongEventConnection[];
  eventName: string;
}) {
  if (connections.length === 0) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-ink-800 bg-ink-900/30 p-5 text-sm text-ink-500">
        No songs in this corpus mention the event by name. That absence is still useful signal.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {connections.map((connection) => (
        <div
          key={connection.edgeId}
          className="rounded-[1.4rem] border border-ink-800 bg-ink-900/55 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/song/${encodeURIComponent(connection.songId)}`}
                className="block truncate text-base font-medium text-ink-100 hover:text-signal-300"
              >
                {connection.songTitle}
              </Link>
              <p className="mt-1 text-xs text-ink-400">
                {connection.songArtist} · {connection.songYear}
              </p>
            </div>
            <EvidenceBadgeRow
              type={connection.uiEvidenceType}
              confidence={connection.uiConfidence}
            />
          </div>

          {connection.caveat ? (
            <CaveatPanel
              variant={connection.uiEvidenceType === "weak_noisy" ? "weak" : "warn"}
              className="mt-3 text-sm"
            >
              {connection.caveat}
            </CaveatPanel>
          ) : null}

          <WeakMatchWarning
            matchedTerms={connection.matchedTerms}
            eventName={eventName}
            className="mt-3"
          />

          <EvidenceTrail evidence={connection.evidence} maxItems={2} className="mt-3" />

          <Link
            href={`/song/${encodeURIComponent(connection.songId)}`}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-signal-200 transition hover:text-signal-100"
          >
            Investigate song
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ))}
    </div>
  );
}
