"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { GraphEdge, GraphNode, Evidence } from "@/lib/types";
import { EvidenceDrawer } from "@/components/evidence/evidence-drawer";
import { PathPanel } from "@/components/graph/path-panel";
import { Pill } from "@/components/ui/primitives";

const GraphView = dynamic(() =>
  import("@/components/graph/graph-view").then((m) => m.GraphView), {
  ssr: false,
  loading: () => (
    <div className="card flex h-[400px] items-center justify-center text-ink-500 md:h-[600px]">
      Loading graph…
    </div>
  ),
});

interface GraphResponse {
  root: GraphNode;
  nodes: GraphNode[];
  edges: {
    id: string;
    srcId: string;
    dstId: string;
    edgeType: string;
    weight: number;
    confidence: number;
    sourceApi: string;
    explanation?: string;
    evidenceIds: string[];
  }[];
}

interface EvidenceResponse {
  edgeId: string;
  evidence: Evidence[];
}

export function GraphExplorer() {
  const sp = useSearchParams();
  const router = useRouter();
  const rootType = sp.get("rootType") ?? "year";
  // P0 fix: previously defaulted to "" which made /graph open
  // cold with "Select a node to start." Default to 2020 (the
  // year with the richest signal profile: COVID + BLM + election).
  const rootId = sp.get("rootId") ?? "versesignal:year:2020";
  const hops = Number(sp.get("hops") ?? "2");
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/graph?nodeId=${encodeURIComponent(rootId)}&hops=${hops}`
        );
        if (!res.ok) throw new Error(`Graph query failed: ${res.status}`);
        const json = (await res.json()) as GraphResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (rootId) load();
    return () => {
      cancelled = true;
    };
  }, [rootId, hops]);

  useEffect(() => {
    if (!selectedEdge) {
      setEvidence([]);
      return;
    }
    fetch(`/api/edge-evidence?edgeId=${encodeURIComponent(selectedEdge.id)}`)
      .then((r) => r.json())
      .then((j: EvidenceResponse) => setEvidence(j.evidence ?? []))
      .catch(() => setEvidence([]));
  }, [selectedEdge]);

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  const edgeTypeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of data?.edges ?? []) {
      m[e.edgeType] = (m[e.edgeType] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <a href="/" className="text-xs text-ink-400 hover:text-ink-200">← VerseSignal</a>
        <Pill variant="signal">GRAPH EXPLORER</Pill>
        {data?.root ? (
          <Pill variant="echo">{data.root.nodeType} · {data.root.label}</Pill>
        ) : null}
      </div>
      <h1 className="h-display mb-2 text-3xl font-semibold tracking-tight">Knowledge graph</h1>
      <p className="mb-6 text-sm text-ink-400">
        {nodeCount} nodes · {edgeCount} edges · {hops}-hop neighborhood. Click any edge to see evidence.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-500">Jump to:</span>
        <button
          onClick={() => router.push(`/graph?rootType=year&rootId=versesignal:year:2020&hops=${hops}`)}
          className="pill pill-signal"
        >
          2020
        </button>
        <button
          onClick={() => router.push(`/graph?rootType=event&rootId=versesignal:n:event:versesignal:ev:covid_19&hops=${hops}`)}
          className="pill pill-echo"
        >
          COVID-19
        </button>
        <button
          onClick={() => router.push(`/graph?rootType=event&rootId=versesignal:n:event:versesignal:ev:ukraine_war&hops=${hops}`)}
          className="pill pill-echo"
        >
          Ukraine war
        </button>
        <button
          onClick={() => router.push(`/graph?rootType=event&rootId=versesignal:n:event:versesignal:ev:blm_2020&hops=${hops}`)}
          className="pill pill-echo"
        >
          BLM 2020
        </button>
        <span className="ml-3 text-xs uppercase tracking-wider text-ink-500">Hops:</span>
        {[1, 2, 3].map((h) => (
          <button
            key={h}
            onClick={() => router.push(`/graph?rootType=${rootType}&rootId=${encodeURIComponent(rootId)}&hops=${h}`)}
            className={`pill ${h === hops ? "pill-signal" : "pill-mute"}`}
          >
            {h}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr,400px]">
        <div>
          {loading ? (
            <div className="card flex h-[400px] items-center justify-center text-ink-500 md:h-[640px]">Loading graph…</div>
          ) : error ? (
            <div className="card flex h-[400px] items-center justify-center text-red-400 md:h-[640px]">{error}</div>
          ) : data ? (
            <GraphView
              rootId={data.root.id}
              nodes={data.nodes}
              edges={data.edges as unknown as import("@/lib/types").GraphEdge[]}
              onSelectEdge={(e) => setSelectedEdge(e as unknown as GraphEdge | null)}
            />
          ) : (
            <div className="card flex h-[400px] items-center justify-center text-ink-500 md:h-[640px]">Select a node to start.</div>
          )}

          {edgeTypeCounts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="text-ink-500">Edges by type:</span>
              {edgeTypeCounts.map(([t, c]) => (
                <Pill key={t} variant="mute">
                  {t.replace(/_/g, " ")}: {c}
                </Pill>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-4">
          <EvidenceDrawer
            edge={selectedEdge}
            evidence={evidence}
            onClose={() => setSelectedEdge(null)}
          />
        </div>
      </div>

      <section className="mt-8">
        <PathPanel />
      </section>
    </main>
  );
}
