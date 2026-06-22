import Link from "next/link";
import { ArrowRight, Music, Calendar, Zap, ShieldAlert, MapPin } from "lucide-react";

interface TrailStep {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  tone: "signal" | "echo" | "warn" | "purple" | "emerald";
}

const PREPARED_TRAIL: TrailStep[] = [
  {
    icon: <Music className="h-3.5 w-3.5" />,
    label: "nearest songs",
    value: "8 matches",
    href: "/ask?q=pandemic+isolation",
    tone: "signal",
  },
  {
    icon: <Zap className="h-3.5 w-3.5" />,
    label: "strongest signals",
    value: "isolation · loneliness · quiet",
    href: "/graph?mode=story&storyStep=2&rootType=theme&rootId=versesignal:n:theme:isolation&hops=2",
    tone: "purple",
  },
  {
    icon: <Calendar className="h-3.5 w-3.5" />,
    label: "candidate context",
    value: "COVID-19 lockdown",
    href: "/event/versesignal:ev:covid_19",
    tone: "echo",
  },
  {
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    label: "rejected as proof",
    value: "street · home · night · alone",
    href: "/event/versesignal:ev:covid_19?tab=weak_noisy",
    tone: "warn",
  },
  {
    icon: <MapPin className="h-3.5 w-3.5" />,
    label: "where it showed up",
    value: "US · UK · India",
    href: "/globe?year=2020&region=US",
    tone: "emerald",
  },
];

const toneClasses: Record<TrailStep["tone"], string> = {
  signal: "text-signal-300 border-signal-500/30 bg-signal-500/10",
  echo: "text-echo-300 border-echo-500/30 bg-echo-500/10",
  warn: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  purple: "text-purple-300 border-purple-500/30 bg-purple-500/10",
  emerald: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
};

export function SignalTrailPreview({ locale }: { locale: string }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-ink-800 bg-[linear-gradient(180deg,rgba(10,12,18,0.96),rgba(8,10,16,0.92))] p-5 lg:p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/50 to-transparent" />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Prepared signal trail</p>
            <h2 className="h-display mt-1 text-xl md:text-2xl">
              Pandemic isolation without saying “pandemic”
            </h2>
          </div>
          <span className="rounded-full border border-ink-800 bg-ink-950/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-ink-500">
            click any step
          </span>
        </div>

        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PREPARED_TRAIL.map((step, i) => (
            <li key={step.label}>
              <Link
                href={step.href}
                className={`group flex h-full flex-col rounded-xl border p-3 transition hover:border-signal-400/40 ${toneClasses[step.tone]}`}
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] opacity-80">
                  <span>{step.icon}</span>
                  <span>{step.label}</span>
                </div>
                <p className="mt-2 flex-1 text-sm font-semibold leading-snug">{step.value}</p>
                <div className="mt-2 flex items-center gap-1 text-[10px] font-medium opacity-80 transition group-hover:opacity-100">
                  <span>Step {i + 1}</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/ask?q=pandemic+isolation"
            className="inline-flex items-center gap-2 rounded-full bg-signal-500 px-4 py-2 text-xs font-semibold text-ink-950 transition hover:bg-signal-400"
          >
            Run this trail
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/event/versesignal:ev:covid_19"
            className="text-xs font-medium text-ink-300 transition hover:text-signal-200"
          >
            Open the COVID evidence trial →
          </Link>
        </div>
      </div>
    </section>
  );
}
