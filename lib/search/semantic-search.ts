import { spawn } from "node:child_process";
import path from "node:path";
import { initDb } from "@/lib/db";
import { all } from "@/lib/db/sql";
import { cosine } from "@/lib/math/vector";

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

async function embedQueryWithPython(q: string): Promise<Float32Array | null> {
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

export interface SemanticSearchResult {
  songId: string;
  title: string;
  artist: string;
  year: number;
  region: string;
  similarity: number;
}

export interface SemanticSearchResponse {
  query: string;
  top: number;
  region: string;
  minYear: number | null;
  maxYear: number | null;
  resultCount: number;
  results: SemanticSearchResult[];
}

export interface SemanticSearchError {
  error: string;
  message: string;
}

export async function searchSongsByFeel({
  q,
  top = 8,
  region = "US",
  minYear = null,
  maxYear = null,
}: {
  q: string;
  top?: number;
  region?: string;
  minYear?: number | null;
  maxYear?: number | null;
}): Promise<SemanticSearchResponse | SemanticSearchError> {
  const text = q.trim();
  if (!text) {
    return { error: "missing required query parameter `q`", message: "Query is required." };
  }
  if (text.length > 2000) {
    return { error: "query `q` must be ≤2000 chars (semantic search runs server-side)", message: "Query too long." };
  }

  initDb();

  const qVec = await embedQueryWithPython(text);
  if (!qVec || qVec.length === 0) {
    return {
      error: "embedder_unavailable",
      message:
        "semantic-search needs the Python sentence-transformers embedder. Ensure .venv has sentence-transformers installed and scripts/embed-query.py is present.",
    };
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
    .slice(0, Math.max(1, Math.min(MAX_TOP, top)));

  return {
    query: text,
    top,
    region,
    minYear,
    maxYear,
    resultCount: scored.length,
    results: scored,
  };
}
