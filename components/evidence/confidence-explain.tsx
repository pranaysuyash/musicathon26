import { cn } from "@/components/ui/primitives";

export function confidenceLabel(value: number): string {
  if (value >= 0.85) return "very high — strong evidence";
  if (value >= 0.65) return "high — confident";
  if (value >= 0.45) return "moderate — directionally consistent";
  if (value >= 0.25) return "low — speculative";
  return "very low — coincidence risk";
}

export function ConfidenceExplain({
  value,
  title = "Confidence",
  className,
}: {
  value: number;
  title?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <p className={cn("text-[10px] leading-relaxed text-ink-500", className)}>
      {title}: <span className="font-medium text-ink-300">{pct.toFixed(2)}</span>{" "}
      ({confidenceLabel(pct)})
    </p>
  );
}

