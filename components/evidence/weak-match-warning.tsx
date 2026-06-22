import { cn } from "@/components/ui/primitives";
import { GENERIC_NOISE_TERMS, COVID_STRONG_TERMS } from "@/lib/evidence/types";

export function WeakMatchWarning({
  matchedTerms,
  eventName,
  className,
}: {
  matchedTerms: string[];
  eventName?: string;
  className?: string;
}) {
  const weakTerms = matchedTerms.filter((t) =>
    GENERIC_NOISE_TERMS.includes(t.toLowerCase())
  );

  if (weakTerms.length === 0) return null;

  const isCovid = eventName?.toLowerCase().includes("covid");
  const strongCovidTerms = matchedTerms.filter((t) =>
    COVID_STRONG_TERMS.includes(t.toLowerCase())
  );

  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-700/50 bg-ink-900/40 px-3 py-2.5 text-sm leading-6 text-ink-300",
        className
      )}
    >
      <span className="font-medium text-ink-200">Weak signal warning:</span>{" "}
      generic words like <span className="font-mono text-ink-100">{weakTerms.slice(0, 3).join(", ")}</span> are not proof{" "}
      {isCovid ? "for COVID-19" : `for ${eventName ?? "this event"}`} on their own.
      {isCovid && strongCovidTerms.length === 0 ? (
        <span className="block mt-1 text-ink-400">
          COVID-specific terms like &quot;lockdown&quot;, &quot;quarantine&quot;, or &quot;pandemic&quot; were not found.
        </span>
      ) : null}
    </div>
  );
}

export function CovidSkepticismPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border border-amber-500/30 bg-gradient-to-br from-amber-950/40 to-ink-950/60 p-5 lg:p-6",
        className
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold tracking-tight text-ink-50">
            COVID evidence rules
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-300">
            We do not count generic words as COVID proof. A song about “streets” or “being alone” is not a pandemic song unless stronger vocabulary also appears. Use the tabs below to separate direct references from thematic, temporal, and weak matches.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-700/30 bg-emerald-900/10 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Strong COVID evidence</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {COVID_STRONG_TERMS.map((term) => (
              <span
                key={term}
                className="rounded-full border border-emerald-700/30 bg-emerald-900/20 px-2 py-0.5 text-xs text-emerald-100"
              >
                {term}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-red-700/30 bg-red-900/10 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-red-300">Not proof by itself</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {GENERIC_NOISE_TERMS.map((term) => (
              <span
                key={term}
                className="rounded-full border border-red-700/30 bg-red-900/20 px-2 py-0.5 text-xs text-red-100"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
