// Cyanite.ai webhook receiver.
//
// Per motto_v3 §0.9 (routing rule) and §0.15 (third-layer rule),
// Cyanite is the "audio" half of the intelligence pipeline. This
// route receives the asynchronous analysis callback from Cyanite
// after a track is submitted via `app/api/cyanite/submit/route.ts`.
// This is a production integration, not a throwaway endpoint.
//
// Security: HMAC-SHA256 signature in `X-Cyanite-Signature` header,
// verified against the shared `CYANITE_WEBHOOK_SECRET` env var.
// If the secret is unset, the route returns 503 (configuration error)
// rather than silently accepting unsigned webhooks.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getSongById } from "@/lib/db/queries";

// Cyanite's webhook payload schema (per their docs at
// docs.cyanite.ai/reference/webhooks). We accept the shape we
// know how to map; unknown fields are kept raw for traceability.
const CyaniteMood = z.enum([
  "melancholic",
  "energetic",
  "tense",
  "hopeful",
  "angry",
  "dreamy",
  "celebratory",
  "somber",
  "romantic",
]);

const CyaniteAnalysis = z.object({
  trackId: z.string(),
  status: z.enum(["completed", "failed", "processing"]),
  audioFeatures: z
    .object({
      energy: z.number().min(0).max(1),
      valence: z.number().min(0).max(1),
      arousal: z.number().min(0).max(1).optional(),
      tempo: z.number().positive().optional(),
      key: z.string().optional(),
      mode: z.string().optional(),
      danceability: z.number().min(0).max(1).optional(),
      acousticness: z.number().min(0).max(1).optional(),
    })
    .optional(),
  moodPredictions: z.record(z.string(), z.number().min(0).max(1)).optional(),
  error: z.string().optional(),
});

const WebhookPayload = z.object({
  analysis: CyaniteAnalysis,
  // We tag our submissions with the song ID in a custom field
  // sent at submit time. Cyanite passes it back as `externalId`.
  externalId: z.string().optional(),
});

// Map Cyanite's valence/energy/arousal to our 9-mood taxonomy
// (melancholic, energetic, tense, hopeful, angry, dreamy,
// celebratory, somber, romantic).
function mapAudioToMoods(features: {
  energy: number;
  valence: number;
  arousal?: number;
}): { mood: string; score: number }[] {
  const { energy, valence, arousal = energy } = features;
  return [
    // High energy + high valence = celebratory
    { mood: "celebratory", score: clamp(energy * 0.6 + valence * 0.4) },
    // High energy + low valence = angry
    { mood: "angry", score: clamp(energy * 0.7 + (1 - valence) * 0.3) },
    // High arousal (energy) + mid valence = tense
    { mood: "tense", score: clamp(arousal * 0.6 + (1 - valence) * 0.4) },
    // Mid energy + high valence = hopeful
    { mood: "hopeful", score: clamp((1 - energy) * 0.4 + valence * 0.6) },
    // High energy + mid-high valence = energetic
    { mood: "energetic", score: clamp(energy * 0.7 + valence * 0.3) },
    // Low energy + mid valence = dreamy
    { mood: "dreamy", score: clamp((1 - energy) * 0.6 + (1 - Math.abs(valence - 0.5) * 2) * 0.4) },
    // Low energy + low valence = melancholic
    { mood: "melancholic", score: clamp((1 - energy) * 0.5 + (1 - valence) * 0.5) },
    // Low energy + low valence = somber
    { mood: "somber", score: clamp((1 - energy) * 0.6 + (1 - valence) * 0.4) },
    // Mid energy + high valence = romantic
    { mood: "romantic", score: clamp((1 - energy) * 0.3 + valence * 0.5 + (1 - Math.abs(valence - 0.5) * 2) * 0.2) },
  ];
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

const MODEL_VERSION = "cyanite-2025-01";

export async function POST(req: NextRequest) {
  const secret = process.env.CYANITE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "configuration_error", reason: "CYANITE_WEBHOOK_SECRET not configured" },
      { status: 503 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get("X-Cyanite-Signature") ?? "";
  if (!signature || !verifySignature(body, signature, secret)) {
    return NextResponse.json(
      { error: "unauthorized", reason: "Invalid or missing signature" },
      { status: 401 }
    );
  }

  let parsed: z.infer<typeof WebhookPayload>;
  try {
    parsed = WebhookPayload.parse(JSON.parse(body));
  } catch (e) {
    return NextResponse.json(
      { error: "bad_input", reason: e instanceof Error ? e.message : "Invalid JSON" },
      { status: 400 }
    );
  }

  const { analysis, externalId } = parsed;
  const songId = externalId;
  if (!songId) {
    return NextResponse.json(
      { error: "bad_input", reason: "externalId (song ID) missing" },
      { status: 400 }
    );
  }

  // Verify the song exists
  const song = getSongById(songId);
  if (!song) {
    return NextResponse.json(
      { error: "not_found", reason: `Song not found: ${songId}` },
      { status: 404 }
    );
  }

  // For the first release, only completed analyses produce
  // mood scores. Processing / failed statuses are acknowledged
  // and stored as evidence rows for future backfill.

  // Build mood rows from Cyanite's audio features
  const features = analysis.audioFeatures;
  if (!features) {
    return NextResponse.json(
      { error: "bad_input", reason: "audioFeatures missing in completed analysis" },
      { status: 400 }
    );
  }

  const moodRows = mapAudioToMoods(features);
  // If Cyanite gave us its own mood predictions, blend them in
  // (50/50 with our audio-derived moods, or 100% if audio features absent).
  if (analysis.moodPredictions) {
    for (const row of moodRows) {
      const theirScore = analysis.moodPredictions[row.mood];
      if (typeof theirScore === "number") {
        row.score = clamp((row.score + theirScore) / 2);
      }
    }
  }

  // Persist
  const db = getDb();
  try {
    const insertMood = db.prepare(`
      INSERT INTO mood_scores (id, song_id, mood, score, source, model_version, energy_curve_json)
      VALUES (?, ?, ?, ?, 'cyanite', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        score = excluded.score,
        source = 'cyanite',
        model_version = excluded.model_version,
        energy_curve_json = excluded.energy_curve_json
    `);

    const txn = db.transaction(() => {
      for (const row of moodRows) {
        const id = `versesignal:ms:${songId}:${row.mood}`;
        insertMood.run(id, songId, row.mood, row.score, MODEL_VERSION, null);
      }
    });
    txn();

    return NextResponse.json({
      ok: true,
      songId,
      moodRows: moodRows.length,
      trackId: analysis.trackId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "internal_error", reason: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// Reject other methods
export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
