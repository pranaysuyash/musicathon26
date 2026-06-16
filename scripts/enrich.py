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
    gliner: object | None
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


def embed_texts(embedder, texts: list[str]) -> list[list[float]]:
    if embedder is None or not texts:
        return []
    vectors = embedder.encode(texts, normalize_embeddings=True, show_progress_bar=False, batch_size=32)
    return [v.tolist() for v in vectors]


def init_gliner() -> object | None:
    try:
        import gliner  # noqa: F401
    except ImportError:
        return None
    try:
        from gliner import GLiNER
        model = GLiNER.from_pretrained("urchade/gliner_medium-v2.1")
        return model
    except Exception as err:  # noqa: BLE001
        print(f"  · GLiNER unavailable: {err}", file=sys.stderr)
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
    """Return list of {text, label, start, end, source, confidence}."""
    out: list[dict] = []
    if not lyrics:
        return out
    lines = [l.strip() for l in lyrics.splitlines() if l.strip()]
    if p.gliner is not None:
        labels = [
            "person", "artist", "musician", "band",
            "place", "city", "country",
            "brand", "religious figure", "political figure",
            "song title", "album title", "drug", "weapon",
            "technology", "vehicle",
        ]
        try:
            for line in lines:
                preds = p.gliner.predict_entities(line, labels, threshold=0.5)
                for ent in preds:
                    out.append({
                        "text": ent.get("text", ""),
                        "label": ent.get("label", "person").lower(),
                        "start": ent.get("start", 0),
                        "end": ent.get("end", 0),
                        "source": "gliner",
                        "confidence": float(ent.get("score", 0.7)),
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
                })
    return out


def entity_canonical_key(text: str, label: str) -> str:
    return f"{label}:{text.lower().strip()}"


def upsert_entity(conn: sqlite3.Connection, ent: dict) -> str:
    canon = ent["text"].strip()
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
            ent["text"],
            ent["start"],
            ent["end"],
            ent["confidence"],
            ent["source"],
            "gliner_medium-v2.1" if ent["source"] == "gliner" else "spacy_en_core_web_sm",
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
) -> tuple[float, list[str], str, list[dict]] | None:
    """Compute (strength, matched_terms, link_type, evidence_lines). Returns None if too weak."""
    keywords = json.loads(event["keywords_json"] or "[]")
    related_themes = json.loads(event["related_themes_json"] or "[]")

    if not (song_year == int(event["start_date"][:4]) or
            (event["start_date"][:4] <= str(song_year) <= (event["end_date"] or event["start_date"])[:4])):
        # Chart year doesn't overlap event window (within ±1 yr for boundary events)
        year_lo = int(event["start_date"][:4]) - 1
        year_hi = int((event["end_date"] or event["start_date"])[:4]) + 1
        if not (year_lo <= song_year <= year_hi):
            return None

    # Term overlap
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

    # Embedding similarity
    emb_sim = 0.0
    if embedder is not None and song_vec is not None and event_vec is not None:
        emb_sim = max(0.0, cosine(song_vec, event_vec))
    elif embedder is not None:
        # Try a quick embed of the event description
        if "embedding" in str(event.keys()):
            pass
    # Composite strength (0..1)
    strength = min(1.0, 0.4 * min(1.0, len(set(matched)) / 8) + 0.4 * min(1.0, theme_score / 5) + 0.2 * emb_sim)
    if strength < 0.2:
        return None

    # Pull a couple of evidence lines that contain the matched terms.
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

    link_type = "theme_overlap"
    if emb_sim > 0.6:
        link_type = "emotional_alignment"
    if any(t in {"war_conflict", "violence", "social_unrest", "protest"} for t in related_themes):
        if strength > 0.6:
            link_type = "emotional_shadow"

    return strength, sorted(set(matched)), link_type, evidence_lines


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
    args = parser.parse_args()

    conn = open_db()
    lexicon = load_lexicon()
    embedder, dim, model_version = (None, 0, "none")
    if not args.skip_embeddings:
        embedder, dim, model_version = init_embedder()
    gliner = init_gliner()
    spacy_nlp = init_spacy()
    theme_centroids = get_or_compute_centroids(Pipeline(conn, embedder, gliner, spacy_nlp, dim, None, model_version)) if embedder else {}
    print(f"✓ Models ready: embedder={model_version}  gliner={'yes' if gliner else 'no'}  spacy={'yes' if spacy_nlp else 'no'}  themes={len(theme_centroids)}")

    events = load_events(conn)
    event_vecs = build_event_embeddings(Pipeline(conn, embedder, gliner, spacy_nlp, dim, theme_centroids, model_version), events) if embedder else {}

    songs = load_songs(conn)
    if args.song_id:
        songs = [s for s in songs if s["id"] == args.song_id]
    if args.limit:
        songs = songs[: args.limit]
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
            # Graph edge: song -> entity (mentions)
            edge_id = f"versesignal:e:{song_id}:mentions:{eid}:{ent['source']}"
            song_node = f"versesignal:n:song:versesignal:{song_id.split(':',1)[1] if song_id.startswith('versesignal:') else song_id}"
            # song_node was already created during seed; use canonical form:
            song_node = f"versesignal:n:song:{song_id}"
            ent_node = f"versesignal:n:entity:{eid}"
            conn.execute(
                "INSERT OR IGNORE INTO graph_nodes (id, node_type, label) VALUES (?, ?, ?)",
                (ent_node, "entity", ent["text"]),
            )
            ev_id = f"versesignal:ev:{edge_id}"
            conn.execute(
                """
                INSERT OR REPLACE INTO graph_edges
                  (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json, source_api, model_version, explanation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    model_version if ent["source"] != "gliner" else "gliner_medium-v2.1",
                    f"NER detected '{ent['text']}' ({ent['label']}) in lyrics.",
                ),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO evidence
                  (id, edge_id, evidence_type, value, source, confidence)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ev_id, edge_id, "entity_match", f"{ent['text']} ({ent['label']})", ent["source"], float(ent["confidence"])),
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
                strength, matched_terms, link_type, evidence_lines = link
                edge_id = f"versesignal:e:{song_id}:event:{ev['id']}:{link_type}"
                song_node = f"versesignal:n:song:{song_id}"
                ev_node = f"versesignal:n:event:{ev['id']}"
                conn.execute(
                    "INSERT OR IGNORE INTO graph_nodes (id, node_type, label, properties_json) VALUES (?, ?, ?, ?)",
                    (ev_node, "event", ev["name"], json.dumps({"category": ev["category"], "start": ev["start_date"]})),
                )
                ev_ids: list[str] = []
                explanation_parts = [
                    f"Event window overlaps song year ({song['year']}).",
                    f"Matched terms: {', '.join(matched_terms[:6])}.",
                    f"Link type: {link_type}.",
                ]
                # Insert graph edge first (FK target), then evidence rows.
                conn.execute(
                    """
                    INSERT OR REPLACE INTO graph_edges
                      (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json, source_api, model_version, explanation)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                  (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json, source_api, model_version, explanation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
