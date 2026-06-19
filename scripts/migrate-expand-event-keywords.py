"""
Expand event keywords with lyric-friendly vocabulary.

Per Decision 0030 (song-led event confirmation), the linker requires
the song to contain specific event keywords. The original seed lists
were curator-styled (e.g., "social distance", "lockdown") — phrases
that rarely appear in chart-song lyrics.

This migration appends ADDITIONAL keywords — colloquial and lyric-
friendly synonyms that actually appear in chart hits — so the linker
has a richer vocabulary to work with. The seed keywords remain in
place for the curator's intent.

Adds:
  - covid_19: stuck at home, can't go outside, isolation, alone,
    six feet, contactless, drive-by, window, lights on, distant,
    essential, frontline, work from home, wfh, brave, together
    alone, lost year, missed you, video call, facetime
  - blm_2020: i can't breathe, can't breathe, profiling, injustice,
    marching, no justice, ferguson, justice for, racial, equality,
    brutality, peaceful protest
  - ukraine_war: missiles, bombed, refugee, tanks, soldier, pray
    for ukraine, kyiv, kharkiv, mariupol, border, freedom, peace,
    russian, ukrainian, war, invasion
  - recession_covid: lost my job, broke, rent, eviction, stimulus,
    unemployed, bills, layoff, hunger, hungry
  - metoo: me too, harassment, assault, consent, silence, speak,
    survivor, abuse, believe women, predatory, gaslight
  - climate_crisis: wildfire, flood, hurricane, wildfire smoke,
    climate, warming, extinction, planet, polar, drought, sea level
  - roevwade: roe, wade, abortion, choice, my body, choice my body,
    reproductive, women, supreme court, bodily autonomy
  - ai_boom_chatgpt: chatgpt, gpt, openai, robot, machine learning,
    deepfake, automation, midjourney, prompt, algorithm, neural,
    artificial intelligence
  - streaming_era_spotify_ipo: streaming, spotify, playlist, apple
    music, subscribers, monthly listeners, royalty, streams,
    soundcloud, tidal, youtube music
  - taylor_swift_eras_tour: eras tour, swiftie, bejeweled, anti
    hero, midnights, 1989, folklore, evermore, speak now, taylor
    version, re-recorded
  - queen_elizabeth: queen, elizabeth, royal, monarchy, king charles,
    prince, windsor, buckingham, commonwealth, london bridge
  - covid_vaccine: vaccine, vaccinated, pfizer, moderna, booster,
    shot, mandate, mandate, immunity, jab
  - barbie_movie: barbie, barbenheimer, oppenheimer, ken, plastic,
    doll, pink, margot, ryan, greta, barbie girl
  - us_election_2020: election, vote, voting, biden, trump,
    democrat, republican, maga, democracy, ballots, mail-in
  - capitol_riot: capitol, riot, insurrection, january 6, sedition,
    mob, capital building, breach, mob, protest

These keyword expansions only ADD vocabulary — the linker still
requires at least 2 distinct keyword matches in the song lyrics,
keeping the gate tight. We do not loosen the gate; we widen the
dictionary so real matches surface.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DB = REPO / "data" / "versesignal.db"


EXPANSIONS: dict[str, list[str]] = {
    "versesignal:ev:covid_19": [
        "stuck", "stuck at home", "can't go outside", "six feet",
        "contactless", "drive-by", "window", "alone", "isolation",
        "essential", "frontline", "work from home", "wfh", "brave",
        "video call", "facetime", "zoom call", "lockdown", "pandemic",
        "quarantine", "lost year", "missed you", "stay inside",
        "stay home", "social distance", "remote",
    ],
    "versesignal:ev:blm_2020": [
        "i can't breathe", "can't breathe", "profiling", "injustice",
        "marching", "no justice", "no peace", "ferguson", "justice for",
        "racial", "equality", "brutality", "peaceful protest",
        "black lives matter", "blm", "racism", "police", "say their names",
    ],
    "versesignal:ev:us_election_2020": [
        "election", "vote", "voting", "biden", "trump", "democrat",
        "republican", "democracy", "ballots", "mail-in", "maga",
        "campaign", "electoral", "ballot", "capitol",
    ],
    "versesignal:ev:ukraine_war": [
        "missiles", "bombed", "refugee", "tanks", "soldier",
        "kyiv", "kharkiv", "mariupol", "border", "freedom", "peace",
        "russian", "ukrainian", "war", "invasion", "zelensky", "putin",
        "ukraine", "russia", "pray for ukraine",
    ],
    "versesignal:ev:recession_covid": [
        "lost my job", "broke", "rent", "eviction", "stimulus",
        "unemployed", "bills", "layoff", "hunger", "hungry",
        "recession", "unemployment", "lost job", "foreclosure",
    ],
    "versesignal:ev:covid_vaccine": [
        "vaccine", "vaccinated", "pfizer", "moderna", "booster",
        "shot", "mandate", "immunity", "jab", "vaccination",
        "vaccines",
    ],
    "versesignal:ev:metoo": [
        "me too", "harassment", "assault", "consent", "silence",
        "speak", "survivor", "abuse", "believe women", "predatory",
        "gaslight", "metoo",
    ],
    "versesignal:ev:climate_crisis": [
        "wildfire", "flood", "hurricane", "warming", "extinction",
        "planet", "polar", "drought", "sea level", "climate change",
        "climate", "wildfires", "floods", "flooding", "earth", "fire",
        "smoke", "glacier", "green new deal",
    ],
    "versesignal:ev:roevwade": [
        "roe", "wade", "abortion", "choice", "my body", "my choice",
        "reproductive", "women", "supreme court", "bodily autonomy",
        "pro-choice", "pro-life",
    ],
    "versesignal:ev:ai_boom_chatgpt": [
        "chatgpt", "gpt", "openai", "robot", "machine learning",
        "deepfake", "automation", "midjourney", "prompt", "algorithm",
        "neural", "artificial intelligence", "ai", "machine", "bot",
    ],
    "versesignal:ev:streaming_era_spotify_ipo": [
        "streaming", "spotify", "playlist", "apple music", "subscribers",
        "monthly listeners", "royalty", "streams", "soundcloud", "tidal",
        "youtube music", "pandora", "iheart",
    ],
    "versesignal:ev:taylor_swift_eras_tour": [
        "eras tour", "swiftie", "bejeweled", "anti hero", "midnights",
        "1989", "folklore", "evermore", "speak now", "taylor version",
        "re-recorded", "taylor swift", "eras", "concert", "tour",
        "live", "swifties",
    ],
    "versesignal:ev:queen_elizabeth": [
        "queen", "elizabeth", "royal", "monarchy", "king charles",
        "prince", "windsor", "buckingham", "commonwealth",
        "london bridge", "royal family", "princess", "diana",
    ],
    "versesignal:ev:capitol_riot": [
        "capitol", "riot", "insurrection", "january 6", "sedition",
        "mob", "capitol building", "breach", "capital building",
        "trump", "rally", "stop the steal",
    ],
    "versesignal:ev:barbie_movie": [
        "barbie", "barbenheimer", "oppenheimer", "ken", "plastic",
        "doll", "pink", "margot", "ryan", "greta", "barbie girl",
        "barbie world", "hi barbie", "hi ken",
    ],
}


def main() -> None:
    dry = "--dry-run" in sys.argv
    con = sqlite3.connect(DB)
    cur = con.cursor()

    for ev_id, new_keywords in EXPANSIONS.items():
        row = cur.execute("SELECT keywords_json FROM events WHERE id=?", (ev_id,)).fetchone()
        if not row:
            print(f"  MISSING event {ev_id}")
            continue
        existing = json.loads(row[0] or "[]")
        existing_lc = {k.lower() for k in existing}
        added = []
        for k in new_keywords:
            if k.lower() not in existing_lc:
                existing.append(k)
                existing_lc.add(k.lower())
                added.append(k)
        print(f"  {ev_id}: {len(existing) - len(added):3d} -> {len(existing):3d} keywords  (+{len(added)})")
        if not dry:
            cur.execute(
                "UPDATE events SET keywords_json=? WHERE id=?",
                (json.dumps(existing), ev_id),
            )

    if not dry:
        con.commit()
        print("\nCommitted.")
    else:
        print("\n--dry-run; no DB writes")


if __name__ == "__main__":
    main()
