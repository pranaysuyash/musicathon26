"""
Remove bogus GLiNER / spaCy entity mentions that slipped past the
old permissive extractor.

Per Decision 0030, the user-facing surface must show only entities a
human would recognize as named. Common English words (pronouns,
articles, exclamations, generic nouns) became "entities" with
counts in the hundreds — top-of-list pollution that dragged every
event page's "matched terms" and the lens entity ranking.

This script deletes those mentions and any entity row that becomes
orphaned, in the correct order to keep FK-like references sane.
It also drops the same matched_terms entries from existing graph
edges that were computed from those mentions, so the user-visible
event "proof" stops showing `ai`, `ooh`, `phone` as evidence.

Usage:
  python scripts/migrate-clean-bogus-entities.py [--dry-run]
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
from lib.nlp.stoplist import STOPWORDS, MIN_LENGTH_FOR_GLINER  # noqa: E402

DB = REPO / "data" / "versesignal.db"


def is_bogus_surface(surface: str | None, source: str | None) -> bool:
    if not surface:
        return True
    s = surface.strip()
    if not s:
        return True
    if source == "gazetteer":
        return False  # gazetteer entries are explicitly curated
    if len(s) < MIN_LENGTH_FOR_GLINER:
        return True
    if s.lower() in STOPWORDS:
        return True
    if all(ch.isdigit() for ch in s):
        return True
    return False


def main() -> None:
    dry = "--dry-run" in sys.argv
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # 1. Identify bogus mentions to remove
    cur.execute(
        "SELECT id, surface_form, source, entity_id FROM entity_mentions"
    )
    rows = cur.fetchall()
    bogus_ids: list[str] = []
    bogus_entity_ids: set[str] = set()
    surface_counts: dict[str, int] = {}
    for row in rows:
        sf = row["surface_form"] or ""
        if is_bogus_surface(sf, row["source"]):
            bogus_ids.append(row["id"])
            bogus_entity_ids.add(row["entity_id"])
            surface_counts[sf.lower()] = surface_counts.get(sf.lower(), 0) + 1

    print(f"Bogus mentions to delete: {len(bogus_ids)}")
    print(f"Distinct entity_ids affected: {len(bogus_entity_ids)}")
    print("\nTop bogus surfaces (would have been dropped):")
    for s, c in sorted(surface_counts.items(), key=lambda kv: -kv[1])[:30]:
        print(f"  {c:5d}  {s!r}")

    # 2. Identify graph edges whose matched_terms_json contains only
    # bogus terms and prune those terms from the JSON. If all terms
    # are bogus, drop the edge entirely.
    cur.execute("SELECT id, matched_terms_json FROM graph_edges WHERE matched_terms_json IS NOT NULL")
    edge_rows = cur.fetchall()
    edges_to_delete: list[str] = []
    edges_to_update: list[tuple[str, str]] = []
    for row in edge_rows:
        try:
            terms = json.loads(row["matched_terms_json"])
        except json.JSONDecodeError:
            continue
        if not isinstance(terms, list):
            continue
        keep = [t for t in terms if t and not is_bogus_surface(t, "gliner")]
        if not keep:
            edges_to_delete.append(row["id"])
        elif len(keep) != len(terms):
            edges_to_update.append((row["id"], json.dumps(keep)))

    print(f"\nGraph edges to delete (matched_terms fully bogus): {len(edges_to_delete)}")
    print(f"Graph edges to update (partial term prune):         {len(edges_to_update)}")

    # 3. Identify evidence rows whose edge is being deleted (since
    # matched_terms fully bogus). Keep evidence for edges that are
    # only partially pruned — those still have valid signal.
    edges_to_delete_set = set(edges_to_delete)
    if edges_to_delete_set:
        ph = ",".join("?" * len(edges_to_delete_set))
        cur.execute(
            f"SELECT id FROM evidence WHERE edge_id IN ({ph})",
            list(edges_to_delete_set),
        )
        evidence_to_delete = [r[0] for r in cur.fetchall()]
    else:
        evidence_to_delete = []
    print(f"Evidence rows to delete (edges fully removed): {len(evidence_to_delete)}")

    if dry:
        print("\n--dry-run; no DB writes")
        return

    # Apply changes — order matters: drop evidence first (no FK but
    # principle of least surprise), then prune edge matched_terms,
    # then drop bogus mentions, then drop orphan entities.
    if evidence_to_delete:
        for i in range(0, len(evidence_to_delete), 500):
            chunk = evidence_to_delete[i:i+500]
            ph = ",".join("?" * len(chunk))
            cur.execute(f"DELETE FROM evidence WHERE id IN ({ph})", chunk)
        print(f"  deleted {len(evidence_to_delete)} evidence rows")

    if edges_to_update:
        for eid, mt in edges_to_update:
            cur.execute(
                "UPDATE graph_edges SET matched_terms_json = ? WHERE id = ?",
                (mt, eid),
            )
        print(f"  updated {len(edges_to_update)} graph_edges rows")

    if edges_to_delete:
        for i in range(0, len(edges_to_delete), 500):
            chunk = edges_to_delete[i:i+500]
            ph = ",".join("?" * len(chunk))
            cur.execute(f"DELETE FROM graph_edges WHERE id IN ({ph})", chunk)
        print(f"  deleted {len(edges_to_delete)} graph_edges rows")

    if bogus_ids:
        for i in range(0, len(bogus_ids), 500):
            chunk = bogus_ids[i:i+500]
            ph = ",".join("?" * len(chunk))
            cur.execute(f"DELETE FROM entity_mentions WHERE id IN ({ph})", chunk)
        print(f"  deleted {len(bogus_ids)} entity_mentions rows")

    # Drop orphan entities (no remaining mentions)
    if bogus_entity_ids:
        ph = ",".join("?" * len(bogus_entity_ids))
        cur.execute(
            f"DELETE FROM entities WHERE id IN ({ph}) AND id NOT IN (SELECT DISTINCT entity_id FROM entity_mentions)",
            list(bogus_entity_ids),
        )
        print(f"  pruned orphan entities (count = changes = {cur.rowcount})")

    con.commit()
    con.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
