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
  const sourceCount = provenanceSources.length;
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-ink-800 bg-[linear-gradient(180deg,rgba(11,12,18,0.98),rgba(8,10,16,0.92))] p-4 shadow-[0_20px_60px_-40px_rgba(14,165,233,0.45)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/50 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-ink-500">Evidence dossier</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink-50 text-balance">
            {claim}
          </h3>
        </div>
        {typeof confidence === "number" ? (
          <div className="rounded-full border border-ink-800 bg-ink-950/70 px-3 py-1.5">
            <ConfidenceExplain value={confidence} title="Confidence" />
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Inference type</p>
          <p className="mt-1 text-sm text-ink-200">{readableInferenceType(inferenceType)}</p>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Signals used</p>
          <p className="mt-1 text-sm text-ink-200">{reasons.length} reason{reasons.length === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Provenance</p>
          <p className="mt-1 text-sm text-ink-200">{sourceCount} source{sourceCount === 1 ? "" : "s"}</p>
        </div>
      </div>

      {reasons.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-950/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-500">
            Why this is allowed to say that
          </p>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink-300">
            {reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-400/80" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <div>
          <ProvenanceStrip sources={provenanceSources} />
        </div>
        {evidenceRows.length > 0 ? (
          <div>
            <EvidencePreview
              title={evidencePreviewTitle ?? "Evidence rows"}
              items={evidenceRows}
              maxItems={2}
            />
          </div>
        ) : null}
      </div>

      {caveat ? (
        <p className="mt-4 rounded-2xl border border-amber-700/30 bg-amber-900/10 px-3 py-2 text-[10px] leading-5 text-amber-100/85">
          Caveat: {caveat}
        </p>
      ) : null}
    </section>
  );
}
