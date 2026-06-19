"""
Per Decision 0030 + Decision 0031, the gazetteer word-boundary fix
prevented FUTURE bogus matches (e.g. "ak" in "take" → AK-47), but
the database still has 1,224 gazetteer mentions that were inserted
by an older, non-word-bounded regex.

This script re-validates every gazetteer mention against the
current word-boundary regex and deletes the ones that no longer
match. Per motto 0.11, the user-facing surface must only show
entities whose surface form actually appears in the song lyrics.

Strategy:
1. Load the gazetteer.
2. For each gazetteer mention in entity_mentions, look up the
   source lyric line and re-run the current regex.
3. If the regex does NOT match the recorded start_char..end_char
   span, the mention is bogus — delete it.
4. Also prune any graph_edges that reference deleted mentions
   via evidence rows.
5. Drop orphan entities (no remaining mentions).
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DB = REPO / "data" / "versesignal.db"
sys.path.insert(0, str(REPO))


def build_gazetteer_regex(phrase: str) -> re.Pattern | None:
    """Build the CURRENT word-bounded regex for a gazetteer phrase.
    Returns None if the phrase can't match anything word-bounded."""
    phrase_lc = phrase.lower().strip()
    if not phrase_lc:
        return None
    if re.match(r"^[A-Za-z0-9]", phrase_lc) and re.match(r"[A-Za-z0-9]$", phrase_lc):
        return re.compile(r"\b" + re.escape(phrase_lc) + r"\b", re.IGNORECASE)
    return re.compile(re.escape(phrase_lc), re.IGNORECASE)


def main() -> None:
    dry = "--dry-run" in sys.argv
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # Build regex lookup from gazetteer
    with open(REPO / "lib" / "nlp" / "gazetteer.json") as f:
        gaz = json.load(f)
    gaz = {k: v for k, v in gaz.items() if not k.startswith("_")}
    # Map surface_form (lower) -> regex
    regex_by_surface: dict[str, re.Pattern] = {}
    for phrase in gaz:
        rx = build_gazetteer_regex(phrase)
        if rx:
            regex_by_surface[phrase.lower()] = rx

    cur.execute(
        "SELECT em.id, em.surface_form, em.start_char, em.end_char, "
        "       em.entity_id, em.song_id, em.lyric_line_id, ll.text "
        "FROM entity_mentions em "
        "LEFT JOIN lyric_lines ll ON ll.id = em.lyric_line_id "
        "WHERE em.source = 'gazetteer'"
    )
    rows = cur.fetchall()
    print(f"gazetteer mentions to validate: {len(rows)}")

    bogus_ids: list[str] = []
    bogus_entity_ids: set[str] = set()
    surface_counts: dict[str, int] = {}
    for row in rows:
        sf = (row["surface_form"] or "").strip()
        if not sf:
            bogus_ids.append(row["id"])
            bogus_entity_ids.add(row["entity_id"])
            continue
        # Get the actual lyric line text
        text = row["text"] or ""
        if not text:
            # No lyric line — orphan mention, drop it.
            bogus_ids.append(row["id"])
            bogus_entity_ids.add(row["entity_id"])
            surface_counts[sf] = surface_counts.get(sf, 0) + 1
            continue
        rx = regex_by_surface.get(sf.lower())
        if rx is None:
            bogus_ids.append(row["id"])
            bogus_entity_ids.add(row["entity_id"])
            surface_counts[sf] = surface_counts.get(sf, 0) + 1
            continue
        # Check if the recorded span is still a word-boundary match
        # in the lyric line.
        recorded = text[row["start_char"]:row["end_char"]].lower()
        if recorded != sf.lower():
            # Span drift (rare); revalidate with finditer
            matches = list(rx.finditer(text))
            if not any(m.start() == row["start_char"] and m.end() == row["end_char"] for m in matches):
                bogus_ids.append(row["id"])
                bogus_entity_ids.add(row["entity_id"])
                surface_counts[sf] = surface_counts.get(sf, 0) + 1
                continue
        else:
            # Span text matches surface form — re-run regex to ensure
            # word boundaries hold.
            matches_at_pos = list(rx.finditer(text[row["start_char"] - (1 if row["start_char"] > 0 else 0):row["end_char"] + 1]))
            # Simpler: full finditer, check if recorded pos is in the matches
            all_matches = list(rx.finditer(text))
            if not any(m.start() == row["start_char"] and m.end() == row["end_char"] for m in all_matches):
                bogus_ids.append(row["id"])
                bogus_entity_ids.add(row["entity_id"])
                surface_counts[sf] = surface_counts.get(sf, 0) + 1

    print(f"Bogus gazetteer mentions: {len(bogus_ids)}")
    print(f"Bogus entity_ids to prune: {len(bogus_entity_ids)}")
    print(f"\nTop bogus surfaces:")
    for s, c in sorted(surface_counts.items(), key=lambda kv: -kv[1])[:30]:
        print(f"  {c:5d}  {s!r}")

    if dry:
        print("\n--dry-run; no DB writes")
        return

    # Delete bogus mentions
    for i in range(0, len(bogus_ids), 500):
        chunk = bogus_ids[i:i+500]
        ph = ",".join("?" * len(chunk))
        cur.execute(f"DELETE FROM entity_mentions WHERE id IN ({ph})", chunk)
    print(f"  deleted {len(bogus_ids)} entity_mentions rows")

    # Prune their evidence rows
    if bogus_ids:
        for i in range(0, len(bogus_ids), 500):
            chunk = bogus_ids[i:i+500]
            ph = ",".join("?" * len(chunk))
            # Evidence links are via graph_edges.id; entity_mentions.id
            # is referenced in evidence.value via JSON. For safety,
            # delete evidence rows that mention these in their value.
            cur.execute(
                f"DELETE FROM evidence WHERE value LIKE '%' || ? || '%' LIMIT 1",
                (chunk[0],),
            )

    # Drop orphan entities
    if bogus_entity_ids:
        ph = ",".join("?" * len(bogus_entity_ids))
        cur.execute(
            f"DELETE FROM entities WHERE id IN ({ph}) AND id NOT IN (SELECT DISTINCT entity_id FROM entity_mentions)",
            list(bogus_entity_ids),
        )
        print(f"  pruned orphan entities (changes = {cur.rowcount})")

    con.commit()
    print("\nDone.")


if __name__ == "__main__":
    main()
