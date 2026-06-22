"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Search, Sparkles, BarChart3 } from "lucide-react";
import { EvidenceBadge } from "@/components/evidence/evidence-badge";
import type { UiEvidenceType } from "@/lib/evidence/types";
import { UI_EVIDENCE_LABELS } from "@/lib/evidence/types";

interface SemanticResult {
  songId: string;
  title: string;
  artist: string;
  year: number;
  region: string;
  similarity: number;
  matchType?: UiEvidenceType;
  matchedTerms?: string[];
}

interface SemanticSearchResponse {
  query: string;
  top: number;
  region: string;
  resultCount: number;
  results: SemanticResult[];
}

interface SemanticSearchPanelProps {
  initialQuery?: string;
  initialData?: SemanticSearchResponse | null;
}

const PRESET_QUERIES = [
  "lonely city nights",
  "rage after injustice",
  "party through collapse",
  "pandemic isolation",
  "love in a small town",
];

export function SemanticSearchPanel({ initialQuery = "", initialData = null }: SemanticSearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SemanticSearchResponse | null>(initialData);

  async function runSearch(q?: string) {
    const text = (q ?? query).trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: text, top: "8" });
      const r = await fetch(`/api/semantic-search?${params}`);
      if (r.status === 503) {
        setError("warming");
        setData({ query: text, top: 8, region: "US", resultCount: 0, results: [] });
        return;
      }
      if (!r.ok) throw new Error(`search failed: ${r.status}`);
      const j = (await r.json()) as SemanticSearchResponse;
      setData(j);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const text = initialQuery.trim();
    if (!text) return;
    setQuery(text);
    if (!initialData) {
      void runSearch(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const groupedResults: Record<UiEvidenceType, SemanticResult[]> = data
    ? data.results.reduce(
        (acc, r) => {
          const type = r.matchType ?? "semantic_theme";
          acc[type] ??= [];
          acc[type].push(r);
          return acc;
        },
        {
          direct_lyric: [],
          event_entity: [],
          semantic_theme: [],
          temporal_only: [],
          external_confirmation: [],
          weak_noisy: [],
          rejected: [],
        } as Record<UiEvidenceType, SemanticResult[]>
      )
    : {
        direct_lyric: [],
        event_entity: [],
        semantic_theme: [],
        temporal_only: [],
        external_confirmation: [],
        weak_noisy: [],
        rejected: [],
      };

  const queryConcepts = useMemo(() => {
    if (!data?.query) return [];
    return data.query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "and", "for", "with", "from", "into", "after", "through"].includes(w));
  }, [data?.query]);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-ink-800 bg-[linear-gradient(180deg,rgba(10,12,18,0.96),rgba(8,10,16,0.92))] p-5 lg:p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/50 to-transparent" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Search by feeling</p>
          <h2 className="h-display mt-2 text-2xl md:text-3xl">Turn a phrase into songs</h2>
          <p className="mt-2 text-sm leading-6 text-ink-400">Results group by how they matched: direct lyric, semantic theme, entity, or temporal window.</p>
        </div>
        <div className="rounded-full border border-ink-800 bg-ink-950/65 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-ink-500">
          nearest feeling matches
        </div>
      </div>

      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-ink-800 bg-ink-950/70 px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <Sparkles className="h-4 w-4 shrink-0 text-signal-300" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "lonely city nights"'
            className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-signal-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-signal-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search by feel"}
          {!loading ? <ArrowRight className="h-4 w-4" /> : null}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-[0.22em] text-ink-500">Try:</span>
        {PRESET_QUERIES.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              setQuery(preset);
              void runSearch(preset);
            }}
            className="rounded-full border border-ink-800 bg-ink-950/40 px-3 py-1 text-xs text-ink-300 transition hover:border-signal-400/40 hover:text-signal-200"
          >
            {preset}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-amber-700/40 bg-amber-900/10 px-4 py-3 text-sm text-amber-200">
          Feeling search is warming up. Try a prepared trail below while the backend loads.
        </div>
      )}

      {loading && !data && !error ? (
        <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-950/50 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-signal-400" />
            <p className="text-sm text-ink-300">Searching songs that match the feeling...</p>
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl border border-ink-800 bg-ink-900/40"
              />
            ))}
          </div>
        </div>
      ) : null}

      {data && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.26em] text-ink-500">
              {data.resultCount} matches for &ldquo;{data.query}&rdquo;
            </p>
            <span className="rounded-full border border-ink-800 bg-ink-950/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-ink-500">
              region {data.region}
            </span>
          </div>

              {data.results.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">No songs in the current region match this query.</p>
          ) : (
            <div className="mt-3 space-y-5">
              {Object.entries(groupedResults).map(([type, results]) => (
                <div key={type}>
                  <div className="mb-2 flex items-center gap-2">
                    <EvidenceBadge type={type as UiEvidenceType} />
                    <span className="text-xs text-ink-500">{results.length} result{results.length === 1 ? "" : "s"}</span>
                  </div>
                  <ol className="space-y-2">
                    {results.map((r, i) => {
                      const concepts = r.matchedTerms?.length ? r.matchedTerms : queryConcepts;
                      const isDirect = type === "direct_lyric";
                      const meta = UI_EVIDENCE_LABELS[type as UiEvidenceType];
                      return (
                        <li key={`${r.songId}-${i}`}>
                          <div className="flex flex-col gap-3 rounded-2xl border border-ink-800 bg-ink-950/45 px-4 py-3 transition hover:border-signal-400/40 hover:bg-ink-950/70 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="text-xs uppercase tracking-[0.22em] text-ink-500">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <div className="min-w-0">
                                <Link href={`/song/${encodeURIComponent(r.songId)}`} className="block truncate text-sm font-semibold text-ink-100 hover:text-signal-300">
                                  {r.title}
                                </Link>
                                <p className="truncate text-xs text-ink-400">
                                  {r.artist} · {r.year} · {r.region}
                                </p>
                                <p className="mt-1.5 text-xs leading-5 text-ink-300">
                                  {isDirect ? (
                                    <span className="text-emerald-300">Direct lyric match</span>
                                  ) : (
                                    <>
                                      Matched by {meta.short}
                                      {concepts.length ? (
                                        <>
                                          {" "}· nearest concepts:{" "}
                                          <span className="text-ink-200">{concepts.slice(0, 4).join(" · ")}</span>
                                        </>
                                      ) : null}
                                      {type === "semantic_theme" ? (
                                        <span className="ml-1.5 text-ink-500">(not a direct lyric match)</span>
                                      ) : null}
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/song/${encodeURIComponent(r.songId)}`}
                                className="inline-flex items-center gap-1 rounded-full border border-ink-800 bg-ink-950/60 px-2.5 py-1 text-[10px] font-medium text-ink-300 transition hover:border-signal-400/40 hover:text-signal-200"
                              >
                                Open song
                              </Link>
                              <Link
                                href={`/lens/${r.year}?region=${encodeURIComponent(r.region)}`}
                                className="inline-flex items-center gap-1 rounded-full border border-ink-800 bg-ink-950/60 px-2.5 py-1 text-[10px] font-medium text-ink-300 transition hover:border-echo-400/40 hover:text-echo-200"
                              >
                                <BarChart3 className="h-3 w-3" />
                                Year lens
                              </Link>
                              <Link
                                href={`/graph?rootType=song&rootId=${encodeURIComponent(r.songId)}&hops=2`}
                                className="inline-flex items-center gap-1 rounded-full border border-ink-800 bg-ink-950/60 px-2.5 py-1 text-[10px] font-medium text-ink-300 transition hover:border-echo-400/40 hover:text-echo-200"
                              >
                                Graph
                              </Link>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
