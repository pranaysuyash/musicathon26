import type { ReactNode } from "react";
import { getEvidenceSourceMeta } from "./source-registry";

export interface EvidencePreviewItem {
  id: string;
  title: string;
  text: string;
  source?: string;
  confidence?: number;
  matchedTerms?: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(value: string, matchedTerms: string[] = []): ReactNode {
  const terms = Array.from(new Set(matchedTerms.map((t) => t.trim()).filter(Boolean)));
  if (terms.length === 0) return <>{value}</>;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const chunks = value.split(pattern);
  return (
    <>
      {chunks.map((chunk, index) => {
        const isMatch = terms.some(
          (t) => chunk.toLowerCase() === t.toLowerCase()
        );
        return isMatch ? (
          <mark key={`${chunk}-${index}`} className="rounded bg-signal-500/30 px-0.5">
            {chunk}
          </mark>
        ) : (
          <span key={`${chunk}-${index}`}>{chunk}</span>
        );
      })}
    </>
  );
}

export function EvidencePreview({
  items,
  title = "Evidence preview",
  maxItems = 3,
}: {
  items: EvidencePreviewItem[];
  title?: string;
  maxItems?: number;
}) {
  if (items.length === 0) {
    return (
      <section>
        <p className="text-xs text-ink-500">{title}: no rows yet</p>
      </section>
    );
  }
  const shown = items.slice(0, maxItems);
  const hidden = items.slice(maxItems);
  return (
    <section>
      <h5 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
        {title} ({items.length})
      </h5>
      <ul className="mt-2 space-y-1.5">
        {shown.map((item) => {
          const meta = item.source ? getEvidenceSourceMeta(item.source) : null;
          return (
            <li key={item.id} className="rounded-lg border border-ink-800 bg-ink-900/55 p-2 text-xs leading-relaxed">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-ink-400">
                <span>{item.title}</span>
                {meta ? <span className="text-ink-500">{meta.name}</span> : null}
                {typeof item.confidence === "number" ? (
                  <span className="ml-auto text-ink-500">{(item.confidence * 100).toFixed(0)}%</span>
                ) : null}
              </div>
              <p className="rounded border-l-2 border-signal-500/50 bg-ink-950/50 px-2 py-1.5 italic text-ink-200">
                {renderHighlightedText(item.text, item.matchedTerms)}
              </p>
            </li>
          );
        })}
      </ul>
      {hidden.length > 0 ? (
        <details className="mt-2 text-xs text-ink-500">
          <summary className="cursor-pointer">Show {hidden.length} more rows</summary>
          <ul className="mt-2 space-y-1.5">
            {hidden.map((item) => {
              const meta = item.source ? getEvidenceSourceMeta(item.source) : null;
              return (
                <li key={item.id} className="rounded border border-ink-800 bg-ink-900/55 p-2">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink-400">
                    <span>{item.title}</span>
                    {meta ? <span className="text-ink-500">{meta.name}</span> : null}
                    {typeof item.confidence === "number" ? (
                      <span className="ml-auto text-ink-500">{(item.confidence * 100).toFixed(0)}%</span>
                    ) : null}
                  </div>
                  <p className="text-xs italic text-ink-200">
                    {renderHighlightedText(item.text, item.matchedTerms)}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
