import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function FeaturedSignalStory({ locale }: { locale: string }) {
  return (
    <section className="rounded-[2rem] border border-ink-800 bg-[linear-gradient(160deg,rgba(11,12,18,0.96),rgba(8,10,16,0.9))] p-5 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Featured cultural story</p>
          <h2 className="h-display mt-2 text-2xl md:text-3xl">COVID-19 was not just a date match</h2>
        </div>
        <Link
          href={`/event/versesignal:ev:covid_19${locale !== "en" ? `?lang=${locale}` : ""}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
        >
          Inspect the trial
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Direct reference",
            text: "Lyrics name quarantine, lockdown, masks, or the virus.",
            color: "border-emerald-700/30 bg-emerald-900/10",
            textColor: "text-emerald-200",
          },
          {
            label: "Lockdown vocabulary",
            text: "Isolation, empty streets, staying home — event-specific but indirect.",
            color: "border-signal-700/30 bg-signal-900/10",
            textColor: "text-signal-200",
          },
          {
            label: "Thematic resonance",
            text: "Loneliness or anxiety without naming the pandemic.",
            color: "border-purple-700/30 bg-purple-900/10",
            textColor: "text-purple-200",
          },
          {
            label: "Temporal only",
            text: "Popular during 2020 but not tied to COVID by lyrics.",
            color: "border-amber-700/30 bg-amber-900/10",
            textColor: "text-amber-200",
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`rounded-[1.4rem] border p-4 ${card.color}`}
          >
            <p className={`text-[10px] uppercase tracking-[0.24em] ${card.textColor}`}>{card.label}</p>
            <p className="mt-2 text-sm leading-6 text-ink-300">{card.text}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-400">
        The event page separates these classes so you can see which songs actually name the pandemic, which only share the mood, and which were simply charting at the same time.
      </p>
    </section>
  );
}
