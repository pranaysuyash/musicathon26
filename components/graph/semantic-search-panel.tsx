"use client";

// Semantic search panel.
//
// Per Decision 0030, the Ask surface is song-led. This panel lets
// the user type a lyric, phrase, or theme and get a real cosine-
// ranked answer from the stored song embeddings. The query itself
// is embedded server-side via /api/semantic-search (which delegates
// to the same sentence-transformers model used at ingest), so the
// comparison is apples-to-apples.
//
// Each result links to the song page so the user can drill into
// the evidence trail that backs the similarity score. The panel is
// intentionally simple — a textbox, a button, and a list of
// ranked matches — so it sits next to the PathPanel without
// competing for attention.

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

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
}

const PRESET_QUERIES = [
  "I can't sleep until I feel your touch",
  "city lights at night, alone, missing someone",
  "lean, double cup, Percocet",
  "love in a small town, hopeful",
  "blinding lights, running out of time",
];

export function SemanticSearchPanel({ initialQuery = "" }: SemanticSearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SemanticSearchResponse | null>(null);

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

  return (
    <section className="rounded-[2rem] border border-ink-800 bg-ink-900/55 p-5 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Semantic search</p>
          <h2 className="h-display mt-2 text-2xl md:text-3xl">
            Find songs by feel, not by keyword
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-400">
            Type a lyric, phrase, or theme. The query is embedded with the same
            sentence-transformers model used at ingest and ranked by cosine
            similarity against every indexed song.
          </p>
        </div>
      </div>

      <form
        className="mt-5 flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <div className="flex min-w-[20rem] flex-1 items-center gap-2 rounded-full border border-ink-800 bg-ink-950/60 px-4 py-2.5">
          <Search className="h-4 w-4 text-ink-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. I can't sleep until I feel your touch"
            className="flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search by feel"}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
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
        <p className="mt-4 rounded-xl border border-amber-700/40 bg-amber-900/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">
            {data.resultCount} matches for &ldquo;{data.query}&rdquo;
          </p>
          <ol className="mt-3 space-y-2">
            {data.results.map((r, i) => (
              <li key={`${r.songId}-${i}`}>
                <Link
                  href={`/song/${encodeURIComponent(r.songId)}`}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-ink-800 bg-ink-950/40 px-4 py-3 transition hover:border-signal-400/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-xs uppercase tracking-[0.22em] text-ink-500">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-100">
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
