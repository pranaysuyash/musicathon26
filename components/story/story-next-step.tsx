// "Next step" footer for any page in the guided journey.
// Reads the URL pathname and shows the next story URL.
//
// Per external review (P1), the product should choreograph
// the strongest paths so judges don't have to discover them.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STORY_JOURNEY } from "./story-journey";

export function StoryNextStep() {
  const pathname = usePathname();
  // Find which story step the current page is on
  const idx = STORY_JOURNEY.findIndex((s) => s.href.startsWith(pathname));
  // If pathname matches an event/song URL but not exactly, try a
  // softer match (e.g., /event/.../... matches /event/...)
  let stepIdx = idx;
  if (stepIdx < 0) {
    if (pathname.startsWith("/lens/")) stepIdx = 0;
    else if (pathname.startsWith("/event/")) stepIdx = 1;
    else if (pathname.startsWith("/graph")) stepIdx = 2;
    else if (pathname.startsWith("/song/")) stepIdx = 3;
  }
  if (stepIdx < 0) return null;
  const next = STORY_JOURNEY[stepIdx + 1];
  if (!next) return null; // last step
  return (
    <Link
      href={next.href}
      className="mt-12 block rounded-xl border border-signal-700/40 bg-signal-900/10 p-4 transition hover:border-signal-500/60"
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-signal-300">
        Next in the story →
      </div>
      <h3 className="mt-1 text-lg font-semibold text-ink-100">{next.title}</h3>
      <p className="mt-1 text-sm text-ink-300">{next.description}</p>
      <p className="mt-2 text-xs text-ink-500">{next.whyItMatters}</p>
    </Link>
  );
}
