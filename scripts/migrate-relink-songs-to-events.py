"""
Re-link songs to events using the tightened linker (Decision 0030).

The original linker accepted any song whose themes overlapped an
event's related_themes_json. That produced 100+ bogus COVID
connections because "loneliness" / "home" / "hope" / "escape_party"
are shared themes across many songs.

The new linker (scripts/enrich.py:link_song_to_event, post-0030)
requires:
  - At least 2 distinct event-specific KEYWORDS appear in the song's
    lexicon hit set (not just themes).
  - At least 3 distinct matched terms total.
  - Temporal window matches.

This script:
  1. Reads songs and events from the DB.
  2. Computes lexicon_hits for each song's lyrics (re-using the same
     lexicon that enrich.py uses, so behavior matches a fresh run).
  3. Drops existing graph_edges where inference_type IN
     ('theme_overlap', 'emotional_shadow', 'emotional_alignment') AND
     edge_type='associated_with_event' and dst is an event node.
  4. Calls the new linker; inserts the surviving edges + evidence
     rows.

It does NOT touch named_entity_match, embedding_similarity, or
manual_curation edges, so artist/theme/entity mentions stay intact.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from scripts.enrich import (  # type: ignore  # noqa: E402
    link_song_to_event,
    build_event_embeddings,
    Pipeline,
    load_lexicon,
    lexicon_theme_score,
)

DB = REPO / "data" / "versesignal.db"
MODEL_VERSION = "enrich-2026-06-19-linker-tightened"


def main() -> None:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    print("Loading lexicon…")
    lexicon = load_lexicon()
    theme_lex = lexicon
    mood_lex = lexicon.get("moods", {})

    print("Loading songs + lyrics…")
    songs: list[sqlite3.Row] = []
    for row in cur.execute(
        "SELECT s.id, s.year, s.title, s.artist FROM songs s "
        "WHERE EXISTS (SELECT 1 FROM lyric_lines ll WHERE ll.song_id = s.id)"
    ):
        songs.append(row)
    print(f"  {len(songs)} songs with lyrics")

    print("Loading events…")
    events = list(cur.execute(
        "SELECT id, name, start_date, end_date, regions_json, category, "
        "keywords_json, description, related_themes_json FROM events"
    ))
    print(f"  {len(events)} events")

    # Try to load embedder (optional — linker uses cosine similarity if present)
    embedder = None
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore

        embedder = SentenceTransformer("all-MiniLM-L6-v2")
    except Exception as err:  # noqa: BLE001
        print(f"  (embedder unavailable: {err}; linker will run without embedding similarity)")

    print("Computing event embeddings…")
    p = Pipeline(con, None, None, None, 384, None, MODEL_VERSION)
    event_vecs = build_event_embeddings(p, events)
    print(f"  {len(event_vecs)} event embeddings")

    # Build song_vec cache (for cosine similarity inside linker)
    print("Computing song embeddings…")
    song_vecs: dict[str, list[float] | None] = {}
    if embedder is not None:
        lyrics_by_song: dict[str, str] = {}
        for s in songs:
            row = cur.execute("SELECT text FROM lyric_lines WHERE song_id = ? ORDER BY line_index", (s["id"],)).fetchall()
            lyrics_by_song[s["id"]] = "\n".join(r["text"] for r in row)
        for s in songs:
            text = lyrics_by_song.get(s["id"], "")
            if not text.strip():
                song_vecs[s["id"]] = None
                continue
            try:
                vec = embedder.encode(text[:4000], normalize_embeddings=True).tolist()
                song_vecs[s["id"]] = vec
            except Exception:
                song_vecs[s["id"]] = None

    # Drop existing event edges (theme_overlap / emotional_shadow /
    # emotional_alignment + ANY with NULL inference_type that targets
    # an event node, which are legacy edges from before the
    # inference_type column existed). Keep manual_curation +
    # named_entity_match + embedding_similarity untouched.
    cur.execute(
        "SELECT id FROM graph_edges "
        "WHERE edge_type = 'associated_with_event' "
        "  AND (inference_type IS NULL "
        "       OR inference_type IN ('theme_overlap','emotional_shadow','emotional_alignment'))"
    )
    legacy_edge_ids = [r[0] for r in cur.fetchall()]
    if legacy_edge_ids:
        ph = ",".join("?" * len(legacy_edge_ids))
        cur.execute(
            f"SELECT id FROM evidence WHERE edge_id IN ({ph})",
            legacy_edge_ids,
        )
        legacy_ev_ids = [r[0] for r in cur.fetchall()]
        if legacy_ev_ids:
            ph2 = ",".join("?" * len(legacy_ev_ids))
            cur.execute(f"DELETE FROM evidence WHERE id IN ({ph2})", legacy_ev_ids)
        ph3 = ",".join("?" * len(legacy_edge_ids))
        cur.execute(
            f"DELETE FROM graph_edges WHERE id IN ({ph3})",
            legacy_edge_ids,
        )
    print(f"Cleared {len(legacy_edge_ids)} legacy/bad event-link edges (and {len(legacy_ev_ids) if legacy_edge_ids else 0} evidence rows)")

    inserted = 0
    skipped = 0
    per_event_count: dict[str, int] = {}
    for s in songs:
        lyrics_rows = cur.execute(
            "SELECT text FROM lyric_lines WHERE song_id = ? ORDER BY line_index",
            (s["id"],),
        ).fetchall()
        lyrics = "\n".join(r["text"] for r in lyrics_rows)
        if not lyrics.strip():
            continue
        # lexicon_theme_score returns {theme: (score, terms)}. The
        # linker expects {theme: (score, terms)} — same shape.
        lex_hits = lexicon_theme_score(lyrics, theme_lex)
        song_vec = song_vecs.get(s["id"])
        for ev in events:
            link = link_song_to_event(
                con,
                s["id"],
                int(s["year"]),
                ev,
                lex_hits,
                song_vec,
                event_vecs.get(ev["id"]),
                None,  # theme_centroids (not used by current linker)
                embedder,
            )
            if not link:
                skipped += 1
                continue
            strength, matched_terms, link_type, evidence_lines, bucket, _sy, ev_start = link
            edge_id = f"versesignal:e:{s['id']}:event:{ev['id']}:{link_type}"
            song_node = f"versesignal:n:song:{s['id']}"
            ev_node = f"versesignal:n:event:{ev['id']}"
            cur.execute(
                "INSERT OR IGNORE INTO graph_nodes (id, node_type, label, properties_json) VALUES (?, ?, ?, ?)",
                (ev_node, "event", ev["name"], json.dumps({"category": ev["category"], "start": ev["start_date"]})),
            )
            explanation_parts = [
                f"Temporal bucket: {bucket} (song {s['year']}, event start {ev_start}).",
                f"Matched terms: {', '.join(matched_terms[:6])}.",
                f"Link type: {link_type}.",
            ]
            cur.execute(
                """
                INSERT OR REPLACE INTO graph_edges
                  (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json,
                   source_api, model_version, inference_type, matched_terms_json, explanation)
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
                    MODEL_VERSION,
                    link_type,
                    json.dumps(sorted(set(matched_terms))),
                    " ".join(explanation_parts),
                ),
            )
            ev_ids: list[str] = []
            for i, line in enumerate(evidence_lines):
                eid = f"versesignal:ev:{edge_id}:line:{i}"
                ev_ids.append(eid)
                cur.execute(
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
                cur.execute(
                    """
                    INSERT OR REPLACE INTO evidence
                      (id, edge_id, evidence_type, value, source, confidence)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (eid_term, edge_id, "lyric_term", term, "lexicon", 0.9),
                )
            eid_terms = f"versesignal:ev:{edge_id}:terms"
            ev_ids.append(eid_terms)
            cur.execute(
                """
                INSERT OR REPLACE INTO evidence
                  (id, edge_id, evidence_type, value, source, confidence)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (eid_terms, edge_id, "event_date_overlap",
                 f"{ev['start_date']}..{ev['end_date'] or ev['start_date']}",
                 "manual", 1.0),
            )
            cur.execute(
                "UPDATE graph_edges SET evidence_ids_json = ? WHERE id = ?",
                (json.dumps(ev_ids), edge_id),
            )
            inserted += 1
            per_event_count[ev["id"]] = per_event_count.get(ev["id"], 0) + 1

    con.commit()
    print(f"\nInserted {inserted} song-event edges (skipped {skipped} no-match)")
    print("\nPer-event connection counts:")
    for ev_id, c in sorted(per_event_count.items(), key=lambda kv: -kv[1]):
        name = cur.execute("SELECT name FROM events WHERE id = ?", (ev_id,)).fetchone()[0]
        print(f"  {c:4d}  {ev_id:40s}  {name}")
    con.close()


if __name__ == "__main__":
    main()
