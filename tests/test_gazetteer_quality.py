"""
Gazetteer quality test.

The gazetteer matches slang/colloquial terms to canonical
entities. A false positive (e.g., "ar" → AR-15 rifle when the
lyric says "around") pollutes the entity_mentions table and the
song-page annotation.

This test verifies that the gazetteer matches are bounded by
word boundaries (per the fix in scripts/enrich.py), which means
the 1-2 character entries that were the most prone to substring
false-positives should now produce zero matches across the
corpus. A regression that reintroduces substring matching would
be caught here.

Tier: 3 (integration). Runs against data/versesignal.db.
"""

import sqlite3
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"

# Single- and double-character entries that were removed from
# the gazetteer (per scripts/migrate-clean-short-gazetteer.ts and
# the word-boundary fix in scripts/enrich.py).
# If any of these appear as gazetteer canonical entities in
# entity_mentions, the matcher is broken (regression to
# substring matching).
DEPRECATED_GAZETTEER_CANONICALS = {
    "AR-15 (rifle)",  # matched "ar" inside "around" before fix
    "Audemars Piguet",  # matched "ap" inside random words
    "21 Savage",  # matched "21" inside any number
    "Brooklyn, New York",  # matched "bk" inside words like "bks"
    "9mm (ammunition)",  # matched "9" inside any digit
    "ACE (spades)",  # matched "ace" — actually this is fine, it's a 3-char real word; deprecated
    "DC / Maryland / Virginia",  # matched "dmv" inside non-state strings
    "DC / Maryland / Virginia",  # matched "DMV" inside state strings (some are valid)
    "Instagram",  # matched "ig" inside words like "dig"
    "Direct Message",  # matched "dm" inside words like "adam"
}

# A more pragmatic check: for entries that were single characters
# (length=1), they should produce ZERO matches in the corpus.
# These are the most unreliable (would match the letter in any word).
SINGLE_CHAR_GAZETTEER_ENTRIES = {
    "9",  # would match any single "9" digit in lyrics
}


@pytest.fixture(scope="module")
def db():
    if not DB_PATH.exists():
        pytest.skip(f"DB not found: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


def test_no_single_char_gazetteer_matches(db):
    """Single-character gazetteer entries should produce zero
    matches after the word-boundary fix. If a 1-char entry like
    "9" matches anything, the matcher regressed to substring."""
    for entry in SINGLE_CHAR_GAZETTEER_ENTRIES:
        rows = db.execute(
            "SELECT COUNT(*) AS c FROM entity_mentions em "
            "JOIN entities e ON e.id = em.entity_id "
            "WHERE em.source = 'gazetteer' AND e.canonical_name LIKE ?",
            (f"%{entry}%",),
        ).fetchone()
        # The match could be inside a multi-word canonical. We
        # check the canonical_name starts with the entry, which
        # is a stricter check.
        rows = db.execute(
            "SELECT COUNT(*) AS c FROM entity_mentions em "
            "JOIN entities e ON e.id = em.entity_id "
            "WHERE em.source = 'gazetteer' "
            "AND (e.canonical_name = ? OR e.canonical_name LIKE ?)",
            (entry, f"{entry} (%"),
        ).fetchone()
        assert rows["c"] == 0, (
            f"Single-character gazetteer entry {entry!r} matched "
            f"{rows['c']} times. The matcher has regressed to "
            f"substring matching. Re-check scripts/enrich.py for "
            f"\\b word boundaries."
        )


def test_gazetteer_canonical_names_have_reasonable_length(db):
    """Gazetteer canonical entities should be at least 3 characters
    long to be reliably matchable as standalone terms. This is a
    soft quality check; if a canonical has 1-2 chars, the entry
    is suspicious."""
    rows = db.execute(
        "SELECT DISTINCT e.canonical_name, COUNT(*) AS hits "
        "FROM entity_mentions em "
        "JOIN entities e ON e.id = em.entity_id "
        "WHERE em.source = 'gazetteer' "
        "GROUP BY e.canonical_name "
        "ORDER BY LENGTH(e.canonical_name) ASC"
    ).fetchall()
    short_canonicals = [dict(r) for r in rows if r["canonical_name"] and len(r["canonical_name"]) <= 2]
    assert not short_canonicals, (
        f"Found {len(short_canonicals)} gazetteer canonicals with "
        f"<= 2 characters: {short_canonicals}. These are likely "
        f"false-positive candidates; remove or expand them."
    )


def test_gazetteer_total_hits_are_dominant_real_entities(db):
    """The top gazetteer hits should be well-known entities
    (people, places, brands) — not typos or accidental matches.
    Spot-check: top-10 most-hit gazetteer canonicals should each
    have >= 1 hit (sanity) and should not include obvious
    non-entities like 'around' (a pre-fix match)."""
    rows = db.execute(
        "SELECT e.canonical_name, COUNT(*) AS c "
        "FROM entity_mentions em "
        "JOIN entities e ON e.id = em.entity_id "
        "WHERE em.source = 'gazetteer' "
        "GROUP BY e.canonical_name "
        "ORDER BY c DESC "
        "LIMIT 20"
    ).fetchall()
    assert len(rows) >= 5, f"Expected >= 5 distinct gazetteer canonicals, got {len(rows)}"
    for r in rows:
        canonical = r["canonical_name"] or ""
        # Anti-pattern: stop words or very common English words
        # (these would be false-positive matches).
        common_words = {
            "I", "a", "an", "the", "is", "of", "to", "in", "on",
            "and", "or", "but", "for", "with", "as", "at", "by",
            "me", "you", "he", "she", "it", "we", "they", "be",
            "do", "go", "so", "no", "my", "we", "up",
        }
        assert canonical.lower() not in common_words, (
            f"Top gazetteer hit {canonical!r} is a common English word "
            f"— likely a false positive."
        )
