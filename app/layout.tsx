import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VerseSignal — A music-cultural knowledge graph",
  description:
    "Explore how popular songs, lyrics, artists, moods, collaborators, and world events connect across time. Built for Musicathon 2026.",
  openGraph: {
    title: "VerseSignal",
    description: "When the world was going through something, what was it singing?",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="scrollbar-thin">{children}</body>
    </html>
  );
}
