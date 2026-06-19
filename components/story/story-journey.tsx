// "Start the story" guided journey.
//
// The home page now presents the guided flow as a
// curated mosaic instead of a numbered list so the
// launch surface feels like an editorial spread rather
// than a catalog.

"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export interface JourneyStep {
  step: number;
  title: string;
  description: string;
  href: string;
  whyItMatters: string;
}

export const STORY_JOURNEY: JourneyStep[] = [
  {
    step: 1,
    title: "2020 — what were the charts signaling?",
    description:
      "The lyrics-first signal profile: 18 signals across 25 chart songs, ranked by how much they shifted vs the prior 3-year baseline.",
    href: "/lens/2020",
    whyItMatters:
      "This is the surface that turns the graph from data viz into a cultural analysis engine. The auto-generated takeaway answers what the chart is doing before any one explanation is imposed.",
  },
  {
    step: 2,
    title: "Candidate context: COVID-19 lockdowns",
    description:
      "One possible explanation for the 2020 anomaly. See the signal deltas, then judge whether the context actually fits the songs.",
    href: "/event/versesignal:ev:covid_19",
    whyItMatters:
      "Contexts are evidence checks, not starting assumptions. The page shows whether a real-world context is supported, overfit, or rejected.",
  },
  {
    step: 3,
    title: "Verification graph",
    description:
      "A 2-hop neighborhood of the hypothesis: every song, theme, entity, and context connected to the candidate. Click any edge to see evidence.",
    href: "/graph?rootType=event&rootId=versesignal%3An%3Aevent%3Aversesignal%3Aev%3Acovid_19&hops=2",
    whyItMatters:
      "This is the secondary surface. It’s where we test and inspect the hypothesis after the song-led anomaly appears.",
  },
  {
    step: 4,
    title: "Blinding Lights",
    description:
      "The #1 song of 2020. The song-context connection (lockdowns ↔ party/nightlife escape) is one canonical cultural-posture example.",
    href: "/song/versesignal:2020:01:blinding-lights-the-weeknd",
    whyItMatters:
      "The song page shows: themes, moods, entities, context connections, similar songs, and the artist metadata. The graph is in every section.",
  },
  {
    step: 5,
    title: "The Weeknd profile",
    description:
      "Aggregate the same evidence by artist to see theme affinity, linked events, and dataset breadth. Artists are now first-class investigation paths.",
    href: "/artist/The%20Weeknd",
    whyItMatters:
      "The artist lens compresses song-level evidence and helps prove that our pipeline preserves continuity across tracks, not only individual hits.",
  },
  {
    step: 6,
    title: "Compare 1969 and 2020",
    description:
      "See how the corpus changes across chart eras, then inspect which themes survive and which ones are era-specific.",
    href: "/compare/1969/2020",
    whyItMatters:
      "The comparison view keeps the long-term 1960s–2023 product boundary visible instead of hiding the chart-era distinction inside the data layer.",
  },
];

export function StoryJourney() {
  const [lead, ...rest] = STORY_JOURNEY;

  return (
    <section className="rounded-[2rem] border border-ink-800 bg-ink-900/55 p-6 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Guided route</p>
          <h2 className="h-display mt-2 text-3xl md:text-4xl">Start with songs, then test the candidate context</h2>
          <p className="mt-3 text-sm leading-6 text-ink-400">
            The strongest path is choreographed here: song-led signal first, then candidate explanations,
            then the graph and artist layers when the proof needs to be inspected.
          </p>
        </div>
        <Link
          href={lead.href}
          className="inline-flex items-center gap-2 rounded-full border border-signal-500/40 bg-signal-950/20 px-4 py-2 text-sm font-semibold text-signal-100 transition hover:border-signal-400/60 hover:bg-signal-950/35"
        >
          Begin with 2020
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Link
          href={lead.href}
          className="group relative overflow-hidden rounded-[1.85rem] border border-ink-800 bg-[linear-gradient(160deg,rgba(11,12,18,0.96),rgba(9,11,17,0.84))] p-6 transition hover:-translate-y-0.5 hover:border-signal-400/40"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-signal-500/20 via-signal-500/10 to-transparent" />
          <div className="relative flex h-full flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.24em] text-ink-500">Step 01</span>
              <Sparkles className="h-4 w-4 text-signal-200" />
            </div>
            <div className="max-w-xl">
              <h3 className="h-display text-3xl md:text-4xl">{lead.title}</h3>
              <p className="mt-3 max-w-lg text-sm leading-6 text-ink-300">{lead.description}</p>
            </div>
            <p className="max-w-xl text-sm leading-6 text-signal-100/90">{lead.whyItMatters}</p>
            <div className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-signal-200">
              Open the first lens
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </Link>

        <div className="grid gap-4 sm:grid-cols-2">
          {rest.slice(0, 2).map((step) => (
            <JourneyCard key={step.step} step={step} />
          ))}
          <div className="rounded-[1.85rem] border border-ink-800 bg-ink-950/55 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Why this works</p>
            <p className="mt-3 text-sm leading-6 text-ink-300">
              The interface is now arranged like a path through the investigation, not a directory of
              pages. Users can start fast, then peel back into graph evidence when they want more trust.
            </p>
          </div>
          <div className="rounded-[1.85rem] border border-ink-800 bg-ink-950/55 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Next layer</p>
            <p className="mt-3 text-sm leading-6 text-ink-300">
              The artist profile compresses the same evidence into a broader cultural reading, which
              keeps the exploration loop open after the strongest song and context claims.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {rest.slice(2).map((step) => (
          <JourneyCard key={step.step} step={step} compact />
        ))}
      </div>
    </section>
  );
}

function JourneyCard({ step, compact = false }: { step: JourneyStep; compact?: boolean }) {
  return (
    <Link
      href={step.href}
      className={`group relative overflow-hidden rounded-[1.5rem] border border-ink-800 bg-ink-950/55 p-5 transition hover:-translate-y-0.5 hover:border-signal-400/40 ${
        compact ? "min-h-[11rem]" : ""
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-echo-500/10 via-transparent to-signal-500/10 opacity-0 transition group-hover:opacity-100" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-[0.22em] text-ink-500">Step {step.step}</span>
          <span className="rounded-full border border-ink-700 bg-ink-900/80 px-2.5 py-0.5 text-[11px] text-ink-300">
            story route
          </span>
        </div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink-50 text-balance">
          {step.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink-300">{step.description}</p>
        <p className="mt-4 text-xs leading-5 text-ink-500">{step.whyItMatters}</p>
        <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-signal-200">
          Open route
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
