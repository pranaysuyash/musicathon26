// All curated events — used by the landing/explainer and event-lens picker.

import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { getAllEvents } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  initDb();
  return NextResponse.json({ events: getAllEvents() });
}
