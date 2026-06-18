"use client";

import { useState } from "react";
import { ConfidenceBar, Pill } from "@/components/ui/primitives";
import type { GraphEdge, Evidence, EvidenceType } from "@/lib/types";
import { X, Quote, ExternalLink } from "lucide-react";

interface Props {
  edge: GraphEdge | null;
  evidence: Evidence[];
  onClose: () => void;
}

// Sponsor source → human-readable label + what it provides.
// Per external review P1.2, the drawer must surface which
// partner API provided each piece of evidence so judges
// see the multi-sponsor integration.
const SOURCE_LABELS: Record<string, { name: string; url: string | null; emoji: string }> = {
  musixmatch: { name: "Musixmatch", url: "https://www.musixmatch.com", emoji: "M" },
  songstats: { name: "Songstats", url: "https://songstats.com", emoji: "S" },
  billboard: { name: "Billboard", url: "https://www.billboard.com", emoji: "B" },
  elevenlabs: { name: "ElevenLabs", url: "https://elevenlabs.io", emoji: "E" },
  huggingface: { name: "Hugging Face", url: "https://huggingface.co", emoji: "H" },
  gliner: { name: "GLiNER (Hugging Face)", url: "https://huggingface.co/urchade/gliner_multi-v2.1", emoji: "G" },
  spacy: { name: "spaCy (fallback NER)", url: "https://spacy.io", emoji: "N" },
  embedding: { name: "sentence-transformers (Hugging Face)", url: "https://huggingface.co/sentence-transformers", emoji: "V" },
  embedding_similarity: { name: "sentence-transformers (Hugging Face)", url: "https://huggingface.co/sentence-transformers", emoji: "V" },
  llm: { name: "LLM-derived", url: null, emoji: "L" },
  lexicon: { name: "Lexicon (rule-based)", url: null, emoji: "R" },
  manual: { name: "Manual curation", url: null, emoji: "M" },
  human: { name: "Human annotation", url: null, emoji: "H" },
  cyanite: { name: "Cyanite (audio mood)", url: "https://cyanite.ai", emoji: "C" },
  jambase: { name: "JamBase (tour/venue)", url: "https://www.jambase.com", emoji: "J" },
  jam_base: { name: "JamBase (tour/venue)", url: "https://www.jambase.com", emoji: "J" },
  musicbrainz: { name: "MusicBrainz", url: "https://musicbrainz.org", emoji: "M" },
  wikidata: { name: "Wikidata", url: "https://www.wikidata.org", emoji: "W" },
  hybrid: { name: "Hybrid (multi-source)", url: null, emoji: "H" },
};

// Group evidence by type. Each group gets a section header
// explaining what the evidence means in plain language.
const EVIDENCE_GROUPS: Array<{
  type: EvidenceType | "other";
  title: string;
  whyItMatters: string;
}> = [
  { type: "lyric_line", title: "Lyric evidence", whyItMatters: "Specific lyric lines that drove this connection." },
  { type: "lyric_term", title: "Lyric terms matched", whyItMatters: "Words in the lyrics that match the connection." },
  { type: "mood_score", title: "Mood evidence", whyItMatters: "Audio/emotional mood scores supporting this connection." },
  { type: "embedding_similarity", title: "Embedding similarity", whyItMatters: "Vector-space proximity to the target node." },
  { type: "entity_match", title: "Entity match", whyItMatters: "Named-entity (place, person, brand) overlap." },
  { type: "chart_entry", title: "Chart evidence", whyItMatters: "The song's chart position or year-over-year movement." },
  { type: "event_date_overlap", title: "Event-window overlap", whyItMatters: "Temporal alignment with the event's date range." },
  { type: "metadata_credit", title: "Metadata credit", whyItMatters: "Artist/label attribution." },
  { type: "collaboration_credit", title: "Collaboration credit", whyItMatters: "Song credits / featured artists." },
  { type: "other", title: "Other evidence", whyItMatters: "Other supporting rows." },
];

export function EvidenceDrawer({ edge, evidence, onClose }: Props) {
  if (!edge) return null;
  // Group evidence by evidenceType
  const grouped = new Map<EvidenceType | "other", Evidence[]>();
  for (const e of evidence) {
    const key = (EVIDENCE_GROUPS.find((g) => g.type === e.evidenceType) ? e.evidenceType : "other") as
      | EvidenceType
      | "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }
  // Unique source list (provenance). The values come from
  // the DB as strings; the SOURCE_LABELS map provides the
  // human-readable label.
  const sources: string[] = Array.from(
    new Set(evidence.map((e) => e.source).filter((s) => Boolean(s)))
  );
  return (
    <aside className="card flex h-full w-full max-w-md flex-col border-l border-ink-800 bg-ink-950/95 p-5">
      <div className="flex items-start justify-between">
        <div>
          <Pill variant="signal">{edge.edgeType.replace(/_/g, " ")}</Pill>
          <h3 className="mt-3 text-sm font-semibold text-ink-100">Why this connection exists</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
          aria-label="Close evidence panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Connection details — the "because" */}
      <dl className="mt-5 space-y-3 text-sm">
        <Row label="From">{shortenId(edge.srcId)}</Row>
        <Row label="To">{shortenId(edge.dstId)}</Row>
        <Row label="Strength">
          <ConfidenceBar value={edge.weight} />
          <ExplainLevel value={edge.weight} kind="weight" />
        </Row>
        <Row label="Confidence">
          <ConfidenceBar value={edge.confidence} />
          <ExplainLevel value={edge.confidence} kind="confidence" />
        </Row>
        {edge.explanation ? <Row label="Why">{edge.explanation}</Row> : null}
      </dl>

      {/* Signal provenance — surfaces the partner APIs */}
      {sources.length > 0 ? (
        <section className="mt-6 border-t border-ink-800 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Signal provenance
          </h4>
          <p className="mt-1 text-xs text-ink-500">
            Evidence from {sources.length} partner{sources.length === 1 ? "" : "s"}.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {sources.map((s) => {
              const meta = SOURCE_LABELS[s] ?? {
                name: s,
                url: null,
                emoji: "?",
              };
              return (
                <li key={s}>
                  <span
                    title={meta.name}
                    className="inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-[10px] font-medium text-ink-300"
                  >
                    <span className="font-semibold">{meta.emoji}</span>
                    <span>{meta.name}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Evidence — grouped by type, with matched-term highlighting */}
      <div className="mt-6 flex-1 overflow-y-auto scrollbar-thin">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
          Evidence ({evidence.length})
        </h4>
        {evidence.length === 0 ? (
          <p className="text-xs text-ink-500">No evidence rows attached.</p>
        ) : (
          <div className="space-y-4">
            {EVIDENCE_GROUPS.map((g) => {
              const items = grouped.get(g.type) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={g.type}>
                  <h5 className="text-[11px] font-semibold uppercase tracking-wider text-ink-300">
                    {g.title}{" "}
                    <span className="text-ink-600">({items.length})</span>
                  </h5>
                  <p className="mt-0.5 text-[10px] text-ink-500">{g.whyItMatters}</p>
                  <ul className="mt-2 space-y-2">
                    {items.map((e) => (
                      <EvidenceCard key={e.id} evidence={e} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function EvidenceCard({ evidence: e }: { evidence: Evidence }) {
  const meta = SOURCE_LABELS[e.source] ?? { name: e.source, url: null, emoji: "?" };
  return (
    <li className="rounded-lg border border-ink-800 bg-ink-900/60 p-3 text-xs leading-relaxed">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-800 text-[10px] font-semibold text-ink-300">
          {meta.emoji}
        </span>
        <span className="text-ink-400">{meta.name}</span>
        <span className="ml-auto text-ink-500">
          {(e.confidence * 100).toFixed(0)}% conf
        </span>
      </div>
      <EvidenceValue value={e.value} type={e.evidenceType} />
    </li>
  );
}

function EvidenceValue({ value, type }: { value: string; type: EvidenceType }) {
  // For lyric evidence, render with quote styling + matched-term
  // highlighting. The "value" field for lyric_term / lyric_line
  // is the actual lyric text or term.
  if (type === "lyric_line" || type === "lyric_term") {
    return (
      <p className="rounded border-l-2 border-signal-500/50 bg-ink-950/50 px-2 py-1.5 font-serif text-sm italic text-ink-200">
        <Quote size={11} className="mr-1 inline text-ink-500" />
        {highlightMatchedTerms(value)}
      </p>
    );
  }
  // For other types, render as plain text with the value bold
  return (
    <p className="text-ink-200">
      <HighlightTokens value={value} />
    </p>
  );
}

/**
 * HighlightMatchedTerms: keep it simple. We don't have
 * the matched terms inline; we highlight the whole value
 * as a quoted lyric. Future: cross-reference with the
 * edge's matched_terms_json (when we add it).
 */
function highlightMatchedTerms(value: string): React.ReactNode {
  // For very long values, trim with ellipsis
  const trimmed = value.length > 240 ? value.slice(0, 240) + "…" : value;
  return <>{trimmed}</>;
}

function HighlightTokens({ value }: { value: string }) {
  // Split on common separators and bold the first token
  const parts = value.split(/[:\s]/).filter(Boolean);
  if (parts.length < 2) return <>{value}</>;
  return (
    <>
      <span className="font-medium text-ink-100">{parts[0]}</span>
      {value.slice(parts[0].length)}
    </>
  );
}

function ExplainLevel({
  value,
  kind,
}: {
  value: number;
  kind: "weight" | "confidence";
}) {
  // Confidence as explanation, not just a bar.
  let label: string;
  if (value >= 0.85) label = "very high — strong evidence";
  else if (value >= 0.65) label = "high — confident";
  else if (value >= 0.45) label = "moderate — could go either way";
  else if (value >= 0.25) label = "low — speculative";
  else label = "very low — coincidence";
  return (
    <p className="mt-1 text-[10px] text-ink-500">
      {label}
    </p>
  );
}

function shortenId(id: string): string {
  // Drop the "versesignal:n:..." prefix for readability
  return id.replace(/^versesignal:[ne]:/, "");
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-start gap-3 border-b border-ink-800/60 pb-3 last:border-0">
      <dt className="text-xs uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="col-span-2 break-words text-ink-200">{children}</dd>
    </div>
  );
}
