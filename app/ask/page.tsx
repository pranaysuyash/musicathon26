import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Compass, Search, Sparkles } from "lucide-react";
import { PathPanel } from "@/components/graph/path-panel";
import { SemanticSearchPanel } from "@/components/graph/semantic-search-panel";
import { searchSongsByFeel, type SemanticSearchResponse } from "@/lib/search/semantic-search";
import { t, resolveLocale, localePairs, type Locale } from "@/lib/i18n/strings";

function buildSearchParam(url: string, lang: Locale, q?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (lang !== "en") params.set("lang", lang);
  const query = params.toString();
  return query ? `${url}?${query}` : url;
}

export async function generateMetadata({ searchParams }: { searchParams: { lang?: string } }): Promise<Metadata> {
  const locale = resolveLocale(searchParams.lang);
  return {
    title: t(locale, "ask.title"),
    description: t(locale, "ask.description"),
    openGraph: {
      images: [
        {
          url: "/api/og?type=ask&title=Ask%20the%20VerseSignal%20Graph&subtitle=Connect%20songs%2C%20events%2C%20moods%2C%20and%20themes%20with%20a%20single%20query",
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: { q?: string; lang?: string };
}) {
  const locale = resolveLocale(searchParams.lang);
  const initialAsk = searchParams.q?.trim() ?? "";

  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <section className="mb-4 flex flex-wrap gap-2 text-xs">
        {localePairs.map(({ code, key }) => (
          <a
            key={code}
            href={buildSearchParam("/ask", code, initialAsk)}
            className={`rounded-full border px-2.5 py-1 transition ${
              locale === code
                ? "border-signal-300 bg-signal-300/10 text-signal-200"
                : "border-ink-700 text-ink-400 hover:border-signal-300/70 hover:text-signal-200"
            }`}
          >
            {t(locale, key)}
          </a>
        ))}
        <Link
          href={locale === "en" ? "/" : `/?lang=${locale}`}
          className="ml-auto rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-ink-500 transition hover:border-signal-400/40 hover:text-ink-300"
        >
          {t(locale, "ask.back")}
        </Link>
      </section>

      <section className="relative isolate overflow-hidden rounded-[2.5rem] border border-ink-800 bg-[linear-gradient(145deg,rgba(9,11,18,0.98),rgba(7,8,14,0.92))] px-5 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_42px_120px_-60px_rgba(14,165,233,0.45)] sm:px-6 lg:px-8 lg:py-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-4 h-72 w-72 rounded-full bg-signal-500/12 blur-3xl" />
          <div className="absolute right-[-6rem] top-14 h-80 w-80 rounded-full bg-echo-500/12 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
        </div>

        <div className="relative grid gap-8 lg:grid-cols-[1.04fr_0.96fr] lg:items-start">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-ink-400">
              <Sparkles className="h-4 w-4 text-signal-300" />
              <span>{t(locale, "ask.title")}</span>
            </div>
            <h1 className="h-display mt-5 text-4xl leading-[0.95] text-balance text-ink-50 md:text-5xl lg:text-6xl">
              Search by feeling, then resolve the route that follows
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-300 md:text-base">
              {t(locale, "ask.description")} The surface is split into two moves: songs by feel on the left, graph
              routes on the right.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "lonely city nights",
                "pandemic isolation",
                "rage after injustice",
              ].map((chip) => (
                <Link
                  key={chip}
                  href={buildSearchParam("/ask", locale, chip)}
                  className="rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-signal-400/40 hover:text-signal-100"
                >
                  {chip}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              {
                icon: Search,
                title: "Search by feel",
                text: "Type a line, a mood, or a memory and let cosine similarity pull the nearest songs into view.",
              },
              {
                icon: Compass,
                title: "Resolve a route",
                text: "Use the path panel to connect two named nodes and inspect the evidence-backed bridge between them.",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="rounded-[1.5rem] border border-ink-800 bg-ink-950/60 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-ink-500">
                    <Icon className="h-4 w-4 text-signal-300" />
                    <span>{card.title}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink-300">{card.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        {initialAsk ? (
          <Suspense fallback={<SemanticSearchPanel initialQuery={initialAsk} />}>
            <SemanticSearchResults query={initialAsk} />
          </Suspense>
        ) : (
          <SemanticSearchPanel />
        )}

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-ink-800 bg-ink-900/55 p-5 lg:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Route finder</p>
                <h2 className="h-display mt-2 text-2xl md:text-3xl">Ask the graph for a path, not a vibe</h2>
              </div>
              <Link
                href={locale === "en" ? "/graph" : `/graph?lang=${locale}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
              >
                Open the graph
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-3 text-sm leading-6 text-ink-400">
              The path panel keeps the second move honest: it shows the shortest route between two nodes and
              exposes the evidence that makes each hop plausible.
            </p>
          </div>

          <PathPanel initialAsk={initialAsk} />
        </div>
      </section>
    </main>
  );
}

async function SemanticSearchResults({ query }: { query: string }) {
  const result = await searchSongsByFeel({ q: query, top: 8, region: "US" });
  const initialData = "error" in result ? null : result;
  return <SemanticSearchPanel initialQuery={query} initialData={initialData} />;
}
