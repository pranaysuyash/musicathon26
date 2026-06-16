// Type-safe helpers around better-sqlite3 v11's prepare generics.
// v11 changed the signature: prepare<BindParameters, ResultRow>(sql)
// where BindParameters extends unknown[]. Passing tuples directly is awkward
// for variable-arity queries, so we route everything through these wrappers.

import { getDb } from "./index";

export function all<T>(sql: string, ...params: unknown[]): T[] {
  const stmt = getDb().prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (stmt.all(...params) as any) as T[];
}

export function get<T>(sql: string, ...params: unknown[]): T | undefined {
  const stmt = getDb().prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (stmt.get(...params) as any) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}
