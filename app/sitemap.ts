import type { MetadataRoute } from "next";
import { initDb } from "@/lib/db";
import { getAllSongs, getAllEvents, getAllYears } from "@/lib/db/queries";
import { THEME_LABELS } from "@/lib/nlp/theme-scoring";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const THEMES = Object.keys(THEME_LABELS);

export default function sitemap(): MetadataRoute.Sitemap {
  initDb();
  const songs = getAllSongs();
  const events = getAllEvents();
  const years = getAllYears("GLOBAL");
  const now = new Date();
  return [
    {
      url: `${BASE}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE}/graph`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...songs.map((s: { id: string }) => ({
      url: `${BASE}/song/${encodeURIComponent(s.id)}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
    ...years.map(({ year }) => ({
      url: `${BASE}/year/${year}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
    ...years.map(({ year }) => ({
      url: `${BASE}/lens/${year}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
    ...THEMES.map((t) => ({
      url: `${BASE}/theme/${encodeURIComponent(t)}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
    ...events.map((e) => ({
      url: `${BASE}/event/${encodeURIComponent(e.id)}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];
}
