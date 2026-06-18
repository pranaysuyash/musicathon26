"use client";

import { useState } from "react";
import Link from "next/link";

interface YearPoint {
  year: number;
  score: number;
  songCount: number;
}

export function SignalYearDistribution({
  signal,
  signalType,
  currentYear,
  years,
}: {
  signal: string;
  signalType: string;
  currentYear: number;
  years: YearPoint[];
}) {
  const [open, setOpen] = useState(false);
  if (years.length < 2) return null;

  const max = Math.max(1, ...years.map((y) => y.score));

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-ink-500 hover:text-ink-300 transition"
      >
        {open ? "hide trend ▲" : "show trend ▼"}
      </button>
      {open && (
        <div className="mt-2 flex items-end gap-1">
          {years.map((y) => {
            const h = (y.score / max) * 40;
            const isCurrent = y.year === currentYear;
            return (
              <Link
                key={y.year}
                href={`/lens/${y.year}`}
                className={`group flex flex-col items-center gap-0.5 transition ${
                  isCurrent ? "opacity-100" : "opacity-60 hover:opacity-100"
                }`}
                style={{ flex: "1 1 0" }}
              >
                <span className="text-[8px] text-ink-500 tabular-nums">
                  {y.songCount}
                </span>
                <span
                  className={`w-full rounded-sm ${
                    isCurrent ? "bg-signal-400" : "bg-ink-600 group-hover:bg-ink-500"
                  }`}
                  style={{ height: `${Math.max(4, h)}px` }}
                />
                <span className="text-[8px] text-ink-500 tabular-nums">
                  {y.year}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
