import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

// Using nodejs runtime to avoid @vercel/og dependency.
// The first request will lazy-load satori; subsequent calls are fast.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const title = sp.get("title") ?? "VerseSignal";
  const subtitle = sp.get("subtitle") ?? "When the world was going through something, what was it singing?";
  const type = sp.get("type") ?? "default";

  const accentColors: Record<string, string> = {
    default: "#a855f7",
    lens: "#22d3ee",
    event: "#f59e0b",
    theme: "#10b981",
    song: "#f472b6",
    year: "#6366f1",
    graph: "#a855f7",
  };
  const accent = accentColors[type] ?? accentColors.default;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "60px 70px",
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a0a2e 50%, #0f172a 100%)",
          fontFamily: "Inter",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 30,
            color: accent,
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }}>
            <circle cx="12" cy="12" r="10" stroke={accent} strokeWidth="2" fill="none" />
            <path d="M8 8h8M8 12h8M8 16h4" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          </svg>
          VerseSignal
        </div>

        <h1
          style={{
            fontSize: 62,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            color: "#f1f5f9",
            margin: 0,
            maxWidth: 800,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {title}
        </h1>

        <p
          style={{
            fontSize: 24,
            color: "#94a3b8",
            marginTop: 16,
            marginBottom: 0,
            maxWidth: 650,
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {subtitle}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 40,
            padding: "12px 20px",
            borderRadius: 8,
            background: `${accent}15`,
            border: `1px solid ${accent}30`,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: accent,
            }}
          />
          <span style={{ color: accent, fontSize: 16, fontWeight: 500 }}>
            A music-cultural knowledge graph
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
