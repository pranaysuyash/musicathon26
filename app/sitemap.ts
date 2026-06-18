import type { MetadataRoute } from "next";
import { getAllSongs, getAllEvents } from "@/lib/db/queries";
import { THEME_LABELS } from "@/lib/nlp/theme-scoring";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023];
const THEMES = Object.keys(THEME_LABELS);

export default function sitemap(): MetadataRoute.Sitemap {
  const songs = getAllSongs();
  const events = getAllEvents();
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
    ...YEARS.map((y) => ({
      url: `${BASE}/year/${y}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
    ...YEARS.map((y) => ({
      url: `${BASE}/lens/${y}`,
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
