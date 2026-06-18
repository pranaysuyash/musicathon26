#!/usr/bin/env python3
"""
VerseSignal — context-signal correlation builder.

Per decision 0019 P2.2, for each (event, signal) pair,
compute:

- baseline_mean: mean of the 3 years before the event
- event_period_score: the score in the event's main year
- delta: (event - baseline) / baseline
- confidence: based on evidence song count

The output is a per-event view of "what shifted during
this event, vs the surrounding baseline?" — the
"During COVID, escape rose 41% vs baseline" framing
the external review called for as the "real wow."

Per 1st principles, the framing is:
- 'correlated with', 'over-indexed during', 'shifted
  toward/away from'
- NOT 'caused' (we cannot prove causation from a
  single year-vs-baseline comparison)

Run:
  uv run --no-sync python scripts/build-context-correlations.py
"""

import json
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"
REGION = "US"

# Minimum evidence for confidence > 0.3
MIN_SONG_COUNT = 1
# How many years of baseline to use (per the feedback:
# 3 years is the right window — long enough to be
# stable, short enough to be relevant)
BASELINE_YEARS = 3
# How many top signals per (event, year) to keep
TOP_PER_EVENT = 25


def get_events_by_year(conn: sqlite3.Connection) -> dict[int, list[dict]]:
    """Return {year: [event_dict, ...]} for events whose
    start_year <= year <= end_year (or +∞ if ongoing)."""
    rows = conn.execute(
        """
        SELECT id, name, start_date, end_date, category
        FROM events
        """
    ).fetchall()
    by_year: dict[int, list[dict]] = {}
    for r in rows:
        try:
            start_year = int(r[2][:4])
        except (TypeError, ValueError):
            continue
        end_year = None
        if r[3]:
            try:
                end_year = int(r[3][:4])
            except ValueError:
                end_year = None
        # Add this event to every year in its window
        last = end_year if end_year is not None else start_year
        for y in range(start_year, last + 1):
            by_year.setdefault(y, []).append(
                {
                    "id": r[0],
                    "name": r[1],
                    "category": r[4],
                    "start_year": start_year,
                    "end_year": end_year,
                }
            )
    return by_year


def get_year_signal_score(
    conn: sqlite3.Connection, year: int, signal_type: str, signal: str
) -> tuple[float, int, list[str]] | None:
    """Return (score, song_count, song_ids) or None if no profile."""
    row = conn.execute(
        """
        SELECT score, song_count, evidence_song_ids_json
        FROM year_signal_profiles
        WHERE year = ? AND region = ? AND signal_type = ? AND signal = ?
        """,
        (year, REGION, signal_type, signal),
    ).fetchone()
    if not row or row[0] is None:
        return None
    ids = json.loads(row[2]) if row[2] else []
    return (row[0], row[1], ids)


def compute_event_year_correlations(
    conn: sqlite3.Connection, event: dict, year: int
) -> int:
    """For one (event, year) pair, compute correlations
    for every signal that has a profile in the event year
    AND a baseline in the 3 prior years.

    Returns the number of correlation rows inserted.
    """
    inserted = 0
    # Get all signals that have a profile in the event year
    rows = conn.execute(
        """
        SELECT signal_type, signal, score, song_count, evidence_song_ids_json
        FROM year_signal_profiles
        WHERE year = ? AND region = ?
          AND song_count >= ?
        """,
        (year, REGION, MIN_SONG_COUNT),
    ).fetchall()
    for r in rows:
        stype, signal, event_score, song_count, ids_json = (
            r[0],  # signal_type
            r[1],  # signal
            r[2],  # score
            r[3],  # song_count
            r[4],  # evidence_song_ids_json
        )
        # Compute baseline (mean of 3 prior years)
        baseline_scores: list[float] = []
        for by in (year - 1, year - 2, year - 3):
            bp = get_year_signal_score(conn, by, stype, signal)
            if bp:
                baseline_scores.append(bp[0])
        if len(baseline_scores) < 1:
            # No baseline; skip (we can't compute a delta)
            continue
        baseline_mean = sum(baseline_scores) / len(baseline_scores)
        if baseline_mean <= 0:
            continue
        delta = (event_score - baseline_mean) / baseline_mean
        # Confidence: blend song_count and baseline depth
        # song_count: more = more confident
        # baseline depth: more years of baseline = more confident
        confidence = min(
            1.0,
            0.3 + 0.2 * song_count + 0.15 * len(baseline_scores),
        )
        ids = json.loads(ids_json) if ids_json else []
        cid = f"versesignal:csc:{event['id']}:{year}:{stype}:{signal}".replace(" ", "-")
        conn.execute(
            """
            INSERT INTO context_signal_correlations
              (id, event_id, year, signal_type, signal, baseline_mean,
               event_period_score, delta, confidence, evidence_song_ids_json,
               computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(event_id, year, signal_type, signal) DO UPDATE SET
              baseline_mean = excluded.baseline_mean,
              event_period_score = excluded.event_period_score,
              delta = excluded.delta,
              confidence = excluded.confidence,
              evidence_song_ids_json = excluded.evidence_song_ids_json,
              computed_at = excluded.computed_at
            """,
            (
                cid,
                event["id"],
                year,
                stype,
                signal,
                baseline_mean,
                event_score,
                delta,
                confidence,
                json.dumps(ids),
            ),
        )
        inserted += 1
    return inserted


def main() -> int:
    if not DB_PATH.exists():
        print(f"ERROR: DB not found: {DB_PATH}", file=sys.stderr)
        return 1
    conn = sqlite3.connect(DB_PATH)
    try:
        events_by_year = get_events_by_year(conn)
        if not events_by_year:
            print("ERROR: no events in DB", file=sys.stderr)
            return 1
        print(f"=== context_signal_correlations across {sum(len(v) for v in events_by_year.values())} (event, year) pairs ===")
        # Clear old rows (idempotent)
        conn.execute("DELETE FROM context_signal_correlations")
        total = 0
        for year in sorted(events_by_year.keys()):
            for ev in events_by_year[year]:
                n = compute_event_year_correlations(conn, ev, year)
                total += n
            conn.commit()
        # Top correlations per (event, year) by absolute delta
        print()
        n_total = conn.execute("SELECT COUNT(*) FROM context_signal_correlations").fetchone()[0]
        n_events = conn.execute("SELECT COUNT(DISTINCT event_id) FROM context_signal_correlations").fetchone()[0]
        print(f"  total correlations: {n_total} across {n_events} events")
        # Top 5 most-shifted signals per event
        print()
        print("  Most-shifted signals (|delta| descending):")
        cur = conn.execute("""
            SELECT e.name, csc.signal_type, csc.signal, csc.delta, csc.event_period_score, csc.baseline_mean
            FROM context_signal_correlations csc
            JOIN events e ON e.id = csc.event_id
            ORDER BY ABS(csc.delta) DESC
            LIMIT 8
        """)
        for r in cur.fetchall():
            delta_pct = f"{r[3]*100:+.0f}%"
            print(f"    {delta_pct:>7}  {r[1]:7}  {r[2][:25]:25}  ({r[5]:.2f}→{r[4]:.2f})  {r[0]}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
