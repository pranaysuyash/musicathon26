"""
Stoplist + minimum-length gate for GLiNER and spaCy entity mentions.

Per motto_v3 §0.11 (Customer-Facing Claims), the user-facing surface
must show only entities a human would recognize as named. Common
English words (pronouns, articles, exclamations, generic nouns) are
filtered before insertion into entity_mentions.

Per §0.8 (Data Layer Discipline), the stoplist lives in a JSON config
file the operator can extend without code changes. Add a word to
stopwords[] in `lib/nlp/stoplist.json` and re-run enrich.py to drop
existing mentions via the migration script.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

_REPO = Path(__file__).resolve().parents[2]
_STOPLIST_PATH = _REPO / "lib" / "nlp" / "stoplist.json"


def _load_stoplist() -> tuple[set[str], int]:
    """Return (set_of_stopwords, min_length_for_gliner_entity)."""
    with open(_STOPLIST_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    stopwords = {
        w.lower()
        for w in raw.get("stopwords", [])
        if w and not w.startswith("_") and not w.startswith("_comment")
    }
    min_len = int(raw.get("_minimum_length_for_gliner_entity", 3))
    return stopwords, min_len


STOPWORDS: set[str]
MIN_LENGTH_FOR_GLINER: int
STOPWORDS, MIN_LENGTH_FOR_GLINER = _load_stoplist()


def is_bogus_surface(surface: str, *, source: str | None = None) -> bool:
    """True if the entity surface form should be dropped before
    reaching the UI. Conservative: returns True only when there is
    strong evidence the surface is a common word, not a name."""
    if not surface:
        return True
    s = surface.strip()
    if not s:
        return True
    # Length gate — single/double-char tokens are almost never
    # standalone entities in pop-music lyric NER (would need a
    # canonical mapping to survive, which the gazetteer handles).
    if len(s) < MIN_LENGTH_FOR_GLINER and source != "gazetteer":
        return True
    # Exact-match stoplist
    if s.lower() in STOPWORDS:
        return True
    # All-numeric tokens (years, ordinals, ranks) — those flow through
    # song/year graph edges, not entity mentions.
    if all(ch.isdigit() for ch in s):
        return True
    return False


__all__ = [
    "STOPWORDS",
    "MIN_LENGTH_FOR_GLINER",
    "is_bogus_surface",
]
