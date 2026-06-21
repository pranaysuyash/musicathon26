"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface GraphNode {
  id: string;
  label: string;
  nodeType: string;
  properties?: Record<string, unknown>;
}
interface GraphEdge {
  id: string;
  srcId: string;
  dstId: string;
  edgeType: string;
  weight: number;
  confidence: number;
  sourceApi: string;
  explanation?: string;
  evidenceIds: string[];
}
interface Props {
  rootId?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectEdge: (edge: GraphEdge) => void;
  onSelectNode?: (node: GraphNode) => void;
  height?: number;
}

const NODE_COLORS: Record<string, string> = {
  song: "#7dd3fc",
  artist: "#f0abfc",
  year: "#fde047",
  era: "#fb923c",
  event: "#f87171",
  theme: "#34d399",
  mood: "#a78bfa",
  entity: "#fbbf24",
  word: "#94a3b8",
  region: "#22d3ee",
  chart: "#f472b6",
};

const EDGE_COLORS: Record<string, string> = {
  performed_by: "rgba(240, 171, 252, 0.4)",
  charted_in: "rgba(253, 224, 71, 0.35)",
  belongs_to_era: "rgba(251, 146, 60, 0.42)",
  contains_theme: "rgba(52, 211, 153, 0.45)",
  has_mood: "rgba(167, 139, 250, 0.4)",
  mentions_entity: "rgba(251, 191, 36, 0.5)",
  associated_with_event: "rgba(248, 113, 113, 0.55)",
  similar_to: "rgba(125, 211, 252, 0.4)",
  same_mood_cluster: "rgba(167, 139, 250, 0.3)",
  emotional_alignment: "rgba(248, 113, 113, 0.6)",
  emotional_shadow: "rgba(248, 113, 113, 0.7)",
};

export function GraphView({ nodes, edges, onSelectEdge, onSelectNode, rootId, height = 600 }: Props) {
  // Per motto 0.1, the question on a phone is "is the graph
  // actually visible?" — a 600px hard-coded canvas on a 667px-tall
  // iPhone SE viewport leaves almost no chrome. We measure the
  // viewport and use 55vh on mobile (capped at 640 on desktop) so
  // the user sees a real graph, not a postage stamp.
  const [responsiveHeight, setResponsiveHeight] = useState<number>(height);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const compute = () => {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      if (isDesktop) {
        setResponsiveHeight(height);
      } else {
        // 55vh of the window height, min 320 so the graph is usable
        // on small phones. The wrapping card's h-[55vh] style will
        // also enforce this on the parent side.
        const vh = window.innerHeight * 0.55;
        setResponsiveHeight(Math.max(320, vh));
      }
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [height]);

  const data = useMemo(() => {
    const enrichedNodes = nodes.map((n) => ({
      id: n.id,
      name: n.label,
      nodeType: n.nodeType,
      color: n.id === rootId ? "#fff" : NODE_COLORS[n.nodeType] ?? "#94a3b8",
      val: n.nodeType === "event" ? 6 : n.nodeType === "year" || n.nodeType === "era" ? 4 : n.nodeType === "song" ? 5 : 3,
    }));
    const links = edges.map((e) => ({
      id: e.id,
      source: e.srcId,
      target: e.dstId,
      edgeType: e.edgeType,
      color: EDGE_COLORS[e.edgeType] ?? "rgba(148, 163, 184, 0.3)",
      weight: e.weight,
      confidence: e.confidence,
      explanation: e.explanation,
    }));
    return { nodes: enrichedNodes, links };
  }, [nodes, edges, rootId]);

  return (
    <div className="card overflow-hidden" style={{ height: responsiveHeight }}>
      <ForceGraph2D
        graphData={data}
        backgroundColor="#0c0c10"
        nodeRelSize={5}
        linkWidth={((l: unknown) => 0.5 + 1.5 * (((l as { weight: number; confidence: number }).weight) * ((l as { weight: number; confidence: number }).confidence))) as never}
        linkColor={((l: unknown) => (l as { color: string }).color) as never}
        linkDirectionalParticles={((l: unknown) => Math.min(4, Math.round((l as { weight: number }).weight * 4))) as never}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={1.4}
        nodeLabel={((n: unknown) => `${(n as { name: string }).name} · ${(n as { nodeType: string }).nodeType}`) as never}
        nodeColor={((n: unknown) => (n as { color: string }).color) as never}
        cooldownTicks={120}
        onLinkClick={((l: unknown) => {
          const e = edges.find((x) => x.id === (l as { id: string }).id);
          if (e) onSelectEdge(e);
        }) as never}
        onNodeClick={((n: unknown) => {
          const orig = nodes.find((x) => x.id === (n as { id: string }).id);
          if (orig && onSelectNode) onSelectNode(orig);
        }) as never}
      />
    </div>
  );
}
