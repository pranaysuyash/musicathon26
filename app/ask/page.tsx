import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Search, Compass } from "lucide-react";
import { SemanticSearchPanel } from "@/components/graph/semantic-search-panel";
import { PathPanel } from "@/components/graph/path-panel";
import { t, resolveLocale, localePairs } from "@/lib/i18n/strings";

function buildSearchParam(url: string, lang: string, q?: string) {
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
      images: [{ url: "/api/og?type=ask&title=Ask%20the%20VerseSignal%20Graph", width: 1200, height: 630 }],
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

  const promptChips = [
    "What did the world sing during COVID?",
    "Songs that felt like lockdown but did not mention COVID",
    "Compare 2019 and 2020",
    "Show protest songs around 2020",
    "What did India sound like during lockdown?",
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="relative isolate overflow-hidden rounded-[2.5rem] border border-ink-800 bg-[linear-gradient(145deg,rgba(9,11,18,0.98),rgba(7,8,14,0.92))] px-5 py-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_42px_120px_-60px_rgba(14,165,233,0.45)] sm:px-8 lg:px-10 lg:py-12">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-28 top-0 h-96 w-96 rounded-full bg-signal-500/14 blur-3xl" />
          <div className="absolute right-[-6rem] top-12 h-[28rem] w-[28rem] rounded-full bg-echo-500/12 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
        </div>

        <div className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 flex flex-wrap justify-center gap-2 text-xs">
              {localePairs.map(({ code, key }) => (
                <a
                  key={code}
                  href={buildSearchParam("/ask", code, initialAsk || undefined)}
                  className={`rounded-full border px-2.5 py-1 transition ${
                    locale === code
                      ? "border-signal-300 bg-signal-300/10 text-signal-200"
                      : "border-ink-700 text-ink-400 hover:border-signal-300/70 hover:text-signal-200"
                  }`}
                >
                  {t(locale, key)}
                </a>
              ))}
            </div>

            <h1 className="h-display text-4xl leading-[0.95] text-balance text-ink-50 md:text-5xl lg:text-6xl">
              Ask the corpus a question
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-pretty text-ink-300">
              Search by feeling, then resolve the route. Results are grouped by how they matched — direct lyric, semantic theme, entity, or temporal.
            </p>

            <form action="/ask" method="GET" className="mx-auto mt-8 max-w-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-ink-700 bg-ink-950/70 px-5 py-3.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                  <Search className="h-5 w-5 shrink-0 text-ink-500" />
                  <input
                    type="text"
                    name="q"
                    defaultValue={initialAsk}
                    placeholder='e.g. "lonely city nights"'
                    className="min-w-0 flex-1 bg-transparent text-base text-ink-100 placeholder:text-ink-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-signal-500 px-6 py-3.5 text-base font-semibold text-ink-950 transition hover:bg-signal-400"
                >
                  Search
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {promptChips.map((chip) => (
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
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <SemanticSearchPanel initialQuery={initialAsk} />

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-ink-800 bg-ink-900/55 p-5 lg:p-6">
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-signal-300" />
              <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Route finder</p>
            </div>
            <h2 className="h-display mt-2 text-2xl md:text-3xl">Connect two nodes</h2>
            <p className="mt-3 text-sm leading-6 text-ink-400">
              Ask the graph for the shortest evidence-backed path between a song, event, theme, or year.
            </p>
          </div>
          <PathPanel initialAsk={initialAsk} />
        </div>
      </section>
    </main>
  );
}
