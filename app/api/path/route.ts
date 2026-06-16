// Shortest-path query between two graph nodes (song / artist / event /
// theme / mood / entity / year). Returns the BFS-shortest path with
// per-edge evidence baked in.

import { NextResponse } from "next/server";
import { findShortestPath } from "@/lib/graph/path-finder";
import { getGraphNode } from "@/lib/db/queries";
import { initDb } from "@/lib/db";
import { parse, GraphPathQuery } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const parsed = parse(GraphPathQuery, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    edgeTypes: url.searchParams.getAll("edgeType"),
    maxHops: url.searchParams.get("maxHops") ?? "6",
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { from, to, edgeTypes, maxHops } = parsed.data;

  const fromNode = getGraphNode(from);
  const toNode = getGraphNode(to);
  if (!fromNode || !toNode) {
    return NextResponse.json(
      { error: !fromNode ? `from node not found: ${from}` : `to node not found: ${to}` },
      { status: 404 }
    );
  }

  const result = findShortestPath(from, to, {
    edgeTypes: edgeTypes && edgeTypes.length ? edgeTypes : undefined,
    maxHops,
    directed: false,
  });

  return NextResponse.json({
    from: fromNode,
    to: toNode,
    result,
    generatedAt: new Date().toISOString(),
  });
}
