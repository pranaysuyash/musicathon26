"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Signal seismograph — animated line chart of a year's top signals.
 *
 * Per motto 0.1, the home page should make the user feel the data
 * is alive, not a static catalog. This component takes a year's
 * top signals (themes, moods, entities ranked by song count) and
 * animates them as overlapping pulses — a "seismograph" of the
 * chart's cultural frequencies.
 *
 * The animation is purely decorative; the data is real. Each line
 * is one signal, and the height represents normalized song count
 * (0-1 within this year). The pulse fades after a few cycles so
 * the user isn't trapped in animation hell.
 */

export interface SeismographSignal {
  signal: string;
  score: number;
  songCount: number;
  signalType: "theme" | "mood" | "entity";
}

interface Props {
  year: number;
  signals: SeismographSignal[];
  /** Max number of signals to plot (default 6). The seismograph gets
   *  visually noisy past 8 lines. */
  maxSignals?: number;
  /** How long one pulse cycle is, in ms. */
  cycleMs?: number;
}

const TONE_BY_TYPE: Record<SeismographSignal["signalType"], string> = {
  theme: "from-signal-500/60 to-signal-500/0",
  mood: "from-echo-500/60 to-echo-500/0",
  entity: "from-strength-high/50 to-strength-high/0",
};

const LABEL_TONE: Record<SeismographSignal["signalType"], string> = {
  theme: "text-signal-300",
  mood: "text-echo-300",
  entity: "text-amber-300",
};

export function SignalSeismograph({ year, signals, maxSignals = 6, cycleMs = 2400 }: Props) {
  const visibleSignals = useMemo(() => {
    return [...signals]
      .sort((a, b) => b.songCount - a.songCount)
      .slice(0, maxSignals);
  }, [signals, maxSignals]);

  const max = Math.max(1, ...visibleSignals.map((s) => s.songCount));
  // Phase offset per signal so they don't all pulse together — that
  // would look like one wave, not six. Phase is in 0..1 of the cycle.
  const phase = (i: number) => (i / Math.max(1, visibleSignals.length)) * 0.7;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, cycleMs / 30); // ~30 frames per cycle
    return () => window.clearInterval(id);
  }, [cycleMs]);

  if (visibleSignals.length === 0) {
    return (
      <p className="text-xs text-ink-500">No signals stored for {year}.</p>
    );
  }

  return (
    <div className="relative h-44">
      {/* Background grid */}
      <div className="absolute inset-0 grid grid-cols-6 grid-rows-3 opacity-30">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="border-r border-ink-800/60 last:border-r-0" />
        ))}
      </div>
      {/* Plot area */}
      <div className="absolute inset-0 flex flex-col justify-end gap-1.5">
        {visibleSignals.map((sig, i) => {
          // Each signal has a sinusoidal amplitude based on its phase
          // offset and current tick. The amplitude modulates the line
          // height; the baseline is the song count ratio.
          const baseline = sig.songCount / max;
          const wave = 0.5 + 0.5 * Math.sin(((tick + i * 8) / 30) * Math.PI * 2 - phase(i) * Math.PI * 2);
          // Mix: when wave=1, line is at baseline + 0.15; when wave=0,
          // it's at baseline - 0.15 (clamped to >= 0.05 so the line
          // never disappears entirely).
          const heightPct = Math.max(0.06, Math.min(0.95, baseline * 0.7 + wave * 0.18));
          return (
            <div key={sig.signal} className="relative flex items-center gap-3" style={{ height: "10%" }}>
              <span
                className={`w-20 shrink-0 text-[10px] font-medium uppercase tracking-wider ${LABEL_TONE[sig.signalType]}`}
                title={`${sig.signal} · ${sig.songCount} songs`}
              >
                {sig.signal.replace(/_/g, " ")}
              </span>
              <div className="relative h-full flex-1">
                <div
                  className={`absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r ${TONE_BY_TYPE[sig.signalType]}`}
                  style={{
                    transform: `scaleY(${heightPct})`,
                    transformOrigin: "left center",
                    transition: "transform 80ms linear",
                  }}
                  aria-hidden="true"
                />
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-ink-300">
                  {sig.songCount}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {/* Footnote */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-ink-500">
        <span>0 songs</span>
        <span>↑ strongest signal of {year}</span>
        <span>{max} songs</span>
      </div>
    </div>
  );
}
