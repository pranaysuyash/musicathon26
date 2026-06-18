import Link from "next/link";
import type { Metadata } from "next";
import { PathPanel } from "@/components/graph/path-panel";

export const metadata: Metadata = {
  title: "Ask the graph",
  description:
    "Use plain language to ask how a lyric, artist, event, or year are connected through evidence-backed graph paths.",
};

export default function AskPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const initialAsk = searchParams.q?.trim() ?? "";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/graph" className="text-xs text-ink-400 hover:text-ink-200">
        ← Back to graph explorer
      </Link>

      <header className="mt-4">
        <h1 className="h-display text-4xl font-semibold tracking-tight md:text-5xl">
          Ask the graph
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-ink-300">
          Ask in natural language and we&apos;ll resolve terms to graph nodes, then return the shortest
          evidence-backed path.
        </p>
      </header>

      <section className="mt-8">
        <PathPanel initialAsk={initialAsk} />
      </section>
    </main>
  );
}
