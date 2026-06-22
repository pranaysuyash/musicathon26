import type { EvidenceType as DbEvidenceType, InferenceType } from "../types";
import {
  type UiEvidenceType,
  type UiConfidence,
  type NormalizedEvidence,
  GENERIC_NOISE_TERMS,
  COVID_STRONG_TERMS,
  getEventStrongTerms,
  getEventWeakTerms,
} from "./types";

const DIRECT_LYRIC_DB_TYPES: DbEvidenceType[] = ["lyric_term", "lyric_line", "matched_term"];
const ENTITY_DB_TYPES: DbEvidenceType[] = ["entity_match", "gazetteer_alias"];
const TEMPORAL_DB_TYPES: DbEvidenceType[] = [
  "event_date_overlap",
  "temporal_overlap",
  "chart_entry",
  "chart_era_context",
];
const EXTERNAL_DB_TYPES: DbEvidenceType[] = ["known_event_match"];
const SEMANTIC_DB_TYPES: DbEvidenceType[] = [
  "mood_score",
  "embedding_similarity",
  "signal_delta",
  "chart_delta",
  "song_cluster_membership",
  "candidate_moment_match",
];

const DIRECT_INFERENCE_TYPES: InferenceType[] = ["direct_lyric_reference", "entity_match"];
const SEMANTIC_INFERENCE_TYPES: InferenceType[] = [
  "theme_overlap",
  "emotional_alignment",
  "emotional_shadow",
  "embedding_similarity",
];
const TEMPORAL_INFERENCE_TYPES: InferenceType[] = ["temporal_alignment"];
const CURATED_INFERENCE_TYPES: InferenceType[] = ["curated_event_alignment", "manual_curation"];

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function phraseIncluded(text: string, phrase: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  // For multi-word phrases, check as a substring with word boundaries via spaces.
  if (phrase.includes(" ")) {
    const p = ` ${phrase} `;
    return ` ${normalized} `.includes(p);
  }
  return tokenSet(normalized).has(phrase.toLowerCase());
}

function hasGenericNoiseTerm(text: string): boolean {
  return GENERIC_NOISE_TERMS.some((term) => phraseIncluded(text, term));
}

function hasCovidStrongTerm(text: string): boolean {
  return COVID_STRONG_TERMS.some((term) => phraseIncluded(text, term));
}

function isOnlyGenericNoise(text: string): boolean {
  return hasGenericNoiseTerm(text) && !hasCovidStrongTerm(text);
}

export function hasEventStrongTerm(eventId: string, text: string): boolean {
  return getEventStrongTerms(eventId).some((term) => phraseIncluded(text, term));
}

export function hasEventWeakTerm(eventId: string, text: string): boolean {
  return getEventWeakTerms(eventId).some((term) => phraseIncluded(text, term));
}

export function isOnlyEventWeakTerm(eventId: string, text: string): boolean {
  return hasEventWeakTerm(eventId, text) && !hasEventStrongTerm(eventId, text);
}

export function classifyDbEvidenceType(dbType: DbEvidenceType, value: string, eventId?: string): UiEvidenceType {
  if (DIRECT_LYRIC_DB_TYPES.includes(dbType)) {
    if (eventId ? isOnlyEventWeakTerm(eventId, value) : isOnlyGenericNoise(value)) return "weak_noisy";
    return "direct_lyric";
  }
  if (ENTITY_DB_TYPES.includes(dbType)) {
    if (eventId ? isOnlyEventWeakTerm(eventId, value) : isOnlyGenericNoise(value)) return "weak_noisy";
    return "event_entity";
  }
  if (EXTERNAL_DB_TYPES.includes(dbType)) return "external_confirmation";
  if (TEMPORAL_DB_TYPES.includes(dbType)) return "temporal_only";
  if (SEMANTIC_DB_TYPES.includes(dbType)) return "semantic_theme";
  return "weak_noisy";
}

export function classifyInferenceType(inferenceType: InferenceType | null | undefined): UiEvidenceType {
  if (!inferenceType) return "weak_noisy";
  if (DIRECT_INFERENCE_TYPES.includes(inferenceType)) return "direct_lyric";
  if (SEMANTIC_INFERENCE_TYPES.includes(inferenceType)) return "semantic_theme";
  if (TEMPORAL_INFERENCE_TYPES.includes(inferenceType)) return "temporal_only";
  if (CURATED_INFERENCE_TYPES.includes(inferenceType)) return "external_confirmation";
  return "weak_noisy";
}

export function normalizeEvidence(
  evidence: {
    id: string;
    edgeId: string;
    evidenceType: DbEvidenceType;
    value: string;
    source: string;
    confidence: number;
    matchedTerms?: string[];
  },
  eventId?: string
): NormalizedEvidence {
  return {
    id: evidence.id,
    edgeId: evidence.edgeId,
    dbType: evidence.evidenceType,
    uiType: classifyDbEvidenceType(evidence.evidenceType, evidence.value, eventId),
    value: evidence.value,
    source: evidence.source,
    confidence: evidence.confidence,
    matchedTerms: evidence.matchedTerms,
  };
}

export function deriveUiEvidenceType(
  edge: {
    inferenceType?: InferenceType | null;
    edgeType?: string;
    matchedTerms?: string[];
  },
  evidence: NormalizedEvidence[],
  eventId?: string
): UiEvidenceType {
  // Curated/manual edges are external confirmation.
  if (edge.inferenceType && CURATED_INFERENCE_TYPES.includes(edge.inferenceType)) {
    return "external_confirmation";
  }

  // If any evidence is direct lyric, treat the whole connection as direct.
  if (evidence.some((e) => e.uiType === "direct_lyric")) return "direct_lyric";

  // If any evidence is event entity, treat as entity.
  if (evidence.some((e) => e.uiType === "event_entity")) return "event_entity";

  // External confirmation next.
  if (evidence.some((e) => e.uiType === "external_confirmation")) return "external_confirmation";

  // Semantic inference or evidence.
  if (
    edge.inferenceType && SEMANTIC_INFERENCE_TYPES.includes(edge.inferenceType)
  ) {
    return "semantic_theme";
  }
  if (evidence.some((e) => e.uiType === "semantic_theme")) return "semantic_theme";

  // Temporal inference or evidence.
  if (edge.inferenceType && TEMPORAL_INFERENCE_TYPES.includes(edge.inferenceType)) {
    return "temporal_only";
  }
  if (evidence.some((e) => e.uiType === "temporal_only")) return "temporal_only";

  // If only weak/noisy evidence exists, it's weak.
  if (evidence.length > 0 && evidence.every((e) => e.uiType === "weak_noisy")) {
    return "weak_noisy";
  }

  return "weak_noisy";
}

export function deriveUiConfidence(
  uiEvidenceType: UiEvidenceType,
  edgeConfidence: number,
  evidence: NormalizedEvidence[]
): UiConfidence {
  if (uiEvidenceType === "rejected") return "rejected";

  const avgEvidenceConfidence =
    evidence.length > 0
      ? evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length
      : edgeConfidence;

  const effectiveConfidence = Math.max(edgeConfidence, avgEvidenceConfidence);

  if (uiEvidenceType === "direct_lyric" && effectiveConfidence >= 0.85) return "confirmed";
  if (uiEvidenceType === "external_confirmation" && effectiveConfidence >= 0.85) return "confirmed";

  if (effectiveConfidence >= 0.7) return "strong";
  if (effectiveConfidence >= 0.55) return "likely";

  if (uiEvidenceType === "semantic_theme") return "thematic";
  if (uiEvidenceType === "temporal_only") return "temporal";

  return "weak";
}

export function buildCaveat(
  uiEvidenceType: UiEvidenceType,
  uiConfidence: UiConfidence,
  matchedTerms: string[],
  eventId?: string
): string {
  switch (uiEvidenceType) {
    case "direct_lyric":
      return "The lyric names the event or event-specific vocabulary.";
    case "event_entity":
      return `Event-specific entity matched: ${matchedTerms.slice(0, 3).join(", ") || "see evidence trail"}.`;
    case "semantic_theme":
      return "This is a mood/theme resonance match, not confirmed artist intent.";
    case "temporal_only":
      return "The song was popular during the event window, but the lyrics do not directly reference the event.";
    case "external_confirmation":
      return "A curated or external source supports this connection.";
    case "weak_noisy": {
      const weakTerms = matchedTerms.filter((t) =>
        (eventId ? getEventWeakTerms(eventId) : GENERIC_NOISE_TERMS).includes(t.toLowerCase())
      );
      if (weakTerms.length) {
        return `Generic terms like "${weakTerms.slice(0, 2).join(" and ")}" are not proof on their own.`;
      }
      return "Weak or noisy evidence; do not treat as proof.";
    }
    case "rejected":
      return "Explicitly excluded from claims.";
    default:
      return "";
  }
}

export function classifyEventConnection(
  eventId: string,
  text: string,
  evidenceTypes: UiEvidenceType[]
): { uiType: UiEvidenceType; caveat: string } {
  const strong = hasEventStrongTerm(eventId, text);
  const weak = hasEventWeakTerm(eventId, text);

  if (weak && !strong) {
    return {
      uiType: "weak_noisy",
      caveat: "Generic or common terms are not event proof without stronger event vocabulary.",
    };
  }

  if (strong) {
    return {
      uiType: evidenceTypes.includes("direct_lyric") ? "direct_lyric" : "event_entity",
      caveat: "Event-specific vocabulary present.",
    };
  }

  return {
    uiType: "temporal_only",
    caveat: "Song was popular during the event window; no direct event reference detected.",
  };
}

/** @deprecated Use classifyEventConnection with the event id. */
export function classifyCovidConnection(
  text: string,
  evidenceTypes: UiEvidenceType[]
): { uiType: UiEvidenceType; caveat: string } {
  return classifyEventConnection("versesignal:ev:covid_19", text, evidenceTypes);
}