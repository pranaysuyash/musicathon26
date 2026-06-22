import Link from "next/link";
import { EvidenceBadge } from "@/components/evidence/evidence-badge";
import { UI_EVIDENCE_LABELS, type UiEvidenceType } from "@/lib/evidence/types";

interface EventVerdictPanelProps {
  eventName: string;
  counts: Record<UiEvidenceType | "all", number>;
  directSongs: { songId: string; title: string; artist: string }[];
  weakSongs: { songId: string; title: string; artist: string }[];
  isCovid?: boolean;
}

export function EventVerdictPanel({
  eventName,
  counts,
  directSongs,
  weakSongs,
  isCovid,
}: EventVerdictPanelProps) {
  const direct = counts.direct_lyric;
  const entity = counts.event_entity;
  const semantic = counts.semantic_theme;
  const temporal = counts.temporal_only;
  const external = counts.external_confirmation;
  const weak = counts.weak_noisy + counts.rejected;
  const total = counts.all;

  let verdict: { label: string; tone: "emerald" | "signal" | "purple" | "warn" | "red" };
  if (direct > 0 || external > 0) {
    verdict = { label: "Partially supported", tone: "signal" };
  } else if (semantic > 0 || entity > 0) {
    verdict = { label: "Thematic resonance", tone: "purple" };
  } else if (temporal > 0) {
    verdict = { label: "Temporal co-occurrence only", tone: "warn" };
  } else {
    verdict = { label: "Weak / unsupported", tone: "red" };
  }

  const toneClasses = {
    emerald: "border-emerald-500/30 bg-emerald-900/10 text-emerald-300",
    signal: "border-signal-500/30 bg-signal-900/10 text-signal-300",
    purple: "border-purple-500/30 bg-purple-900/10 text-purple-300",
    warn: "border-amber-500/30 bg-amber-900/10 text-amber-300",
    red: "border-red-500/30 bg-red-900/10 text-red-300",
  };

  return (
    <section className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-ink-500">Evidence trial</p>
          <h2 className="h-display mt-2 text-2xl md:text-3xl">
            Did chart music show {eventName}-specific signals?
          </h2>
        </div>
        <div className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider ${toneClasses[verdict.tone]}`}>
          Verdict: {verdict.label}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <VerdictStat
          value={direct}
          label="Direct lyric"
          sub={`${entity} entity matches`}
          tone="signal"
        />
        <VerdictStat
          value={semantic}
          label="Semantic / theme"
          sub={`${external} external`}
          tone="purple"
        />
        <VerdictStat
          value={temporal}
          label="Temporal only"
          sub="charted during event"
          tone="warn"
        />
        <VerdictStat
          value={weak}
          label="Weak / rejected"
          sub="not proof on its own"
          tone="red"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-700/20 bg-emerald-900/10 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">What survived scrutiny</p>
          {directSongs.length === 0 && external === 0 ? (
            <p className="mt-3 text-sm text-ink-400">No direct lyric or external evidence survived scrutiny.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {directSongs.slice(0, 3).map((s) => (
                <li key={s.songId}>
                  <Link href={`/song/${encodeURIComponent(s.songId)}`} className="text-sm text-ink-200 hover:text-signal-300">
                    {s.title} — {s.artist}
                  </Link>
                </li>
              ))}
              {directSongs.length > 3 && (
                <li className="text-xs text-ink-500">+{directSongs.length - 3} more direct matches</li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-red-700/20 bg-red-900/10 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-red-300">What we refuse to claim</p>
          {isCovid ? (
            <p className="mt-3 text-sm leading-6 text-ink-300">
              A song about “streets,” “home,” “night,” or “being alone” is not a pandemic song unless stronger vocabulary like “lockdown,” “quarantine,” or “pandemic” also appears.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-ink-300">
              Generic words like “street,” “city,” “home,” “night,” “fear,” “AI,” or “alone” are not evidence for {eventName} on their own.
            </p>
          )}
          {weakSongs.length > 0 && (
            <ul className="mt-3 space-y-1">
              {weakSongs.slice(0, 2).map((s) => (
                <li key={s.songId} className="text-xs text-ink-400">
                  {s.title} — marked <EvidenceBadge type="weak_noisy" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="?tab=direct_lyric"
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            direct > 0
              ? "border-signal-400/40 bg-signal-500/15 text-signal-100 hover:bg-signal-500/25"
              : "border-ink-800 bg-ink-950/60 text-ink-500"
          }`}
        >
          Show direct evidence first
        </Link>
        <Link
          href="?tab=weak_noisy"
          className="rounded-full border border-ink-800 bg-ink-950/60 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-red-400/40 hover:text-red-200"
        >
          Inspect weak matches
        </Link>
      </div>
    </section>
  );
}

function VerdictStat({
  value,
  label,
  sub,
  tone,
}: {
  value: number;
  label: string;
  sub: string;
  tone: "signal" | "purple" | "warn" | "red";
}) {
  const toneText = {
    signal: "text-signal-300",
    purple: "text-purple-300",
    warn: "text-amber-300",
    red: "text-red-300",
  };
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/40 p-4">
      <p className={`text-2xl font-semibold tabular-nums ${toneText[tone]}`}>{value}</p>
      <p className="mt-1 text-sm font-medium text-ink-200">{label}</p>
      <p className="text-xs text-ink-500">{sub}</p>
    </div>
  );
}
