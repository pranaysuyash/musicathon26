// Health check endpoint.
//
// Per 0.10 (observability), a health check is the minimum
// operational surface. Returns 200 with DB stats so a load
// balancer / monitoring agent can probe it. Returns 503
// if the DB is unreachable.
//
// Per external review (P0.4), the response also surfaces
// the presence of partner API keys — without leaking the
// values — so an operator can verify the deployment is
// wired correctly without leaking secrets in logs.
//
// Per motto_v3 §0.11 (Customer-Facing Claims Rule), the
// `configured` field is split into two states:
//   - `key_present`: env var is set
//   - `reachable`: an actual probe to the upstream returned 2xx
// This prevents the dashboard from claiming a partner is
// "configured" when the key is dead (the Songstats 404 case
// from 2026-06-18).

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function pickEnvValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

interface HealthStats {
  songs: number;
  events: number;
  entities: number;
  lyric_lines: number;
  theme_scores: number;
  mood_scores: number;
  entity_mentions: number;
  graph_nodes: number;
  graph_edges: number;
  evidence: number;
  embeddings: number;
  path_queries: number;
  signal_clusters: number;
  cultural_posture: number;
  year_signal_profiles: number;
  context_signal_correlations: number;
}

interface PartnerKeyStatus {
  name: string;
  key_present: boolean;
  reachable: boolean | "unknown";
  env_var: string;
  /** Short operator hint shown when reachable=false. */
  hint?: string;
}

interface HealthResponse {
  ok: boolean;
  service: "versesignal";
  timestamp: string;
  uptime_seconds: number;
  db_path: string;
  stats: HealthStats;
  partner_keys: PartnerKeyStatus[];
  build: {
    node_env: string;
    next_version: string;
  };
}

export const dynamic = "force-dynamic";

// Process start time for uptime calculation
const PROCESS_START = Date.now();

// === Reachability probes ===
//
// Each probe is cached for PROBE_TTL_MS so the health endpoint
// stays fast under repeated calls. A failed probe does not throw;
// it returns false and the partner shows as `reachable: false`.

const PROBE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ProbeResult { ok: boolean; checkedAt: number; hint?: string }
const probeCache = new Map<string, ProbeResult>();

async function probe(url: string, headers: Record<string, string>, timeoutMs = 4000): Promise<ProbeResult> {
  const cached = probeCache.get(url);
  if (cached && Date.now() - cached.checkedAt < PROBE_TTL_MS) {
    return cached;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
    const ok = res.status >= 200 && res.status < 300;
    const result: ProbeResult = {
      ok,
      checkedAt: Date.now(),
      hint: ok ? undefined : `HTTP ${res.status}`,
    };
    probeCache.set(url, result);
    return result;
  } catch (err) {
    const result: ProbeResult = {
      ok: false,
      checkedAt: Date.now(),
      hint: err instanceof Error ? err.message : "fetch failed",
    };
    probeCache.set(url, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function probeSongstats(): Promise<ProbeResult> {
  const key = process.env.SONGSTATS_API_KEY;
  if (!key) return { ok: false, checkedAt: Date.now(), hint: "key not set" };
  // Songstats Enterprise API: GET /v1.0/tracks/search with q=
  // We use a deliberately small request; the only thing we want
  // is a 2xx vs 4xx to confirm the key is valid.
  const url = `https://api.songstats.com/v1.0/tracks/search?apikey=${encodeURIComponent(key)}&q=Drake&page=1&per_page=1`;
  return probe(url, { "User-Agent": "VerseSignal/0.1 (Musicathon 2026)" });
}

async function probeMusixmatch(): Promise<ProbeResult> {
  const key = process.env.MUSIXMATCH_API_KEY;
  if (!key) return { ok: false, checkedAt: Date.now(), hint: "key not set" };
  // Musixmatch: a real call would be /track.search. The 401 vs
  // 200 distinction is enough to confirm the key works.
  const url = `https://api.musixmatch.com/ws/1.1/track.search?apikey=${encodeURIComponent(key)}&q=test&page_size=1&format=json`;
  return probe(url, { "User-Agent": "VerseSignal/0.1 (Musicathon 2026)" });
}

async function probeElevenLabs(): Promise<ProbeResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, checkedAt: Date.now(), hint: "key not set" };
  // ElevenLabs: GET /v1/voices returns the available voices. 401
  // means key invalid; 200 means key valid.
  const url = "https://api.elevenlabs.io/v1/voices";
  return probe(url, { "xi-api-key": key });
}

// === Partner list ===
//
// For probes that would consume real quota, we mark them
// `reachable: "unknown"` so the operator knows the integration
// is wired but not live-tested. For probes that are cheap and
// safe, we run them.

async function buildPartnerKeys(): Promise<PartnerKeyStatus[]> {
  const musixmatch = process.env.MUSIXMATCH_API_KEY
    ? await probeMusixmatch()
    : null;
  const songstats = process.env.SONGSTATS_API_KEY
    ? await probeSongstats()
    : null;
  const elevenlabs = process.env.ELEVENLABS_API_KEY
    ? await probeElevenLabs()
    : null;
  return [
    {
      name: "Musixmatch (lyrics foundation)",
      key_present: Boolean(process.env.MUSIXMATCH_API_KEY),
      reachable: musixmatch ? musixmatch.ok : Boolean(process.env.MUSIXMATCH_API_KEY) ? "unknown" : false,
      env_var: "MUSIXMATCH_API_KEY",
      hint: musixmatch && !musixmatch.ok ? `Probe: ${musixmatch.hint}` : undefined,
    },
    {
      name: "Songstats (cultural weight)",
      key_present: Boolean(process.env.SONGSTATS_API_KEY),
      reachable: songstats ? songstats.ok : Boolean(process.env.SONGSTATS_API_KEY) ? "unknown" : false,
      env_var: "SONGSTATS_API_KEY",
      hint: songstats && !songstats.ok
        ? `Upstream is unreachable (${songstats.hint ?? "unknown error"}). The cultural-weight layer is not live-tested.`
        : undefined,
    },
    {
      name: "ElevenLabs (narration)",
      key_present: Boolean(process.env.ELEVENLABS_API_KEY),
      reachable: elevenlabs ? elevenlabs.ok : Boolean(process.env.ELEVENLABS_API_KEY) ? "unknown" : false,
      env_var: "ELEVENLABS_API_KEY",
      hint: elevenlabs && !elevenlabs.ok ? `Probe: ${elevenlabs.hint}` : undefined,
    },
    {
      name: "Hugging Face (embeddings + GLiNER)",
      key_present: Boolean(pickEnvValue(["HUGGINGFACE_API_KEY", "HF_TOKEN"])),
      reachable: "unknown", // huggingface_hub is called from Python; not probed from TS
      env_var: "HF_TOKEN (or HUGGINGFACE_API_KEY)",
    },
    {
      name: "JamBase (artist/tour/venue MCP)",
      key_present: Boolean(process.env.JAMBASE_API_KEY),
      reachable: "unknown", // JamBase is reached via Python MCP; not probed from TS
      env_var: "JAMBASE_API_KEY",
    },
    {
      name: "Cyanite (audio mood webhook)",
      key_present: Boolean(pickEnvValue(["CYANITE_WEBHOOK_SECRET", "CYANITE_API_KEY"])),
      reachable: "unknown", // Cyanite is a webhook; not probe-able
      env_var: "CYANITE_WEBHOOK_SECRET (or CYANITE_API_KEY)",
    },
  ];
}

export async function GET() {
  try {
    const db = getDb();
    const row = (sql: string) =>
      (db.prepare(sql).get() as { c: number } | undefined)?.c ?? 0;
    const stats: HealthStats = {
      songs: row("SELECT COUNT(*) AS c FROM songs"),
      events: row("SELECT COUNT(*) AS c FROM events"),
      entities: row("SELECT COUNT(*) AS c FROM entities"),
      lyric_lines: row("SELECT COUNT(*) AS c FROM lyric_lines"),
      theme_scores: row("SELECT COUNT(*) AS c FROM theme_scores"),
      mood_scores: row("SELECT COUNT(*) AS c FROM mood_scores"),
      entity_mentions: row("SELECT COUNT(*) AS c FROM entity_mentions"),
      graph_nodes: row("SELECT COUNT(*) AS c FROM graph_nodes"),
      graph_edges: row("SELECT COUNT(*) AS c FROM graph_edges"),
      evidence: row("SELECT COUNT(*) AS c FROM evidence"),
      embeddings: row("SELECT COUNT(*) AS c FROM embeddings"),
      path_queries: row("SELECT COUNT(*) AS c FROM path_queries"),
      signal_clusters: row("SELECT COUNT(*) AS c FROM signal_clusters"),
      cultural_posture: row("SELECT COUNT(*) AS c FROM cultural_posture"),
      year_signal_profiles: row("SELECT COUNT(*) AS c FROM year_signal_profiles"),
      context_signal_correlations: row("SELECT COUNT(*) AS c FROM context_signal_correlations"),
    };
    const partner_keys = await buildPartnerKeys();
    const response: HealthResponse = {
      ok: true,
      service: "versesignal",
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - PROCESS_START) / 1000),
      db_path: process.env.VERSESIGNAL_DB ?? "data/versesignal.db",
      stats,
      partner_keys,
      build: {
        node_env: process.env.NODE_ENV ?? "development",
        next_version: process.env.npm_package_dependencies_next ?? "unknown",
      },
    };
    return NextResponse.json(response, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        service: "versesignal" as const,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 503 }
    );
  }
}
