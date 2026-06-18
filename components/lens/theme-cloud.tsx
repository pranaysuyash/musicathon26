"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { THEME_COLORS, THEME_LABELS, THEME_DESCRIPTIONS } from "@/lib/nlp/theme-scoring";
import type { Theme } from "@/lib/types";

interface ThemeCloudItem {
  theme: string;
  avgScore: number;
  evidenceSongIds: string[];
}

export function ThemeCloud({ items }: { items: ThemeCloudItem[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.avgScore)), [items]);
  const sorted = useMemo(() => [...items].sort((a, b) => b.avgScore - a.avgScore), [items]);

  if (sorted.length === 0) {
    return (
      <div className="card flex h-40 items-center justify-center text-sm text-ink-500">
        No theme data yet — run <code className="mx-1 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs">npm run py:enrich</code> first.
      </div>
    );
  }

  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex flex-wrap gap-2">
        {sorted.map((item) => {
          const t = item.theme as Theme;
          const size = 0.85 + 1.4 * (item.avgScore / max);
          const color = THEME_COLORS[t] ?? "#7dd3fc";
          const isHover = hover === item.theme;
          return (
            <Link
              key={item.theme}
              href={`/theme/${item.theme}`}
              onMouseEnter={() => setHover(item.theme)}
              onMouseLeave={() => setHover(null)}
              className="rounded-full border px-3 py-1.5 text-sm font-medium transition no-underline"
              style={{
                fontSize: `${size}rem`,
                color: isHover ? "#fff" : color,
                borderColor: `${color}55`,
                background: isHover ? `${color}22` : `${color}0d`,
              }}
            >
              {THEME_LABELS[t] ?? item.theme}
              <span className="ml-1.5 text-[10px] tabular-nums opacity-60">
                {item.avgScore.toFixed(1)}
              </span>
            </Link>
          );
        })}
      </div>
      {hover ? (
        <div className="mt-4 rounded border border-ink-800 bg-ink-950/80 p-3 text-xs text-ink-300">
          <strong className="text-ink-100">{THEME_LABELS[hover as Theme] ?? hover}</strong>
          <span className="mx-2 text-ink-500">·</span>
          <span>{THEME_DESCRIPTIONS[hover as Theme] ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
}
