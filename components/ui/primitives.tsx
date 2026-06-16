// Small UI primitives shared across pages.

import { clsx } from "clsx";

export function cn(...args: (string | undefined | null | false)[]): string {
  return args.filter(Boolean).join(" ");
}

export function Pill({
  children,
  variant = "mute",
  className,
}: {
  children: React.ReactNode;
  variant?: "signal" | "echo" | "warn" | "mute";
  className?: string;
}) {
  return <span className={cn(`pill pill-${variant}`, className)}>{children}</span>;
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const color =
    pct > 0.7 ? "bg-strength-high" : pct > 0.4 ? "bg-strength-medium" : "bg-strength-low";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-800">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-ink-400">{pct.toFixed(2)}</span>
    </div>
  );
}

export function SectionTitle({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {subtitle ? <span className="text-xs text-ink-400">{subtitle}</span> : null}
    </div>
  );
}
