"use client";

import { useRouter } from "next/navigation";

const REGIONS: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "UK", label: "United Kingdom" },
  { code: "IN", label: "India" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "DE", label: "Germany" },
  { code: "BR", label: "Brazil" },
  { code: "NG", label: "Nigeria" },
  { code: "MX", label: "Mexico" },
  { code: "UA", label: "Ukraine" },
  { code: "RU", label: "Russia" },
  { code: "GLOBAL", label: "Global" },
];

export function RegionPicker({
  currentRegion,
  currentYear,
  basePath,
  locale,
}: {
  currentRegion: string;
  currentYear: number;
  basePath?: string;
  locale?: string;
}) {
  const router = useRouter();
  const query = new URLSearchParams();
  if (locale && locale !== "en") {
    query.set("lang", locale);
  }
  if (currentRegion !== "US") {
    query.set("region", currentRegion);
  }

  return (
    <select
      value={currentRegion}
      onChange={(e) => {
        const v = e.target.value;
        const nextQuery = new URLSearchParams(query);
        if (v === "US") {
          nextQuery.delete("region");
        } else {
          nextQuery.set("region", v);
        }
        const path = basePath ?? `/lens/${currentYear}`;
        const queryString = nextQuery.toString();
        router.push(queryString ? `${path}?${queryString}` : path);
      }}
      className="rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs text-ink-200 outline-none focus:border-signal-500"
    >
      {REGIONS.map((r) => (
        <option key={r.code} value={r.code}>
          {r.label}
        </option>
      ))}
    </select>
  );
}
