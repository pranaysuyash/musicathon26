import Link from "next/link";
import { FileSearch } from "lucide-react";
import type { EraOverviewRow } from "@/lib/db/queries";

function buildLangPath(path: string, locale: string) {
  if (locale === "en") return path;
  return `${path}?lang=${locale}`;
}

const ERA_FEEL: Record<string, string> = {
  broadcast_counterculture: "Big-band longing meets youth revolt",
  album_rock_aor: "Arena guitars and post-Watergate doubt",
  mtv_blockbuster: "Neon spectacle and video identity",
  cd_superstar: "Polished confession in a boombox world",
  download_disruption: "Shuffle-era heartbreak and piracy panic",
  global_streaming_era: "Algorithm anxiety and pandemic rupture",
};

const ERA_DOOR: Record<string, string> = {
  broadcast_counterculture: "Broadcast-era heartbreak",
  album_rock_aor: "Guitar-age introspection",
  mtv_blockbuster: "MTV spectacle and identity",
  cd_superstar: "Polished pop confession",
  download_disruption: "Shuffle-era heartbreak",
  global_streaming_era: "Streaming anxiety",
};

export function CompactEraTimeline({
  eras,
  locale,
}: {
  eras: EraOverviewRow[];
  locale: string;
}) {
  const erasWithSongs = eras.filter((e) => e.songCount > 0);

  return (
    <section className="rounded-[2rem] border border-ink-800 bg-ink-900/55 p-5 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Timeline</p>
          <h2 className="h-display mt-2 text-2xl md:text-3xl">{erasWithSongs.length} cultural eras, compact shelf</h2>
        </div>
        <Link
          href={buildLangPath("/scrub", locale)}
          className="inline-flex items-center gap-2 text-sm font-medium text-signal-200 transition hover:text-signal-100"
        >
          Scrub timeline
          <FileSearch className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
        {erasWithSongs.map((era, index) => {
          const colors = [
            "from-signal-500/80 via-signal-300/80 to-transparent",
            "from-echo-500/80 via-echo-300/80 to-transparent",
            "from-amber-500/80 via-amber-300/80 to-transparent",
          ];
          const color = colors[index % colors.length];
          const feel = ERA_FEEL[era.eraId] ?? ERA_DOOR[era.eraId] ?? `${era.eraLabel} signal`;
          const door = ERA_DOOR[era.eraId] ?? era.eraLabel;
          return (
            <Link
              key={era.eraId}
              href={buildLangPath(`/lens/${era.eraStart}`, locale)}
              className="group relative flex w-52 shrink-0 flex-col overflow-hidden rounded-[1.4rem] border border-ink-800 bg-ink-950/60 p-4 transition hover:-translate-y-0.5 hover:border-signal-400/40"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${color}`} />
              <p className="text-xs uppercase tracking-[0.22em] text-ink-500">{era.eraStart}–{era.eraEnd}</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-ink-50">{door}</p>
              <p className="mt-1 text-xs italic leading-5 text-ink-300">“{feel}”</p>
              <div className="mt-3 space-y-1 text-xs">
                <p className="text-ink-500">{era.songCount} songs · {era.eventCount} contexts</p>
                <p className="text-ink-400">{era.topMood ?? "no top mood"}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
