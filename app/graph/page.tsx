import { Suspense } from "react";
import type { Metadata } from "next";
import { GraphExplorer } from "@/components/graph/graph-explorer";

export const metadata: Metadata = {
  title: "Knowledge graph",
  description:
    "Explore the VerseSignal knowledge graph: songs, themes, entities, artists, and events connected across 6 years (2018–2023).",
};

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
