#!/usr/bin/env python3
"""
VerseSignal — cultural posture classifier.

Per decision 0019 P1.4, each (song, event) pair gets a
posture label. Seven categories, per the external review:

  reflection     — song mirrors the event (shared themes)
  shadow         — song carries similar emotional weight but
                    no direct reference
  escape         — song emotionally runs away from the event
                    (escape/celebratory signals during serious events)
  contradiction  — song tone clashes with the event tone
  processing     — song appears after the event and metabolizes
                    the same themes
  amplification  — song directly mentions the event (named
                    entities / place matches)
  coincidence   — weak temporal overlap, low theme/mood match

This is a rule-based first pass. Future: LLM-derived
narratives per (song, event) pair.

Run:
  uv run --no-sync python scripts/build-cultural-posture.py
"""

import json
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"

# Event categories considered "serious" (the events during
# which escape + contradiction are interesting).
SERIOUS_CATEGORIES = {"war", "pandemic", "social", "political", "natural_disaster"}

# Theme keywords that indicate escape / celebration / hedonism.
ESCAPE_THEMES = {"love", "celebration", "party", "escape_party", "home", "fame"}
ESCAPE_MOODS = {"energetic", "celebratory", "romantic", "dreamy"}


def song_themes(conn: sqlite3.Connection, song_id: str) -> dict[str, float]:
    """Return {theme_slug: score} for a song."""
    rows = conn.execute(
        "SELECT theme, score FROM theme_scores WHERE song_id = ?", (song_id,)
    ).fetchall()
    return {r[0]: r[1] for r in rows}


def song_moods(conn: sqlite3.Connection, song_id: str) -> dict[str, float]:
    rows = conn.execute(
        "SELECT mood, score FROM mood_scores WHERE song_id = ?", (song_id,)
    ).fetchall()
    return {r[0]: r[1] for r in rows}


def song_entities(conn: sqlite3.Connection, song_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT em.confidence, e.canonical_name, e.entity_type "
        "FROM entity_mentions em JOIN entities e ON e.id = em.entity_id "
        "WHERE em.song_id = ?",
        (song_id,),
    ).fetchall()
    return [
        {"confidence": r[0], "name": r[1], "type": r[2]} for r in rows
    ]


def event_keywords(conn: sqlite3.Connection, event_id: str) -> list[str]:
    row = conn.execute(
        "SELECT keywords_json FROM events WHERE id = ?", (event_id,)
    ).fetchone()
    if not row or not row[0]:
        return []
    return [k.lower() for k in json.loads(row[0])]


def event_themes(conn: sqlite3.Connection, event_id: str) -> list[str]:
    row = conn.execute(
        "SELECT related_themes_json FROM events WHERE id = ?", (event_id,)
    ).fetchone()
    if not row or not row[0]:
        return []
    return [t.lower() for t in json.loads(row[0])]


def event_meta(conn: sqlite3.Connection, event_id: str) -> dict:
    row = conn.execute(
        "SELECT start_date, end_date, category FROM events WHERE id = ?",
        (event_id,),
    ).fetchone()
    if not row:
        return {}
    return {
        "start_date": row[0],
        "end_date": row[1],
        "category": row[2],
    }


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    inter = a & b
    union = a | b
    return len(inter) / len(union) if union else 0.0


def classify_song_event(
    conn: sqlite3.Connection, song_id: str, event_id: str
) -> tuple[str, float, str, dict]:
    """Returns (posture, score, rationale, evidence)."""
    song_year_row = conn.execute(
        "SELECT year FROM songs WHERE id = ?", (song_id,)
    ).fetchone()
    if not song_year_row:
        return ("coincidence", 0.0, "song not in songs table", {})
    song_year = song_year_row[0]
    ev = event_meta(conn, event_id)
    if not ev:
        return ("coincidence", 0.0, "event not in events table", {})
    # Year-overlap gate: only classify if the song's year
    # falls within the event's date range (or within ±1 year
    # as a soft overlap for lead/lag).
    ev_start_year = int(ev["start_date"][:4]) if ev.get("start_date") else None
    ev_end_year = int(ev["end_date"][:4]) if ev.get("end_date") else ev_start_year
    if ev_start_year is None or abs(song_year - ev_start_year) > 2:
        # Outside the event window: mark as 'coincidence'
        # unless the song is significantly after (→ processing).
        if ev_end_year and song_year > ev_end_year + 0:
            return (
                "processing",
                0.2,
                f"song {song_year} comes after event end {ev_end_year}",
                {"temporal_offset_years": song_year - ev_end_year},
            )
        return (
            "coincidence",
            0.0,
            f"song {song_year} outside event window {ev_start_year}-{ev_end_year}",
            {"temporal_offset_years": song_year - ev_start_year if ev_start_year else None},
        )

    # Now we're in-window. Compute signal overlap.
    song_t = set(song_themes(conn, song_id).keys())
    ev_t = set(event_themes(conn, event_id))
    theme_overlap = jaccard(song_t, ev_t)
    song_m = set(song_moods(conn, song_id).keys())
    ev_keywords = set(event_keywords(conn, event_id))
    # Mood: we don't have event mood; we use event keywords as proxy
    keyword_overlap = jaccard(song_m, ev_keywords)
    entities = song_entities(conn, song_id)
    entity_names = {e["name"].lower() for e in entities}
    entity_match = jaccard(entity_names, ev_keywords)

    evidence = {
        "song_year": song_year,
        "event_window": [ev_start_year, ev_end_year],
        "theme_overlap": round(theme_overlap, 3),
        "keyword_overlap": round(keyword_overlap, 3),
        "entity_match": round(entity_match, 3),
        "shared_themes": sorted(song_t & ev_t)[:5],
        "shared_keywords": sorted(song_m & ev_keywords)[:5],
    }

    is_serious = ev.get("category") in SERIOUS_CATEGORIES

    # 1. AMPLIFICATION: high entity match (named places/people
    #    from the event appear in the song)
    if entity_match >= 0.3:
        return (
            "amplification",
            entity_match,
            f"named entities from the event appear in the song ({len(entity_names & ev_keywords)} matches)",
            evidence,
        )

    # 2. PROCESSING: song is significantly after the event
    if ev_end_year and song_year > ev_end_year:
        return (
            "processing",
            0.3 + 0.5 * theme_overlap,
            f"song {song_year} metabolizes themes from event that ended {ev_end_year}",
            evidence,
        )

    # 3. REFLECTION: shared themes
    if theme_overlap >= 0.3:
        return (
            "reflection",
            min(1.0, 0.4 + 0.6 * theme_overlap),
            f"shares {len(song_t & ev_t)} themes with the event",
            evidence,
        )

    # 4. ESCAPE: serious event + escape signals
    if is_serious and (song_t & ESCAPE_THEMES):
        return (
            "escape",
            0.4,
            f"escape/celebratory themes during serious event ({ev.get('category')})",
            evidence,
        )
    if is_serious and (song_m & ESCAPE_MOODS):
        return (
            "escape",
            0.35,
            f"celebratory/romantic mood during serious event ({ev.get('category')})",
            evidence,
        )

    # 5. CONTRADICTION: serious event + theme directly opposing
    #    (e.g., 'love' during war → escapist / contradiction)
    if is_serious and keyword_overlap >= 0.05:
        return (
            "contradiction",
            0.3,
            f"event keywords appear in song mood during serious event",
            evidence,
        )

    # 6. SHADOW: mood matches event keywords but no theme overlap
    if keyword_overlap >= 0.2 and theme_overlap < 0.2:
        return (
            "shadow",
            0.4,
            "song mood echoes the event without direct reference",
            evidence,
        )

    # 7. COINCIDENCE: weak overlap
    return (
        "coincidence",
        max(0.1, theme_overlap + keyword_overlap) / 2,
        "weak temporal overlap, low theme/mood match",
        evidence,
    )


def main() -> int:
    if not DB_PATH.exists():
        print(f"ERROR: DB not found: {DB_PATH}", file=sys.stderr)
        return 1
    conn = sqlite3.connect(DB_PATH)
    try:
        # Get all (song, event) pairs from existing event-link edges
        # (only pairs the system already considers related)
        pairs = conn.execute("""
            SELECT DISTINCT ge.src_id, ge.dst_id
            FROM graph_edges ge
            WHERE ge.edge_type = 'associated_with_event'
              AND ge.src_id LIKE 'versesignal:n:song:%'
              AND ge.dst_id LIKE 'versesignal:n:event:%'
        """).fetchall()
        print(f"=== cultural_posture classifier across {len(pairs)} (song, event) pairs ===")
        # Clear old rows (idempotent)
        conn.execute("DELETE FROM cultural_posture")
        counts_by_posture: dict[str, int] = {}
        n = 0
        for src, dst in pairs:
            # Strip the prefix to get the bare song/event IDs
            song_id = src.replace("versesignal:n:song:", "", 1)
            event_id = dst.replace("versesignal:n:event:", "", 1)
            posture, score, rationale, evidence = classify_song_event(
                conn, song_id, event_id
            )
            cp_id = f"versesignal:cp:{song_id}:{event_id}"
            conn.execute(
                """
                INSERT INTO cultural_posture
                  (id, song_id, event_id, posture, score, rationale,
                   evidence_json, source_api, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'rule', datetime('now'))
                """,
                (cp_id, song_id, event_id, posture, score, rationale, json.dumps(evidence)),
            )
            counts_by_posture[posture] = counts_by_posture.get(posture, 0) + 1
            n += 1
        conn.commit()
        print()
        print(f"  total classifications: {n}")
        for p, c in sorted(counts_by_posture.items(), key=lambda x: -x[1]):
            print(f"    {p:18}  {c}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
