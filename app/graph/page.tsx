import { Suspense } from "react";
import type { Metadata } from "next";
import { GraphExplorer } from "@/components/graph/graph-explorer";

export const metadata: Metadata = {
  title: "Knowledge graph",
  description:
    "Explore the VerseSignal knowledge graph across the long-term corpus target (1960s–2023), with the shipped demo slice covering 2018–2023.",
  openGraph: {
    images: [
      {
        url: "/api/og?type=graph&title=VerseSignal%20Graph&subtitle=Explore%20songs%2C%20artists%2C%20events%2C%20themes%20and%20moods%20through%20the%20knowledge%20graph",
        width: 1200,
        height: 630,
      },
    ],
  },
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
