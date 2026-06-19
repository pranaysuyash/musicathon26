"use client";

// Test page for the EvidenceDrawer — used to take screenshots
// showing the drawer with realistic evidence data.
//
// Per Decision 0030, the demo edge must reflect what the linker
// actually produces, not what an older permissive linker used to
// claim. This demo uses the Straightenin (Migos) → COVID-19
// lockdowns edge, which is grounded in concrete lyric evidence:
// "Turn a pandemic into a bandemic" — a direct pandemic reference.
// (The old demo used Blinding Lights → COVID, which the new
// linker correctly rejects because the song doesn't reference
// any COVID keywords.)

import { useState } from "react";
import { EvidenceDrawer } from "@/components/evidence/evidence-drawer";
import type { GraphEdge, Evidence } from "@/lib/types";

const SAMPLE_EDGE: GraphEdge = {
  id: "versesignal:e:versesignal:2021:33:straightenin-migos:event:versesignal:ev:covid_19:theme_overlap",
  srcId: "versesignal:n:song:versesignal:2021:33:straightenin-migos",
  dstId: "versesignal:n:event:versesignal:ev:covid_19",
  edgeType: "associated_with_event",
  weight: 0.55,
  confidence: 0.6,
  sourceApi: "hybrid",
  evidenceIds: ["ev-1", "ev-2", "ev-3", "ev-4", "ev-5", "ev-6", "ev-7", "ev-8"],
  explanation:
    "Song lyrics contain a direct pandemic reference. The song-event match is supported by both the literal keyword ('pandemic') and the lockdown-era window (2020–2021) — a keyword-anchored theme overlap, not a theme-only inference.",
};

const SAMPLE_EVIDENCE: Evidence[] = [
  {
    id: "ev-1",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "lyric_line",
    value: "Turn a pandemic into a bandemic",
    source: "musixmatch",
    confidence: 0.95,
    createdAt: "2026-06-19T00:00:00Z",
  },
  {
    id: "ev-2",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "lyric_line",
    value: "Shoot out the window like Drizzy and Freaky (freak)",
    source: "musixmatch",
    confidence: 0.9,
    createdAt: "2026-06-19T00:00:00Z",
  },
  {
    id: "ev-3",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "lyric_term",
    value: "pandemic, window",
    source: "lexicon",
    confidence: 0.95,
    createdAt: "2026-06-19T00:00:00Z",
  },
  {
    id: "ev-4",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "event_date_overlap",
    value: "Song charted during 2020–2021 lockdown window (2020-03-15 to 2021-06-01)",
    source: "billboard",
    confidence: 1.0,
    createdAt: "2026-06-19T00:00:00Z",
  },
  {
    id: "ev-5",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "candidate_moment_match",
    value: "Theme alignment: escape_party 0.42, loneliness 0.31 (lockdown-era themes)",
    source: "lexicon",
    confidence: 0.6,
    createdAt: "2026-06-19T00:00:00Z",
  },
  {
    id: "ev-6",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "lyric_line",
    value: "I been going crazy, I don't even know the meaning (yeah)",
    source: "musixmatch",
    confidence: 0.85,
    createdAt: "2026-06-19T00:00:00Z",
  },
  {
    id: "ev-7",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "lyric_line",
    value: "Straightenin, straightenin, yeah (straight)",
    source: "musixmatch",
    confidence: 0.8,
    createdAt: "2026-06-19T00:00:00Z",
  },
  {
    id: "ev-8",
    edgeId: SAMPLE_EDGE.id,
    evidenceType: "metadata_credit",
    value: "Auto-linked by the keyword-anchored theme_overlap linker (Decision 0030). The song's literal 'pandemic' reference is the primary anchor; the lockdown-era window is the temporal gate.",
    source: "manual",
    confidence: 1.0,
    createdAt: "2026-06-19T00:00:00Z",
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
          <p className="mt-2 text-xs text-ink-400">Straightenin (Migos, 2021) → COVID-19 lockdowns</p>
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
