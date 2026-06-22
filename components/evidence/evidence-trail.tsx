import { cn } from "@/components/ui/primitives";
import { EvidenceBadge } from "./evidence-badge";
import type { NormalizedEvidence } from "@/lib/evidence/types";

export function EvidenceTrail({
  evidence,
  maxItems = 3,
  className,
}: {
  evidence: NormalizedEvidence[];
  maxItems?: number;
  className?: string;
}) {
  if (evidence.length === 0) {
    return (
      <p className={cn("text-sm text-ink-500", className)}>
        No expanded evidence rows stored yet.
      </p>
    );
  }

  const displayed = evidence.slice(0, maxItems);
  const remaining = evidence.length - maxItems;

  return (
    <div className={cn("space-y-2", className)}>
      {displayed.map((ev) => (
        <div
          key={ev.id}
          className="flex items-start gap-3 rounded-2xl border border-ink-800 bg-ink-950/55 px-3 py-2.5"
        >
          <EvidenceBadge type={ev.uiType} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink-200" title={ev.value}>
              {ev.value}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {ev.source} · {(ev.confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      ))}
      {remaining > 0 ? (
        <p className="text-xs text-ink-500">+{remaining} more evidence row{remaining === 1 ? "" : "s"}</p>
      ) : null}
    </div>
  );
}
