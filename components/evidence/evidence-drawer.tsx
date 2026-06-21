"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { ConfidenceBar, Pill } from "@/components/ui/primitives";
import type { GraphEdge, Evidence, EvidenceType } from "@/lib/types";
import { getEvidenceSourceMeta } from "./source-registry";
import { BecauseCard } from "./because-card";
import { EvidencePreview, type EvidencePreviewItem } from "./evidence-preview";

interface Props {
  edge: GraphEdge | null;
  evidence: Evidence[];
  onClose: () => void;
}

const EVIDENCE_GROUPS: Array<{
  type: EvidenceType | "other";
  title: string;
  whyItMatters: string;
}> = [
  { type: "lyric_line", title: "Lyric evidence", whyItMatters: "Specific lyric lines that drove this connection." },
  { type: "lyric_term", title: "Lyric terms matched", whyItMatters: "Words in the lyrics that match the connection." },
  { type: "mood_score", title: "Mood evidence", whyItMatters: "Audio/emotional mood scores supporting this connection." },
  { type: "embedding_similarity", title: "Embedding similarity", whyItMatters: "Vector-space proximity to the target node." },
  { type: "entity_match", title: "Entity match", whyItMatters: "Named-entity (place, person, brand) overlap." },
  { type: "chart_entry", title: "Chart evidence", whyItMatters: "The song's chart position or year-over-year movement." },
  { type: "event_date_overlap", title: "Event-window overlap", whyItMatters: "Temporal alignment with the event's date range." },
  { type: "metadata_credit", title: "Metadata credit", whyItMatters: "Artist/label attribution." },
  { type: "collaboration_credit", title: "Collaboration credit", whyItMatters: "Song credits / featured artists." },
  { type: "chart_delta", title: "Chart delta", whyItMatters: "Compared to baseline chart behavior." },
  { type: "signal_delta", title: "Signal delta", whyItMatters: "Signal rise/fall versus baseline." },
  { type: "matched_term", title: "Matched term", whyItMatters: "Concrete lexical triggers." },
  { type: "temporal_overlap", title: "Temporal overlap", whyItMatters: "Timing overlap with a known moment." },
  { type: "other", title: "Other evidence", whyItMatters: "Other supporting rows." },
];

export function EvidenceDrawer({ edge, evidence, onClose }: Props) {
  // Mobile-first: when an edge is selected on a phone, the user
  // expects a bottom-sheet overlay, not a scroll-and-find block
  // below the graph. Per motto 0.1, the question is "what does the
  // user on a phone need?" — a focused view of the proof, not a
  // 800px-tall card pushed off-screen.
  //
  // Implementation: on small viewports we render the drawer as a
  // fixed bottom-sheet that covers the bottom 60vh and shows the
  // same content. The X button is always visible. On `lg:` we fall
  // back to the original aside column layout.
  useEffect(() => {
    if (!edge) return;
    // Lock body scroll on mobile when drawer is open
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [edge]);

  if (!edge) return null;
  const grouped = new Map<EvidenceType | "other", Evidence[]>();
  for (const e of evidence) {
    const key = (EVIDENCE_GROUPS.find((g) => g.type === e.evidenceType) ? e.evidenceType : "other") as
      | EvidenceType
      | "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  const sources = Array.from(new Set(evidence.map((e) => e.source)));
  const sourceNames = sources.map((s) => getEvidenceSourceMeta(s).name);
  const rowItems = evidence.map<EvidencePreviewItem>((e) => ({
    id: e.id,
    title: e.evidenceType.replace(/_/g, " "),
    text: e.value,
    source: e.source,
    confidence: e.confidence,
    matchedTerms: edge.matchedTerms ?? [],
  }));

  const becauseReasons = [
    `Connection type: ${edge.edgeType.replace(/_/g, " ")}.`,
    `Strength: ${edge.weight.toFixed(2)} · Confidence: ${edge.confidence.toFixed(2)}.`,
    edge.sourceApi ? `Source API: ${getEvidenceSourceMeta(edge.sourceApi).name}.` : "Source API: unknown.",
    edge.explanation ?? "",
  ].filter(Boolean);

  const caveat = edge.inferenceType
    ? `Inference type: ${edge.inferenceType}. This is a structured inference path, not a hard factual assertion.`
    : "Inference type is not explicitly logged for this connection yet.";

  return (
    <aside
      // Mobile: fixed bottom sheet, 75vh, full width. Desktop: sidebar column.
      className="card fixed inset-x-0 bottom-0 z-40 flex max-h-[80vh] w-full flex-col border-t border-ink-800 bg-ink-950/95 p-5 shadow-2xl backdrop-blur-sm lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:w-auto lg:max-w-md lg:border-l lg:border-t-0 lg:shadow-none"
      role="dialog"
      aria-modal="true"
      aria-label="Evidence for graph connection"
    >
      <div className="flex items-start justify-between">
        <div>
          <Pill variant="signal">{edge.edgeType.replace(/_/g, " ")}</Pill>
          <h3 className="mt-3 text-sm font-semibold text-ink-100">Why this connection exists</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
          aria-label="Close evidence panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-4">
        <BecauseCard
          claim={`${shortenId(edge.srcId)} → ${shortenId(edge.dstId)} (${edge.edgeType.replace(/_/g, " ")})`}
          reasons={becauseReasons}
          confidence={edge.confidence}
          provenanceSources={[edge.sourceApi, ...sources]}
          inferenceType={edge.inferenceType}
          evidenceRows={rowItems.slice(0, 2)}
          evidencePreviewTitle="Representative evidence"
          caveat={caveat}
        />
      </div>

      <section className="mt-5 flex-1 overflow-y-auto scrollbar-thin">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">Evidence ({evidence.length})</h4>
        {evidence.length === 0 ? (
          <p className="text-xs text-ink-500">No evidence rows attached.</p>
        ) : (
          <div className="space-y-3">
            {EVIDENCE_GROUPS.map((group) => {
              const items = grouped.get(group.type);
              if (!items?.length) return null;
              return (
                <EvidencePreview
                  key={group.type}
                  title={`${group.title} · ${items.length}`}
                  items={items.map((e) => ({
                    id: e.id,
                    title: group.title,
                    text: e.value,
                    source: e.source,
                    confidence: e.confidence,
                    matchedTerms: edge.matchedTerms,
                  }))}
                  maxItems={3}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-4 border-t border-ink-800 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Top sources
        </div>
        <p className="mt-1 text-xs text-ink-500">
          Evidence sources: {sourceNames.join(" · ") || "not tracked yet"}
        </p>
        <div className="mt-2">
          <div className="text-xs text-ink-500">Signal strength</div>
          <ConfidenceBar value={edge.weight} />
        </div>
      </section>
    </aside>
  );
}

function shortenId(id: string): string {
  // Drop the "versesignal:n:" prefix for readability
  return id.replace(/^versesignal:n:/, "");
}
