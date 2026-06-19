#!/usr/bin/env python3
"""
Tests for signal_clusters and cultural_posture.

Per motto_v3 0.6 (risk-based verification), these
classifiers are medium-risk (they drive the Cultural
Lens page). Tier-3 verification: pin the structural
invariants and the data shape.
"""

import json
import sqlite3
from pathlib import Path
import pytest

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"

ALLOWED_POSTURES = frozenset({
    "reflection", "shadow", "escape", "contradiction",
    "processing", "amplification", "coincidence",
})


@pytest.fixture(scope="module")
def db():
    if not DB_PATH.exists():
        pytest.skip(f"DB not found: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


def test_signal_clusters_have_data(db):
    """At least one year has >= 1 cluster."""
    n = db.execute("SELECT COUNT(*) AS c FROM signal_clusters").fetchone()["c"]
    assert n > 0, f"signal_clusters is empty (run scripts/build-signal-clusters.py first)"


def test_signal_clusters_signals_parse(db):
    """signals_json parses to a list with type/signal/weight fields."""
    bad = []
    for r in db.execute("SELECT signals_json FROM signal_clusters"):
        try:
            arr = json.loads(r["signals_json"])
            if not isinstance(arr, list):
                bad.append("not a list")
                continue
            for item in arr:
                if not all(k in item for k in ("type", "signal", "weight")):
                    bad.append(f"missing field: {item}")
        except (ValueError, TypeError) as e:
            bad.append(f"parse error: {e}")
    assert not bad, f"signal_clusters.signals_json issues: {bad[:5]}"


def test_signal_clusters_confidence_in_range(db):
    """confidence is in [0, 1]."""
    bad = db.execute(
        "SELECT id, confidence FROM signal_clusters "
        "WHERE confidence IS NULL OR confidence < 0 OR confidence > 1"
    ).fetchall()
    assert not bad, f"Out-of-range confidence: {[(r[0], r[1]) for r in bad]}"


def test_cultural_posture_postures_in_union(db):
    """Every posture is one of the 7 allowed values."""
    bad = db.execute(
        "SELECT DISTINCT posture FROM cultural_posture "
        "WHERE posture NOT IN ('reflection', 'shadow', 'escape', "
        "  'contradiction', 'processing', 'amplification', 'coincidence')"
    ).fetchall()
    assert not bad, f"Unknown postures: {[r[0] for r in bad]}"


def test_cultural_posture_score_in_range(db):
    """score is in [0, 1]."""
    bad = db.execute(
        "SELECT id, score FROM cultural_posture "
        "WHERE score < 0 OR score > 1"
    ).fetchall()
    assert not bad, f"Out-of-range scores: {[(r[0], r[1]) for r in bad]}"


def test_cultural_posture_has_classifications(db):
    """At least one (song, event) pair is classified, and the
    classifications reflect the tightened linker (Decision 0030):
    the linker requires SPECIFIC event keywords in song lyrics, so
    most chart songs no longer link to any curated event. A small
    but non-zero number of classifications is the honest baseline.
    """
    n = db.execute("SELECT COUNT(*) AS c FROM cultural_posture").fetchone()["c"]
    # Per Decision 0030, the linker produces a small, honest number
    # of song-event links (e.g., 7 for the current 411-song corpus).
    # We assert >0 to confirm the classifier still runs, and not
    # >100 to avoid incentivizing the inflated linker that the old
    # test was written against.
    assert n > 0, f"Only {n} cultural_posture rows; expected >0"


def test_cultural_posture_diverse_distribution(db):
    """The 7 postures are not degenerate (e.g., all 'coincidence')."""
    rows = db.execute(
        "SELECT posture, COUNT(*) AS c FROM cultural_posture GROUP BY posture ORDER BY 2 DESC"
    ).fetchall()
    counts = {r["posture"]: r["c"] for r in rows}
    # No single posture should be > 80% of total (degenerate)
    total = sum(counts.values())
    if total > 0:
        dominant = max(counts.values()) / total
        assert dominant < 0.80, (
            f"Degenerate distribution: dominant posture = {dominant:.0%}, "
            f"counts = {counts}"
        )
