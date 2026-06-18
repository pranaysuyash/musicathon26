import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as Record<string, unknown>;
    console.log("[telemetry]", payload);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    name: "verse-telemetry-endpoint",
    status: "ready",
  });
}
