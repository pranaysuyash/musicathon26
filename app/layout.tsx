import type { Metadata } from "next";
import "./globals.css";

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
  },
  twitter: {
    card: "summary_large_image",
    title: "VerseSignal",
    description: "When the world was going through something, what was it singing?",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="scrollbar-thin">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-signal-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-950 focus:shadow-lg"
        >
          Skip to main content
        </a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
