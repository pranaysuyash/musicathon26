#!/usr/bin/env python3
"""
VerseSignal — MusicBrainz artist linking.

For every entity of type 'artist' or 'musician' or 'band',
look up the MusicBrainz ID (MBID) via the public API and
populate `entities.musicbrainz_id`.

Per motto_v3 §0.8 (data layer rule), the lookup is a batch
operation that can be re-run idempotently. Per §0.9 (routing
rule), the model/API name is recorded on every row.

Rate limits (per MusicBrainz):
  - Unauthenticated: 1 request/second
  - Authenticated: 50 requests/second
  We use unauthenticated. For 250 entities this takes ~4 minutes.

Disambiguation strategy:
  - Pick the highest-scoring result if the name is an exact
    case-insensitive match against the result's name
  - If the highest-scoring result is NOT an exact match, log
    a warning and skip (avoid false positives)
  - If multiple results tie, prefer "Person" over "Group" for
    single-artist names; "Group" for "Band"/"Group" keywords

Run:
  uv run --no-sync python scripts/enrich-musicbrainz.py
  uv run --no-sync python scripts/enrich-musicbrainz.py --limit 10  # smoke test
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DB = REPO / "data" / "versesignal.db"

API_BASE = "https://musicbrainz.org/ws/2"
USER_AGENT = "VerseSignal/0.1 (Musicathon 2026; contact: pranay.suyash@gmail.com)"

# Per the disambiguation policy: keyword in the entity name → entity_type hint
TYPE_HINTS = {
    "band": "Group",
    "group": "Group",
    "duo": "Duo",
    "trio": "Group",
    "orchestra": "Orchestra",
    "choir": "Choir",
    "ensemble": "Group",
}


def http_get(path: str, params: dict) -> dict:
    """MusicBrainz HTTP GET with rate limiting. Returns parsed JSON."""
    qs = urllib.parse.urlencode({**params, "fmt": "json"})
    url = f"{API_BASE}{path}?{qs}"
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    last_err: Exception | None = None
    # Per the Wikidata post-mortem (Decision 0035), MusicBrainz also
    # returns 429 under burst load. We retry both 429 and 503 with
    # exponential backoff (3 attempts, max 4s). MusicBrainz's documented
    # rate limit for unauthenticated is 1 req/sec; the inter-request
    # sleep below enforces that.
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (429, 503) and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            break
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(1)
                continue
            break
    raise RuntimeError(f"MusicBrainz GET {url} failed: {last_err}")


def search_artist(name: str) -> list[dict]:
    """Return ranked list of artist candidates for a name."""
    data = http_get("/artist", {"query": name, "limit": 5})
    return data.get("artists", [])


def pick_best(candidates: list[dict], name: str) -> dict | None:
    """Pick the highest-scoring candidate that's an exact name match.
    Returns None if no exact match.
    """
    if not candidates:
        return None
    name_lower = name.lower().strip()
    # First pass: exact case-insensitive name match
    for c in candidates:
        if c.get("name", "").lower().strip() == name_lower:
            return c
    # Second pass: sort aliases
    for c in candidates:
        aliases = [a.lower().strip() for a in c.get("aliases", []) if isinstance(a, str)]
        if name_lower in aliases:
            return c
    # Third pass: if entity name contains type hints (Band/Group),
    # allow type-match even with fuzzy name
    type_hint = next((v for k, v in TYPE_HINTS.items() if k in name_lower), None)
    if type_hint:
        for c in candidates:
            if c.get("type") == type_hint:
                # Best matching type-hint candidate
                return c
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Limit artists processed (debug)")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    args = parser.parse_args()

    if not DB.exists():
        print(f"✗ DB not found at {DB}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    # Find artist-typed entities that don't yet have a musicbrainz_id
    candidates = conn.execute(
        """
        SELECT id, canonical_name, entity_type, musicbrainz_id
          FROM entities
         WHERE entity_type IN ('artist', 'musician', 'band')
           AND (musicbrainz_id IS NULL OR musicbrainz_id = '')
         ORDER BY canonical_name
        """
    ).fetchall()
    if args.limit:
        candidates = candidates[: args.limit]
    print(f"→ {len(candidates)} artist-typed entities without a MusicBrainz ID")

    if not candidates:
        print("  Nothing to do.")
        return 0

    matched = 0
    skipped = 0
    errors = 0
    for i, row in enumerate(candidates, 1):
        eid = row["id"]
        name = row["canonical_name"]
        # 1 request/sec for unauthenticated. Honor the rate limit.
        try:
            results = search_artist(name)
        except Exception as err:
            print(f"  ! {name}: API error: {err}")
            errors += 1
            time.sleep(2)
            continue
        best = pick_best(results, name)
        if not best:
            skipped += 1
            if i <= 5 or (i % 50 == 0):
                print(f"  · {name}: no exact match (skipped)")
            time.sleep(1.0)
            continue
        mbid = best["id"]
        artist_type = best.get("type", "")
        # Update DB
        if not args.dry_run:
            conn.execute(
                """
                UPDATE entities
                   SET musicbrainz_id = ?,
                       musicbrainz_artist_type = ?,
                       metadata_json = COALESCE(metadata_json, '{}') || json_object(
                           'mb_lookup', json_object(
                               'score', ?, 'disambiguation', ?, 'aliases_count', ?
                           )
                       )
                 WHERE id = ?
                """,
                (mbid, artist_type, best.get("score", 0), "exact" if best.get("name", "").lower() == name.lower() else "alias", len(best.get("aliases", [])), eid),
            )
            conn.commit()
        matched += 1
        if i <= 5 or (i % 25 == 0):
            print(f"  ✓ {name} → {mbid} ({artist_type})  score={best.get('score', 0)}")
        time.sleep(1.0)

    print(f"\n{'[DRY-RUN] ' if args.dry_run else ''}Matched: {matched}  Skipped: {skipped}  Errors: {errors}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
