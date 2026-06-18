#!/usr/bin/env python3
"""
VerseSignal — year signal profile builder.

Per decision 0019 P1.1, the lyrics-first signal engine
needs `year_signal_profiles` rows that aggregate:

- theme scores (from theme_scores)
- mood scores (from mood_scores)
- entity mentions (from entity_mentions)

…by year + region, with deltas vs previous year and 3-year
baseline.

This script is idempotent. Re-run after any data update.

Per 1st principles: scores are means across the songs that
mention the signal, not the raw cumulative weight. This
avoids bias toward years with more lyrics.

Run:
  uv run --no-sync python scripts/build-year-signal-profiles.py
"""

import json
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"

# Only the US region in the v1 corpus (Billboard Hot 100).
REGION = "US"


def slug(s: str) -> str:
    """Match lib/graph/ids.ts slug helper."""
    import re
    s = s.lower()
    s = re.sub(r"[\u0300-\u036f]", "", s)  # strip accents
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def build_theme_profiles(conn: sqlite3.Connection) -> int:
    """Aggregate theme_scores by year + theme (mean score)."""
    rows = conn.execute("""
        SELECT s.year, ts.theme, AVG(ts.score) AS mean_score,
               COUNT(DISTINCT ts.song_id) AS song_count,
               GROUP_CONCAT(DISTINCT ts.song_id) AS song_ids
        FROM theme_scores ts
        JOIN songs s ON s.id = ts.song_id
        WHERE s.region = ? AND s.year IS NOT NULL
        GROUP BY s.year, ts.theme
    """, (REGION,)).fetchall()
    inserted = 0
    for year, theme, mean_score, song_count, song_ids in rows:
        pid = f"versesignal:ysp:{year}:{REGION}:theme:{slug(theme)}"
        ids = song_ids.split(",") if song_ids else []
        conn.execute("""
            INSERT INTO year_signal_profiles
              (id, year, region, signal_type, signal, score, song_count,
               evidence_song_ids_json, source_api, computed_at)
            VALUES (?, ?, ?, 'theme', ?, ?, ?, ?, 'theme_scores', datetime('now'))
            ON CONFLICT(year, region, signal_type, signal) DO UPDATE SET
              score = excluded.score,
              song_count = excluded.song_count,
              evidence_song_ids_json = excluded.evidence_song_ids_json,
              computed_at = excluded.computed_at
        """, (pid, year, REGION, theme, mean_score, song_count, json.dumps(ids)))
        inserted += 1
    return inserted


def build_mood_profiles(conn: sqlite3.Connection) -> int:
    """Aggregate mood_scores by year + mood (mean score)."""
    rows = conn.execute("""
        SELECT s.year, ms.mood, AVG(ms.score) AS mean_score,
               COUNT(DISTINCT ms.song_id) AS song_count,
               GROUP_CONCAT(DISTINCT ms.song_id) AS song_ids
        FROM mood_scores ms
        JOIN songs s ON s.id = ms.song_id
        WHERE s.region = ? AND s.year IS NOT NULL
        GROUP BY s.year, ms.mood
    """, (REGION,)).fetchall()
    inserted = 0
    for year, mood, mean_score, song_count, song_ids in rows:
        pid = f"versesignal:ysp:{year}:{REGION}:mood:{slug(mood)}"
        ids = song_ids.split(",") if song_ids else []
        conn.execute("""
            INSERT INTO year_signal_profiles
              (id, year, region, signal_type, signal, score, song_count,
               evidence_song_ids_json, source_api, computed_at)
            VALUES (?, ?, ?, 'mood', ?, ?, ?, ?, 'mood_scores', datetime('now'))
            ON CONFLICT(year, region, signal_type, signal) DO UPDATE SET
              score = excluded.score,
              song_count = excluded.song_count,
              evidence_song_ids_json = excluded.evidence_song_ids_json,
              computed_at = excluded.computed_at
        """, (pid, year, REGION, mood, mean_score, song_count, json.dumps(ids)))
        inserted += 1
    return inserted


def build_entity_profiles(conn: sqlite3.Connection) -> int:
    """Aggregate entity_mentions by year + entity (mean confidence).

    Uses the GLiNER/spaCy confidence as the score. Top-30 entities
    per year by song_count (long tail of rare entities is noise).
    """
    rows = conn.execute("""
        SELECT s.year, e.canonical_name, e.entity_type,
               AVG(em.confidence) AS mean_conf,
               COUNT(DISTINCT em.song_id) AS song_count,
               GROUP_CONCAT(DISTINCT em.song_id) AS song_ids
        FROM entity_mentions em
        JOIN entities e ON e.id = em.entity_id
        JOIN songs s ON s.id = em.song_id
        WHERE s.region = ? AND s.year IS NOT NULL
        GROUP BY s.year, e.canonical_name
        ORDER BY song_count DESC
    """, (REGION,)).fetchall()
    # Take top-30 per year
    by_year: dict[int, list] = {}
    for r in rows:
        by_year.setdefault(r[0], []).append(r)
    inserted = 0
    for year, items in by_year.items():
        for year_items in [items[:30]]:
            for year_, name, etype, mean_conf, song_count, song_ids in year_items:
                pid = f"versesignal:ysp:{year}:{REGION}:entity:{slug(name)}"
                ids = song_ids.split(",") if song_ids else []
                conn.execute("""
                    INSERT INTO year_signal_profiles
                      (id, year, region, signal_type, signal, score, song_count,
                       evidence_song_ids_json, source_api, computed_at)
                    VALUES (?, ?, ?, 'entity', ?, ?, ?, ?, 'entity_mentions', datetime('now'))
                    ON CONFLICT(year, region, signal_type, signal) DO UPDATE SET
                      score = excluded.score,
                      song_count = excluded.song_count,
                      evidence_song_ids_json = excluded.evidence_song_ids_json,
                      computed_at = excluded.computed_at
                """, (pid, year, REGION, name, mean_conf, song_count, json.dumps(ids)))
                inserted += 1
    return inserted


def compute_deltas(conn: sqlite3.Connection) -> int:
    """For each profile row, compute:
    - delta_vs_prev_year: (current - prev) / prev, NULL if no prior
    - delta_vs_baseline: mean of prev 3 years

    The baseline uses the prior 3 years (excluding the event year)
    as a stable reference; this matches the 'event window vs
    surrounding baseline' framing in the feedback.
    """
    rows = conn.execute("""
        SELECT year, region, signal_type, signal, score
        FROM year_signal_profiles
        ORDER BY year ASC
    """).fetchall()
    # Build a lookup: (year, region, signal_type, signal) -> score
    by_key: dict[tuple, float] = {}
    by_year_signal: dict[tuple, list[tuple[int, float]]] = {}
    for year, region, stype, signal, score in rows:
        key = (region, stype, signal)
        by_key[(year, region, stype, signal)] = score
        by_year_signal.setdefault(key, []).append((year, score))
    updated = 0
    for year, region, stype, signal, score in rows:
        # Previous year
        prev_score = by_key.get((year - 1, region, stype, signal))
        delta_prev = (score - prev_score) / prev_score if (prev_score and prev_score > 0) else None
        # 3-year baseline: mean of (year-3, year-2, year-1)
        baseline_scores = [
            by_key.get((y, region, stype, signal))
            for y in (year - 3, year - 2, year - 1)
        ]
        baseline_scores = [s for s in baseline_scores if s is not None and s > 0]
        if baseline_scores:
            baseline_mean = sum(baseline_scores) / len(baseline_scores)
            delta_base = (score - baseline_mean) / baseline_mean if baseline_mean > 0 else None
        else:
            delta_base = None
        conn.execute("""
            UPDATE year_signal_profiles
            SET delta_vs_prev_year = ?, delta_vs_baseline = ?
            WHERE year = ? AND region = ? AND signal_type = ? AND signal = ?
        """, (delta_prev, delta_base, year, region, stype, signal))
        updated += 1
    return updated


def main() -> int:
    if not DB_PATH.exists():
        print(f"ERROR: DB not found: {DB_PATH}", file=sys.stderr)
        return 1
    conn = sqlite3.connect(DB_PATH)
    try:
        print("=== year_signal_profiles builder ===")
        print()
        n_theme = build_theme_profiles(conn)
        print(f"  theme profiles upserted: {n_theme}")
        n_mood = build_mood_profiles(conn)
        print(f"  mood profiles upserted:  {n_mood}")
        n_entity = build_entity_profiles(conn)
        print(f"  entity profiles upserted: {n_entity}")
        conn.commit()
        n_delta = compute_deltas(conn)
        print(f"  deltas computed:          {n_delta}")
        conn.commit()
        n_total = conn.execute("SELECT COUNT(*) FROM year_signal_profiles").fetchone()[0]
        print()
        print(f"  total year_signal_profiles: {n_total}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
