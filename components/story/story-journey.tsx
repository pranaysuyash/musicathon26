// "Start the story" guided journey.
//
// Per external review (P1), the strongest paths through
// VerseSignal should be choreographed, not discovered.
// This component renders a hero CTA that walks the judge
// through:
//
//   1. /lens/2020               — the year signal profile
//   2. /event/...covid_19        — the COVID event
//   3. /graph?root=...covid_19   — the COVID graph
//   4. /song/...blinding-lights  — the strongest COVID song
//
// The journey is a sequence of `?step=N` URLs; the home
// page renders the next-step CTA. Each step page (Lens,
// Event, Graph) renders a "next: ..." footer pointing
// at the next URL.

"use client";

import Link from "next/link";
import { useState } from "react";

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
    title: "2020 — what were the charts saying?",
    description:
      "The lyrics-first signal profile: 18 signals across 25 chart songs, ranked by how much they shifted vs the prior 3-year baseline.",
    href: "/lens/2020",
    whyItMatters:
      "This is the surface that turns the graph from data viz into a cultural analysis engine. The auto-generated takeaway answers 'what were people feeling' before showing any events.",
  },
  {
    step: 2,
    title: "COVID-19 lockdowns",
    description:
      "The world event that shaped 2020 chart music. See the per-event signal deltas: melancholic +203%, celebratory +103%, romantic -34%.",
    href: "/event/versesignal:ev:covid_19",
    whyItMatters:
      "Each event card now shows the signals that shifted during it, vs the prior 3-year baseline. The chart music data corroborates the cultural context.",
  },
  {
    step: 3,
    title: "The COVID graph",
    description:
      "The 2-hop neighborhood of COVID-19: every song, theme, entity, and event connected to the pandemic. Click any edge to see evidence.",
    href: "/graph?rootType=event&rootId=versesignal%3An%3Aevent%3Aversesignal%3Aev%3Acovid_19&hops=2",
    whyItMatters:
      "This is the most connective event in the corpus. The graph is now the secondary surface; the lens is the primary.",
  },
  {
    step: 4,
    title: "Blinding Lights",
    description:
      "The #1 song of 2020. The song-event connection (lockdowns ↔ party/nightlife escape) is the canonical cultural-posture example.",
    href: "/song/versesignal:2020:01:blinding-lights-the-weeknd",
    whyItMatters:
      "The song page shows: themes, moods, entities, event connections, similar songs, and the artist metadata. The graph is in every section.",
  },
];

export function StoryJourney() {
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-300">
        The story
      </h2>
      <p className="mt-1 text-sm text-ink-400">
        A 4-step guided walkthrough of what the data shows.
      </p>
      <ol className="mt-4 space-y-3">
        {STORY_JOURNEY.map((s) => (
          <li key={s.step}>
            <Link
              href={s.href}
              className="group block rounded-lg border border-ink-800 bg-ink-900/40 p-3 transition hover:border-signal-500/50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal-500 text-sm font-semibold text-ink-950">
                  {s.step}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-ink-100 group-hover:text-signal-300">
                    {s.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-400">{s.description}</p>
                </div>
                <span className="text-ink-500 group-hover:text-signal-300">→</span>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
