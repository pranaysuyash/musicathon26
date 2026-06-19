import Link from "next/link";
import type { Metadata } from "next";
import { initDb } from "@/lib/db";
import { getEventById, getEventArticles } from "@/lib/db/queries";
import { t, resolveLocale, localePairs } from "@/lib/i18n/strings";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { lang?: string };
}): Promise<Metadata> {
  initDb();
  const locale = resolveLocale(searchParams.lang);
  const event = getEventById(decodeRouteParam(params.id));
  if (!event) {
    return {
      title: t(locale, "articles.title"),
      description: t(locale, "articles.none"),
    };
  }
  return {
    title: `${event.name} ${t(locale, "articles.title").toLowerCase()}`,
    description: t(locale, "articles.empty"),
    openGraph: {
      images: [
        {
          url: `/api/og?type=event&title=${encodeURIComponent(`${event.name} • ${t(locale, "articles.title")}`)}&subtitle=${encodeURIComponent(`Event coverage for ${event.name}`)}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function EventArticlesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { lang?: string };
}) {
  initDb();
  const locale = resolveLocale(searchParams.lang);
  const event = getEventById(decodeRouteParam(params.id));

  if (!event) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-2xl font-semibold">{t(locale, "event.not-found")}</h2>
      </main>
    );
  }

  const articles = getEventArticles(event.id);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={`/event/${encodeURIComponent(event.id)}${searchParams.lang ? `?lang=${searchParams.lang}` : ""}`} className="text-xs text-ink-400 hover:text-ink-200">
        {t(locale, "articles.back")}
      </Link>

      <header className="mt-4 mb-10">
        <h1 className="h-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          {t(locale, "articles.title")}: {event.name}
        </h1>
      </header>

      <section className="card divide-y divide-ink-800/60">
        {articles.length === 0 ? (
          <p className="p-4 text-sm text-ink-400">{t(locale, "articles.empty")}</p>
        ) : (
          articles.map((article: { id: string; source: string; title: string; sourceUrl: string; publishedAt: string | null; summary: string | null }) => (
            <article key={article.id} className="p-4">
              <p className="text-xs uppercase tracking-wider text-ink-500">{article.source}</p>
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-sm font-medium text-ink-100 hover:text-signal-300"
              >
                {article.title}
              </a>
              {article.publishedAt ? (
                <p className="mt-1 text-xs text-ink-500">{article.publishedAt}</p>
              ) : null}
              {article.summary ? <p className="mt-2 text-sm text-ink-300">{article.summary}</p> : null}
            </article>
          ))
        )}
      </section>

      <section className="mt-8 text-xs text-ink-500">
        <div className="card p-4">
          {localePairs.map(({ code, key }) => {
            const href = code === "en"
              ? `/event/${encodeURIComponent(event.id)}/articles`
              : `/event/${encodeURIComponent(event.id)}/articles?lang=${code}`;
            return (
              <a
                key={code}
                href={href}
                className="mr-2 text-signal-300 hover:text-signal-200"
              >
                {t(locale, key)}
              </a>
            );
          })}
        </div>
      </section>
    </main>
  );
}
