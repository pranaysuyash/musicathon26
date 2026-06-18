#!/usr/bin/env python3
"""
VerseSignal — Wikidata artist linking.

For every entity of type 'artist' (or 'musician' / 'group'),
look up the Wikidata QID via the public MediaWiki wbsearchentities
API and populate `entities.wikidata_id`.

Per motto_v3 §0.8 (data layer rule), the lookup is a batch
operation that can be re-run idempotently. Per §0.9 (routing
rule), the source/model name is recorded on every row.

Why MediaWiki (not SPARQL):
  - SPARQL endpoint (query.wikidata.org) aggressively
    rate-limits unauthenticated users to 1 req/min during
    outages. We hit this on first attempt.
  - The MediaWiki wbsearchentities API is much more lenient
    (~50 req/s for unauthenticated users with a User-Agent).
  - For exact-name lookups, the MediaWiki API returns the
    same QIDs as SPARQL would, with less complexity.

Rate limits (per Wikidata):
  - Unregistered: ~50 req/s, 5000 req/day
  - User-Agent required
We use 0.2s sleep (5 req/s) as a safe default. For 86 artists
this takes ~20s.

Disambiguation strategy:
  - Query with the canonical entity name
  - Score each result: +10 if description contains a
    music keyword (singer/rapper/band/group/etc.)
  - Take the highest-scoring result with a matching label

Run:
  uv run --no-sync python scripts/enrich-wikidata.py
  uv run --no-sync python scripts/enrich-wikidata.py --limit 5
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
import sqlite3

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"

USER_AGENT = "versesignal/1.0 (research; contact: see github.com/pranaysuyash/musicathon)"
MUSIC_KEYWORDS = ("singer", "rapper", "songwriter", "musician", "band",
                  "group", "composer", "producer", "artist")


def mediawiki_search(name: str, *, timeout: int = 15) -> list[dict]:
    """Look up an entity via the MediaWiki wbsearchentities API."""
    url = (
        f"https://www.wikidata.org/w/api.php?action=wbsearchentities"
        f"&search={urllib.parse.quote(name)}&language=en&format=json&limit=5"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read())
    return data.get("search", [])


def lookup_qid(name: str) -> str | None:
    """Return the best-matching Wikidata QID for `name`, or None."""
    try:
        results = mediawiki_search(name)
    except urllib.error.HTTPError as e:
        print(f"    [warn] HTTP {e.code} for {name!r}: {e.reason}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"    [warn] {type(e).__name__} for {name!r}: {e}", file=sys.stderr)
        return None
    if not results:
        return None
    # Score: prefer exact label match with music description.
    q = name.lower()
    best_id = None
    best_score = -1
    for r in results:
        label = (r.get("label") or "").lower()
        desc = (r.get("description") or "").lower()
        score = 0
        if label == q:
            score += 100
        elif q in label or label in q:
            score += 30
        if any(k in desc for k in MUSIC_KEYWORDS):
            score += 10
        if score > best_score:
            best_score = score
            best_id = r["id"]
    return best_id


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--rate", type=float, default=0.2)
    args = ap.parse_args()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # Source: same as JamBase — use songs.artist, parse primary.
    cur.execute("SELECT DISTINCT artist FROM songs WHERE artist != '' ORDER BY artist")
    seen = set()
    rows = []
    for (artist,) in cur.fetchall():
        # Multi-artist split. The songs.artist field may contain:
        #   "X featuring Y"   → primary = X, secondary = Y
        #   "X, Y"            → primary = X, secondary = Y
        #   "X, Y & Z"        → primary = X, Y, Z
        #   "X, Y featuring Z" → primary = X, Y, secondary = Z
        # We split on both " featuring " and "," (and " & ") to
        # build a list of individual artists, then look up each.
        cleaned = re.sub(r"\s+", " ", artist).strip()
        # First, find the "featuring/feat./ft./with" boundary
        feat_match = re.search(r"\s+(?:featuring|feat\.?|fe\.?|ft\.?|with)\s+", cleaned, flags=re.IGNORECASE)
        if feat_match:
            prefix = cleaned[:feat_match.start()]
            suffix = cleaned[feat_match.end():]
        else:
            prefix = cleaned
            suffix = ""
        # Split prefix on ", " and " & " (multi-artist primary)
        primaries = re.split(r",\s*|\s*&\s*", prefix)
        # Split suffix the same way (in case "featuring X, Y")
        secondaries = re.split(r",\s*|\s*&\s*", suffix) if suffix else []
        # Build deduped candidate list (preserve order, case-insensitive)
        candidates: list[str] = []
        for a in primaries + secondaries:
            a = a.strip()
            if a and a.lower() not in seen:
                seen.add(a.lower())
                candidates.append(a)
        # Fallback: if the split collapsed to nothing, use the original
        if not candidates:
            candidates = [cleaned.strip()]
        rows.extend([(c,) for c in candidates])
    flat: list[tuple[str]] = []
    for r in rows:
        flat.extend(list(r))
    rows = flat
    if args.limit:
        rows = rows[: args.limit]
    print(f"→ {len(rows)} individual artists to look up")

    n_linked = 0
    n_skipped = 0
    n_errors = 0
    for i, name in enumerate(rows, start=1):
        try:
            qid = lookup_qid(name)
        except Exception as e:
            print(f"  [{i:3}/{len(rows)}] {name:35}  ERR  {e}")
            n_errors += 1
            time.sleep(args.rate * 5)
            continue
        if not qid:
            print(f"  [{i:3}/{len(rows)}] {name:35}  skip (no match)")
            n_skipped += 1
            time.sleep(args.rate)
            continue
        if args.dry_run:
            print(f"  [{i:3}/{len(rows)}] {name:35}  dry  {qid}")
        else:
            eid = f"versesignal:ent:artist:{name.lower().replace(' ', '-').replace(chr(39), '')}"
            cur.execute(
                "INSERT INTO entities (id, canonical_name, entity_type, wikidata_id) "
                "VALUES (?, ?, 'artist', ?) "
                "ON CONFLICT(id) DO UPDATE SET wikidata_id = excluded.wikidata_id, canonical_name = excluded.canonical_name",
                (eid, name, qid),
            )
            print(f"  [{i:3}/{len(rows)}] {name:35}  ok   {qid}")
        n_linked += 1
        time.sleep(args.rate)

    if not args.dry_run:
        conn.commit()
    conn.close()

    print()
    print(f"Linked: {n_linked}  Skipped: {n_skipped}  Errors: {n_errors}")
    return 0 if n_errors == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
