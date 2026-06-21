"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

interface EraOption {
  id: string;
  start: number;
  end: number;
  label: string;
}

/**
 * Compare-eras widget on the home page.
 *
 * Per the audit, /compare/[from]/[to] is the best page in the app
 * but nobody knows it exists. This widget surfaces two era pickers
 * and a single CTA — the user picks any two eras and goes straight
 * to the comparison. The data is server-rendered (eras come from
 * props); only the picker state is client-side.
 */
export function CompareErasWidget({ eras }: { eras: EraOption[] }) {
  const fallback = eras[0]?.id ?? "1969";
  const [fromId, setFromId] = useState<string>(
    eras.find((e) => e.id === "1969")?.id ?? fallback
  );
  const [toId, setToId] = useState<string>(
    eras.find((e) => e.id === "2020")?.id ??
      eras[eras.length - 1]?.id ??
      fallback
  );
  const [fromYear, toYear] = useMemo(() => {
    const from = eras.find((e) => e.id === fromId)?.start;
    const to = eras.find((e) => e.id === toId)?.start;
    return [from, to];
  }, [eras, fromId, toId]);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[1.5rem] border border-ink-800 bg-ink-950/60 p-4">
      <div className="flex flex-col">
        <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">
          From era
        </label>
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className="mt-1 min-w-[180px] rounded border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ink-100 focus:border-signal-500 focus:outline-none"
        >
          {eras.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      <span className="self-end pb-2 text-ink-500">→</span>
      <div className="flex flex-col">
        <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">
          To era
        </label>
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="mt-1 min-w-[180px] rounded border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ink-100 focus:border-signal-500 focus:outline-none"
        >
          {eras.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      {fromYear && toYear ? (
        <Link
          href={`/compare/${fromYear}/${toYear}`}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-signal-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-signal-400"
        >
          Compare {fromYear} ↔ {toYear}
          <span className="text-xs">→</span>
        </Link>
      ) : null}
    </div>
  );
}
