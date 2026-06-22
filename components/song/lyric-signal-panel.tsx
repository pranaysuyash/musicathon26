import Link from "next/link";
import { SectionTitle } from "@/components/ui/primitives";

export function LyricSignalPanel({
  lines,
  entitiesByLine,
  annotateWithEntities,
}: {
  lines: { line_index: number; text: string; section: string | null; has_named_entity: number }[];
  entitiesByLine: Map<number, { canonical_name: string; entity_type: string; surface_form: string | null; line_index: number | null }[]>;
  annotateWithEntities: (
    text: string,
    entities: { canonical_name: string; entity_type: string; surface_form: string | null; line_index: number | null }[]
  ) => { text: string; entity: { canonical_name: string; entity_type: string; surface_form: string | null; line_index: number | null } | null }[];
}) {
  return (
    <div className="rounded-[2rem] border border-ink-800 bg-ink-950/60 p-5 lg:p-6">
      <SectionTitle subtitle="Read the lyric surface as a heat map, not a wall of lines.">Lyric scan</SectionTitle>
      <div className="mt-4 max-h-[560px] overflow-y-auto rounded-[1.4rem] border border-ink-800 bg-ink-900/40 p-4 scrollbar-thin">
        {lines.length === 0 ? (
          <p className="text-sm text-ink-500">No lyrics ingested yet.</p>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-200">
            {lines.map((l) => {
              const entOnLine = entitiesByLine.get(l.line_index) ?? [];
              const segments = annotateWithEntities(l.text, entOnLine);
              return (
                <span key={l.line_index} className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-900/50">
                  <span className="mr-3 inline-block w-8 text-right text-[10px] tabular-nums text-ink-500">{l.line_index}</span>
                  {segments.map((seg, i) =>
                    seg.entity ? (
                      <span
                        key={i}
                        className="cursor-help rounded border-b border-dotted border-echo-400/40 bg-echo-500/20 px-0.5 text-echo-200"
                        title={`${seg.entity.canonical_name} (${seg.entity.entity_type})`}
                      >
                        {seg.text}
                      </span>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    )
                  )}
                </span>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}
