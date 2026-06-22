"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function GraphPreviewPanel() {
  const nodes = [
    { id: "covid", label: "COVID-19", x: 50, y: 18, tone: "warn" },
    { id: "isolation", label: "isolation", x: 22, y: 42, tone: "signal" },
    { id: "lockdown", label: "lockdown", x: 78, y: 42, tone: "signal" },
    { id: "songs", label: "songs", x: 34, y: 72, tone: "echo" },
    { id: "regions", label: "regions", x: 66, y: 72, tone: "purple" },
    { id: "evidence", label: "evidence", x: 50, y: 90, tone: "emerald" },
  ];

  const edges = [
    ["covid", "isolation"],
    ["covid", "lockdown"],
    ["isolation", "songs"],
    ["lockdown", "songs"],
    ["songs", "regions"],
    ["regions", "evidence"],
  ];

  return (
    <section className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Graph preview</p>
          <h2 className="h-display mt-2 text-2xl md:text-3xl">Walk the evidence network</h2>
        </div>
        <Link
          href="/graph"
          className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
        >
          Open full graph
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="relative mt-5 aspect-[16/9] overflow-hidden rounded-[1.6rem] border border-ink-800 bg-ink-900/40">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          {edges.map(([from, to]) => {
            const a = nodes.find((n) => n.id === from)!;
            const b = nodes.find((n) => n.id === to)!;
            return (
              <line
                key={`${from}-${to}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(125,211,252,0.35)"
                strokeWidth="0.9"
              />
            );
          })}
          {nodes.map((n) => {
            const colors: Record<string, string> = {
              warn: "#fbbf24",
              signal: "#38bdf8",
              echo: "#c084fc",
              purple: "#a78bfa",
              emerald: "#34d399",
            };
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="3.8" fill={colors[n.tone]} />
                <circle cx={n.x} cy={n.y} r="7" fill="none" stroke={colors[n.tone]} opacity="0.22" />
                <text
                  x={n.x}
                  y={n.y - 7}
                  textAnchor="middle"
                  className="fill-ink-300"
                  style={{ fontSize: "3px", letterSpacing: "0.18em", textTransform: "uppercase" }}
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-400">
        The graph connects songs, events, themes, and evidence. Click any edge to see why the connection exists and why it may be weak.
      </p>
    </section>
  );
}
