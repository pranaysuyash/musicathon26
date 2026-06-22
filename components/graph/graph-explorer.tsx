"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { GraphEdge, GraphNode, Evidence } from "@/lib/types";
import { EvidenceDrawer } from "@/components/evidence/evidence-drawer";
import { PathPanel } from "@/components/graph/path-panel";
import { Pill } from "@/components/ui/primitives";
import { EvidenceBadge } from "@/components/evidence/evidence-badge";
import { UI_EVIDENCE_LABELS, type UiEvidenceType } from "@/lib/evidence/types";

type GraphMode = "story" | "explorer" | "evidence" | "weak" | "compare";

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
  const rootId = sp.get("rootId") ?? "versesignal:n:year:2020";
  const hops = Number(sp.get("hops") ?? "2");
  const mode: GraphMode =
    (sp.get("mode") as GraphMode | null) ??
    (sp.get("storyStep") ? "story" : "story");
  const [data, setData] = useState<GraphResponse | null>(null);
  // Start in loading state so the user's first paint shows progress,
  // not the empty state. The useEffect below kicks the fetch; for SSR
  // we still want to render the loading skeleton immediately rather
  // than the empty state.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [graphPulse, setGraphPulse] = useState(false);
  const [pathPulse, setPathPulse] = useState(false);
  const [edgePulse, setEdgePulse] = useState(false);
  const [discoveryMilestones, setDiscoveryMilestones] = useState<string[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState("Start a graph move.");

  const discoveryCap = 5;
  const discoveryScore = Math.min(discoveryMilestones.length, discoveryCap);

  function unlockMilestone(key: string, message: string) {
    setDiscoveryMilestones((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      setDiscoveryMessage(message);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("versesignal-discovery", JSON.stringify(next));
      }
      return next;
    });
  }

  // The graph component is dynamic-imported with ssr:false, so the
  // SSR HTML shows the Suspense fallback. On the client, the first
  // render is the empty state (data=null, loading=false), then
  // useEffect fires (loading=true), then the API returns (data=set).
  // We want the user's first paint to be informative, not a generic
  // "Choose a node" message. Track whether we've attempted the
  // initial fetch yet; if not, show the loading state.
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/graph?nodeId=${encodeURIComponent(rootId)}&rootType=${encodeURIComponent(rootType)}&hops=${hops}`
        );
        if (!res.ok) throw new Error(`Graph query failed: ${res.status}`);
        const json = (await res.json()) as GraphResponse;
        if (!cancelled) {
          setData(json);
          setGraphPulse(true);
          unlockMilestone("graph_loaded", "Neighborhood loaded. New territory unlocked.");
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHasFetched(true);
        }
      }
    }
    if (rootId) load();
    return () => {
      cancelled = true;
    };
  }, [rootId, hops, rootType]);

  useEffect(() => {
    if (!graphPulse) return;
    const timer = window.setTimeout(() => setGraphPulse(false), 900);
    return () => window.clearTimeout(timer);
  }, [graphPulse]);

  useEffect(() => {
    if (!pathPulse) return;
    const timer = window.setTimeout(() => setPathPulse(false), 900);
    return () => window.clearTimeout(timer);
  }, [pathPulse]);

  useEffect(() => {
    if (!edgePulse) return;
    const timer = window.setTimeout(() => setEdgePulse(false), 900);
    return () => window.clearTimeout(timer);
  }, [edgePulse]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("versesignal-discovery");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
        setDiscoveryMilestones(parsed.slice(0, discoveryCap));
      }
    } catch {
      // keep empty
    }
  }, []);

  useEffect(() => {
    if (!selectedEdge) {
      setEvidence([]);
      return;
    }
    unlockMilestone("edge_selected", "You opened a graph edge. Time to inspect the evidence trail.");
    fetch(`/api/edge-evidence?edgeId=${encodeURIComponent(selectedEdge.id)}`)
      .then((r) => r.json())
      .then((j: EvidenceResponse) => {
        setEvidence(j.evidence ?? []);
        if ((j.evidence ?? []).length > 0) {
          unlockMilestone("evidence_loaded", "Evidence loaded. Trust your path.");
          setEdgePulse(true);
        }
      })
      .catch(() => setEvidence([]));
  }, [selectedEdge]);

  function jumpTo(route: string, milestone: string, message: string) {
    router.push(route);
    unlockMilestone(milestone, message);
    setGraphPulse(true);
  }

  function setMode(next: GraphMode) {
    const url = new URL(window.location.href);
    if (next === "story") {
      url.searchParams.set("mode", "story");
      url.searchParams.set("storyStep", "0");
      url.searchParams.set("rootType", "year");
      url.searchParams.set("rootId", "versesignal:n:year:2020");
      url.searchParams.set("hops", "2");
    } else {
      url.searchParams.set("mode", next);
      url.searchParams.delete("storyStep");
      if (next === "weak") {
        url.searchParams.set("hops", "3");
      }
    }
    router.push(url.pathname + url.search);
    unlockMilestone(`mode_${next}`, `Switched to ${next} mode.`);
  }

  function onPathFound() {
    setPathPulse(true);
    unlockMilestone("path_found", "Discovery complete: shortest path found.");
  }

  function onSelectEdge(edge: GraphEdge) {
    setSelectedEdge(edge);
    unlockMilestone("edge_selected", "You opened a graph edge. Time to inspect the evidence trail.");
  }

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
      <h1 className="h-display mb-2 text-3xl font-semibold tracking-tight">Cultural graph</h1>
      <p className="mb-6 text-sm text-ink-400">
        {nodeCount} nodes · {edgeCount} edges · {hops}-hop neighborhood. Pick a mode to change what the graph surface shows.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          { id: "story", label: "Story", desc: "Guided 2020 → COVID → songs → evidence" },
          { id: "explorer", label: "Explorer", desc: "Free roam with jump anchors" },
          { id: "evidence", label: "Evidence", desc: "Highlight edges with strong proof" },
          { id: "weak", label: "Weak signals", desc: "Surface tentative connections" },
          { id: "compare", label: "Compare", desc: "Two-year signal contrast" },
        ] as { id: GraphMode; label: string; desc: string }[]).map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition ${
              mode === m.id
                ? "border-signal-400/40 bg-signal-500/15"
                : "border-ink-800 bg-ink-950/60 hover:border-ink-700"
            }`}
            type="button"
          >
            <span className={`text-xs font-semibold ${mode === m.id ? "text-signal-100" : "text-ink-200"}`}>{m.label}</span>
            <span className="text-[10px] text-ink-500">{m.desc}</span>
          </button>
        ))}
      </div>

      {mode === "story" ? (
        <StoryPanel
          step={Number(sp.get("storyStep") ?? "0")}
          onStep={(step, route) => {
            if (route) jumpTo(route, `story_step_${step}`, `Story step ${step + 1}.`);
          }}
        />
      ) : null}

      {mode === "compare" ? (
        <ComparePanel onJump={(route) => jumpTo(route, "compare_opened", "Comparison view opened.")} />
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="mr-1">
          <div className="mb-1 text-xs uppercase tracking-wider text-ink-500">Discovery Meter</div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-44 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full origin-left animate-micro-glow bg-gradient-to-r from-signal-500 to-echo-500 transition-[width] duration-500"
                style={{ width: `${(discoveryScore / discoveryCap) * 100}%` }}
              />
            </div>
            <span className="text-xs text-ink-300">{discoveryScore}/{discoveryCap}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-500">{discoveryMessage}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-ink-500">Jump to:</span>
        <button
          onClick={() =>
            jumpTo(
              `/graph?rootType=year&rootId=versesignal:n:year:2020&hops=${hops}`,
              "jump_2020",
              "Anchored at 2020 for a fast discovery run."
            )
          }
          className="pill pill-signal"
        >
          2020
        </button>
        <button
          onClick={() =>
            jumpTo(
              `/graph?rootType=era&rootId=versesignal:n:era:broadcast_counterculture&hops=${hops}`,
              "jump_era_1960s",
              "Shifting to the broadcast/counterculture era."
            )
          }
          className="pill pill-mute"
        >
          1960s era
        </button>
        <button
          onClick={() =>
            jumpTo(
              `/graph?rootType=era&rootId=versesignal:n:era:global_streaming_era&hops=${hops}`,
              "jump_era_2020s",
              "Shifting to the global streaming era."
            )
          }
          className="pill pill-mute"
        >
          2020s era
        </button>
        <button
          onClick={() =>
            jumpTo(
              `/graph?rootType=event&rootId=versesignal:n:event:versesignal:ev:covid_19&hops=${hops}`,
              "jump_covid",
              "Shifting to COVID event cluster."
            )
          }
          className="pill pill-echo"
        >
          COVID-19
        </button>
        <button
          onClick={() =>
            jumpTo(
              `/graph?rootType=event&rootId=versesignal:n:event:versesignal:ev:ukraine_war&hops=${hops}`,
              "jump_ukraine",
              "Shifting to Ukraine war cluster."
            )
          }
          className="pill pill-echo"
        >
          Ukraine war
        </button>
        <button
          onClick={() =>
            jumpTo(
              `/graph?rootType=event&rootId=versesignal:n:event:versesignal:ev:blm_2020&hops=${hops}`,
              "jump_blm",
              "Shifting to BLM 2020 cluster."
            )
          }
          className="pill pill-echo"
        >
          BLM 2020
        </button>
        <button
          onClick={() => jumpTo("/ask", "jump_ask", "Opening guided ask mode.")}
          className="pill pill-signal"
          type="button"
        >
          Ask the graph
        </button>
        <span className="ml-3 text-xs uppercase tracking-wider text-ink-500">Hops:</span>
        {[1, 2, 3].map((h) => (
          <button
            key={h}
            onClick={() =>
              jumpTo(
                `/graph?rootType=${rootType}&rootId=${encodeURIComponent(rootId)}&hops=${h}`,
                `hops_${h}`,
                `Expanding radius to ${h} hop${h === 1 ? "" : "s"}.`
              )
            }
            className={`pill ${h === hops ? "pill-signal" : "pill-mute"}`}
          >
            {h}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr,400px]">
        <div>
          {loading ? (
            <div className="card flex h-[55vh] min-h-[400px] flex-col items-center justify-center gap-2 text-ink-500 md:h-[640px]">
              <div className="text-sm">Loading {data?.root?.label ?? "2020"} neighborhood…</div>
              <div className="text-xs text-ink-600">
                Anchored at <code className="text-ink-400">{rootId}</code>, {hops} hop{hops === 1 ? "" : "s"}.
              </div>
            </div>
          ) : error ? (
            <div className="card flex h-[55vh] min-h-[400px] items-center justify-center text-red-400 md:h-[640px]">{error}</div>
          ) : data ? (
            <div className={`transition-all duration-700 ${graphPulse ? "animate-graph-pulse" : ""}`}>
              <GraphView
                rootId={data.root.id}
                nodes={data.nodes}
                edges={filterEdgesByMode(data.edges as unknown as import("@/lib/types").GraphEdge[], mode)}
                onSelectEdge={(e) => onSelectEdge(e as unknown as GraphEdge)}
              />
            </div>
          ) : hasFetched ? (
            <div className="card flex h-[55vh] min-h-[400px] flex-col items-center justify-center gap-3 text-ink-500 md:h-[640px]">
              <div className="text-sm">No neighborhood found for this anchor.</div>
              <div className="text-xs text-ink-600">Try one of the quick-jump anchors above.</div>
            </div>
          ) : (
            <div className="card flex h-[55vh] min-h-[400px] flex-col items-center justify-center gap-3 text-ink-500 md:h-[640px]">
              <div className="text-sm">Choose a node to anchor the graph.</div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-400">
                <span>Try:</span>
                <button
                  onClick={() => jumpTo("/graph?rootType=year&rootId=versesignal:n:year:2020&hops=2", "tutorial_2020", "Anchored at 2020.")}
                  className="pill pill-signal"
                  type="button"
                >2020 (default)</button>
                <button
                  onClick={() => jumpTo("/graph?rootType=era&rootId=versesignal:n:era:global_streaming_era&hops=2", "tutorial_era", "Anchored at the global streaming era.")}
                  className="pill pill-mute"
                  type="button"
                >2020s era</button>
                <button
                  onClick={() => jumpTo("/graph?rootType=event&rootId=versesignal:n:event:versesignal:ev:covid_19&hops=2", "tutorial_covid", "Anchored at COVID-19.")}
                  className="pill pill-echo"
                  type="button"
                >COVID-19</button>
              </div>
            </div>
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
        <div className={`space-y-4 ${edgePulse ? "animate-edge-pulse" : ""}`}>
          {/* Mobile backdrop — invisible on lg+. Tap-outside-to-close */}
          {selectedEdge ? (
            <button
              type="button"
              aria-label="Close evidence panel"
              onClick={() => setSelectedEdge(null)}
              className="fixed inset-0 z-30 bg-ink-950/60 backdrop-blur-sm lg:hidden"
            />
          ) : null}
          <EvidenceDrawer
            edge={selectedEdge}
            evidence={evidence}
            onClose={() => setSelectedEdge(null)}
          />
        </div>
      </div>

      <section className={`mt-8 ${pathPulse ? "animate-path-panel-pulse" : ""}`}>
        <PathPanel
          onPathFound={(result) => {
            if (result.found) onPathFound();
          }}
        />
      </section>
    </main>
  );
}

function filterEdgesByMode(
  edges: import("@/lib/types").GraphEdge[],
  mode: GraphMode
): import("@/lib/types").GraphEdge[] {
  if (mode === "weak") {
    return edges.filter((e) => (e.confidence ?? 0) < 0.45);
  }
  if (mode === "evidence") {
    return edges.filter((e) => (e.confidence ?? 0) >= 0.6);
  }
  return edges;
}

const STORY_STEPS: { title: string; body: string; route: string }[] = [
  {
    title: "Start with 2020",
    body: "The year COVID-19, BLM, and the US election all compressed into the charts.",
    route: "/graph?mode=story&storyStep=0&rootType=year&rootId=versesignal:n:year:2020&hops=2",
  },
  {
    title: "Open the COVID event",
    body: "Move from the year to the pandemic event node and inspect its song edges.",
    route: "/graph?mode=story&storyStep=1&rootType=event&rootId=versesignal:n:event:versesignal:ev:covid_19&hops=2",
  },
  {
    title: "Find isolation",
    body: "Look for the isolation / loneliness theme cluster that spiked during lockdowns.",
    route: "/graph?mode=story&storyStep=2&rootType=theme&rootId=versesignal:n:theme:isolation&hops=2",
  },
  {
    title: "See the songs",
    body: "Drop into the song neighborhood to find the tracks that carried that theme.",
    route: "/graph?mode=story&storyStep=3&rootType=theme&rootId=versesignal:n:theme:isolation&hops=2",
  },
  {
    title: "Check evidence",
    body: "Click any edge to open the evidence drawer and see direct lyric vs semantic vs temporal proof.",
    route: "/graph?mode=evidence&rootType=event&rootId=versesignal:n:event:versesignal:ev:covid_19&hops=2",
  },
  {
    title: "Compare regions",
    body: "Jump to the globe to see whether the same mood showed up everywhere or fragmented by region.",
    route: "/globe?year=2020&region=US",
  },
];

function StoryPanel({
  step,
  onStep,
}: {
  step: number;
  onStep: (step: number, route: string) => void;
}) {
  return (
    <section className="mb-6 rounded-2xl border border-signal-500/30 bg-gradient-to-br from-signal-900/20 to-ink-950/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-signal-300">Guided story</p>
          <h2 className="mt-1 text-lg font-semibold text-ink-100">2020 → COVID → isolation → songs → evidence → regions</h2>
        </div>
        <span className="rounded-full border border-signal-500/30 bg-signal-500/15 px-3 py-1 text-xs text-signal-200">
          Step {Math.min(step + 1, STORY_STEPS.length)} of {STORY_STEPS.length}
        </span>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STORY_STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onStep(i, s.route)}
                className={`h-full w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-signal-400/40 bg-signal-500/15"
                    : done
                      ? "border-ink-700 bg-ink-900/40 opacity-70"
                      : "border-ink-800 bg-ink-950/60 hover:border-ink-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                      done ? "bg-emerald-500/20 text-emerald-300" : active ? "bg-signal-500/20 text-signal-300" : "bg-ink-800 text-ink-500"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="text-sm font-medium text-ink-100">{s.title}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-400">{s.body}</p>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ComparePanel({ onJump }: { onJump: (route: string) => void }) {
  return (
    <section className="mb-6 rounded-2xl border border-echo-500/30 bg-gradient-to-br from-echo-900/20 to-ink-950/60 p-5">
      <p className="text-xs uppercase tracking-[0.26em] text-echo-300">Compare mode</p>
      <h2 className="mt-1 text-lg font-semibold text-ink-100">What changed between two years?</h2>
      <p className="mt-2 text-sm text-ink-400">
        Pick a baseline year and a target year. The graph will load the target year; use the lens page for side-by-side signal profiles.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onJump("/compare/2019/2020")}
          className="rounded-full bg-echo-500 px-4 py-2 text-xs font-semibold text-ink-950 transition hover:bg-echo-400"
        >
          2019 vs 2020
        </button>
        <button
          type="button"
          onClick={() => onJump("/compare/1969/2020")}
          className="rounded-full border border-echo-500/40 px-4 py-2 text-xs font-semibold text-echo-200 transition hover:bg-echo-500/15"
        >
          1969 vs 2020
        </button>
      </div>
    </section>
  );
}
