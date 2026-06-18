#!/usr/bin/env python3
"""
VerseSignal — signal cluster detector.

Per decision 0019 P1.2, the lyrics-first signal engine
groups co-occurring signals into clusters. Two signals
cluster if their evidence song sets have a high Jaccard
similarity (i.e., they ride together in the same songs).

This is unsupervised — no LLM, no labels. The clusters
are then labeled with a generic "type+signal" string.
Future work (P1.6) can add LLM-generated human labels.

Run:
  uv run --no-sync python scripts/build-signal-clusters.py
"""

import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"
REGION = "US"

# Jaccard threshold for cluster inclusion
JACCARD_THRESHOLD = 0.20
# Minimum song overlap (intersection size) for inclusion
MIN_OVERLAP = 2
# Maximum cluster size
MAX_CLUSTER_SIZE = 8


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    inter = a & b
    union = a | b
    return len(inter) / len(union) if union else 0.0


def load_year_signals(conn: sqlite3.Connection, year: int) -> list[dict]:
    """Return [{type, signal, song_ids: set}] for a year."""
    rows = conn.execute(
        """
        SELECT signal_type, signal, evidence_song_ids_json
        FROM year_signal_profiles
        WHERE year = ? AND region = ?
          AND song_count >= 1
        """,
        (year, REGION),
    ).fetchall()
    out: list[dict] = []
    for stype, signal, ids_json in rows:
        ids: set[str] = set(json.loads(ids_json)) if ids_json else set()
        if ids:
            out.append({"type": stype, "signal": signal, "song_ids": ids})
    return out


def cluster_year(signals: list[dict]) -> list[list[dict]]:
    """Greedy single-link clustering: for each pair with
    Jaccard >= threshold AND overlap >= MIN_OVERLAP,
    merge into the same cluster.
    """
    parent: dict[int, int] = {i: i for i in range(len(signals))}

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(len(signals)):
        for j in range(i + 1, len(signals)):
            overlap = signals[i]["song_ids"] & signals[j]["song_ids"]
            if len(overlap) < MIN_OVERLAP:
                continue
            if jaccard(signals[i]["song_ids"], signals[j]["song_ids"]) >= JACCARD_THRESHOLD:
                union(i, j)

    # Group by root
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(len(signals)):
        groups[find(i)].append(i)

    # Filter: only groups of size >= 2, capped at MAX_CLUSTER_SIZE
    clusters: list[list[dict]] = []
    for indices in groups.values():
        if len(indices) < 2:
            continue
        members = [signals[i] for i in indices[:MAX_CLUSTER_SIZE]]
        clusters.append(members)
    return clusters


def label_cluster(members: list[dict]) -> str:
    """Generate a generic label from the cluster members.

    Format: "<type>: <signal>, <type>: <signal>, ..."
    """
    parts = [f"{m['type']}:{m['signal']}" for m in members[:6]]
    return " + ".join(parts)


def persist_cluster(
    conn: sqlite3.Connection,
    year: int,
    cluster: list[dict],
    idx: int,
) -> int:
    """Insert one cluster row. Returns the number of songs in the union."""
    all_song_ids: set[str] = set()
    for m in cluster:
        all_song_ids |= m["song_ids"]
    cid = f"versesignal:sc:{year}:{REGION}:{idx}"
    # Confidence: mean Jaccard within the cluster
    jaccards: list[float] = []
    for i in range(len(cluster)):
        for j in range(i + 1, len(cluster)):
            jv = jaccard(cluster[i]["song_ids"], cluster[j]["song_ids"])
            jaccards.append(jv)
    confidence = sum(jaccards) / len(jaccards) if jaccards else 0.0
    signals_json = json.dumps(
        [{"type": m["type"], "signal": m["signal"], "weight": len(m["song_ids"])} for m in cluster]
    )
    song_ids_json = json.dumps(sorted(all_song_ids))
    conn.execute(
        """
        INSERT INTO signal_clusters
          (id, year, region, label, signal_count, song_count,
           signals_json, song_ids_json, confidence, computed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          signal_count = excluded.signal_count,
          song_count = excluded.song_count,
          signals_json = excluded.signals_json,
          song_ids_json = excluded.song_ids_json,
          confidence = excluded.confidence,
          computed_at = excluded.computed_at
        """,
        (
            cid,
            year,
            REGION,
            label_cluster(cluster),
            len(cluster),
            len(all_song_ids),
            signals_json,
            song_ids_json,
            confidence,
        ),
    )
    return len(all_song_ids)


def main() -> int:
    if not DB_PATH.exists():
        print(f"ERROR: DB not found: {DB_PATH}", file=sys.stderr)
        return 1
    conn = sqlite3.connect(DB_PATH)
    try:
        years = [
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT year FROM year_signal_profiles ORDER BY year"
            )
        ]
        print(f"=== signal_clusters detector across {len(years)} years ===")
        total = 0
        for year in years:
            signals = load_year_signals(conn, year)
            clusters = cluster_year(signals)
            # Clear old clusters for this year (idempotent)
            conn.execute(
                "DELETE FROM signal_clusters WHERE year = ? AND region = ?",
                (year, REGION),
            )
            for idx, cluster in enumerate(clusters):
                persist_cluster(conn, year, cluster, idx)
                total += 1
            conn.commit()
            if clusters:
                # Print a one-liner per year
                top = clusters[0]
                top_label = label_cluster(top)
                print(f"  {year}: {len(clusters)} cluster(s)  top: {top_label[:80]}")
        print()
        print(f"  total clusters inserted: {total}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
