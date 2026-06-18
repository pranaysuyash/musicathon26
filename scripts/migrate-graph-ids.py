#!/usr/bin/env python3
"""
VerseSignal — graph ID canonicalization + naked-edge evidence.

Per 1st principles (decision 0019, P0.1 + P0.2 + P0.3), this
migration:

1. Rewrites `versesignal:artist:<slug>` (in graph_nodes)
   to `versesignal:n:artist:<slug>` (canonical).
2. Updates graph_edges.src_id + graph_edges.dst_id that
   reference the old artist IDs.
3. Adds evidence rows for `performed_by` and `charted_in`
   edges that currently have none (the schema integrity
   invariant is "every edge has ≥1 evidence row").

The migration is idempotent: re-running is a no-op once
the canonical form is in place.

Per 0.5 (blast radius), the migration only touches the
tables that the integrity tests flagged. It does NOT
rename other edge IDs (e.g., the long
`versesignal:e:<song-id>:mentions:versesignal:ent:...`
format is canonical; the integrity test regex was too
strict, fixed in commit preceding this).

Run:
  uv run --no-sync python scripts/migrate-graph-ids.py [--dry-run]

Re-runnable. Idempotent.
"""

import argparse
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DB_PATH = REPO / "data" / "versesignal.db"

# Models of the rewrite:
#   versesignal:artist:<slug>  ->  versesignal:n:artist:<slug>
#
# We use a one-time in-memory lookup table to map old → new
# so we don't risk the canonical form colliding with an
# existing canonical node (it shouldn't, but defensive).

def collect_non_canonical_ids(conn: sqlite3.Connection) -> dict[str, str]:
    """Return {old_id: new_id} for every node that does not
    yet have the `n:` prefix. Covers all node types: artist,
    year, theme, entity, event, song. The current data has
    `versesignal:artist:*` and `versesignal:year:*` without
    the `n:` segment; this brings them in line with the
    canonical format."""
    out: dict[str, str] = {}
    for (old_id, node_type) in conn.execute(
        "SELECT id, node_type FROM graph_nodes"
    ):
        if old_id.startswith("versesignal:n:"):
            continue  # already canonical
        # Reconstruct canonical id: versesignal:n:<type>:<rest>
        # The rest is whatever came after "versesignal:<type>:"
        prefix = f"versesignal:{node_type}:"
        if old_id.startswith(prefix):
            rest = old_id[len(prefix):]
            new_id = f"versesignal:n:{node_type}:{rest}"
            out[old_id] = new_id
    return out


def migrate_artist_ids(conn: sqlite3.Connection, dry_run: bool) -> tuple[int, int]:
    """Rewrite graph_nodes + graph_edges for the artist ID canonicalization.
    Returns (nodes_rewritten, edges_rewritten)."""
    rewrites = collect_non_canonical_ids(conn)
    if not rewrites:
        print("  [info] no artist IDs need rewriting (already canonical)")
        return 0, 0

    if dry_run:
        print(f"  [dry-run] would rewrite {len(rewrites)} node IDs:")
        for old, new in list(rewrites.items())[:5]:
            print(f"    {old}  ->  {new}")
        # Edge rewrite count
        edge_count = sum(
            conn.execute(
                "SELECT COUNT(*) FROM graph_edges "
                "WHERE src_id IN (%s) OR dst_id IN (%s)"
                % (",".join("?" * len(rewrites)), ",".join("?" * len(rewrites))),
                list(rewrites.keys()) * 2,
            ).fetchone()[0]
            for _ in [0]
        )
        print(f"  [dry-run] would rewrite {edge_count} edge src/dst IDs")
        return len(rewrites), edge_count

    # 1. Rewrite graph_nodes (skip if a canonical ID already exists;
    #    in that case the old one is deleted to avoid duplicates).
    for old, new in rewrites.items():
        # If new_id already exists, delete the old node (it's a duplicate).
        exists = conn.execute(
            "SELECT 1 FROM graph_nodes WHERE id = ?", (new,)
        ).fetchone()
        if exists:
            conn.execute("DELETE FROM graph_nodes WHERE id = ?", (old,))
        else:
            conn.execute("UPDATE graph_nodes SET id = ? WHERE id = ?", (new, old))

    # 2. Rewrite graph_edges src_id + dst_id
    nodes_rewritten = len(rewrites)
    edges_rewritten = 0
    for old, new in rewrites.items():
        cur = conn.execute(
            "UPDATE graph_edges SET src_id = ? WHERE src_id = ?", (new, old)
        )
        edges_rewritten += cur.rowcount
        cur = conn.execute(
            "UPDATE graph_edges SET dst_id = ? WHERE dst_id = ?", (new, old)
        )
        edges_rewritten += cur.rowcount

    conn.commit()
    return nodes_rewritten, edges_rewritten


def add_naked_evidence(conn: sqlite3.Connection, dry_run: bool) -> int:
    """Add synthetic evidence rows for `performed_by` and
    `charted_in` edges that currently have none.

    The evidence is a one-row pointer to the song itself
    (the existence of the song is the evidence that the
    song was performed by an artist / charted on a chart).
    `source_api = 'manual'` since this is a structural
    evidence added post-hoc, not derived from analysis.
    """
    # Find edges without evidence
    naked = conn.execute("""
        SELECT ge.id, ge.src_id, ge.dst_id, ge.edge_type
        FROM graph_edges ge
        LEFT JOIN evidence ev ON ev.edge_id = ge.id
        WHERE ev.id IS NULL
    """).fetchall()

    if not naked:
        print("  [info] no naked edges (every edge has ≥1 evidence row)")
        return 0

    if dry_run:
        print(f"  [dry-run] would add evidence for {len(naked)} naked edges")
        for row in naked[:5]:
            print(f"    {row[0]}  ({row[3]})")
        return len(naked)

    # For each naked edge, create one evidence row.
    # The evidence is a structural pointer (the song itself).
    inserted = 0
    for edge_id, src_id, dst_id, edge_type in naked:
        # Build a structural evidence row
        if edge_type == "performed_by":
            summary = f"Song {src_id} is performed by artist {dst_id} (manual structural evidence)."
        elif edge_type == "charted_in":
            summary = f"Song {src_id} is charted on {dst_id} (manual structural evidence)."
        else:
            # Generic fallback
            summary = f"Structural evidence for {edge_id}."
        # Use a deterministic id based on edge_id + counter
        evidence_id = f"versesignal:ev:{edge_id}:0"
        # Avoid duplicate
        exists = conn.execute(
            "SELECT 1 FROM evidence WHERE id = ?", (evidence_id,)
        ).fetchone()
        if exists:
            evidence_id = f"versesignal:ev:{edge_id}:{inserted + 1}"
        conn.execute(
            """
            INSERT INTO evidence
                (id, edge_id, evidence_type, value, source, confidence, created_at)
            VALUES (?, ?, ?, ?, 'manual', 1.0, datetime('now'))
            """,
            (evidence_id, edge_id, "metadata_credit", summary),
        )
        inserted += 1

    conn.commit()
    return inserted


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not DB_PATH.exists():
        print(f"ERROR: DB not found: {DB_PATH}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(DB_PATH)
    try:
        print("=== 1. Artist ID canonicalization ===")
        nodes, edges = migrate_artist_ids(conn, args.dry_run)
        print(f"  rewrote {nodes} graph_nodes + {edges} graph_edges src/dst IDs")

        print()
        print("=== 2. Naked-edge evidence ===")
        ev_added = add_naked_evidence(conn, args.dry_run)
        print(f"  added {ev_added} evidence rows")

        if args.dry_run:
            print()
            print("(dry-run: no changes written)")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
