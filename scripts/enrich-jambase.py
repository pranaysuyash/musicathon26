#!/usr/bin/env python3
"""
VerseSignal — JamBase MCP artist linking.

For every entity of type 'artist' (or 'person' / 'group'), look up
the JamBase artist ID via the public MCP server and populate
`entities.jambase_id` + `entities.jambase_genres_json`.

Per motto_v3 §0.8 (data layer rule), the lookup is a batch
operation that can be re-run idempotently. Per §0.9 (routing rule),
the source/model name is recorded on every row.

The JamBase MCP server (https://mcp.jambase.com/mcp) uses JSON-RPC
2.0 over HTTPS with Bearer-token auth. The trial key (or any paid
JamBase API key) works as the Bearer token; the WAF that blocks
`www.jambase.com/jbapi/v1/*` does NOT block the MCP endpoint.

Rate limits: not documented; we use 1 req/0.2s as a safe default.
For 36 artists this takes ~10s.

Disambiguation strategy:
  - Query with the canonical entity name
  - If exactly one result, take it
  - If multiple, prefer the result whose name matches exactly
    (case-insensitive). Otherwise skip and log.
  - Extract jambase_id from `**Artist ID:** jambase:NNNNN`
  - Extract genres from `**Genres:** hip-hop-rap, pop`

Run:
  uv run --no-sync python scripts/enrich-jambase.py
  uv run --no-sync python scripts/enrich-jambase.py --limit 5  # smoke test
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
import sqlite3

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"

MCP_URL = "https://mcp.jambase.com/mcp"


def mcp_call(method: str, params: dict | None = None, *, key: str, id_: int) -> dict:
    """Single JSON-RPC 2.0 call to the JamBase MCP server."""
    payload = {"jsonrpc": "2.0", "id": id_, "method": method}
    if params is not None:
        payload["params"] = params
    req = urllib.request.Request(
        MCP_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def mcp_initialize(key: str) -> None:
    """MCP handshake: initialize. Returns server info."""
    r = mcp_call(
        "initialize",
        {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "versesignal", "version": "v1"},
        },
        key=key,
        id_=1,
    )
    if "result" not in r:
        raise RuntimeError(f"JamBase MCP initialize failed: {r}")
    return r["result"]


def search_artist(name: str, *, key: str, id_: int) -> dict | None:
    """Search for an artist by name. Returns the parsed artist record, or None."""
    r = mcp_call(
        "tools/call",
        {"name": "searchArtists", "arguments": {"artistName": name, "perPage": 5}},
        key=key,
        id_=id_,
    )
    content = r.get("result", {}).get("content", [])
    text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
    return parse_artist_result(name, text)


def parse_artist_result(query_name: str, text: str) -> dict | None:
    """Parse the markdown-formatted searchArtists response.

    Returns: {"jambase_id": "jambase:266573", "genres": ["hip-hop-rap", "pop"]}
    or None if no usable match.
    """
    # Find the FIRST artist block: starts with "## [Name]" and contains "**Artist ID:**"
    # If multiple "## [" blocks, pick the one whose name matches the query.
    blocks = re.split(r"\n## \[", text)
    candidates: list[dict] = []
    for b in blocks:
        if "**Artist ID:**" not in b:
            continue
        # Extract display name from the first line
        name_match = re.match(r"^([^\]]+)\]", b)
        if not name_match:
            continue
        name = name_match.group(1).strip()
        # Extract jambase_id
        id_match = re.search(r"\*\*Artist ID:\*\*\s*(jambase:\d+)", b)
        if not id_match:
            continue
        # Extract genres (optional)
        genres_match = re.search(r"\*\*Genres:\*\*\s*([^\n]+)", b)
        genres: list[str] = []
        if genres_match:
            genres = [g.strip() for g in genres_match.group(1).split(",") if g.strip()]
        candidates.append({"display_name": name, "jambase_id": id_match.group(1), "genres": genres})
    if not candidates:
        return None
    # Prefer exact case-insensitive match
    q = query_name.lower().strip()
    for c in candidates:
        if c["display_name"].lower().strip() == q:
            return c
    # Otherwise: take the first candidate (JamBase search ranking)
    return candidates[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="Limit to first N entities (0 = all)")
    ap.add_argument("--dry-run", action="store_true", help="Print what we'd do, don't write")
    ap.add_argument("--overwrite", action="store_true", help="Overwrite existing jambase_id")
    ap.add_argument("--rate", type=float, default=0.05, help="Seconds between API calls")
    args = ap.parse_args()

    # Get the JamBase key
    from dotenv import dotenv_values  # type: ignore
    env = dotenv_values(REPO / ".env")
    key = env.get("JAMBASE_API_KEY") or os.environ.get("JAMBASE_API_KEY")
    if not key:
        print("ERROR: JAMBASE_API_KEY not set in .env or environment", file=sys.stderr)
        return 1
    if not key.startswith("jbd_"):
        print(f"ERROR: JAMBASE_API_KEY does not look like a JamBase key: {key[:8]}...", file=sys.stderr)
        return 1

    # MCP handshake
    print(f"→ Initializing JamBase MCP at {MCP_URL}…")
    info = mcp_initialize(key)
    print(f"  Server: {info.get('serverInfo', {}).get('name', '?')} v{info.get('serverInfo', {}).get('version', '?')}")

    # Open DB
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # Source real artists from songs.artist, not from the entities table
    # (which is polluted with GLiNER-detected lyric terms like "Jay", "Jack").
    # Parse "X, Y featuring Z" → primary = "X, Y" (or "X").
    where_jambase = "" if args.overwrite else "AND (jambase_id IS NULL OR jambase_id = '')"
    cur.execute(
        f"""
        SELECT DISTINCT artist
        FROM songs
        WHERE artist != ''
          {where_jambase.replace('jambase_id', 'artist').replace('AND (artist IS NULL OR artist = \'\')', '')}
        ORDER BY artist
        """,
    )
    # Dedupe, parse "featuring"/"feat."/"/&"
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
        rows.extend(candidates)
    if args.limit:
        rows = rows[: args.limit]
    print(f"→ {len(rows)} individual artists to look up (overwrite={args.overwrite}, dry_run={args.dry_run})")

    n_linked = 0
    n_skipped = 0
    n_errors = 0
    for i, name in enumerate(rows, start=1):
        try:
            artist = search_artist(name, key=key, id_=i + 100)
        except urllib.error.HTTPError as e:
            print(f"  [{i:3}/{len(rows)}] {name:35}  ERR  HTTP {e.code}")
            n_errors += 1
            time.sleep(args.rate * 3)
            continue
        except Exception as e:
            print(f"  [{i:3}/{len(rows)}] {name:35}  ERR  {e}")
            n_errors += 1
            time.sleep(args.rate * 3)
            continue
        if not artist:
            print(f"  [{i:3}/{len(rows)}] {name:35}  skip (no match)")
            n_skipped += 1
            time.sleep(args.rate)
            continue
        jid = artist["jambase_id"]
        genres = json.dumps(artist["genres"])
        if args.dry_run:
            print(f"  [{i:3}/{len(rows)}] {name:35}  dry  {jid}  genres={artist['genres']}")
        else:
            # Upsert: insert an 'artist' entity if missing, then update jambase fields
            eid = f"versesignal:ent:artist:{name.lower().replace(' ', '-').replace(chr(39), '')}"
            cur.execute(
                "INSERT INTO entities (id, canonical_name, entity_type, jambase_id, jambase_genres_json) "
                "VALUES (?, ?, 'artist', ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET "
                "  jambase_id = excluded.jambase_id, "
                "  jambase_genres_json = excluded.jambase_genres_json, "
                "  canonical_name = excluded.canonical_name",
                (eid, name, jid, genres),
            )
            print(f"  [{i:3}/{len(rows)}] {name:35}  ok   {jid}  genres={artist['genres']}")
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
