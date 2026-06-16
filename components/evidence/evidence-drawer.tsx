"use client";

import { ConfidenceBar, Pill } from "@/components/ui/primitives";
import type { GraphEdge, Evidence } from "@/lib/types";
import { X } from "lucide-react";

interface Props {
  edge: GraphEdge | null;
  evidence: Evidence[];
  onClose: () => void;
}

export function EvidenceDrawer({ edge, evidence, onClose }: Props) {
  if (!edge) return null;
  return (
    <aside className="card flex h-full w-full max-w-md flex-col border-l border-ink-800 bg-ink-950/95 p-5">
      <div className="flex items-start justify-between">
        <div>
          <Pill variant="signal">{edge.edgeType.replace(/_/g, " ")}</Pill>
          <h3 className="mt-3 text-sm font-semibold text-ink-100">Connection details</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <Row label="Source">{edge.srcId}</Row>
        <Row label="Target">{edge.dstId}</Row>
        <Row label="Weight">
          <ConfidenceBar value={edge.weight} />
        </Row>
        <Row label="Confidence">
          <ConfidenceBar value={edge.confidence} />
        </Row>
        <Row label="API">
          <Pill variant="mute">{edge.sourceApi}</Pill>
        </Row>
        {edge.explanation ? <Row label="Why">{edge.explanation}</Row> : null}
      </dl>
      <div className="mt-6 flex-1 overflow-y-auto scrollbar-thin">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
          Evidence ({evidence.length})
        </h4>
        {evidence.length === 0 ? (
          <p className="text-xs text-ink-500">No evidence rows attached.</p>
        ) : (
          <ul className="space-y-2">
            {evidence.map((e) => (
              <li
                key={e.id}
                className="rounded border border-ink-800 bg-ink-900/60 p-3 text-xs leading-relaxed"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Pill variant="mute">{e.evidenceType.replace(/_/g, " ")}</Pill>
                  <Pill variant="mute">{e.source}</Pill>
                  <span className="ml-auto text-ink-500">{(e.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-ink-200 italic">&ldquo;{e.value}&rdquo;</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-start gap-3 border-b border-ink-800/60 pb-3 last:border-0">
      <dt className="text-xs uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="col-span-2 break-words text-ink-200">{children}</dd>
    </div>
  );
}
