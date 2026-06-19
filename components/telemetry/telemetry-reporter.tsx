"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

type MetricPayload = {
  name: string;
  value: number;
  id?: string;
  rating?: "good" | "needs-improvement" | "poor";
  page: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

function postMetric(payload: MetricPayload) {
  if (typeof navigator === "undefined") return;
  const body = JSON.stringify(payload);
  // Prefer sendBeacon for fire-and-forget; fall back to fetch keepalive.
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/telemetry",
      new Blob([body], { type: "application/json" })
    );
    return;
  }
  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function toPayload(m: Metric, page: string): MetricPayload {
  return {
    name: m.name,
    value: m.value,
    id: m.id,
    rating: m.rating,
    page,
    timestamp: new Date().toISOString(),
    metadata: {
      delta: m.delta,
      navigationType: m.navigationType,
      entries: m.entries?.length ?? 0,
    },
  };
}

/**
 * Mount in the root layout. Emits Core Web Vitals (CLS, FCP,
 * INP, LCP, TTFB) to /api/telemetry. The reporter intentionally
 * lives in the browser only — server-rendered pages never block
 * on telemetry, and the report is fire-and-forget.
 *
 * Note: FID is replaced by INP in web-vitals v4+. Both are
 * provided here through INP.
 */
export function TelemetryReporter() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const page = pathname ?? "unknown";
    const report = (m: Metric) => postMetric(toPayload(m, page));

    onCLS(report);
    onFCP(report);
    onINP(report);
    onLCP(report);
    onTTFB(report);
  }, [pathname]);

  return null;
}
