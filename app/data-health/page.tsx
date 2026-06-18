// Data quality dashboard page (the operator-facing surface).
//
// Per decision 0019 P3.1 + external review, this page
// answers: "Is the corpus ready for judging?"
//
// Server-rendered. Fetches /api/data-health at request
// time and renders a structured dashboard.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data health",
  description:
    "Operator-facing dashboard: corpus summary, source breakdown, coverage, integrity issues, and intent-vs-actual for the VerseSignal corpus.",
};

interface SourceBreakdown {
  source: string;
  count: number;
  pct_of_total: number;
}
interface CoverageRow {
  area: string;
  total: number;
  with: number;
  pct: number;
  description: string;
}
interface YearBreakdown {
  year: number;
  songs: number;
  songs_with_lyrics: number;
  events_overlapping: number;
  top_signal: string;
}
interface IntegrityIssue {
  check: string;
  severity: "info" | "warn" | "error";
  count: number;
  description: string;
}
interface IntentActual {
  description: string;
  current: number;
  target: number;
}
interface DataHealth {
  ok: boolean;
  timestamp: string;
  corpus_summary: {
    songs: number;
    songs_with_lyrics: number;
    events: number;
    entities: number;
    artists_with_jambase: number;
    artists_with_musicbrainz: number;
    artists_with_wikidata: number;
  };
  source_breakdown: {
    graph_edges: SourceBreakdown[];
    theme_scores: SourceBreakdown[];
    mood_scores: SourceBreakdown[];
    entity_mentions: SourceBreakdown[];
    evidence: SourceBreakdown[];
  };
  coverage: CoverageRow[];
  year_breakdown: YearBreakdown[];
  integrity_issues: IntegrityIssue[];
  intent_vs_actual: IntentActual[];
}

async function fetchHealth(): Promise<DataHealth | null> {
  try {
    const res = await fetch("/api/data-health", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DataHealth;
  } catch {
    return null;
  }
}

function pct(n: number) {
  return `${n.toFixed(0)}%`;
}

function progressBar(pctVal: number) {
  const filled = Math.round(pctVal / 5);
  const total = 20;
  return "#".repeat(filled) + "-".repeat(total - filled);
}

function severityColor(s: string) {
  if (s === "error") return "text-red-400 bg-red-500/10 border-red-500/30";
  if (s === "warn") return "text-warn-400 bg-warn-500/10 border-warn-500/30";
  return "text-signal-300 bg-signal-500/10 border-signal-500/30";
}

export default async function DataHealthPage() {
  const data = await fetchHealth();
  if (!data) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="h-display text-3xl">Data health</h1>
        <p className="mt-4 text-warn-400">
          /api/data-health returned an error. Check the dev server logs.
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-xs text-ink-400 hover:text-ink-200">← home</Link>
        <span className="text-ink-700">/</span>
        <span className="text-xs text-ink-400">ops</span>
      </div>
      <h1 className="h-display mt-4 text-4xl font-semibold tracking-tight">
        Data health
      </h1>
      <p className="mt-2 text-sm text-ink-400">
        Operator-facing audit. Generated at{" "}
        <code className="text-ink-300">{data.timestamp}</code>.
      </p>

      {/* Health badge */}
      <div className="mt-6">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
            data.ok
              ? "border-signal-500/30 bg-signal-500/10 text-signal-300"
              : "border-warn-500/30 bg-warn-500/10 text-warn-400"
          }`}
        >
          {data.ok ? "✓ All integrity checks pass" : "⚠ Integrity issues present"}
        </span>
      </div>

      {/* Corpus summary */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Corpus summary
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Stat label="Songs" value={data.corpus_summary.songs} />
          <Stat label="w/ lyrics" value={data.corpus_summary.songs_with_lyrics} />
          <Stat label="Events" value={data.corpus_summary.events} />
          <Stat label="Entities" value={data.corpus_summary.entities} />
          <Stat label="JamBase" value={data.corpus_summary.artists_with_jambase} />
          <Stat label="MusicBrainz" value={data.corpus_summary.artists_with_musicbrainz} />
          <Stat label="Wikidata" value={data.corpus_summary.artists_with_wikidata} />
        </div>
      </section>

      {/* Intent vs actual */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Intent vs actual
        </h2>
        <p className="mt-1 mb-3 text-sm text-ink-400">
          Where the project said it would be vs where it is.
        </p>
        <div className="card divide-y divide-ink-800/60">
          {data.intent_vs_actual.map((r, i) => {
            const p = r.target > 0 ? (r.current / r.target) * 100 : 0;
            return (
              <div key={i} className="flex items-center gap-3 p-3 text-sm">
                <div className="flex-1 truncate text-ink-200">{r.description}</div>
                <div className="w-20 text-right tabular-nums text-ink-300">
                  {r.current}/{r.target}
                </div>
                <div className="w-40 font-mono text-[10px] text-ink-500">
                  {progressBar(p)}
                </div>
                <div className="w-12 text-right tabular-nums text-ink-400">{pct(p)}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Coverage */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Coverage
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.coverage.map((c, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-100">{c.area}</span>
                <span className="ml-auto text-base font-semibold tabular-nums text-ink-300">
                  {c.pct.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 text-xs text-ink-500">
                {c.with} of {c.total}
              </div>
              <p className="mt-2 text-xs text-ink-400">{c.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Source breakdown */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Source breakdown
        </h2>
        <p className="mt-1 mb-3 text-sm text-ink-400">
          Where the data came from. Per partner API + extraction method.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.entries(data.source_breakdown).map(([table, rows]) => (
            <div key={table} className="card p-4">
              <h3 className="text-sm font-semibold text-ink-100">{table}</h3>
              <ul className="mt-2 space-y-1">
                {rows.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-20 truncate text-ink-300">{r.source}</span>
                    <div className="flex-1">
                      <div
                        className="h-1.5 rounded-full bg-signal-500/40"
                        style={{ width: `${r.pct_of_total}%` }}
                      />
                    </div>
                    <span className="w-12 text-right tabular-nums text-ink-400">
                      {r.count}
                    </span>
                    <span className="w-10 text-right tabular-nums text-ink-500">
                      {r.pct_of_total.toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Year breakdown */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Per-year breakdown
        </h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-ink-500">
              <th className="py-2">Year</th>
              <th className="py-2 text-right">Songs</th>
              <th className="py-2 text-right">w/ lyrics</th>
              <th className="py-2 text-right">Events</th>
              <th className="py-2">Top signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800/60">
            {data.year_breakdown.map((y) => (
              <tr key={y.year}>
                <td className="py-2 text-ink-100">{y.year}</td>
                <td className="py-2 text-right tabular-nums">{y.songs}</td>
                <td className="py-2 text-right tabular-nums text-ink-400">
                  {y.songs_with_lyrics}
                </td>
                <td className="py-2 text-right tabular-nums text-ink-400">
                  {y.events_overlapping}
                </td>
                <td className="py-2 text-ink-400">
                  <code className="text-[10px]">{y.top_signal}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Integrity issues */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          Integrity issues
        </h2>
        <ul className="mt-3 space-y-2">
          {data.integrity_issues.map((i, idx) => (
            <li
              key={idx}
              className={`rounded border p-3 text-sm ${severityColor(i.severity)}`}
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-ink-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                  {i.severity}
                </span>
                <span className="font-medium">{i.check}</span>
                <span className="ml-auto tabular-nums text-ink-300">{i.count}</span>
              </div>
              <p className="mt-1 text-xs text-ink-400">{i.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}
