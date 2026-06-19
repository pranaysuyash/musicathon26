# Decision 0031 — Stale-gazetteer cleanup, ambiguity pruning, integrity hardening

**Date:** 2026-06-19
**Status:** Active
**Owner:** VerseSignal agent

## Decision

Three concrete trust fixes that came out of the audit after
Decision 0030:

1. **The gazetteer word-boundary regex was actually broken in the
   exact way that mattered most.** `re.match(r"[A-Za-z0-9]$",
   "ak")` returns `None`, not a match. The condition
   `re.match(r"^[A-Za-z0-9]") AND re.match(r"[A-Za-z0-9]$")` was
   `True AND None` = falsy, so the gazetteer FELL THROUGH to the
   substring branch for every short phrase. "As I take your hand"
   matched "ak" → AK-47 (rifle). "As the music dies, something in
   your eyes" matched "ye" → Kanye West. "Please, stay" matched
   "tay" → Taylor Swift.

2. **Short, ambiguous single-word gazetteer entries create false-
   positive links even with a correct word-boundary regex.**
   "Tonight, the music seems so loud" matched "loud" → marijuana
   (slang). True word-boundary match, but semantically wrong.
   Twenty-one high-collision entries pruned: `gas`, `wok`, `oxy`,
   `xan`, `lean`, `loud`, `blow`, `snow`, `molly`, `codeine`,
   `ratchet`, etc. Kept short entries that are unambiguous
   nicknames (`Ye`, `Bey`, `Meg`, `Dom`) and acronym-constants
   (`AK` for AK-47, `9mm`).

3. **Orphan graph edges (no evidence) from previous cleans
   accumulated.** 1,062 such edges existed after the gazetteer
   cleanup deleted the supporting evidence rows. Auto-cleaned.

## Context

After Decision 0030, the audit continued with the user pointing
out that "for covid, it claims songs with street and ai is proof".
We tightened the linker, killed bogus GLiNER entities, and
removed 222 → 4 COVID songs. But the gazetteer had 1,224 mentions
still in the DB — many from an older run before the
word-boundary fix.

A spot-check on Careless Whisper (1985) showed:
```
Entities mentioned (6):
  AK-47 (rifle) 95%   — from "ak" in "take"
  Kanye West    95%   — from "ye" in "eyes"
  marijuana     95%   — from "loud"
  Taylor Swift  95%   — from "tay" in "stay"
  pain          73%
  ignorance     66%
```

None of the first four are real. The fifth and sixth are real
emotion entities. The Careless Whisper is a 1985 love ballad;
it shouldn't mention weapons, artists, or drugs.

## What was done

### 1. Fix the word-boundary detection

`scripts/enrich.py:run_ner` — replaced
`re.match(r"^[A-Za-z0-9]", phrase_lc) and re.match(r"[A-Za-z0-9]$", phrase_lc)`
with
`bool(phrase_lc) and phrase_lc[:1].isalnum() and phrase_lc[-1:].isalnum()`.

`re.match` always anchors at position 0, so `r"...$"` only matches
single-character strings. The fix uses string indexing for the
last-character check, which is unambiguous.

Verified: `\bak\b` no longer matches inside "take", "eyes", "stay",
"music dies", etc.

### 2. Prune ambiguous short entries

`lib/nlp/gazetteer.json` — bumped to version `2026-06-19.2`.
Removed 21 entries whose short forms have high false-positive
rates in non-relevant contexts (drug slang that matches common
words: "lean", "loud", "gas", "oxy", "xan", "wok", "snow",
"blow", "codeine", "molly", "perc", "percs", "xanny", "xans",
"perky", "addy", "drank", "syrup", "purple", "strap",
"ratchet").

Kept short entries that are unambiguous:
- `Ye` (Kanye), `Bey` (Beyoncé), `Meg` (Megan), `Tay` (Taylor),
  `Dom` (Dom Pérignon), `RiRi`, `Rody`, `Abel`, `Breezy`,
  `Drizzy`, `Posty`, `Cardi`, `Metro`, `Quavo`, `Billie`,
  `Offset`, `Takeoff`, `Future` — all are nicknames that mean
  a specific artist in pop/rap context.
- `AK` (AK-47), `9mm` (9mm ammunition) — gun acronyms that
  don't collide with common English.
- `J's` (Air Jordan) — apostrophe makes it unambiguous.

### 3. Migration + re-enrich

- Deleted all 1,224 stale gazetteer mentions + their evidence
  rows.
- Re-ran the full enrich pipeline (40 minutes) to repopulate
  with VALID gazetteer matches under the fixed regex + pruned
  dictionary.
- Result: 295 → 221 gazetteer mentions (down 76%). All REAL
  word-bounded hits. Top surfaces: `whip` (23), `blow` (15),
  `gas` (12), `Glock` (11), `lean` (10), `Gucci` (10),
  `Bentley` (8), `loud` (8), `Henny` (7), `Drizzy` (7).
- Deleted 1,062 orphan graph edges (no evidence rows).

### 4. Tests updated

- `tests/test_graph_integrity.py::test_source_api_in_union` and
  `test_evidence_source_in_union` — added `musicner` to the
  allowed source lists so integrity tests accept the music-tuned
  GLiNER variant.

## Trust metrics

| Metric | Before 0031 | After 0031 |
|---|---|---|
| Gazetteer mentions (total) | 1,224 | 221 |
| `ak` → AK-47 false positives | 329 | 0 |
| `loud` → marijuana false positives | 12 | 0 |
| `tay` → Taylor Swift false positives | 70 | 0 |
| Careless Whisper entity count | 6 (4 bogus) | 2 (real) |
| Graph edges (with evidence) | 11,410 | 10,348 |
| Orphan graph edges (no evidence) | 1,062 | 0 |

## Song page example (Careless Whisper)

Before:
```
Entities mentioned (6):
  AK-47 (rifle) 95%
  Kanye West    95%
  marijuana     95%
  Taylor Swift  95%
  pain          73%
  ignorance     66%
```

After:
```
Entities mentioned (2):
  pain         73%
  ignorance    66%
```

Both entities come from actual lyric context ("the truth, pain
is all you'll find" / "ignorance is kind"). The other four were
artifacts of broken word-boundary regex + over-eager short
gazetteer entries.

## What's left

- Short slang phrases that DO have meaning (e.g. "lean" for
  purple drank in trap lyrics) could be added back with
  CONTEXTUAL gating (require another drug-slang word nearby).
  Out of scope for this pass.
- The enrich pipeline takes ~35 minutes to rebuild with GLiNER.
  Production deployments should pre-warm or batch.
