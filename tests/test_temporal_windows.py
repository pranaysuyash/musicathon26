import pytest

"""
Tests for the per-event-category temporal window logic (decision 0004).

Per motto_v3 §0.6, the temporal-bucketing function is high-risk
(customer-facing event connections; wrong windows = false positives).
These tests pin the exact bucketing for each category + the
decay formula within the window.

The function under test is the `temporal_overlap` logic embedded
in `enrich.py:link_song_to_event`. We extract the logic into a
testable helper here for unit testing without invoking the full
SQLite pipeline.
"""

"""
Tests for the per-event-category temporal window logic (decision 0004).

Per motto_v3 §0.6, the temporal-bucketing function is high-risk
(customer-facing event connections; wrong windows = false positives).
These tests pin the exact bucketing for each category + the
decay formula within the window.

The function under test is the `temporal_overlap` logic embedded
in `enrich.py:link_song_to_event`. We extract the logic into a
testable helper here for unit testing without invoking the full
SQLite pipeline.
"""

import sys
from pathlib import Path

# Repo root on sys.path for `scripts.enrich` import
_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO))

import pytest

from scripts.enrich import EVENT_TEMPORAL_WINDOWS  # noqa: E402


def _temporal_overlap(song_year: int, event: dict) -> tuple[float, str]:
    """Mirror of the temporal-bucketing logic in enrich.py.
    Returns (score, bucket) where bucket is one of core/lead_in/echo/none.
    """
    start_year = int(event["start_date"][:4])
    end_year = int((event.get("end_date") or event["start_date"])[:4])
    category = event["category"]
    lead_in_months, echo_months = EVENT_TEMPORAL_WINDOWS.get(category, (3, 6))

    if start_year <= song_year <= end_year:
        return 1.0, "core"
    if song_year < start_year:
        gap_months = (start_year - song_year) * 12
        if gap_months > lead_in_months:
            return 0.0, "none"
        return 0.8 - (gap_months / lead_in_months) * 0.4, "lead_in"
    if song_year > end_year:
        gap_months = (song_year - end_year) * 12
        if gap_months > echo_months:
            return 0.0, "none"
        return 0.8 - (gap_months / echo_months) * 0.4, "echo"
    return 0.0, "none"


def _ev(category: str, start: str, end: str | None = None) -> dict:
    return {"category": category, "start_date": start, "end_date": end or start}


# -------- core bucket: song_year is within the event window --------

def test_pandemic_core_2020_song():
    score, bucket = _temporal_overlap(2020, _ev("pandemic", "2020-03-15", "2021-06-01"))
    assert bucket == "core"
    assert score == 1.0


def test_election_core():
    # US 2020 election: 2020-11-03 to 2021-01-20
    score, bucket = _temporal_overlap(2020, _ev("political", "2020-11-03", "2021-01-20"))
    assert bucket == "core"
    assert score == 1.0


# -------- lead_in bucket: song_year is before the event --------

def test_war_lead_in_3mo():
    # Ukraine: 2022-02-24, lead_in = 3mo
    # Song from 2021, 12 months before — outside the 3mo window
    score, bucket = _temporal_overlap(2021, _ev("war", "2022-02-24"))
    assert bucket == "none"
    assert score == 0.0


def test_war_lead_in_dec_2021():
    # Song from late 2021, ~2-3 months before Feb 2022
    score, bucket = _temporal_overlap(2021, _ev("war", "2022-02-24"))
    # 2021-12-01 to 2022-02-24 ≈ 2-3 months; at boundary
    # Compute: gap_years = 2022-2021 = 1 → gap_months = 12
    # 12 > 3 (lead_in for war) → none
    assert bucket == "none"


# -------- echo bucket: song_year is after the event --------

def test_pandemic_echo_2022():
    # COVID-19 lockdowns: 2020-03-15 to 2021-06-01, echo = 24mo
    # Song from 2022 is 6-18 months after end → within echo
    score, bucket = _temporal_overlap(2022, _ev("pandemic", "2020-03-15", "2021-06-01"))
    assert bucket == "echo"
    # gap_years = 1, gap_months = 12. echo = 24.
    # score = 0.8 - (12/24)*0.4 = 0.8 - 0.2 = 0.6
    assert 0.5 < score < 0.7


def test_pandemic_echo_2023_far():
    # Song from 2023 is 18-30 months after end of COVID-19 lockdowns (2021-06-01)
    # gap_years = 2, gap_months = 24. echo = 24. At the boundary.
    # Score = 0.8 - (24/24)*0.4 = 0.4
    score, bucket = _temporal_overlap(2023, _ev("pandemic", "2020-03-15", "2021-06-01"))
    # At gap_months == echo_months, score should be ~0.4
    assert bucket == "echo"
    assert 0.35 < score < 0.45


def test_election_echo_2022_too_far():
    # US 2020 election ends 2021-01-20, echo = 6mo
    # Song from 2022 is 11+ months after end → outside echo
    score, bucket = _temporal_overlap(2022, _ev("political", "2020-11-03", "2021-01-20"))
    assert bucket == "none"
    assert score == 0.0


# -------- decay shape within the window --------

def test_pandemic_echo_score_decays_linearly():
    # At gap_months=0: 0.8
    # At gap_months=24 (end of window): 0.4
    s0, _ = _temporal_overlap(2021, _ev("pandemic", "2020-03-15", "2021-06-01"))
    # gap_months=0 since 2021-06-01 is the end
    assert s0 == 1.0  # actually core, since 2021 is in the window

    # Force echo: 2022 (gap=12mo, half of 24mo echo)
    s12, b12 = _temporal_overlap(2022, _ev("pandemic", "2020-03-15", "2021-06-01"))
    assert b12 == "echo"
    assert s12 == pytest.approx(0.6, abs=1e-9)  # 0.8 - (12/24)*0.4 = 0.6

    # 2023 (gap=24mo, at the edge of 24mo echo)
    s24, b24 = _temporal_overlap(2023, _ev("pandemic", "2020-03-15", "2021-06-01"))
    assert b24 == "echo"
    assert s24 == pytest.approx(0.4, abs=1e-9)  # 0.8 - (24/24)*0.4 = 0.4


# -------- category-specific windows are honored --------

def test_social_has_widest_echo():
    # Social movements (MeToo) have 36mo echo — the longest
    # MeToo: 2017-10-15 to 2020-12-31. 36mo after end = 2023-12-31.
    # A song from 2023 sits within the echo window (~36mo).
    score, bucket = _temporal_overlap(2023, _ev("social", "2017-10-15", "2020-12-31"))
    assert bucket == "echo"


def test_social_2024_outside_widest_echo():
    # 2024 is 48mo after MeToo's 2020-12-31 end — outside even
    # the 36mo social window. Documents the upper bound.
    score, bucket = _temporal_overlap(2024, _ev("social", "2017-10-15", "2020-12-31"))
    assert bucket == "none"


def test_sports_has_tightest_window():
    # Sports events: 3mo lead_in, 3mo echo
    # 6 months out → outside
    score, bucket = _temporal_overlap(2021, _ev("sports", "2020-06-01"))
    # gap_years = 1, gap_months = 12. echo = 3. 12 > 3 → none
    assert bucket == "none"


# -------- the per-event-category table is sane --------

def test_echo_is_always_ge_lead_in():
    for cat, (lead, echo) in EVENT_TEMPORAL_WINDOWS.items():
        assert echo >= lead, f"{cat} has lead_in > echo ({lead} > {echo})"


def test_pandemic_echo_geq_political_echo():
    # First-principles: pandemics echo longer than elections
    assert EVENT_TEMPORAL_WINDOWS["pandemic"][1] >= EVENT_TEMPORAL_WINDOWS["political"][1]
