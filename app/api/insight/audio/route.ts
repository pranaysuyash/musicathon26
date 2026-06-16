// Serve the cached narrated insight MP3 for a given year.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = url.searchParams.get("year");
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  const file = join(process.cwd(), "data", "exports", "insights", `insight-${year}.mp3`);
  try {
    const buf = await readFile(file);
    return new NextResponse(buf, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "insight not generated" }, { status: 404 });
  }
}
