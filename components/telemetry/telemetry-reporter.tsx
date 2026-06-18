"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type MetricPayload = {
  name: string;
  value: number;
  id?: string;
  page: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

function postMetric(payload: MetricPayload) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
    return;
  }
  const body = JSON.stringify(payload);
  navigator.sendBeacon(
    "/api/telemetry",
    new Blob([body], { type: "application/json" })
  );
}

export function TelemetryReporter() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
      return;
    }

    const commonMeta = {
      page: pathname ?? "unknown",
      timestamp: new Date().toISOString(),
    };

    const paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== "paint") continue;
        if (entry.name === "first-contentful-paint") {
          postMetric({
            name: "FCP",
            value: entry.startTime,
            page: commonMeta.page,
            timestamp: commonMeta.timestamp,
          });
        }
      }
    });

    const lcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & { value?: number };
        if (!Number.isFinite(e.startTime)) continue;
        postMetric({
          name: "LCP",
          value: e.startTime,
          page: commonMeta.page,
          timestamp: commonMeta.timestamp,
          id: e.name,
        });
      }
    });

    const clsState = { value: 0 };
    const layoutObserver = new PerformanceObserver((list) => {
      let total = clsState.value;
      for (const entry of list.getEntries()) {
        const le = entry as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
          startTime: number;
        };
        if (le.hadRecentInput) continue;
        total += le.value ?? 0;
      }
      clsState.value = total;
      postMetric({
        name: "CLS",
        value: total,
        page: commonMeta.page,
        timestamp: commonMeta.timestamp,
      });
    });

    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEventTiming & { processingStart?: number };
        if (e.processingStart == null) continue;
        postMetric({
          name: "FID",
          value: e.processingStart - e.startTime,
          page: commonMeta.page,
          timestamp: commonMeta.timestamp,
        });
      }
    });

    paintObserver.observe({ type: "paint", buffered: true });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    layoutObserver.observe({ type: "layout-shift", buffered: true });
    fidObserver.observe({ type: "first-input", buffered: true });

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        postMetric({
          name: "CLS_FINAL",
          value: clsState.value,
          page: commonMeta.page,
          timestamp: commonMeta.timestamp,
        });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      paintObserver.disconnect();
      lcpObserver.disconnect();
      layoutObserver.disconnect();
      fidObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname]);

  return null;
}
