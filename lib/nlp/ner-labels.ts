// GLiNER custom entity labels for music-cultural lyrics.
//
// These are the zero-shot labels the GLiNER medium-v2.1 model is
// prompted with. They cover the entity types a song lyric can
// plausibly name, plus a small number of music-cultural
// extensions (artist, song_title, album_title) that vanilla NER
// misses.
//
// Per motto_v3 §0.8 (data layer rule), this is configuration
// data — it is reviewed, versioned, and validated like code.
// Per §0.9 (routing rule), changing the labels changes the
// effective schema; we record the label-set version alongside
// each row's model_version.
//
// To add a new label: append it, bump `LABELS_VERSION`, and
// re-run the enrichment. The old entity_mentions rows keep
// their old `model_version` so the change is auditable.

export const NER_LABELS = [
  // People
  "person",
  "artist",
  "musician",
  "band",
  "religious figure",
  "political figure",
  "athlete",

  // Places
  "place",
  "city",
  "country",
  "neighborhood",
  "venue",
  "landmark",

  // Time / events
  "event",
  "holiday",
  "historical period",

  // Culture / media
  "song title",
  "album title",
  "movie title",
  "tv show title",
  "book title",
  "brand",
  "luxury brand",
  "technology",
  "social platform",

  // Substances / objects
  "drug or substance",
  "alcoholic drink",
  "weapon",
  "vehicle",
  "money object",
  "clothing brand",
  "food",

  // Abstract / cultural
  "mythological figure",
  "religious text",
] as const;

export type NerLabel = (typeof NER_LABELS)[number];

// Confidence threshold per label. Some labels are easier to get
// right (e.g., "city") than others (e.g., "mythological figure").
// Per 0.9 (routing rule), this is part of the model configuration
// and versioned alongside it.
export const LABEL_THRESHOLDS: Record<NerLabel, number> = {
  person: 0.55,
  artist: 0.55,
  musician: 0.55,
  band: 0.55,
  "religious figure": 0.6,
  "political figure": 0.6,
  athlete: 0.6,
  place: 0.5,
  city: 0.5,
  country: 0.55,
  neighborhood: 0.55,
  venue: 0.55,
  landmark: 0.55,
  event: 0.55,
  holiday: 0.55,
  "historical period": 0.6,
  "song title": 0.55,
  "album title": 0.55,
  "movie title": 0.55,
  "tv show title": 0.55,
  "book title": 0.55,
  brand: 0.55,
  "luxury brand": 0.6,
  technology: 0.55,
  "social platform": 0.55,
  "drug or substance": 0.6,
  "alcoholic drink": 0.6,
  weapon: 0.65,
  vehicle: 0.55,
  "money object": 0.6,
  "clothing brand": 0.6,
  food: 0.55,
  "mythological figure": 0.65,
  "religious text": 0.6,
};

export const DEFAULT_NER_THRESHOLD = 0.55;

export const LABELS_VERSION = "2026-06-16.1";
