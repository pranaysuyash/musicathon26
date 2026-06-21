"use client";

// Semantic search panel.
//
// The Ask surface is song-led: users type a feeling, lyric, or
// half-remembered phrase and get a real cosine-ranked answer from
// the stored song embeddings. The query itself is embedded
// server-side via /api/semantic-search so the comparison stays
// apples-to-apples with ingest.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, Sparkles } from "lucide-react";

interface SemanticResult {
  songId: string;
  title: string;
  artist: string;
  year: number;
  region: string;
  similarity: number;
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
        setError("Semantic search needs the Python embedder; ask the operator to enable it.");
        setData(null);
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
    // We intentionally only react to the initial query prop so a
    // navigation from the home page can boot the first result set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-ink-800 bg-[linear-gradient(180deg,rgba(10,12,18,0.96),rgba(8,10,16,0.92))] p-5 lg:p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/50 to-transparent" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Search by feeling</p>
          <h2 className="h-display mt-2 text-2xl md:text-3xl">
            Turn a phrase into songs, years, and cultural echoes
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-400">
            The query is embedded with the same sentence-transformer model used at ingest, so the ranking is
            real similarity instead of keyword coincidence.
          </p>
        </div>
        <div className="rounded-full border border-ink-800 bg-ink-950/65 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-ink-500">
          cosine-ranked
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
        <p className="mt-4 rounded-2xl border border-amber-700/40 bg-amber-900/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </p>
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
          <ol className="mt-3 space-y-2">
            {data.results.map((r, i) => (
              <li key={`${r.songId}-${i}`}>
                <Link
                  href={`/song/${encodeURIComponent(r.songId)}`}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-ink-800 bg-ink-950/45 px-4 py-3 transition hover:border-signal-400/40 hover:bg-ink-950/70"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-xs uppercase tracking-[0.22em] text-ink-500">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-100">
                        {r.title}
                      </p>
                      <p className="truncate text-xs text-ink-400">
                        {r.artist} · {r.year} · {r.region}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-signal-200">
                      {r.similarity.toFixed(3)}
                    </span>
                    <span className="rounded-full bg-signal-500/15 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.22em] text-signal-200">
                      cosine
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
          {data.results.length === 0 && (
            <p className="mt-3 text-sm text-ink-400">
              No songs in the current region match this query.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
