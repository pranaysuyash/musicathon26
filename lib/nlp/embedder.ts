// Server-side sentence-transformers embedder.
//
// Per Decision 0030, the corpus stores song embeddings
// (scripts/enrich.py:init_embedder) and uses them to build
// `similar_to` graph edges (scripts/build-similar-edges.py). This
// module exposes the same model on the Node side so the
// /api/semantic-search endpoint can embed a free-text query and
// rank songs by cosine similarity in real time.
//
// Model: sentence-transformers/all-MiniLM-L6-v2 (384 dims, ~22M
// params, MIT license). The Python ingest writes embeddings as
// little-endian float32 (`struct.pack("<{n}f", ...)`) under
// `embeddings.vector`; this module reads the same layout.
//
// Lazy load: the model is large (~80 MB) and only needed by
// /api/semantic-search. ensureEmbedder() caches a single instance
// across requests so the first call pays the load cost and later
// calls are instant.
//
// If the model can't load (no torch on the host, no network for
// the first download, etc.), the caller catches the error and the
// /api/semantic-search endpoint returns 503 with a clear hint. The
// rest of the API (path, graph, ask) is unaffected.
import type { Pipeline } from "@xenova/transformers";

let cachedModel: any = null;
let cachedDim: number | null = null;
let loadPromise: Promise<{ model: any; dim: number }> | null = null;

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

export async function ensureEmbedder(): Promise<any> {
  if (cachedModel) return cachedModel;
  if (loadPromise) return (await loadPromise).model;
  loadPromise = (async () => {
    // @xenova/transformers is a JS port of sentence-transformers that
    // runs ONNX in Node. It exposes a `pipeline('feature-extraction')`
    // helper that returns a callable embedding model.
    const { pipeline, env } = await import("@xenova/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    const model = await pipeline("feature-extraction", MODEL_NAME);
    // Probe once to capture the embedding dimension.
    const probe = await model("probe", { pooling: "mean", normalize: true });
    const dim = probe?.data?.length ?? probe?.length ?? 384;
    cachedModel = model;
    cachedDim = dim;
    return { model, dim };
  })();
  const { model } = await loadPromise;
  return model;
}

export function embedText(model: any, text: string): Float32Array {
  // Synchronous wrapper around the pipeline. Note: pipeline() returns
  // a Promise when called without a callback. We block by calling
  // .call() with a small awaitable — but in this server context the
  // event loop is fine to await. For simplicity we use the async API.
  throw new Error("embedText must be awaited — call model(text, opts) instead");
}

/**
 * Async embed: returns a Float32Array of dim 384 with L2-normalized
 * embedding (so cosine == dot product).
 */
export async function embedTextAsync(model: any, text: string): Promise<Float32Array> {
  // The transformers.js pipeline returns a Tensor when awaited.
  const result = await (model as Pipeline)(text, { pooling: "mean", normalize: true });
  // result.data is a Float32Array (Tensor#data)
  const data: Float32Array = (result as any).data;
  return new Float32Array(data);
}
