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

/** Event-specific strong vocabularies. Add more events here as they are curated. */
export const EVENT_STRONG_TERMS: Record<string, string[]> = {
  "versesignal:ev:covid_19": COVID_STRONG_TERMS,
  "versesignal:ev:ukraine_war": [
    "ukraine",
    "kyiv",
    "kiev",
    "russia",
    "putin",
    "war",
    "invasion",
    "refugee",
    "refugees",
    "soldier",
    "soldiers",
    "tank",
    "tanks",
    "bomb",
    "bombs",
    "missile",
    "missiles",
    "sanctions",
    "nato",
  ],
  "versesignal:ev:blm_2020": [
    "black lives",
    "blm",
    "george floyd",
    "breonna taylor",
    "protest",
    "protests",
    "protesting",
    "riot",
    "riots",
    "police",
    "cop",
    "cops",
    "racism",
    "racist",
    "justice",
    "equality",
    "march",
    "marching",
  ],
};

/** Terms considered generic noise for specific events (override defaults if needed). */
export const EVENT_WEAK_TERMS: Record<string, string[]> = {
  "versesignal:ev:covid_19": GENERIC_NOISE_TERMS,
};

export function getEventStrongTerms(eventId: string): string[] {
  return EVENT_STRONG_TERMS[eventId] ?? [];
}

export function getEventWeakTerms(eventId: string): string[] {
  return EVENT_WEAK_TERMS[eventId] ?? GENERIC_NOISE_TERMS;
}
