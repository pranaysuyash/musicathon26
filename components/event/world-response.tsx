import { REGION_LABELS } from "@/lib/db/queries";

export function WorldResponsePanel({
  regions,
  className,
}: {
  regions: string[];
  className?: string;
}) {
  const regionCards = [
    { code: "US", mood: "isolation / protest / anger", signal: "strong" },
    { code: "IN", mood: "lockdown / migration / anxiety", signal: "moderate" },
    { code: "UK", mood: "pandemic / isolation / escapism", signal: "moderate" },
    { code: "GLOBAL", mood: "dance escape / loneliness", signal: "strong" },
  ].filter((r) => regions.includes(r.code) || regions.includes("GLOBAL"));

  return (
    <div className={`rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6 ${className}`}>
      <p className="text-xs uppercase tracking-[0.26em] text-ink-500">World response</p>
      <h2 className="h-display mt-2 text-2xl">How different regions sounded</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {regionCards.map((region) => (
          <div key={region.code} className="rounded-[1.4rem] border border-ink-800 bg-ink-900/50 p-4">
            <p className="text-sm font-medium text-ink-100">{REGION_LABELS[region.code] ?? region.code}</p>
            <p className="mt-1 text-sm leading-6 text-ink-300">{region.mood}</p>
            <p className="mt-2 text-xs text-ink-500">Signal: {region.signal}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
