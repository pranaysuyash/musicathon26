// Serve the cached narrated insight MP3 for a given year.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { REGION_LABELS } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = url.searchParams.get("year");
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  const requestedRegion = url.searchParams.get("region") ?? "US";
  const region = Object.prototype.hasOwnProperty.call(REGION_LABELS, requestedRegion)
    ? requestedRegion
    : "US";
  const file = join(process.cwd(), "data", "exports", "insights", `insight-${year}-${region}.mp3`);
  try {
    const buf = await readFile(file);
    return new NextResponse(buf, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "insight not generated" }, { status: 404 });
  }
}
