import { EvidenceBadge } from "@/components/evidence/evidence-badge";
import { UI_EVIDENCE_LABELS, type UiEvidenceType } from "@/lib/evidence/types";

export function EvidenceQualityPreview() {
  const types: UiEvidenceType[] = [
    "direct_lyric",
    "event_entity",
    "semantic_theme",
    "temporal_only",
    "external_confirmation",
    "weak_noisy",
  ];

  return (
    <section className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
      <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Evidence quality key</p>
      <h2 className="h-display mt-2 text-2xl md:text-3xl">Not all matches are proof</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-400">
        Every song-event connection is classified. Generic words like "street" or "AI" are never treated as proof.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => {
          const meta = UI_EVIDENCE_LABELS[type];
          return (
            <div
              key={type}
              className="rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4"
            >
              <EvidenceBadge type={type} />
              <p className="mt-3 text-sm font-medium text-ink-100">{meta.label}</p>
              <p className="mt-1 text-sm leading-6 text-ink-400">{meta.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
