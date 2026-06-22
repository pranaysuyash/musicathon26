import type { EvidenceType as DbEvidenceType, InferenceType } from "../types";
import {
  type UiEvidenceType,
  type UiConfidence,
  type NormalizedEvidence,
  GENERIC_NOISE_TERMS,
  COVID_STRONG_TERMS,
} from "./types";

const DIRECT_LYRIC_DB_TYPES: DbEvidenceType[] = ["lyric_term", "lyric_line", "matched_term"];
const ENTITY_DB_TYPES: DbEvidenceType[] = ["entity_match", "gazetteer_alias"];
const TEMPORAL_DB_TYPES: DbEvidenceType[] = [
  "event_date_overlap",
  "temporal_overlap",
  "chart_entry",
  "chart_era_context",
];
const EXTERNAL_DB_TYPES: DbEvidenceType[] = ["known_event_match", "manual_curation"];
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

function hasGenericNoiseTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_NOISE_TERMS.some((term) => lower.includes(term));
}

function hasCovidStrongTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return COVID_STRONG_TERMS.some((term) => lower.includes(term));
}

function isOnlyGenericNoise(text: string): boolean {
  return hasGenericNoiseTerm(text) && !hasCovidStrongTerm(text);
}

export function classifyDbEvidenceType(dbType: DbEvidenceType, value: string): UiEvidenceType {
  if (DIRECT_LYRIC_DB_TYPES.includes(dbType)) {
    if (isOnlyGenericNoise(value)) return "weak_noisy";
    return "direct_lyric";
  }
  if (ENTITY_DB_TYPES.includes(dbType)) {
    if (isOnlyGenericNoise(value)) return "weak_noisy";
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

export function normalizeEvidence(evidence: {
  id: string;
  edgeId: string;
  evidenceType: DbEvidenceType;
  value: string;
  source: string;
  confidence: number;
  matchedTerms?: string[];
}): NormalizedEvidence {
  return {
    id: evidence.id,
    edgeId: evidence.edgeId,
    dbType: evidence.evidenceType,
    uiType: classifyDbEvidenceType(evidence.evidenceType, evidence.value),
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
  evidence: NormalizedEvidence[]
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
  matchedTerms: string[]
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
    case "weak_noisy":
      if (matchedTerms.some((t) => GENERIC_NOISE_TERMS.includes(t.toLowerCase()))) {
        return `Generic terms like "${matchedTerms
          .filter((t) => GENERIC_NOISE_TERMS.includes(t.toLowerCase()))
          .slice(0, 2)
          .join(" and ")}" are not proof on their own.`;
      }
      return "Weak or noisy evidence; do not treat as proof.";
    case "rejected":
      return "Explicitly excluded from claims.";
    default:
      return "";
  }
}

export function classifyCovidConnection(
  text: string,
  evidenceTypes: UiEvidenceType[]
): { uiType: UiEvidenceType; caveat: string } {
  const lower = text.toLowerCase();
  const hasStrong = COVID_STRONG_TERMS.some((term) => lower.includes(term));
  const hasOnlyGeneric =
    GENERIC_NOISE_TERMS.some((term) => lower.includes(term)) && !hasStrong;

  if (hasOnlyGeneric) {
    return {
      uiType: "weak_noisy",
      caveat:
        "Generic words like 'street', 'home', or 'alone' are not COVID evidence without stronger event vocabulary.",
    };
  }

  if (hasStrong) {
    return {
      uiType: evidenceTypes.includes("direct_lyric") ? "direct_lyric" : "event_entity",
      caveat: "COVID-specific vocabulary present.",
    };
  }

  return {
    uiType: "temporal_only",
    caveat: "Song was popular during the COVID window; no direct COVID reference detected.",
  };
}
