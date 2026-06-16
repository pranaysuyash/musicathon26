#!/usr/bin/env python3
"""
VerseSignal — similar_to edge builder.

For every pair of songs with stored embeddings, compute cosine
similarity. If above threshold, add a `similar_to` edge with the
similarity score as weight. Evidence row points to the embedding
source (which model version, what kind of similarity — embedding
or thematic).

Per-event-category temporal windows (decision 0004) do not apply
here: songs can be similar across any time. We do not gate by year.

Run:
  uv run --no-sync python scripts/build-similar-edges.py
  uv run --no-sync python scripts/build-similar-edges.py --threshold 0.7 --top-k 4

Per motto_v3 §0.9 (model/routing rule), the model that produced
the embeddings is recorded in every edge:
  source_api = "embedding"
  model_version = "sentence-transformers/all-MiniLM-L6-v2" (or
    whatever the source row was tagged with)

Per §0.8 (data layer rule), the threshold and top-k values are
CLI args, not buried in code.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import struct
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DB = REPO / "data" / "versesignal.db"


def load_embeddings(conn: sqlite3.Connection) -> list[tuple[str, str, list[float]]]:
    """Returns list of (song_id, model, vector) for all song embeddings."""
    rows = conn.execute(
        """
        SELECT target_id, model, vector, dim FROM embeddings
         WHERE target_type = 'song'
         ORDER BY target_id
        """
    ).fetchall()
    out = []
    for song_id, model, blob, dim in rows:
        n = dim
        if len(blob) != n * 4:
            print(f"  ! dim mismatch for {song_id}: blob={len(blob)} expected={n * 4}", file=sys.stderr)
            continue
        vec = list(struct.unpack(f"<{n}f", blob))
        out.append((song_id, model, vec))
    return out


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=float, default=0.65,
                        help="Minimum cosine similarity to add an edge (default 0.65)")
    parser.add_argument("--top-k", type=int, default=5,
                        help="Max similar_to edges per song (default 5)")
    parser.add_argument("--max-similarity", type=float, default=0.985,
                        help="Skip edges at/above this similarity (data quality guard: "
                             "1.000 usually means identical/wrong lyrics, not real similarity)")
    parser.add_argument("--clear", action="store_true",
                        help="Clear existing similar_to edges before rebuilding")
    args = parser.parse_args()

    if not DB.exists():
        print(f"✗ DB not found at {DB}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    t0 = time.time()
    embeddings = load_embeddings(conn)
    print(f"→ Loaded {len(embeddings)} song embeddings")

    if args.clear:
        deleted = conn.execute(
            "DELETE FROM evidence WHERE edge_id IN (SELECT id FROM graph_edges WHERE edge_type = 'similar_to')"
        ).rowcount
        deleted_edges = conn.execute(
            "DELETE FROM graph_edges WHERE edge_type = 'similar_to'"
        ).rowcount
        conn.commit()
        print(f"  · Cleared {deleted_edges} similar_to edges and {deleted} evidence rows")

    # Pairwise cosine. O(n^2) but fine for 128 songs = 8,128 pairs.
    pairs_total = len(embeddings) * (len(embeddings) - 1) // 2
    print(f"→ Computing {pairs_total} pairwise cosine similarities "
          f"(threshold {args.threshold}, max-similarity {args.max_similarity})…")

    # Per-song best neighbors. Skip self-comparisons and the
    # "identical embeddings" upper band (a cosine >= 0.985 between
    # two distinct songs almost always means one of them has the
    # wrong lyrics — see the lyrics-fetch follow-up).
    best: dict[str, list[tuple[float, str]]] = {}
    seen = 0
    skipped_identical = 0
    t1 = time.time()
    for i in range(len(embeddings)):
        a_id, _a_model, a_vec = embeddings[i]
        for j in range(i + 1, len(embeddings)):
            b_id, _b_model, b_vec = embeddings[j]
            seen += 1
            sim = cosine(a_vec, b_vec)
            if sim >= args.max_similarity:
                skipped_identical += 1
                continue
            if sim < args.threshold:
                continue
            best.setdefault(a_id, []).append((sim, b_id))
            best.setdefault(b_id, []).append((sim, a_id))
    print(f"  · {seen} pairs in {time.time() - t1:.1f}s "
          f"({skipped_identical} skipped as identical-embedding noise)")

    # Top-K per song
    edges: list[tuple[str, str, str, float]] = []  # (a_id, b_id, model, weight)
    for node, neighbors in best.items():
        neighbors.sort(key=lambda x: -x[0])
        for sim, other in neighbors[: args.top_k]:
            edges.append((node, other, embeddings[0][1] if embeddings else "embedding", round(sim, 4)))

    print(f"→ {len(edges)} similar_to edges to insert (threshold={args.threshold}, top_k={args.top_k})")

    insert_edge = conn.execute
    edges_added = 0
    for src, dst, model, weight in edges:
        edge_id = f"versesignal:e:{src}:similar_to:{dst}"
        # Skip if already exists (idempotent re-runs)
        existing = conn.execute("SELECT 1 FROM graph_edges WHERE id = ?", (edge_id,)).fetchone()
        if existing:
            continue
        conn.execute(
            """
            INSERT INTO graph_edges
              (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json,
               source_api, model_version, explanation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                edge_id,
                f"versesignal:n:song:{src}",
                f"versesignal:n:song:{dst}",
                "similar_to",
                float(weight),
                float(min(1.0, weight + 0.05)),  # confidence slightly above weight
                json.dumps([]),
                "embedding",
                model,
                f"Cosine similarity {weight:.3f} over lyrics embedding.",
            ),
        )
        # Evidence row
        ev_id = f"versesignal:ev:{edge_id}:cosine"
        conn.execute(
            """
            INSERT OR REPLACE INTO evidence
              (id, edge_id, evidence_type, value, source, confidence)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (ev_id, edge_id, "embedding_similarity", f"cosine={weight:.4f}", "embedding", float(weight)),
        )
        # Backfill evidence_ids
        conn.execute(
            "UPDATE graph_edges SET evidence_ids_json = ? WHERE id = ?",
            (json.dumps([ev_id]), edge_id),
        )
        edges_added += 1

    conn.commit()

    # Summary
    total_similar = conn.execute(
        "SELECT COUNT(*) FROM graph_edges WHERE edge_type = 'similar_to'"
    ).fetchone()[0]
    elapsed = time.time() - t0

    print(f"✓ Added {edges_added} similar_to edges; total in graph: {total_similar}")
    print(f"  · {elapsed:.1f}s total")

    # Print a few of the strongest connections as sanity check
    print("\nTop 5 strongest similar_to edges:")
    for r in conn.execute(
        "SELECT s1.title, s2.title, ge.weight "
        "FROM graph_edges ge "
        "JOIN songs s1 ON s1.id = SUBSTR(ge.src_id, LENGTH('versesignal:n:song:') + 1) "
        "JOIN songs s2 ON s2.id = SUBSTR(ge.dst_id, LENGTH('versesignal:n:song:') + 1) "
        "WHERE ge.edge_type = 'similar_to' "
        "ORDER BY ge.weight DESC LIMIT 5"
    ):
        print(f"  {r[0]:30}  ~  {r[1]:30}  ({r[2]:.3f})")

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
