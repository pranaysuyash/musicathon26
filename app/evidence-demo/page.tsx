"use client";

// Test page for the EvidenceDrawer — used to take screenshots
// showing the drawer with realistic evidence data.

import { useState } from "react";
import { EvidenceDrawer } from "@/components/evidence/evidence-drawer";
import type { GraphEdge, Evidence } from "@/lib/types";

const SAMPLE_EDGE: GraphEdge = {
  id: "versesignal:e:versesignal:2020:01:blinding-lights-the-weeknd:associated_with_event:versesignal:ev:covid_19",
  srcId: "versesignal:n:song:versesignal:2020:01:blinding-lights-the-weeknd",
  dstId: "versesignal:n:event:versesignal:ev:covid_19",
  edgeType: "associated_with_event",
  weight: 0.74,
  confidence: 0.82,
  sourceApi: "hybrid",
  evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-4", "ev-5", "ev-6", "ev-7", "ev-8"],
  explanation:
    "Song charted during the COVID-19 lockdown window. Lyrics contain repeated escape/nightlife/city/loneliness signals, but no direct pandemic references — strong escapist contrast.",
};

const SAMPLE_EVIDENCE: Evidence[] = [
  {
    id: "ev-1",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "lyric_line",
    value: "I finally took a break, and now I feel like I'm on ecstasy",
    source: "musixmatch",
    confidence: 0.95,
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "ev-2",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "lyric_line",
    value: "Pull up Maybach, beep-beep, baby. And my shit came with the heat seats, baby",
    source: "musixmatch",
    confidence: 0.9,
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "ev-3",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "lyric_term",
    value: "night, city, escape, dance",
    source: "gliner",
    confidence: 0.78,
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "ev-4",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "event_date_overlap",
    value: "Song peaked at #1 in 2020 (lockdown window 2020-03-15 to 2021-06-01)",
    source: "billboard",
    confidence: 1.0,
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "ev-5",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "mood_score",
    value: "Mood profile: hopeful 0.84, romantic 0.70, dreamy 0.54 (vs COVID baseline)",
    source: "lexicon",
    confidence: 0.6,
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "ev-6",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "entity_match",
    value: "New York City (city) — chart-relevant for 2020 lockdown-era escapist pop",
    source: "gliner",
    confidence: 0.85,
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "ev-7",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "embedding_similarity",
    value: "Cosine similarity to COVID event embedding: 0.74 (top 1% of 2020 chart songs)",
    source: "embedding",
    confidence: 0.74,
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "ev-8",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "metadata_credit",
    value: "Manual annotation: song reflects COVID escapist contrast (rule-based, supported by evidence above)",
    source: "manual",
    confidence: 1.0,
    createdAt: "2026-01-15T00:00:00Z",
  },
];

export default function EvidenceTestPage() {
  const [open, setOpen] = useState(true);
  return (
    <main className="mx-auto flex h-screen max-w-5xl gap-4 p-4">
      <div className="flex-1">
        <h1 className="text-2xl font-semibold">Test graph view</h1>
        <p className="text-sm text-ink-400">
          The evidence drawer is on the right. This is a static test
          page used to render the drawer with realistic evidence for
          screenshot/visual-verification purposes.
        </p>
        <div className="mt-6 card p-4">
          <h2 className="text-sm font-semibold">The connection</h2>
          <p className="mt-2 text-xs text-ink-400">Blinding Lights → COVID-19 lockdowns</p>
          <p className="mt-2 text-sm text-ink-300">
            {SAMPLE_EDGE.explanation}
          </p>
        </div>
        {open ? (
          <div className="mt-4 text-xs text-ink-500">
            Drawer is open. Click ✕ to close.
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="mt-4 rounded bg-signal-500 px-3 py-1 text-sm text-ink-950"
          >
            Reopen drawer
          </button>
        )}
      </div>
      {open ? (
        <EvidenceDrawer
          edge={SAMPLE_EDGE}
          evidence={SAMPLE_EVIDENCE}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </main>
  );
}
