import { Suspense } from "react";
import type { Metadata } from "next";
import { GraphExplorer } from "@/components/graph/graph-explorer";

export const metadata: Metadata = {
  title: "Knowledge graph",
  description:
    "Explore the VerseSignal knowledge graph: songs, events, themes, moods, entities, and evidence across 1960–2023.",
  openGraph: {
    images: [
      {
        url: "/api/og?type=graph&title=VerseSignal%20Graph",
        width: 1200,
        height: 630,
      },
    ],
  },
};

export const dynamic = "force-dynamic";

export default function GraphPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-6 py-20 text-center text-ink-500">
          Loading graph…
        </div>
      }
    >
      <GraphExplorer />
    </Suspense>
  );
}
