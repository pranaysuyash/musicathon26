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

      <div className="mt-5 overflow-hidden rounded-[1.6rem] border border-ink-800 bg-ink-950/45 p-4">
        <div className="relative mx-auto mb-4 aspect-square w-full max-w-[240px]">
          <div className="absolute inset-0 rounded-full border border-signal-400/20 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,0.18),rgba(10,12,18,0.92)_58%,rgba(2,6,23,0.98))]" />
          <div className="absolute inset-[11%] rounded-full border border-ink-700/70" />
          <div className="absolute inset-[24%] rounded-full border border-ink-700/50" />
          <div className="absolute left-1/2 top-[11%] h-[78%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-signal-300/40 to-transparent" />
          <div className="absolute left-[11%] top-1/2 h-px w-[78%] -translate-y-1/2 bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
          {[
            { label: "US", left: "24%", top: "34%", tone: "bg-signal-400" },
            { label: "IN", left: "67%", top: "39%", tone: "bg-echo-400" },
            { label: "UK", left: "51%", top: "28%", tone: "bg-amber-300" },
            { label: "GLOBAL", left: "50%", top: "66%", tone: "bg-emerald-400" },
          ].map((node) => (
            <div key={node.label} className="absolute" style={{ left: node.left, top: node.top }}>
              <div className={`h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${node.tone} shadow-[0_0_20px_currentColor]`} />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.22em] text-ink-300">
                {node.label}
              </div>
            </div>
          ))}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-ink-700 bg-ink-950/75 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-ink-400">
            Was the world singing the same thing?
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {regions.map((region) => (
            <div
              key={region.code}
              className="rounded-[1.2rem] border border-ink-800 bg-ink-950/55 p-4"
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
      </div>
    </section>
  );
}
