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
      <span className="font-medium text-ink-200">Weak signal warning:{</span>{" "}
      generic words like <span className="font-mono text-ink-100">{weakTerms.slice(0, 3).join(", ")}</span> are not proof{" "}
      {isCovid ? "for COVID-19" : `for ${eventName ?? "this event"}`} on their own.
      {isCovid && strongCovidTerms.length === 0 ? (
        <span className="block mt-1 text-ink-400">
          COVID-specific terms like "lockdown", "quarantine", or "pandemic" were not found.
        </span>
      ) : null}
    </div>
  );
}

export function CovidSkepticismPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6",
        className
      )}
    >
      <h3 className="text-lg font-semibold tracking-tight text-ink-50">
        COVID evidence rules
      </h3>
      <p className="mt-2 text-sm leading-6 text-ink-400">
        COVID connections are separated into direct references, lockdown vocabulary, isolation themes, temporal matches, and weak/noisy matches. A generic word is not proof.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-700/30 bg-emerald-900/10 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Counts as COVID signal</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COVID_STRONG_TERMS.slice(0, 8).map((term) => (
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
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["street", "city", "home", "night", "fear", "AI", "alone", "distance"].map(
              (term) => (
                <span
                  key={term}
                  className="rounded-full border border-red-700/30 bg-red-900/20 px-2 py-0.5 text-xs text-red-100"
                >
                  {term}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
