import Link from "next/link";
import { getAllEvents, getSongsByYear } from "@/lib/db/queries";
import { initDb } from "@/lib/db";
import { ThemeCloud } from "@/components/lens/theme-cloud";
import { DEMO_YEARS } from "@/data/chart-seed";

export const dynamic = "force-dynamic";

export default function Home() {
  initDb();
  const events = getAllEvents();
  const yearCounts = DEMO_YEARS.map((y) => ({ year: y, count: getSongsByYear(y).length }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-16">
        <div className="flex items-center gap-3 text-xs text-ink-400">
          <span className="pill pill-signal">MUSICATHON 2026</span>
          <span>·</span>
          <span>Musicathon is live. Build week in progress.</span>
        </div>
        <h1 className="h-display mt-6 text-5xl font-semibold leading-[1.05] md:text-7xl">
          When the world was going
          <br />
          through something,{" "}
          <span className="gradient-text">what was it singing?</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-300 text-pretty">
          VerseSignal is a navigable knowledge graph of charting pop music from 2018 to today.
          Every song connects to lyrics, themes, named entities, moods, collaborators, and the
          world events that overlapped its chart window. Every edge carries evidence and a
          confidence score.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/year/2020"
            className="rounded-lg bg-signal-500 px-5 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-signal-400"
          >
            See 2020 as a graph →
          </Link>
          <Link
            href="/event/versesignal:ev:covid_19"
            className="rounded-lg border border-ink-700 bg-ink-800/60 px-5 py-2.5 text-sm font-medium text-ink-100 transition hover:border-ink-600 hover:bg-ink-800"
          >
            Explore COVID-19 lens
          </Link>
          <Link
            href="/graph"
            className="rounded-lg border border-ink-700 bg-ink-800/60 px-5 py-2.5 text-sm font-medium text-ink-100 transition hover:border-ink-600 hover:bg-ink-800"
          >
            Open Graph Explorer
          </Link>
        </div>
      </header>

      <section className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Songs indexed" value={yearCounts.reduce((a, b) => a + b.count, 0).toString()} />
        <Stat label="Years covered" value={yearCounts.length.toString()} />
        <Stat label="Curated events" value={events.length.toString()} />
      </section>

      <section className="mb-16">
        <h2 className="mb-4 text-2xl font-semibold">Pick a year to start</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {yearCounts.map((y) => (
            <Link
              key={y.year}
              href={`/year/${y.year}`}
              className="card card-hover group flex flex-col items-start p-5"
            >
              <div className="text-3xl font-semibold tracking-tight">{y.year}</div>
              <div className="mt-1 text-xs text-ink-400">{y.count} songs</div>
              <div className="mt-3 h-1 w-full overflow-hidden rounded bg-ink-800">
                <div
                  className="h-full bg-gradient-to-r from-signal-500 to-echo-500 opacity-70 group-hover:opacity-100"
                  style={{ width: "100%" }}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="mb-4 text-2xl font-semibold">Or pick a cultural moment</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {events.map((ev) => (
            <Link
              key={ev.id}
              href={`/event/${encodeURIComponent(ev.id)}`}
              className="card card-hover p-5"
            >
              <div className="flex items-center gap-2">
                <span className="pill pill-echo">{ev.category}</span>
                <span className="text-xs text-ink-400">{ev.startDate} → {ev.endDate ?? "present"}</span>
              </div>
              <h3 className="mt-3 text-lg font-medium text-ink-100">{ev.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-ink-400">{ev.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="mb-4 text-2xl font-semibold">How edges get made</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MethodologyCard
            title="Lexicon + embeddings (themes)"
            description="A 19-theme lexicon seeded from music-cultural research catches direct terms (war, prayer, money, dance). Sentence-transformers embeddings (all-MiniLM-L6-v2) score thematic alignment even when the surface word is missing — so 'I just wanna feel something tonight' can land near loneliness."
            icon="🌐"
          />
          <MethodologyCard
            title="GLiNER custom NER (entities)"
            description="Zero-shot NER across custom labels: artist, person, place, brand, religious figure, political figure, song title, vehicle, weapon, technology. We surface only mentions above 0.5 confidence; each becomes a graph node with a citation back to the lyric line."
            icon="🧭"
          />
          <MethodologyCard
            title="Temporal + lexical + semantic (events)"
            description="A song links to an event if the chart year falls in the event window, the lyrics contain event-keywords or related themes, and the song's embedding is semantically close to the event description. Strength is a composite; confidence is honest about uncertainty."
            icon="⏱"
          />
          <MethodologyCard
            title="Evidence-first (the trust layer)"
            description="Every edge carries a weight, a confidence, a model version, and a list of evidence rows. Click any connection to see the lyric line, the matched terms, the chart rank, and the API that produced the link."
            icon="🔍"
          />
        </div>
      </section>

      <footer className="mt-20 border-t border-ink-800 pt-8 text-xs text-ink-500">
        <p>
          Chart data: Billboard Year-End Hot 100 (2018–2023). Lyrics: Musixmatch Pro.
          Embeddings: sentence-transformers (all-MiniLM-L6-v2). NER: GLiNER / spaCy fallback.
          Chart context: Songstats API. Audio mood: Cyanite (coming).
        </p>
        <p className="mt-2">Built for Musicathon 2026 — partners: Musixmatch, Replit, ElevenLabs, n8n, Songstats, LALAL.AI, Cyanite, JamBase.</p>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}

function MethodologyCard({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <h3 className="font-medium text-ink-100">{title}</h3>
          <p className="mt-1 text-sm text-ink-400 text-pretty">{description}</p>
        </div>
      </div>
    </div>
  );
}
