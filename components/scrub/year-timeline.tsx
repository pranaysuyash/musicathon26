"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";

/**
 * Horizontal year-timeline with era bands + year pills.
 *
 * Per the audit, /scrub was the most list-y surface (a flat
 * `<select>` of 64 years). This replaces the dropdown with a
 * scrollable year-pill timeline:
 *  - Era bands as background tint per chart era (5 colors).
 *  - Each year is a vertical column: year number, song-count bar,
 *    top theme/mood.
 *  - Click a year → /lens/[year].
 *  - Auto-scroll to the current year on mount.
 *  - Horizontal scroll: trackpad/wheel + drag + arrow keys.
 *
 * Per motto 0.13 (scope discipline), this is intentionally NOT a
 * force-graph. The graph-first surface lives at /graph. /scrub is
 * a navigation surface; the timeline form makes it feel alive
 * without competing with the graph.
 */

export interface YearTimelineEntry {
  year: number;
  songCount: number;
  topTheme: string | null;
  topMood: string | null;
}

interface EraSpan {
  id: string;
  label: string;
  start: number;
  end: number;
  /** Tailwind classes for background tint + accent. */
  bgClass: string;
  accentClass: string;
}

const ERAS: EraSpan[] = [
  { id: "broadcast", label: "Broadcast", start: 1960, end: 1979, bgClass: "bg-amber-900/15", accentClass: "bg-amber-500" },
  { id: "mtv", label: "MTV", start: 1980, end: 1999, bgClass: "bg-purple-900/15", accentClass: "bg-purple-500" },
  { id: "digital", label: "Digital", start: 2000, end: 2011, bgClass: "bg-cyan-900/15", accentClass: "bg-cyan-500" },
  { id: "streaming", label: "Streaming", start: 2012, end: 2019, bgClass: "bg-signal-900/20", accentClass: "bg-signal-500" },
  { id: "global", label: "Global", start: 2020, end: 2023, bgClass: "bg-echo-900/20", accentClass: "bg-echo-500" },
];

function eraForYear(y: number): EraSpan | null {
  return ERAS.find((e) => y >= e.start && y <= e.end) ?? null;
}

export function YearTimeline({
  years,
  currentYear,
  region,
}: {
  years: YearTimelineEntry[];
  currentYear: number;
  region: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the timeline so the current year is centered.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-year="${currentYear}"]`);
    if (!target) return;
    // Center horizontally
    const left = target.offsetLeft - el.clientWidth / 2 + target.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [currentYear]);

  // For arrow-key navigation
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const next = (delta: number) => {
      const i = years.findIndex((y) => y.year === currentYear);
      if (i < 0) return;
      const target = years[Math.max(0, Math.min(years.length - 1, i + delta))];
      if (target) {
        e.preventDefault();
        window.location.href = `/lens/${target.year}?region=${region}`;
      }
    };
    if (e.key === "ArrowRight") next(1);
    else if (e.key === "ArrowLeft") next(-1);
  };

  const maxCount = useMemo(() => Math.max(1, ...years.map((y) => y.songCount)), [years]);

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2 text-xs text-ink-400">
        <span>
          <span className="font-semibold text-ink-200">{years.length} years</span>
          {" · "}
          horizontal scroll, click to jump
        </span>
        <span className="text-[10px] uppercase tracking-[0.22em] text-ink-500">
          ← drag · arrow keys · click →
        </span>
      </div>

      {/* Era-band legend */}
      <div className="mb-2 flex gap-1 text-[10px] uppercase tracking-[0.22em]">
        {ERAS.map((e) => {
          const yearCount = years.filter((y) => y.year >= e.start && y.year <= e.end).length;
          return (
            <div
              key={e.id}
              className={`flex flex-1 items-center justify-between rounded px-2 py-1 ${e.bgClass}`}
              style={{ flexBasis: `${((e.end - e.start + 1) / 64) * 100}%` }}
            >
              <span className="text-ink-300">{e.label}</span>
              <span className="text-ink-500">{e.start}–{e.end} · {yearCount}y</span>
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline */}
      <div
        ref={containerRef}
        role="listbox"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`Year timeline, current year ${currentYear}`}
        className="relative flex h-44 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden scroll-smooth rounded-xl border border-ink-800 bg-ink-950/80 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-500 scrollbar-thin"
      >
        {/* Era band backgrounds */}
        <div className="pointer-events-none absolute inset-0 flex">
          {ERAS.map((e) => (
            <div
              key={e.id}
              className={`${e.bgClass} opacity-50`}
              style={{
                marginLeft: `${((e.start - years[0]!.year) / years.length) * 100}%`,
                width: `${((e.end - e.start + 1) / years.length) * 100}%`,
              }}
            />
          ))}
        </div>

        {years.map((y) => {
          const era = eraForYear(y.year);
          const isCurrent = y.year === currentYear;
          // Bar height: 0 songs → 16px, max → 100px
          const height = 16 + (y.songCount / maxCount) * 84;
          return (
            <Link
              key={y.year}
              href={`/lens/${y.year}?region=${region}`}
              data-year={y.year}
              role="option"
              aria-selected={isCurrent}
              aria-label={`${y.year}, ${y.songCount} songs, top theme ${y.topTheme ?? "unknown"}, top mood ${y.topMood ?? "unknown"}`}
              className={`group relative z-10 flex w-14 shrink-0 flex-col items-center justify-end gap-1 rounded-md px-1 py-2 transition-all ${
                isCurrent
                  ? "scale-105 bg-ink-900/90 ring-2 ring-signal-400 shadow-[0_0_18px_rgba(56,189,248,0.35)]"
                  : "hover:bg-ink-900/60 hover:scale-[1.03]"
              }`}
            >
              {/* Top: year label */}
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  isCurrent ? "text-signal-200" : "text-ink-200 group-hover:text-ink-100"
                }`}
              >
                {y.year}
              </span>
              {/* Middle: song count bar */}
              <span
                className={`block w-7 rounded-sm transition-all ${
                  isCurrent
                    ? `${era?.accentClass ?? "bg-signal-500"} shadow-[0_0_8px_rgba(56,189,248,0.4)]`
                    : `${era?.accentClass ?? "bg-ink-500"} opacity-60 group-hover:opacity-100`
                }`}
                style={{ height: `${height}px` }}
                aria-hidden="true"
              />
              {/* Bottom: song count + signal */}
              <div className="mt-1 text-center">
                <span
                  className={`block text-[10px] tabular-nums ${
                    isCurrent ? "text-signal-300" : "text-ink-400"
                  }`}
                >
                  {y.songCount}
                </span>
                {y.topMood ? (
                  <span
                    className={`block max-w-[3.5rem] truncate text-[9px] ${
                      isCurrent ? "text-echo-300" : "text-ink-500"
                    }`}
                    title={y.topMood}
                  >
                    {y.topMood}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Era label */}
      {eraForYear(currentYear) ? (
        <p className="mt-3 text-xs text-ink-400">
          You're in <span className="font-semibold text-ink-200">{eraForYear(currentYear)!.label}</span> era. Click any year to jump.
        </p>
      ) : null}
    </div>
  );
}
