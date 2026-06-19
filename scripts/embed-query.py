#!/usr/bin/env python
"""
Bridge to the sentence-transformers model used by the
/api/semantic-search endpoint. Reads a query from argv[1], prints
the L2-normalized embedding as base64-encoded little-endian float32
to stdout.

The Node route (app/api/semantic-search/route.ts) calls this once
per search request and ranks stored song embeddings by cosine
similarity in-process. Model is loaded once per process and stays
warm across calls.

Usage:
    .venv/bin/python scripts/embed-query.py "I can't sleep until I feel your touch"
"""
from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

VENV = REPO / ".venv"
MODEL_NAME = os.environ.get("VERSE_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")


def main() -> int:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("[embed-query] usage: embed-query.py <text>", file=sys.stderr)
        return 2
    text = sys.argv[1].strip()
    if len(text) > 2000:
        # Route should have rejected earlier, but double-check.
        text = text[:2000]

    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as err:
        print(f"[embed-query] sentence_transformers not installed: {err}", file=sys.stderr)
        return 3

    # Load (cached at process level). On first run this is ~5–10 s.
    import functools

    @functools.lru_cache(maxsize=1)
    def _load():
        return SentenceTransformer(MODEL_NAME)

    model = _load()
    vec = model.encode([text], normalize_embeddings=True)[0]
    payload = base64.b64encode(vec.astype("<f4").tobytes()).decode("ascii")
    sys.stdout.write(payload)
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
