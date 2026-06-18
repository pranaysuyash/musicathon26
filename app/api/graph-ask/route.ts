// Natural-language graph path query for the Knowledge Graph.
//
// Accepts plain-language asks like:
// - "find a path from Blinding Lights to COVID-19"
// - "connect 2020 and pandemic"
// - "Show a connection between 2020 and Ukraine war"
//
// This resolver tries to map endpoint phrases to graph nodes and then
// delegates shortest-path execution to the canonical in-memory path finder.

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { findShortestPath } from "@/lib/graph/path-finder";
import { getGraphNode, searchGraphNodes } from "@/lib/db/queries";
import { parse, GraphAskQuery, GraphPathQuery } from "@/lib/api-schemas";
import type { GraphNode } from "@/lib/types";

export const dynamic = "force-dynamic";

const SONG_NODE_PREFIX = "versesignal:n:song:";
const EVENT_NODE_PREFIX = "versesignal:n:event:";
const YEAR_NODE_PREFIX = "versesignal:n:year:";
const REGION_NODE_PREFIX = "versesignal:n:region:";

interface AskApiCandidate {
  id: string;
  nodeType: GraphNode["nodeType"];
  label: string;
}

interface AskEndpointResolution {
  query: string;
  resolvedId: string | null;
  resolvedLabel: string | null;
  resolvedNodeType: GraphNode["nodeType"] | null;
  candidates: AskApiCandidate[];
  suggestion?: string;
}

interface AskApiResponse {
  input: string;
  resolved: {
    from: {
      query: string;
      resolvedId: string | null;
      resolvedLabel: string | null;
      resolvedNodeType: GraphNode["nodeType"] | null;
      candidates: AskApiCandidate[];
      suggestion?: string;
    };
    to: {
      query: string;
      resolvedId: string | null;
      resolvedLabel: string | null;
      resolvedNodeType: GraphNode["nodeType"] | null;
      candidates: AskApiCandidate[];
      suggestion?: string;
    };
  };
  from: GraphNode | null;
  to: GraphNode | null;
  result: ReturnType<typeof findShortestPath>;
  generatedAt: string;
}

function normalizeQuery(raw: string): string {
  return raw.replace(/[.,!?]$/u, "").replace(/^\s+|\s+$/g, "").trim();
}

function sanitizeEndpoint(raw: string): string {
  return raw
    .replace(/^[\u201c\u201d'"`]+/gu, "")
    .replace(/[\u201c\u201d'"`]+$/gu, "")
    .trim();
}

function normalizeNodePrefix(raw: string): string | null {
  const nodeId = raw.trim();
  if (!nodeId) return null;

  if (nodeId.startsWith("versesignal:n:")) return nodeId;
  if (/^versesignal:ev:/.test(nodeId)) return `${EVENT_NODE_PREFIX}${nodeId}`;
  if (/^versesignal:year:\d{4}$/.test(nodeId)) return `${YEAR_NODE_PREFIX}${nodeId.slice("versesignal:year:".length)}`;
  if (/^versesignal:\d{4}:\d{2}:.+/.test(nodeId)) return `${SONG_NODE_PREFIX}${nodeId}`;
  if (/^\d{4}$/.test(nodeId)) return `${YEAR_NODE_PREFIX}${nodeId}`;
  if (/^\d{4}:\d{2}:.+/.test(nodeId)) return `${SONG_NODE_PREFIX}${nodeId}`;
  if (nodeId === "global") return `${REGION_NODE_PREFIX}GLOBAL`;
  return null;
}

function detectNodeTypeHint(raw: string): { term: string; nodeType?: GraphNode["nodeType"] } {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(?:a|an|the)\s+([a-z_]+)\s+(.+)$/iu);
  if (!m) return { term: trimmed };
  const tag = m[1].toLowerCase();
  const rest = sanitizeEndpoint(m[2]);
  const typed = (() => {
    if (tag === "song") return "song" as const;
    if (tag === "event") return "event" as const;
    if (tag === "artist") return "artist" as const;
    if (tag === "theme") return "theme" as const;
    if (tag === "entity") return "entity" as const;
    if (tag === "mood") return "mood" as const;
    if (tag === "year") return "year" as const;
    if (tag === "region") return "region" as const;
    if (tag === "era") return "chart";
    return undefined;
  })();
  return { term: rest, nodeType: typed };
}

function parseAsk(raw: string): { from: string; to: string } | null {
  const q = normalizeQuery(raw);
  const patterns: RegExp[] = [
    /\b(?:path|route|link|route|connection|connect|show|find|how)\b.*\b(?:from|between)\s+(.+)\s+\b(?:to|and)\b\s+(.+)$/i,
    /\bfrom\s+(.+)\s+\b(?:to|and)\b\s+(.+)$/i,
    /\bbetween\s+(.+)\s+\band\b\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match && match[1] && match[2]) {
      return { from: match[1] ?? "", to: match[2] ?? "" };
    }
  }
  const fallback = q.match(/(.+)\s+to\s+(.+)/i);
  if (fallback && fallback[1] && fallback[2]) {
    return { from: fallback[1] ?? "", to: fallback[2] ?? "" };
  }
  return null;
}

function candidateList(nodes: GraphNode[]): AskApiCandidate[] {
  return nodes.map((n) => ({ id: n.id, nodeType: n.nodeType, label: n.label }));
}

function resolveEndpoint(rawQuery: string): AskEndpointResolution {
  const query = sanitizeEndpoint(rawQuery);
  const normalized = query.toLowerCase();
  const directId = normalizeNodePrefix(query);
  if (directId) {
    const directNode = getGraphNode(directId);
    if (directNode) {
      return {
        query,
        resolvedId: directNode.id,
        resolvedLabel: directNode.label,
        resolvedNodeType: directNode.nodeType,
        candidates: [{ id: directNode.id, nodeType: directNode.nodeType, label: directNode.label }],
      };
    }
  }

  const hinted = detectNodeTypeHint(query);
  const nodeType = hinted.nodeType;
  let candidates = searchGraphNodes(hinted.term, { limit: 12, nodeType });
  if (candidates.length === 0 && normalized !== hinted.term.toLowerCase()) {
    candidates = searchGraphNodes(query, { limit: 12, nodeType });
  }
  const exact = candidates.find((c) => c.label.toLowerCase() === normalized);
  const resolved = exact ?? candidates[0] ?? null;
  return {
    query,
    resolvedId: resolved ? resolved.id : null,
    resolvedLabel: resolved?.label ?? null,
    resolvedNodeType: resolved?.nodeType ?? null,
    candidates: candidateList(candidates),
    suggestion:
      candidates.length > 1
        ? "We picked the closest match. Add a node type in your prompt (song/event/year/artist/theme/mood/entity) for more precision."
        : undefined,
  };
}

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const parsed = parse(GraphAskQuery, {
    q: url.searchParams.get("q"),
    edgeTypes: url.searchParams.getAll("edgeType"),
    maxHops: url.searchParams.get("maxHops") ?? "6",
  });

  if (!parsed.ok) {
    return NextResponse.json(
      { error: "invalid_input", message: parsed.error },
      { status: 400 }
    );
  }

  const fromTo = parseAsk(parsed.data.q);
  if (!fromTo) {
    return NextResponse.json(
      {
        error: "unparseable_query",
        message:
          "Use a format like 'path from Blinding Lights to COVID-19' or 'connect 2020 and Ukraine war'.",
      },
      { status: 400 }
    );
  }

  const from = resolveEndpoint(fromTo.from);
  const to = resolveEndpoint(fromTo.to);

  if (!from.resolvedId || !to.resolvedId) {
    return NextResponse.json(
      {
        error: "endpoint_not_found",
        input: parsed.data.q,
        resolved: {
          from: {
            query: from.query,
            resolvedId: from.resolvedId,
            resolvedLabel: from.resolvedLabel,
            resolvedNodeType: from.resolvedNodeType,
            candidates: from.candidates,
            suggestion: !from.resolvedId ? "Try including a known node label like a song, artist, year, or event name." : undefined,
          },
          to: {
            query: to.query,
            resolvedId: to.resolvedId,
            resolvedLabel: to.resolvedLabel,
            resolvedNodeType: to.resolvedNodeType,
            candidates: to.candidates,
            suggestion: !to.resolvedId ? "Try including a known node label like a song, artist, year, or event name." : undefined,
          },
        },
        fromUnavailable: !from.resolvedId,
        toUnavailable: !to.resolvedId,
      },
      { status: 404 }
    );
  }

  const fromNode = getGraphNode(from.resolvedId);
  const toNode = getGraphNode(to.resolvedId);
  if (!fromNode || !toNode) {
    return NextResponse.json(
      { error: "endpoint_missing_node", input: parsed.data.q },
      { status: 500 }
    );
  }

  const pathInput = parse(GraphPathQuery, {
    from: fromNode.id,
    to: toNode.id,
    edgeTypes: parsed.data.edgeTypes,
    maxHops: parsed.data.maxHops,
  });
  if (!pathInput.ok) {
    return NextResponse.json(
      { error: "invalid_graph_query", message: pathInput.error },
      { status: 400 }
    );
  }

  const { from: fromId, to: toId, edgeTypes, maxHops } = pathInput.data;
  const result = findShortestPath(fromId, toId, {
    edgeTypes: edgeTypes && edgeTypes.length ? edgeTypes : undefined,
    maxHops,
    directed: false,
  });

  const response: AskApiResponse = {
    input: parsed.data.q,
    resolved: {
      from: {
        query: from.query,
        resolvedId: fromNode.id,
        resolvedLabel: fromNode.label,
        resolvedNodeType: fromNode.nodeType,
        candidates: from.candidates,
        suggestion: from.suggestion,
      },
      to: {
        query: to.query,
        resolvedId: toNode.id,
        resolvedLabel: toNode.label,
        resolvedNodeType: toNode.nodeType,
        candidates: to.candidates,
        suggestion: to.suggestion,
      },
    },
    from: fromNode,
    to: toNode,
    result,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
