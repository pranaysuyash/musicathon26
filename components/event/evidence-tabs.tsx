"use client";

import { cn } from "@/components/ui/primitives";
import { UI_EVIDENCE_LABELS, type UiEvidenceType } from "@/lib/evidence/types";

const tabs: { id: UiEvidenceType | "all"; label: string; tone: string }[] = [
  { id: "all", label: "All", tone: "bg-ink-400" },
  { id: "direct_lyric", label: "Direct lyric", tone: "bg-signal-400" },
  { id: "event_entity", label: "Entity", tone: "bg-echo-400" },
  { id: "semantic_theme", label: "Semantic", tone: "bg-purple-400" },
  { id: "temporal_only", label: "Temporal", tone: "bg-amber-400" },
  { id: "external_confirmation", label: "External", tone: "bg-emerald-400" },
  { id: "weak_noisy", label: "Weak / noisy", tone: "bg-ink-400" },
  { id: "rejected", label: "Rejected", tone: "bg-red-400" },
];

export function EvidenceTabs({
  active,
  counts,
  onChange,
}: {
  active: UiEvidenceType | "all";
  counts: Record<UiEvidenceType | "all", number>;
  onChange: (type: UiEvidenceType | "all") => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const count = counts[tab.id] ?? 0;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
              isActive
                ? "border-signal-400/40 bg-signal-500/15 text-signal-100"
                : "border-ink-800 bg-ink-950/60 text-ink-300 hover:border-ink-700 hover:text-ink-200"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", tab.tone)} />
            {tab.label}
            <span className="ml-1 rounded-full bg-ink-900 px-1.5 py-0.5 text-[10px] text-ink-400">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
