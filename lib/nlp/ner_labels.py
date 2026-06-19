"""
GLiNER custom entity labels for music-cultural lyrics.

This is the canonical Python source. The TypeScript mirror lives
at `lib/nlp/ner-labels.ts` and is kept in sync manually (label
changes are rare; cross-language sync is cheap to verify by
diff).

Per motto_v3 §0.8 (data layer rule), this is configuration data —
it is reviewed, versioned, and validated like code. Per §0.9
(routing rule), changing the labels changes the effective
schema; we record the label-set version alongside each row's
model_version in `entity_mentions.model_version`.

To add a label: append to NER_LABELS, set a threshold in
LABEL_THRESHOLDS, bump LABELS_VERSION, and re-run the
enrichment. Old entity_mentions rows keep their old
model_version so the change is auditable.
"""

from __future__ import annotations

NER_LABELS: list[str] = [
    # People
    "person",
    "artist",
    "musician",
    "band",
    "religious figure",
    "political figure",
    "athlete",
    # Places
    "place",
    "city",
    "country",
    "neighborhood",
    "venue",
    "landmark",
    # Time / events
    "event",
    "holiday",
    "historical period",
    # Culture / media
    "song title",
    "album title",
    "movie title",
    "tv show title",
    "book title",
    "brand",
    "fashion brand",
    "luxury brand",
    "tech company",
    "social media platform",
    "streaming platform",
    "car brand",
    "sports brand",
    "fragrance or cosmetics brand",
    # Substances / objects
    "drug",
    "narcotic",
    "alcoholic drink",
    "weapon",
    "vehicle",
    "luxury vehicle",
    "money object",
    "clothing brand",
    "food",
    "body part",
    "color",
    # Abstract / cultural
    "mythological figure",
    "religious text",
    "emotion",
    "color descriptor",
    "profanity or slur",
]

# Confidence threshold per label. Some labels are easier to get
# right (e.g., "city") than others (e.g., "mythological figure").
# Per §0.9 this is part of the model configuration and versioned
# alongside it.
LABEL_THRESHOLDS: dict[str, float] = {
    "person": 0.55,
    "artist": 0.55,
    "musician": 0.55,
    "band": 0.55,
    "religious figure": 0.6,
    "political figure": 0.6,
    "athlete": 0.6,
    "place": 0.5,
    "city": 0.5,
    "country": 0.55,
    "neighborhood": 0.55,
    "venue": 0.55,
    "landmark": 0.55,
    "event": 0.55,
    "holiday": 0.55,
    "historical period": 0.6,
    "song title": 0.55,
    "album title": 0.55,
    "movie title": 0.55,
    "tv show title": 0.55,
    "book title": 0.55,
    "brand": 0.55,
    "fashion brand": 0.6,
    "luxury brand": 0.6,
    "tech company": 0.55,
    "social media platform": 0.55,
    "streaming platform": 0.55,
    "car brand": 0.55,
    "sports brand": 0.55,
    "fragrance or cosmetics brand": 0.6,
    "drug": 0.6,
    "narcotic": 0.65,
    "alcoholic drink": 0.6,
    "weapon": 0.65,
    "vehicle": 0.55,
    "luxury vehicle": 0.6,
    "money object": 0.6,
    "clothing brand": 0.6,
    "food": 0.55,
    "body part": 0.5,
    "color": 0.45,
    "mythological figure": 0.65,
    "religious text": 0.6,
    "emotion": 0.5,
    "color descriptor": 0.5,
    "profanity or slur": 0.6,
}

DEFAULT_NER_THRESHOLD: float = 0.55

LABELS_VERSION: str = "2026-06-18.1"


def get_threshold(label: str) -> float:
    """Return the confidence threshold for a given label."""
    return LABEL_THRESHOLDS.get(label, DEFAULT_NER_THRESHOLD)
