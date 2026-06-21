import { NextResponse } from "next/server";
import { searchSongsByFeel } from "@/lib/search/semantic-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const top = Number(url.searchParams.get("top") ?? "8") || 8;
  const region = url.searchParams.get("region") ?? "US";
  const minYearRaw = url.searchParams.get("minYear");
  const maxYearRaw = url.searchParams.get("maxYear");
  const minYear = minYearRaw ? Number(minYearRaw) : null;
  const maxYear = maxYearRaw ? Number(maxYearRaw) : null;

  const result = await searchSongsByFeel({
    q,
    top,
    region,
    minYear,
    maxYear,
  });

  if ("error" in result) {
    const status = result.error === "embedder_unavailable" ? 503 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 200 });
}
