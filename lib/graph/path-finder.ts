// In-memory graph loader and BFS path finder.
//
// Per the G3 decision (path-finder belongs in the graph layer, not
// the UI layer), this is the canonical path query for the app.
//
// For 2,500+ edges, an in-memory BFS is fast (sub-100ms for
// depth-6 queries). If the graph grows past 50k edges, switch to
// a SQL recursive CTE in lib/db/queries.ts.

import { getDb } from "../db";
import { all } from "../db/sql";
import type { GraphEdge, GraphNode } from "../types";

interface RawNode { id: string; node_type: string; label: string }
interface RawEdge {
  id: string;
  src_id: string;
  dst_id: string;
  edge_type: string;
  weight: number;
  confidence: number;
  evidence_ids_json: string | null;
  source_api: string;
  model_version: string | null;
  explanation: string | null;
  created_at: string;
}

export interface GraphData {
  nodes: Map<string, GraphNode>;
  // Adjacency: src_id → list of (dst_id, edge)
  forward: Map<string, Array<{ dstId: string; edge: GraphEdge }>>;
  // Reverse adjacency for bi-directional BFS (undirected semantics)
  backward: Map<string, Array<{ srcId: string; edge: GraphEdge }>>;
  builtAt: number;
}

let _cache: GraphData | null = null;
let _cacheBuiltAt = 0;
const CACHE_TTL_MS = 30_000; // 30s — invalidates after re-enrich

export function loadGraph(force = false): GraphData {
  if (!force && _cache && Date.now() - _cacheBuiltAt < CACHE_TTL_MS) {
    return _cache;
  }
  const nodeRows = all<RawNode>(`SELECT id, node_type, label FROM graph_nodes`);
  const edgeRows = all<RawEdge>(`SELECT * FROM graph_edges`);

  const nodes = new Map<string, GraphNode>();
  for (const r of nodeRows) {
    nodes.set(r.id, { id: r.id, nodeType: r.node_type as GraphNode["nodeType"], label: r.label });
  }

  const forward = new Map<string, Array<{ dstId: string; edge: GraphEdge }>>();
  const backward = new Map<string, Array<{ srcId: string; edge: GraphEdge }>>();
  for (const r of edgeRows) {
    const edge: GraphEdge = {
      id: r.id,
      srcId: r.src_id,
      dstId: r.dst_id,
      edgeType: r.edge_type as GraphEdge["edgeType"],
      weight: r.weight,
      confidence: r.confidence,
      evidenceIds: r.evidence_ids_json ? JSON.parse(r.evidence_ids_json) : [],
      sourceApi: r.source_api as GraphEdge["sourceApi"],
      modelVersion: r.model_version ?? undefined,
      explanation: r.explanation ?? undefined,
      createdAt: r.created_at,
    };
    if (!forward.has(r.src_id)) forward.set(r.src_id, []);
    forward.get(r.src_id)!.push({ dstId: r.dst_id, edge });
    if (!backward.has(r.dst_id)) backward.set(r.dst_id, []);
    backward.get(r.dst_id)!.push({ srcId: r.src_id, edge });
  }

  _cache = { nodes, forward, backward, builtAt: Date.now() };
  _cacheBuiltAt = Date.now();
  return _cache;
}

export function invalidateGraphCache(): void {
  _cache = null;
  _cacheBuiltAt = 0;
}

export interface PathResult {
  found: boolean;
  reason?: "same_node" | "not_found" | "too_long" | "no_path";
  nodes: GraphNode[];
  edges: GraphEdge[];
  hopCount: number;
  totalWeight: number;
  avgConfidence: number;
  exploredNodes: number;
  elapsedMs: number;
}

/**
 * BFS shortest path between two node IDs, optionally filtered by edge
 * type. Unweighted (each hop = 1). Returns the lowest-hop-count path;
 * ties broken by total edge weight.
 *
 * Cycle-safe: visited set per direction.
 */
export function findShortestPath(
  fromId: string,
  toId: string,
  opts: { edgeTypes?: string[]; maxHops?: number; directed?: boolean } = {}
): PathResult {
  const start = performance.now();
  const maxHops = opts.maxHops ?? 6;
  const directed = opts.directed ?? false;
  const allowed = opts.edgeTypes ? new Set(opts.edgeTypes) : null;

  if (fromId === toId) {
    return { found: true, reason: "same_node", nodes: [], edges: [], hopCount: 0, totalWeight: 0, avgConfidence: 0, exploredNodes: 0, elapsedMs: 0 };
  }

  const g = loadGraph();
  if (!g.nodes.has(fromId) || !g.nodes.has(toId)) {
    return { found: false, reason: "not_found", nodes: [], edges: [], hopCount: 0, totalWeight: 0, avgConfidence: 0, exploredNodes: 0, elapsedMs: 0 };
  }

  // Queue entries: [nodeId, pathNodeIds[], pathEdges[]]
  type QueueItem = { id: string; path: string[]; edges: GraphEdge[]; weight: number; conf: number };
  const visited = new Set<string>([fromId]);
  const queue: QueueItem[] = [{ id: fromId, path: [fromId], edges: [], weight: 0, conf: 0 }];
  let explored = 0;
  let best: QueueItem | null = null;

  while (queue.length > 0) {
    const item = queue.shift()!;
    explored++;
    if (item.path.length - 1 > maxHops) continue;
    if (item.id === toId) {
      if (!best || item.path.length - 1 < best.path.length - 1 ||
          (item.path.length - 1 === best.path.length - 1 && item.weight > best.weight)) {
        best = item;
      }
      continue;
    }

    const neighbors = g.forward.get(item.id) ?? [];
    const alsoBack = directed ? [] : (g.backward.get(item.id) ?? []);
    const candidates = [...neighbors, ...alsoBack];

    for (const cand of candidates) {
      const nextId = "dstId" in cand ? cand.dstId : cand.srcId;
      if (visited.has(nextId)) continue;
      if (allowed && !allowed.has(cand.edge.edgeType)) continue;
      visited.add(nextId);
      queue.push({
        id: nextId,
        path: [...item.path, nextId],
        edges: [...item.edges, cand.edge],
        weight: item.weight + cand.edge.weight,
        conf: item.conf + cand.edge.confidence,
      });
    }
  }

  if (!best) {
    return { found: false, reason: "no_path", nodes: [], edges: [], hopCount: 0, totalWeight: 0, avgConfidence: 0, exploredNodes: explored, elapsedMs: performance.now() - start };
  }

  if (best.path.length - 1 > maxHops) {
    return { found: false, reason: "too_long", nodes: [], edges: [], hopCount: best.path.length - 1, totalWeight: best.weight, avgConfidence: best.conf / Math.max(1, best.edges.length), exploredNodes: explored, elapsedMs: performance.now() - start };
  }

  return {
    found: true,
    nodes: best.path.map((id) => g.nodes.get(id)!).filter(Boolean),
    edges: best.edges,
    hopCount: best.path.length - 1,
    totalWeight: Math.round(best.weight * 1000) / 1000,
    avgConfidence: best.edges.length > 0
      ? Math.round((best.conf / best.edges.length) * 1000) / 1000
      : 0,
    exploredNodes: explored,
    elapsedMs: Math.round((performance.now() - start) * 100) / 100,
  };
}
