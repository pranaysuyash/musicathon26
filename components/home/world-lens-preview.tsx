import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";

const regions = [
  { code: "US", label: "United States", mood: "isolation / protest / anger", event: "COVID-19, BLM 2020" },
  { code: "IN", label: "India", mood: "lockdown / migration / home / anxiety", event: "COVID-19 lockdown" },
  { code: "UK", label: "United Kingdom", mood: "pandemic / isolation / escapism", event: "COVID-19, Brexit fallout" },
  { code: "GLOBAL", label: "Global", mood: "dance escape / loneliness / uncertainty", event: "COVID-19 pandemic" },
];

export function WorldLensPreview({ locale }: { locale: string }) {
  return (
    <section className="rounded-[2rem] border border-ink-800 bg-[linear-gradient(160deg,rgba(11,12,18,0.96),rgba(8,10,16,0.9))] p-5 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">World lens</p>
          <h2 className="h-display mt-2 text-2xl md:text-3xl">Was the world singing the same thing?</h2>
        </div>
        <Link
          href={`/globe${locale !== "en" ? `?lang=${locale}` : ""}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
        >
          Open world lens
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {regions.map((region) => (
          <div
            key={region.code}
            className="rounded-[1.4rem] border border-ink-800 bg-ink-950/55 p-4"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-signal-300" />
              <span className="text-sm font-medium text-ink-100">{region.label}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-300">{region.mood}</p>
            <p className="mt-1 text-xs text-ink-500">{region.event}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
