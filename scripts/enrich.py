#!/usr/bin/env python3
"""
VerseSignal enrichment pipeline.

Layers (in order):
  1. Load songs + lyrics from SQLite.
  2. Embeddings (sentence-transformers primary; falls back to bag-of-words
     cosine if the model can't load).
  3. Custom NER (GLiNER if available, else spaCy en_core_web_sm).
  4. Theme scoring (lexicon + cosine to theme seed embeddings).
  5. Mood scoring (lexicon-derived proxy until Cyanite is wired).
  6. Event linking (temporal window + keyword + embedding overlap).
  7. Graph nodes/edges/evidence inserts.

Run:
  python3 scripts/enrich.py                  # everything
  python3 scripts/enrich.py --skip-embeddings  # fast re-run after model swap
  python3 scripts/enrich.py --song-id versesignal:2020:01:blinding-lights-the-weeknd
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO = Path(__file__).resolve().parents[1]
DB = REPO / "data" / "versesignal.db"
THEME_LEXICON = REPO / "lib" / "nlp" / "theme-lexicon.json"

# Allow `python scripts/enrich.py` to resolve `lib.nlp.*` siblings
# (Python's normal sys.path doesn't include the repo root when a script
# is invoked by absolute path under `uv run`). Per motto_v3 §0.8, the
# data-layer module path must be robust to the runner.
import sys as _sys
if str(REPO) not in _sys.path:
    _sys.path.insert(0, str(REPO))
del _sys

# Theme seed sentences used for embedding-based theme scoring.
THEME_SEEDS: dict[str, list[str]] = {
    "love": [
        "I love you more than words can say",
        "you are the love of my life",
        "falling in love, kissing, holding hands",
    ],
    "heartbreak": [
        "you broke my heart and left me",
        "we broke up, I'm crying alone",
        "I can't stop missing you",
    ],
    "war_conflict": [
        "soldiers on the frontline, weapons of war",
        "a soldier fights in battle, blood and fire",
        "civil war, invasion, freedom, refugees flee",
    ],
    "protest": [
        "we march in protest, no justice no peace",
        "rise up, fight the power, resistance",
        "we the people demand change",
    ],
    "money_status": [
        "I'm balling, racks on racks, money everywhere",
        "rich flex, expensive cars, designer brands",
        "grind, hustle, CEO, getting paid",
    ],
    "faith": [
        "I pray to God, Jesus, heaven, hallelujah",
        "the Lord's prayer, blessed, the holy spirit",
        "faith, soul, salvation, divine grace",
    ],
    "home": [
        "I miss my home, my family, my mother",
        "back to the streets where I grew up, the neighborhood",
        "homeland, hometown, my house, my room",
    ],
    "loneliness": [
        "I'm alone, lonely, sitting in my room",
        "numb, isolated, no one is there, invisible",
        "loneliness, silence, by myself, empty",
    ],
    "escape_party": [
        "let's party at the club all night",
        "drinks, dance floor, turn up, lit",
        "escapism, get away, lose control, weekend",
    ],
    "violence": [
        "gunshots, bullets, blood on the floor",
        "stabbing, choking, scars and wounds",
        "I will kill you, fighting, beating, burning",
    ],
    "migration": [
        "I'm leaving, fleeing, refugee at the border",
        "migration, journey, traveling, displacement",
        "asylum, passport, exile, homeland",
    ],
    "technology": [
        "on my phone, scrolling TikTok, streaming playlist",
        "DM, viral meme, algorithm, wifi signal",
        "AI, chatbot, facetime, online",
    ],
    "fame": [
        "I'm famous, paparazzi, red carpet, fans",
        "billboard number one, grammy, magazine cover",
        "celebrity, iconic, legend, stardom",
    ],
    "identity": [
        "who I am, my identity, be yourself",
        "Black, queer, woman, immigrant, outsider",
        "pronouns, gender, fitting in, belong",
    ],
    "grief": [
        "I miss you, gone too soon, rest in peace",
        "mourning, funeral, memories of you",
        "loss, tears, last goodbye, remember you",
    ],
    "hope": [
        "there's hope, we will be okay, keep holding on",
        "brighter days, sunrise, we rise, healing",
        "tomorrow is a new day, don't give up",
    ],
    "national_pride": [
        "America, USA, stars and stripes, the anthem",
        "patriot, freedom, liberty, my country",
        "UK, India, homeland, my nation",
    ],
    "social_unrest": [
        "riots in the streets, uprising, unrest",
        "tear gas, protest, occupy, revolution",
        "demonstration, march, clash, tension",
    ],
    "nostalgia": [
        "I remember when, back in the day, the way we were",
        "old days, used to, childhood, throwback",
        "reminisce, nostalgia, the past, those days",
    ],
}

# Per-event-category temporal windows for song-event linking.
# Format: (lead_in_months, echo_months). Different cultural events
# have different temporal "reach" in music: elections are tight,
# pandemics echo for years, social movements have long resonance.
EVENT_TEMPORAL_WINDOWS: dict[str, tuple[int, int]] = {
    "war":              (3, 18),
    "pandemic":         (3, 24),
    "social":           (6, 36),
    "economic":         (6, 18),
    "political":        (3, 6),
    "sports":           (3, 3),
    "tech":             (6, 12),
    "natural_disaster": (3, 6),
    "cultural":         (6, 12),
}


# Mood proxy lexicon (until Cyanite is integrated).
MOOD_LEXICON: dict[str, list[str]] = {
    "melancholic": ["alone", "lonely", "crying", "tears", "sad", "empty", "miss you", "numb", "lost", "broken", "goodbye", "fade", "somber"],
    "energetic": ["dance", "jump", "run", "turn up", "lit", "energy", "fire", "hype", "go", "party", "tonight", "wild"],
    "tense": ["run", "hide", "afraid", "scared", "danger", "fight", "war", "gun", "chase", "panic", "anxiety", "fear"],
    "hopeful": ["hope", "tomorrow", "new day", "sunrise", "brighter", "we will", "keep going", "hold on", "rise", "healing", "stronger", "survive"],
    "angry": ["hate", "rage", "fuck", "angry", "mad", "burn", "kill", "war", "fight", "punch", "sick of it"],
    "dreamy": ["dream", "float", "sky", "cloud", "fantasy", "wonder", "ethereal", "moon", "stars", "shine"],
    "celebratory": ["celebrate", "party", "cheers", "toast", "tonight", "we made it", "victory", "won", "champion"],
    "romantic": ["kiss", "love", "touch", "hold me", "darling", "heart", "forever", "yours", "intimate", "romance"],
    "anxious": ["anxiety", "worried", "panic", "overwhelmed", "stress", "can't breathe", "spiral", "on edge"],
    "somber": ["grave", "funeral", "mourning", "silence", "dark", "shadow", "cold", "still", "hush"],
}


@dataclass
class Pipeline:
    conn: sqlite3.Connection
    embedder: object | None
    gliner: "NerBackend | None"
    spacy_nlp: object | None
    embed_dim: int
    theme_centroids: dict[str, list[float]] | None
    model_version: str


def open_db() -> sqlite3.Connection:
    if not DB.exists():
        print(f"✗ DB not found at {DB}. Run: npm run db:init && npm run db:seed-chart", file=sys.stderr)
        sys.exit(1)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_graph_edge_columns(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(graph_edges)").fetchall()}
    if "inference_type" not in cols:
        conn.execute("ALTER TABLE graph_edges ADD COLUMN inference_type TEXT")
    if "matched_terms_json" not in cols:
        conn.execute("ALTER TABLE graph_edges ADD COLUMN matched_terms_json TEXT")
    conn.commit()


def load_songs(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            """
            SELECT s.id, s.title, s.artist, s.year, s.chart_rank,
                   GROUP_CONCAT(ll.text, '\n') AS lyrics
              FROM songs s
              LEFT JOIN lyric_lines ll ON ll.song_id = s.id
             GROUP BY s.id
             ORDER BY s.year, s.chart_rank
            """
        )
    )


def load_events(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(conn.execute("SELECT * FROM events ORDER BY start_date"))


def load_lexicon() -> dict:
    return json.loads(THEME_LEXICON.read_text())


def init_embedder(model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
    """Load sentence-transformers. Returns (embedder, dim, model_version)."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("  · sentence-transformers not installed; skipping embeddings", file=sys.stderr)
        return None, 0, "none"
    os.environ.setdefault("HF_HOME", str(REPO / "data" / "cache" / "hf"))
    os.environ.setdefault("TRANSFORMERS_CACHE", str(REPO / "data" / "cache" / "hf"))
    Path(REPO / "data" / "cache" / "hf").mkdir(parents=True, exist_ok=True)
    print(f"  · loading embedder {model_name}")
    model = SentenceTransformer(model_name, cache_folder=str(REPO / "data" / "cache" / "hf"))
    dim = model.get_sentence_embedding_dimension() or 384
    return model, dim, model_name


@dataclass
class NerBackend:
    provider: str
    model: object
    model_version: str
    labels_version: str = "unknown"


def normalize_musicner_provider(raw: str | None) -> str:
    provider = (raw or os.getenv("MUSICNER_PROVIDER", "auto")).strip().lower()
    if provider in {"auto", "gliner", "custom", "musicner", "spacy"}:
        return provider
    print(f"  · Unknown MUSICNER_PROVIDER={provider!r}; falling back to auto", file=sys.stderr)
    return "auto"


def musicner_model_arg(cli_value: str | None) -> str:
    return cli_value or os.getenv("MUSICNER_MODEL", "urchade/gliner_medium-v2.1")


def embed_texts(embedder, texts: list[str]) -> list[list[float]]:
    if embedder is None or not texts:
        return []
    vectors = embedder.encode(texts, normalize_embeddings=True, show_progress_bar=False, batch_size=32)
    return [v.tolist() for v in vectors]


def init_gliner(model_name: str = "urchade/gliner_medium-v2.1") -> NerBackend | None:
    try:
        import gliner  # noqa: F401
    except ImportError:
        return None
    try:
        from gliner import GLiNER
        # Per 0.9 (routing rule), the model name is recorded on every
        # entity_mentions row. Bump LIB_NER_LABELS_VERSION when the
        # label taxonomy changes; the model_version on new rows
        # reflects both the model and the labels version.
        from lib.nlp.ner_labels import LABELS_VERSION  # type: ignore
        return NerBackend(
            provider="gliner",
            model=GLiNER.from_pretrained(model_name),
            model_version=model_name,
            labels_version=LABELS_VERSION,
        )
    except Exception as err:  # noqa: BLE001
        print(f"  · GLiNER unavailable: {err}", file=sys.stderr)
        return None


def init_musicner(model_name: str) -> NerBackend | None:
    try:
        from gliner import GLiNER
    except ImportError:
        return None
    try:
        from lib.nlp.ner_labels import LABELS_VERSION  # type: ignore
        return NerBackend(
            provider="musicner",
            model=GLiNER.from_pretrained(model_name),
            model_version=model_name,
            labels_version=LABELS_VERSION,
        )
    except Exception as err:  # noqa: BLE001
        print(f"  · Custom MusicNER unavailable ({model_name}): {err}", file=sys.stderr)
        return None


def init_ner_backend(requested_provider: str, cli_model: str | None) -> NerBackend | None:
    provider = normalize_musicner_provider(requested_provider)
    resolved_model = musicner_model_arg(cli_model)

    if provider == "spacy":
        return None

    if provider == "gliner":
        return init_gliner(resolved_model)

    if provider == "custom":
        backend = init_musicner(resolved_model)
        if backend is not None:
            return backend
        print("  · Custom MusicNER unavailable; skipping to spaCy fallback.", file=sys.stderr)
        return None

    # auto / musicner: prefer custom, then default GLiNER.
    if provider in {"auto", "musicner"}:
        backend = init_musicner(resolved_model)
        if backend is not None:
            return backend
        if provider in {"auto", "musicner"}:
            print("  · Custom MusicNER unavailable; falling back to default GLiNER.", file=sys.stderr)
        return init_gliner()

    return None


def init_spacy() -> object | None:
    try:
        import spacy
    except ImportError:
        return None
    try:
        return spacy.load("en_core_web_sm")
    except OSError:
        print("  · spaCy en_core_web_sm missing; run: python3 -m spacy download en_core_web_sm", file=sys.stderr)
        return None


def pack_floats(values: list[float]) -> bytes:
    import struct
    return struct.pack(f"<{len(values)}f", *values)


def upsert_embedding(conn: sqlite3.Connection, kind: str, key: str, vector: list[float], model: str, dim: int) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO embeddings (id, target_type, target_id, model, dim, vector, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        (f"versesignal:emb:{kind}:{key}", kind, key, model, dim, pack_floats(vector)),
    )


def get_or_compute_centroids(p: Pipeline) -> dict[str, list[float]]:
    """Compute centroid vector for each theme using THEME_SEEDS."""
    if p.embedder is None:
        return {}
    centroids: dict[str, list[float]] = {}
    for theme, seeds in THEME_SEEDS.items():
        vecs = embed_texts(p.embedder, seeds)
        if not vecs:
            continue
        dim = len(vecs[0])
        accum = [0.0] * dim
        for v in vecs:
            for i, x in enumerate(v):
                accum[i] += x
        n = len(vecs)
        accum = [x / n for x in accum]
        # Normalize
        norm = math.sqrt(sum(x * x for x in accum)) or 1.0
        centroids[theme] = [x / norm for x in accum]
    return centroids


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def lexicon_theme_score(lyrics: str, lexicon: dict) -> dict[str, tuple[float, list[str]]]:
    """Returns theme -> (score_per_1k_tokens, top_terms)."""
    if not lyrics:
        return {}
    text = lyrics.lower()
    tokens = max(1, len(text.split()))
    out: dict[str, tuple[float, list[str]]] = {}
    for theme, defn in lexicon["themes"].items():
        term_hits: dict[str, int] = {}
        for term in defn["terms"]:
            term_l = term.lower()
            count = text.count(term_l)
            if count > 0:
                term_hits[term_l] = count
        if not term_hits:
            out[theme] = (0.0, [])
            continue
        total = sum(term_hits.values())
        out[theme] = ((total / tokens) * 1000, sorted(term_hits, key=term_hits.get, reverse=True)[:8])
    return out


def theme_scoring(p: Pipeline, lyrics: str, lexicon_hits: dict) -> list[tuple[str, float, float, str, list[str]]]:
    """Hybrid: 0.5 * lexicon_norm + 0.5 * embedding_sim.
    Returns list of (theme, score, confidence, source, evidence_terms)."""
    if not lyrics or not lexicon_hits:
        return []
    scores: list[tuple[str, float, float, str, list[str]]] = []
    lexicon_max = max((v[0] for v in lexicon_hits.values()), default=0.0) or 1.0
    song_vec = None
    if p.embedder is not None and p.theme_centroids:
        song_vec = embed_texts(p.embedder, [lyrics[:4000]])[0] if lyrics else None
    for theme, (lex_score, terms) in lexicon_hits.items():
        lex_norm = lex_score / lexicon_max
        emb_score = 0.0
        if song_vec and p.theme_centroids and theme in p.theme_centroids:
            emb_score = max(0.0, cosine(song_vec, p.theme_centroids[theme]))
        score = 0.5 * lex_norm + 0.5 * emb_score
        confidence = 0.5 if not terms else min(0.9, 0.4 + 0.1 * len(terms))
        source = "lexicon" if emb_score == 0 else "hybrid"
        scores.append((theme, round(score, 4), round(confidence, 3), source, terms))
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:6]


def mood_scoring(lyrics: str) -> list[tuple[str, float, str]]:
    if not lyrics:
        return []
    text = lyrics.lower()
    tokens = max(1, len(text.split()))
    out: list[tuple[str, float, str]] = []
    for mood, terms in MOOD_LEXICON.items():
        hits = sum(text.count(t) for t in terms)
        score = (hits / tokens) * 1000
        if score > 0:
            out.append((mood, round(score, 4), "lexicon"))
    out.sort(key=lambda x: x[1], reverse=True)
    return out[:3]


def run_ner(p: Pipeline, lyrics: str) -> list[dict]:
    """Return list of {text, label, start, end, source, confidence, model_version}."""
    out: list[dict] = []
    if not lyrics:
        return out
    lines = [l.strip() for l in lyrics.splitlines() if l.strip()]

    # Gazetteer pass first (highest-precision, zero-shot).
    # This catches slang/colloquial references that GLiNER and
    # spaCy both miss: "Henny" (Hennessy), "Benz" (Mercedes-Benz),
    # "the six" (Toronto), "lean" (purple drank), etc.
    # Per motto_v3 §0.8 the gazetteer is part of the data layer;
    # adding an entry is a code+config change. The pattern of
    # `phrase -> canonical + type` lets us merge into entities
    # without losing provenance.
    gazetteer_path = REPO / "lib" / "nlp" / "gazetteer.json"
    gazetteer: dict = {}
    if gazetteer_path.exists():
        try:
            with open(gazetteer_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            # Strip the _comment key.
            gazetteer = {k: v for k, v in raw.items() if not k.startswith("_")}
        except (json.JSONDecodeError, OSError) as err:
            print(f"  · gazetteer load failed: {err}", file=sys.stderr)

    if gazetteer:
        import re
        for line in lines:
            for phrase, target in gazetteer.items():
                # Per motto_v3 §0.7: matches must be word-bounded to
                # avoid substring collisions (e.g., "ar" matching
                # "around"). For single-word phrases, use \b on both
                # sides; for multi-word phrases, the whitespace
                # already acts as a boundary, but we still wrap
                # with \b at the start/end for ASCII alphanumerics.
                phrase_lc = phrase.lower()
                # Choose boundary characters that keep the phrase
                # intact but exclude word characters at the start/end.
                if re.match(r"^[A-Za-z0-9]", phrase_lc) and re.match(r"[A-Za-z0-9]$", phrase_lc):
                    pattern = re.compile(r"\b" + re.escape(phrase_lc) + r"\b", re.IGNORECASE)
                else:
                    pattern = re.compile(re.escape(phrase_lc), re.IGNORECASE)
                for m in pattern.finditer(line):
                    out.append({
                        "text": line[m.start():m.end()],
                        "label": target.get("type", "entity").lower(),
                        "start": m.start(),
                        "end": m.end(),
                        "source": "gazetteer",
                        "confidence": 0.95,  # high confidence: hand-curated
                        "model_version": "gazetteer-2026-06-18",
                        "labels_version": "gazetteer-2026-06-18",
                        "canonical": target.get("canonical", phrase),
                    })

    if p.gliner is not None:
        backend = p.gliner
        source = "gliner" if backend.provider == "gliner" else "musicner"
        gliner_model = backend.model
        from lib.nlp.ner_labels import NER_LABELS, get_threshold, DEFAULT_NER_THRESHOLD  # type: ignore
        try:
            for line in lines:
                # Per-label thresholds; use the highest per-label threshold
                # that matches the line's predicted label.
                preds = gliner_model.predict_entities(line, NER_LABELS, threshold=DEFAULT_NER_THRESHOLD)
                for ent in preds:
                    label = ent.get("label", "person").lower()
                    score = float(ent.get("score", 0.7))
                    if score < get_threshold(label):
                        continue
                    out.append({
                        "text": ent.get("text", ""),
                        "label": label,
                        "start": ent.get("start", 0),
                        "end": ent.get("end", 0),
                        "source": source,
                        "confidence": score,
                        "labels_version": backend.labels_version,
                        "model_version": backend.model_version,
                    })
        except Exception as err:  # noqa: BLE001
            print(f"  · GLiNER predict failed: {err}", file=sys.stderr)
    elif p.spacy_nlp is not None:
        for line in lines:
            doc = p.spacy_nlp(line)
            for ent in doc.ents:
                out.append({
                    "text": ent.text,
                    "label": ent.label_.lower(),
                    "start": ent.start_char,
                    "end": ent.end_char,
                    "source": "spacy",
                    "confidence": 0.6,
                    "model_version": "spacy_en_core_web_sm",
                    "labels_version": "spacy_en_core_web_sm",
                })
    return out


def entity_canonical_key(text: str, label: str) -> str:
    return f"{label}:{text.lower().strip()}"


def upsert_entity(conn: sqlite3.Connection, ent: dict) -> str:
    # Gazetteer entries carry an explicit `canonical` mapping
    # (e.g., "Henny" -> "Hennessy"); everything else falls back to
    # the surface form. Per the gazetteer rule (P5.2.2), this is
    # the only place where we collapse slang to canonical.
    canon = ent.get("canonical", ent["text"]).strip()
    label = ent["label"].replace(" ", "_")
    eid = f"versesignal:ent:{entity_canonical_key(canon, label)}".replace(" ", "-")
    conn.execute(
        """
        INSERT OR IGNORE INTO entities (id, canonical_name, entity_type, metadata_json)
        VALUES (?, ?, ?, NULL)
        """,
        (eid, canon, label),
    )
    return eid


def insert_mention(conn: sqlite3.Connection, song_id: str, line_id: str, ent_id: str, ent: dict) -> None:
    mid = f"versesignal:em:{song_id}:{line_id}:{ent_id}:{ent['source']}"
    # For gazetteer hits, the entity_id is already the canonical form,
    # but the surface_form should still be the original phrase from
    # the lyric (e.g., "Henny") so the UI can highlight the
    # slang-to-canonical mapping.
    surface = ent["text"]
    conn.execute(
        """
        INSERT OR REPLACE INTO entity_mentions
          (id, song_id, lyric_line_id, entity_id, surface_form, start_char, end_char, confidence, source, model_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            mid,
            song_id,
            line_id,
            ent_id,
            surface,
            ent["start"],
            ent["end"],
            ent["confidence"],
            ent["source"],
            ent.get("model_version", "spacy_en_core_web_sm"),
        ),
    )


def link_song_to_event(
    conn: sqlite3.Connection,
    song_id: str,
    song_year: int,
    event: sqlite3.Row,
    lexicon_hits: dict,
    song_vec: list[float] | None,
    event_vec: list[float] | None,
    theme_centroids: dict[str, list[float]],
    embedder,
) -> tuple[float, list[str], str, list[dict], str, int, int] | None:
    """Compute (strength, matched_terms, link_type, evidence_lines, bucket, song_year, event_year).

    Returns None if no temporal overlap or insufficient thematic signal.

    The temporal check is per-event-category (see EVENT_TEMPORAL_WINDOWS):
      - core: song_year ∈ [event_start_year, event_end_year]
      - lead_in: song_year < start, within lead_in window
      - echo: song_year > end, within echo window
      - none: outside the windows → return None
    """
    keywords = json.loads(event["keywords_json"] or "[]")
    related_themes = json.loads(event["related_themes_json"] or "[]")

    # --- Temporal gate (per event category) ---
    start_year = int(event["start_date"][:4])
    end_year = int((event["end_date"] or event["start_date"])[:4])
    category = event["category"]
    lead_in_months, echo_months = EVENT_TEMPORAL_WINDOWS.get(category, (3, 6))

    if start_year <= song_year <= end_year:
        temporal_score = 1.0
        bucket = "core"
    elif song_year < start_year:
        gap_months = (start_year - song_year) * 12
        if gap_months > lead_in_months:
            return None
        # Linear decay from 0.8 at 0 months to 0.4 at lead_in_months
        temporal_score = 0.8 - (gap_months / lead_in_months) * 0.4
        bucket = "lead_in"
    elif song_year > end_year:
        gap_months = (song_year - end_year) * 12
        if gap_months > echo_months:
            return None
        # Linear decay from 0.8 at 0 months to 0.4 at echo_months
        temporal_score = 0.8 - (gap_months / echo_months) * 0.4
        bucket = "echo"
    else:
        return None

    # --- Thematic gate ---
    matched = []
    for theme, (_score, terms) in lexicon_hits.items():
        if theme in related_themes:
            matched.extend(terms)
    if not matched:
        return None

    # Theme alignment score
    theme_score = 0.0
    for theme in related_themes:
        if theme in lexicon_hits:
            theme_score += lexicon_hits[theme][0]
    theme_score = theme_score / max(1, len(related_themes))

    # --- Embedding similarity (optional) ---
    emb_sim = 0.0
    if embedder is not None and song_vec is not None and event_vec is not None:
        emb_sim = max(0.0, cosine(song_vec, event_vec))

    # --- Composite strength: temporal acts as a multiplier ---
    raw = 0.5 * min(1.0, len(set(matched)) / 8) + 0.3 * min(1.0, theme_score / 5) + 0.2 * emb_sim
    strength = round(min(1.0, raw * temporal_score), 4)
    if strength < 0.2:
        return None

    # --- Evidence lines (lyric lines containing matched terms) ---
    evidence_lines: list[dict] = []
    for row in conn.execute(
        "SELECT line_index, text FROM lyric_lines WHERE song_id = ? ORDER BY line_index LIMIT 600",
        (song_id,),
    ).fetchall():
        text_l = row["text"].lower()
        for term in set(matched):
            if term in text_l:
                evidence_lines.append({"line_index": row["line_index"], "line_text": row["text"]})
                break
    evidence_lines = evidence_lines[:5]

    # Link type — explicit, evidence-graded
    link_type = "theme_overlap"
    if emb_sim > 0.6 and bucket == "core":
        link_type = "emotional_alignment"
    if any(t in {"war_conflict", "violence", "social_unrest", "protest"} for t in related_themes):
        if strength > 0.6:
            link_type = "emotional_shadow"

    return strength, sorted(set(matched)), link_type, evidence_lines, bucket, song_year, start_year


def build_event_embeddings(p: Pipeline, events: list[sqlite3.Row]) -> dict[str, list[float]]:
    if p.embedder is None:
        return {}
    out: dict[str, list[float]] = {}
    for ev in events:
        text = f"{ev['name']}. {ev['description'] or ''} {' '.join(json.loads(ev['keywords_json'] or '[]'))}"
        vec = embed_texts(p.embedder, [text])[0] if text else None
        if vec:
            out[ev["id"]] = vec
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-embeddings", action="store_true")
    parser.add_argument("--song-id", default=None, help="Limit enrichment to a single song id")
    parser.add_argument("--limit", type=int, default=0, help="Limit songs (debug)")
    parser.add_argument("--skip-gliner", action="store_true",
                        help="Skip GLiNER/custom MusicNER even if models load (faster re-runs when only themes/events are needed)")
    parser.add_argument("--musicner-provider", default=os.getenv("MUSICNER_PROVIDER", "auto"),
                        help="MusicNER provider: auto|gliner|custom|musicner|spacy")
    parser.add_argument("--musicner-model", default=os.getenv("MUSICNER_MODEL"),
                        help="MusicNER model id/path for gliner/custom providers")
    parser.add_argument("--only-missing-embeddings", action="store_true",
                        help="Process only songs that have lyrics but no embedding (P7.1: post-lyrics-fetch fix)")
    args = parser.parse_args()

    conn = open_db()
    ensure_graph_edge_columns(conn)
    lexicon = load_lexicon()
    embedder, dim, model_version = (None, 0, "none")
    if not args.skip_embeddings:
        embedder, dim, model_version = init_embedder()
    gliner = init_ner_backend(args.musicner_provider, args.musicner_model) if not args.skip_gliner else None
    if args.skip_gliner:
        print("  · NER model loading skipped (--skip-gliner)")
    spacy_nlp = init_spacy()
    theme_centroids = get_or_compute_centroids(Pipeline(conn, embedder, gliner, spacy_nlp, dim, None, model_version)) if embedder else {}
    ner_desc = (
        f"{gliner.provider}:{gliner.model_version}" if gliner is not None
        else "spacy" if spacy_nlp is not None and not args.skip_gliner
        else "disabled"
    )
    print(f"✓ Models ready: embedder={model_version}  ner={ner_desc}  spacy={'yes' if spacy_nlp else 'no'}  themes={len(theme_centroids)}")

    events = load_events(conn)
    event_vecs = build_event_embeddings(Pipeline(conn, embedder, gliner, spacy_nlp, dim, theme_centroids, model_version), events) if embedder else {}

    songs = load_songs(conn)
    if args.song_id:
        songs = [s for s in songs if s["id"] == args.song_id]
    if args.limit:
        songs = songs[: args.limit]
    if args.only_missing_embeddings:
        # P7.1: re-run only for songs that have lyrics but no
        # embedding. Closes the gap surfaced when the lyrics-fetch
        # artist fix recovered 3 songs after the last full enrich.
        before = len(songs)
        songs = [
            s for s in songs
            if conn.execute(
                "SELECT 1 FROM lyric_lines WHERE song_id = ? LIMIT 1",
                (s["id"],),
            ).fetchone()
            and not conn.execute(
                "SELECT 1 FROM embeddings WHERE target_type='song' AND target_id = ?",
                (s["id"],),
            ).fetchone()
        ]
        print(f"  · --only-missing-embeddings: filtered {before} → {len(songs)}")
    print(f"→ Enriching {len(songs)} songs, {len(events)} events")

    t0 = time.time()
    for idx, song in enumerate(songs, start=1):
        song_id = song["id"]
        lyrics = song["lyrics"] or ""
        lexicon_hits = lexicon_theme_score(lyrics, lexicon)

        # Embeddings
        song_vec = None
        if embedder is not None and lyrics:
            song_vec = embed_texts(embedder, [lyrics[:4000]])[0]
            upsert_embedding(conn, "song", song_id, song_vec, model_version, dim)

        # Theme scores
        if lyrics:
            themes = theme_scoring(
                Pipeline(conn, embedder, gliner, spacy_nlp, dim, theme_centroids, model_version),
                lyrics,
                lexicon_hits,
            )
            for theme, score, conf, source, terms in themes:
                if score <= 0:
                    continue
                conn.execute(
                    """
                    INSERT OR REPLACE INTO theme_scores
                      (id, song_id, theme, score, confidence, evidence_terms_json, source, model_version)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"versesignal:ts:{song_id}:{theme}",
                        song_id,
                        theme,
                        float(score),
                        float(conf),
                        json.dumps(terms),
                        source,
                        model_version,
                    ),
                )

        # Mood scores (lexicon proxy)
        if lyrics:
            moods = mood_scoring(lyrics)
            for mood, score, source in moods:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO mood_scores
                      (id, song_id, mood, score, source, model_version)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"versesignal:ms:{song_id}:{mood}",
                        song_id,
                        mood,
                        float(score),
                        source,
                        "lexicon_v1",
                    ),
                )

        # NER → entity_mentions + graph edges
        if args.skip_gliner:
            ents = []
        else:
            ents = run_ner(Pipeline(conn, embedder, gliner, spacy_nlp, dim, theme_centroids, model_version), lyrics)
        seen_ents: set[str] = set()
        for ent in ents:
            eid = upsert_entity(conn, ent)
            if eid in seen_ents:
                continue
            seen_ents.add(eid)
            # Approximate line_id by walking lyric_lines once
            line_id = f"versesignal:ll:{song_id}:0"
            for row in conn.execute(
                "SELECT id, text FROM lyric_lines WHERE song_id = ? ORDER BY line_index",
                (song_id,),
            ).fetchall():
                if ent["text"] and ent["text"] in row["text"]:
                    line_id = row["id"]
                    break
            insert_mention(conn, song_id, line_id, eid, ent)
            # Graph edge: song -> entity (mentions). For gazetteer
            # hits, the entity_id is already the canonical form
            # (e.g., "Hennessy") so the graph node labels the canonical
            # entity, while the entity_mentions.surface_form preserves
            # the original phrase (e.g., "Henny").
            edge_id = f"versesignal:e:{song_id}:mentions:{eid}:{ent['source']}"
            song_node = f"versesignal:n:song:{song_id}"
            ent_node = f"versesignal:n:entity:{eid}"
            canonical_label = ent.get("canonical", ent["text"])
            conn.execute(
                "INSERT OR IGNORE INTO graph_nodes (id, node_type, label) VALUES (?, ?, ?)",
                (ent_node, "entity", canonical_label),
            )
            ev_id = f"versesignal:ev:{edge_id}"
            # For gazetteer hits, mark the matched terms + use
            # `gazetteer_alias` evidence type so the graph explorer
            # can highlight the slang->canonical mapping.
            is_gaz = ent["source"] == "gazetteer"
            matched_terms_json = json.dumps([ent["text"]]) if is_gaz else None
            evidence_type = "gazetteer_alias" if is_gaz else "entity_match"
            evidence_value = (
                f"{ent['text']} → {canonical_label} ({ent['label']})"
                if is_gaz
                else f"{ent['text']} ({ent['label']})"
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO graph_edges
                  (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json, source_api, model_version, inference_type, matched_terms_json, explanation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    edge_id,
                    song_node,
                    ent_node,
                    "mentions_entity",
                    1.0,
                    float(ent["confidence"]),
                    json.dumps([ev_id]),
                    ent["source"],
                    f"urchade/gliner_medium-v2.1+labels-{ent.get('labels_version', 'unknown')}"
                    if ent["source"] == "gliner" else model_version,
                    "named_entity_match",
                    matched_terms_json,
                    f"NER detected '{ent['text']}' ({ent['label']}) in lyrics."
                    if not is_gaz
                    else f"Gazetteer mapped '{ent['text']}' to '{canonical_label}' ({ent['label']}).",
                ),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO evidence
                  (id, edge_id, evidence_type, value, source, confidence)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ev_id, edge_id, evidence_type, evidence_value, ent["source"], float(ent["confidence"])),
            )

        # Event linking
        if lyrics:
            for ev in events:
                link = link_song_to_event(
                    conn,
                    song_id,
                    song["year"],
                    ev,
                    lexicon_hits,
                    song_vec,
                    event_vecs.get(ev["id"]),
                    theme_centroids,
                    embedder,
                )
                if not link:
                    continue
                strength, matched_terms, link_type, evidence_lines, bucket, _sy, ev_start = link
                edge_id = f"versesignal:e:{song_id}:event:{ev['id']}:{link_type}"
                song_node = f"versesignal:n:song:{song_id}"
                ev_node = f"versesignal:n:event:{ev['id']}"
                conn.execute(
                    "INSERT OR IGNORE INTO graph_nodes (id, node_type, label, properties_json) VALUES (?, ?, ?, ?)",
                    (ev_node, "event", ev["name"], json.dumps({"category": ev["category"], "start": ev["start_date"]})),
                )
                ev_ids: list[str] = []
                explanation_parts = [
                    f"Temporal bucket: {bucket} (song {song['year']}, event start {ev_start}).",
                    f"Matched terms: {', '.join(matched_terms[:6])}.",
                    f"Link type: {link_type}.",
                ]
                # Insert graph edge first (FK target), then evidence rows.
                conn.execute(
                    """
                    INSERT OR REPLACE INTO graph_edges
                      (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json, source_api, model_version, inference_type, matched_terms_json, explanation)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        edge_id,
                        song_node,
                        ev_node,
                        "associated_with_event",
                        float(strength),
                        float(min(1.0, 0.5 + 0.05 * len(matched_terms))),
                        json.dumps([]),
                        "hybrid",
                        model_version,
                        link_type,
                        json.dumps(sorted(set(matched_terms))),
                        " ".join(explanation_parts),
                    ),
                )
                for i, line in enumerate(evidence_lines):
                    eid = f"versesignal:ev:{edge_id}:line:{i}"
                    ev_ids.append(eid)
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO evidence
                          (id, edge_id, evidence_type, value, source, confidence)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (eid, edge_id, "lyric_line", line["line_text"], "lexicon", 0.9),
                    )
                for i, term in enumerate(sorted(set(matched_terms))):
                    eid_term = f"versesignal:ev:{edge_id}:term:{i}"
                    ev_ids.append(eid_term)
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO evidence
                          (id, edge_id, evidence_type, value, source, confidence)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (eid_term, edge_id, "lyric_term", term, "lexicon", 0.9),
                    )
                eid_terms = f"versesignal:ev:{edge_id}:terms"
                ev_ids.append(eid_terms)
                conn.execute(
                    """
                    INSERT OR REPLACE INTO evidence
                      (id, edge_id, evidence_type, value, source, confidence)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (eid_terms, edge_id, "event_date_overlap", f"{ev['start_date']}..{ev['end_date'] or ev['start_date']}", "manual", 1.0),
                )
                # Backfill evidence_ids on the edge.
                conn.execute(
                    "UPDATE graph_edges SET evidence_ids_json = ? WHERE id = ?",
                    (json.dumps(ev_ids), edge_id),
                )

        # Theme graph edges
        for theme, score, conf, source, _terms in theme_scoring(
            Pipeline(conn, embedder, gliner, spacy_nlp, dim, theme_centroids, model_version),
            lyrics,
            lexicon_hits,
        )[:3]:
            if score < 0.2:
                continue
            theme_node = f"versesignal:n:theme:{theme}"
            conn.execute(
                "INSERT OR IGNORE INTO graph_nodes (id, node_type, label) VALUES (?, ?, ?)",
                (theme_node, "theme", theme),
            )
            edge_id = f"versesignal:e:{song_id}:theme:{theme}"
            song_node = f"versesignal:n:song:{song_id}"
            ev_id = f"versesignal:ev:{edge_id}"
            conn.execute(
                """
                INSERT OR REPLACE INTO graph_edges
                  (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json, source_api, model_version, inference_type, matched_terms_json, explanation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    edge_id,
                    song_node,
                    theme_node,
                    "contains_theme",
                    float(score),
                    float(conf),
                    json.dumps([ev_id]),
                    source,
                    model_version,
                    "theme_overlap",
                    None,
                    f"Theme scoring from {source}.",
                ),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO evidence
                  (id, edge_id, evidence_type, value, source, confidence)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ev_id, edge_id, "lyric_term", ",".join(lexicon_hits.get(theme, (0, []))[1]), source, float(conf)),
            )

        conn.commit()
        if idx % 10 == 0 or idx == len(songs):
            elapsed = time.time() - t0
            print(f"  · {idx}/{len(songs)} enriched in {elapsed:.1f}s")

    print(f"✓ Done in {time.time() - t0:.1f}s")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
