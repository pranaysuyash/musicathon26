// Graph neighborhood query: bounded BFS from a node.

import { NextResponse } from "next/server";
import { getNodeNeighborhood, getGraphNode } from "@/lib/db/queries";
import { initDb } from "@/lib/db";
import { parse, GraphQuery } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const parsed = parse(GraphQuery, {
    nodeId: url.searchParams.get("nodeId"),
    hops: url.searchParams.get("hops") ?? "2",
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { nodeId, hops } = parsed.data;
  const root = getGraphNode(nodeId);
  if (!root) return NextResponse.json({ error: "node not found" }, { status: 404 });
  const { nodes, edges } = getNodeNeighborhood(nodeId, hops);
  return NextResponse.json({ root, nodes, edges, generatedAt: new Date().toISOString() });
}
