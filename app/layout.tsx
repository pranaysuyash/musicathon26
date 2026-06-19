import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

import { TelemetryReporter } from "@/components/telemetry/telemetry-reporter";
import { resolveLocale } from "@/lib/i18n/strings";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
  ),
  title: {
    default: "VerseSignal — A music-cultural knowledge graph",
    template: "%s · VerseSignal",
  },
  description:
    "Explore how popular songs, lyrics, artists, moods, collaborators, and world events connect across time.",
  applicationName: "VerseSignal",
  keywords: [
    "music",
    "knowledge graph",
    "lyrics",
    "songs",
    "artists",
    "themes",
    "moods",
    "world events",
    "music history",
  ],
  openGraph: {
    type: "website",
    siteName: "VerseSignal",
    title: "VerseSignal",
    description: "When the world was going through something, what was it singing?",
    images: [{ url: "/api/og?type=default", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VerseSignal",
    description: "When the world was going through something, what was it singing?",
    images: [{ url: "/api/og?type=default", width: 1200, height: 630 }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
};

function detectLocaleFromHeaders() {
  const header = headers().get("accept-language")?.toLowerCase() ?? "";
  if (header.startsWith("es") || header.includes("es-")) return "es";
  return "en";
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = detectLocaleFromHeaders();
  return (
    <html lang={locale}>
      <body className="scrollbar-thin">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-signal-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-950 focus:shadow-lg"
        >
          Skip to main content
        </a>
        <div id="main">
          {children}
          <TelemetryReporter />
        </div>
      </body>
    </html>
  );
}
