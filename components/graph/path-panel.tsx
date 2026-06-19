"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfidenceBar, Pill } from "@/components/ui/primitives";
import { EvidencePreview, type EvidencePreviewItem } from "@/components/evidence/evidence-preview";
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

interface AskInsight {
  headline: string;
  summary: string;
  averageEdgeConfidence: number;
  evidenceRowCount: number;
  dominantSources: string[];
  hopTypes: string[];
  routeHint?: string;
}

interface AskEdgeEvidence {
  id: string;
  title: string;
  text: string;
  source: string;
  confidence: number;
  matchedTerms: string[];
}

interface AskApiPathData extends PathApiResponse {
  insight?: AskInsight;
  edgeEvidence?: Record<string, AskEdgeEvidence[]>;
}

type AskCandidate = {
  id: string;
  nodeType: GraphNode["nodeType"];
  label: string;
};

type AskResolvedNode = {
  query: string;
  resolvedId: string | null;
  resolvedLabel: string | null;
  resolvedNodeType: GraphNode["nodeType"] | null;
  candidates: AskCandidate[];
  suggestion?: string;
};

interface AskApiResponse extends PathApiResponse {
  input: string;
  resolved: {
    from: AskResolvedNode;
    to: AskResolvedNode;
  };
  insight?: AskInsight;
  edgeEvidence?: Record<string, AskEdgeEvidence[]>;
}

interface Props {
  initialFromId?: string;
  initialToId?: string;
  initialAsk?: string;
  onPathFound?: (result: PathApiResponse["result"]) => void;
}

const ASK_EXAMPLES = [
  "Find a path from Blinding Lights to COVID-19",
  "Connect 2020 and Ukraine war",
  "Show a path between loneliness and escape",
];

const EDGE_TYPES = [
  { value: "associated_with_event", label: "Event" },
  { value: "contains_theme", label: "Theme" },
  { value: "mentions_entity", label: "Entity" },
  { value: "similar_to", label: "Similar" },
  { value: "performed_by", label: "Artist" },
];

export function PathPanel({
  initialFromId,
  initialToId,
  initialAsk,
  onPathFound,
}: Props) {
  const [from, setFrom] = useState(initialFromId ?? "");
  const [to, setTo] = useState(initialToId ?? "");
  const [edgeTypes, setEdgeTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AskApiPathData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askInput, setAskInput] = useState(initialAsk ?? "");
  const [pathReveal, setPathReveal] = useState(false);
  const lastAutoAsk = useRef<string | null>(null);
  const [askResolution, setAskResolution] = useState<{
    from: AskResolvedNode;
    to: AskResolvedNode;
  } | null>(null);
  const [candidateFromId, setCandidateFromId] = useState<string | null>(null);
  const [candidateToId, setCandidateToId] = useState<string | null>(null);

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
      label: "God's Plan → violence (theme)",
      from: "versesignal:n:song:versesignal:2018:01:gods-plan-drake",
      to: "versesignal:n:theme:violence",
    },
    {
      label: "Straightenin (Migos) → COVID-19 (real keyword match)",
      from: "versesignal:n:song:versesignal:2021:33:straightenin-migos",
      to: "versesignal:n:event:versesignal:ev:covid_19",
    },
  ];

  useEffect(() => {
    if (initialFromId) setFrom(initialFromId);
    if (initialToId) setTo(initialToId);
  }, [initialFromId, initialToId]);

  useEffect(() => {
    if (initialAsk) {
      const normalized = initialAsk.trim();
      if (normalized) {
        setAskInput(normalized);
        // runAsk is defined further down in the file (TDZ-safe use).
        // We can't call it here without triggering a "Cannot access
        // before initialization" error on first render. Instead we
        // seed the input value; the existing auto-run-on-input
        // effect (line ~287) will fire runAsk once it stabilizes.
      }
    }
    // We deliberately don't depend on runAsk here — the value is
    // captured by the ask-input effect that runs after this one.
  }, [initialAsk]);

  const runPath = useCallback(
    async (overrides?: { fromId?: string; toId?: string }) => {
    const sourceFrom = overrides?.fromId ?? from;
    const sourceTo = overrides?.toId ?? to;
    if (!sourceFrom || !sourceTo) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: sourceFrom, to: sourceTo, maxHops: "6" });
      for (const et of edgeTypes) params.append("edgeType", et);
      const r = await fetch(`/api/path?${params}`);
      if (!r.ok) throw new Error(`path query failed: ${r.status}`);
      const j = (await r.json()) as PathApiResponse;
      setData(j);
      setFrom(sourceFrom);
      setTo(sourceTo);
      setCandidateFromId(sourceFrom);
      setCandidateToId(sourceTo);
      if (j.result.found) {
        onPathFound?.(j.result);
        setPathReveal(true);
      }
      setAskResolution(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  },
    [from, to, edgeTypes, onPathFound]
  );

  const runAsk = useCallback(
    async (question?: string) => {
      const query = question?.trim() ?? askInput.trim();
      if (!query) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: query, maxHops: "6" });
        for (const et of edgeTypes) params.append("edgeType", et);
        const r = await fetch(`/api/graph-ask?${params}`);
        const j =
          (await r.json()) as
            | (AskApiResponse & {
                error?: string;
                message?: string;
                resolved?: {
                  from: AskResolvedNode | null;
                  to: AskResolvedNode | null;
                };
              })
            | (PathApiResponse & {
                error?: string;
                message?: string;
                resolved?: never;
              });
        if (!r.ok) {
          if (j.resolved) {
            const resolvedFrom = j.resolved.from;
            const resolvedTo = j.resolved.to;
            if (resolvedFrom && resolvedTo) {
              setAskResolution({
                from: resolvedFrom as AskResolvedNode,
                to: resolvedTo as AskResolvedNode,
              });
              setCandidateFromId((resolvedFrom as AskResolvedNode).resolvedId ?? null);
              setCandidateToId((resolvedTo as AskResolvedNode).resolvedId ?? null);
            }
          }
          if (j.error) {
            throw new Error((j as { message?: string }).message ?? j.error);
          }
          throw new Error("Graph ask failed");
        }
        if (!("resolved" in j) || !("from" in j) || !("to" in j)) {
          throw new Error("Unexpected graph ask response");
        }
        const typed = j as AskApiResponse;
        setData({
          from: typed.from,
          to: typed.to,
          result: typed.result,
          insight: typed.insight,
          edgeEvidence: typed.edgeEvidence,
        });
        setFrom(typed.from.id);
        setTo(typed.to.id);
        setCandidateFromId(typed.from.id);
        setCandidateToId(typed.to.id);
        setAskResolution(typed.resolved);
        if (typed.result.found) {
          onPathFound?.(typed.result);
          setPathReveal(true);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [askInput, edgeTypes, onPathFound]
  );

  const runFromSelectedCandidates = useCallback(() => {
    if (!candidateFromId || !candidateToId) return;
    runPath({ fromId: candidateFromId, toId: candidateToId });
  }, [candidateFromId, candidateToId, runPath]);

  useEffect(() => {
    if (!askResolution) {
      return;
    }
    setCandidateFromId(
      askResolution.from.resolvedId ??
        askResolution.from.candidates.at(0)?.id ??
        candidateFromId
    );
    setCandidateToId(
      askResolution.to.resolvedId ??
        askResolution.to.candidates.at(0)?.id ??
        candidateToId
    );
  }, [askResolution, candidateFromId, candidateToId]);

  useEffect(() => {
    if (!initialAsk?.trim()) return;
    const normalized = initialAsk.trim();
    if (lastAutoAsk.current === normalized) return;
    lastAutoAsk.current = normalized;
    if (askInput !== normalized) {
      setAskInput(normalized);
    }
    void runAsk(normalized);
  }, [initialAsk, runAsk, askInput]);

  useEffect(() => {
    if (!pathReveal) return;
    const timer = window.setTimeout(() => setPathReveal(false), 900);
    return () => window.clearTimeout(timer);
  }, [pathReveal]);

  const pathSongCards = data?.result.nodes.filter((node) => node.nodeType === "song") ?? [];

  const songCards = pathSongCards.slice(1, -1).length > 0 ? pathSongCards.slice(1, -1) : [];

  const nodeHref = (node: GraphNode): string | null => {
    if (node.nodeType === "song" && node.id.startsWith("versesignal:n:song:")) {
      const songId = node.id.slice("versesignal:n:song:".length);
      return `/song/${encodeURIComponent(songId)}`;
    }
    if (node.nodeType === "artist") {
      return `/artist/${encodeURIComponent(node.label)}`;
    }
    if (node.nodeType === "event" && node.id.startsWith("versesignal:n:event:")) {
      const eventId = node.id.slice("versesignal:n:event:".length);
      return `/event/${encodeURIComponent(eventId)}`;
    }
    if (node.nodeType === "theme") {
      return `/theme/${encodeURIComponent(node.label)}`;
    }
    if (node.nodeType === "entity") {
      return `/entity/${encodeURIComponent(node.label)}`;
    }
    if (node.nodeType === "year") {
      return `/year/${encodeURIComponent(node.label)}`;
    }
    if (node.nodeType === "region") {
      return `/globe?region=${encodeURIComponent(node.label)}`;
    }
    return null;
  };

  const evidencePreview = (edgeId: string): EvidencePreviewItem[] | null => {
    const items = data?.edgeEvidence?.[edgeId];
    if (!items || items.length === 0) return null;
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      text: item.text,
      source: item.source,
      confidence: item.confidence,
      matchedTerms: item.matchedTerms,
    }));
  };

  return (
    <div className="card p-5">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Pill variant="signal">ASK MODE</Pill>
          <span className="text-xs text-ink-400">
            Ask in plain language. Example: “connect 2020 and Ukraine war”
          </span>
        </div>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-500">Ask the graph</span>
          <textarea
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            placeholder='Try "Show a path from 2020 to Ukraine war"'
            rows={2}
            className="mt-1 w-full rounded border border-ink-800 bg-ink-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-signal-500 focus:outline-none"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => runAsk()}
            disabled={loading || !askInput.trim()}
            className="rounded-lg bg-signal-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-signal-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Searching…" : "Ask graph"}
          </button>
          <span className="text-xs text-ink-500">Examples:</span>
          {ASK_EXAMPLES.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => setAskInput(text)}
              className="pill pill-mute hover:bg-ink-700"
            >
              {text}
            </button>
          ))}
        </div>
        {askResolution ? (
          <div className="mt-3 text-xs text-ink-400">
            <p>
              <span className="text-ink-500">Resolved:</span>{" "}
              <span className="text-ink-100">{askResolution.from.resolvedLabel ?? "Unresolved"}</span>
              {" → "}
              <span className="text-ink-100">{askResolution.to.resolvedLabel ?? "Unresolved"}</span>
            </p>
            {askResolution.from.suggestion ? (
              <p className="mt-1 text-amber-300">Tip: {askResolution.from.suggestion}</p>
            ) : null}
            <p className="mt-1 text-ink-500">Multiple matches are shown as selectable candidates.</p>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                <span className="text-ink-500">From:</span>
                {askResolution.from.candidates.map((candidate) => (
                  <button
                    key={`from-${candidate.id}`}
                    type="button"
                    onClick={() => setCandidateFromId(candidate.id)}
                    className={`pill ${candidateFromId === candidate.id ? "pill-signal" : "pill-mute"}`}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-ink-500">To:</span>
                {askResolution.to.candidates.map((candidate) => (
                  <button
                    key={`to-${candidate.id}`}
                    type="button"
                    onClick={() => setCandidateToId(candidate.id)}
                    className={`pill ${candidateToId === candidate.id ? "pill-signal" : "pill-mute"}`}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2">
              <button
                type="button"
                onClick={runFromSelectedCandidates}
                disabled={!candidateFromId || !candidateToId}
                className="rounded-lg bg-signal-500 px-3 py-1.5 text-xs font-medium text-ink-950 transition hover:bg-signal-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Run selected candidates
              </button>
            </div>
          </div>
        ) : null}
      </div>

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
            type="button"
            className="pill pill-mute hover:bg-ink-700"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-500">Edge types:</span>
        {EDGE_TYPES.map((t) => {
          const active = edgeTypes.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              onClick={() =>
                setEdgeTypes(
                  active ? edgeTypes.filter((x) => x !== t.value) : [...edgeTypes, t.value]
                )
              }
              className={`pill ${active ? "pill-signal" : "pill-mute"}`}
            >
              {t.label}
            </button>
          );
        })}
        {edgeTypes.length > 0 ? (
          <button
            type="button"
            onClick={() => setEdgeTypes([])}
            className="pill pill-warn ml-1"
          >
            clear
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => runPath()}
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
          {data.insight ? (
            <div className="rounded border border-signal-700/40 bg-signal-500/8 p-3 text-xs">
              <p className="font-medium text-signal-200">{data.insight.headline}</p>
              <p className="mt-1 text-ink-300">{data.insight.summary}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-ink-500">
                <span>Evidence rows: {data.insight.evidenceRowCount}</span>
                <span>·</span>
                <span>Avg confidence: {(data.insight.averageEdgeConfidence * 100).toFixed(0)}%</span>
                {data.insight.routeHint ? (
                  <>
                    <span>·</span>
                    <a href={data.insight.routeHint} className="text-signal-300 hover:text-signal-200">
                      Open in graph
                    </a>
                  </>
                ) : null}
                {data.insight.dominantSources.length ? (
                  <>
                    <span>·</span>
                    <span>Sources: {data.insight.dominantSources.slice(0, 3).join(", ")}</span>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="inline-flex animate-reveal-burst items-center gap-2 rounded-md border border-signal-700/50 bg-signal-500/10 px-3 py-1 text-xs text-signal-200">
            <span>🔥</span>
            <span>Path found and unlocked. You just discovered a cultural bridge.</span>
          </div>
          <div className="text-xs text-ink-400">
            {data.result.hopCount} hop{data.result.hopCount === 1 ? "" : "s"} ·
            {" "}
            avg confidence {data.result.avgConfidence.toFixed(2)} · {data.result.exploredNodes} nodes explored
          </div>
          {songCards.length > 0 ? (
            <div className="card space-y-2 p-3">
              <div className="text-xs uppercase tracking-wider text-ink-500">Song cards on the path</div>
              <div className="grid gap-2 md:grid-cols-2">
                {songCards.map((songNode) => {
                  const href = nodeHref(songNode);
                  if (!href) return null;
                  return (
                    <a
                      key={songNode.id}
                      href={href}
                      className="rounded border border-ink-800 bg-ink-900/55 p-2 text-sm hover:border-signal-600"
                    >
                      <p className="text-ink-100">{songNode.label}</p>
                      <p className="mt-1 text-[10px] text-ink-500">Song in bridge</p>
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}
          <ol className={`space-y-2 ${pathReveal ? "animate-path-reveal" : ""}`}>
            {data.result.nodes.map((node, i) => {
              const edge = data.result.edges[i - 1];
              return (
                <li key={node.id} className="transition-all">
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
                        {evidencePreview(edge.id) ? (
                          <div className="mt-2">
                            <EvidencePreview items={evidencePreview(edge.id) ?? []} title="Path evidence" maxItems={2} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded border border-ink-800 bg-ink-900/60 p-3">
                    <div className="flex items-center gap-2">
                      <Pill variant="mute">{node.nodeType}</Pill>
                      {nodeHref(node) ? (
                        <a
                          href={nodeHref(node) ?? "#"}
                          className="text-sm text-ink-100 hover:text-signal-300"
                        >
                          {node.label}
                        </a>
                      ) : (
                        <span className="text-sm text-ink-100">{node.label}</span>
                      )}
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
