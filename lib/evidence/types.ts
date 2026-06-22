// Canonical evidence taxonomy for the UI.
// This is the translation layer between backend evidence rows and
// user-facing evidence language. Every song-event connection shown in
// the app must be classified through here.

import type { EvidenceType as DbEvidenceType, InferenceType } from "../types";

/** User-facing evidence category. */
export type UiEvidenceType =
  | "direct_lyric"
  | "event_entity"
  | "semantic_theme"
  | "temporal_only"
  | "external_confirmation"
  | "weak_noisy"
  | "rejected";

/** User-facing confidence tier. */
export type UiConfidence =
  | "confirmed"
  | "strong"
  | "likely"
  | "thematic"
  | "temporal"
  | "weak"
  | "rejected";

/** A single piece of evidence, normalized for UI use. */
export interface NormalizedEvidence {
  id: string;
  edgeId: string;
  dbType: DbEvidenceType;
  uiType: UiEvidenceType;
  value: string;
  source: string;
  confidence: number; // 0..1
  matchedTerms?: string[];
  lyricLine?: string;
  lyricLineIndex?: number;
}

/** A song-event connection as the UI should consume it. */
export interface SongEventConnection {
  songId: string;
  songTitle: string;
  songArtist: string;
  songYear: number;
  eventId: string;
  eventName: string;
  edgeId: string;
  edgeWeight: number;
  edgeConfidence: number;
  inferenceType?: InferenceType | null;
  uiEvidenceType: UiEvidenceType;
  uiConfidence: UiConfidence;
  explanation: string;
  caveat?: string;
  evidence: NormalizedEvidence[];
  matchedTerms: string[];
}

export const UI_EVIDENCE_LABELS: Record<UiEvidenceType, { label: string; short: string; color: string; description: string }> = {
  direct_lyric: {
    label: "Direct lyric mention",
    short: "direct",
    color: "signal",
    description: "The lyric names the event or event-specific vocabulary.",
  },
  event_entity: {
    label: "Event-specific entity",
    short: "entity",
    color: "echo",
    description: "A named entity strongly tied to the event appears in the lyric.",
  },
  semantic_theme: {
    label: "Semantic / theme match",
    short: "theme",
    color: "purple",
    description: "Mood or theme aligns with the event, without naming it.",
  },
  temporal_only: {
    label: "Temporal co-occurrence",
    short: "temporal",
    color: "warn",
    description: "The song charted during the event window; no lyrical link.",
  },
  external_confirmation: {
    label: "External confirmation",
    short: "external",
    color: "emerald",
    description: "Curated or third-party source supports the connection.",
  },
  weak_noisy: {
    label: "Weak / noisy match",
    short: "weak",
    color: "ink",
    description: "Generic or common terms match; not reliable proof on its own.",
  },
  rejected: {
    label: "Rejected",
    short: "rejected",
    color: "red",
    description: "Explicitly excluded from claims.",
  },
};

export const UI_CONFIDENCE_LABELS: Record<UiConfidence, { label: string; color: string; threshold: number }> = {
  confirmed: { label: "Confirmed", color: "emerald", threshold: 0.85 },
  strong: { label: "Strong", color: "signal", threshold: 0.7 },
  likely: { label: "Likely", color: "echo", threshold: 0.55 },
  thematic: { label: "Thematic", color: "purple", threshold: 0 },
  temporal: { label: "Temporal", color: "warn", threshold: 0 },
  weak: { label: "Weak", color: "ink", threshold: 0 },
  rejected: { label: "Rejected", color: "red", threshold: 0 },
};

/** Generic terms that should never be treated as event proof on their own. */
export const GENERIC_NOISE_TERMS = [
  "street",
  "city",
  "home",
  "night",
  "fear",
  "alone",
  "lonely",
  "distance",
  "far",
  "close",
  "world",
  "life",
  "time",
  "day",
  "light",
  "dark",
  "ai",
  "technology",
  "phone",
  "machine",
];

/** COVID-specific vocabulary that can support a direct/entity/semantic claim. */
export const COVID_STRONG_TERMS = [
  "covid",
  "coronavirus",
  "pandemic",
  "lockdown",
  "quarantine",
  "mask",
  "masks",
  "vaccine",
  "vaccines",
  "virus",
  "social distance",
  "social distancing",
  "isolation",
  "stay home",
  "hospital",
  "frontline",
  "empty streets",
  "travel ban",
  "second wave",
];
