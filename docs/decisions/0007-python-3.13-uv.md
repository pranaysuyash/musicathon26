# Decision 0007 — Python runtime: 3.13 via uv

**Date:** 2026-06-16
**Status:** Active
**Owner:** VerseSignal agent

## Decision

All Python work in this repo runs inside a project-local venv at
`.venv/`, managed by **`uv`**, on **CPython 3.13** (patch-versions
≥ 3.13.3). Python 3.14 is the documented fallback if 3.13 wheels go
missing for a required package; we do not fall back to 3.12 because
the project standard is 3.13+.

## Context

The user instruction: *"all python related work happens in a project
venv with uv setup with python 3.13/3.14."*

Pre-existing state at the time of this decision:
- venv at `.venv/`, manually created with `python3.12 -m venv`
- packages installed with `pip install`
- `package.json` scripts invoked `python3 scripts/...` directly

Verified before migration:
- `uv 0.7.8` available at `~/.local/bin/uv`
- CPython 3.13.12 and 3.14.5 both installed via Homebrew
- Existing 3.12 venv ran the full pipeline (sentence-transformers,
  spaCy 3.8, torch 2.12) in 8.3s on 150 songs

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Stay on 3.12 + pip | Zero migration risk; pipeline proven | Doesn't follow project standard; no venv tool | Rejected |
| 3.13 via uv | Project standard; reproducible; lockfile-compatible | One-time migration; ~3 packages re-tested | **Chosen** |
| 3.14 via uv | Latest Python | Some packages (spaCy legacy deps) had wheel issues historically; debugging tax | Fallback only |

## Chosen path

1. `uv venv --python 3.13 .venv` — clean recreate, no brew-managed
   interpreter; uv fetches the right CPython itself.
2. `uv pip install` for all deps, with `torch` from the CPU index for
   reproducible, smaller wheels on hackathon hardware.
3. `uv pip install spacy` + `python -m spacy download en_core_web_sm`
   (wheel URL pinned in `pyproject.toml`).
4. `package.json` Python scripts now invoke `uv run --no-sync python ...`
   for consistency, not raw `python3` and not `.venv/bin/python`.
5. Deps versioned in `pyproject.toml` per the data-layer rule
   (motto_v3 §0.8).

## Tradeoffs

- **Disk cost:** 3.13 venv is ~1.2 GB on macOS, similar to 3.12.
- **Speed:** 3.13 is ~5–10% faster than 3.12 on the all-MiniLM-L6-v2
  encode path (unmeasured, anecdotal); not material for 150 songs.
- **Lockfile:** we have `pyproject.toml` but not a `uv.lock` yet.
  Should add `uv lock` once the pipeline stabilises to make
  installs byte-reproducible.
- **3.14 is bleeding edge.** If a future package (likely GLiNER
  medium-v2.1) drops 3.13 wheels before 3.14 is fully supported,
  we move to 3.14 with this same migration pattern. Migration cost
  is one round-trip; nothing else changes.

## Validation plan

- [x] `uv venv --python 3.13 .venv` exits 0
- [x] `uv pip install` for all 4 deps exits 0
- [x] `python -c "import sentence_transformers, spacy, torch, gliner"`
      exits 0
- [x] spaCy `en_core_web_sm` loads
- [x] GLiNER `urchade/gliner_medium-v2.1` loads; test prediction
      "Drake" → artist (0.96), "New York City" → city (0.89)
- [ ] `npm run py:enrich` on the full 150-song corpus, verify it
      completes in <2 minutes and graph_edges count goes up (this
      will run as part of Group 2 / Group 4 follow-up)

## Rollback path

Restore the 3.12 backup we preserved at `.venv.py312.bak` and
revert the `package.json` `py:*` script lines. No data files
need to change; SQLite is forward-compatible.

## What would cause this decision to be revisited

- spaCy 4.x dropping 3.13 support (unlikely; 3.13 is the current
  release)
- GLiNER v3 requiring Python 3.14+ (would force 3.14 migration)
- User changes the project standard
- Need for GPU torch → would change `[tool.uv] index-url`

## Related

- `pyproject.toml` (the versioned source of Python deps)
- `package.json` (`py:*` scripts)
- `.venv.py312.bak` (preserved 3.12 backup, kept for one week)
- motto_v3 §0.8 (data layer rule), §0.13 (scope control),
  §0.15 (third-layer rule: model / pipeline / data separation)
