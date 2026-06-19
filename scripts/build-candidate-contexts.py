#!/usr/bin/env python3
"""Build candidate_contexts: per-cluster human-readable explanations.

For each signal_cluster, generates an explanation grounded in:
  - Cultural posture of cluster songs vs year events
  - Comparative lift vs year signal baseline
  - Cross-year pattern (persistent / emergent / cyclic / transient)
  - Event context (categories, descriptions)

Usage:
  uv run scripts/build-candidate-contexts.py
"""

import sqlite3
import json
import re
import sys
from pathlib import Path
from datetime import datetime, timezone

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "versesignal.db"


def get_db() -> sqlite3.Connection:
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode = WAL")
    return db


def signal_key(s: dict) -> str:
    return f"{s['type']}:{s['signal']}"


def signals_overlap(a: list, b: list, min_shared: int = 2) -> bool:
    """Check if two signal lists share at least min_shared signals."""
    keys_a = {signal_key(s) for s in a}
    keys_b = {signal_key(s) for s in b}
    return len(keys_a & keys_b) >= min_shared


def build_id(cluster_id: str) -> str:
    return f"versesignal:ctx:{cluster_id}"


def get_event_label(events: list) -> str:
    """Create a short human label from events."""
    if not events:
        return "no tracked events"
    labels = []
    for ev in events:
        name = ev["name"]
        if len(name) > 40:
            name = name[:38] + "..."
        labels.append(name)
    if len(labels) <= 2:
        return " and ".join(labels)
    return ", ".join(labels[:-1]) + ", and " + labels[-1]


def get_event_description(events: list) -> str:
    """Short description of event categories."""
    if not events:
        return "a period with no tracked cultural events"
    cats = [ev["category"] for ev in events]
    unique_cats = list(dict.fromkeys(cats))
    if len(unique_cats) == 1:
        cat_names = {"pandemic": "a global health crisis",
                     "war": "geopolitical conflict",
                     "social": "social movements",
                     "political": "political upheaval",
                     "economic": "economic disruption",
                     "tech": "technological shifts",
                     "cultural": "cultural phenomena",
                     "natural_disaster": "environmental crisis"}
        return cat_names.get(unique_cats[0], unique_cats[0])
    return f"a period shaped by {', '.join(unique_cats)} forces"


def classify_cross_year(cluster: dict, all_clusters: list) -> tuple:
    """Determine cross-year pattern and return (type, evidence)."""
    year = cluster["year"]
    signals = json.loads(cluster["signals_json"]) if isinstance(cluster["signals_json"], str) else cluster["signals_json"]
    
    # Look for similar clusters in +-1 and +-2 years
    found_adjacent = False
    found_distant = False
    adj_years = []
    dist_years = []
    
    for other in all_clusters:
        oy = other["year"]
        if oy == year:
            continue
        o_signals = json.loads(other["signals_json"]) if isinstance(other["signals_json"], str) else other["signals_json"]
        if signals_overlap(signals, o_signals):
            if abs(oy - year) == 1:
                found_adjacent = True
                adj_years.append(oy)
            elif abs(oy - year) <= 3:
                found_distant = True
                dist_years.append(oy)
    
    if found_adjacent:
        return ("persistent", f"Similar cluster found in {', '.join(str(y) for y in sorted(adj_years))}")
    elif found_distant:
        return ("cyclic", f"Similar cluster found in {', '.join(str(y) for y in sorted(dist_years))} (not adjacent)")
    elif cluster["song_count"] >= 10:
        return ("emergent", f"This cluster first appears in {year}")
    else:
        return ("transient", "Small cluster limited to this year")


def compute_lift(signals: list, profiles_by_key: dict) -> list:
    """For each signal, compute lift (cluster_weight / year_baseline)."""
    results = []
    for s in signals:
        key = f"{s['type']}:{s['signal']}"
        baseline = profiles_by_key.get(key, {}).get("score", None)
        lift = None
        if baseline is not None and baseline > 0:
            # cluster weight is song_count, baseline is score
            lift = s["weight"] / baseline
        results.append({
            "type": s["type"],
            "signal": s["signal"],
            "cluster_weight": s["weight"],
            "year_baseline": baseline,
            "lift": lift,
        })
    return results


def build_explanation(cluster: dict, events: list, posture_dist: dict,
                      cross_year_type: str, lifts: list) -> tuple:
    """Generate human-readable explanation from data.
    
    Returns (explanation, explanation_short)
    """
    year = cluster["year"]
    signals = json.loads(cluster["signals_json"]) if isinstance(cluster["signals_json"], str) else cluster["signals_json"]
    
    mood_signals = [s for s in signals if s["type"] == "mood"]
    entity_signals = [s for s in signals if s["type"] == "entity"]
    theme_signals = [s for s in signals if s["type"] == "theme"]
    
    top_moods = sorted(mood_signals, key=lambda x: x["weight"], reverse=True)[:3]
    top_entities = sorted(entity_signals, key=lambda x: x["weight"], reverse=True)[:3]
    
    mood_labels = [s["signal"] for s in top_moods] or ["varied moods"]
    entity_labels = [s["signal"] for s in top_entities] or ["varied entities"]
    
    # Determine dominant signal type pattern
    if len(mood_signals) >= 3 and len(mood_signals) >= len(entity_signals):
        signal_type_desc = f"moods like {', '.join(mood_labels[:2])}"
    elif entity_labels:
        signal_type_desc = f"entities like {', '.join(entity_labels[:2])}"
    else:
        signal_type_desc = f"signals like {', '.join(mood_labels[:2])}" if mood_labels else "varied signals"
    
    # Determine dominant posture
    if not posture_dist:
        dominant = None
    else:
        dominant = max(posture_dist, key=posture_dist.get)
    
    event_label = get_event_label(events)
    event_desc = get_event_description(events)
    
    # Build lift description
    high_lift = [l for l in lifts if l["lift"] is not None and l["lift"] > 2.0]
    lift_note = ""
    if high_lift:
        high_names = [f'"{l["signal"]}"' for l in high_lift[:2]]
        lift_note = f" {', '.join(high_names)} {'are' if len(high_names) == 1 else 'is'} unusually prominent in this cluster (≥2x the year baseline)."
    
    # Cross-year note
    cy_notes = {
        "persistent": "This is a persistent pattern across multiple years, suggesting a durable cultural undercurrent.",
        "emergent": f"This cluster emerged in {year}, signaling a shift in the cultural conversation.",
        "cyclic": "This cluster reappears under certain cultural conditions, suggesting a recurring response pattern.",
        "transient": "This cluster appears to be a transient formation limited to this year.",
    }
    cy_note = cy_notes.get(cross_year_type, "")
    
    # Build explanation based on dominant posture
    if dominant == "escape" and not event_label.startswith("no"):
        explanation = (
            f"In {year}, chart music offered an escape from the weight of {event_desc}. "
            f"This cluster, driven by {signal_type_desc}, provided listeners with a temporary reprieve "
            f"from the cultural gravity of {event_label}. "
            f"The {', '.join(mood_labels)} moods suggest a turn toward emotional self-preservation "
            f"rather than confrontation with the news cycle."
            f"{lift_note} {cy_note}"
        )
        short = (
            f"Escape from {event_label[:50]}: "
            f"{signal_type_desc} music provided a cultural reprieve."
        )
    elif dominant == "reflection":
        explanation = (
            f"In {year}, chart music reflected the cultural moment of {event_desc}. "
            f"This cluster of {signal_type_desc} shows songs engaging with the atmosphere of {event_label}, "
            f"reaching beyond pure entertainment into cultural resonance. "
            f"The {', '.join(mood_labels)} moods suggest listeners were in a contemplative rather than escapist mode."
            f"{lift_note} {cy_note}"
        )
        short = (
            f"Reflection on {event_label[:50]}: "
            f"{signal_type_desc} music mirrored the cultural mood."
        )
    elif dominant == "coincidence":
        explanation = (
            f"In {year}, this cluster of {signal_type_desc} coincided with — but did not directly respond to — "
            f"{event_desc}. The songs ran on their own commercial and artistic momentum, "
            f"independent of {event_label}. "
            f"The {', '.join(mood_labels)} moods reflect industry trends rather than external events."
            f"{lift_note} {cy_note}"
        )
        short = (
            f"Coincidence with {event_label[:50]}: "
            f"{signal_type_desc} music followed its own momentum."
        )
    elif dominant == "processing":
        explanation = (
            f"In {year}, chart music was processing the feelings around {event_desc}. "
            f"This cluster of {signal_type_desc} shows listeners working through the emotions of {event_label}, "
            f"neither fully escaping nor directly confronting the moment. "
            f"The {', '.join(mood_labels)} moods suggest a culture in mid-processing, "
            f"not yet ready to reflect but unable to look away."
            f"{lift_note} {cy_note}"
        )
        short = (
            f"Processing {event_label[:50]}: "
            f"{signal_type_desc} music worked through cultural emotions."
        )
    else:
        # No events or no posture data
        if not events:
            explanation = (
                f"In {year}, a year without overlapping curated events, the chart ran on its own momentum. "
                f"This cluster of {signal_type_desc} shows the {', '.join(mood_labels)} moods that "
                f"dominated pop without an external cultural pressure. "
                f"Comparing it to surrounding years, this is a relative baseline — the year music "
                f"was just being music, not cultural commentary. "
                f"Listen for the mood signature (energetic + romantic + tense) that anchors a year "
                f"of pure chart culture."
                f"{lift_note} {cy_note}"
            )
            short = (
                f"{year} baseline year: {', '.join(mood_labels[:2])} defined a year of chart momentum."
            )
        else:
            # Fallback
            explanation = (
                f"In {year}, this cluster of {signal_type_desc} appeared in chart music "
                f"during {event_desc}. The {', '.join(mood_labels)} moods "
                f"capture something about the cultural moment of {event_label}."
                f"{lift_note} {cy_note}"
            )
            short = f"Cluster in {year}: {signal_type_desc} signals during {event_label[:40]}."
    
    return explanation, short


def main():
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    
    # Load all clusters
    clusters = db.execute("SELECT * FROM signal_clusters ORDER BY year").fetchall()
    all_clusters = [dict(r) for r in clusters]
    print(f"Loaded {len(all_clusters)} clusters")
    
    # Pre-load year signal profiles for baseline comparisons
    profiles = db.execute("SELECT year, signal_type, signal, score FROM year_signal_profiles").fetchall()
    profiles_by_year: dict = {}
    for p in profiles:
        key = f"{p['year']}:{p['signal_type']}:{p['signal']}"
        profiles_by_year[key] = {"score": p["score"]}
    
    # Pre-load events
    events_raw = db.execute("SELECT * FROM events ORDER BY start_date").fetchall()
    events_by_year: dict = {}
    for ev in events_raw:
        year = int(ev["start_date"][:4])
        if year not in events_by_year:
            events_by_year[year] = []
        events_by_year[year].append(dict(ev))
    
    # Pre-load cultural_posture for quick lookups
    posture_rows = db.execute("""
        SELECT cp.song_id, cp.event_id, cp.posture, e.start_date
        FROM cultural_posture cp
        JOIN events e ON cp.event_id = e.id
    """).fetchall()
    # Index by song_id -> list of (posture, event_year)
    posture_by_song: dict = {}
    for pr in posture_rows:
        sid = pr["song_id"]
        ey = int(pr["start_date"][:4])
        if sid not in posture_by_song:
            posture_by_song[sid] = []
        posture_by_song[sid].append((pr["posture"], ey))
    
    # Clear and rebuild
    db.execute("DELETE FROM candidate_contexts")
    
    built = 0
    for cl in all_clusters:
        year = cl["year"]
        signals = json.loads(cl["signals_json"]) if isinstance(cl["signals_json"], str) else cl["signals_json"]
        song_ids = json.loads(cl["song_ids_json"]) if isinstance(cl["song_ids_json"], str) and cl["song_ids_json"] else []
        
        # Get events for this year
        events = events_by_year.get(year, [])
        
        # Get posture distribution for cluster songs matched to year events
        posture_dist = {}
        for sid in song_ids:
            if sid in posture_by_song:
                for posture, ey in posture_by_song[sid]:
                    if ey == year:
                        posture_dist[posture] = posture_dist.get(posture, 0) + 1
        
        # Get year baseline for each signal
        profiles_for_year = {}
        for s in signals:
            pkey = f"{year}:{s['type']}:{s['signal']}"
            if pkey in profiles_by_year:
                profiles_for_year[signal_key(s)] = profiles_by_year[pkey]
        
        # Compute lifts
        lifts = compute_lift(signals, profiles_for_year)
        
        # Classify cross-year pattern
        cross_type, cross_evidence = classify_cross_year(cl, all_clusters)
        
        # Generate explanation
        explanation, short = build_explanation(cl, events, posture_dist, cross_type, lifts)
        
        # Build posture distribution JSON
        posture_json = json.dumps(posture_dist) if posture_dist else None
        
        # Build trigger events JSON
        trigger_event_ids = [ev["id"] for ev in events]
        trigger_json = json.dumps(trigger_event_ids) if trigger_event_ids else None
        
        # Build comparative signals JSON
        comp_json = json.dumps(lifts) if lifts else None
        
        # Determine confidence based on available data
        confidence = 0.5
        if posture_dist:
            confidence += 0.2  # Has posture data
        if events:
            confidence += 0.1  # Has events
        if cross_type != "transient":
            confidence += 0.1  # Has cross-year support
        if len(song_ids) >= 10:
            confidence += 0.1  # Large cluster
        
        ctx_id = build_id(cl["id"])
        
        db.execute("""
            INSERT INTO candidate_contexts
                (id, cluster_id, year, region, explanation, explanation_short,
                 dominant_posture, posture_distribution_json, trigger_event_ids_json,
                 cross_year_type, cross_year_evidence, comparative_signals_json,
                 evidence, confidence, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ctx_id, cl["id"], year, cl["region"],
            explanation, short,
            max(posture_dist, key=posture_dist.get) if posture_dist else None,
            posture_json, trigger_json,
            cross_type, cross_evidence, comp_json,
            f"Generated from {len(song_ids)} songs, {len(events)} events, {len(signals)} signals",
            round(min(confidence, 1.0), 2),
            now,
        ))
        built += 1
        if built <= 5 or built % 2 == 0:
            print(f"  [{built}] Year {year}: {short[:70]}...")
    
    db.commit()
    print(f"\nBuilt {built} candidate_contexts")
    
    # Show summary by year
    print("\n=== Summary ===")
    for r in db.execute(
        "SELECT year, dominant_posture, cross_year_type, COUNT(*) as cnt "
        "FROM candidate_contexts GROUP BY year, dominant_posture, cross_year_type ORDER BY year"
    ):
        print(f"  {r['year']}: {r['dominant_posture'] or 'N/A'} ({r['cross_year_type']}) × {r['cnt']}")


if __name__ == "__main__":
    main()
