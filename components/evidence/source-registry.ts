export type SourcePartnerFlag = "partner" | "non_partner";

export interface EvidenceSourceMetadata {
  key: string;
  name: string;
  emoji: string;
  link?: string | null;
  partner: SourcePartnerFlag;
}

const SOURCE_METADATA: Record<string, EvidenceSourceMetadata> = {
  musixmatch: {
    key: "musixmatch",
    name: "Musixmatch",
    emoji: "M",
    link: "https://www.musixmatch.com",
    partner: "partner",
  },
  songstats: {
    key: "songstats",
    name: "Songstats",
    emoji: "S",
    link: "https://songstats.com",
    partner: "partner",
  },
  billboard: {
    key: "billboard",
    name: "Billboard",
    emoji: "B",
    link: "https://www.billboard.com",
    partner: "partner",
  },
  musicbrainz: {
    key: "musicbrainz",
    name: "MusicBrainz",
    emoji: "M",
    link: "https://musicbrainz.org",
    partner: "partner",
  },
  wikidata: {
    key: "wikidata",
    name: "Wikidata",
    emoji: "W",
    link: "https://www.wikidata.org",
    partner: "partner",
  },
  cyanite: {
    key: "cyanite",
    name: "Cyanite",
    emoji: "C",
    link: "https://www.cyanite.ai",
    partner: "partner",
  },
  jam_base: {
    key: "jam_base",
    name: "JamBase",
    emoji: "J",
    link: "https://www.jambase.com",
    partner: "partner",
  },
  jambase: {
    key: "jambase",
    name: "JamBase",
    emoji: "J",
    link: "https://www.jambase.com",
    partner: "partner",
  },
  elevenlabs: {
    key: "elevenlabs",
    name: "ElevenLabs",
    emoji: "E",
    link: "https://elevenlabs.io",
    partner: "partner",
  },
  embedding: {
    key: "embedding",
    name: "sentence-transformers",
    emoji: "V",
    link: "https://huggingface.co/sentence-transformers",
    partner: "non_partner",
  },
  embedding_similarity: {
    key: "embedding_similarity",
    name: "sentence-transformers",
    emoji: "V",
    link: "https://huggingface.co/sentence-transformers",
    partner: "non_partner",
  },
  llm: {
    key: "llm",
    name: "LLM-derived",
    emoji: "L",
    partner: "non_partner",
  },
  lexicon: {
    key: "lexicon",
    name: "Lexicon",
    emoji: "R",
    partner: "non_partner",
  },
  manual: {
    key: "manual",
    name: "Manual curation",
    emoji: "M",
    partner: "non_partner",
  },
  human: {
    key: "human",
    name: "Human annotation",
    emoji: "H",
    partner: "non_partner",
  },
  spacy: {
    key: "spacy",
    name: "spaCy",
    emoji: "N",
    link: "https://spacy.io",
    partner: "non_partner",
  },
  gliner: {
    key: "gliner",
    name: "GLiNER (Hugging Face)",
    emoji: "G",
    link: "https://huggingface.co/urchade/gliner_medium-v2.1",
    partner: "non_partner",
  },
  hybrid: {
    key: "hybrid",
    name: "Hybrid inference",
    emoji: "H",
    partner: "non_partner",
  },
  theme_scores: {
    key: "theme_scores",
    name: "Theme scoring",
    emoji: "T",
    partner: "non_partner",
  },
  mood_scores: {
    key: "mood_scores",
    name: "Mood scoring",
    emoji: "M",
    partner: "non_partner",
  },
  chart_entry: {
    key: "chart_entry",
    name: "Chart metadata",
    emoji: "D",
    partner: "non_partner",
  },
  lyric_term: {
    key: "lyric_term",
    name: "Lexicon term match",
    emoji: "L",
    partner: "non_partner",
  },
  lyric_line: {
    key: "lyric_line",
    name: "Lyric evidence",
    emoji: "L",
    partner: "non_partner",
  },
};

function normalizeSource(source: string): string {
  return source.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

export function getEvidenceSourceMeta(source: string): EvidenceSourceMetadata {
  const key = normalizeSource(source);
  return (
    SOURCE_METADATA[key] ?? {
      key,
      name: key || "Unknown source",
      emoji: "?",
      partner: "non_partner",
    }
  );
}

export function evidenceSources(sources: string[]): EvidenceSourceMetadata[] {
  const out: EvidenceSourceMetadata[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const meta = getEvidenceSourceMeta(source);
    if (seen.has(meta.key)) continue;
    seen.add(meta.key);
    out.push(meta);
  }
  return out;
}

