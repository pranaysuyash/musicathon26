import { evidenceSources } from "./source-registry";
import type { EvidenceSourceMetadata } from "./source-registry";

function SourcePill({ meta }: { meta: EvidenceSourceMetadata }) {
  const body = (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-[10px] font-medium text-ink-300"
      title={meta.name}
    >
      <span className="font-semibold">{meta.emoji}</span>
      <span>{meta.name}</span>
    </span>
  );
  if (!meta.link) return body;
  return (
    <a href={meta.link} target="_blank" rel="noreferrer" className="hover:opacity-90">
      {body}
    </a>
  );
}

export function ProvenanceStrip({
  sources,
  title = "Evidence sources",
  compact = false,
  className = "",
}: {
  sources: string[];
  title?: string;
  compact?: boolean;
  className?: string;
}) {
  const rows = evidenceSources(sources);
  const partnerRows = rows.filter((r) => r.partner === "partner");
  return (
    <section className={`space-y-1 ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-500">No source records attached.</p>
      ) : (
        <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-1.5"}>
          {rows.map((meta) => (
            <SourcePill key={meta.key} meta={meta} />
          ))}
        </div>
      )}
      <p className="text-[10px] text-ink-500">
        Evidence sources: {rows.length}.
        {partnerRows.length > 0
          ? ` Partner APIs in this chain: ${partnerRows.map((p) => p.name).join(" · ")}.`
          : " No partner API was used for this evidence bundle."}
      </p>
    </section>
  );
}
