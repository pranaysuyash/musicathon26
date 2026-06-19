import { ConfidenceExplain } from "./confidence-explain";
import { EvidencePreview, type EvidencePreviewItem } from "./evidence-preview";
import { ProvenanceStrip } from "./provenance-strip";

export interface BecauseCardProps {
  claim: string;
  reasons: string[];
  confidence?: number;
  provenanceSources: string[];
  evidenceRows?: EvidencePreviewItem[];
  caveat?: string;
  inferenceType?: string;
  evidencePreviewTitle?: string;
}

function readableInferenceType(type?: string): string {
  if (!type) return "Unspecified inference path";
  return type
    .split("_")
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(" ");
}

export function BecauseCard({
  claim,
  reasons,
  confidence,
  provenanceSources,
  evidenceRows = [],
  caveat,
  inferenceType,
  evidencePreviewTitle,
}: BecauseCardProps) {
  return (
    <section className="card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Because</h3>
      <p className="mt-2 rounded bg-ink-900/70 p-2 text-sm text-ink-100">{claim}</p>
      {reasons.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-300">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-500">
          Inference type
        </div>
        <div className="mt-1 text-xs text-ink-300">{readableInferenceType(inferenceType)}</div>
      </div>
      {typeof confidence === "number" ? (
        <div className="mt-2">
          <ConfidenceExplain value={confidence} />
        </div>
      ) : null}
      <div className="mt-3">
        <ProvenanceStrip sources={provenanceSources} />
      </div>
      {evidenceRows.length > 0 ? (
        <div className="mt-3">
          <EvidencePreview
            title={evidencePreviewTitle ?? "Evidence rows"}
            items={evidenceRows}
            maxItems={2}
          />
        </div>
      ) : null}
      {caveat ? (
        <p className="mt-2 text-[10px] text-ink-500">Caveat: {caveat}</p>
      ) : null}
    </section>
  );
}

