import { cn } from "@/components/ui/primitives";
import { UI_EVIDENCE_LABELS, UI_CONFIDENCE_LABELS, type UiEvidenceType, type UiConfidence } from "@/lib/evidence/types";

const evidenceColorClasses: Record<string, { bg: string; text: string; border: string }> = {
  signal: { bg: "bg-signal-500/15", text: "text-signal-200", border: "border-signal-500/40" },
  echo: { bg: "bg-echo-500/15", text: "text-echo-200", border: "border-echo-500/40" },
  purple: { bg: "bg-purple-500/15", text: "text-purple-200", border: "border-purple-500/40" },
  warn: { bg: "bg-amber-500/15", text: "text-amber-200", border: "border-amber-500/40" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-200", border: "border-emerald-500/40" },
  ink: { bg: "bg-ink-700/50", text: "text-ink-300", border: "border-ink-600" },
  red: { bg: "bg-red-500/15", text: "text-red-200", border: "border-red-500/40" },
};

export function EvidenceBadge({
  type,
  className,
}: {
  type: UiEvidenceType;
  className?: string;
}) {
  const meta = UI_EVIDENCE_LABELS[type];
  const colors = evidenceColorClasses[meta.color];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
      title={meta.description}
    >
      {meta.short}
    </span>
  );
}

export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: UiConfidence;
  className?: string;
}) {
  const meta = UI_CONFIDENCE_LABELS[confidence];
  const colors = evidenceColorClasses[meta.color] ?? evidenceColorClasses.ink;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      {meta.label}
    </span>
  );
}

export function EvidenceBadgeRow({
  type,
  confidence,
  className,
}: {
  type: UiEvidenceType;
  confidence: UiConfidence;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <EvidenceBadge type={type} />
      <ConfidenceBadge confidence={confidence} />
    </div>
  );
}
