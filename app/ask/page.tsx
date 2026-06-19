import Link from "next/link";
import type { Metadata } from "next";
import { PathPanel } from "@/components/graph/path-panel";
import { SemanticSearchPanel } from "@/components/graph/semantic-search-panel";
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

export default function AskPage({
  searchParams,
}: {
  searchParams: { q?: string; lang?: string };
}) {
  const locale = resolveLocale(searchParams.lang);
  const initialAsk = searchParams.q?.trim() ?? "";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={locale === "en" ? "/graph" : `/graph?lang=${locale}`} className="text-xs text-ink-400 hover:text-ink-200">
        {t(locale, "ask.back")}
      </Link>

      <header className="mt-4">
        <h1 className="h-display text-4xl font-semibold tracking-tight md:text-5xl">
          {t(locale, "ask.title")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-ink-300">
          {t(locale, "ask.description")}
        </p>
      </header>

      <section className="mt-4 flex flex-wrap gap-2 text-xs">
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
      </section>

      <section className="mt-8">
        <SemanticSearchPanel />
      </section>

      <section className="mt-8">
        <PathPanel initialAsk={initialAsk} />
      </section>
    </main>
  );
}
