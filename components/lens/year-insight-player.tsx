"use client";

import { useEffect, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";

interface InsightResponse {
  year: number;
  text: string;
  audioUrl: string | null;
  themes: { theme: string; avgScore: number }[];
  moods: { mood: string; avgScore: number }[];
  topEvent: { event_id: string; name: string; song_count: number } | null;
}

export function YearInsightPlayer({ year }: { year: number }) {
  const [insight, setInsight] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/insight?year=${year}`)
      .then((r) => r.json())
      .then((j: InsightResponse) => {
        if (!cancelled) setInsight(j);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(() => {
    if (!insight?.audioUrl) return;
    const a = new Audio(insight.audioUrl);
    a.addEventListener("ended", () => setPlaying(false));
    setAudio(a);
    return () => {
      a.pause();
      a.src = "";
    };
  }, [insight?.audioUrl]);

  function toggle() {
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  if (loading) {
    return (
      <div className="card flex items-center gap-3 p-5 text-sm text-ink-400">
        <Loader2 className="animate-spin" size={16} />
        Preparing insight…
      </div>
    );
  }
  if (error || !insight) {
    return (
      <div className="card p-5 text-sm text-ink-400">
        Could not load insight.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-5">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={toggle}
          disabled={!insight.audioUrl}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition ${
            insight.audioUrl
              ? "bg-signal-500 text-ink-950 hover:bg-signal-400"
              : "cursor-not-allowed bg-ink-800 text-ink-500"
          }`}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>
        <div className="flex-1">
          <p className="text-sm leading-relaxed text-ink-200 text-pretty">
            {insight.text}
          </p>
          {insight.topEvent ? (
            <p className="mt-2 text-xs text-ink-500">
              Strongest event link:{" "}
              <a
                href={`/event/${encodeURIComponent(insight.topEvent.event_id)}`}
                className="text-echo-300 hover:text-echo-200"
              >
                {insight.topEvent.name}
              </a>{" "}
              ({insight.topEvent.song_count} songs)
            </p>
          ) : null}
          {!insight.audioUrl ? (
            <p className="mt-1 text-xs text-warn-500">
              ElevenLabs not configured — set ELEVENLABS_API_KEY in .env to enable narration.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
