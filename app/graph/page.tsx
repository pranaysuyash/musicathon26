import { Suspense } from "react";
import type { Metadata } from "next";
import { GraphExplorer } from "@/components/graph/graph-explorer";

export const metadata: Metadata = {
  title: "Knowledge graph",
  description:
    "Explore the VerseSignal knowledge graph across the long-term corpus target (1960s–2023), with the shipped demo slice covering 2018–2023.",
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
