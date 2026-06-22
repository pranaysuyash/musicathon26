import { cn } from "@/components/ui/primitives";

export function CaveatPanel({
  children,
  variant = "warn",
  className,
}: {
  children: React.ReactNode;
  variant?: "warn" | "weak" | "rejected" | "info";
  className?: string;
}) {
  const styles = {
    warn: "border-amber-700/30 bg-amber-900/10 text-amber-100/85",
    weak: "border-ink-700/50 bg-ink-900/40 text-ink-300",
    rejected: "border-red-700/30 bg-red-900/10 text-red-100/85",
    info: "border-signal-700/30 bg-signal-900/10 text-signal-100/85",
  };

  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-2.5 text-sm leading-6",
        styles[variant],
        className
      )}
    >
      {children}
    </div>
  );
}
