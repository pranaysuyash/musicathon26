// Data quality dashboard endpoint.
//
// Per external review (Day 5 polish) and decision 0019 P3.1,
// this endpoint answers: "Is the corpus ready for judging?"
//
// Returns per-source counts, coverage, integrity issues,
// and a per-year summary. Different from /api/health
// (which is a simple up/down check + DB stats); this is
// the operator-facing data audit.

import { NextResponse } from "next/server";
import { getDataHealth, type DataHealth } from "@/lib/reports/data-health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data: DataHealth = await getDataHealth();
    return NextResponse.json(data, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 503 }
    );
  }
}
