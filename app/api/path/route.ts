// Shortest-path query between two graph nodes (song / artist / event /
// theme / mood / entity / year). Returns the BFS-shortest path with
// per-edge evidence baked in.
//
// Per motto_v3 §0.6 (high-risk verification): every query is audited
// in the `path_queries` table (observability, audit trail, operator
// visibility). Input validation is layered: Zod for shape, manual
// checks for from===to and node-existence. Failures return clean
// 4xx/5xx with a human-readable message — no 500 leaks.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { findShortestPath } from "@/lib/graph/path-finder";
import { getGraphNode, getEvidenceForEdge } from "@/lib/db/queries";
import { initDb, getDb } from "@/lib/db";
import { run } from "@/lib/db/sql";
import { parse, GraphPathQuery } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

function ipHash(req: Request): string | null {
  // Privacy: hash IP before storing per 0.11. No raw IP in the audit log.
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

interface AuditRow {
  fromId: string;
  toId: string;
  edgeTypes: string[] | null;
  maxHops: number;
  found: boolean;
  hopCount: number | null;
  totalWeight: number | null;
  avgConfidence: number | null;
  exploredNodes: number | null;
  elapsedMs: number;
  reason: string | null;
  ipHash: string | null;
  userAgent: string | null;
}

function audit(row: AuditRow): void {
  try {
    run(
      `INSERT INTO path_queries
        (from_id, to_id, edge_types_json, max_hops, found, hop_count, total_weight, avg_confidence, explored_nodes, elapsed_ms, reason, ip_hash, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.fromId,
      row.toId,
      row.edgeTypes ? JSON.stringify(row.edgeTypes) : null,
      row.maxHops,
      row.found ? 1 : 0,
      row.hopCount,
      row.totalWeight,
      row.avgConfidence,
      row.exploredNodes,
      row.elapsedMs,
      row.reason,
      row.ipHash,
      row.userAgent
    );
  } catch (err) {
    // Audit logging must not break the user query. Per 0.10, log
    // to stderr as a fallback; the audit is best-effort.
    console.error(`[path] audit insert failed: ${(err as Error).message}`);
  }
}

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const parsed = parse(GraphPathQuery, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    edgeTypes: url.searchParams.getAll("edgeType"),
    maxHops: url.searchParams.get("maxHops") ?? "6",
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "invalid_input", message: parsed.error, details: parsed.error },
      { status: 400 }
    );
  }
  const { from, to, edgeTypes, maxHops } = parsed.data;
  const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;
  const hash = ipHash(req);

  // Per 0.6: clean 404 for unknown nodes, not 500.
  const fromNode = getGraphNode(from);
  const toNode = getGraphNode(to);
  if (!fromNode || !toNode) {
    const reason = !fromNode ? "from_not_found" : "to_not_found";
    audit({
      fromId: from, toId: to, edgeTypes: edgeTypes ?? null, maxHops: maxHops ?? 6,
      found: false, hopCount: null, totalWeight: null, avgConfidence: null,
      exploredNodes: 0, elapsedMs: 0, reason, ipHash: hash, userAgent: ua,
    });
    return NextResponse.json(
      { error: "not_found", reason, from: !fromNode ? from : undefined, to: !toNode ? to : undefined },
      { status: 404 }
    );
  }

  // Per 0.6: handle from===to as a "same_node" result, not a hang
  // and not a 500. The path-finder already returns same_node but
  // we audit it explicitly here.
  if (from === to) {
    audit({
      fromId: from, toId: to, edgeTypes: edgeTypes ?? null, maxHops: maxHops ?? 6,
      found: true, hopCount: 0, totalWeight: 0, avgConfidence: 0,
      exploredNodes: 0, elapsedMs: 0, reason: "same_node", ipHash: hash, userAgent: ua,
    });
    return NextResponse.json({
      from: fromNode, to: toNode,
      result: { found: true, reason: "same_node", nodes: [], edges: [], hopCount: 0, totalWeight: 0, avgConfidence: 0, exploredNodes: 0, elapsedMs: 0 },
      generatedAt: new Date().toISOString(),
    });
  }

  // Per 0.6: wrap the BFS in try/catch. The path-finder is
  // high-risk; an uncaught error here would 500 the user.
  let result: ReturnType<typeof findShortestPath>;
  try {
    result = findShortestPath(from, to, {
      edgeTypes: edgeTypes && edgeTypes.length ? edgeTypes : undefined,
      maxHops: maxHops ?? 6,
      directed: false,
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[path] BFS failed: ${message}`);
    audit({
      fromId: from, toId: to, edgeTypes: edgeTypes ?? null, maxHops: maxHops ?? 6,
      found: false, hopCount: null, totalWeight: null, avgConfidence: null,
      exploredNodes: 0, elapsedMs: 0, reason: "bfs_error", ipHash: hash, userAgent: ua,
    });
    return NextResponse.json(
      { error: "internal_error", reason: "bfs_error", message: "Path search failed; try a shorter maxHops or fewer edgeType filters." },
      { status: 500 }
    );
  }

  audit({
    fromId: from, toId: to, edgeTypes: edgeTypes ?? null, maxHops: maxHops ?? 6,
    found: result.found,
    hopCount: result.found ? result.hopCount : null,
    totalWeight: result.found ? result.totalWeight : null,
    avgConfidence: result.found ? result.avgConfidence : null,
    exploredNodes: result.exploredNodes,
    elapsedMs: result.elapsedMs,
    reason: result.found ? null : (result.reason ?? "no_path"),
    ipHash: hash, userAgent: ua,
  });

  // For the not-found case, return 200 with a structured response
  // (the query was valid; the graph just doesn't have a path).
  // For the 5s-timeout case, also 200.
  // For the too_long case, also 200 (just longer than maxHops).
  return NextResponse.json({
    from: fromNode,
    to: toNode,
    result,
    generatedAt: new Date().toISOString(),
  });
}
