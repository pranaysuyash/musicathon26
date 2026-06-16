"use client";

import { useEffect, useState } from "react";
import { ConfidenceBar, Pill } from "@/components/ui/primitives";
import type { GraphNode, GraphEdge } from "@/lib/types";

interface PathApiResponse {
  from: GraphNode;
  to: GraphNode;
  result: {
    found: boolean;
    reason?: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    hopCount: number;
    totalWeight: number;
    avgConfidence: number;
    exploredNodes: number;
    elapsedMs: number;
  };
}

interface Props {
  initialFromId?: string;
  initialToId?: string;
}

export function PathPanel({ initialFromId, initialToId }: Props) {
  const [from, setFrom] = useState(initialFromId ?? "");
  const [to, setTo] = useState(initialToId ?? "");
  const [edgeTypes, setEdgeTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PathApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Curated "interesting" starting pairs so demo doesn't need autocomplete
  const presets: Array<{ label: string; from: string; to: string }> = [
    {
      label: "Blinding Lights → COVID-19",
      from: "versesignal:n:song:versesignal:2020:01:blinding-lights-the-weeknd",
      to: "versesignal:n:event:versesignal:ev:covid_19",
    },
    {
      label: "Heat Waves (2021) → Heat Waves (2022)",
      from: "versesignal:n:song:versesignal:2021:16:heat-waves-glass-animals",
      to: "versesignal:n:song:versesignal:2022:01:heat-waves-glass-animals",
    },
    {
      label: "God's Plan → Hope (theme)",
      from: "versesignal:n:song:versesignal:2018:01:gods-plan-drake",
      to: "versesignal:n:theme:hope",
    },
    {
      label: "Levitating (Dua Lipa) → Ukraine war",
      from: "versesignal:n:song:versesignal:2021:01:levitating-dua-lipa",
      to: "versesignal:n:event:versesignal:ev:ukraine_war",
    },
  ];

  useEffect(() => {
    if (initialFromId) setFrom(initialFromId);
    if (initialToId) setTo(initialToId);
  }, [initialFromId, initialToId]);

  async function run() {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, maxHops: "6" });
      for (const et of edgeTypes) params.append("edgeType", et);
      const r = await fetch(`/api/path?${params}`);
      if (!r.ok) throw new Error(`path query failed: ${r.status}`);
      const j = (await r.json()) as PathApiResponse;
      setData(j);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Pill variant="signal">PATH MODE</Pill>
        <span className="text-xs text-ink-400">Shortest path between two graph nodes (BFS, ≤6 hops).</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-500">From node ID</span>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="versesignal:n:song:..."
            className="mt-1 w-full rounded border border-ink-800 bg-ink-900/60 px-3 py-2 font-mono text-xs text-ink-100 placeholder:text-ink-600 focus:border-signal-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-500">To node ID</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="versesignal:n:event:..."
            className="mt-1 w-full rounded border border-ink-800 bg-ink-900/60 px-3 py-2 font-mono text-xs text-ink-100 placeholder:text-ink-600 focus:border-signal-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-500">Presets:</span>
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
            className="pill pill-mute hover:bg-ink-700"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={run}
          disabled={loading || !from || !to}
          className="rounded-lg bg-signal-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-signal-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Searching…" : "Find path"}
        </button>
        {data ? (
          <span className="text-xs text-ink-500">
            {data.result.found
              ? `Found in ${data.result.hopCount} hop${data.result.hopCount === 1 ? "" : "s"} · ${data.result.elapsedMs}ms`
              : `Not found: ${data.result.reason ?? "no path"}`}
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

      {data?.result.found ? (
        <div className="mt-5 space-y-3">
          <div className="text-xs text-ink-400">
            {data.result.hopCount} hop{data.result.hopCount === 1 ? "" : "s"} ·
            {" "}avg confidence {data.result.avgConfidence.toFixed(2)} · {data.result.exploredNodes} nodes explored
          </div>
          <ol className="space-y-2">
            {data.result.nodes.map((node, i) => {
              const edge = data.result.edges[i - 1];
              return (
                <li key={node.id}>
                  {i > 0 ? (
                    <div className="mb-2 ml-4 flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-signal-500" />
                        <div className="my-1 h-6 w-px bg-ink-700" />
                      </div>
                      <div className="flex-1">
                        <Pill variant="warn">{edge.edgeType.replace(/_/g, " ")}</Pill>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
                          weight {(edge.weight * 100).toFixed(0)}%
                          <ConfidenceBar value={edge.confidence} />
                          <span>·</span>
                          <span>{edge.sourceApi}</span>
                        </div>
                        {edge.explanation ? (
                          <p className="mt-1 text-[11px] text-ink-400 italic">{edge.explanation}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded border border-ink-800 bg-ink-900/60 p-3">
                    <div className="flex items-center gap-2">
                      <Pill variant="mute">{node.nodeType}</Pill>
                      <span className="text-sm text-ink-100">{node.label}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-ink-500">{node.id}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
