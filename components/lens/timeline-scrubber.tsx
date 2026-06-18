"use client";

import Link from "next/link";

interface YearInfo {
  year: number;
  songCount: number;
}

export function TimelineScrubber({
  years,
  currentYear,
}: {
  years: YearInfo[];
  currentYear: number;
}) {
  const min = years[0]?.year ?? currentYear;
  const max = years[years.length - 1]?.year ?? currentYear;
  const maxSongs = Math.max(1, ...years.map((y) => y.songCount));

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={currentYear > min ? `/lens/${currentYear - 1}` : "#"}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${
            currentYear > min
              ? "border-ink-700 text-ink-300 hover:border-signal-500 hover:text-signal-300"
              : "border-ink-800/50 text-ink-700 pointer-events-none"
          }`}
          aria-label="Previous year"
        >
          ←
        </Link>

        <div className="flex flex-1 items-end justify-center gap-1">
          {years.map((y) => {
            const isCurrent = y.year === currentYear;
            const height = 8 + (y.songCount / maxSongs) * 32;
            return (
              <Link
                key={y.year}
                href={`/lens/${y.year}`}
                className={`group relative flex flex-col items-center gap-1 transition-all ${
                  isCurrent ? "z-10" : "opacity-60 hover:opacity-100"
                }`}
                style={{ minWidth: "28px" }}
              >
                <span
                  className={`block w-6 rounded-sm transition-all ${
                    isCurrent
                      ? "bg-signal-400 shadow-[0_0_8px_rgba(29,185,110,0.3)]"
                      : "bg-ink-600 group-hover:bg-ink-500"
                  }`}
                  style={{ height: `${height}px` }}
                />
                <span
                  className={`text-[10px] font-medium tabular-nums ${
                    isCurrent ? "text-signal-300" : "text-ink-500"
                  }`}
                >
                  {y.year}
                </span>
              </Link>
            );
          })}
        </div>

        <Link
          href={currentYear < max ? `/lens/${currentYear + 1}` : "#"}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${
            currentYear < max
              ? "border-ink-700 text-ink-300 hover:border-signal-500 hover:text-signal-300"
              : "border-ink-800/50 text-ink-700 pointer-events-none"
          }`}
          aria-label="Next year"
        >
          →
        </Link>
      </div>
    </div>
  );
}
