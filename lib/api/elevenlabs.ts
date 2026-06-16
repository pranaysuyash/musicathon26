// ElevenLabs TTS client (text-to-speech, voiced insight cards).
// One killer moment per query — not a full voice UI.
//
// Uses the new SDK pattern from `elevenlabs` v1.x.

import "server-only";
import { ElevenLabsClient } from "elevenlabs/wrapper";

function apiKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY not set");
  return k;
}

function voiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel — calm narrator
}

let _client: ElevenLabsClient | null = null;
function client(): ElevenLabsClient {
  if (_client) return _client;
  _client = new ElevenLabsClient({ apiKey: apiKey() });
  return _client;
}

export async function synthesizeSpeech(
  text: string,
  opts: { voiceId?: string; modelId?: string } = {}
): Promise<Buffer> {
  const vid = opts.voiceId ?? voiceId();
  const mid = opts.modelId ?? "eleven_multilingual_v2";

  const audioStream = await client().textToSpeech.convert(vid, {
    text,
    model_id: mid,
    output_format: "mp3_44100_128",
    voice_settings: {
      stability: 0.45,
      similarity_boost: 0.78,
      style: 0.35,
      use_speaker_boost: true,
    },
  });

  // The SDK returns a Node Readable stream in server contexts.
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function buildInsightNarration(args: {
  query: string;
  topThemes: { theme: string; avgScore: number }[];
  topMoods: { mood: string; avgScore: number }[];
  topEvent?: { name: string; songCount: number };
}): string {
  const { query, topThemes, topMoods, topEvent } = args;
  const themes = topThemes
    .slice(0, 3)
    .map((t) => t.theme.replace(/_/g, " "))
    .join(", ");
  const moods = topMoods
    .slice(0, 2)
    .map((m) => m.mood)
    .join(" and ");
  const event = topEvent
    ? ` The strongest event connection is ${topEvent.name}, with ${topEvent.songCount} songs linked through theme overlap and semantic similarity.`
    : "";
  return `${query} I found three dominant themes: ${themes}. The mood reads as ${moods}.${event}`;
}
