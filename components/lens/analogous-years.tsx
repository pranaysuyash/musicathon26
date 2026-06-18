import Link from "next/link";
import type { AnalogousYear } from "@/lib/db/queries";

export function AnalogousYearsSection({ analogues, year }: { analogues: AnalogousYear[]; year: number }) {
  if (analogues.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
        Years that felt like {year}
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-400">
        Years with the most similar signal profiles to {year}.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {analogues.map((a) => (
          <Link
            key={a.year}
            href={`/lens/${a.year}`}
            className="card card-hover p-4"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-ink-100">
                {a.year}
              </span>
              <span className="text-xs text-ink-500">
                {(a.similarity * 100).toFixed(0)}% match
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {a.overlapSignals.map((s) => (
                <span
                  key={`${s.signalType}:${s.signal}`}
                  className="rounded bg-ink-800/60 px-1.5 py-0.5 text-[10px] text-ink-300"
                >
                  {s.signal}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
