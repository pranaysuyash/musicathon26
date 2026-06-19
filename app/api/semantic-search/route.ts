// Semantic search endpoint — finds songs whose stored embedding is
// closest (cosine similarity) to the lyrics text the caller provides.
//
// Per Decision 0030, the homepage and Ask surfaces are song-led. The
// embeddings already power the `similar_to` graph edges via
// scripts/build-similar-edges.py. This endpoint exposes the same
// embeddings directly so a user (or the Ask page) can ask "find me
// songs that feel like this lyric" and get a real cosine-ranked
// answer instead of a keyword match.
//
// Query params:
//   q          — the lyrics / phrase to embed and search (required)
//   top        — max results to return (default 8, max 25)
//   region     — restrict to a chart region (default "US")
//   minYear    — only songs at or after this year (optional)
//   maxYear    — only songs at or before this year (optional)
//
// Response shape:
//   { query, top, region, minYear, maxYear, resultCount, results: [{ songId, title, artist, year, region, similarity }] }
//
// Strategy: query embedding is computed in Python via the existing
// sentence-transformers pipeline (scripts/enrich.py:init_embedder),
// then this endpoint ranks all stored song embeddings by cosine
// similarity. The model is loaded once per process; the first call
// after server boot takes ~5–15 s (ONNX model load), subsequent
// calls return in <100 ms for the 415-song demo corpus.
//
// If the Python embed bridge is unavailable, the endpoint returns
// 503 with a clear hint; the rest of the API (path, graph, ask)
// is unaffected.
import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { all } from "@/lib/db/sql";
import { cosine } from "@/lib/math/vector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SongEmbedRow {
  id: string;
  title: string;
  artist: string;
  year: number;
  region: string;
  model: string;
  dim: number;
  vector: Buffer;
}

const MAX_TOP = 25;

function unpackVector(blob: Buffer, dim: number): Float32Array | null {
  if (blob.byteLength !== dim * 4) return null;
  const ab = new ArrayBuffer(dim * 4);
  new Uint8Array(ab).set(new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength));
  return new Float32Array(ab);
}

// Bridge to the Python sentence-transformers embedder. We invoke a
// tiny Python helper (scripts/embed-query.py) that loads the model
// once, prints a base64-encoded float32 vector to stdout, and exits.
// If the bridge fails (model missing, torch missing, etc.), the
// caller falls through to the 503 path.
async function embedQueryWithPython(q: string): Promise<Float32Array | null> {
  const { spawn } = await import("node:child_process");
  const path = await import("node:path");
  const script = path.join(process.cwd(), "scripts", "embed-query.py");
  return await new Promise((resolve) => {
    const proc = spawn(".venv/bin/python", [script, q], { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (d) => out.push(d as Buffer));
    proc.stderr.on("data", (d) => err.push(d as Buffer));
    proc.on("close", (code) => {
      if (code !== 0) {
        console.warn(`[semantic-search] embed bridge exit ${code}: ${Buffer.concat(err).toString()}`);
        resolve(null);
        return;
      }
      try {
        const b64 = Buffer.concat(out).toString("utf8").trim();
        const bin = Buffer.from(b64, "base64");
        const f32 = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
        resolve(new Float32Array(f32));
      } catch (err) {
        console.warn(`[semantic-search] embed bridge parse error: ${(err as Error).message}`);
        resolve(null);
      }
    });
    proc.on("error", (err) => {
      console.warn(`[semantic-search] embed bridge spawn error: ${err.message}`);
      resolve(null);
    });
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const top = Math.max(
    1,
    Math.min(MAX_TOP, Number(url.searchParams.get("top") ?? "8") || 8),
  );
  const region = url.searchParams.get("region") ?? "US";
  const minYearRaw = url.searchParams.get("minYear");
  const maxYearRaw = url.searchParams.get("maxYear");
  const minYear = minYearRaw ? Number(minYearRaw) : null;
  const maxYear = maxYearRaw ? Number(maxYearRaw) : null;

  if (!q) {
    return NextResponse.json(
      { error: "missing required query parameter `q`" },
      { status: 400 },
    );
  }
  if (q.length > 2000) {
    return NextResponse.json(
      { error: "query `q` must be ≤2000 chars (semantic search runs server-side)" },
      { status: 413 },
    );
  }

  initDb();

  const qVec = await embedQueryWithPython(q);
  if (!qVec || qVec.length === 0) {
    return NextResponse.json(
      {
        error: "embedder_unavailable",
        message:
          "semantic-search needs the Python sentence-transformers embedder. Ensure .venv has sentence-transformers installed and scripts/embed-query.py is present.",
      },
      { status: 503 },
    );
  }

  const params: unknown[] = [region];
  let yearFilter = "";
  if (minYear !== null) {
    yearFilter += " AND s.year >= ?";
    params.push(minYear);
  }
  if (maxYear !== null) {
    yearFilter += " AND s.year <= ?";
    params.push(maxYear);
  }
  const rows = all<SongEmbedRow>(
    `SELECT s.id, s.title, s.artist, s.year, s.region, e.model, e.dim, e.vector
       FROM embeddings e
       JOIN songs s ON s.id = e.target_id
      WHERE e.target_type = 'song'
        AND s.region = ?${yearFilter}`,
    ...params,
  );

  const scored = rows
    .map((r) => {
      const vec = unpackVector(r.vector, r.dim);
      if (!vec || vec.length !== qVec.length) return null;
      const sim = cosine(qVec, vec);
      return {
        songId: r.id,
        title: r.title,
        artist: r.artist,
        year: r.year,
        region: r.region,
        similarity: Number(sim.toFixed(4)),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, top);

  return NextResponse.json(
    {
      query: q,
      top,
      region,
      minYear,
      maxYear,
      resultCount: scored.length,
      results: scored,
    },
    { status: 200 },
  );
}
