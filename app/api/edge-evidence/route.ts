// Fetch evidence rows for a given edge id.

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { getEvidenceForEdge } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  initDb();
  const url = new URL(req.url);
  const edgeId = url.searchParams.get("edgeId");
  if (!edgeId) return NextResponse.json({ error: "edgeId required" }, { status: 400 });
  return NextResponse.json({ edgeId, evidence: getEvidenceForEdge(edgeId) });
}
