#!/usr/bin/env node
// Clean up stale ElevenLabs cache artifacts for year insights:
// - orphaned manifest (.json) without audio (.mp3)
// - orphaned audio (.mp3) without manifest (.json)

import { readdir, unlink } from "node:fs/promises";
import { join, extname } from "node:path";

const INSIGHT_CACHE_DIR = join(process.cwd(), "data", "exports", "insights");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const entries = await readdir(INSIGHT_CACHE_DIR, { withFileTypes: true });
  const mp3 = new Set();
  const json = new Set();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.startsWith("insight-")) continue;

    const ext = extname(name);
    const base = name.slice(0, name.length - ext.length);
    if (ext === ".mp3") mp3.add(base);
    else if (ext === ".json") json.add(base);
  }

  const targets = new Set([...mp3, ...json]);
  let removed = 0;

  for (const base of targets) {
    const hasMp3 = mp3.has(base);
    const hasJson = json.has(base);

    if (hasMp3 && hasJson) continue;

    const toDelete = hasMp3 ? `${base}.mp3` : `${base}.json`;
    const path = join(INSIGHT_CACHE_DIR, toDelete);
    if (DRY_RUN) {
      console.log(`[dry-run] would remove ${toDelete}`);
    } else {
      await unlink(path);
      console.log(`removed ${toDelete}`);
    }
    removed += 1;
  }

  if (DRY_RUN) {
    console.log(`dry-run complete — would remove ${removed} orphaned file(s).`);
  } else {
    console.log(`cleanup complete — removed ${removed} orphaned file(s).`);
  }
}

main().catch((err) => {
  console.error("insight cache cleanup failed:", err);
  process.exitCode = 1;
});
