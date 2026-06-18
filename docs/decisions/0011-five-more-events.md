# Decision 0011 — Five additional curated events (P9.1)

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Five additional curated world events were added to the
`events` table, bringing the total from 10 to 15. The 6-year
demo window (2018–2023) had several cultural moments that
weren't represented in the original 10.

## Context

The original 10 events (decision 0004) covered:
COVID-19, BLM, US 2020 Election, economic recession, Roe v Wade,
Queen Elizabeth's death, vaccine rollout, climate crisis, MeToo,
Ukraine war.

Gaps the demo missed:
- The 2018 **streaming era** inflection (Spotify IPO,
  April 2018) — the moment the industry re-oriented around
  playlists and monthly listeners. Lyrics about streaming,
  playlists, and royalty economics are common in 2018+ pop.
- The **Capitol riot** (2021-01-06) — short intense political
  moment. 2021 chart songs frequently reference the broader
  political tension.
- The **AI boom** (ChatGPT launch, 2022-11-30) — a 2022-2023
  cultural moment that affected lyrics about technology,
  automation, and AI.
- The **Taylor Swift Eras Tour** (2023-03-17 onward) — the
  highest-grossing tour in history; a 2023 cultural
  phenomenon.
- **Barbenheimer** (2023-07-21) — Greta Gerwig's Barbie +
  Nolan's Oppenheimer; a viral 2023 summer moment with
  measurable effect on lyrics themes (identity, plastic, etc.).

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Stay at 10 events | No additional work | Demo misses major 2018-2023 cultural moments | Rejected |
| Add 5 events (chosen) | Right balance; covers gaps without bloat | Adds maintenance surface (5 more entries to keep current) | **Chosen** |
| Add 10+ events | Full coverage | Per 0.13: expands scope; not justified by demo value | Rejected |

## Chosen path

Five new events inserted directly into the `events` table:

| ID | Name | Window | Category | Related themes |
|---|---|---|---|---|
| `versesignal:ev:streaming_era_spotify_ipo` | Spotify IPO / Streaming Era | 2018-04-03 → ongoing | tech | fame, money_status, technology |
| `versesignal:ev:capitol_riot` | US Capitol Riot | 2021-01-06 → 2021-01-20 | political | protest, social_unrest, national_pride, violence |
| `versesignal:ev:ai_boom_chatgpt` | AI Boom (ChatGPT launch) | 2022-11-30 → 2023-12-31 | tech | technology, identity, hope, loneliness |
| `versesignal:ev:taylor_swift_eras_tour` | Taylor Swift Eras Tour | 2023-03-17 → 2023-12-08 | cultural | fame, love, home, nostalgia, identity |
| `versesignal:ev:barbie_movie` | Barbenheimer Summer (Barbie) | 2023-07-21 → 2023-08-30 | cultural | identity, love, home, fame, escape_party |

Each event has:
- `keywords_json` — surface terms the lexical matcher will pick up
- `related_themes_json` — themes the scoring formula uses
- `category` — picks the right `EVENT_TEMPORAL_WINDOWS` row
- `severity` — 0.7 default

The event-linker was re-run after insertion. Result:
- AI Boom: 42 songs (matches roughly the songs that mention
  "AI", "robot", "machine", etc. in 2022-2023)
- Taylor Swift Eras Tour: 21 songs
- Barbenheimer: 21 songs
- Spotify IPO: 18 songs
- Capitol Riot: 18 songs

## Why this path

- **Coverage:** the 5 events close the most-visible gaps in
  the demo. A user asking "what was 2022 about?" should see
  AI on the year-lens, not just COVID echoes.
- **Per 0.13 (scope control):** 5 is bounded; 10+ would
  expand maintenance without proportional demo value.
- **Per 0.8 (data layer rule):** events are config data;
  this is a metadata change, not a code change.

## Tradeoffs

- **Maintenance.** 5 more events to keep current. The
  `related_themes_json` and `keywords_json` are opinionated
  and may need tuning as new music is added.
- **Curatorial subjectivity.** These events reflect my
  reading of what mattered 2018-2023. A different curator
  might pick differently (e.g., the Hong Kong protests
  vs. the Capitol riot).

## Risks

- **Temporal window edge cases.** The Capitol riot is 14
  days long; with the political window (3mo lead / 6mo
  echo), it pulls in songs from late 2020 too. Verified:
  Capitol Riot links 18 songs, mostly from 2020-2021 —
  reasonable.
- **Wrong category.** I put the AI boom in `tech` (window
  3mo/12mo) but it's arguably `social` or `cultural`. A
  different window could be more accurate. Documented as a
  tuning question; not blocking.

## Validation plan

- [x] All 5 events have sensible song counts (18-42 each)
- [x] Re-run enrich completed in 2 seconds
- [x] TypeScript clean
- [ ] Visual: spot-check 2022-2023 year pages and verify
      AI boom / Eras Tour / Barbenheimer are linked to
      songs that genuinely reference them

## What would cause this decision to be revisited

- User feedback that an event is incorrectly linked to
  too many / too few songs
- The 6-year window expands (then we'd want a more
  systematic event set)
- A future event emerges (e.g., 2024+) that warrants
  inclusion

## Related

- `scripts/schema.sql:events` (table)
- `scripts/enrich.py:link_song_to_event` (linker)
- decision 0004 (per-event-category temporal windows)
- decision 0001 (graph-first product)
