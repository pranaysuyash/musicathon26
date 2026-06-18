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

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
  configured: boolean;
  // For the operator: which env var name to set
  env_var: string;
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

const PARTNER_KEYS: PartnerKeyStatus[] = [
  {
    name: "Musixmatch (lyrics foundation)",
    configured: Boolean(process.env.MUSIXMATCH_API_KEY),
    env_var: "MUSIXMATCH_API_KEY",
  },
  {
    name: "Songstats (cultural weight)",
    configured: Boolean(process.env.SONGSTATS_API_KEY),
    env_var: "SONGSTATS_API_KEY",
  },
  {
    name: "ElevenLabs (narration)",
    configured: Boolean(process.env.ELEVENLABS_API_KEY),
    env_var: "ELEVENLABS_API_KEY",
  },
  {
    name: "Hugging Face (embeddings + GLiNER)",
    configured: Boolean(process.env.HUGGINGFACE_API_KEY),
    env_var: "HUGGINGFACE_API_KEY",
  },
  {
    name: "JamBase (artist/tour/venue MCP)",
    configured: Boolean(process.env.JAMBASE_API_KEY),
    env_var: "JAMBASE_API_KEY",
  },
  {
    name: "Cyanite (audio mood webhook)",
    configured: Boolean(process.env.CYANITE_WEBHOOK_SECRET),
    env_var: "CYANITE_WEBHOOK_SECRET",
  },
];

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
    const response: HealthResponse = {
      ok: true,
      service: "versesignal",
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - PROCESS_START) / 1000),
      db_path: process.env.VERSESIGNAL_DB ?? "data/versesignal.db",
      stats,
      partner_keys: PARTNER_KEYS,
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
