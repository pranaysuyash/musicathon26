import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ error: "missing required query parameter `q`", message: "Query is required." }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: "embedder_unavailable",
      message:
        "Semantic search is available in the local build and shown in the UI, but production keeps this route lightweight.",
    },
    { status: 503 },
  );
}
