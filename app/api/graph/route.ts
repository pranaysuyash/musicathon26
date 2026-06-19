// Graph neighborhood query: bounded BFS from a node.

import { NextResponse } from "next/server";
import { getNodeNeighborhood, getGraphNode } from "@/lib/db/queries";
import { initDb } from "@/lib/db";
import { parse, GraphQuery } from "@/lib/api-schemas";

export const dynamic = "force-dynamic";

const DEFAULT_GRAPH_ROOT = "versesignal:n:year:2020";
const SONG_NODE_PREFIX = "versesignal:n:song:";
const EVENT_NODE_PREFIX = "versesignal:n:event:";
const YEAR_NODE_PREFIX = "versesignal:n:year:";
const THEME_NODE_PREFIX = "versesignal:n:theme:";
const ENTITY_NODE_PREFIX = "versesignal:n:entity:";
const ARTIST_NODE_PREFIX = "versesignal:n:artist:";
const REGION_NODE_PREFIX = "versesignal:n:region:";

function canonicalNodeFromQuery(rawNodeId: string | null, rootType: string | null): string | null {
  if (!rawNodeId) return null;
  const nodeId = rawNodeId.trim();
  if (!nodeId) return null;
  if (nodeId.startsWith("versesignal:n:")) return nodeId;
  if (nodeId.startsWith("versesignal:ev:")) return `${EVENT_NODE_PREFIX}${nodeId}`;
  if (nodeId.startsWith("versesignal:year:")) return `${YEAR_NODE_PREFIX}${nodeId.slice("versesignal:year:".length)}`;
  if (/^versesignal:\d{4}:\d{2}:.+/.test(nodeId)) return `${SONG_NODE_PREFIX}${nodeId}`;
  if (nodeId.startsWith("versesignal:")) return rootType === "event" ? `${EVENT_NODE_PREFIX}${nodeId}` : nodeId;
  if (/^\d{4}$/.test(nodeId)) return `${YEAR_NODE_PREFIX}${nodeId}`;
  if (/^\d{4}:\d{2}:.+/.test(nodeId)) return `${SONG_NODE_PREFIX}${nodeId}`;
  if (rootType === "song") return `${SONG_NODE_PREFIX}${nodeId}`;
  if (rootType === "year") return `${YEAR_NODE_PREFIX}${nodeId}`;
  if (rootType === "event") return `${EVENT_NODE_PREFIX}${nodeId}`;
  if (rootType === "theme") return `${THEME_NODE_PREFIX}${nodeId}`;
  if (rootType === "entity") return `${ENTITY_NODE_PREFIX}${nodeId}`;
  if (rootType === "artist") return `${ARTIST_NODE_PREFIX}${nodeId}`;
  if (rootType === "region") return `${REGION_NODE_PREFIX}${nodeId}`;
  return null;
}

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const requestedNodeId = url.searchParams.get("nodeId") ?? url.searchParams.get("rootId");
  const rootType = url.searchParams.get("rootType");
  const parsed = parse(GraphQuery, {
    nodeId: requestedNodeId,
    hops: url.searchParams.get("hops") ?? "2",
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const requested = canonicalNodeFromQuery(parsed.data.nodeId ?? null, rootType);
  const fallbackNodeId = DEFAULT_GRAPH_ROOT;
  const resolvedNodeId = requested ?? fallbackNodeId;
  let root = getGraphNode(resolvedNodeId);
  if (!root && resolvedNodeId !== fallbackNodeId) {
    root = getGraphNode(fallbackNodeId);
  }
  if (!root) return NextResponse.json({ error: "node not found" }, { status: 404 });

  const { nodes, edges } = getNodeNeighborhood(root.id, parsed.data.hops);
  return NextResponse.json({ root, nodes, edges, generatedAt: new Date().toISOString() });
}
