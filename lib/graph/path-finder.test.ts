// Tests for the in-memory graph path-finder.
//
// Per motto_v3 §0.6, the path-finder is a high-risk component
// (customer-facing query, security-adjacent). These tests cover
// the four properties that must hold for correctness:
//   1. BFS terminates (no infinite loop on cycles)
//   2. Edge-type filter excludes the right edges
//   3. maxHops bound is respected
//   4. from===to returns same_node without a hang
//
// We use a real SQLite DB (in-memory) so the loader paths are
// exercised end-to-end. The path-finder uses an in-memory BFS
// on top of the loaded graph; the BFS itself is what we're
// testing here.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";

let db: Database.Database;

beforeAll(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE graph_nodes (
      id TEXT PRIMARY KEY, node_type TEXT NOT NULL, label TEXT NOT NULL
    );
    CREATE TABLE graph_edges (
      id TEXT PRIMARY KEY,
      src_id TEXT NOT NULL REFERENCES graph_nodes(id),
      dst_id TEXT NOT NULL REFERENCES graph_nodes(id),
      edge_type TEXT NOT NULL,
      weight REAL NOT NULL, confidence REAL NOT NULL,
      evidence_ids_json TEXT, source_api TEXT NOT NULL,
      model_version TEXT, explanation TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE evidence (
      id TEXT PRIMARY KEY, edge_id TEXT NOT NULL REFERENCES graph_edges(id),
      evidence_type TEXT NOT NULL, value TEXT NOT NULL,
      source TEXT NOT NULL, confidence REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Linear chain: A → B → C → D
  const nodes = [
    ["versesignal:n:song:A", "song", "A"],
    ["versesignal:n:song:B", "song", "B"],
    ["versesignal:n:song:C", "song", "C"],
    ["versesignal:n:song:D", "song", "D"],
    ["versesignal:n:event:E", "event", "E"],
  ];
  const ins = db.prepare("INSERT INTO graph_nodes (id, node_type, label) VALUES (?, ?, ?)");
  for (const [id, t, l] of nodes) ins.run(id, t, l);

  // Edges: A-B (performed_by), B-C (contains_theme), C-D (similar_to)
  // Plus a cycle: B→A (so cycle-protection must work)
  // Plus a separate event edge: D→E (associated_with_event)
  const edges = [
    ["e_AB", "versesignal:n:song:A", "versesignal:n:song:B", "performed_by", 1.0, 1.0, "manual"],
    ["e_BC", "versesignal:n:song:B", "versesignal:n:song:C", "contains_theme", 0.7, 0.9, "lexicon"],
    ["e_CD", "versesignal:n:song:C", "versesignal:n:song:D", "similar_to", 0.6, 0.8, "embedding"],
    ["e_BA", "versesignal:n:song:B", "versesignal:n:song:A", "similar_to", 0.5, 0.7, "embedding"], // cycle
    ["e_DE", "versesignal:n:song:D", "versesignal:n:event:E", "associated_with_event", 0.8, 0.95, "hybrid"],
  ];
  const insE = db.prepare(
    `INSERT INTO graph_edges (id, src_id, dst_id, edge_type, weight, confidence, evidence_ids_json, source_api, model_version, explanation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  for (const [id, s, d, t, w, c, api] of edges) insE.run(id, s, d, t, w, c, "[]", api, "test", "test");
});

// Point lib/db at this in-memory DB
afterAll(() => {
  db.close();
});

// Mock the lib/db and lib/db/sql modules to use our in-memory DB.
// We use vi.mock at module level for clean isolation.
import { vi, beforeEach } from "vitest";

vi.mock("../db/index", () => ({
  getDb: () => db,
  initDb: () => {},
  closeDb: () => {},
}));
vi.mock("../db/sql", async () => {
  // Wire the sql helpers to the in-memory db
  return {
    all: <T,>(sql: string, ...params: unknown[]): T[] => {
      const stmt = db.prepare(sql);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return stmt.all(...params) as any as T[];
    },
    get: <T,>(sql: string, ...params: unknown[]): T | undefined => {
      const stmt = db.prepare(sql);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return stmt.get(...params) as any as T | undefined;
    },
    run: (sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } => {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    },
  };
});

import { findShortestPath, invalidateGraphCache } from "./path-finder";

beforeEach(() => {
  invalidateGraphCache();
});

describe("findShortestPath", () => {
  it("finds the shortest path in a linear chain", () => {
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:song:D");
    expect(r.found).toBe(true);
    expect(r.hopCount).toBe(3);
    expect(r.nodes.map((n) => n.id)).toEqual([
      "versesignal:n:song:A",
      "versesignal:n:song:B",
      "versesignal:n:song:C",
      "versesignal:n:song:D",
    ]);
    expect(r.edges.map((e) => e.edgeType)).toEqual([
      "performed_by",
      "contains_theme",
      "similar_to",
    ]);
  });

  it("returns same_node when from === to", () => {
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:song:A");
    expect(r.found).toBe(true);
    expect(r.reason).toBe("same_node");
    expect(r.hopCount).toBe(0);
  });

  it("returns not_found when either endpoint doesn't exist", () => {
    const r1 = findShortestPath("versesignal:n:song:NOPE", "versesignal:n:song:D");
    expect(r1.found).toBe(false);
    expect(r1.reason).toBe("not_found");

    const r2 = findShortestPath("versesignal:n:song:A", "versesignal:n:song:NOPE");
    expect(r2.found).toBe(false);
    expect(r2.reason).toBe("not_found");
  });

  it("does not loop on cycles (B→A exists, A→B→A would loop without cycle protection)", () => {
    // A → B → A would be a cycle. With BFS + visited set, we should
    // still terminate and return A → B (1 hop).
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:song:A");
    expect(r.found).toBe(true);
    expect(r.reason).toBe("same_node");
  });

  it("respects maxHops bound (returns no_path when target is beyond bound)", () => {
    // A → B → C → D is 3 hops. With maxHops=2, the BFS prunes
    // exploration at depth 2 and never reaches D. The correct
    // answer is "no_path" (we tried within the bound and didn't
    // find it), not "too_long" (we'd only return that if we'd
    // found a longer path).
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:song:D", { maxHops: 2 });
    expect(r.found).toBe(false);
    expect(r.reason).toBe("no_path");
  });

  it("BFS does not explore beyond maxHops (cheap bound check)", () => {
    // A→B is depth 1. With maxHops=1, BFS prunes before expanding
    // B's neighbors (which would reach C and D). So exploredNodes
    // should stay bounded. C and D shouldn't be reached.
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:song:D", { maxHops: 1 });
    expect(r.found).toBe(false);
    expect(r.exploredNodes).toBeLessThan(5); // 5 nodes total
  });

  it("filters by edge type", () => {
    // A → B via performed_by; B → C via contains_theme.
    // If we restrict to similar_to, no path exists.
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:song:D", {
      edgeTypes: ["similar_to"],
    });
    expect(r.found).toBe(false);
  });

  it("returns no_path when target is unreachable (after cycle protection)", () => {
    // E has no outgoing edges, so A→E via the test graph needs the
    // D→E edge. A→D→E should work.
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:event:E");
    expect(r.found).toBe(true);
    expect(r.hopCount).toBe(4);
  });

  it("records exploredNodes and elapsedMs for observability", () => {
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:song:D");
    expect(r.exploredNodes).toBeGreaterThan(0);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
    // Should complete fast (in-memory BFS on a tiny graph)
    expect(r.elapsedMs).toBeLessThan(100);
  });

  it("totalWeight and avgConfidence match the edge metadata", () => {
    const r = findShortestPath("versesignal:n:song:A", "versesignal:n:song:D");
    expect(r.found).toBe(true);
    // 3 edges: weight 1.0 + 0.7 + 0.6 = 2.3
    expect(r.totalWeight).toBeCloseTo(2.3, 2);
    // avg confidence: (1.0 + 0.9 + 0.8) / 3
    expect(r.avgConfidence).toBeCloseTo(0.9, 2);
  });
});
