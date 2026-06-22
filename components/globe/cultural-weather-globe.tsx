"use client";

import dynamic from "next/dynamic";
import type { ComponentType, ReactNode } from "react";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Globe, MapPinned, ShieldAlert } from "lucide-react";
import { Color, MeshPhongMaterial } from "three";
import type { Locale } from "@/lib/i18n/strings";

const GlobeView = dynamic(() => import("react-globe.gl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[520px] items-center justify-center rounded-[2rem] border border-ink-800 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),rgba(2,6,23,0.95))]">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-500">Loading weather field</p>
        <p className="mt-2 text-sm text-ink-300">Preparing the cultural globe…</p>
      </div>
    </div>
  ),
}) as unknown as ComponentType<any>;

export interface WeatherRegionPoint {
  code: string;
  label: string;
  lat: number;
  lng: number;
  year: number;
  songCount: number;
  prevSongCount: number;
  delta: number;
  eventCount: number;
  topTheme: string | null;
  topSignal: string | null;
  intensity: number;
  completeness: number;
}

interface CulturalWeatherGlobeProps {
  locale: Locale;
  year: number;
  points: WeatherRegionPoint[];
  initialRegionCode: string;
}

class GlobeErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function CulturalWeatherGlobe({
  locale,
  year,
  points,
  initialRegionCode,
}: CulturalWeatherGlobeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const globeRef = useRef<HTMLDivElement | null>(null);
  const [selectedCode, setSelectedCode] = useState(initialRegionCode);
  const [layer, setLayer] = useState<"signals" | "context" | "uncertainty" | "story">("signals");
  const [webglReady, setWebglReady] = useState<boolean | null>(null);
  const [globeSize, setGlobeSize] = useState({ width: 600, height: 520 });

  useEffect(() => {
    setSelectedCode(initialRegionCode);
  }, [initialRegionCode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function hasWebGL(): boolean {
      try {
        const canvas = document.createElement("canvas");
        const gl =
          canvas.getContext("webgl2") ||
          canvas.getContext("webgl") ||
          canvas.getContext("experimental-webgl");
        return Boolean(gl);
      } catch {
        return false;
      }
    }
    setWebglReady(hasWebGL());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !globeRef.current) return;
    const el = globeRef.current;
    function updateSize() {
      const rect = el.getBoundingClientRect();
      setGlobeSize({ width: Math.max(320, Math.floor(rect.width)), height: Math.max(400, Math.floor(rect.height)) });
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const selectedPoint = useMemo(() => {
    return points.find((point) => point.code === selectedCode) ?? points[0] ?? null;
  }, [points, selectedCode]);

  const sortedPoints = useMemo(() => {
    return [...points].sort((a, b) => b.songCount - a.songCount || b.eventCount - a.eventCount || a.label.localeCompare(b.label));
  }, [points]);

  const ringsData = useMemo(() => {
    const hotSet = layer === "uncertainty" ? sortedPoints.slice(-3) : sortedPoints.slice(0, 4);
    return hotSet.map((point, index) => ({
      ...point,
      radius: index === 0 ? 2.7 : 1.9,
      ringColor:
        point.code === selectedCode
          ? ["rgba(248, 225, 108, 0.95)", "rgba(56, 189, 248, 0.45)"]
          : point.completeness < 0.45
            ? ["rgba(148, 163, 184, 0.8)", "rgba(71, 85, 105, 0.2)"]
            : ["rgba(56, 189, 248, 0.8)", "rgba(34, 211, 238, 0.35)"],
    }));
  }, [layer, selectedCode, sortedPoints]);

  const visibleLabels = useMemo(() => {
    return sortedPoints
      .filter((point) => point.songCount >= 6 || point.code === selectedCode)
      .slice(0, 6)
      .map((point) => ({
        ...point,
        text: point.label,
      }));
  }, [selectedCode, sortedPoints]);

  const fallbackPoints = useMemo(() => {
    return sortedPoints.slice(0, 6);
  }, [sortedPoints]);

  function syncRegion(code: string) {
    setSelectedCode(code);
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(year));
    params.set("region", code);
    if (locale !== "en") {
      params.set("lang", locale);
    } else {
      params.delete("lang");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const globeMaterial = useMemo(
    () =>
      new MeshPhongMaterial({
        color: new Color("#0b1220"),
        emissive: new Color("#08111e"),
        emissiveIntensity: 0.3,
        shininess: 0.18,
        transparent: false,
      }),
    []
  );

  const selectedHref = `/lens/${selectedPoint?.year ?? year}?region=${encodeURIComponent(selectedPoint?.code ?? "GLOBAL")}${
    locale !== "en" ? `&lang=${locale}` : ""
  }`;

  return (
    <section className="relative overflow-hidden rounded-[2.25rem] border border-ink-800 bg-[linear-gradient(180deg,rgba(9,11,17,0.98),rgba(5,8,14,0.95))] shadow-[0_40px_120px_-70px_rgba(14,165,233,0.55)]">
      <div className="absolute inset-0">
        <div className="absolute -left-24 top-4 h-72 w-72 rounded-full bg-signal-500/12 blur-3xl" />
        <div className="absolute right-[-6rem] top-14 h-80 w-80 rounded-full bg-echo-500/12 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-300/40 to-transparent" />
      </div>

      <div className="relative grid gap-0 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="relative min-h-[520px] border-b border-ink-800 xl:border-b-0 xl:border-r">
          {webglReady === null ? (
            <div className="flex h-full min-h-[520px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-ink-700 border-t-signal-400" />
                <p className="mt-4 text-xs uppercase tracking-[0.3em] text-ink-500">Warming up the signal field</p>
              </div>
            </div>
          ) : webglReady === true ? (
            <GlobeErrorBoundary
              fallback={
                <AtlasFallbackSurface
                  fallbackPoints={fallbackPoints}
                  selectedCode={selectedCode}
                  selectedPoint={selectedPoint}
                  reason="The signal field could not load. Using the map view instead."
                  year={year}
                  syncRegion={syncRegion}
                />
              }
            >
              <GlobeView
                ref={globeRef}
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
                bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
                backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
                globeMaterial={globeMaterial}
                pointsData={points}
                pointLat="lat"
                pointLng="lng"
                pointColor={(p: WeatherRegionPoint) =>
                  p.code === selectedCode
                    ? "#f8e16c"
                    : p.completeness < 0.45
                      ? "#94a3b8"
                      : "#38bdf8"
                }
                pointAltitude={(p: WeatherRegionPoint) => Math.max(0.01, p.intensity * 0.08)}
                pointRadius={(p: WeatherRegionPoint) => Math.max(0.25, 0.25 + p.intensity * 0.55)}
                pointLabel={(p: WeatherRegionPoint) =>
                  `<b>${p.label}</b><br/>${p.songCount} songs · ${p.topSignal ?? "signal sparse"}`
                }
                onPointClick={(p: WeatherRegionPoint) => syncRegion(p.code)}
                ringsData={ringsData}
                ringLat="lat"
                ringLng="lng"
                ringColor="ringColor"
                ringMaxRadius="radius"
                ringPropagationSpeed={1.2}
                ringRepeatPeriod={2200}
                labelsData={visibleLabels}
                labelLat="lat"
                labelLng="lng"
                labelText="text"
                labelSize={1.1}
                labelDotRadius={0.25}
                labelColor={() => "#f8fafc"}
                labelAltitude={0.02}
                width={globeSize.width}
                height={globeSize.height}
              />
            </GlobeErrorBoundary>
          ) : (
            <AtlasFallbackSurface
              fallbackPoints={fallbackPoints}
              selectedCode={selectedCode}
              selectedPoint={selectedPoint}
              reason="Your browser is using the map view. The signal story is the same."
              year={year}
              syncRegion={syncRegion}
            />
          )}
        </div>

        <aside className="flex flex-col gap-5 p-6 lg:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-ink-500">World signal field</p>
            <h3 className="mt-3 text-2xl font-semibold text-ink-100">Cultural weather, region by region.</h3>
            <p className="mt-3 text-sm leading-7 text-ink-300">
              Signal intensity, candidate contexts, and uncertainty all share the same map. The richer a region’s data, the more confidently it glows.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <InfoCard
              icon={<Globe className="h-4 w-4 text-signal-300" />}
              title="Signal field"
              body="Each pulse is a region’s chart activity. Height and color show signal strength, not just popularity."
            />
            <InfoCard
              icon={<MapPinned className="h-4 w-4 text-echo-300" />}
              title="Context weather"
              body="Click any region to see the moods, themes, and candidate events that shaped its sound."
            />
            <InfoCard
              icon={<ShieldAlert className="h-4 w-4 text-amber-300" />}
              title="Honesty guardrail"
              body="Sparse regions stay dim. We do not pretend weak data is a strong cultural signal."
            />
          </div>

          <div className="rounded-[1.7rem] border border-ink-800 bg-ink-950/55 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Selected region</p>
            <h4 className="mt-2 text-xl font-semibold text-ink-100">{selectedPoint?.label ?? "No region selected"}</h4>
            {selectedPoint ? (
              <div className="mt-3 space-y-2 text-sm text-ink-300">
                <p>{selectedPoint.songCount} songs against a {Math.round(selectedPoint.completeness * 100)}% completeness signal.</p>
                <p>Top signal: {selectedPoint.topSignal ?? "unknown"}</p>
                <p>Top theme: {selectedPoint.topTheme ?? "not enough data"}</p>
                <p className={selectedPoint.delta >= 0 ? "text-emerald-300" : "text-amber-300"}>
                  Year drift: {selectedPoint.delta >= 0 ? `+${selectedPoint.delta}` : selectedPoint.delta}
                </p>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={selectedHref}
                className="inline-flex items-center gap-2 rounded-full bg-signal-500 px-4 py-2 text-xs font-semibold text-ink-950 transition hover:bg-signal-400"
              >
                Open regional lens
                <Globe className="h-3.5 w-3.5" />
              </a>
              <a
                href={`/graph?rootType=region&rootId=versesignal:n:region:${encodeURIComponent(selectedPoint?.code ?? "GLOBAL")}&hops=2`}
                className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-4 py-2 text-xs font-semibold text-ink-100 transition hover:border-echo-400/60"
              >
                Open region graph
                <ArrowButton />
              </a>
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-ink-800 bg-ink-950/55 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-500">Story cue</p>
            <p className="mt-3 text-sm leading-7 text-ink-300">
              Start with the strongest region, compare it with the least complete one, and ask what the corpus can
              honestly prove before it claims a cultural explanation.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function AtlasFallbackSurface({
  fallbackPoints,
  selectedCode,
  selectedPoint,
  reason,
  year,
  syncRegion,
}: {
  fallbackPoints: WeatherRegionPoint[];
  selectedCode: string;
  selectedPoint: WeatherRegionPoint | null;
  reason: string;
  year: number;
  syncRegion: (code: string) => void;
}) {
  return (
    <div className="flex h-full min-h-[520px] flex-col justify-between p-6 lg:p-8">
      <div className="max-w-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-ink-500">Fallback weather atlas</p>
        <h3 className="mt-3 text-2xl font-semibold text-ink-100">
          The same signal story, rendered as a 2D field.
        </h3>
        <p className="mt-3 text-sm leading-7 text-ink-300">
          {reason}. The product stays playable: signal intensity, data completeness, and candidate context are
          still visible.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fallbackPoints.map((point) => (
          <button
            key={point.code}
            type="button"
            onClick={() => syncRegion(point.code)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              point.code === selectedCode
                ? "border-signal-400/60 bg-signal-950/35"
                : "border-ink-800 bg-ink-950/45 hover:border-signal-400/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink-100">{point.label}</span>
              <span className="text-[11px] uppercase tracking-[0.22em] text-ink-500">{point.code}</span>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              {point.songCount} songs · {point.topSignal ?? "signal sparse"} · {Math.round(point.completeness * 100)}% data completeness
            </p>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
        <p className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Selected region</p>
        <p className="mt-1 text-sm font-medium text-ink-100">{selectedPoint?.label ?? "No region selected"}</p>
        {selectedPoint ? (
          <p className="mt-2 text-sm text-ink-300">
            {selectedPoint.songCount} songs in {selectedPoint.year}. Top signal: {selectedPoint.topSignal ?? "unknown"}.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-300">Year anchor: {year}</p>
        )}
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-ink-800 bg-ink-950/55 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-ink-800 bg-ink-900/80 p-2">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-ink-100">{title}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink-400">{body}</p>
    </div>
  );
}

function ArrowButton() {
  return <span className="inline-block h-3 w-3 rotate-45 rounded-[2px] border border-current border-t-0 border-l-0" />;
}
