import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TELEMETRY_FILE = path.join(process.cwd(), "logs", "telemetry.ndjson");

interface RawPayload {
  name?: unknown;
  value?: unknown;
  id?: unknown;
  page?: unknown;
  timestamp?: unknown;
  metadata?: unknown;
}

function normalizePayload(raw: unknown, source: string) {
  const payload = raw as RawPayload;
  const name = typeof payload.name === "string" ? payload.name : "metric_unknown";
  const value = typeof payload.value === "number" ? payload.value : Number.NaN;
  const page = typeof payload.page === "string" ? payload.page : "unknown";
  const timestamp =
    typeof payload.timestamp === "string" ? payload.timestamp : new Date().toISOString();

  return {
    name,
    value: Number.isFinite(value) ? value : 0,
    id: typeof payload.id === "string" ? payload.id : undefined,
    page,
    timestamp,
    metadata: payload.metadata ?? null,
    source,
    receivedAt: new Date().toISOString(),
  };
}

async function appendTelemetryLine(line: string) {
  await fs.mkdir(path.dirname(TELEMETRY_FILE), { recursive: true });
  await fs.appendFile(TELEMETRY_FILE, `${line}\n`, { encoding: "utf8" });
}

export async function POST(req: NextRequest) {
  try {
    const rawPayload = await req.json();
    const source = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const event = normalizePayload(rawPayload, source);

    try {
      await appendTelemetryLine(JSON.stringify(event));
    } catch (storageErr) {
      console.error("[telemetry] unable to persist", storageErr);
    }

    return NextResponse.json({ ok: true, source: source });
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
}

export async function GET() {
  let total = 0;
  try {
    const raw = await fs.readFile(TELEMETRY_FILE, { encoding: "utf8" });
    total = raw.split(/\r?\n/).filter(Boolean).length;
  } catch {
    // file may not exist before first write
  }

  return NextResponse.json({
    name: "verse-telemetry-endpoint",
    status: "ready",
    total,
  });
}
