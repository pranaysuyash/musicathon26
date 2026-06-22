"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/components/ui/primitives";
import { Home, Search, Music, CalendarDays, Globe, Share2, Timer, Activity } from "lucide-react";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/ask", label: "Ask", icon: Search },
  { href: "/song/versesignal:2020:01:blinding-lights-the-weeknd", label: "Song Lens", icon: Music },
  { href: "/event/versesignal:ev:covid_19", label: "Event Lens", icon: CalendarDays },
  { href: "/globe", label: "World", icon: Globe },
  { href: "/graph", label: "Graph", icon: Share2 },
  { href: "/scrub", label: "Timeline", icon: Timer },
];

export function ProductNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lang = searchParams.get("lang");

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href.split("?")[0]);
  };

  return (
    <nav
      className={cn(
        "sticky top-0 z-40 border-b border-ink-800 bg-ink-950/80 backdrop-blur-md",
        className
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
        <Link
          href={lang ? `/?lang=${lang}` : "/"}
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink-50"
        >
          <Activity className="h-4 w-4 text-signal-400" />
          VerseSignal
        </Link>

        <ul className="hidden items-center gap-1 sm:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const href = lang ? `${item.href}?lang=${lang}` : item.href;
            return (
              <li key={item.href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-signal-500/15 text-signal-100"
                      : "text-ink-400 hover:bg-ink-900/60 hover:text-ink-200"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>

      <Link
        href={lang ? `/data-health?lang=${lang}` : "/data-health"}
        className="rounded-full border border-ink-800 bg-ink-900/60 px-3 py-1.5 text-xs text-ink-400 transition hover:text-ink-200"
      >
        Data Health
      </Link>
    </div>

    <div className="flex overflow-x-auto border-t border-ink-800/50 px-4 py-2 sm:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const href = lang ? `${item.href}?lang=${lang}` : item.href;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "bg-signal-500/15 text-signal-100"
                  : "text-ink-400 hover:bg-ink-900/60 hover:text-ink-200"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
