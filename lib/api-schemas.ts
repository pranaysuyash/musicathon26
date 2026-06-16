import { z } from "zod";

const SongId = z.string().regex(/^versesignal:\d{4}:\d{2}:.+/);
const EventId = z.string().regex(/^versesignal:ev:.+/);
const Year = z.coerce.number().int().min(1950).max(2100);

export const YearQuery = z.object({ year: Year, region: z.string().default("US") });
export const EventQuery = z.object({ id: EventId });
export const SongQuery = z.object({ id: SongId });
export const GraphQuery = z.object({ nodeId: z.string(), hops: z.coerce.number().int().min(1).max(4).default(2) });
export const GraphPathQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  edgeTypes: z.array(z.string()).optional(),
  maxHops: z.coerce.number().int().min(1).max(8).default(6),
});

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

export function parse<T>(schema: z.ZodType<T>, input: unknown): Parsed<T> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
